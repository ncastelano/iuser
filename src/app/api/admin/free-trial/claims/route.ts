// app/api/admin/free-trial/claims/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Quem já resgatou o brinde (Admin → Brinde). Mais recentes primeiro.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { data: claims, error } = await supabaseAdmin
        .from('free_trial_claims')
        .select('profile_id, claimed_at, ends_at')
        .order('claimed_at', { ascending: false })
        .limit(200)
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ids = (claims || []).map((c) => c.profile_id)
    const { data: profiles } = ids.length
        ? await supabaseAdmin.from('profiles').select('id, name, profileSlug').in('id', ids)
        : { data: [] as any[] }
    const byId = new Map((profiles || []).map((p: any) => [p.id, p]))

    const { count } = await supabaseAdmin.from('free_trial_claims').select('profile_id', { count: 'exact', head: true })

    return NextResponse.json({
        total: count || 0,
        claims: (claims || []).map((c) => ({
            profileId: c.profile_id,
            name: byId.get(c.profile_id)?.name || null,
            profileSlug: byId.get(c.profile_id)?.profileSlug || null,
            claimedAt: c.claimed_at,
            endsAt: c.ends_at,
        })),
    })
}
