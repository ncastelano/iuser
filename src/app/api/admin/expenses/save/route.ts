// app/api/admin/expenses/save/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const BILLING_CYCLES = new Set(['monthly', 'yearly', 'usage', 'one_time'])

// Cria ou atualiza um serviço pago rastreado na aba Financeiro. Upsert
// simples: com "id" atualiza, sem "id" cria.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const {
        id,
        serviceName,
        category,
        planName,
        monthlyCost,
        billingCycle,
        nextDueDate,
        billingUrl,
        notes,
        isActive,
    } = body

    if (!serviceName || !String(serviceName).trim()) {
        return NextResponse.json({ error: 'Nome do serviço é obrigatório' }, { status: 400 })
    }
    if (billingCycle && !BILLING_CYCLES.has(billingCycle)) {
        return NextResponse.json({ error: 'Ciclo de cobrança inválido' }, { status: 400 })
    }

    const row = {
        service_name: String(serviceName).trim(),
        category: category ? String(category).trim() : null,
        plan_name: planName ? String(planName).trim() : null,
        monthly_cost: Number(monthlyCost) || 0,
        billing_cycle: billingCycle || 'monthly',
        next_due_date: nextDueDate || null,
        billing_url: billingUrl ? String(billingUrl).trim() : null,
        notes: notes ? String(notes).trim() : null,
        is_active: isActive !== false,
        updated_at: new Date().toISOString(),
    }

    const { error } = id
        ? await supabaseAdmin.from('service_expenses').update(row).eq('id', id)
        : await supabaseAdmin.from('service_expenses').insert(row)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
