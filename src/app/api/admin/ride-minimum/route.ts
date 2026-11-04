// app/api/admin/ride-minimum/route.ts
//
// Admin → Tarifas → "Valor mínimo por minuto": o piso de TODA corrida de passageiro (minutos de trabalho × este valor). Só o administrador geral.
// A regra mora no banco (admin_set_ride_minimum grava e audita); o id do admin vem do login, nunca do corpo.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const value = Number(body?.value)
    if (!Number.isFinite(value) || value < 0 || value > 20) return NextResponse.json({ error: 'O mínimo por minuto precisa ficar entre R$ 0 e R$ 20' }, { status: 400 })
    const { data, error } = await supabaseAdmin.rpc('admin_set_ride_minimum', { p_value: value, p_admin: admin.id })
    if (error) return NextResponse.json({ error: error.code === '22023' ? error.message : 'Não foi possível salvar. Tente de novo.' }, { status: error.code === '22023' ? 400 : 500 })
    return NextResponse.json({ ok: true, value: data })
}
