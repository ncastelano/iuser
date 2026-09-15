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

    const { error } = await supabaseAdmin
        .from('store_access_settings')
        .update({
            price_cents: priceCents,
            validity_days: validityDays || null,
            pix_key: pixKey || null,
            pix_key_type: pixKeyType || null,
            pix_receiver_name: pixReceiverName || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', 1)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
