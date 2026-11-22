// src/modules/order-payment/load.ts — conversa com o banco (RPCs do pagamento do pedido e do rastreio). Nenhuma regra aqui: quem decide é o banco.
import { supabase } from '@/lib/supabase/client'
import { parseOrderPayment, type OrderPayment } from './domain'

const fail = (error: { message?: string } | null) => { if (error) throw new Error(error.message || 'Não deu certo. Tente de novo.') }

export async function fetchOrderPayment(orderId: string): Promise<OrderPayment | null> {
    const { data, error } = await supabase.rpc('get_order_payment', { p_order: orderId })
    if (error) return null
    return parseOrderPayment(data)
}
export interface PaidInfo { payerName?: string; payerBank?: string; e2e?: string; receipt?: File | null }
const RECEIPT_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
/** "Já paguei": opcionalmente com o comprovante (foto/PDF, bucket privado payment-receipts) e os dados de quem pagou. O banco confere tudo (report_order_paid). */
export async function reportOrderPaid(orderId: string, info: PaidInfo = {}): Promise<void> {
    let receipt: string | null = null
    if (info.receipt) {
        const ext = RECEIPT_TYPES[info.receipt.type]
        if (!ext) throw new Error('Envie o comprovante como foto (JPG, PNG, WebP) ou PDF.')
        if (info.receipt.size > 6 * 1024 * 1024) throw new Error('O comprovante pode ter até 6 MB.')
        const { data: u } = await supabase.auth.getUser()
        if (!u.user) throw new Error('Entre na sua conta.')
        receipt = `${u.user.id}/comprovante-${orderId.slice(0, 8)}-${Date.now()}.${ext}`
        const { error: up } = await supabase.storage.from('payment-receipts').upload(receipt, info.receipt, { contentType: info.receipt.type, upsert: false })
        if (up) throw new Error(up.message || 'Não deu para enviar o comprovante.')
    }
    const { error } = await supabase.rpc('report_order_paid', {
        p_order: orderId, p_receipt: receipt, p_payer_name: info.payerName?.trim() || null, p_payer_bank: info.payerBank?.trim() || null, p_e2e: info.e2e?.replace(/\s/g, '') || null,
    }); fail(error)
}
/** link de 10 min para abrir o comprovante (só quem enviou e a equipe da loja do pedido conseguem: política do Storage) */
export async function receiptUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from('payment-receipts').createSignedUrl(path, 600)
    return error ? null : data?.signedUrl ?? null
}
export async function confirmOrderPayment(orderId: string, ok: boolean, note?: string): Promise<void> {
    const { error } = await supabase.rpc('confirm_order_payment', { p_order: orderId, p_ok: ok, p_note: note ?? null }); fail(error)
}
export async function startDoorPix(rideId: string): Promise<{ storeName: string; pixKey: string; pixKeyType: string | null; amount: number; txid: string }> {
    const { data, error } = await supabase.rpc('start_door_pix', { p_ride: rideId }); fail(error)
    const d = data as any
    return { storeName: d.store_name, pixKey: d.pix_key, pixKeyType: d.pix_key_type ?? null, amount: Number(d.amount) || 0, txid: d.txid }
}
export async function reportDoorPix(rideId: string): Promise<void> {
    const { error } = await supabase.rpc('driver_report_door_pix', { p_ride: rideId }); fail(error)
}
export async function fetchStorePaymentLink(storeId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('get_store_payment_link', { p_store: storeId })
    if (error) return null
    return (data as string) || null
}
export async function saveStorePaymentLink(storeId: string, link: string): Promise<void> {
    const { error } = await supabase.rpc('set_store_payment_link', { p_store: storeId, p_link: link.trim() || null }); fail(error)
}

export interface OrderTracking {
    stage: 'to_store' | 'at_store' | 'delivering' | 'at_door'
    driverName: string
    vehicleKind: string | null; vehicleModel: string | null; vehicleColor: string | null
    lat: number | null; lng: number | null; exact: boolean; updatedAt: string | null
    destLat: number | null; destLng: number | null
    storeName: string; storeLat: number | null; storeLng: number | null
}
export async function fetchOrderTracking(orderId: string): Promise<OrderTracking | null> {
    const { data, error } = await supabase.rpc('get_order_tracking', { p_order: orderId })
    if (error || !data) return null
    const d = data as any
    const n = (v: any) => (v == null ? null : Number(v))
    return {
        stage: d.stage, driverName: d.driver_name || 'Entregador', vehicleKind: d.vehicle_kind ?? null, vehicleModel: d.vehicle_model ?? null, vehicleColor: d.vehicle_color ?? null,
        lat: n(d.lat), lng: n(d.lng), exact: !!d.exact, updatedAt: d.updated_at ?? null, destLat: n(d.dest_lat), destLng: n(d.dest_lng),
        storeName: d.store_name || 'a loja', storeLat: n(d.store_lat), storeLng: n(d.store_lng),
    }
}

export interface StoreOrderPayment { orderId: string; method: 'pix' | 'link_cartao' | 'pix_porta'; status: 'awaiting' | 'reported' | 'confirmed' | 'not_received'; amount: number; reportedAt: string | null; hasReceipt?: boolean; payerName?: string | null }
/** a loja: o estado do pagamento dos pedidos recentes, de uma vez (lista de pedidos e "Precisa de você agora") */
export async function fetchStoreOrderPayments(storeId: string): Promise<Map<string, StoreOrderPayment>> {
    const { data, error } = await supabase.rpc('get_store_order_payments', { p_store: storeId })
    const m = new Map<string, StoreOrderPayment>()
    if (error) return m
    for (const r of (data || []) as any[]) m.set(r.order_id, { orderId: r.order_id, method: r.method, status: r.status, amount: Number(r.amount) || 0, reportedAt: r.reported_at ?? null, hasReceipt: !!r.has_receipt, payerName: r.payer_name ?? null })
    return m
}
