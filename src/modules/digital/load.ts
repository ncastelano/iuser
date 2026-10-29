// src/modules/digital/load.ts — fala com o banco/servidor: vitrine (sumário), biblioteca do comprador, abrir um item e o editor do vendedor.
import { supabase } from '@/lib/supabase/client'
import { kindFromFile, storagePathFor, validateItem, validateTeaser, productKindOf, summaryFromCounts, previewPlaySeconds, type CurriculumItem, type DigitalKind, type DigitalProductKind } from './domain'

export interface LibraryItem { product_id: string; product_name: string; product_slug: string; store_slug: string | null; store_name: string | null; image_url: string | null; purchased_at: string; items_count: number }
export interface OwnItem { id: string; product_id: string; module_title: string | null; title: string; kind: DigitalKind; storage_path: string | null; external_url: string | null; mime_type: string | null; size_bytes: number | null; duration_seconds: number | null; position: number; is_preview: boolean; is_teaser: boolean }
export interface OpenedItem { url: string; kind: DigitalKind; title: string; mime_type: string | null; external: boolean }

export async function fetchCurriculum(productId: string): Promise<CurriculumItem[]> {
    const { data, error } = await supabase.rpc('get_digital_curriculum', { p_product: productId })
    if (error) throw new Error(error.message)
    return (data || []) as CurriculumItem[]
}

export async function fetchLibrary(): Promise<LibraryItem[]> {
    const { data, error } = await supabase.rpc('get_my_digital_library')
    if (error) throw new Error(error.message)
    return (data || []) as LibraryItem[]
}

/** Pede ao servidor o link do item (assinado e curto, ou o link externo). Só devolve se a aula é grátis ou a pessoa comprou. */
export async function openItem(itemId: string, download = false): Promise<OpenedItem> {
    const r = await fetch(`/api/digital/open?item=${encodeURIComponent(itemId)}${download ? '&download=1' : ''}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.url) throw new Error(j.error || 'Não foi possível abrir este conteúdo.')
    return j as OpenedItem
}

/** Pedido só de produtos digitais: a loja confirmou o Pix, o acesso abre. */
export async function releaseOrder(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('release_digital_order', { p_order: orderId })
    if (error) throw new Error(error.message)
}

// ------------------------------------------------------------------ editor do vendedor
export async function listOwnItems(productId: string): Promise<OwnItem[]> {
    const { data, error } = await supabase.from('digital_contents').select('*').eq('product_id', productId).order('position').order('created_at')
    if (error) throw new Error(error.message)
    return (data || []) as OwnItem[]
}

async function nextPosition(productId: string): Promise<number> {
    const { data } = await supabase.from('digital_contents').select('position').eq('product_id', productId).order('position', { ascending: false }).limit(1)
    return ((data && data[0]?.position) ?? -1) + 1
}

/** Duração de um vídeo/áudio lida no navegador (some se o formato não tocar aqui) */
async function readDuration(file: File): Promise<number | null> {
    if (!/^(video|audio)\//.test(file.type)) return null
    return new Promise((resolve) => {
        const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
        const url = URL.createObjectURL(file)
        const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v) }
        el.preload = 'metadata'
        el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : null)
        el.onerror = () => done(null)
        el.src = url
        setTimeout(() => done(null), 8000)
    })
}

export async function addFileItem(args: { uid: string; productId: string; file: File; title: string; moduleTitle?: string; isPreview?: boolean; isTeaser?: boolean }): Promise<void> {
    const err = validateItem({ title: args.title, module: args.moduleTitle, file: { size: args.file.size } })
    if (err) throw new Error(err)
    // prévia curta da vitrine: vídeo de até 30 s (não faz parte do conteúdo vendido)
    const duration = await readDuration(args.file)
    if (args.isTeaser) { const te = validateTeaser({ isVideo: kindFromFile(args.file.type, args.file.name) === 'video', durationSeconds: duration }); if (te) throw new Error(te) }
    const path = storagePathFor(args.uid, args.productId, args.file.name)
    const up = await supabase.storage.from('digital-files').upload(path, args.file, { contentType: args.file.type || 'application/octet-stream', upsert: false })
    if (up.error) throw new Error(up.error.message)
    const { error } = await supabase.from('digital_contents').insert({
        product_id: args.productId, owner_id: args.uid, module_title: args.moduleTitle?.trim() || null, title: args.title.trim(), kind: kindFromFile(args.file.type, args.file.name),
        storage_path: path, mime_type: args.file.type || null, size_bytes: args.file.size, duration_seconds: duration, position: args.isTeaser ? 0 : await nextPosition(args.productId), is_preview: !args.isTeaser && !!args.isPreview, is_teaser: !!args.isTeaser,
    })
    if (error) { await supabase.storage.from('digital-files').remove([path]); throw new Error(error.message) }
}

export async function addLinkItem(args: { uid: string; productId: string; url: string; title: string; moduleTitle?: string; isPreview?: boolean }): Promise<void> {
    const err = validateItem({ title: args.title, module: args.moduleTitle, url: args.url })
    if (err) throw new Error(err)
    const { error } = await supabase.from('digital_contents').insert({
        product_id: args.productId, owner_id: args.uid, module_title: args.moduleTitle?.trim() || null, title: args.title.trim(), kind: 'link',
        external_url: args.url.trim(), position: await nextPosition(args.productId), is_preview: !!args.isPreview,
    })
    if (error) throw new Error(error.message)
}

export async function removeItem(item: OwnItem): Promise<void> {
    const { error } = await supabase.from('digital_contents').delete().eq('id', item.id)
    if (error) throw new Error(error.message)
    if (item.storage_path) await supabase.storage.from('digital-files').remove([item.storage_path])
}

export async function setItemPreview(id: string, isPreview: boolean): Promise<void> {
    const { error } = await supabase.from('digital_contents').update({ is_preview: isPreview }).eq('id', id)
    if (error) throw new Error(error.message)
}

export async function renameItem(id: string, patch: { title?: string; module_title?: string | null }): Promise<void> {
    const { error } = await supabase.from('digital_contents').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
}

/** Troca a posição de dois itens vizinhos */
export async function swapItems(a: OwnItem, b: OwnItem): Promise<void> {
    const r1 = await supabase.from('digital_contents').update({ position: b.position }).eq('id', a.id)
    const r2 = await supabase.from('digital_contents').update({ position: a.position }).eq('id', b.id)
    if (r1.error || r2.error) throw new Error((r1.error || r2.error)!.message)
}

// ------------------------------------------------------------------ vitrine pública (home 2.0/3.0 e /digitais)
export interface ShowcaseItem {
    id: string; name: string; slug: string; description: string | null; imageUrl: string | null; price: number
    storeId: string; storeSlug: string; storeName: string; storeLogo: string | null; viewCount: number
    kind: DigitalProductKind; summary: string; videos: number; seconds: number; freeItems: number
    /** Vídeo que toca como prévia na vitrine (a prévia curta ou a 1ª aula grátis); null = o curso não tem prévia */
    previewItemId: string | null; previewSeconds: number; previewSource: 'teaser' | 'lesson' | null
}

const publicImage = (bucket: string, path: string | null) => (path ? (path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl) : null)

export async function loadDigitalShowcase(limit = 24, search?: string): Promise<ShowcaseItem[]> {
    const { data, error } = await supabase.rpc('get_digital_showcase', { p_limit: limit, p_search: search?.trim() || null })
    if (error) throw new Error(error.message)
    return ((data || []) as any[]).map((r) => ({
        id: r.id, name: r.name, slug: r.slug, description: r.description, imageUrl: publicImage('product-images', r.image_url), price: Number(r.price || 0),
        storeId: r.store_id, storeSlug: r.store_slug, storeName: r.store_name, storeLogo: publicImage('store-logos', r.store_logo), viewCount: r.view_count || 0,
        kind: productKindOf({ name: r.name, videos: r.videos, audios: r.audios, docs: r.docs, links: r.links }),
        summary: summaryFromCounts({ videos: r.videos, audios: r.audios, docs: r.docs, links: r.links, seconds: Number(r.seconds || 0) }),
        videos: r.videos, seconds: Number(r.seconds || 0), freeItems: r.free_items || 0,
        previewItemId: r.preview_item_id || null, previewSeconds: previewPlaySeconds(r.preview_seconds), previewSource: r.preview_source || null,
    }))
}

// ------------------------------------------------------------------ link da prévia (guardado por um tempo, para o cartão tocar sem esperar)
const previewCache = new Map<string, { url: string; until: number }>()
const previewPending = new Map<string, Promise<string | null>>()

/** Link assinado da prévia (a rota só entrega se for prévia curta ou aula grátis). Null se não deu para abrir. */
export function previewUrl(itemId: string): Promise<string | null> {
    const hit = previewCache.get(itemId)
    if (hit && hit.until > Date.now()) return Promise.resolve(hit.url)
    let p = previewPending.get(itemId)
    if (!p) {
        p = openItem(itemId).then((d) => { previewCache.set(itemId, { url: d.url, until: Date.now() + 45 * 60 * 1000 }); return d.url }).catch(() => null).finally(() => { previewPending.delete(itemId) })
        previewPending.set(itemId, p)
    }
    return p
}
