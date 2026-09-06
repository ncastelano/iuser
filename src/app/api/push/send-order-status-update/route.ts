// app/api/push/send-order-status-update/route.ts
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase/admin'

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const vapidSubject = appUrl.startsWith('https://') ? appUrl : 'mailto:ncastelano@gmail.com'

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

const STATUS_MESSAGES: Record<string, string> = {
    preparing: 'Seu pedido está em preparo!',
    ready: 'Seu pedido está pronto!',
    paid: 'Seu pedido foi finalizado!',
}

export async function POST(req: Request) {
    try {
        if (!vapidPublicKey || !vapidPrivateKey) {
            console.error('VAPID keys não configuradas')
            return NextResponse.json({ error: 'Push não configurado' }, { status: 500 })
        }

        const authHeader = req.headers.get('authorization') || ''
        const token = authHeader.replace('Bearer ', '')
        if (!token) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { checkoutId, status } = await req.json()
        if (!checkoutId || !status) {
            return NextResponse.json({ error: 'checkoutId e status são obrigatórios' }, { status: 400 })
        }

        const body = STATUS_MESSAGES[status]
        if (!body) {
            return NextResponse.json({ success: true, skipped: true })
        }

        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, store_id, buyer_id')
            .eq('checkout_id', checkoutId)
            .limit(1)
            .single()

        if (orderError || !order) {
            return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
        }

        const { data: store, error: storeError } = await supabaseAdmin
            .from('stores')
            .select('owner_id, name')
            .eq('id', order.store_id)
            .single()

        if (storeError || !store) {
            return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
        }

        // Só o dono da loja pode disparar a atualização de status do pedido dela
        if (store.owner_id !== user.id) {
            return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
        }

        const { data: subscriptions, error: subsError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', order.buyer_id)

        if (subsError) throw subsError
        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ success: true, sent: 0 })
        }

        const payload = JSON.stringify({
            title: store.name || 'Atualização do Pedido',
            body,
            url: '/sacola',
            tag: `order-status-${checkoutId}`,
        })

        const results = await Promise.allSettled(
            subscriptions.map((sub) =>
                webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                ).catch((err) => {
                    if (err?.statusCode === 404 || err?.statusCode === 410) {
                        return supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
                    }
                    throw err
                })
            )
        )

        const sent = results.filter((r) => r.status === 'fulfilled').length
        return NextResponse.json({ success: true, sent })
    } catch (error: any) {
        console.error('Erro ao enviar push de status do pedido:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
