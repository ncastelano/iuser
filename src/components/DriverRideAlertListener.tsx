// components/DriverRideAlertListener.tsx
'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { playNotificationSound } from '@/lib/rideAlertSound'

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
            const { data: pricing } = await supabase
                .from('driver_pricing')
                .select('driver_mode_active, alert_sound_enabled')
                .eq('driver_id', userId)
                .maybeSingle()
            if (cancelled || !pricing?.driver_mode_active) return

            channel = supabase
                .channel(`driver-new-ride-alert-${userId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_requests' }, (payload) => {
                    const ride = payload.new as { requester_id?: string; status?: string; origin_address?: string; destination_address?: string }
                    if (ride.requester_id === userId) return
                    if (ride.status && ride.status !== 'pending') return
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
