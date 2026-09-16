// app/api/admin/plans/set-promo/route.ts
//
// Define (ou limpa, mandando tudo null) uma promoção temporária num plano
// já existente: preço alternativo válido só entre promoStartsAt/promoEndsAt.
// Não mexe em `price` nem propaga pra assinantes existentes — vale só pra
// quem comprar dentro da janela (checado de novo no servidor em
// /api/subscriptions/purchase, nunca confiando no client).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const planId = body.planId
    if (!planId) {
        return NextResponse.json({ error: 'planId é obrigatório' }, { status: 400 })
    }

    // Sem promoPrice = limpar a promoção (volta a valer só o preço normal).
    if (body.clear) {
        const { error } = await supabaseAdmin
            .from('plans')
            .update({ promo_price: null, promo_starts_at: null, promo_ends_at: null })
            .eq('id', planId)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ success: true })
    }

    const promoPrice = Number(body.promoPrice)
    const startsAt = body.promoStartsAt ? new Date(body.promoStartsAt) : null
    const endsAt = body.promoEndsAt ? new Date(body.promoEndsAt) : null

    if (!promoPrice || promoPrice <= 0) {
        return NextResponse.json({ error: 'Preço promocional inválido' }, { status: 400 })
    }
    if (!startsAt || !endsAt || isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
        return NextResponse.json({ error: 'Informe início e fim da promoção' }, { status: 400 })
    }
    if (endsAt <= startsAt) {
        return NextResponse.json({ error: 'O fim da promoção precisa ser depois do início' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
        .from('plans')
        .update({
            promo_price: promoPrice,
            promo_starts_at: startsAt.toISOString(),
            promo_ends_at: endsAt.toISOString(),
        })
        .eq('id', planId)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
}
