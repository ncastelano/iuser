// GET /api/chat/media?message=<id> — link temporário (5 min) de uma FOTO normal de conversa.
// Quem lê é quem participa da conversa (a própria leitura da mensagem, como a pessoa, já confere). A foto de visualização
// única NÃO sai por aqui: é só por POST /api/chat/view-once, que marca a visualização.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { readR2Config, isSafeR2Key, r2PresignGet } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    const id = new URL(req.url).searchParams.get('message') || ''
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 })
    // a RLS de direct_messages só devolve a linha a quem participa da conversa
    const { data: m } = await supabase.from('direct_messages').select('id, kind, media_key, view_once').eq('id', id).maybeSingle()
    if (!m || !m.media_key || !['photo', 'video', 'audio'].includes(m.kind) || m.view_once) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const cfg = readR2Config(process.env, 'chat')
    if (!cfg || !isSafeR2Key(m.media_key)) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    return NextResponse.json({ url: r2PresignGet(cfg, m.media_key, { expiresSec: 300 }) }, { headers: { 'Cache-Control': 'no-store' } })
}
