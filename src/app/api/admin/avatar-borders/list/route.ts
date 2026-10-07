// app/api/admin/avatar-borders/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Catálogo completo de bordas de avatar (inclusive as desligadas) com quantas pessoas têm e usam cada uma.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { data: borders, error } = await supabaseAdmin.from('avatar_borders').select('*').order('sort_order').order('created_at')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const counts = await Promise.all((borders || []).map(async (b) => {
        const [{ count: owners }, { count: using }] = await Promise.all([
            supabaseAdmin.from('user_avatar_borders').select('profile_id', { count: 'exact', head: true }).eq('border_id', b.id),
            supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('avatar_border_id', b.id),
        ])
        return [b.id, { owners: owners || 0, using: using || 0 }] as const
    }))
    const byId = Object.fromEntries(counts)
    return NextResponse.json({ borders: (borders || []).map((b) => ({ ...b, owners: byId[b.id]?.owners || 0, using: byId[b.id]?.using || 0 })) })
}
