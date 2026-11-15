// app/api/media/r2/route.ts
//
// GET ?key=<chave> → abre um vídeo do R2 que está num flash VISÍVEL (o bucket é privado). Só entrega o link se existe um flash que a pessoa (ou o visitante) consegue ler com esta chave: a
// leitura passa pela mesma regra de visibilidade do banco (flash oculto por denúncia não abre). Responde com um redirecionamento para um link assinado que vale 1 hora.
// Com o domínio de mídia ligado (NEXT_PUBLIC_R2_PUBLIC_BASE) o app nem passa por aqui: abre direto do domínio, pela CDN da Cloudflare.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { readR2Config, isSafeR2Key, r2PresignGet } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    const key = new URL(req.url).searchParams.get('key')
    const cfg = readR2Config()
    if (!cfg || !isSafeR2Key(key) || !/\.(mp4|webm|mov)$/.test(key)) return new NextResponse(null, { status: 404 })
    const supabase = await createServerSupabase()
    const { data } = await supabase.from('flashes').select('id').eq('media_url', key).limit(1).maybeSingle()
    if (!data) return new NextResponse(null, { status: 404 })
    return NextResponse.redirect(r2PresignGet(cfg, key, { expiresSec: 3600 }), { status: 302, headers: { 'Cache-Control': 'private, max-age=1800' } })
}
