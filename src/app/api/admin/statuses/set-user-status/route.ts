// app/api/admin/statuses/set-user-status/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { setUserStatus } from '@/lib/benefits/server'

// Define o status hierárquico de uma pessoa. A autorização (permissão
// manage_leaders + nível) é decidida no banco em set_user_status_internal.
export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { profileSlug, statusSlug } = await req.json().catch(() => ({}))
    if (!profileSlug || typeof statusSlug !== 'string') {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('profileSlug', String(profileSlug).replace(/^@/, ''))
        .maybeSingle()
    if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

    const result = await setUserStatus({ actorId: user.id, targetUserId: profile.id, statusSlug })
    if (!result.ok) {
        return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === 'internal_error' ? 500 : 403 })
    }
    return NextResponse.json({ success: true })
}
