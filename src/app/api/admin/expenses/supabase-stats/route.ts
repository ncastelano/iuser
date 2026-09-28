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

    return NextResponse.json(data)
}
