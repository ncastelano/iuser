// app/api/admin/subscriptions/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const GRANTED_SOURCES = new Set(['admin_grant', 'leader_grant', 'code'])

// Lista quem comprou (ou ganhou) cada plano — pro admin ver quantos planos
// a própria iuser está vendendo de verdade, não só o que cada usuário vê da
// própria assinatura. Separa concedido de graça (admin_grant/leader_grant/
// code) de pago de verdade (asaas, usando subscription_payments — o
// registro real de dinheiro recebido, não uma estimativa por plan.price)
// pra não misturar os dois totais.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('id, status, source, current_period_end, created_at, plans(code, name, price), profiles!subscriptions_user_id_fkey(name, profileSlug)')
        .order('created_at', { ascending: false })
        .limit(500)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data || []
    const now = new Date()
    const isActiveRow = (row: (typeof rows)[number]) =>
        row.status === 'active' && (!row.current_period_end || new Date(row.current_period_end) > now)

    // Breakdown por plano, mesma forma de antes (usada nos chips por plano) —
    // continua somando qualquer fonte, é só um resumo de contagem/plano.
    const summaryByPlan = new Map<string, { code: string; name: string; activeCount: number; monthlyRevenue: number }>()
    for (const row of rows) {
        const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans
        if (!plan || !isActiveRow(row)) continue
        const entry = summaryByPlan.get(plan.code) || { code: plan.code, name: plan.name, activeCount: 0, monthlyRevenue: 0 }
        entry.activeCount += 1
        entry.monthlyRevenue += Number(plan.price)
        summaryByPlan.set(plan.code, entry)
    }

    // Concedido de graça: contagem por plano, valor nominal só como
    // referência (nunca somado como receita).
    const grantedByPlan = new Map<string, { code: string; name: string; count: number }>()
    let grantedActiveCount = 0
    for (const row of rows) {
        if (!GRANTED_SOURCES.has(row.source) || !isActiveRow(row)) continue
        const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans
        if (!plan) continue
        grantedActiveCount += 1
        const entry = grantedByPlan.get(plan.code) || { code: plan.code, name: plan.name, count: 0 }
        entry.count += 1
        grantedByPlan.set(plan.code, entry)
    }

    // Pago de verdade: subscription_payments é o dinheiro que de fato
    // entrou (não plan.price × ativos) — conta quantas vezes cada
    // assinatura paga já recebeu pagamento, pra separar quem pagou 1x de
    // quem já pagou 2x ou mais.
    const asaasSubscriptionIds = rows.filter((r) => r.source === 'asaas').map((r) => r.id)
    let onceCount = 0
    let multipleCount = 0
    let totalRevenue = 0
    if (asaasSubscriptionIds.length > 0) {
        const { data: payments } = await supabaseAdmin
            .from('subscription_payments')
            .select('subscription_id, amount')
            .in('subscription_id', asaasSubscriptionIds)

        const countBySubscription = new Map<string, number>()
        for (const p of payments || []) {
            countBySubscription.set(p.subscription_id, (countBySubscription.get(p.subscription_id) || 0) + 1)
            totalRevenue += Number(p.amount)
        }
        for (const count of countBySubscription.values()) {
            if (count === 1) onceCount += 1
            else if (count >= 2) multipleCount += 1
        }
    }
    const paidActiveCount = rows.filter((r) => r.source === 'asaas' && isActiveRow(r)).length

    return NextResponse.json({
        subscriptions: rows,
        summary: Array.from(summaryByPlan.values()),
        grantedFree: { activeCount: grantedActiveCount, plans: Array.from(grantedByPlan.values()) },
        paid: { onceCount, multipleCount, activeCount: paidActiveCount, totalRevenue },
        activeSubscriptions: { count: rows.filter(isActiveRow).length },
    })
}
