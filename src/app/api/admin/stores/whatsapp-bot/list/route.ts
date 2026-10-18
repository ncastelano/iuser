// app/api/admin/stores/whatsapp-bot/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Lista (ou busca) as lojas do bot de WhatsApp. As colunas whatsapp_bot_* são privadas (o navegador não
// as lê direto): o admin geral as recebe só por aqui, e só os campos que a tela usa.
const COLS = 'id, name, storeSlug, whatsapp_bot_opt_in, whatsapp_bot_phone_number_id, whatsapp_bot_display_number, whatsapp_bot_requested_number, whatsapp_bot_status'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    // Texto vai dentro de um filtro .or(): só letras/números/espaço/_ . -
    const q = String(body?.query || '').replace(/[^\p{L}\p{N}\s_.-]/gu, '').trim()

    const base = supabaseAdmin.from('stores').select(COLS)
    const { data, error } = q.length >= 2
        ? await base.or(`name.ilike.%${q}%,storeSlug.ilike.%${q}%`).limit(10)
        : await base.eq('whatsapp_bot_opt_in', true).order('whatsapp_bot_phone_number_id', { ascending: true, nullsFirst: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ stores: data || [] })
}
