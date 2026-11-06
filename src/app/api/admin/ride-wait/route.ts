// app/api/admin/ride-wait/route.ts
//
// Admin → Tarifas → "Espera na corrida": o valor por minuto, os minutos grátis e o limite de UMA espera. São SEMPRE do iUser (nem a loja nem o motorista mudam).
// Só o administrador geral. A regra mora no banco (admin_set_ride_wait valida, grava e audita); o id do admin vem do login, nunca do corpo.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { waitSettingsProblem } from '@/modules/ridewait/domain'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const v = { ratePerMinute: Number(body?.rate), graceMinutes: Number(body?.grace), maxMinutes: Number(body?.max) }
    const problem = waitSettingsProblem(v)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    const { data, error } = await supabaseAdmin.rpc('admin_set_ride_wait', { p_rate: v.ratePerMinute, p_grace: v.graceMinutes, p_max: v.maxMinutes, p_admin: admin.id })
    if (error) return NextResponse.json({ error: error.code === '22023' ? error.message : 'Não foi possível salvar. Tente de novo.' }, { status: error.code === '22023' ? 400 : 500 })
    return NextResponse.json({ ok: true, settings: data })
}
