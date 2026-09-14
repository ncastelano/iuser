// src/hooks/useNativePushNotifications.ts
'use client'

import { useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '@/lib/supabase/client'

// Contraparte nativa do usePushNotifications (Web Push): registra o app pra
// receber push via FCM (Android) ou APNs (iOS) quando rodando empacotado
// pelo Capacitor, e manda o token pro backend guardar.
export function useNativePushNotifications() {
    const isSupported = useCallback(() => Capacitor.isNativePlatform(), [])

    const subscribe = useCallback(async () => {
        if (!Capacitor.isNativePlatform()) return false

        try {
            const permStatus = await PushNotifications.checkPermissions()
            let granted = permStatus.receive === 'granted'

            if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
                const result = await PushNotifications.requestPermissions()
                granted = result.receive === 'granted'
            }

            if (!granted) return false

            const tokenPromise = new Promise<string | null>((resolve) => {
                PushNotifications.addListener('registration', (token) => resolve(token.value))
                PushNotifications.addListener('registrationError', () => resolve(null))
            })

            await PushNotifications.register()
            const deviceToken = await tokenPromise
            if (!deviceToken) return false

            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return false

            const platform = Capacitor.getPlatform() as 'ios' | 'android'

            await fetch('/api/push/register-native-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ deviceToken, platform }),
            })

            return true
        } catch (err) {
            console.error('[useNativePushNotifications] erro ao registrar push nativo:', err)
            return false
        }
    }, [])

    return { isSupported: isSupported(), subscribe }
}
