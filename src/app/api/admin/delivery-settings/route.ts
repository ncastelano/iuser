// app/api/admin/delivery-settings/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Regras da oferta de entrega iUser (Admin → Entregas): intervalo entre tentativas, aumento
// (valor ou %), raio inicial e expansão, frete máximo, número máximo de tentativas e taxa da plataforma.
const LIMITS = {
    retry_interval_minutes: [1, 240, true],
    increase_value: [0, 1000, false],
    initial_radius_km: [0.5, 500, false],
    radius_step_km: [0, 500, false],
    max_freight: [1, 10000, false],
    max_rounds: [0, 50, true],
    platform_fee_percent: [0, 100, false],
} as const

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const values: Record<string, number | string> = {}
    for (const [field, [min, max, integer]] of Object.entries(LIMITS)) {
        const n = Number(body[field])
        if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
            return NextResponse.json({ error: `Valor inválido em ${field}` }, { status: 400 })
        }
        values[field] = integer ? n : Math.round(n * 100) / 100
    }
    if (body.increase_kind !== 'fixed' && body.increase_kind !== 'percent') {
        return NextResponse.json({ error: 'Tipo de aumento inválido' }, { status: 400 })
    }
    values.increase_kind = body.increase_kind

    const { error } = await supabaseAdmin
        .from('delivery_dispatch_settings')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
