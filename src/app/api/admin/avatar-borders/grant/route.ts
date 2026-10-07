// app/api/admin/avatar-borders/grant/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/adminAuth'

// Concede (ou tira) uma borda de um perfil pelo @ (Admin → Bordas). Conceder não troca a borda em uso.
export async function POST(req: Request) {
    const admin = await requireSuperAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { borderId, profileSlug, action } = await req.json()
    const slug = String(profileSlug || '').replace(/^@/, '').trim()
    if (!borderId || !slug) return NextResponse.json({ error: 'Informe a borda e o @ do perfil' }, { status: 400 })

    const { data: profile } = await supabaseAdmin.from('profiles').select('id, name').eq('profileSlug', slug).maybeSingle()
    if (!profile) return NextResponse.json({ error: `Não achei o perfil @${slug}` }, { status: 404 })

    if (action === 'revoke') {
        await supabaseAdmin.from('user_avatar_borders').delete().eq('profile_id', profile.id).eq('border_id', borderId)
        // Se estava usando, tira do avatar
        await supabaseAdmin.from('profiles').update({ avatar_border_id: null }).eq('id', profile.id).eq('avatar_border_id', borderId)
    } else {
        const { error } = await supabaseAdmin.from('user_avatar_borders').upsert(
            { profile_id: profile.id, border_id: borderId, source: 'admin' },
            { onConflict: 'profile_id,border_id', ignoreDuplicates: true }
        )
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, name: profile.name })
}
