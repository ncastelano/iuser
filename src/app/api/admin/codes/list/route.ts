// app/api/admin/codes/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireCodeGenerator } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const auth = await requireCodeGenerator(req)
    if (!auth) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    let query = supabaseAdmin
        .from('store_access_codes')
        .select('id, code, grant_type, days, active, max_uses, use_count, created_at, created_by, profiles:created_by(profileSlug)')
        .order('created_at', { ascending: false })
        .limit(200)

    // Admin delegado só vê os códigos que ele mesmo gerou; o admin geral vê todos.
    if (!auth.isSuperAdmin) {
        query = query.eq('created_by', auth.user.id)
    }

    const { data, error } = await query
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ codes: data })
}
