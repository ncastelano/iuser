// app/api/push/send-chat-message/route.ts
//
// Aviso no aparelho (barra de notificação) quando chega mensagem no chat do iUser: título = quem mandou (@ do perfil ou
// nome da loja), foto de quem mandou no cartão e, ao tocar, abre direto a conversa (/conversas?c=<id>).
// Quem chama é quem ENVIOU a mensagem (logo depois de mandar); a rota confere que ele participa da conversa, pega a
// mensagem mais recente dele e só avisa uma vez por mensagem.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/serverPush'

const MAX_BODY = 140

export async function POST(req: Request) {
    try {
        const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const { conversationId } = await req.json()
        if (!conversationId) return NextResponse.json({ error: 'conversationId é obrigatório' }, { status: 400 })

        const { data: conv } = await supabaseAdmin
            .from('conversations')
            .select('id, customer_id, owner_profile_id, store_id')
            .eq('id', conversationId)
            .maybeSingle()
        if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

        // Dono da loja (quando a conversa é com uma loja)
        type StoreRow = { id: string; name: string; storeSlug: string; logo_url: string | null; owner_id: string }
        let store = null as StoreRow | null
        if (conv.store_id) {
            const { data } = await supabaseAdmin.from('stores').select('id, name, storeSlug, logo_url, owner_id').eq('id', conv.store_id).maybeSingle()
            store = data as StoreRow | null
        }
        const ownerUserId = conv.owner_profile_id || store?.owner_id || null
        const isCustomer = user.id === conv.customer_id
        const isOwnerSide = !!ownerUserId && user.id === ownerUserId
        if (!isCustomer && !isOwnerSide) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

        // A mensagem mais recente de quem chamou, ainda não avisada
        const { data: msg } = await supabaseAdmin
            .from('direct_messages')
            .select('id, content, ref_product_id, created_at, push_notified_at')
            .eq('conversation_id', conv.id)
            .eq('sender_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (!msg || msg.push_notified_at) return NextResponse.json({ success: true, skipped: true })
        if (Date.now() - new Date(msg.created_at).getTime() > 2 * 60 * 1000) return NextResponse.json({ success: true, skipped: true })

        await supabaseAdmin.from('direct_messages').update({ push_notified_at: new Date().toISOString() }).eq('id', msg.id)

        // Quem recebe: o cliente, ou o lado do perfil/loja
        const recipientId = isCustomer ? ownerUserId : conv.customer_id
        if (!recipientId) return NextResponse.json({ success: true, skipped: true })

        // Quem aparece como remetente: o @ da pessoa; no lado da loja, a loja (nome + logo)
        let title = ''
        let icon: string | undefined
        if (isOwnerSide && store) {
            title = store.name
            icon = store.logo_url
                ? (store.logo_url.startsWith('http') ? store.logo_url : supabaseAdmin.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl)
                : undefined
        } else {
            const { data: sender } = await supabaseAdmin.from('profiles').select('name, profileSlug, avatar_url').eq('id', user.id).maybeSingle()
            title = sender?.profileSlug ? `@${sender.profileSlug}` : sender?.name || 'Nova mensagem'
            icon = sender?.avatar_url
                ? (sender.avatar_url.startsWith('http') ? sender.avatar_url : supabaseAdmin.storage.from('avatars').getPublicUrl(sender.avatar_url).data.publicUrl)
                : undefined
        }

        let body = String(msg.content || '').replace(/\s+/g, ' ').trim()
        if (msg.ref_product_id) {
            const { data: prod } = await supabaseAdmin.from('products').select('name').eq('id', msg.ref_product_id).maybeSingle()
            if (prod?.name) body = `Interessado em "${prod.name}": ${body}`
        }
        if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY - 1) + '…'

        const { sent } = await sendPushToUser(recipientId, {
            title,
            body,
            url: `/conversas?c=${conv.id}`,
            tag: `chat-${conv.id}`,
            icon,
            chat: true,
        })

        return NextResponse.json({ success: true, sent })
    } catch (error: any) {
        console.error('Erro ao enviar push de mensagem do chat:', error)
        return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
    }
}
