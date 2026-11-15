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
    // `fare` muda o VALOR MÍNIMO DE UMA CORRIDA (R$ 8,00 por padrão)
    if (body?.fare !== undefined) {
        const f = Number(body.fare)
        if (!Number.isFinite(f) || f < 0 || f > 200) return NextResponse.json({ error: 'Valor inválido: use de R$ 0 a R$ 200' }, { status: 400 })
        const { data, error } = await supabaseAdmin.rpc('admin_set_ride_min_fare', { p_value: f, p_admin: admin.id })
        if (error) return NextResponse.json({ error: error.code === '22023' ? error.message : 'Não foi possível salvar. Tente de novo.' }, { status: error.code === '22023' ? 400 : 500 })
        return NextResponse.json({ ok: true, value: data })
    }
    // `hourly` muda o ganho mínimo por HORA padrão do iUser (R$ 40 por padrão; cada motorista pode definir o dele)
    if (body?.hourly !== undefined) {
        const h = Number(body.hourly)
        if (!Number.isFinite(h) || h < 1 || h > 1000) return NextResponse.json({ error: 'Valor inválido: use de R$ 1 a R$ 1.000 por hora' }, { status: 400 })
        const { data, error } = await supabaseAdmin.rpc('admin_set_default_min_hourly', { p_value: h, p_admin: admin.id })
        if (error) return NextResponse.json({ error: error.code === '22023' ? error.message : 'Não foi possível salvar. Tente de novo.' }, { status: error.code === '22023' ? 400 : 500 })
        return NextResponse.json({ ok: true, value: data })
    }
    // `cap` muda o TETO do mínimo (padrão R$ 1,00 por minuto); `value` muda o mínimo, que nunca passa do teto. O banco confere de novo.
    const isCap = body?.cap !== undefined
    const n = Number(isCap ? body.cap : body?.value)
    if (!Number.isFinite(n) || n < 0 || n > 20) return NextResponse.json({ error: 'Valor inválido: use de R$ 0 a R$ 20 por minuto' }, { status: 400 })
    const { data, error } = isCap
        ? await supabaseAdmin.rpc('admin_set_ride_minimum_cap', { p_value: n, p_admin: admin.id })
        : await supabaseAdmin.rpc('admin_set_ride_minimum', { p_value: n, p_admin: admin.id })
    if (error) return NextResponse.json({ error: error.code === '22023' ? error.message : 'Não foi possível salvar. Tente de novo.' }, { status: error.code === '22023' ? 400 : 500 })
    return NextResponse.json({ ok: true, value: data })
}
