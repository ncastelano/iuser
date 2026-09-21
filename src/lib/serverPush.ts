// lib/serverPush.ts
// Server-only: manda notificação push pra um usuário por todos os canais que
// ele tiver cadastrado — Web Push (navegador) e push nativo (FCM/APNs, app
// instalado). Centraliza o que antes cada rota de /api/push/send-* duplicava.
import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendFcmToTokens, isFirebasePushConfigured } from '@/lib/firebaseAdmin'

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const vapidSubject = appUrl.startsWith('https://') ? appUrl : 'mailto:ncastelano@gmail.com'

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

export interface PushPayload {
    title: string
    body: string
    url?: string
    tag?: string
    /** Aviso que não pode passar batido (corrida nova, motorista chegando): fica na tela e vibra mais. */
    urgent?: boolean
}

// Manda pra todos os canais (web + nativo) cadastrados pro user_id, em
// paralelo. Sempre resolve — cada canal falha isoladamente.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number }> {
    const [webResult, nativeResult] = await Promise.allSettled([
        sendWebPush(userId, payload),
        sendNativePush(userId, payload),
    ])

    const sentWeb = webResult.status === 'fulfilled' ? webResult.value : 0
    const sentNative = nativeResult.status === 'fulfilled' ? nativeResult.value : 0

    if (webResult.status === 'rejected') console.error('[serverPush] erro no envio web:', webResult.reason)
    if (nativeResult.status === 'rejected') console.error('[serverPush] erro no envio nativo:', nativeResult.reason)

    return { sent: sentWeb + sentNative }
}

async function sendWebPush(userId: string, payload: PushPayload): Promise<number> {
    if (!vapidPublicKey || !vapidPrivateKey) return 0

    const { data: subscriptions, error } = await supabaseAdmin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId)

    if (error) throw error
    if (!subscriptions || subscriptions.length === 0) return 0

    const body = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || '/',
        tag: payload.tag,
        urgent: !!payload.urgent,
    })

    const results = await Promise.allSettled(
        subscriptions.map((sub) =>
            webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                body
            ).catch((err) => {
                if (err?.statusCode === 404 || err?.statusCode === 410) {
                    return supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
                }
                throw err
            })
        )
    )

    return results.filter((r) => r.status === 'fulfilled').length
}

async function sendNativePush(userId: string, payload: PushPayload): Promise<number> {
    if (!isFirebasePushConfigured()) return 0

    const { data: tokens, error } = await supabaseAdmin
        .from('native_push_tokens')
        .select('token')
        .eq('user_id', userId)
        .eq('platform', 'android')

    if (error) throw error
    if (!tokens || tokens.length === 0) return 0

    const { successCount, invalidTokens } = await sendFcmToTokens(
        tokens.map((t) => t.token),
        payload
    )

    if (invalidTokens.length > 0) {
        await supabaseAdmin.from('native_push_tokens').delete().in('token', invalidTokens)
    }

    return successCount
}
