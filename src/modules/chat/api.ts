// src/modules/chat/api.ts
//
// Chat: salas 1 a 1 e grupos. Só chama as funções do banco (a regra de verdade mora lá: convite, limite de 30,
// administração). Nada de regra de negócio nesta camada.
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'

export interface PersonHit { id: string; slug: string | null; name: string | null; avatar: string | null }

export interface GroupMember {
    profile_id: string
    name: string | null
    profile_slug: string | null
    avatar_url: string | null
    role: 'admin' | 'member'
    status: 'active' | 'invited'
    muted: boolean
}

export interface GroupInvite {
    conversation_id: string
    title: string
    invited_by: string | null
    inviter_name: string | null
    inviter_slug: string | null
    inviter_avatar: string | null
    member_count: number
    created_at: string
}

export const GROUP_MAX_MEMBERS = 30

const toHit = (p: any): PersonHit => ({
    id: p.id,
    slug: p.profileSlug || null,
    name: p.name || null,
    avatar: getAvatarUrl(supabase, p.avatar_url) || null,
})

const PROFILE_COLS = 'id, name, "profileSlug", avatar_url'

/** Perfis que eu sigo (a tabela follows também guarda lojas: só entram os que são perfil) */
export async function listFollowing(me: string): Promise<PersonHit[]> {
    const { data: rows } = await supabase.from('follows').select('following_id').eq('follower_id', me).limit(300)
    const ids = Array.from(new Set((rows || []).map((r: any) => r.following_id as string))).filter((id) => id !== me)
    if (ids.length === 0) return []
    const { data } = await supabase.from('profiles').select(PROFILE_COLS).in('id', ids)
    return ((data || []) as any[]).map(toHit).sort((a, b) => (a.slug || a.name || '').localeCompare(b.slug || b.name || ''))
}

/** Qualquer perfil do iUser, por nome ou @usuário */
export async function searchPeople(query: string, me: string): Promise<PersonHit[]> {
    const q = query.trim().replace(/^@/, '').replace(/[%,()]/g, ' ')
    if (q.length < 2) return []
    const { data } = await supabase
        .from('profiles')
        .select(PROFILE_COLS)
        .or(`profileSlug.ilike.%${q}%,name.ilike.%${q}%`)
        .neq('id', me)
        .limit(20)
    return ((data || []) as any[]).map(toHit)
}

/** Uma pessoa só: a sala normal (a mesma de sempre, em qualquer direção) */
export async function startDirect(personId: string): Promise<string> {
    const { data, error } = await supabase.rpc('start_conversation', { p_owner_profile: personId })
    if (error) throw new Error(error.message)
    return data as string
}

export async function createGroup(title: string, memberIds: string[]): Promise<string> {
    const { data, error } = await supabase.rpc('create_group_conversation', { p_title: title, p_members: memberIds })
    if (error) throw new Error(error.message)
    void notifyGroupInvites(data as string)
    return data as string
}

export async function inviteToGroup(conversationId: string, memberIds: string[]): Promise<number> {
    const { data, error } = await supabase.rpc('invite_to_group', { p_conv: conversationId, p_members: memberIds })
    if (error) throw new Error(error.message)
    void notifyGroupInvites(conversationId)
    return Number(data) || 0
}

export async function respondGroupInvite(conversationId: string, accept: boolean): Promise<void> {
    const { error } = await supabase.rpc('respond_group_invite', { p_conv: conversationId, p_accept: accept })
    if (error) throw new Error(error.message)
}

export async function leaveGroup(conversationId: string): Promise<void> {
    const { error } = await supabase.rpc('leave_group', { p_conv: conversationId })
    if (error) throw new Error(error.message)
}

export async function removeGroupMember(conversationId: string, profileId: string): Promise<void> {
    const { error } = await supabase.rpc('remove_group_member', { p_conv: conversationId, p_profile: profileId })
    if (error) throw new Error(error.message)
}

export async function renameGroup(conversationId: string, title: string): Promise<void> {
    const { error } = await supabase.rpc('update_group', { p_conv: conversationId, p_title: title })
    if (error) throw new Error(error.message)
}

export async function setGroupMuted(conversationId: string, muted: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_group_muted', { p_conv: conversationId, p_muted: muted })
    if (error) throw new Error(error.message)
}

export async function getGroupMembers(conversationId: string): Promise<GroupMember[]> {
    const { data } = await supabase.rpc('get_group_members', { p_conv: conversationId })
    return (data as GroupMember[]) || []
}

export async function getMyGroupInvites(): Promise<GroupInvite[]> {
    const { data } = await supabase.rpc('get_my_group_invites')
    return ((data as GroupInvite[]) || []).map((i) => ({ ...i, member_count: Number(i.member_count) || 0 }))
}

/** Aviso no aparelho de quem foi convidado (best-effort; o convite em si já está no banco) */
export function notifyGroupInvites(conversationId: string) {
    return supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return
        return fetch('/api/push/send-group-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ conversationId }),
        }).catch(() => { /* silencioso */ })
    })
}
