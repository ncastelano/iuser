// app/api/admin/expenses/supabase-metrics/save/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Atualiza um número de uso x cota (o admin olha a página de billing do
// Supabase e atualiza aqui manualmente — não dá pra ler isso via SQL).
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { id, usedValue, includedValue, overagePricePerUnit, notes } = await req.json().catch(() => ({}))
    if (!id) {
        return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
        .from('supabase_usage_metrics')
        .update({
            used_value: Number(usedValue) || 0,
            included_value: Number(includedValue) || 0,
            overage_price_per_unit: Number(overagePricePerUnit) || 0,
            notes: notes ? String(notes).trim() : null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
