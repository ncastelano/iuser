// app/api/admin/access-payments/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
        .from('store_access_grants')
        .select('id, profile_id, status, amount_cents, grant_type, days, requested_at, reviewed_at, profiles:profile_id(name, profileSlug)')
        .eq('source', 'manual_pix')
        .order('requested_at', { ascending: false })
        .limit(100)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payments: data })
}
