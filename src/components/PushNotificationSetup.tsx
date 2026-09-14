'use client'

import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useNativePushNotifications } from '@/hooks/useNativePushNotifications'
import { useProfile } from '@/app/contexts/ProfileContext'

// Registra push notifications automaticamente para o usuário logado (se ele
// ainda não decidiu ou já permitiu antes) — Web Push no navegador normal,
// ou push nativo (FCM/APNs) quando o app roda empacotado pelo Capacitor.
export function PushNotificationSetup() {
    const web = usePushNotifications()
    const native = useNativePushNotifications()
    const { isLoggedIn } = useProfile()
    const attemptedRef = useRef(false)

    const isNative = Capacitor.isNativePlatform()
    const isSupported = isNative ? native.isSupported : web.isSupported

    useEffect(() => {
        if (!isSupported || !isLoggedIn) return
        if (attemptedRef.current) return
        if (!isNative && Notification.permission === 'denied') return
        attemptedRef.current = true
        if (isNative) native.subscribe()
        else web.subscribe()
    }, [isSupported, isLoggedIn, isNative, native, web])

    return null
}
