// POST /api/chat/view-once  { message } — abre a foto de VISUALIZAÇÃO ÚNICA. Só quem recebeu, e só uma vez:
// o banco marca `viewed_at` na mesma transação em que devolve a chave. Aqui o link vale 5 min: o suficiente para assistir ou ouvir inteiro.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { readR2Config, isSafeR2Key, r2PresignGet } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    let body: { message?: string } = {}
    try { body = await req.json() } catch {}
    const id = String(body.message || '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 })
    // Antes de gastar a visualização: sem o R2 do chat configurado, nada é marcado como visto
    const cfg = readR2Config(process.env, 'chat')
    if (!cfg) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    const { data: key, error } = await supabase.rpc('chat_open_view_once', { p_msg: id })
    if (error) {
        const hint = (error as any).hint || ''
        if (hint === 'view_once_used') return NextResponse.json({ error: 'used' }, { status: 409 })
        if (hint === 'view_once_recipient_only') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (!isSafeR2Key(key)) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    return NextResponse.json({ url: r2PresignGet(cfg, key as string, { expiresSec: 300 }) }, { headers: { 'Cache-Control': 'no-store' } })
}
