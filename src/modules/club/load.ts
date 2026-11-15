// src/modules/club/load.ts — o clube falando com o banco (migration 20261130000034). A chave Pix da loja (privada) só vem de start_club_payment; quem pode o quê é do banco.
import { supabase } from '@/lib/supabase/client'
import type { ClubInfo, ClubPaymentStatus } from './domain'

export interface ClubPayment { id: string; amountCents: number; storeName: string; pixKey: string; pixKeyType: string | null }
export interface ClubPanelRow { id: string; amountCents: number; createdAt: string; periodEnd: string | null; status: ClubPaymentStatus; payerName: string; payerSlug: string | null }
export interface ClubPanelMember { profileId: string; name: string; slug: string | null; periodEnd: string }
export interface ClubPanel {
    enabled: boolean; priceCents: number | null; hasPix: boolean; includesMusic: boolean; tracks: number; activePaid: number; freeMembers: number; toCheck: number
    confirmedCents30d: number; confirmedCents: number; rows: ClubPanelRow[]; members: ClubPanelMember[]
}

export async function fetchClubInfo(storeId: string): Promise<ClubInfo | null> {
    const { data, error } = await supabase.rpc('get_club_info', { p_store: storeId })
    if (error || !data) return null
    const d = data as any
    if (!d.enabled) return { enabled: false, isOwner: false, priceCents: null, canCharge: false, includesMusic: false, tracks: 0, description: null, my: null }
    const m = d.my
    return {
        enabled: true, isOwner: !!d.is_owner, priceCents: d.price_cents == null ? null : Number(d.price_cents), canCharge: !!d.can_charge, includesMusic: !!d.includes_music, tracks: Number(d.tracks) || 0, description: d.description ?? null,
        my: m ? { member: !!m.member, paid: !!m.paid, periodEnd: m.period_end ?? null, active: !!m.active, musicOk: !!m.music_ok, openPayment: m.open_payment ?? null, openStatus: m.open_status ?? null } : null,
    }
}

export async function startClubPayment(storeId: string): Promise<ClubPayment> {
    const { data, error } = await supabase.rpc('start_club_payment', { p_store: storeId })
    if (error) throw new Error(error.message)
    const d = data as any
    return { id: d.id, amountCents: d.amount_cents, storeName: d.store_name, pixKey: d.pix_key, pixKeyType: d.pix_key_type || null }
}

export async function reportClubPaid(paymentId: string): Promise<void> {
    const { error } = await supabase.rpc('report_club_payment_paid', { p_payment: paymentId })
    if (error) throw new Error(error.message)
}

export async function resolveClubPayment(paymentId: string, confirm: boolean): Promise<void> {
    const { error } = await supabase.rpc('resolve_club_payment', { p_payment: paymentId, p_confirm: confirm })
    if (error) throw new Error(error.message)
}

export async function saveClubSettings(storeId: string, priceCents: number | null, includesMusic: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_club_settings', { p_store: storeId, p_price_cents: priceCents, p_includes_music: includesMusic })
    if (error) throw new Error(error.message)
}

export async function fetchClubPanel(storeId: string): Promise<ClubPanel | null> {
    const { data, error } = await supabase.rpc('get_club_panel', { p_store: storeId })
    if (error || !data) return null
    const d = data as any
    return {
        enabled: !!d.enabled, priceCents: d.price_cents == null ? null : Number(d.price_cents), hasPix: !!d.has_pix, includesMusic: !!d.includes_music, tracks: Number(d.tracks) || 0, activePaid: Number(d.active_paid) || 0, freeMembers: Number(d.free_members) || 0,
        toCheck: Number(d.to_check) || 0, confirmedCents30d: Number(d.confirmed_cents_30d) || 0, confirmedCents: Number(d.confirmed_cents) || 0,
        rows: ((d.rows || []) as any[]).map((r) => ({ id: r.id, amountCents: r.amount_cents, createdAt: r.created_at, periodEnd: r.period_end ?? null, status: r.status, payerName: r.payer_name, payerSlug: r.payer_slug ?? null })),
        members: ((d.members || []) as any[]).map((m) => ({ profileId: m.profile_id, name: m.name, slug: m.slug ?? null, periodEnd: m.period_end })),
    }
}
