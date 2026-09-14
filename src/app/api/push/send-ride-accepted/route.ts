// app/api/push/send-ride-accepted/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'

export async function POST(req: Request) {
    try {
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

        const { sent } = await sendPushToUser(ride.driver_id, {
            title: 'Corrida aceita!',
            body: `${requesterName} aceitou sua proposta${priceText} e está esperando você.`,
            url: '/aceitar-corridas',
            tag: `ride-accepted-${ride.id}`,
        })

        return NextResponse.json({ success: true, sent })
    } catch (error: any) {
        console.error('Erro ao enviar push de corrida aceita:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
