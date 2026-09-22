// app/api/admin/service-pricing/update/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Ajusta o preço de um tipo de serviço do pós-pago (base_price e/ou
// postpaid_price). O teto de 3x já é garantido pelo CHECK do banco
// (service_pricing_postpaid_cap) — revalida aqui também só pra devolver uma
// mensagem de erro legível em vez do erro cru do Postgres.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { serviceType, basePrice, postpaidPrice } = await req.json()
    const base = Number(basePrice)
    const postpaid = Number(postpaidPrice)

    if (!serviceType || !base || base <= 0 || !postpaid || postpaid <= 0) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }
    if (postpaid > base * 3) {
        return NextResponse.json({ error: `O preço do pós-pago não pode passar de 3x a referência (máx. R$ ${(base * 3).toFixed(2)})` }, { status: 400 })
    }

    const { error } = await supabaseAdmin
        .from('service_pricing')
        .update({ base_price: base, postpaid_price: postpaid, updated_at: new Date().toISOString() })
        .eq('service_type', serviceType)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
