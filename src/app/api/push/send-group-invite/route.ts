// app/api/push/send-group-invite/route.ts
//
// Aviso no aparelho de quem foi convidado pra um grupo. Quem chama é um administrador do grupo (logo depois de
// criar/convidar); a rota avisa só os convites ainda não avisados (push_sent_at) — uma vez por convite.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'

export async function POST(req: Request) {
    try {
        const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const { conversationId } = await req.json()
        if (!conversationId) return NextResponse.json({ error: 'conversationId é obrigatório' }, { status: 400 })

        const { data: admin } = await supabaseAdmin
            .from('conversation_members')
            .select('profile_id')
            .eq('conversation_id', conversationId).eq('profile_id', user.id).eq('status', 'active').eq('role', 'admin')
            .maybeSingle()
        if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

        const { data: conv } = await supabaseAdmin.from('conversations').select('id, title, kind').eq('id', conversationId).maybeSingle()
        if (!conv || conv.kind !== 'group') return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })

        const { data: pending } = await supabaseAdmin
            .from('conversation_members')
            .select('profile_id')
            .eq('conversation_id', conversationId).eq('status', 'invited').is('push_sent_at', null)
        if (!pending || pending.length === 0) return NextResponse.json({ success: true, sent: 0 })

        const { data: sender } = await supabaseAdmin.from('profiles').select('name, profileSlug, avatar_url').eq('id', user.id).maybeSingle()
        const who = sender?.profileSlug ? `@${sender.profileSlug}` : sender?.name || 'Alguém'
        const icon = sender?.avatar_url
            ? (sender.avatar_url.startsWith('http') ? sender.avatar_url : supabaseAdmin.storage.from('avatars').getPublicUrl(sender.avatar_url).data.publicUrl)
            : undefined

        await supabaseAdmin
            .from('conversation_members')
            .update({ push_sent_at: new Date().toISOString() })
            .eq('conversation_id', conversationId).in('profile_id', pending.map((p) => p.profile_id))

        let sent = 0
        await Promise.all(pending.map(async (p) => {
            const r = await sendPushToUser(p.profile_id, {
                title: 'Convite para um grupo',
                body: `${who} convidou você para “${conv.title}”`,
                url: '/conversas',
                tag: `group-invite-${conv.id}`,
                icon,
            })
            sent += r.sent
        }))
        return NextResponse.json({ success: true, sent })
    } catch (error: any) {
        console.error('Erro ao enviar push de convite de grupo:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
