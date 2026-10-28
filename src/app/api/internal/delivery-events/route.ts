// app/api/internal/delivery-events/route.ts
//
// Fila de avisos da entrega iUser. O banco (pg_net) chama esta rota depois de gravar um evento;
// ela NÃO usa nada do corpo da chamada: só reivindica os eventos pendentes da tabela
// order_delivery_events (atomicamente) e manda os pushes. Chamar à toa não faz mal: sem evento
// pendente não acontece nada.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'
import { notifyDriversOfRide } from '@/lib/notifyDrivers'
import { reajustPushBody, reservationNoticeText } from '@/modules/delivery-search'

const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export async function POST() {
    const { data: events } = await supabaseAdmin
        .from('order_delivery_events')
        .update({ processed_at: new Date().toISOString() })
        .is('processed_at', null)
        .select('id, dispatch_id, kind, old_radius, new_radius, round_id, data')
        .limit(50)
    if (!events || events.length === 0) return NextResponse.json({ processed: 0 })

    for (const ev of events) {
        try {
            const { data: d } = await supabaseAdmin
                .from('order_delivery_dispatches')
                .select('id, customer_id, store_id, order_id, ride_request_id, final_freight, status, flow_version')
                .eq('id', ev.dispatch_id)
                .maybeSingle()
            if (!d) continue

            // V2 (Etapa 2.6): reserva do motorista, liberações, cancelamentos e "sem entregador". Cada pessoa recebe só o seu texto;
            // o evento é reivindicado uma única vez (sem duplicar) e nada disto mexe em dinheiro.
            if (ev.kind === 'reservation_notice') {
                const data = (ev.data || {}) as { reason?: string; mode?: string; driver_id?: string | null; frozen_freight?: number; amount?: number }
                const [{ data: order }, { data: store }, { data: cfg }] = await Promise.all([
                    supabaseAdmin.from('orders').select('total_amount').eq('id', d.order_id).maybeSingle(),
                    supabaseAdmin.from('stores').select('owner_id').eq('id', d.store_id).maybeSingle(),
                    supabaseAdmin.from('delivery_dispatch_settings').select('reservation_timeout_minutes').eq('id', true).maybeSingle(),
                ])
                const text = reservationNoticeText(data.reason || '', data.mode, { total: data.reason === 'driver_payment_reported' && data.amount != null ? Number(data.amount) : order ? Number(order.total_amount) : null, minutes: cfg?.reservation_timeout_minutes ?? null })
                const tag = `delivery-notice-${ev.id}`
                if (text.customer && d.customer_id) await sendPushToUser(d.customer_id, { ...text.customer, url: '/carrinho?aba=pedidos', tag: `${tag}-c` })
                if (text.driver && data.driver_id) await sendPushToUser(data.driver_id, { ...text.driver, url: '/entregas', tag: `${tag}-d` })
                if (text.store && store?.owner_id) await sendPushToUser(store.owner_id, { ...text.store, tag: `${tag}-s` })
                continue
            }

            if (ev.kind === 'delivered') {
                const { data: store } = await supabaseAdmin.from('stores').select('owner_id, name').eq('id', d.store_id).maybeSingle()
                if (d.customer_id) {
                    await sendPushToUser(d.customer_id, {
                        title: 'Seu pedido foi entregue!',
                        body: store?.name ? `A entrega do pedido de ${store.name} foi concluída.` : 'A entrega foi concluída.',
                        url: '/carrinho?aba=pedidos',
                        tag: `delivery-done-${d.id}`,
                    })
                }
                if (store?.owner_id) {
                    await sendPushToUser(store.owner_id, {
                        title: 'Entrega concluída',
                        body: 'O motorista entregou o pedido e ele foi finalizado.',
                        tag: `delivery-done-store-${d.id}`,
                    })
                }
                continue
            }

            if (d.status !== 'searching' || !d.ride_request_id) continue

            // V2: acima do limite automático a busca PAROU e o cliente decide um NOVO LIMITE (não é pagamento). Só este aviso ao cliente:
            // os aumentos automáticos dentro do limite nunca incomodam o cliente.
            if (ev.kind === 'reajust_requested') {
                const { data: auth } = await supabaseAdmin
                    .from('delivery_reajust_authorizations')
                    .select('id, estimated_freight, current_offer, requested_limit')
                    .eq('dispatch_id', d.id)
                    .eq('status', 'pending')
                    .maybeSingle()
                if (auth && d.customer_id) {
                    await sendPushToUser(d.customer_id, {
                        title: 'Ainda não encontramos um entregador',
                        body: reajustPushBody({ estimatedFreight: Number(auth.estimated_freight), currentOffer: Number(auth.current_offer), requestedLimit: Number(auth.requested_limit) }),
                        url: '/carrinho?aba=pedidos',
                        tag: `delivery-reajust-${auth.id}`,
                        urgent: true,
                    })
                }
                continue
            }

            // Proposta de aumento: o cliente decide
            if (ev.kind === 'tick' && ev.round_id && d.customer_id) {
                const { data: round } = await supabaseAdmin.from('order_delivery_rounds').select('final_freight, status').eq('id', ev.round_id).maybeSingle()
                if (round?.status === 'pending_customer') {
                    await sendPushToUser(d.customer_id, {
                        title: 'Ainda não encontramos um entregador',
                        body: `Podemos aumentar a entrega de ${brl(d.final_freight)} para ${brl(round.final_freight)} para ampliar a busca? Toque para decidir.`,
                        url: '/carrinho?aba=pedidos',
                        tag: `delivery-increase-${d.id}`,
                        urgent: true,
                    })
                }
            }

            // Motoristas: raio ampliado (só o anel novo) ou valor aumentado (todo o raio, valor novo)
            const [{ data: ride }, { data: store }] = await Promise.all([
                supabaseAdmin.from('ride_requests').select('id, requester_id, vehicle_type, origin_address, destination_address, offered_price, origin_lat, origin_lng, visible_radius_km, status').eq('id', d.ride_request_id).maybeSingle(),
                supabaseAdmin.from('stores').select('store_lat, store_lng').eq('id', d.store_id).maybeSingle(),
            ])
            if (!ride || ride.status !== 'pending' || store?.store_lat == null || store?.store_lng == null) continue
            const notified = await notifyDriversOfRide({
                id: ride.id,
                requester_id: ride.requester_id,
                vehicle_type: ride.vehicle_type,
                origin_address: ride.origin_address,
                destination_address: ride.destination_address,
                offered_price: ride.offered_price,
                radiusKm: Number(ride.visible_radius_km),
                originLat: store.store_lat,
                originLng: store.store_lng,
                // raio ampliado sem mudar o valor: só o anel novo; valor mudou (ou rodada 1): todo o raio
                requirePayoutPix: d.flow_version === 2,
                // fim da janela dos favoritos: avisa os demais motoristas do raio inteiro (os favoritos já foram avisados primeiro)
                skipFavorites: ev.kind === 'favorites_window_ended',
                innerRadiusKm:
                    ev.kind === 'favorites_window_ended' ? null
                    : ev.kind === 'tick' && ev.old_radius != null ? Number(ev.old_radius)
                    : ev.kind === 'round_started' && ev.old_radius != null && !(ev.data as { price_changed?: boolean } | null)?.price_changed ? Number(ev.old_radius)
                    : null,
            })
            // auditoria: quantos motoristas foram avisados nesta rodada (não muda a busca)
            await supabaseAdmin.rpc('record_delivery_round_notified', { p_dispatch: d.id, p_count: notified || 0 })
        } catch (err) {
            console.error('[delivery-events] falha no evento', ev.id, err)
        }
    }
    return NextResponse.json({ processed: events.length })
}
