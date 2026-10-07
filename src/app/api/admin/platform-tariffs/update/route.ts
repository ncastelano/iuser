// app/api/admin/platform-tariffs/update/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const VEHICLES = ['carro', 'moto', 'bicicleta']
const FIELDS = [
    'base_distance_km', 'base_fee', 'price_per_km',
    'extra_fee_pessoa', 'extra_fee_animal', 'extra_fee_objeto',
    'fee_condominio', 'fee_compras', 'fee_necessidade_especial', 'fee_pet_sem_caixa', 'fee_entrega_interna', 'fee_ar_condicionado',
] as const

// Ajusta a Tarifa da plataforma de um tipo de veículo (Admin → Tarifas). Só o administrador geral.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const vehicleKind = String(body.vehicleKind || '')
    if (!VEHICLES.includes(vehicleKind)) {
        return NextResponse.json({ error: 'Veículo inválido' }, { status: 400 })
    }

    const values: Record<string, number> = {}
    for (const field of FIELDS) {
        const n = Number(body[field])
        if (!Number.isFinite(n) || n < 0 || n > 10000) {
            return NextResponse.json({ error: `Valor inválido em ${field}` }, { status: 400 })
        }
        values[field] = Math.round(n * 100) / 100
    }

    const { error } = await supabaseAdmin
        .from('platform_tariffs')
        .upsert({ vehicle_kind: vehicleKind, ...values, updated_at: new Date().toISOString() }, { onConflict: 'vehicle_kind' })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
