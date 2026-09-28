// app/api/admin/expenses/asaas-overview/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { getBalance, listPayments, listTransfers } from '@/lib/asaas'

// Mapeamento financeiro do Asaas pro painel Financeiro > Asaas: o que está
// na conta Asaas de verdade (externo, via API deles — saldo, cobranças e
// transferências reais, mesmo as feitas direto no dashboard deles), o que
// está no nosso banco (assinaturas + pós-pago) e o que devemos/nos devem
// (carteira + dívida de pós-pago). Os totais agregados por usuário vêm de
// get_asaas_financial_overview() (migration 20261012000000); a atividade
// e os totais de recebido/taxa vêm direto da API da Asaas, porque uma
// cobrança criada manualmente lá (fora do fluxo de compra do app) nunca
// aparece em subscription_payments.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin.rpc('get_asaas_financial_overview')
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Saldo da conta Asaas é best-effort: se a chave não estiver configurada
    // ou a chamada falhar, o resto do painel (tudo que vem do nosso banco)
    // continua funcionando normalmente.
    let asaasBalance: number | null = null
    let asaasBalanceError: string | null = null
    try {
        const balance = await getBalance()
        asaasBalance = balance.balance
    } catch (err: any) {
        asaasBalanceError = err.message || 'Erro ao consultar saldo na Asaas'
    }

    const isSandbox = (process.env.ASAAS_API_BASE_URL || 'https://sandbox.asaas.com/api/v3').includes('sandbox')

    // Linha "Asaas" de service_expenses (taxa por transação, notas etc) —
    // mesmo padrão do card do Supabase: custo e mapeamento de uso juntos,
    // num card só, em vez de espalhado pela lista genérica de outros serviços.
    const { data: expenseRow } = await supabaseAdmin
        .from('service_expenses')
        .select('*')
        .eq('service_name', 'Asaas')
        .maybeSingle()

    // Atividade e totais de verdade direto da Asaas — não só o que o nosso
    // banco registrou. Uma cobrança criada manualmente no dashboard deles
    // (fora do fluxo de compra do app, sem subscriptions.id correspondente)
    // nunca aparece em subscription_payments, então olhar só o nosso banco
    // sub-representa o que de fato aconteceu na conta. netValue já vem sem
    // a taxa da Asaas — é o que efetivamente ficou pra plataforma.
    let payments: Awaited<ReturnType<typeof listPayments>> = []
    let transfers: Awaited<ReturnType<typeof listTransfers>> = []
    let asaasActivityError: string | null = null
    try {
        ;[payments, transfers] = await Promise.all([listPayments(20), listTransfers(20)])
    } catch (err: any) {
        asaasActivityError = err.message || 'Erro ao consultar atividade na Asaas'
    }

    const receivedPayments = payments.filter((p) => p.status === 'RECEIVED' || p.status === 'CONFIRMED')
    const receivedGrossTotal = receivedPayments.reduce((sum, p) => sum + Number(p.value), 0)
    const receivedNetTotal = receivedPayments.reduce((sum, p) => sum + Number(p.netValue), 0)
    const asaasFeesTotal = receivedGrossTotal - receivedNetTotal
    const pendingPaymentsTotal = payments.filter((p) => p.status === 'PENDING').reduce((sum, p) => sum + Number(p.value), 0)
    const overduePaymentsTotal = payments.filter((p) => p.status === 'OVERDUE').reduce((sum, p) => sum + Number(p.value), 0)

    // Pra dizer se cada cobrança/transferência da Asaas tem um registro
    // correspondente no nosso banco (comprou pelo app) ou foi feita direto
    // no dashboard deles (ex: assinatura de teste avulsa).
    const subExternalRefs = payments.map((p) => p.externalReference).filter(Boolean) as string[]
    const paymentIds = payments.map((p) => p.id)
    const transferIds = transfers.map((t) => t.id)
    const [subsLookup, postpaidLookup, withdrawalsLookup] = await Promise.all([
        subExternalRefs.length
            ? supabaseAdmin.from('subscriptions').select('id, profiles:user_id(name), plans(name)').in('id', subExternalRefs)
            : Promise.resolve({ data: [] as any[] }),
        paymentIds.length
            ? supabaseAdmin.from('driver_postpaid_charges').select('asaas_payment_id, profiles:driver_id(name)').in('asaas_payment_id', paymentIds)
            : Promise.resolve({ data: [] as any[] }),
        transferIds.length
            ? supabaseAdmin.from('withdrawal_requests').select('asaas_transfer_id, profiles:user_id(name)').in('asaas_transfer_id', transferIds)
            : Promise.resolve({ data: [] as any[] }),
    ])
    const subMap = new Map((subsLookup.data || []).map((s: any) => [s.id, s]))
    const postpaidMap = new Map((postpaidLookup.data || []).map((p: any) => [p.asaas_payment_id, p]))
    const withdrawalMap = new Map((withdrawalsLookup.data || []).map((w: any) => [w.asaas_transfer_id, w]))

    const activity = [
        ...payments.map((p) => {
            const sub = p.externalReference ? subMap.get(p.externalReference) : null
            const postpaid = postpaidMap.get(p.id)
            return {
                kind: 'payment' as const,
                status: p.status,
                date: p.dateCreated,
                value: Number(p.value),
                netValue: Number(p.netValue),
                personName: (sub as any)?.profiles?.name || (postpaid as any)?.profiles?.name || null,
                detail: (sub as any)?.plans?.name || p.description || null,
                linked: !!(sub || postpaid),
                asaasId: p.id,
            }
        }),
        ...transfers.map((t) => {
            const wd = withdrawalMap.get(t.id)
            return {
                kind: 'transfer' as const,
                status: t.status,
                date: t.dateCreated,
                value: Number(t.value),
                netValue: Number(t.netValue),
                personName: (wd as any)?.profiles?.name || null,
                detail: t.description,
                linked: !!wd,
                asaasId: t.id,
            }
        }),
    ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20)

    return NextResponse.json({
        ...data,
        asaasBalance,
        asaasBalanceError,
        isSandbox,
        expense: expenseRow || null,
        receivedGrossTotal,
        receivedNetTotal,
        asaasFeesTotal,
        pendingPaymentsTotal,
        overduePaymentsTotal,
        asaasActivityError,
        activity,
    })
}
