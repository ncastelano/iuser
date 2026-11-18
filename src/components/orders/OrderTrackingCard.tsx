// src/components/orders/OrderTrackingCard.tsx
//
// ONDE ESTÁ O ENTREGADOR (cliente; 18/11/2026): enquanto a entrega está em andamento, o nome e o veículo de quem vem, a etapa ("indo buscar na loja",
// "a caminho de você", "na sua porta"), quanto falta (linha reta × 1,3 a ~30 km/h, a mesma conta da loja) e um mapa pequeno com ele e o seu endereço.
// Antes da retirada a posição vem arredondada (~330 m); depois, a exata. Tudo de get_order_tracking (só o comprador do pedido; migration 20261130000077).
'use client'

import { useEffect, useState } from 'react'
import { Bike, Car, MapPin, Navigation } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { fetchOrderTracking, type OrderTracking } from '@/modules/order-payment'
import { etaMinutes, haversineKm } from '@/modules/deliveries/domain'

const cache = new Map<string, { at: number; t: OrderTracking | null }>()
const STAGE: Record<OrderTracking['stage'], string> = { to_store: 'indo buscar o seu pedido na loja', at_store: 'na loja, pegando o seu pedido', delivering: 'a caminho de você', at_door: 'na sua porta' }

export default function OrderTrackingCard({ orderId, enabled }: { orderId: string; enabled: boolean }) {
    const { colors } = useTheme()
    const [t, setT] = useState<OrderTracking | null>(() => cache.get(orderId)?.t ?? null)
    useEffect(() => {
        if (!enabled) return
        let alive = true
        const load = async () => {
            const hit = cache.get(orderId)
            if (hit && Date.now() - hit.at < 5000) { if (alive) setT(hit.t); return }
            const v = await fetchOrderTracking(orderId)
            cache.set(orderId, { at: Date.now(), t: v })
            if (alive) setT(v)
        }
        load()
        const iv = setInterval(load, 10000)
        return () => { alive = false; clearInterval(iv) }
    }, [orderId, enabled])
    if (!enabled || !t) return null

    const here = t.lat != null && t.lng != null ? { lat: t.lat, lng: t.lng } : null
    // a caminho da loja: o tempo até a loja; depois: até você
    const target = t.stage === 'delivering' || t.stage === 'at_door' ? (t.destLat != null && t.destLng != null ? { lat: t.destLat, lng: t.destLng } : null) : (t.storeLat != null && t.storeLng != null ? { lat: t.storeLat, lng: t.storeLng } : null)
    const mins = here && target && t.stage !== 'at_door' && t.stage !== 'at_store' ? etaMinutes(haversineKm(here, target)) : null
    const Icon = t.vehicleKind === 'carro' ? Car : Bike
    const vehicle = [t.vehicleModel, t.vehicleColor].filter(Boolean).join(' · ')
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const dest = t.destLat != null && t.destLng != null ? `pin-s+ef4444(${t.destLng},${t.destLat})` : null
    const drv = here ? `pin-s-${t.vehicleKind === 'carro' ? 'car' : 'scooter'}+16a34a(${here.lng},${here.lat})` : null
    const map = token && (dest || drv) ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${[drv, dest].filter(Boolean).join(',')}/auto/600x220@2x?padding=48&access_token=${token}` : null

    return (
        <div className="mx-3.5 mt-3 rounded-2xl overflow-hidden" style={{ background: '#16a34a10', border: '1px solid #16a34a40' }}>
            {map && t.stage !== 'at_door' && (
                <div className="relative">
                    <img src={map} alt="Onde está o entregador" className="w-full h-[130px] object-cover" loading="lazy" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
                    <span className="absolute bottom-1 right-1.5 text-[9px] px-1 rounded bg-white/80 text-gray-700">© Mapbox © OpenStreetMap</span>
                </div>
            )}
            <div className="p-3 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#16a34a' }}>{t.stage === 'at_door' ? <MapPin size={18} /> : <Icon size={18} />}</span>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>{t.driverName} está {STAGE[t.stage]}</p>
                    <p className="text-[11.5px] mt-0.5 truncate" style={{ color: colors.textSecondary }}>
                        {vehicle || 'Entregador do iUser'}{!here && t.stage !== 'at_door' ? ' · posição ainda não chegou' : ''}
                    </p>
                </div>
                {mins != null && (
                    <span className="flex-shrink-0 text-right">
                        <span className="flex items-center gap-1 text-[15px] font-black" style={{ color: '#16a34a' }}><Navigation size={13} />~{mins} min</span>
                        <span className="block text-[10px] font-bold" style={{ color: colors.textSecondary }}>{t.stage === 'delivering' ? 'até você' : 'até a loja'}</span>
                    </span>
                )}
            </div>
        </div>
    )
}
