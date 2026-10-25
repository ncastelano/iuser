// Compartilhar DENTRO do iUser: mandar o link para uma comunidade em que a pessoa está, ou publicá-lo no próprio perfil.
// É o que o diálogo padrão de compartilhar (components/ShareLinkDialog) usa; as regras de quem pode o quê continuam no banco (RLS):
// só membro escreve na comunidade e só o dono cria publicação no próprio perfil.
import { supabase } from '@/lib/supabase/client'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'
import { getAvatarUrl } from '@/lib/avatar'
import { notifyChatMessage } from '@/lib/notifyRideStatus'

export interface MyCommunity { id: string; slug: string; name: string; city: string }

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s)
/** Texto da mensagem/publicação: um resumo curto + o link (o link vira cartão na sala). */
export const withLink = (text: string, url: string) => `${short((text || '').trim(), 240)}\n${url}`.trim()

async function me(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.user.id ?? null
}

/** As comunidades em que a pessoa já está (null = sem login). */
export async function listMyCommunities(): Promise<MyCommunity[] | null> {
    const uid = await me()
    if (!uid) return null
    const { data } = await supabase
        .from('community_members')
        .select('joined_at, communities(id, slug, name, city)')
        .eq('profile_id', uid)
        .order('joined_at', { ascending: false })
    return ((data as any[]) || []).map((r) => r.communities).filter(Boolean) as MyCommunity[]
}

export async function sendToCommunity(communityId: string, text: string, url: string): Promise<void> {
    const uid = await me()
    if (!uid) throw new Error('Entre na sua conta para compartilhar.')
    const { error } = await supabase.from('community_messages').insert({ community_id: communityId, profile_id: uid, content: withLink(text, url) })
    if (error) throw error
}

/** Publica no perfil (aba Publicações) com o link; devolve o endereço da publicação. */
export async function publishToMyProfile(opts: { title: string; text: string; url: string; imageUrl?: string | null }): Promise<string> {
    const uid = await me()
    if (!uid) throw new Error('Entre na sua conta para compartilhar.')
    const name = short(opts.title.trim() || 'Olha isso no iUser', 80)
    const slug = await generateUniqueGlobalSlug(name)
    const { error } = await supabase.from('products').insert({
        name, slug, description: withLink(opts.text === opts.title ? '' : opts.text, opts.url), price: 0, type: 'physical', price_type: 'fixed',
        listing_type: 'publication', image_url: opts.imageUrl || null, owner_id: uid, store_id: null, view_count: 0,
    })
    if (error) throw error
    return slug
}

// ===== Conversas (mandar o link para o chat de alguém) =====
export interface MyChat { id: string; name: string; sub: string | null; avatar: string | null; isGroup: boolean }

const chatAvatar = (row: { other_avatar: string | null; other_is_store: boolean }) => {
    if (!row.other_avatar) return null
    if (row.other_is_store) return row.other_avatar.startsWith('http') ? row.other_avatar : supabase.storage.from('store-logos').getPublicUrl(row.other_avatar).data.publicUrl
    return getAvatarUrl(supabase, row.other_avatar) || null
}

/** Minhas conversas, da mais recente para a mais antiga (pessoas, lojas e grupos). */
export async function listMyChats(): Promise<MyChat[] | null> {
    const uid = await me()
    if (!uid) return null
    const { data } = await supabase.rpc('get_my_conversations', { p_scope: 'profile' })
    return ((data as any[]) || []).map((r) => ({
        id: r.id as string,
        name: (r.is_group ? r.other_name : r.other_name || (r.other_slug ? `@${r.other_slug}` : 'Conversa')) as string,
        sub: r.is_group ? `${r.member_count || 0} pessoas` : r.other_slug ? `@${r.other_slug}` : null,
        avatar: chatAvatar(r), isGroup: !!r.is_group,
    }))
}

/** Abre (ou retoma) a conversa com um perfil; só dá certo se a pessoa recebe conversas. Devolve o id da conversa. */
export async function startChatWith(profileId: string): Promise<string> {
    const { data, error } = await supabase.rpc('start_conversation', { p_owner_profile: profileId })
    if (error) throw error
    return data as string
}

export async function sendToChat(conversationId: string, text: string, url: string): Promise<void> {
    const uid = await me()
    if (!uid) throw new Error('Entre na sua conta para compartilhar.')
    const { error } = await supabase.from('direct_messages').insert({ conversation_id: conversationId, sender_id: uid, content: withLink(text, url) })
    if (error) throw error
    notifyChatMessage(conversationId)
}

// ===== Últimos lugares para onde a pessoa compartilhou (sugestões; só neste aparelho) =====
export interface RecentTarget { kind: 'community' | 'chat' | 'profile'; id: string; name: string; sub?: string | null; avatar?: string | null }
const RECENT_KEY = 'iuser_share_recent'

export function getRecentTargets(): RecentTarget[] {
    try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
        return Array.isArray(raw) ? raw.filter((t) => t && t.kind && t.name).slice(0, 6) : []
    } catch { return [] }
}
export function pushRecentTarget(t: RecentTarget) {
    try {
        const list = [t, ...getRecentTargets().filter((x) => !(x.kind === t.kind && x.id === t.id))].slice(0, 6)
        localStorage.setItem(RECENT_KEY, JSON.stringify(list))
    } catch { /* sem storage: só não lembra */ }
}
