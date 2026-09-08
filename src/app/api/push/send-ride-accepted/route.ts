// app/api/push/send-ride-accepted/route.ts
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

        const { rideRequestId } = await req.json()
        if (!rideRequestId) {
            return NextResponse.json({ error: 'rideRequestId é obrigatório' }, { status: 400 })
        }

        const { data: ride, error: rideError } = await supabaseAdmin
            .from('ride_requests')
            .select('id, requester_id, driver_id, status')
            .eq('id', rideRequestId)
            .single()

        if (rideError || !ride) {
            return NextResponse.json({ error: 'Corrida não encontrada' }, { status: 404 })
        }

        // Só quem pediu a corrida pode disparar o aviso de aceite pro motorista dela.
        if (ride.requester_id !== user.id) {
            return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
        }
        if (ride.status !== 'accepted' || !ride.driver_id) {
            return NextResponse.json({ success: true, skipped: true })
        }

        const [{ data: requester }, { data: application }] = await Promise.all([
            supabaseAdmin.from('profiles').select('name, profileSlug').eq('id', ride.requester_id).single(),
            supabaseAdmin
                .from('ride_applications')
                .select('proposed_price')
                .eq('ride_request_id', ride.id)
                .eq('applicant_id', ride.driver_id)
                .eq('status', 'accepted')
                .maybeSingle(),
        ])

        const requesterName = requester?.name || (requester?.profileSlug ? `@${requester.profileSlug}` : 'O passageiro')
        const priceText = application?.proposed_price != null ? ` de R$ ${Number(application.proposed_price).toFixed(2)}` : ''

        const { data: subscriptions, error: subsError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', ride.driver_id)

        if (subsError) throw subsError
        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ success: true, sent: 0 })
        }

        const payload = JSON.stringify({
            title: 'Corrida aceita!',
            body: `${requesterName} aceitou sua proposta${priceText} e está esperando você.`,
            url: '/aceitar-corridas',
            tag: `ride-accepted-${ride.id}`,
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
        console.error('Erro ao enviar push de corrida aceita:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
