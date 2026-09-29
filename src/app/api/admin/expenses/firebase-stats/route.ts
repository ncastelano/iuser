// app/api/admin/expenses/firebase-stats/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'
import { isFirebasePushConfigured } from '@/lib/firebaseAdmin'

// Painel Financeiro > Firebase: custo (service_expenses) + telemetria
// própria de envios FCM (src/lib/firebaseAdmin.ts via track_service_usage)
// — o Firebase não expõe volume de envio por API pública com a service
// account que temos, só no console deles. `configured` é o status real:
// sem FIREBASE_SERVICE_ACCOUNT_KEY no ambiente, todo envio nativo falha
// silenciosamente (sendFcmToTokens retorna 0 sem erro).
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data: expenseRow } = await supabaseAdmin
        .from('service_expenses')
        .select('*')
        .eq('service_name', 'Firebase')
        .maybeSingle()

    const since = new Date()
    since.setDate(since.getDate() - 30)
    const { data: rows } = await supabaseAdmin
        .from('service_usage_telemetry_daily')
        .select('day, count')
        .eq('service', 'firebase')
        .eq('metric', 'fcm_sends')
        .gte('day', since.toISOString().slice(0, 10))
        .order('day', { ascending: true })

    const days = (rows || []).map((r) => ({ day: r.day, sends: Number(r.count) }))
    const totalSends = days.reduce((sum, d) => sum + d.sends, 0)

    return NextResponse.json({
        expense: expenseRow || null,
        configured: isFirebasePushConfigured(),
        days,
        totalSends,
    })
}
