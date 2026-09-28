// app/api/admin/expenses/supabase-requests/route.ts
//
// Requisições por serviço (Auth/Realtime/REST/Storage) nas últimas 24h,
// via API de administração do Supabase (não o banco) — precisa de
// SUPABASE_MANAGEMENT_API_TOKEN configurado (token "Project" com escopo
// Usage Analytics, separado do token do MCP que só lê banco). Isso NÃO é
// a mesma coisa que Egress/Realtime Messages/Logs do painel de billing —
// é contagem de chamadas de API, um sinal de atividade, não de cobrança.
// Testamos ao vivo: a API de administração do Supabase não expõe os
// números de billing de verdade (Egress em GB, Realtime Messages, Log
// Ingestion etc) por nenhum endpoint documentado — só isso aqui.
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/adminAuth'

const SUPABASE_PROJECT_REF = 'mqtwehsmkuknkrtrqbnf'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const managementToken = process.env.SUPABASE_MANAGEMENT_API_TOKEN
    if (!managementToken) {
        return NextResponse.json({ configured: false })
    }

    const res = await fetch(
        `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/analytics/endpoints/usage.api-counts?interval=1day`,
        { headers: { Authorization: `Bearer ${managementToken}` } }
    )
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        return NextResponse.json({ error: `Supabase Management API: ${text || res.statusText}` }, { status: 502 })
    }

    const json = await res.json()
    const rows: { total_auth_requests: number; total_realtime_requests: number; total_rest_requests: number; total_storage_requests: number }[] = json.result || []

    const totals = rows.reduce(
        (acc, r) => ({
            auth: acc.auth + (r.total_auth_requests || 0),
            realtime: acc.realtime + (r.total_realtime_requests || 0),
            rest: acc.rest + (r.total_rest_requests || 0),
            storage: acc.storage + (r.total_storage_requests || 0),
        }),
        { auth: 0, realtime: 0, rest: 0, storage: 0 }
    )

    return NextResponse.json({ configured: true, windowHours: 24, ...totals })
}
