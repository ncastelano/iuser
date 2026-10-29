// src/modules/digital/load.ts — fala com o banco/servidor: vitrine (sumário), biblioteca do comprador, abrir um item e o editor do vendedor.
import { supabase } from '@/lib/supabase/client'
import { kindFromFile, storagePathFor, validateItem, type CurriculumItem, type DigitalKind } from './domain'

export interface LibraryItem { product_id: string; product_name: string; product_slug: string; store_slug: string | null; store_name: string | null; image_url: string | null; purchased_at: string; items_count: number }
export interface OwnItem { id: string; product_id: string; module_title: string | null; title: string; kind: DigitalKind; storage_path: string | null; external_url: string | null; mime_type: string | null; size_bytes: number | null; duration_seconds: number | null; position: number; is_preview: boolean }
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

export async function addFileItem(args: { uid: string; productId: string; file: File; title: string; moduleTitle?: string; isPreview?: boolean }): Promise<void> {
    const err = validateItem({ title: args.title, module: args.moduleTitle, file: { size: args.file.size } })
    if (err) throw new Error(err)
    const path = storagePathFor(args.uid, args.productId, args.file.name)
    const up = await supabase.storage.from('digital-files').upload(path, args.file, { contentType: args.file.type || 'application/octet-stream', upsert: false })
    if (up.error) throw new Error(up.error.message)
    const duration = await readDuration(args.file)
    const { error } = await supabase.from('digital_contents').insert({
        product_id: args.productId, owner_id: args.uid, module_title: args.moduleTitle?.trim() || null, title: args.title.trim(), kind: kindFromFile(args.file.type, args.file.name),
        storage_path: path, mime_type: args.file.type || null, size_bytes: args.file.size, duration_seconds: duration, position: await nextPosition(args.productId), is_preview: !!args.isPreview,
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
