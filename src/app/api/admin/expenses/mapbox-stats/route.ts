// app/api/admin/expenses/mapbox-stats/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Painel Financeiro > Mapbox: custo (service_expenses) + telemetria própria
// de chamadas de Directions/Optimization (src/lib/mapboxRoute.ts via
// trackMapboxRequest) — o Mapbox não expõe uso por API pública com o token
// público que o app usa, só no dashboard deles. Geocoding (busca de
// endereço) e carregamento de mapa (tiles do mapbox-gl) não são
// rastreados: acontecem espalhados em ~6 arquivos sem um wrapper central,
// diferente de Directions/Optimization que já passam todos por
// mapboxRoute.ts.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data: expenseRow } = await supabaseAdmin
        .from('service_expenses')
        .select('*')
        .eq('service_name', 'Mapbox')
        .maybeSingle()

    const since = new Date()
    since.setDate(since.getDate() - 30)
    const { data: rows } = await supabaseAdmin
        .from('service_usage_telemetry_daily')
        .select('day, metric, count')
        .eq('service', 'mapbox')
        .gte('day', since.toISOString().slice(0, 10))
        .order('day', { ascending: true })

    const dayMap = new Map<string, { day: string; directions: number; optimization: number }>()
    let totalDirections = 0
    let totalOptimization = 0
    for (const r of rows || []) {
        const entry = dayMap.get(r.day) || { day: r.day, directions: 0, optimization: 0 }
        if (r.metric === 'directions') { entry.directions += Number(r.count); totalDirections += Number(r.count) }
        if (r.metric === 'optimization') { entry.optimization += Number(r.count); totalOptimization += Number(r.count) }
        dayMap.set(r.day, entry)
    }

    return NextResponse.json({
        expense: expenseRow || null,
        days: Array.from(dayMap.values()),
        totalDirections,
        totalOptimization,
    })
}
