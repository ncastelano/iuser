// src/modules/forum/load.ts — o Fórum fala com o banco (leitura pública; votar, sugerir e comentar só logado, por função do banco).
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import type { Category, Idea, IdeaStatus } from './domain'

export interface Release {
    id: string; version: string; title: string; summary: string | null
    added: string[]; improved: string[]; removed: string[]; releasedAt: string; comments: number
}
export interface ForumComment {
    id: string; body: string; createdAt: string; isTeam: boolean; isMine: boolean
    author: { name: string; slug: string | null; avatar: string | null }
}

const author = (p: any) => ({ name: p?.name || 'Pessoa', slug: p?.profileSlug || null, avatar: p?.avatar_url ? getAvatarUrl(supabase, p.avatar_url) || null : null })

export async function loadReleases(): Promise<Release[]> {
    const { data, error } = await supabase.from('forum_releases').select('id, version, title, summary, added, improved, removed, released_at, comment_count')
        .order('released_at', { ascending: false }).limit(50)
    if (error) throw error
    return (data || []).map((r: any) => ({ id: r.id, version: r.version, title: r.title, summary: r.summary, added: r.added || [], improved: r.improved || [],
        removed: r.removed || [], releasedAt: r.released_at, comments: r.comment_count || 0 }))
}

export async function loadIdeas(me: string | null): Promise<Idea[]> {
    const { data, error } = await supabase.from('forum_ideas')
        .select('id, title, body, category, status, status_note, up_count, down_count, comment_count, created_at, release_id, author_id, profiles!author_id(name, profileSlug, avatar_url)')
        .order('created_at', { ascending: false }).limit(300)
    if (error) throw error
    const mine = new Map<string, number>()
    if (me && data?.length) {
        const { data: v } = await supabase.from('forum_votes').select('idea_id, value').eq('voter_id', me)
        for (const x of v || []) mine.set((x as any).idea_id, (x as any).value)
    }
    return (data || []).map((r: any) => ({
        id: r.id, title: r.title, body: r.body, category: r.category as Category, status: r.status as IdeaStatus, statusNote: r.status_note,
        up: r.up_count, down: r.down_count, comments: r.comment_count, createdAt: r.created_at, releaseId: r.release_id,
        author: author(r.profiles), mine: (mine.get(r.id) as -1 | 1) || 0, isAuthor: !!me && r.author_id === me,
    }))
}

export async function loadComments(target: { idea?: string; release?: string }, me: string | null): Promise<ForumComment[]> {
    let q = supabase.from('forum_comments').select('id, body, created_at, is_team, author_id, profiles!author_id(name, profileSlug, avatar_url)').order('created_at', { ascending: true }).limit(200)
    q = target.idea ? q.eq('idea_id', target.idea) : q.eq('release_id', target.release!)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map((c: any) => ({ id: c.id, body: c.body, createdAt: c.created_at, isTeam: c.is_team, isMine: !!me && c.author_id === me, author: c.is_team ? { name: 'Equipe iUser', slug: null, avatar: null } : author(c.profiles) }))
}

export async function createIdea(title: string, body: string, category: Category): Promise<string> {
    const { data, error } = await supabase.rpc('forum_create_idea', { p_title: title, p_body: body, p_category: category })
    if (error) throw new Error(error.message)
    return data as string
}
export async function vote(idea: string, value: -1 | 0 | 1): Promise<{ up: number; down: number }> {
    const { data, error } = await supabase.rpc('forum_vote', { p_idea: idea, p_value: value })
    if (error) throw new Error(error.message)
    return { up: (data as any).up, down: (data as any).down }
}
export async function comment(target: { idea?: string; release?: string }, body: string): Promise<void> {
    const { error } = await supabase.rpc('forum_comment', { p_idea: target.idea || null, p_release: target.release || null, p_body: body })
    if (error) throw new Error(error.message)
}
export async function deleteComment(id: string): Promise<void> {
    const { error } = await supabase.rpc('forum_delete_comment', { p_comment: id })
    if (error) throw new Error(error.message)
}
