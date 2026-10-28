// src/modules/deliveries/load.ts — a Central de entregas falando com o banco. Quem pode o quê é do banco (RLS e gatilhos): o motorista vê as entregas abertas
// (ride_offers, sem dado pessoal), aceita pela candidatura (frete fixo; o banco confere a capacidade) e só mexe nas corridas dele.
import { supabase } from '@/lib/supabase/client'
import { notifyRideStatus } from '@/lib/notifyRideStatus'
import { itemsList, OFFER_MAX_AGE_MIN, type ActiveDelivery, type DeliveryOffer, type LatLng } from './domain'

const num = (v: any): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const pos = (lat: any, lng: any): LatLng | null => (num(lat) != null && num(lng) != null ? { lat: Number(lat), lng: Number(lng) } : null)

export interface DriverState {
    online: boolean
    live: LatLng | null
    radiusKm: number | null
    capacity: number
    /** quanto cabe em VOLUME (unidades); null = sem limite por volume */
    capacityUnits: number | null
    vehicle: string
    /** orientação por voz ligada (preferência do motorista) */
    voice: boolean
}

export async function fetchDriverState(me: string): Promise<DriverState> {
    const [{ data: pr }, { data: veh }] = await Promise.all([
        supabase.from('driver_pricing').select('driver_mode_active, live_lat, live_lng, delivery_radius_km, voice_navigation_enabled').eq('driver_id', me).maybeSingle(),
        supabase.from('driver_vehicles').select('car_model, vehicle_kind, delivery_capacity, delivery_capacity_units').eq('driver_id', me),
    ])
    const v = ((veh || []) as any[]).sort((a, b) => (Number(b.delivery_capacity) || 1) - (Number(a.delivery_capacity) || 1))[0]
    return {
        online: !!(pr as any)?.driver_mode_active, live: pos((pr as any)?.live_lat, (pr as any)?.live_lng), radiusKm: num((pr as any)?.delivery_radius_km),
        capacity: Number(v?.delivery_capacity) || 1, capacityUnits: v?.delivery_capacity_units != null ? Number(v.delivery_capacity_units) : null, vehicle: v ? [v.vehicle_kind, v.car_model].filter(Boolean).join(' · ') : '', voice: !!(pr as any)?.voice_navigation_enabled,
    }
}

export async function fetchActive(me: string): Promise<ActiveDelivery[]> {
    const { data, error } = await supabase.from('ride_requests')
        .select('id, order_id, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, recipient_name, sender_name, object_description, offered_price, distance_km, delivery_units, items_count, payment_method, cash_change_for, driver_en_route, driver_arrived_at, ride_started_at, arrived_destination_at, created_at')
        .eq('driver_id', me).eq('status', 'accepted').not('order_id', 'is', null).order('created_at')
    if (error) throw error
    // Antes da retirada: o estado de cada pedido (pronto ou ainda em preparo). O motorista não lê `orders`; a função devolve só o das corridas dele.
    const waiting = ((data || []) as any[]).filter((r) => !r.ride_started_at).map((r) => r.id)
    const st = new Map<string, string>()
    if (waiting.length) {
        const { data: sts } = await supabase.rpc('get_my_pickup_status', { p_rides: waiting })
        ;((sts || []) as { ride_id: string; order_status: string }[]).forEach((x) => st.set(x.ride_id, x.order_status))
    }
    return ((data || []) as any[]).map((r) => ({
        id: r.id, orderId: r.order_id, storeName: r.sender_name || 'Loja', storeAddress: r.origin_address || '', store: pos(r.origin_lat, r.origin_lng),
        customerName: r.recipient_name || 'Cliente', address: r.destination_address || '', to: pos(r.destination_lat, r.destination_lng),
        items: r.object_description || '', price: Number(r.offered_price) || 0, km: num(r.distance_km), units: Number(r.delivery_units) || 1, itemsCount: Number(r.items_count) || 1, paymentMethod: r.payment_method || null, cashChangeFor: num(r.cash_change_for),
        enRoute: !!r.driver_en_route, arrived: !!r.driver_arrived_at, started: !!r.ride_started_at, atDoor: !!r.arrived_destination_at, orderStatus: st.get(r.id) ?? null,
    }))
}

export async function fetchOffers(): Promise<DeliveryOffer[]> {
    const { data, error } = await supabase.from('ride_offers')
        .select('id, order_id, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, object_description, offered_price, distance_km, delivery_units, items_count, created_at, status')
        .eq('status', 'pending').not('order_id', 'is', null).gte('created_at', new Date(Date.now() - OFFER_MAX_AGE_MIN * 60_000).toISOString()).order('created_at', { ascending: false }).limit(40)
    if (error) throw error
    const rows = (data || []) as any[]
    const orderIds = rows.map((r) => r.order_id)
    // O nome da loja vem da própria loja da entrega (público)
    const { data: storeRows } = orderIds.length ? await supabase.from('ride_offers').select('id, store_id').in('id', rows.map((r) => r.id)) : { data: [] as any[] }
    const storeIds = Array.from(new Set(((storeRows || []) as any[]).map((r) => r.store_id).filter(Boolean)))
    const { data: stores } = storeIds.length ? await supabase.from('stores').select('id, name').in('id', storeIds) : { data: [] as any[] }
    const nameBy = new Map((stores || []).map((s: any) => [s.id, s.name]))
    const storeOf = new Map(((storeRows || []) as any[]).map((r) => [r.id, nameBy.get(r.store_id) || 'Loja']))
    return rows.map((r) => ({
        id: r.id, orderId: r.order_id, storeName: String(storeOf.get(r.id) || 'Loja'), storeAddress: r.origin_address || '', store: pos(r.origin_lat, r.origin_lng),
        address: r.destination_address || '', to: pos(r.destination_lat, r.destination_lng), items: r.object_description || '',
        price: Number(r.offered_price) || 0, km: num(r.distance_km), units: Number(r.delivery_units) || 1, itemsCount: Number(r.items_count) || 1, createdAt: r.created_at,
    }))
}

export interface DoneToday { id: string; address: string; price: number; customerName: string }
export async function fetchDoneToday(me: string): Promise<DoneToday[]> {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('ride_requests').select('id, destination_address, offered_price, recipient_name, created_at')
        .eq('driver_id', me).eq('status', 'completed').not('order_id', 'is', null).gte('created_at', start.toISOString()).order('created_at', { ascending: false }).limit(60)
    return ((data || []) as any[]).map((r) => ({ id: r.id, address: r.destination_address || '', price: Number(r.offered_price) || 0, customerName: r.recipient_name || 'Cliente' }))
}

/** Aceita a entrega pelo valor oferecido (fixo). O banco recusa se a mochila já está cheia ou se outra pessoa chegou antes. */
export async function acceptOffer(offer: Pick<DeliveryOffer, 'id' | 'price'>, me: string): Promise<void> {
    const { error } = await supabase.from('ride_applications').insert({ ride_request_id: offer.id, applicant_id: me, proposed_price: offer.price })
    if (error) throw new Error(error.hint === 'delivery_capacity_full' || error.hint === 'delivery_capacity_units_full' || /mochila/i.test(error.message) ? error.message : (/duplicate|unique/i.test(error.message) ? 'Você já aceitou esta entrega.' : error.message || 'Não foi possível aceitar.'))
}

const patch = async (ids: string[], fields: Record<string, any>) => {
    const { error } = await supabase.from('ride_requests').update(fields).in('id', ids).eq('status', 'accepted')
    if (error) throw error
}
export async function leaveForStore(ids: string[]) { await patch(ids, { driver_en_route: true, driver_departed_at: new Date().toISOString() }); ids.forEach((i) => notifyRideStatus(i, 'en_route')) }
export async function arriveAtStore(ids: string[]) { await patch(ids, { driver_arrived_at: new Date().toISOString() }); ids.forEach((i) => notifyRideStatus(i, 'arrived')) }
export type PickupResult = { ok: true } | { ok: false; error: 'wrong_code' | 'code_locked'; attemptsLeft: number | null; retryInS: number | null }
/** RETIRADA com o código que a loja informou ao conferir o que entregou: vale para todos os pedidos da saída de uma vez (o banco exige os pedidos PRONTOS) */
export async function pickUpOrders(ids: string[], code: string): Promise<PickupResult> {
    const { data, error } = await supabase.rpc('confirm_pickup', { p_rides: ids, p_code: code.trim() })
    if (error) throw new Error(error.message || 'Não foi possível confirmar a retirada.')
    const r = data as any
    if (r?.ok) { ids.forEach((i) => notifyRideStatus(i, 'started')); return { ok: true } }
    return { ok: false, error: r?.error === 'code_locked' ? 'code_locked' : 'wrong_code', attemptsLeft: r?.attempts_left ?? null, retryInS: r?.retry_in_s ?? null }
}

/** Conversa rápida: manda uma frase pronta ao cliente (só depois da retirada). O servidor confere que a entrega é sua e que o código é uma das frases. */
export async function sendDeliveryMessage(rideId: string, code: string): Promise<void> {
    const { error } = await supabase.rpc('send_delivery_message', { p_ride: rideId, p_code: code })
    if (error) throw new Error(error.message || 'Não foi possível enviar.')
}

/** "Estou no local": avisa o CLIENTE de que o entregador está na porta. O servidor confere que é a sua entrega, que o pedido já foi retirado e que você está a até 150 m do endereço. */
export async function arriveAtDestination(id: string, at: LatLng): Promise<void> {
    const { error } = await supabase.rpc('arrive_at_destination', { p_ride: id, p_lat: at.lat, p_lng: at.lng })
    if (error) throw new Error(error.message || 'Não foi possível avisar o cliente.')
}

/** Conclui UMA entrega: o servidor confere que é a sua, que já saiu da loja e que você está a até 100 m do destino */
export async function completeDelivery(id: string, at: LatLng): Promise<void> {
    const { error } = await supabase.rpc('complete_ride', { p_ride: id, p_lat: at.lat, p_lng: at.lng })
    if (error) throw new Error(error.message || 'Não foi possível concluir.')
    notifyRideStatus(id, 'completed')
}

export async function setCapacity(me: string, n: number): Promise<void> {
    const { error } = await supabase.from('driver_vehicles').update({ delivery_capacity: Math.min(8, Math.max(1, Math.round(n))) }).eq('driver_id', me)
    if (error) throw error
}
/** Quanto cabe em VOLUME (unidades; null = sem limite). O banco confere ao aceitar cada entrega. */
export async function setCapacityUnits(me: string, units: number | null): Promise<void> {
    const v = units == null ? null : Math.min(100, Math.max(0.5, Math.round(units * 2) / 2))
    const { error } = await supabase.from('driver_vehicles').update({ delivery_capacity_units: v }).eq('driver_id', me)
    if (error) throw error
}
export async function setOnline(me: string, on: boolean): Promise<void> {
    const { error } = await supabase.from('driver_pricing').update({ driver_mode_active: on, live_location_sync: on }).eq('driver_id', me)
    if (error) throw error
}

export { itemsList }

export interface MyReview { id: string; rating: number; comment: string | null; at: string; reviewerName: string }
export interface MyReviews { avg: number | null; count: number; list: MyReview[] }

/** As avaliações que o motorista RECEBEU nas corridas (a loja avalia a entrega): nota média, total e as últimas */
export async function fetchMyReviews(me: string): Promise<MyReviews> {
    const [{ data: rows }, { count }, { data: all }] = await Promise.all([
        supabase.from('ride_reviews').select('id, rating, comment, created_at, reviewer_id').eq('reviewee_id', me).order('created_at', { ascending: false }).limit(8),
        supabase.from('ride_reviews').select('id', { count: 'exact', head: true }).eq('reviewee_id', me),
        supabase.from('ride_reviews').select('rating').eq('reviewee_id', me).limit(500),
    ])
    const ids = Array.from(new Set(((rows || []) as any[]).map((r) => r.reviewer_id)))
    const { data: profs } = ids.length ? await supabase.from('profiles').select('id, name').in('id', ids) : { data: [] as any[] }
    const nameBy = new Map(((profs || []) as any[]).map((p) => [p.id, p.name]))
    const ratings = ((all || []) as any[]).map((r) => Number(r.rating)).filter((n) => n > 0)
    return {
        avg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null, count: count || 0,
        list: ((rows || []) as any[]).map((r) => ({ id: r.id, rating: Number(r.rating), comment: r.comment || null, at: r.created_at, reviewerName: String(nameBy.get(r.reviewer_id) || 'A loja') })),
    }
}
