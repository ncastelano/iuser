'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
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
    const router = useRouter()

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

    // Toque na notificação nativa (app em segundo plano ou fechado) -> navega
    // pra url mandada no payload (ex: dashboard de pedidos da loja). No
    // navegador quem trata isso é o service worker (public/sw.js).
    useEffect(() => {
        if (!isNative) return

        const listenerPromise = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const url = action.notification?.data?.url
            if (url) router.push(url)
        })

        return () => {
            listenerPromise.then((listener) => listener.remove())
        }
    }, [isNative, router])

    return null
}
