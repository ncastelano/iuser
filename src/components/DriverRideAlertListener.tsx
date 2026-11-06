// components/DriverRideAlertListener.tsx
'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { playNotificationSound } from '@/lib/rideAlertSound'
import { ridesAcceptableForVehicleKind, rideAcceptsAnyVehicle, kindForRideType, type VehicleKind, type VehicleType } from '@/lib/rideVehicle'
import { computeRideTariffs, type RideTariffSource } from '@/lib/rideTariffs'
import { PLATFORM_DEFAULT_PRICING_BY_VEHICLE, computePickupFee } from '@/lib/driverPricing'
import { haversineKm } from '@/lib/mapboxRoute'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { NewRideAlertCard, type AlertOption } from '@/components/NewRideAlertCard'
import { isAlertRedundant } from '@/lib/alertSuppression'
import { effectiveTimeRate, loadDefaultMinHourly, loadEarningGoal, loadMinRideFare, loadRideMinimum, platformFloor, round2, timeFare } from '@/modules/negotiation'

const rideKindOf = (ride: { vehicle_type?: string | null }) => kindForRideType((ride.vehicle_type as VehicleType) || 'carro')

// Global, montado em providers.tsx: com o modo motorista ligado, toca o som e
// avisa (toast com atalho) quando um pedido de corrida novo entra, em QUALQUER
// página do app. O push (mesmo com o app fechado) é enviado pelo servidor; isto
// cobre o app aberto. Em /aceitar-corridas e em /entregas a própria página já avisa.
export function DriverRideAlertListener() {
    const { userId } = useProfile()
    const pathname = usePathname()
    const router = useRouter()
    const pathRef = useRef(pathname)
    pathRef.current = pathname

    useEffect(() => {
        if (!userId) return
        let cancelled = false
        let channel: ReturnType<typeof supabase.channel> | null = null

        const setup = async () => {
            const [{ data: pricing }, { data: vehicleRows }] = await Promise.all([
                supabase.from('driver_pricing').select('driver_mode_active, alert_sound_enabled, pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado, live_lat, live_lng, live_updated_at').eq('driver_id', userId).maybeSingle(),
                supabase.from('driver_vehicles').select('vehicle_kind').eq('driver_id', userId),
            ])
            if (cancelled || !pricing?.driver_mode_active) return
            await loadPlatformTariffs(supabase)
            const [minPerMinute, defaultHourly, goal] = await Promise.all([loadRideMinimum(), loadDefaultMinHourly(), loadEarningGoal(userId), loadMinRideFare()])
            const ownMinHourly = goal.isDefault ? null : goal.minHourly

            // Só avisa de corridas que o veículo cadastrado do motorista atende —
            // sem isso, um motorista de moto/bicicleta era avisado de toda corrida
            // nova, mesmo as que precisam de carro (ex: mais de uma pessoa).
            const vehicleKinds = (vehicleRows || []).map((v) => v.vehicle_kind as VehicleKind)
            if (vehicleKinds.length === 0) vehicleKinds.push('carro')
            const acceptableVehicleTypes = new Set(vehicleKinds.flatMap((k) => ridesAcceptableForVehicleKind(k)))

            channel = supabase
                .channel(`driver-new-ride-alert-${userId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_offers' }, (payload) => {
                    const ride = payload.new as RideTariffSource & { id: string; requester_id?: string; status?: string; origin_address?: string; destination_address?: string; offered_price?: number | null }
                    if (ride.requester_id === userId) return
                    if (ride.status && ride.status !== 'pending') return
                    if (ride.vehicle_type && !rideAcceptsAnyVehicle(ride.vehicle_type) && !acceptableVehicleTypes.has(ride.vehicle_type)) return
                    if (isAlertRedundant('new_ride', pathRef.current)) return   // a página já mostra as corridas/entregas abertas (lib/alertSuppression)
                    if (pricing.alert_sound_enabled !== false) playNotificationSound('new_ride')
                    const short = (a?: string) => (a || '').split(',')[0]
                    const description = ride.origin_address ? `${short(ride.origin_address)} → ${short(ride.destination_address)}` : undefined
                    // Card na própria notificação: as tarifas que o motorista TEM (Tarifa iUser, Por km se for dele, Por tempo — a dele ou o padrão do iUser), a cor de
                    // como a corrida paga e o candidatar por deslize. Os valores levam o deslocamento até a partida quando a posição ao vivo é recente (mesma conta da
                    // lista) e NUNCA ficam abaixo do mínimo de uma corrida (R$ 8,00) nem de minutos × mínimo por minuto.
                    const { platformPrice: platTrip, customPrice: kmTrip, preferredPrice, timeRate, timeExtras, customShape } = computeRideTariffs(ride, pricing)
                    const r = ride as RideTariffSource & { duration_min?: number | null; origin_lat?: number | null; origin_lng?: number | null; passenger_offer?: number | null }
                    const tripMin = r.duration_min != null ? Number(r.duration_min) : r.distance_km != null ? (Number(r.distance_km) / 40) * 60 : null
                    const liveFresh = pricing.live_lat != null && pricing.live_lng != null && pricing.live_updated_at && Date.now() - new Date(pricing.live_updated_at).getTime() < 30 * 60_000
                    const pickupKm = liveFresh && r.origin_lat != null && r.origin_lng != null
                        ? haversineKm([Number(pricing.live_lng), Number(pricing.live_lat)], [Number(r.origin_lng), Number(r.origin_lat)]) * 1.3
                        : null
                    const minutes = tripMin != null ? tripMin + (pickupKm != null ? (pickupKm / 40) * 60 : 0) : null
                    const floor = ride.offered_price != null ? 0 : platformFloor(minutes, minPerMinute)
                    const platShape = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[rideKindOf(ride)]
                    const platformPrice = round2(Math.max(platTrip + (pickupKm != null ? computePickupFee(platShape, pickupKm) : 0), floor))
                    const customPrice = kmTrip != null ? round2(Math.max(kmTrip + (pickupKm != null && customShape ? computePickupFee(customShape, pickupKm) : 0), floor)) : null
                    const ownRate = timeRate != null && timeRate > 0 ? timeRate : null
                    const rate = effectiveTimeRate(ownRate, defaultHourly)
                    const timeBase = ride.offered_price == null ? timeFare(minutes, rate, timeExtras) : null
                    const timePrice = timeBase != null ? round2(Math.max(timeBase, floor)) : null
                    const passengerOffer = ride.offered_price == null && r.passenger_offer != null ? Number(r.passenger_offer) : null
                    const options: AlertOption[] = [
                        ...(passengerOffer != null ? [{ key: 'offer' as const, label: 'Oferta', value: passengerOffer, tag: 'do passageiro' }] : []),
                        { key: 'platform' as const, label: 'Tarifa iUser', value: platformPrice },
                        ...(customPrice != null ? [{ key: 'km' as const, label: 'Por km', value: customPrice, tag: 'sua tarifa' }] : []),
                        ...(timePrice != null ? [{ key: 'time' as const, label: 'Por tempo', value: timePrice, tag: ownRate ? 'sua tarifa' : 'padrão iUser' }] : []),
                    ]
                    toast.custom((toastId) => (
                        <NewRideAlertCard
                            rideId={ride.id}
                            originAddress={ride.origin_address}
                            destinationAddress={ride.destination_address}
                            options={options}
                            platformPrice={platformPrice}
                            offeredPrice={ride.offered_price != null ? Number(ride.offered_price) : null}
                            minutes={minutes}
                            tripMin={tripMin}
                            tripKm={r.distance_km != null ? Number(r.distance_km) : null}
                            ownMinHourly={ownMinHourly}
                            floorPerHour={minPerMinute * 60}
                            onClose={() => toast.dismiss(toastId)}
                            onDetails={() => { toast.dismiss(toastId); router.push(`/aceitar-corridas?ride=${ride.id}`) }}
                        />
                    ), { duration: 30000, title: 'Nova corrida disponível!', icon: '🚗' })

                    // Além do toast (só existe enquanto o app está aberto), dispara
                    // também a notificação na barra do sistema na hora, direto pelo
                    // navegador - não depende do push do servidor ter chegado (rede,
                    // fila etc.), e usa a MESMA tag da corrida pra não duplicar caso
                    // o push do servidor também chegue. Quem monta a notificação (com
                    // os botões de valor) é o service worker, o mesmo código do push.
                    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && Notification.permission === 'granted') {
                        navigator.serviceWorker.ready.then((registration) => {
                            const payload = {
                                title: 'Nova corrida disponível!',
                                body: description || '',
                                url: `/aceitar-corridas/mapa?ride=${ride.id}`,
                                tag: `new-ride-${ride.id}`,
                                urgent: true,
                                rideAlert: { rideId: ride.id, platformPrice, customPrice, preferredPrice: Math.max(preferredPrice, floor), offeredPrice: ride.offered_price != null ? Number(ride.offered_price) : null },
                            }
                            if (registration.active) registration.active.postMessage({ type: 'show-ride-alert', payload })
                        }).catch(() => {})
                    }
                })
                .subscribe()
        }
        setup()

        return () => {
            cancelled = true
            if (channel) supabase.removeChannel(channel)
        }
    }, [userId, router, pathname])

    return null
}
