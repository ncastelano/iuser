// app/api/admin/plans/update-price/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { updateSubscriptionValue } from '@/lib/asaas'

// Reajusta o preço de um plano (promoção, aumento etc) e propaga pra quem
// já é assinante via Asaas — sem isso, mudar plans.price só valeria pra
// gente nova assinando; quem já paga continuaria travado no valor antigo
// pra sempre (a Asaas não muda cobranças recorrentes sozinha). O crédito de
// comissão não precisa de nenhum ajuste aqui: ele já lê o valor real
// cobrado em cada pagamento (payment.value no webhook), então acompanha
// esse reajuste automaticamente no próximo pagamento de cada um.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { planCode, newPrice } = await req.json()
    const priceNumber = Number(newPrice)
    if (!planCode || !priceNumber || priceNumber <= 0) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: plan, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id, price')
        .eq('code', planCode)
        .maybeSingle()

    if (planError || !plan) {
        return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    }

    const { error: updateError } = await supabaseAdmin
        .from('plans')
        .update({ price: priceNumber })
        .eq('id', plan.id)

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Propaga pra toda assinatura Asaas em aberto desse plano — cada uma
    // falhando não deve travar as outras, então segue e conta no final.
    const { data: subscriptions } = await supabaseAdmin
        .from('subscriptions')
        .select('id, asaas_subscription_id')
        .eq('plan_id', plan.id)
        .in('status', ['pending', 'active'])
        .eq('source', 'asaas')
        .not('asaas_subscription_id', 'is', null)

    let updated = 0
    let failed = 0
    for (const sub of subscriptions || []) {
        try {
            await updateSubscriptionValue(sub.asaas_subscription_id as string, priceNumber)
            updated++
        } catch (err: any) {
            failed++
            console.error(`Erro ao atualizar valor da assinatura Asaas ${sub.asaas_subscription_id}:`, err.message)
        }
    }

    return NextResponse.json({ success: true, updated, failed, total: (subscriptions || []).length })
}
