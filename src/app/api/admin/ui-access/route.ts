// app/api/admin/ui-access/route.ts
//
// Quem pode usar a interface 3.0 (tabela ui_v3_access). Só o administrador geral lista, concede e revoga.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || 'list')

    if (action === 'grant' || action === 'revoke') {
        const profileId = String(body.profileId || '')
        if (!/^[0-9a-f-]{36}$/i.test(profileId)) return NextResponse.json({ error: 'Perfil inválido' }, { status: 400 })
        if (action === 'grant') {
            const { error } = await supabaseAdmin
                .from('ui_v3_access')
                .upsert({ profile_id: profileId, granted_by: admin.id }, { onConflict: 'profile_id' })
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        } else {
            const { error } = await supabaseAdmin.from('ui_v3_access').delete().eq('profile_id', profileId)
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true })
    }

    const { data: rows, error } = await supabaseAdmin
        .from('ui_v3_access')
        .select('profile_id, granted_at')
        .order('granted_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const ids = (rows || []).map((r) => r.profile_id)
    const { data: profs } = ids.length
        ? await supabaseAdmin.from('profiles').select('id, profileSlug, name, avatar_url').in('id', ids)
        : { data: [] as { id: string; profileSlug: string | null; name: string | null; avatar_url: string | null }[] }
    const byId = new Map((profs || []).map((p) => [p.id, p]))
    return NextResponse.json({
        granted: (rows || []).map((r) => ({
            profile_id: r.profile_id,
            granted_at: r.granted_at,
            profileSlug: byId.get(r.profile_id)?.profileSlug ?? null,
            name: byId.get(r.profile_id)?.name ?? null,
            avatar_url: byId.get(r.profile_id)?.avatar_url ?? null,
        })),
    })
}
