// src/lib/appointmentPush.ts
//
// Push dos agendamentos. A "verdade" é a lista de Notificações do perfil: um gatilho do banco grava UMA linha por evento
// (novo, confirmado, cancelado, alterado). Aqui só se envia o push das linhas que ainda não foram avisadas no aparelho
// (push_sent_at nulo) e se marca cada uma ANTES de enviar — assim duas chamadas seguidas (clique duplo, nova tentativa,
// convite + confirmação) nunca mandam o mesmo aviso duas vezes.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'

const KINDS = ['appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed']
const FRESH_MS = 15 * 60 * 1000

export class AppointmentPushError extends Error {
    constructor(message: string, public status: number) { super(message) }
}

function when(meta: any): string {
    const d = meta?.date ? String(meta.date).split('-').reverse().join('/') : ''
    const t = meta?.time ? ` às ${meta.time}` : ''
    return `${d}${t}`.trim()
}

export async function pushAppointmentNotifications(appointmentId: string, callerId: string): Promise<{ sent: number; skipped: number }> {
    const { data: appt } = await supabaseAdmin
        .from('appointments')
        .select('id, owner_id, customer_id, provider_profile_id, store_id')
        .eq('id', appointmentId)
        .maybeSingle()
    if (!appt) throw new AppointmentPushError('Agendamento não encontrado', 404)
    if (![appt.owner_id, appt.customer_id, appt.provider_profile_id].includes(callerId)) {
        throw new AppointmentPushError('Sem permissão', 403)
    }

    const since = new Date(Date.now() - FRESH_MS).toISOString()
    const { data: rows } = await supabaseAdmin
        .from('profile_notifications')
        .select('id, profile_id, kind, actor_id, meta')
        .eq('ref_id', appointmentId)
        .in('kind', KINDS)
        .is('push_sent_at', null)
        .gte('created_at', since)

    let sent = 0
    let skipped = 0
    for (const row of rows || []) {
        // Marca antes de enviar: só quem conseguir marcar envia
        const { data: claimed } = await supabaseAdmin
            .from('profile_notifications')
            .update({ push_sent_at: new Date().toISOString() })
            .eq('id', row.id)
            .is('push_sent_at', null)
            .select('id')
        if (!claimed || claimed.length === 0) { skipped++; continue }

        let actorSlug: string | null = null
        if (row.actor_id) {
            const { data: a } = await supabaseAdmin.from('profiles').select('profileSlug').eq('id', row.actor_id).maybeSingle()
            actorSlug = (a as { profileSlug?: string } | null)?.profileSlug || null
        }
        const who = actorSlug ? `@${actorSlug}` : 'Alguém'
        const meta: any = row.meta || {}
        const what = `${meta.title || 'Compromisso'}${when(meta) ? ` · ${when(meta)}` : ''}`
        const isStoreOwner = row.profile_id === appt.owner_id && !!appt.store_id

        let title = 'Agenda'
        let body = what
        if (row.kind === 'appointment_new') {
            if (meta.flow === 'booking') {
                title = meta.store ? `Novo agendamento em ${meta.store}` : 'Novo agendamento na sua agenda'
                body = `${who} agendou: ${what}`
            } else {
                title = `Convite de ${who}`
            }
        } else if (row.kind === 'appointment_confirmed') {
            title = 'Agendamento confirmado'
            body = `${who} confirmou: ${what}`
        } else if (row.kind === 'appointment_cancelled') {
            title = 'Agendamento cancelado'
            body = `${who} cancelou: ${what}`
        } else if (row.kind === 'appointment_changed') {
            title = 'Horário alterado'
            body = `${who} mudou para ${when(meta) || 'um novo horário'}: ${meta.title || 'Compromisso'}`
        }
        const url = isStoreOpen(isStoreOwner, appt.store_id)

        const r = await sendPushToUser(row.profile_id, { title, body, url, tag: `appointment-${appointmentId}-${row.kind}` })
        if (r.sent) sent++
    }
    return { sent, skipped }
}

// Dono da loja cai direto na aba daquela loja; o resto, na agenda geral
function isStoreOpen(isStoreOwner: boolean, storeId: string | null): string {
    return isStoreOwner && storeId ? `/compromissos?tab=${storeId}` : '/compromissos'
}
