'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'

// Registra o service worker e assina push notifications automaticamente
// para o usuário logado (se ele ainda não decidiu ou já permitiu antes).
export function PushNotificationSetup() {
    const { isSupported, subscribe } = usePushNotifications()
    const attemptedRef = useRef(false)

    useEffect(() => {
        if (!isSupported) return

        const trySubscribe = () => {
            if (attemptedRef.current) return
            if (Notification.permission === 'denied') return
            attemptedRef.current = true
            subscribe()
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) trySubscribe()
        })

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) trySubscribe()
        })

        return () => subscription.unsubscribe()
    }, [isSupported, subscribe])

    return null
}
