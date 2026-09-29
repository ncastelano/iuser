// app/api/admin/expenses/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Serviços pagos (Supabase, Asaas, Mapbox, Firebase, hospedagem etc) que o
// iUser depende pra continuar no ar — aba "Financeiro" do admin. O lucro
// de verdade (bruto recebido, comissão repassada, custo Asaas) vem direto
// da Asaas via /api/admin/expenses/asaas-overview — não duplica esse
// cálculo aqui, pra não ter dois números de lucro diferentes no mesmo admin.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data: expenses, error } = await supabaseAdmin
        .from('service_expenses')
        .select('*')
        .order('is_active', { ascending: false })
        .order('next_due_date', { ascending: true, nullsFirst: false })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ expenses: expenses || [] })
}
