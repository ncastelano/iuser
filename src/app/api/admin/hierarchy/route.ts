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

    // Leitura das exceções de uma pessoa (a tabela não é legível pelo cliente).
    if (action === 'list_user_overrides') {
        if (!(await hasPermission(user.id, 'manage_hierarchy'))) {
            return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
        }
        const slug = String(payload?.profileSlug || '').replace(/^@/, '')
        const { data: profile } = await supabaseAdmin.from('profiles').select('id, name, profileSlug').eq('profileSlug', slug).maybeSingle()
        if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
        const { data: rows } = await supabaseAdmin
            .from('user_permissions')
            .select('effect, scope, expires_at, reason, created_at, permissions(slug, name)')
            .eq('profile_id', profile.id)
        return NextResponse.json({ profile, overrides: rows || [] })
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
