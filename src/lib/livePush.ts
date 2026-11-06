// src/lib/livePush.ts — Server-only: manda por push (Web Push + nativo) os avisos da ilha que ainda não foram avisados no aparelho.
// A verdade é a lista de notificações do perfil: aqui só se envia o que tem push_sent_at nulo e se marca cada linha ANTES de enviar, então duas chamadas
// seguidas (ou o mesmo ping duas vezes) nunca mandam o mesmo aviso duas vezes.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'
import { LIVE_PUSH_KINDS, livePushFor } from '@/lib/livePushPayload'

const FRESH_MS = 10 * 60 * 1000
const BATCH = 100

export async function pushLiveNotifications(): Promise<number> {
    const since = new Date(Date.now() - FRESH_MS).toISOString()
    const { data: rows } = await supabaseAdmin
        .from('profile_notifications')
        .select('id, profile_id, kind, meta')
        .in('kind', Object.keys(LIVE_PUSH_KINDS))
        .is('push_sent_at', null)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(BATCH)
    let sent = 0
    for (const row of rows || []) {
        // marca antes de enviar: só quem conseguir marcar envia
        const { data: claimed } = await supabaseAdmin.from('profile_notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', row.id).is('push_sent_at', null).select('id')
        if (!claimed || claimed.length === 0) continue
        const push = livePushFor(row as { id: string; kind: string; meta: Record<string, any> | null })
        if (!push) continue
        try { const r = await sendPushToUser(row.profile_id as string, push); sent += r.sent } catch (e) { console.error('[livePush] falha', row.id, e) }
    }
    return sent
}
