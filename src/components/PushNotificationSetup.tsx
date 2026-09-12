'use client'

import { useEffect, useRef } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useProfile } from '@/app/contexts/ProfileContext'

// Registra o service worker e assina push notifications automaticamente
// para o usuário logado (se ele ainda não decidiu ou já permitiu antes).
export function PushNotificationSetup() {
    const { isSupported, subscribe } = usePushNotifications()
    const { isLoggedIn } = useProfile()
    const attemptedRef = useRef(false)

    useEffect(() => {
        if (!isSupported || !isLoggedIn) return
        if (attemptedRef.current) return
        if (Notification.permission === 'denied') return
        attemptedRef.current = true
        subscribe()
    }, [isSupported, isLoggedIn, subscribe])

    return null
}
