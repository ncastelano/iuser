// app/api/follows/notify/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/adminAuth'
import { sendPushToUser } from '@/lib/serverPush'

// Avisa (push) o dono do perfil/loja que alguém começou a seguir. Quem segue
// vem sempre do token; o follow precisa existir de verdade, e cada par avisa
// uma vez só (seguir/desfazer/seguir não vira spam).
export async function POST(req: Request) {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { followingId } = await req.json().catch(() => ({}))
    if (!followingId || typeof followingId !== 'string') {
        return NextResponse.json({ error: 'followingId é obrigatório' }, { status: 400 })
    }

    const { data: follow } = await supabaseAdmin
        .from('follows')
        .select('follower_id')
        .eq('follower_id', user.id)
        .eq('following_id', followingId)
        .maybeSingle()
    if (!follow) return NextResponse.json({ success: true, skipped: true })

    // O seguido pode ser um perfil ou uma loja (aí o aviso vai pro dono).
    let recipientId: string | null = null
    let storeName: string | null = null
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('id', followingId).maybeSingle()
    if (profile) {
        recipientId = profile.id
    } else {
        const { data: store } = await supabaseAdmin.from('stores').select('owner_id, name').eq('id', followingId).maybeSingle()
        recipientId = store?.owner_id ?? null
        storeName = store?.name ?? null
    }
    if (!recipientId || recipientId === user.id) return NextResponse.json({ success: true, skipped: true })

    const { error: dedupeError } = await supabaseAdmin
        .from('follow_notifications')
        .insert({ follower_id: user.id, following_id: followingId })
    if (dedupeError) return NextResponse.json({ success: true, skipped: true }) // já avisado

    const { data: actor } = await supabaseAdmin
        .from('profiles')
        .select('name, profileSlug')
        .eq('id', user.id)
        .maybeSingle()
    const who = actor?.profileSlug ? `@${actor.profileSlug}` : actor?.name || 'Alguém'

    await sendPushToUser(recipientId, {
        title: 'Novo seguidor!',
        body: storeName ? `${who} começou a seguir a loja ${storeName}` : `${who} começou a seguir você`,
        url: actor?.profileSlug ? `/${actor.profileSlug}` : '/',
        tag: `new-follower-${user.id}`,
    })

    return NextResponse.json({ success: true })
}
