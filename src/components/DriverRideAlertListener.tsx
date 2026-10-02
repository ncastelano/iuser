// components/DriverRideAlertListener.tsx
'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { playNotificationSound } from '@/lib/rideAlertSound'
import { ridesAcceptableForVehicleKind, rideAcceptsAnyVehicle, type VehicleKind } from '@/lib/rideVehicle'
import { computeRideTariffs, type RideTariffSource } from '@/lib/rideTariffs'
import { NewRideAlertCard } from '@/components/NewRideAlertCard'

// Global, montado em providers.tsx: com o modo motorista ligado, toca o som e
// avisa (toast com atalho) quando um pedido de corrida novo entra, em QUALQUER
// página do app. O push (mesmo com o app fechado) é enviado pelo servidor; isto
// cobre o app aberto. Em /aceitar-corridas a própria página já avisa.
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
                supabase.from('driver_pricing').select('driver_mode_active, alert_sound_enabled, pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado').eq('driver_id', userId).maybeSingle(),
                supabase.from('driver_vehicles').select('vehicle_kind').eq('driver_id', userId),
            ])
            if (cancelled || !pricing?.driver_mode_active) return

            // Só avisa de corridas que o veículo cadastrado do motorista atende —
            // sem isso, um motorista de moto/bicicleta era avisado de toda corrida
            // nova, mesmo as que precisam de carro (ex: mais de uma pessoa).
            const vehicleKinds = (vehicleRows || []).map((v) => v.vehicle_kind as VehicleKind)
            if (vehicleKinds.length === 0) vehicleKinds.push('carro')
            const acceptableVehicleTypes = new Set(vehicleKinds.flatMap((k) => ridesAcceptableForVehicleKind(k)))

            channel = supabase
                .channel(`driver-new-ride-alert-${userId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_requests' }, (payload) => {
                    const ride = payload.new as RideTariffSource & { id: string; requester_id?: string; status?: string; origin_address?: string; destination_address?: string; offered_price?: number | null }
                    if (ride.requester_id === userId) return
                    if (ride.status && ride.status !== 'pending') return
                    if (ride.vehicle_type && !rideAcceptsAnyVehicle(ride.vehicle_type) && !acceptableVehicleTypes.has(ride.vehicle_type)) return
                    if (pathRef.current?.startsWith('/aceitar-corridas')) return
                    if (pricing.alert_sound_enabled !== false) playNotificationSound('new_ride')
                    const short = (a?: string) => (a || '').split(',')[0]
                    const description = ride.origin_address ? `${short(ride.origin_address)} → ${short(ride.destination_address)}` : undefined
                    // Card na própria notificação com Tarifa iUser / Minha tarifa /
                    // editar, pra o motorista já se candidatar sem abrir a página.
                    const { platformPrice, customPrice, preferredPrice } = computeRideTariffs(ride, pricing)
                    toast.custom((toastId) => (
                        <NewRideAlertCard
                            rideId={ride.id}
                            originAddress={ride.origin_address}
                            destinationAddress={ride.destination_address}
                            platformPrice={platformPrice}
                            customPrice={customPrice}
                            offeredPrice={ride.offered_price != null ? Number(ride.offered_price) : null}
                            onClose={() => toast.dismiss(toastId)}
                            onOpenMap={() => { toast.dismiss(toastId); router.push(`/aceitar-corridas/mapa?ride=${ride.id}`) }}
                            onOpenList={() => { toast.dismiss(toastId); router.push('/aceitar-corridas') }}
                        />
                    ), { duration: 30000 })

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
                                rideAlert: { rideId: ride.id, platformPrice, customPrice, preferredPrice, offeredPrice: ride.offered_price != null ? Number(ride.offered_price) : null },
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
