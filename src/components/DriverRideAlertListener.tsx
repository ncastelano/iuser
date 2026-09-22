// components/DriverRideAlertListener.tsx
'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { playNotificationSound } from '@/lib/rideAlertSound'
import { ridesAcceptableForVehicleKind, rideAcceptsAnyVehicle, type VehicleKind, type VehicleType } from '@/lib/rideVehicle'

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
                supabase.from('driver_pricing').select('driver_mode_active, alert_sound_enabled').eq('driver_id', userId).maybeSingle(),
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
                    const ride = payload.new as { requester_id?: string; status?: string; origin_address?: string; destination_address?: string; vehicle_type?: VehicleType }
                    if (ride.requester_id === userId) return
                    if (ride.status && ride.status !== 'pending') return
                    if (ride.vehicle_type && !rideAcceptsAnyVehicle(ride.vehicle_type) && !acceptableVehicleTypes.has(ride.vehicle_type)) return
                    if (pathRef.current?.startsWith('/aceitar-corridas')) return
                    if (pricing.alert_sound_enabled !== false) playNotificationSound('new_ride')
                    const short = (a?: string) => (a || '').split(',')[0]
                    toast.info('Nova corrida disponível!', {
                        description: ride.origin_address ? `${short(ride.origin_address)} → ${short(ride.destination_address)}` : undefined,
                        action: { label: 'Ver', onClick: () => router.push('/aceitar-corridas') },
                        duration: 10000,
                    })
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
