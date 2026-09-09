// app/api/push/send-ride-status-update/route.ts
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

type RideStatusEvent = 'en_route' | 'arrived' | 'completed' | 'cancelled'

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

        const { rideRequestId, status } = await req.json() as { rideRequestId?: string; status?: RideStatusEvent }
        if (!rideRequestId || !status) {
            return NextResponse.json({ error: 'rideRequestId e status são obrigatórios' }, { status: 400 })
        }

        const { data: ride, error: rideError } = await supabaseAdmin
            .from('ride_requests')
            .select('id, requester_id, driver_id')
            .eq('id', rideRequestId)
            .single()

        if (rideError || !ride) {
            return NextResponse.json({ error: 'Corrida não encontrada' }, { status: 404 })
        }

        const isDriver = ride.driver_id === user.id
        const isRequester = ride.requester_id === user.id
        if (!isDriver && !isRequester) {
            return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
        }

        // "a caminho" e "concluída" só fazem sentido anunciados pelo motorista;
        // "cancelada" pode ser disparado por quem cancelou, seja ele quem for —
        // o destinatário é sempre a outra ponta da corrida.
        let recipientId: string | null = null
        let title = ''
        let body = ''
        let url = '/'

        if (status === 'en_route' || status === 'arrived' || status === 'completed') {
            if (!isDriver || !ride.driver_id) {
                return NextResponse.json({ success: true, skipped: true })
            }
            recipientId = ride.requester_id
            url = '/pedir-motorista'
            if (status === 'en_route' || status === 'arrived') {
                const { data: driver } = await supabaseAdmin.from('profiles').select('name, profileSlug').eq('id', ride.driver_id).single()
                const driverName = driver?.name || (driver?.profileSlug ? `@${driver.profileSlug}` : 'O motorista')
                if (status === 'en_route') {
                    title = 'Motorista a caminho!'
                    body = `${driverName} está a caminho do local de partida.`
                } else {
                    title = 'Motorista chegou!'
                    body = `${driverName} chegou ao local de partida.`
                }
            } else {
                title = 'Corrida concluída!'
                body = 'Sua corrida foi concluída. Obrigado por usar o iUser!'
                url = '/minhas-corridas'
            }
        } else if (status === 'cancelled') {
            if (!ride.driver_id) {
                return NextResponse.json({ success: true, skipped: true })
            }
            recipientId = isDriver ? ride.requester_id : ride.driver_id
            title = 'Corrida cancelada'
            body = isDriver ? 'O motorista cancelou a corrida.' : 'O passageiro cancelou a corrida.'
            url = isDriver ? '/pedir-motorista' : '/aceitar-corridas'
        } else {
            return NextResponse.json({ success: true, skipped: true })
        }

        if (!recipientId) {
            return NextResponse.json({ success: true, skipped: true })
        }

        const { data: subscriptions, error: subsError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', recipientId)

        if (subsError) throw subsError
        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ success: true, sent: 0 })
        }

        const payload = JSON.stringify({
            title,
            body,
            url,
            tag: `ride-${status}-${ride.id}`,
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
        console.error('Erro ao enviar push de status da corrida:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
