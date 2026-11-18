// src/modules/order-payment/load.ts — conversa com o banco (RPCs do pagamento do pedido e do rastreio). Nenhuma regra aqui: quem decide é o banco.
import { supabase } from '@/lib/supabase/client'
import { parseOrderPayment, type OrderPayment } from './domain'

const fail = (error: { message?: string } | null) => { if (error) throw new Error(error.message || 'Não deu certo. Tente de novo.') }

export async function fetchOrderPayment(orderId: string): Promise<OrderPayment | null> {
    const { data, error } = await supabase.rpc('get_order_payment', { p_order: orderId })
    if (error) return null
    return parseOrderPayment(data)
}
export async function reportOrderPaid(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('report_order_paid', { p_order: orderId }); fail(error)
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

export interface StoreOrderPayment { orderId: string; method: 'pix' | 'link_cartao' | 'pix_porta'; status: 'awaiting' | 'reported' | 'confirmed' | 'not_received'; amount: number; reportedAt: string | null }
/** a loja: o estado do pagamento dos pedidos recentes, de uma vez (lista de pedidos e "Precisa de você agora") */
export async function fetchStoreOrderPayments(storeId: string): Promise<Map<string, StoreOrderPayment>> {
    const { data, error } = await supabase.rpc('get_store_order_payments', { p_store: storeId })
    const m = new Map<string, StoreOrderPayment>()
    if (error) return m
    for (const r of (data || []) as any[]) m.set(r.order_id, { orderId: r.order_id, method: r.method, status: r.status, amount: Number(r.amount) || 0, reportedAt: r.reported_at ?? null })
    return m
}
