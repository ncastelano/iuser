// app/api/admin/asaas/retry-cancellations/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { cancelSubscription } from '@/lib/asaas'

// Refaz os cancelamentos da Asaas que falharam ao excluir contas.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { data: rows } = await supabaseAdmin.from('asaas_pending_cancellations').select('id, asaas_subscription_id, attempts')
    let cancelled = 0
    let failed = 0
    for (const row of rows || []) {
        try {
            await cancelSubscription(row.asaas_subscription_id)
            await supabaseAdmin.from('asaas_pending_cancellations').delete().eq('id', row.id)
            cancelled += 1
        } catch (err: any) {
            failed += 1
            await supabaseAdmin
                .from('asaas_pending_cancellations')
                .update({ attempts: row.attempts + 1, last_error: String(err?.message || err).slice(0, 300) })
                .eq('id', row.id)
        }
    }
    return NextResponse.json({ cancelled, failed })
}
