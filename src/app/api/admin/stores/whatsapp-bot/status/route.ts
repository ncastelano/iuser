// app/api/admin/stores/whatsapp-bot/status/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

const VALID_STATUSES = ['none', 'requested', 'queued', 'connecting', 'connected']

// Só muda o status da fila (ex.: marcar "na fila" ou "conectando" enquanto
// o número de verdade ainda não saiu da Meta) — não mexe em
// phone_number_id/display_number, isso é só a rota de connect.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { storeId, status } = await req.json()
    if (!storeId || !VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
        .from('stores')
        .update({ whatsapp_bot_status: status })
        .eq('id', storeId)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
