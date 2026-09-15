// app/api/admin/settings/update/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { priceCents, validityDays, pixKey, pixKeyType, pixReceiverName } = await req.json()
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
        return NextResponse.json({ error: 'Preço inválido' }, { status: 400 })
    }
    if (validityDays !== null && validityDays !== undefined && (!Number.isInteger(validityDays) || validityDays <= 0)) {
        return NextResponse.json({ error: 'Validade inválida' }, { status: 400 })
    }

    // pixKey/pixKeyType/pixReceiverName são opcionais aqui - a chave PIX
    // ativa é gerenciada por /api/admin/pix-keys/*; se não vierem, não mexe
    // no que já estava salvo.
    const update: Record<string, unknown> = {
        price_cents: priceCents,
        validity_days: validityDays || null,
        updated_at: new Date().toISOString(),
    }
    if (pixKey !== undefined) update.pix_key = pixKey || null
    if (pixKeyType !== undefined) update.pix_key_type = pixKeyType || null
    if (pixReceiverName !== undefined) update.pix_receiver_name = pixReceiverName || null

    const { error } = await supabaseAdmin
        .from('store_access_settings')
        .update(update)
        .eq('id', 1)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
