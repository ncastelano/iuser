// app/api/admin/free-trial/settings/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Liga/desliga o brinde do Pré-pago e define quantos dias ele dura (Admin → Brinde).
// Só vale pra quem resgatar daqui pra frente; quem já resgatou mantém a data que recebeu.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const enabled = !!body.enabled
    const days = Math.round(Number(body.durationDays))
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
        return NextResponse.json({ error: 'Duração inválida (de 1 a 3650 dias)' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
        .from('free_trial_settings')
        .upsert({ id: 1, enabled, duration_days: days, updated_at: new Date().toISOString() }, { onConflict: 'id' })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
