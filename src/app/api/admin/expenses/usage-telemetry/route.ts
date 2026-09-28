// app/api/admin/expenses/usage-telemetry/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Nossa própria contagem de Egress/Realtime Messages (ver
// src/lib/usageTelemetry.ts + src/lib/supabase/client.ts) — últimos 30
// dias, dia a dia, pra dar pra ver a tendência de crescimento.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const since = new Date()
    since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString().slice(0, 10)

    const { data, error } = await supabaseAdmin
        .from('usage_telemetry_daily')
        .select('day, egress_bytes, realtime_messages')
        .gte('day', sinceStr)
        .order('day', { ascending: true })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data || []
    const totalEgressBytes = rows.reduce((sum, r) => sum + Number(r.egress_bytes), 0)
    const totalRealtimeMessages = rows.reduce((sum, r) => sum + Number(r.realtime_messages), 0)
    const today = new Date().toISOString().slice(0, 10)
    const todayRow = rows.find((r) => r.day === today)

    return NextResponse.json({
        days: rows,
        totalEgressBytes,
        totalRealtimeMessages,
        todayEgressBytes: Number(todayRow?.egress_bytes || 0),
        todayRealtimeMessages: Number(todayRow?.realtime_messages || 0),
    })
}
