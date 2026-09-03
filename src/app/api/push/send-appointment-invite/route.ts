// app/api/push/send-appointment-invite/route.ts
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase/admin'

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
// VAPID exige um subject https: ou mailto: — em dev o app roda em http://localhost, então caímos no mailto
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

        const { appointmentId } = await req.json()
        if (!appointmentId) {
            return NextResponse.json({ error: 'appointmentId é obrigatório' }, { status: 400 })
        }

        const { data: appointment, error: apptError } = await supabaseAdmin
            .from('appointments')
            .select('id, customer_id, owner_id, owner_slug, service_name, date, time, status, direction')
            .eq('id', appointmentId)
            .single()

        if (apptError || !appointment) {
            return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
        }

        // Só quem criou o convite pode disparar a notificação dele
        if (appointment.owner_id !== user.id) {
            return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
        }

        if (appointment.status !== 'pending' || appointment.direction !== 'incoming') {
            return NextResponse.json({ success: true, skipped: true })
        }

        const { data: subscriptions, error: subsError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', appointment.customer_id)

        if (subsError) throw subsError
        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ success: true, sent: 0 })
        }

        const payload = JSON.stringify({
            title: `Convite de @${appointment.owner_slug}`,
            body: `${appointment.service_name} · ${appointment.date} às ${appointment.time?.slice(0, 5)}`,
            url: '/compromissos',
            tag: `appointment-invite-${appointment.id}`,
        })

        const results = await Promise.allSettled(
            subscriptions.map((sub) =>
                webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                ).catch((err) => {
                    // 404/410 = subscription não existe mais na push service -> limpar
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
        console.error('Erro ao enviar push de convite:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
