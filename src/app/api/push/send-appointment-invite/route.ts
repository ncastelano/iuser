// app/api/push/send-appointment-invite/route.ts
//
// Mantida pelos 3 lugares que criam convites/agendamentos. Agora só delega: o aviso já foi gravado pelo gatilho do banco
// (Notificações do perfil) e a rotina compartilhada envia o push uma única vez (push_sent_at).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { AppointmentPushError, pushAppointmentNotifications } from '@/lib/appointmentPush'

export async function POST(req: Request) {
    try {
        const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const { appointmentId } = await req.json()
        if (!appointmentId) return NextResponse.json({ error: 'appointmentId é obrigatório' }, { status: 400 })

        const result = await pushAppointmentNotifications(appointmentId, user.id)
        return NextResponse.json({ success: true, ...result })
    } catch (error: any) {
        if (error instanceof AppointmentPushError) return NextResponse.json({ error: error.message }, { status: error.status })
        console.error('Erro ao enviar push de convite:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
