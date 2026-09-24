// app/api/admin/stores/whatsapp-bot/connect/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Associa o número já conectado no painel da Meta a uma loja (ou
// desconecta, mandando phoneNumberId null) — é o passo manual do admin
// depois que a loja pediu (whatsapp_bot_opt_in) e o número foi verificado
// do lado da Meta.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { storeId, phoneNumberId, displayNumber } = await req.json()
    if (!storeId) {
        return NextResponse.json({ error: 'storeId é obrigatório' }, { status: 400 })
    }

    const cleanPhoneNumberId = typeof phoneNumberId === 'string' ? phoneNumberId.trim() : ''
    const cleanDisplayNumber = typeof displayNumber === 'string' ? displayNumber.trim() : ''

    const { error } = await supabaseAdmin
        .from('stores')
        .update({
            whatsapp_bot_phone_number_id: cleanPhoneNumberId || null,
            whatsapp_bot_display_number: cleanDisplayNumber || null,
            whatsapp_bot_connected_at: cleanPhoneNumberId ? new Date().toISOString() : null,
            whatsapp_bot_status: cleanPhoneNumberId ? 'connected' : 'requested',
        })
        .eq('id', storeId)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
