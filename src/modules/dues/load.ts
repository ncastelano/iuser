// src/modules/dues/load.ts — conversa com o banco (RPCs do caixa e das contestações). Nenhuma regra aqui: quem decide é o banco.
import { supabase } from '@/lib/supabase/client'
import type { Due, DisputeOutcome, DisputeReason, MyDues, StoreDues } from './domain'

const toDue = (r: any): Due => ({
    id: r.id, kind: r.kind, storeId: r.store_id, storeName: r.store_name || 'Loja', amount: r.amount != null ? Number(r.amount) : null, status: r.status, dueAt: r.due_at || null,
    declaredAt: r.declared_at || null, method: r.declare_method || null, note: r.note || null, overdue: !!r.overdue, createdAt: r.created_at, driverName: r.driver_name, driverSlug: r.driver_slug ?? null,
})

export async function fetchMyDues(): Promise<MyDues | null> {
    const { data, error } = await supabase.rpc('get_my_dues')
    if (error || !data) return null
    const d = data as any
    return { blocked: d.blocked || null, blockedText: d.blocked_text || null, openAmount: Number(d.open_amount) || 0, maxOpen: Number(d.max_open) || 0, items: ((d.items || []) as any[]).map(toDue) }
}
export async function fetchStoreDues(storeId: string): Promise<StoreDues> {
    const { data, error } = await supabase.rpc('get_store_dues', { p_store: storeId })
    if (error) throw error
    const d = data as any
    return { items: ((d?.items || []) as any[]).map((r) => toDue({ ...r, store_name: '' })), pendingAmount: Number(d?.pending_amount) || 0 }
}
export async function fetchRemitTarget(dueId: string): Promise<{ storeName: string; pixKey: string | null; amount: number }> {
    const { data, error } = await supabase.rpc('get_due_remit_target', { p_due: dueId })
    if (error) throw new Error(error.message)
    const d = data as any
    return { storeName: d.store_name, pixKey: d.pix_key || null, amount: Number(d.amount) }
}
export async function declareDue(dueId: string, method: 'pix' | 'em_maos' | 'devolvida'): Promise<void> {
    const { error } = await supabase.rpc('declare_due', { p_due: dueId, p_method: method })
    if (error) throw new Error(error.message)
}
export async function confirmDue(dueId: string, ok: boolean, note?: string): Promise<void> {
    const { error } = await supabase.rpc('confirm_due', { p_due: dueId, p_ok: ok, p_note: note ?? null })
    if (error) throw new Error(error.message)
}

// ===== contestação =====
export interface DisputeView {
    exists: boolean; canOpen?: boolean; windowHours?: number
    role?: 'customer' | 'store' | 'driver'; id?: string; reason?: DisputeReason; note?: string | null; status?: 'open' | 'decided'; evidence?: Record<string, any>
    storeReply?: string | null; driverReply?: string | null; outcome?: DisputeOutcome | null; decisionNote?: string | null
    refundAmount?: number | null; refundStatus?: 'none' | 'pending' | 'declared' | 'confirmed'; refundMethod?: string | null; refundContested?: boolean
}
export async function fetchDisputeView(orderId: string): Promise<DisputeView | null> {
    const { data } = await supabase.rpc('get_delivery_dispute_view', { p_order: orderId })
    if (!data) return null
    const d = data as any
    return {
        exists: !!d.exists, canOpen: d.can_open, windowHours: d.window_hours, role: d.role, id: d.id, reason: d.reason, note: d.note, status: d.status, evidence: d.evidence, storeReply: d.store_reply, driverReply: d.driver_reply,
        outcome: d.outcome, decisionNote: d.decision_note, refundAmount: d.refund_amount != null ? Number(d.refund_amount) : null, refundStatus: d.refund_status, refundMethod: d.refund_method, refundContested: !!d.refund_contested,
    }
}
export async function openDispute(orderId: string, reason: DisputeReason, note: string): Promise<void> {
    const { error } = await supabase.rpc('open_delivery_dispute', { p_order: orderId, p_reason: reason, p_note: note || null })
    if (error) throw new Error(error.message)
}
export async function replyDispute(disputeId: string, note: string): Promise<void> {
    const { error } = await supabase.rpc('reply_delivery_dispute', { p_dispute: disputeId, p_note: note })
    if (error) throw new Error(error.message)
}
export async function declareRefund(disputeId: string, method: string): Promise<void> {
    const { error } = await supabase.rpc('declare_dispute_refund', { p_dispute: disputeId, p_method: method })
    if (error) throw new Error(error.message)
}
export async function confirmRefund(disputeId: string, ok: boolean): Promise<void> {
    const { error } = await supabase.rpc('confirm_dispute_refund', { p_dispute: disputeId, p_ok: ok })
    if (error) throw new Error(error.message)
}
export interface MyDispute { id: string; orderId: string; role: 'store' | 'driver'; storeName: string; reason: DisputeReason; note: string | null; status: 'open' | 'decided'; outcome: DisputeOutcome | null; decisionNote: string | null; storeReply: string | null; driverReply: string | null; refundAmount: number | null; refundStatus: string; refundContested: boolean; createdAt: string; evidence: Record<string, any> }
export async function fetchMyDisputes(storeId?: string): Promise<MyDispute[]> {
    const { data } = await supabase.rpc('get_my_delivery_disputes', { p_store: storeId ?? null })
    return ((data || []) as any[]).map((r) => ({ id: r.id, orderId: r.order_id, role: r.role, storeName: r.store_name, reason: r.reason, note: r.note, status: r.status, outcome: r.outcome, decisionNote: r.decision_note, storeReply: r.store_reply, driverReply: r.driver_reply, refundAmount: r.refund_amount != null ? Number(r.refund_amount) : null, refundStatus: r.refund_status, refundContested: !!r.refund_contested, createdAt: r.created_at, evidence: r.evidence || {} }))
}
