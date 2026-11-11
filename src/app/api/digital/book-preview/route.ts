// POST /api/digital/book-preview  { itemId, pages } — a DONA de um livro em PDF gera a PRÉVIA: o servidor baixa o PDF (bucket privado do
// Supabase ou R2 privado), copia só as primeiras N páginas (pdf-lib) e guarda esse PDF à parte como um item "teaser" do produto.
// Assim quem não comprou abre só a prévia — o livro inteiro nunca sai do bucket privado para essa pessoa.
// Regras: só a dona do item (lido como ela mesma, pelo RLS), só PDF, de 1 a 50 páginas e, em livro PAGO, menos páginas que o livro todo.
// A prévia anterior do mesmo produto é apagada (só existe uma).
import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { r2ConfigForBucket, r2PresignGet, isSafeR2Key } from '@/lib/r2'
import { validPreviewPages } from '@/modules/digital/domain'

export const runtime = 'nodejs'
export const maxDuration = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SOURCE_BYTES = 120 * 1024 * 1024

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}))
    const itemId = String(body?.itemId || '')
    const pages = validPreviewPages(body?.pages)
    if (!UUID.test(itemId) || !pages) return NextResponse.json({ error: 'Escolha de 1 a 50 páginas.' }, { status: 400 })

    const supabase = await createServerSupabase()
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 })
    // lido COMO a pessoa: se não é dela, o RLS nem devolve
    const { data: it } = await supabase.from('digital_contents').select('id, product_id, owner_id, kind, storage_path, bucket, mime_type, file_name, is_teaser').eq('id', itemId).maybeSingle()
    if (!it || it.owner_id !== u.user.id) return NextResponse.json({ error: 'Só a dona do livro gera a prévia.' }, { status: 403 })
    const isPdf = it.mime_type === 'application/pdf' || /\.pdf$/i.test(it.file_name || it.storage_path || '')
    if (it.kind !== 'document' || it.is_teaser || !it.storage_path || !isPdf) return NextResponse.json({ error: 'A prévia é feita a partir de um arquivo PDF do livro.' }, { status: 400 })

    // baixa o livro (servidor)
    let bytes: ArrayBuffer
    try {
        if (it.bucket === 'iuser-digital') {
            const cfg = r2ConfigForBucket('iuser-digital')
            if (!cfg || !isSafeR2Key(it.storage_path)) return NextResponse.json({ error: 'O armazenamento do livro está indisponível agora.' }, { status: 503 })
            const r = await fetch(r2PresignGet(cfg, it.storage_path, { expiresSec: 300 }))
            if (!r.ok) throw new Error('r2')
            bytes = await r.arrayBuffer()
        } else {
            const { data, error } = await supabaseAdmin.storage.from(it.bucket || 'digital-files').download(it.storage_path)
            if (error || !data) throw new Error('storage')
            bytes = await data.arrayBuffer()
        }
    } catch { return NextResponse.json({ error: 'Não foi possível ler o PDF do livro.' }, { status: 502 }) }
    if (bytes.byteLength > MAX_SOURCE_BYTES) return NextResponse.json({ error: 'O PDF é grande demais para gerar a prévia aqui.' }, { status: 413 })

    // corta as primeiras páginas
    let out: Uint8Array, total: number, n: number
    try {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: false })
        total = src.getPageCount()
        const { data: prod } = await supabaseAdmin.from('products').select('price').eq('id', it.product_id).maybeSingle()
        const paid = Number(prod?.price || 0) > 0
        if (paid && pages >= total) return NextResponse.json({ error: `O livro tem ${total} páginas: a prévia precisa ter menos que isso (até ${Math.max(1, total - 1)}).` }, { status: 400 })
        n = Math.min(pages, total)
        const dst = await PDFDocument.create()
        const copied = await dst.copyPages(src, Array.from({ length: n }, (_, i) => i))
        copied.forEach((p) => dst.addPage(p))
        dst.setTitle('Prévia')
        out = await dst.save()
    } catch { return NextResponse.json({ error: 'Este PDF não pôde ser aberto (protegido por senha ou danificado).' }, { status: 422 }) }

    // guarda a prévia (bucket privado; abre só por link assinado) e troca a anterior
    const path = `${u.user.id}/${it.product_id}/${Date.now()}-previa.pdf`
    const up = await supabaseAdmin.storage.from('digital-files').upload(path, out, { contentType: 'application/pdf', upsert: false })
    if (up.error) return NextResponse.json({ error: 'Não foi possível guardar a prévia.' }, { status: 500 })
    const { data: old } = await supabaseAdmin.from('digital_contents').select('id, storage_path, bucket').eq('product_id', it.product_id).eq('is_teaser', true).eq('kind', 'document')
    const { error: insErr } = await supabaseAdmin.from('digital_contents').insert({
        product_id: it.product_id, owner_id: u.user.id, title: `Prévia · ${n} ${n === 1 ? 'página' : 'páginas'}`, kind: 'document',
        storage_path: path, bucket: 'digital-files', mime_type: 'application/pdf', size_bytes: out.byteLength, file_name: 'previa.pdf',
        is_teaser: true, preview_pages: n, position: 0,
    })
    if (insErr) { await supabaseAdmin.storage.from('digital-files').remove([path]); return NextResponse.json({ error: 'Não foi possível registrar a prévia.' }, { status: 500 }) }
    if (old?.length) {
        await supabaseAdmin.from('digital_contents').delete().in('id', old.map((o) => o.id))
        const paths = old.filter((o) => o.storage_path && (o.bucket || 'digital-files') === 'digital-files').map((o) => o.storage_path as string)
        if (paths.length) await supabaseAdmin.storage.from('digital-files').remove(paths)
    }
    return NextResponse.json({ pages: n, total })
}
