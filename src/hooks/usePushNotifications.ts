// src/hooks/usePushNotifications.ts
'use client'

import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>(
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
    )

    const isSupported = useCallback(() => {
        return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    }, [])

    const subscribe = useCallback(async () => {
        if (!isSupported() || !VAPID_PUBLIC_KEY) return false

        try {
            const registration = await navigator.serviceWorker.register('/sw.js')
            await navigator.serviceWorker.ready

            const result = await Notification.requestPermission()
            setPermission(result)
            if (result !== 'granted') return false

            let subscription = await registration.pushManager.getSubscription()
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                })
            }

            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return false

            const json = subscription.toJSON()
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
            })

            return true
        } catch (err) {
            console.error('[usePushNotifications] erro ao assinar push:', err)
            return false
        }
    }, [isSupported])

    return { permission, isSupported: isSupported(), subscribe }
}
