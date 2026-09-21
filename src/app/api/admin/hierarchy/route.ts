// app/api/admin/hierarchy/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { hasPermission, manageHierarchy, type HierarchyAction } from '@/lib/benefits/server'

const ACTIONS: HierarchyAction[] = [
    'upsert_status', 'set_status_permission', 'remove_status_permission',
    'set_plan_grant_settings', 'set_user_permission', 'remove_user_permission',
]

// Única rota da administração da hierarquia. Quem age vem do token; a
// permissão manage_hierarchy, as travas e a auditoria ficam no banco.
export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { action, payload } = await req.json().catch(() => ({}))

    // ---- leituras (só quem tem manage_hierarchy) ----
    if (action === 'list_user_overrides' || action === 'list_network' || action === 'network_summary') {
        if (!(await hasPermission(user.id, 'manage_hierarchy'))) {
            return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
        }

        // Rede: quem convidou quem, com o status de cada pessoa.
        if (action === 'network_summary') {
            const { data } = await supabaseAdmin.rpc('network_summary_internal', { p_actor: user.id })
            return NextResponse.json({ summary: data })
        }
        if (action === 'list_network') {
            const { data, error } = await supabaseAdmin.rpc('list_network_internal', {
                p_actor: user.id,
                p_parent: payload?.parentId || null,
                p_search: typeof payload?.search === 'string' ? payload.search.slice(0, 60) : null,
                p_limit: Math.min(Number(payload?.limit) || 50, 200),
                p_offset: Math.max(Number(payload?.offset) || 0, 0),
                p_filter: typeof payload?.filter === 'string' ? payload.filter.slice(0, 50) : 'all',
            })
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
            return NextResponse.json({ people: data || [] })
        }

        // Permissões de uma pessoa: efetivas (status + exceções) e as exceções.
        const slug = String(payload?.profileSlug || '').replace(/^@/, '')
        const { data: profile } = await supabaseAdmin.from('profiles').select('id, name, profileSlug').eq('profileSlug', slug).maybeSingle()
        if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
        const [{ data: rows }, { data: effective }, { data: perms }, { data: status }] = await Promise.all([
            supabaseAdmin.from('user_permissions').select('effect, scope, expires_at, reason, created_at, permissions(slug, name)').eq('profile_id', profile.id),
            supabaseAdmin.rpc('get_effective_permissions', { p_user: profile.id }),
            supabaseAdmin.from('permissions').select('slug, name'),
            supabaseAdmin.rpc('_actor_status', { p_user: profile.id }),
        ])
        const names = new Map((perms || []).map((p: { slug: string; name: string }) => [p.slug, p.name]))
        return NextResponse.json({
            profile,
            status: Array.isArray(status) ? status[0] : status,
            effective: ((effective || []) as { permission: string; scope: string }[]).map((e) => ({ slug: e.permission, name: names.get(e.permission) || e.permission, scope: e.scope })),
            overrides: rows || [],
        })
    }

    if (!ACTIONS.includes(action) || typeof payload !== 'object' || payload === null) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    // Exceções por pessoa chegam por @slug — resolve pra id no servidor.
    const data: Record<string, unknown> = { ...payload }
    if (action === 'set_user_permission' || action === 'remove_user_permission') {
        const slug = String(payload.profileSlug || '').replace(/^@/, '')
        const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('profileSlug', slug).maybeSingle()
        if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
        data.profile_id = profile.id
    }

    const result = await manageHierarchy({ actorId: user.id, action, payload: data })
    if (!result.ok) {
        return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === 'internal_error' ? 500 : 403 })
    }
    return NextResponse.json({ success: true })
}
