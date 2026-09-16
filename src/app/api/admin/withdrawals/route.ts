// app/api/admin/withdrawals/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
        .from('withdrawal_requests')
        .select('id, user_id, amount, pix_key, pix_key_type, status, requested_at, resolved_at, failure_reason, asaas_transfer_id, profiles:user_id(name, profileSlug)')
        .order('requested_at', { ascending: false })
        .limit(100)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ withdrawals: data })
}
