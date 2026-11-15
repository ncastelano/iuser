// src/modules/tips/load.ts — a gorjeta falando com o banco. Quem pode o quê e a chave Pix (privada) são do banco.
import { supabase } from '@/lib/supabase/client'
import type { TipStatus } from './domain'

export interface TipsInfo { enabled: boolean; isOwner: boolean; supporters: number }
export interface CreatedTip { id: string; amountCents: number; storeName: string; pixKey: string; pixKeyType: string | null }
export interface TipRow { id: string; amountCents: number; message: string | null; createdAt: string; status: TipStatus; tipperName: string; tipperSlug: string | null; productName: string | null }
export interface TipsPanel { enabled: boolean; confirmedCents: number; confirmedCount: number; toCheck: number; rows: TipRow[] }

export async function fetchTipsInfo(storeId: string): Promise<TipsInfo | null> {
    const { data, error } = await supabase.rpc('get_store_tips_info', { p_store: storeId })
    if (error || !data) return null
    return { enabled: !!(data as any).enabled, isOwner: !!(data as any).is_owner, supporters: Number((data as any).supporters) || 0 }
}

export async function createTip(args: { storeId: string; amountCents: number; productId?: string | null; message?: string }): Promise<CreatedTip> {
    const { data, error } = await supabase.rpc('create_store_tip', { p_store: args.storeId, p_amount_cents: args.amountCents, p_product: args.productId || null, p_message: args.message || null })
    if (error) throw new Error(error.message)
    const d = data as any
    return { id: d.id, amountCents: d.amount_cents, storeName: d.store_name, pixKey: d.pix_key, pixKeyType: d.pix_key_type || null }
}

export async function reportTipPaid(tipId: string): Promise<void> {
    const { error } = await supabase.rpc('report_store_tip_paid', { p_tip: tipId })
    if (error) throw new Error(error.message)
}

export async function resolveTip(tipId: string, confirm: boolean): Promise<void> {
    const { error } = await supabase.rpc('resolve_store_tip', { p_tip: tipId, p_confirm: confirm })
    if (error) throw new Error(error.message)
}

export async function fetchTipsPanel(storeId: string): Promise<TipsPanel | null> {
    const { data, error } = await supabase.rpc('get_store_tips_panel', { p_store: storeId })
    if (error || !data) return null
    const d = data as any
    return {
        enabled: !!d.enabled, confirmedCents: Number(d.confirmed_cents) || 0, confirmedCount: Number(d.confirmed_count) || 0, toCheck: Number(d.to_check) || 0,
        rows: ((d.rows || []) as any[]).map((r) => ({ id: r.id, amountCents: r.amount_cents, message: r.message, createdAt: r.created_at, status: r.status, tipperName: r.tipper_name, tipperSlug: r.tipper_slug, productName: r.product_name })),
    }
}

export async function setTipsEnabled(storeId: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_store_tips_enabled', { p_store: storeId, p_enabled: enabled })
    if (error) throw new Error(error.message)
}
