'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'

// Global, montado em providers.tsx: mantém a localização ao vivo do motorista
// sendo enviada pro banco (driver_pricing.live_lat/lng) sempre que
// "Sincronização para motorista" está ativada — não importa em qual página
// do app ele esteja (Definir local, o dialog de corrida aceita, ou qualquer
// outra), o comportamento é sempre o mesmo.
export function DriverLiveLocationBroadcaster() {
    const userIdRef = useRef<string | null>(null)
    const syncOnRef = useRef(false)
    const watchIdRef = useRef<number | null>(null)

    useEffect(() => {
        let cancelled = false

        const stopWatch = () => {
            if (watchIdRef.current != null) {
                navigator.geolocation.clearWatch(watchIdRef.current)
                watchIdRef.current = null
            }
        }

        const startWatch = (userId: string) => {
            if (watchIdRef.current != null || !navigator.geolocation) return
            watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    supabase
                        .from('driver_pricing')
                        .update({
                            live_lat: pos.coords.latitude,
                            live_lng: pos.coords.longitude,
                            live_updated_at: new Date().toISOString(),
                        })
                        .eq('driver_id', userId)
                        .then(() => {})
                },
                () => { /* sem permissão: fica sem posição ao vivo até liberar */ },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
            )
        }

        const tick = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (cancelled) return

            if (!user) {
                userIdRef.current = null
                syncOnRef.current = false
                stopWatch()
                return
            }
            userIdRef.current = user.id

            const { data } = await supabase
                .from('driver_pricing')
                .select('live_location_sync')
                .eq('driver_id', user.id)
                .maybeSingle()
            if (cancelled) return

            const syncOn = !!data?.live_location_sync
            if (syncOn !== syncOnRef.current) {
                syncOnRef.current = syncOn
                if (syncOn) startWatch(user.id)
                else stopWatch()
            }
        }

        tick()
        const poll = setInterval(tick, 10000)

        return () => {
            cancelled = true
            clearInterval(poll)
            stopWatch()
        }
    }, [])

    return null
}
