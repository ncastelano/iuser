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

    // Storage e MAU também dão pra ler direto do banco (storage.objects e
    // auth.users) — sincroniza o "usado" dessas duas métricas a cada
    // carregamento do painel, pra não depender de ninguém preencher isso
    // à mão. As outras (Egress, Realtime, Logs...) continuam manuais: são
    // medidas fora do Postgres, não tem como calcular por aqui.
    const storageGb = Number(data.storage_size_bytes || 0) / (1024 * 1024 * 1024)
    const mau = Number(data.mau_last_30d || 0)
    await Promise.all([
        supabaseAdmin
            .from('supabase_usage_metrics')
            .update({ used_value: storageGb, updated_at: new Date().toISOString() })
            .eq('metric_name', 'Armazenamento (Storage)'),
        supabaseAdmin
            .from('supabase_usage_metrics')
            .update({ used_value: mau, updated_at: new Date().toISOString() })
            .eq('metric_name', 'Usuários ativos por mês (MAU)'),
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
