// Server-only: manda uma campanha de aviso (push) em lotes. Cada pessoa é marcada ANTES de receber (campaign_claim),
// então repetir o envio nunca manda duas vezes. Quem desligou "Ofertas" depois de entrar na fila é pulado pelo banco.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'

export async function sendCampaignBatches(campaignId: string, budgetMs = 40_000): Promise<{ sent: number; remaining: number }> {
    const started = Date.now()
    let sent = 0
    const { data: head } = await supabaseAdmin.from('push_campaigns').select('title, body, url').eq('id', campaignId).maybeSingle()
    if (!head) throw new Error('Aviso não encontrado.')
    const payload = { title: head.title as string, body: head.body as string, url: head.url as string, tag: `campaign-${campaignId}` }
    while (Date.now() - started < budgetMs) {
        const { data: ids, error } = await supabaseAdmin.rpc('campaign_claim', { p_campaign: campaignId, p_limit: 100 })
        if (error) throw error
        const batch = (ids || []) as string[]
        if (batch.length === 0) break
        const results = await Promise.allSettled(batch.map((uid) => sendPushToUser(uid, payload)))
        const ok = results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value.sent : 0), 0)
        sent += ok
        await supabaseAdmin.rpc('campaign_mark_sent', { p_campaign: campaignId, p_sent: ok })
    }
    const { data: remaining } = await supabaseAdmin.rpc('campaign_remaining', { p_campaign: campaignId })
    return { sent, remaining: (remaining as number) ?? 0 }
}
