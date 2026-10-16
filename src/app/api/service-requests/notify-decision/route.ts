// app/api/service-requests/notify-decision/route.ts
//
// Push pro aparelho do profissional quando quem pediu o serviço o ESCOLHE ('selected') ou marca o serviço como
// feito ('completed', pra ele avaliar). Quem chama precisa ser o dono do pedido; a candidatura precisa estar no
// estado certo (aceita / concluída).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { sendPushToUser } from '@/lib/serverPush'
import { getRequestTitle } from '@/lib/serviceTypes'

export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { applicationId, kind } = await req.json().catch(() => ({}))
    if (!applicationId || typeof applicationId !== 'string' || !['selected', 'completed'].includes(kind)) {
        return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { data: app } = await supabaseAdmin
        .from('service_applications')
        .select('id, applicant_id, status, completed_at, service_request_id')
        .eq('id', applicationId)
        .maybeSingle()
    if (!app || app.status !== 'accepted') return NextResponse.json({ success: true, skipped: true })
    if (kind === 'completed' && !app.completed_at) return NextResponse.json({ success: true, skipped: true })

    const { data: request } = await supabaseAdmin
        .from('service_requests')
        .select('requester_id, service_type, custom_service, description')
        .eq('id', app.service_request_id)
        .maybeSingle()
    if (!request || request.requester_id !== user.id) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { data: owner } = await supabaseAdmin.from('profiles').select('name, profileSlug').eq('id', user.id).maybeSingle()
    const who = owner?.profileSlug ? `@${owner.profileSlug}` : owner?.name || 'Quem pediu'
    const title = getRequestTitle(request.description, request.service_type, request.custom_service, 60)

    const payload = kind === 'selected'
        ? { title: 'Você foi escolhido!', body: `${who} escolheu você para: “${title}”. Combinem os detalhes pelo iUser.`, url: '/procurar-servico?aba=inscrevi', tag: `service-selected-${app.id}`, urgent: true }
        : { title: 'Serviço concluído', body: `${who} marcou “${title}” como feito. Avalie como foi trabalhar com essa pessoa!`, url: '/procurar-servico?aba=inscrevi', tag: `service-done-${app.id}` }

    const { sent } = await sendPushToUser(app.applicant_id, payload)
    return NextResponse.json({ success: true, sent })
}
