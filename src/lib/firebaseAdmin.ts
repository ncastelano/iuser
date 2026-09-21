// lib/firebaseAdmin.ts
// Server-only: Firebase Admin SDK, usado pra enviar push notification nativo
// (Android via FCM; iOS quando a chave APNs estiver configurada no projeto
// Firebase). Never import this from a 'use client' file.
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY

function getFirebaseApp() {
    if (!serviceAccountKey) return null
    if (getApps().length > 0) return getApps()[0]
    const serviceAccount = JSON.parse(serviceAccountKey)
    return initializeApp({ credential: cert(serviceAccount) })
}

export function isFirebasePushConfigured() {
    return !!serviceAccountKey
}

export async function sendFcmToTokens(
    tokens: string[],
    notification: { title: string; body: string; url?: string; tag?: string; urgent?: boolean }
): Promise<{ successCount: number; invalidTokens: string[] }> {
    const app = getFirebaseApp()
    if (!app || tokens.length === 0) return { successCount: 0, invalidTokens: [] }

    const messaging = getMessaging(app)
    const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
            title: notification.title,
            body: notification.body,
        },
        data: {
            url: notification.url || '/',
            tag: notification.tag || '',
        },
        // Android: prioridade alta + som padrão do sistema, pra tocar mesmo com o app fechado.
        android: {
            priority: 'high',
            notification: {
                sound: 'default',
                ...(notification.urgent ? { defaultVibrateTimings: true, priority: 'max' as const } : {}),
            },
        },
    })

    const invalidTokens: string[] = []
    response.responses.forEach((r, i) => {
        if (!r.success && (r.error?.code === 'messaging/registration-token-not-registered' || r.error?.code === 'messaging/invalid-registration-token')) {
            invalidTokens.push(tokens[i])
        }
    })

    return { successCount: response.successCount, invalidTokens }
}
