// src/modules/promotions/load.ts — fala com o banco: combos da loja (listar, montar, pausar, apagar) e a vitrine pública das promoções.
import { supabase } from '@/lib/supabase/client'
import { comboErrorFromHint, checkComboImage } from './domain'

const publicImage = (bucket: string, path: string | null) => (path ? (path.startsWith('http') ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl) : null)

export interface ComboItem { item_id: string; quantity: number; name: string; price: number; image_url: string | null }
export interface StoreCombo {
    id: string; name: string; description: string | null; price: number; compare_at_price: number | null
    image_url: string | null; combo_image_uploaded: boolean; is_active: boolean; items: ComboItem[]
}
export interface CandidateItem { id: string; name: string; price: number; image_url: string | null; category: string | null }
export interface PromotionShowcaseItem {
    id: string; name: string; slug: string; description: string | null; price: number; compare_at_price: number; discount_pct: number
    image_url: string | null; is_combo: boolean; combo_image_uploaded: boolean; items: { name: string; image_url: string | null; quantity: number }[]; store_id: string; store_slug: string; store_name: string; store_logo: string | null; created_at: string
}

/** Itens que a loja pode colocar num combo: produtos físicos ativos que não são combos. */
export async function listComboCandidates(storeId: string): Promise<CandidateItem[]> {
    const { data, error } = await supabase
        .from('products')
        .select('id, name, price, image_url, category')
        .eq('store_id', storeId).eq('type', 'physical').eq('listing_type', 'sale').eq('is_combo', false).eq('is_active', true)
        .order('category', { ascending: true }).order('name', { ascending: true })
    if (error) throw new Error(error.message)
    return (data || []).map((r: any) => ({ ...r, price: Number(r.price), image_url: publicImage('product-images', r.image_url) })) as CandidateItem[]
}

/** O que cada combo leva (nome, foto, quantidade), do que mais custa para o que menos custa — é a ordem da colagem. */
export async function fetchComboItems(comboIds: string[]): Promise<Record<string, ComboItem[]>> {
    if (comboIds.length === 0) return {}
    const { data: rows, error } = await supabase
        .from('product_bundle_items')
        .select('combo_id, quantity, item:products!product_bundle_items_item_id_fkey(id, name, price, image_url)')
        .in('combo_id', comboIds)
    if (error) throw new Error(error.message)
    const byCombo: Record<string, ComboItem[]> = {}
    for (const r of (rows || []) as any[]) {
        const it = Array.isArray(r.item) ? r.item[0] : r.item
        if (!it) continue
        ;(byCombo[r.combo_id] ||= []).push({ item_id: it.id, quantity: r.quantity, name: it.name, price: Number(it.price), image_url: publicImage('product-images', it.image_url) })
    }
    for (const k of Object.keys(byCombo)) byCombo[k].sort((a, b) => b.price - a.price || a.name.localeCompare(b.name))
    return byCombo
}

/** Os combos da loja (inclusive os pausados) com o que cada um leva. */
export async function listStoreCombos(storeId: string): Promise<StoreCombo[]> {
    const { data: combos, error } = await supabase
        .from('products')
        .select('id, name, description, price, compare_at_price, image_url, combo_image_uploaded, is_active')
        .eq('store_id', storeId).eq('is_combo', true)
        .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    if (!combos || combos.length === 0) return []
    const byCombo = await fetchComboItems(combos.map((c: any) => c.id))
    return combos.map((c: any) => ({
        ...c, price: Number(c.price), compare_at_price: c.compare_at_price == null ? null : Number(c.compare_at_price), image_url: publicImage('product-images', c.image_url),
        combo_image_uploaded: !!c.combo_image_uploaded, is_active: !!c.is_active, items: byCombo[c.id] || [],
    })) as StoreCombo[]
}

/** Envia a foto do combo para o bucket de fotos de produto e devolve o caminho (é ele que vai para `save_store_combo`). */
export async function uploadComboImage(file: File): Promise<string> {
    const check = checkComboImage(file)
    if ('error' in check) throw new Error(check.error)
    const name = `combo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${check.ext}`
    const { data, error } = await supabase.storage.from('product-images').upload(name, file, { contentType: file.type || undefined })
    if (error || !data?.path) throw new Error('Não foi possível enviar a foto agora. Tente de novo.')
    return data.path
}

export const comboImageUrl = (path: string | null) => publicImage('product-images', path)

/** Cria (comboId null) ou edita um combo. A soma e o desconto são conferidos no banco. */
export async function saveCombo(args: { storeId: string; comboId: string | null; name: string; note: string; price: number; items: { product_id: string; quantity: number }[]; image?: string | null; clearImage?: boolean }): Promise<string> {
    const { data, error } = await supabase.rpc('save_store_combo', {
        p_store_id: args.storeId, p_combo_id: args.comboId, p_name: args.name, p_note: args.note || null, p_price: args.price, p_items: args.items,
        p_image: args.image || null, p_clear_image: !!args.clearImage,
    })
    if (error) throw new Error(comboErrorFromHint((error as any).hint || error.details || error.message))
    return data as string
}

export async function setComboActive(comboId: string, active: boolean): Promise<void> {
    const { error } = await supabase.from('products').update({ is_active: active }).eq('id', comboId).eq('is_combo', true)
    if (error) throw new Error(error.message)
}

export async function deleteCombo(comboId: string): Promise<void> {
    const { error } = await supabase.from('products').delete().eq('id', comboId).eq('is_combo', true)
    if (error) throw new Error(error.message)
}

/** Vitrine pública (home): promoções de lojas ativas, no máximo 3 por loja, mais novas primeiro. */
export async function fetchHomePromotions(limit = 12): Promise<PromotionShowcaseItem[]> {
    const { data, error } = await supabase.rpc('get_store_promotions', { p_limit: limit })
    if (error) throw new Error(error.message)
    return ((data || []) as any[]).map((r) => ({
        ...r, price: Number(r.price), compare_at_price: Number(r.compare_at_price),
        image_url: publicImage('product-images', r.image_url), store_logo: publicImage('store-logos', r.store_logo),
        combo_image_uploaded: !!r.combo_image_uploaded,
        items: ((r.items || []) as any[]).map((i) => ({ name: i.name, image_url: publicImage('product-images', i.image_url), quantity: i.quantity })),
    })) as PromotionShowcaseItem[]
}
