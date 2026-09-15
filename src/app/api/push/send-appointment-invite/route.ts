// app/api/push/send-appointment-invite/route.ts
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

        const { appointmentId } = await req.json()
        if (!appointmentId) {
            return NextResponse.json({ error: 'appointmentId é obrigatório' }, { status: 400 })
        }

        const { data: appointment, error: apptError } = await supabaseAdmin
            .from('appointments')
            .select('id, customer_id, customer_slug, owner_id, owner_slug, service_name, date, time, status, store_name, store_id')
            .eq('id', appointmentId)
            .single()

        if (apptError || !appointment) {
            return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
        }

        if (appointment.status !== 'pending') {
            return NextResponse.json({ success: true, skipped: true })
        }

        // Duas direções possíveis: quem criou o convite (owner) avisa o convidado (customer),
        // ou o cliente que acabou de agendar numa loja avisa o dono da loja (owner).
        let targetUserId: string
        let title: string
        let body: string
        let url: string

        if (appointment.owner_id === user.id) {
            // Convite pessoal: pro convidado, o compromisso aparece na aba "Pessoal"
            // (filtrada por customer_id, não por loja), então não precisa de aba específica.
            targetUserId = appointment.customer_id
            title = `Convite de @${appointment.owner_slug}`
            body = `${appointment.service_name} · ${appointment.date} às ${appointment.time?.slice(0, 5)}`
            url = '/compromissos'
        } else if (appointment.customer_id === user.id) {
            targetUserId = appointment.owner_id
            title = appointment.store_name ? `Novo agendamento em ${appointment.store_name}` : 'Novo agendamento'
            body = `${appointment.customer_slug ? '@' + appointment.customer_slug : 'Alguém'} agendou: ${appointment.service_name} · ${appointment.date} às ${appointment.time?.slice(0, 5)}`
            // Se for agendamento numa loja, leva direto pra aba daquela loja em /compromissos
            url = appointment.store_id ? `/compromissos?tab=${appointment.store_id}` : '/compromissos'
        } else {
            return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
        }

        const { sent } = await sendPushToUser(targetUserId, {
            title,
            body,
            url,
            tag: `appointment-invite-${appointment.id}`,
        })

        return NextResponse.json({ success: true, sent })
    } catch (error: any) {
        console.error('Erro ao enviar push de convite:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
