// app/api/service-requests/notify-owner/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { sendPushToUser } from '@/lib/serverPush'
import { getServiceLabel } from '@/lib/serviceTypes'

// Avisa (push) quem pediu o serviço que alguém acabou de se candidatar.
// Quem se candidata vem do token; a candidatura precisa existir de verdade.
export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { serviceRequestId } = await req.json().catch(() => ({}))
    if (!serviceRequestId || typeof serviceRequestId !== 'string') {
        return NextResponse.json({ error: 'serviceRequestId é obrigatório' }, { status: 400 })
    }

    const { data: application } = await supabaseAdmin
        .from('service_applications')
        .select('id')
        .eq('applicant_id', user.id)
        .eq('service_request_id', serviceRequestId)
        .maybeSingle()
    if (!application) return NextResponse.json({ success: true, skipped: true })

    const { data: request } = await supabaseAdmin
        .from('service_requests')
        .select('requester_id, service_type, custom_service')
        .eq('id', serviceRequestId)
        .maybeSingle()
    if (!request || request.requester_id === user.id) return NextResponse.json({ success: true, skipped: true })

    const { data: actor } = await supabaseAdmin
        .from('profiles')
        .select('name, profileSlug')
        .eq('id', user.id)
        .maybeSingle()
    const who = actor?.name || (actor?.profileSlug ? `@${actor.profileSlug}` : 'Alguém')
    const serviceLabel = getServiceLabel(request.service_type, request.custom_service)

    await sendPushToUser(request.requester_id, {
        title: 'Nova candidatura!',
        body: `${who} quer atender seu pedido de ${serviceLabel}`,
        url: '/solicitar-servico',
        tag: `service-application-${serviceRequestId}`,
    })

    return NextResponse.json({ success: true })
}
