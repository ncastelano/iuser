// app/api/account/delete/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser, SUPER_ADMIN_EMAIL } from '@/lib/adminAuth'
import { verifyUserPassword } from '@/lib/verifyPassword'
import { cancelSubscription } from '@/lib/asaas'

const sum = (rows: { amount: number | string }[] | null) =>
    (rows || []).reduce((acc, r) => acc + Number(r.amount), 0)

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user?.email) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { password } = await req.json().catch(() => ({}))
    if (!password) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    if (user.email === SUPER_ADMIN_EMAIL) {
        return NextResponse.json({ error: 'A conta de administrador geral não pode ser excluída por aqui.' }, { status: 403 })
    }

    if (!(await verifyUserPassword(user.email, password))) {
        return NextResponse.json({ error: 'Senha incorreta' }, { status: 403 })
    }

    // Trava o que envolve dinheiro ou terceiros: saldo a sacar, dívida de
    // pós-pago e pedidos em andamento nas lojas da pessoa.
    const [{ data: wallet }, { data: debt }, { data: stores }] = await Promise.all([
        supabaseAdmin.from('wallet_transactions').select('amount').eq('user_id', user.id),
        supabaseAdmin.from('driver_postpaid_charges').select('amount').eq('driver_id', user.id),
        supabaseAdmin.from('stores').select('id').eq('owner_id', user.id),
    ])

    if (sum(wallet) > 0) {
        return NextResponse.json({ error: 'Você ainda tem saldo na carteira. Faça o saque antes de excluir a conta.' }, { status: 409 })
    }
    if (sum(debt) > 0) {
        return NextResponse.json({ error: 'Você tem uma dívida de pós-pago em aberto. Quite antes de excluir a conta.' }, { status: 409 })
    }

    const storeIds = (stores || []).map((s) => s.id)
    if (storeIds.length > 0) {
        const { count } = await supabaseAdmin
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .in('store_id', storeIds)
            .in('status', ['pending', 'preparing', 'ready'])
        if ((count || 0) > 0) {
            return NextResponse.json({ error: 'Alguma das suas lojas ainda tem pedidos em andamento. Finalize antes de excluir a conta.' }, { status: 409 })
        }
    }

    // Cancela cobrança recorrente na Asaas pra não seguir cobrando.
    const { data: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('asaas_subscription_id')
        .eq('user_id', user.id)
        .not('asaas_subscription_id', 'is', null)
        .in('status', ['pending', 'active', 'past_due'])
    // Se a Asaas recusar (chave inválida, fora do ar...), a exclusão NÃO fica
    // presa: o cancelamento vai pra fila de pendentes e é refeito depois
    // (/api/admin/asaas/retry-cancellations).
    let pendingCancellations = 0
    for (const sub of subs || []) {
        try {
            await cancelSubscription(sub.asaas_subscription_id as string)
        } catch (err: any) {
            pendingCancellations += 1
            console.error('Erro ao cancelar assinatura Asaas na exclusão de conta:', err?.message)
            await supabaseAdmin
                .from('asaas_pending_cancellations')
                .upsert(
                    { asaas_subscription_id: sub.asaas_subscription_id, user_id: user.id, last_error: String(err?.message || err).slice(0, 300) },
                    { onConflict: 'asaas_subscription_id' }
                )
        }
    }

    const { error: purgeError } = await supabaseAdmin.rpc('admin_delete_profile', { p_user_id: user.id })
    if (purgeError) {
        console.error('Erro ao excluir dados da conta:', purgeError)
        return NextResponse.json({ error: purgeError.message }, { status: 500 })
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (authDeleteError) {
        console.error('Erro ao excluir usuário de auth:', authDeleteError)
        return NextResponse.json({ error: authDeleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, pendingCancellations })
}
