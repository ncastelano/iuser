// app/api/admin/expenses/supabase-stats/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Estatísticas do banco direto do Postgres (tamanho total + maiores
// tabelas) — a única parte do uso do Supabase que dá pra ler via SQL sem
// depender da API de billing deles.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin.rpc('get_database_stats')
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Banco, Storage e MAU dão pra ler direto do banco (pg_database_size,
    // storage.objects e auth.users). Egress e Realtime Messages a gente
    // mede com telemetria própria (usage_telemetry_daily — ver
    // src/lib/usageTelemetry.ts), já que o Supabase não expõe esses dois
    // por API pública. Sincroniza o "usado" das 5 a cada carregamento do
    // painel, pra ninguém precisar preencher isso à mão — são as únicas
    // métricas que restaram na lista (o resto foi removido por não dar
    // pra automatizar, ver migration 20261011000000).
    const dbGb = Number(data.database_size_bytes || 0) / (1024 * 1024 * 1024)
    const storageGb = Number(data.storage_size_bytes || 0) / (1024 * 1024 * 1024)
    const mau = Number(data.mau_last_30d || 0)

    const since = new Date()
    since.setDate(since.getDate() - 30)
    const { data: telemetryRows } = await supabaseAdmin
        .from('usage_telemetry_daily')
        .select('egress_bytes, realtime_messages')
        .gte('day', since.toISOString().slice(0, 10))
    const egressGb = (telemetryRows || []).reduce((sum, r) => sum + Number(r.egress_bytes), 0) / (1024 * 1024 * 1024)
    const realtimeMessages = (telemetryRows || []).reduce((sum, r) => sum + Number(r.realtime_messages), 0)

    await Promise.all([
        supabaseAdmin
            .from('supabase_usage_metrics')
            .update({ used_value: dbGb, updated_at: new Date().toISOString() })
            .eq('metric_name', 'Banco de dados'),
        supabaseAdmin
            .from('supabase_usage_metrics')
            .update({ used_value: storageGb, updated_at: new Date().toISOString() })
            .eq('metric_name', 'Armazenamento (Storage)'),
        supabaseAdmin
            .from('supabase_usage_metrics')
            .update({ used_value: mau, updated_at: new Date().toISOString() })
            .eq('metric_name', 'Usuários ativos por mês (MAU)'),
        supabaseAdmin
            .from('supabase_usage_metrics')
            .update({ used_value: egressGb, updated_at: new Date().toISOString() })
            .eq('metric_name', 'Largura de banda (Egress)'),
        supabaseAdmin
            .from('supabase_usage_metrics')
            .update({ used_value: realtimeMessages, updated_at: new Date().toISOString() })
            .eq('metric_name', 'Mensagens Realtime'),
    ])

    // Plano e fim do ciclo — mesma linha "Supabase" da lista de gastos, pra
    // não duplicar esse dado num lugar novo.
    const { data: expenseRow } = await supabaseAdmin
        .from('service_expenses')
        .select('plan_name, next_due_date')
        .eq('service_name', 'Supabase')
        .maybeSingle()

    return NextResponse.json({ ...data, planName: expenseRow?.plan_name || null, cycleEndsAt: expenseRow?.next_due_date || null })
}
