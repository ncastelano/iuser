// GET /api/digital/open?item=<id>[&download=1] — entrega o link de UM item de produto digital.
// Roda como a própria pessoa (cookies de sessão): get_digital_item_access só libera se a aula é grátis ou se ela comprou (pedido pago) ou é a dona do produto.
// O arquivo mora num bucket PRIVADO; aqui o servidor assina um link que vale 1 hora. Link externo (https) volta como está.
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
    const url = new URL(req.url)
    const item = url.searchParams.get('item') || ''
    if (!UUID.test(item)) return NextResponse.json({ error: 'Item inválido' }, { status: 400 })
    const supabase = await createServerSupabase()
    await supabase.auth.getSession()
    const { data, error } = await supabase.rpc('get_digital_item_access', { p_item: item })
    if (error) return NextResponse.json({ error: 'Não foi possível conferir o acesso' }, { status: 400 })
    const a = data as { allowed: boolean; kind: string; title: string; storage_path: string | null; external_url: string | null; mime_type: string | null } | null
    if (!a?.allowed) return NextResponse.json({ error: 'Você ainda não tem acesso a este conteúdo. Ele abre quando a loja confirma o seu pagamento.' }, { status: 403 })
    const headers = { 'Cache-Control': 'no-store' }
    if (a.external_url) return NextResponse.json({ url: a.external_url, kind: a.kind, title: a.title, mime_type: null, external: true }, { headers })
    if (!a.storage_path) return NextResponse.json({ error: 'Item sem arquivo' }, { status: 404 })
    const download = url.searchParams.get('download') === '1'
    const fileName = a.storage_path.split('/').pop()?.replace(/^\d+-/, '') || 'arquivo'
    const { data: signed, error: e2 } = await supabaseAdmin.storage.from('digital-files').createSignedUrl(a.storage_path, 3600, download ? { download: fileName } : undefined)
    if (e2 || !signed?.signedUrl) return NextResponse.json({ error: 'Não foi possível abrir o arquivo' }, { status: 500 })
    return NextResponse.json({ url: signed.signedUrl, kind: a.kind, title: a.title, mime_type: a.mime_type, external: false }, { headers })
}
