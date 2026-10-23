// Compartilhar DENTRO do iUser: mandar o link para uma comunidade em que a pessoa está, ou publicá-lo no próprio perfil.
// É o que o diálogo padrão de compartilhar (components/ShareLinkDialog) usa; as regras de quem pode o quê continuam no banco (RLS):
// só membro escreve na comunidade e só o dono cria publicação no próprio perfil.
import { supabase } from '@/lib/supabase/client'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'

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
