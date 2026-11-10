// src/modules/digital/load.ts — fala com o banco/servidor: vitrine (sumário), biblioteca do comprador, abrir um item e o editor do vendedor.
import { supabase } from '@/lib/supabase/client'
import { uploadToR2, removeFromR2 } from '@/lib/r2Upload'
import { r2FallbackAllowed, heavyUploadInfo } from '@/lib/r2Types'
import { storeDigitalFromRow, type StoreDigitalSummary, bucketForKind, DIGITAL_BUCKETS, DIGITAL_HEAVY_KIND, DIGITAL_MAX_BYTES_BY_BUCKET, isHeavyBucket, kindFromFile, storagePathFor, validateItem, validateTeaser, productKindOf, isDigitalProductKind, summaryFromCounts, previewPlaySeconds, isInstallerFile, validateAppInput, SHA256_MAX_BYTES, type AppPlatform, type AppVersion, type CurriculumItem, type DigitalKind, type DigitalProductKind } from './domain'

export interface LibraryItem { product_id: string; product_name: string; product_slug: string; store_slug: string | null; store_name: string | null; image_url: string | null; purchased_at: string; items_count: number }
export interface OwnItem { id: string; product_id: string; module_title: string | null; title: string; kind: DigitalKind; storage_path: string | null; external_url: string | null; mime_type: string | null; size_bytes: number | null; duration_seconds: number | null; position: number; is_preview: boolean; is_teaser: boolean; platform: AppPlatform | null; version: string | null; release_notes: string | null; sha256: string | null; download_count: number; created_at: string; bucket: string | null; file_name: string | null }
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

/** Produto GRÁTIS (preço 0): a pessoa logada o adiciona à biblioteca sem pedido nem "a loja libera" (o banco confere que é mesmo grátis e tem conteúdo) */
export async function claimFree(productId: string): Promise<void> {
    const { error } = await supabase.rpc('claim_free_digital', { p_product: productId })
    if (error) throw new Error(error.message)
}

/** Eu já tenho acesso a este produto? (comprei, peguei de graça ou sou o dono). Visitante: não. */
export async function fetchMyAccess(productId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('my_digital_access', { p_product: productId })
    if (error) return false
    return data === true
}

/** Prévia de áudio (até 30 s) de uma música, aberta ao público — null se o artista não enviou */
export async function fetchAudioPreview(productId: string): Promise<{ itemId: string; seconds: number | null } | null> {
    const { data, error } = await supabase.rpc('get_digital_audio_preview', { p_product: productId })
    if (error) return null
    const r = ((data || []) as { item_id: string; duration_seconds: number | null }[])[0]
    return r ? { itemId: r.item_id, seconds: r.duration_seconds } : null
}

/** Autoria: o dono já declarou que a obra é dele (ou licenciada)? */
export async function hasRights(productId: string): Promise<boolean> {
    const { data } = await supabase.rpc('has_digital_rights', { p_product: productId })
    return data === true
}
export async function declareRights(productId: string): Promise<void> {
    const { error } = await supabase.rpc('declare_digital_rights', { p_product: productId })
    if (error) throw new Error(error.message)
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

/** Envia o arquivo ao R2 PRIVADO do digital (migration 20261130000033). Devolve a chave no R2, ou null se o R2 não está pronto/caiu e o arquivo ainda cabe no armazenamento comum
 *  (plano B). Recusa de regra (bloqueio, ritmo, cota, tamanho, tipo) nunca cai no plano B: lança o motivo. */
async function sendHeavy(file: File, fallbackMaxBytes: number, onProgress?: (percent: number) => void): Promise<string | null> {
    const up = await uploadToR2(file, DIGITAL_HEAVY_KIND, { onProgress, binary: true })
    if (up.ok) return up.key
    if (!r2FallbackAllowed(up.code) || file.size > fallbackMaxBytes) throw new Error(up.message)
    return null
}

/** `useR2`: o R2 do digital está pronto (o editor pergunta com r2Availability) — o arquivo vai para lá; `maxBytes` então é o limite do tipo digital_heavy */
export async function addFileItem(args: { uid: string; productId: string; file: File; title: string; moduleTitle?: string; isPreview?: boolean; isTeaser?: boolean; maxBytes?: number; useR2?: boolean; onProgress?: (percent: number) => void }): Promise<void> {
    const err = validateItem({ title: args.title, module: args.moduleTitle, file: { size: args.file.size, maxBytes: args.maxBytes } })
    if (err) throw new Error(err)
    if (isInstallerFile(args.file.name)) throw new Error('Instaladores e aplicativos vão no bloco "Programa ou aplicativo" (com plataforma e versão).')
    // prévia curta da vitrine: vídeo de até 30 s (não faz parte do conteúdo vendido)
    const duration = await readDuration(args.file)
    if (args.isTeaser) { const k = kindFromFile(args.file.type, args.file.name); const te = validateTeaser({ isVideo: k === 'video', isAudio: k === 'audio', durationSeconds: duration }); if (te) throw new Error(te) }
    const kind = kindFromFile(args.file.type, args.file.name)
    let bucket: string = bucketForKind(kind)   // música, programa e o resto têm bucket e limite próprios
    let path = ''
    const heavyKey = args.useR2 && heavyUploadInfo(args.file.type, args.file.name) ? await sendHeavy(args.file, DIGITAL_MAX_BYTES_BY_BUCKET[bucket as keyof typeof DIGITAL_MAX_BYTES_BY_BUCKET], args.onProgress) : null   // formato fora da lista do R2: segue pelo armazenamento comum
    if (heavyKey) { path = heavyKey; bucket = DIGITAL_BUCKETS.heavy }
    else {
        path = storagePathFor(args.uid, args.productId, args.file.name)
        const up = await supabase.storage.from(bucket).upload(path, args.file, { contentType: args.file.type || 'application/octet-stream', upsert: false })
        if (up.error) throw new Error(up.error.message)
    }
    const { error } = await supabase.from('digital_contents').insert({
        product_id: args.productId, owner_id: args.uid, module_title: args.moduleTitle?.trim() || null, title: args.title.trim(), kind, bucket,
        storage_path: path, file_name: isHeavyBucket(bucket) ? args.file.name.slice(0, 200) : null, mime_type: args.file.type || null, size_bytes: args.file.size, duration_seconds: duration, position: args.isTeaser ? 0 : await nextPosition(args.productId), is_preview: !args.isTeaser && !!args.isPreview, is_teaser: !!args.isTeaser,
    })
    if (error) {
        if (isHeavyBucket(bucket)) void removeFromR2(path); else await supabase.storage.from(bucket).remove([path])
        throw new Error(error.message)
    }
}

/** SHA-256 do arquivo em hexadecimal, calculado no navegador (null se for grande demais para a memória ou o navegador não souber) */
export async function sha256Hex(file: File): Promise<string | null> {
    if (file.size > SHA256_MAX_BYTES || typeof crypto === 'undefined' || !crypto.subtle) return null
    try {
        const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    } catch { return null }
}

/** Publica uma versão de programa/aplicativo (um arquivo por plataforma e versão). O banco confere extensão, plataforma, versão e a declaração de autoria. */
export async function addAppItem(args: { uid: string; productId: string; file: File; platform: AppPlatform; version: string; notes?: string; isPreview?: boolean; maxBytes?: number; useR2?: boolean; onProgress?: (percent: number) => void }): Promise<void> {
    const err = validateAppInput({ fileName: args.file.name, size: args.file.size, maxBytes: args.maxBytes, platform: args.platform, version: args.version, notes: args.notes })
    if (err) throw new Error(err)
    const sha = await sha256Hex(args.file)
    let bucket: string = DIGITAL_BUCKETS.apps
    let path = ''
    const heavyKey = args.useR2 ? await sendHeavy(args.file, DIGITAL_MAX_BYTES_BY_BUCKET[DIGITAL_BUCKETS.apps], args.onProgress) : null
    if (heavyKey) { path = heavyKey; bucket = DIGITAL_BUCKETS.heavy }
    else {
        path = storagePathFor(args.uid, args.productId, args.file.name)
        const up = await supabase.storage.from(DIGITAL_BUCKETS.apps).upload(path, args.file, { contentType: args.file.type || 'application/octet-stream', upsert: false })
        if (up.error) throw new Error(up.error.message)
    }
    const { error } = await supabase.from('digital_contents').insert({
        product_id: args.productId, owner_id: args.uid, bucket, title: `${args.version.trim()} · ${args.file.name}`.slice(0, 140), kind: 'app', storage_path: path, file_name: isHeavyBucket(bucket) ? args.file.name.slice(0, 200) : null, mime_type: args.file.type || null, size_bytes: args.file.size,
        platform: args.platform, version: args.version.trim(), release_notes: args.notes?.trim() || null, sha256: sha, position: await nextPosition(args.productId), is_preview: !!args.isPreview,
    })
    if (error) {
        if (isHeavyBucket(bucket)) void removeFromR2(path); else await supabase.storage.from(DIGITAL_BUCKETS.apps).remove([path])
        throw new Error(error.message)
    }
}

/** As versões do programa para a página do produto (sem caminho nem link; o arquivo abre pela rota do servidor) */
export async function fetchAppInfo(productId: string): Promise<AppVersion[]> {
    const { data, error } = await supabase.rpc('get_digital_app_info', { p_product: productId })
    if (error) throw new Error(error.message)
    return ((data || []) as any[]).map((r) => ({ ...r, size_bytes: r.size_bytes == null ? null : Number(r.size_bytes), download_count: Number(r.download_count) || 0 })) as AppVersion[]
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
    // o item já saiu do banco; agora o arquivo: no R2 pela rota do servidor (que confere que ninguém mais usa), no armazenamento comum direto
    if (item.storage_path) { if (isHeavyBucket(item.bucket)) await removeFromR2(item.storage_path); else await supabase.storage.from(item.bucket || 'digital-files').remove([item.storage_path]) }
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
    /** a loja marcou como destaque (Studio/Conteúdo) */
    isFeatured: boolean
    /** livro com prévia em PDF: quantas páginas (null = sem prévia) */
    bookPreviewPages: number | null
}

const publicImage = (bucket: string, path: string | null) => (path ? (path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl) : null)

/** `storeId`: só os digitais de UMA loja (a aba "Digitais" da página dela) */
export async function loadDigitalShowcase(limit = 24, search?: string, storeId?: string): Promise<ShowcaseItem[]> {
    const { data, error } = await supabase.rpc('get_digital_showcase', { p_limit: limit, p_search: search?.trim() || null, ...(storeId ? { p_store: storeId } : {}) })
    if (error) throw new Error(error.message)
    return ((data || []) as any[]).map((r) => ({
        id: r.id, name: r.name, slug: r.slug, description: r.description, imageUrl: publicImage('product-images', r.image_url), price: Number(r.price || 0),
        storeId: r.store_id, storeSlug: r.store_slug, storeName: r.store_name, storeLogo: publicImage('store-logos', r.store_logo), viewCount: r.view_count || 0,
        kind: productKindOf({ name: r.name, videos: r.videos, audios: r.audios, docs: r.docs, links: r.links, apps: r.apps || 0, chosen: r.digital_kind }),
        summary: summaryFromCounts({ videos: r.videos, audios: r.audios, docs: r.docs, links: r.links, apps: r.apps || 0, seconds: Number(r.seconds || 0) }),
        videos: r.videos, seconds: Number(r.seconds || 0), freeItems: r.free_items || 0,
        previewItemId: r.preview_item_id || null, previewSeconds: previewPlaySeconds(r.preview_seconds), previewSource: r.preview_source || null,
        isFeatured: !!r.is_featured, bookPreviewPages: r.book_preview_pages ?? null,
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

/** O resumo do digital da loja para o painel (só o dono; o banco recusa os outros) */
export async function fetchStoreDigitalSummary(storeId: string): Promise<StoreDigitalSummary | null> {
    const { data, error } = await supabase.rpc('get_store_digital_summary', { p_store: storeId })
    if (error) return null
    return storeDigitalFromRow(data as any)
}

/** O tipo de conteúdo que o lojista escolheu para o produto digital (null = ainda não escolheu) */
export async function fetchDigitalKind(productId: string): Promise<DigitalProductKind | null> {
    const { data, error } = await supabase.from('products').select('digital_kind').eq('id', productId).maybeSingle()
    if (error) throw new Error(error.message)
    return isDigitalProductKind(data?.digital_kind) ? data!.digital_kind : null
}
export async function saveDigitalKind(productId: string, kind: DigitalProductKind): Promise<void> {
    const { error } = await supabase.from('products').update({ digital_kind: kind }).eq('id', productId)
    if (error) throw new Error(error.message)
}

/** A prévia em PDF de um livro (qualquer pessoa): o item e quantas páginas */
export async function fetchBookPreview(productId: string): Promise<{ itemId: string; pages: number } | null> {
    const { data, error } = await supabase.rpc('get_digital_book_preview', { p_product: productId })
    if (error) return null
    const r = ((data || []) as { item_id: string; pages: number }[])[0]
    return r ? { itemId: r.item_id, pages: r.pages } : null
}
/** A dona marca o destaque da loja (null tira) */
export async function setStoreFeatured(storeId: string, productId: string | null): Promise<void> {
    const { error } = await supabase.rpc('set_store_featured', { p_store: storeId, p_product: productId })
    if (error) throw new Error(error.message)
}
/** A dona gera a prévia do livro: o servidor recorta as primeiras N páginas do PDF */
export async function makeBookPreview(itemId: string, pages: number): Promise<{ pages: number }> {
    const r = await fetch('/api/digital/book-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, pages }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Não foi possível gerar a prévia.')
    return j
}
