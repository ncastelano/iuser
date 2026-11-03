// src/modules/flash/load.ts — o Flash falando com o banco (feed, postar, curtir, comentar, seguir). As regras de quem pode o quê moram no banco (RLS).
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { FlashItem, FlashMode, FLASH_MAX_BYTES, isR2Key, mediaKindOf, mediaPath, r2FallbackAllowed, rowToItem, validateComment, validateFlash } from './domain'
import { r2Availability, removeFromR2, uploadToR2 } from '@/lib/r2Upload'

export const PAGE_SIZE = 12

export async function fetchFeed(mode: FlashMode, before?: string | null, kind?: 'flash' | 'publication' | null): Promise<FlashItem[]> {
    const { data, error } = await supabase.rpc('get_flash_feed', { p_mode: mode, p_limit: PAGE_SIZE, p_before: before ?? null, p_kind: kind ?? null })
    if (error) throw error
    return ((data || []) as Record<string, any>[]).map(rowToItem)
}

/** Foto/vídeo do item. Vídeo vai direto do Storage (o proxy de imagens só serve imagem). */
export function mediaSrc(item: Pick<FlashItem, 'kind' | 'mediaUrl' | 'mediaType'>): string | null {
    const m = item.mediaUrl
    if (!m) return null
    if (/^https?:\/\//.test(m)) return m
    if (item.kind === 'flash' && item.mediaType === 'video' && isR2Key(m)) {
        const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || '').replace(/\/+$/, '')
        return base ? `${base}/${m}` : `/api/media/r2?key=${encodeURIComponent(m)}`   // sem o domínio de mídia, o servidor abre o vídeo por link assinado
    }
    if (item.kind === 'flash' && item.mediaType === 'video') return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/flash-media/${m}`
    return supabase.storage.from(item.kind === 'flash' ? 'flash-media' : 'product-images').getPublicUrl(m).data.publicUrl
}

export const authorAvatarUrl = (path: string | null): string | null => getAvatarUrl(supabase, path) ?? null

export async function postFlash(userId: string, content: string, file: File | null, opts: { onProgress?: (percent: number) => void } = {}): Promise<void> {
    // vídeo: se o R2 está pronto, o limite é o dele; senão, os 15 MB do Supabase
    const isVideo = !!file && mediaKindOf(file.type) === 'video'
    const r2 = isVideo ? await r2Availability('media_r2') : ({ available: false } as const)
    const problem = validateFlash({ content, file, videoMaxBytes: r2.available ? r2.maxBytes : undefined })
    if (problem) throw new Error(problem)
    let media_url: string | null = null
    let media_type: 'image' | 'video' | null = null
    if (file) {
        media_type = mediaKindOf(file.type)
        if (isVideo && r2.available) {
            const up = await uploadToR2(file, 'media_r2', { onProgress: opts.onProgress })
            if (up.ok) media_url = up.key
            else if (!r2FallbackAllowed(up.code) || file.size > FLASH_MAX_BYTES) throw new Error(up.message)   // regra recusou (ou o arquivo não cabe no Supabase): mostra o motivo
        }
        if (!media_url) {
            media_url = mediaPath(userId, file.type)
            const up = await supabase.storage.from('flash-media').upload(media_url, file, { contentType: file.type, cacheControl: '31536000' })
            if (up.error) throw new Error('Não foi possível enviar o arquivo.')
        }
    }
    const { error } = await supabase.from('flashes').insert({ author_id: userId, content: content.trim(), media_url, media_type })
    if (error) {
        if (isR2Key(media_url)) void removeFromR2(media_url!)   // o flash não entrou: não deixa o vídeo sobrando no R2
        throw new Error(error.message || 'Não foi possível postar.')
    }
}

export async function deleteFlash(id: string, mediaUrl?: string | null): Promise<void> {
    const { error } = await supabase.from('flashes').delete().eq('id', id)
    if (error) throw error
    if (isR2Key(mediaUrl)) void removeFromR2(mediaUrl!)   // libera o espaço no R2 (limpeza: nunca atrapalha apagar o flash)
}

/** Curtir/descurtir (flash: flash_likes; publicação: likes). O contador sobe/desce pelo gatilho do banco. */
export async function setLiked(item: Pick<FlashItem, 'kind' | 'id'>, userId: string, liked: boolean): Promise<void> {
    if (item.kind === 'flash') {
        const r = liked
            ? await supabase.from('flash_likes').insert({ flash_id: item.id, profile_id: userId })
            : await supabase.from('flash_likes').delete().eq('flash_id', item.id).eq('profile_id', userId)
        if (r.error && r.error.code !== '23505') throw r.error
    } else {
        const r = liked
            ? await supabase.from('likes').insert({ publication_id: item.id, profile_id: userId })
            : await supabase.from('likes').delete().eq('publication_id', item.id).eq('profile_id', userId)
        if (r.error && r.error.code !== '23505') throw r.error
    }
}

export async function setFollowing(authorId: string, userId: string, follow: boolean): Promise<void> {
    const r = follow
        ? await supabase.from('follows').insert({ follower_id: userId, following_id: authorId })
        : await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', authorId)
    if (r.error && r.error.code !== '23505') throw r.error
}

export interface FlashComment { id: string; authorId: string; authorName: string; authorSlug: string; authorAvatar: string | null; content: string; createdAt: string }

export async function fetchComments(flashId: string): Promise<FlashComment[]> {
    const { data, error } = await supabase.from('flash_comments').select('id, author_id, content, created_at').eq('flash_id', flashId).order('created_at', { ascending: true }).limit(100)
    if (error) throw error
    const rows = (data || []) as { id: string; author_id: string; content: string; created_at: string }[]
    const ids = Array.from(new Set(rows.map((r) => r.author_id)))
    const { data: people } = ids.length ? await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', ids) : { data: [] as any[] }
    const by = new Map((people || []).map((p: any) => [p.id, p]))
    return rows.map((r) => {
        const p: any = by.get(r.author_id)
        return { id: r.id, authorId: r.author_id, authorName: p?.name || 'Pessoa', authorSlug: p?.profileSlug || '', authorAvatar: p?.avatar_url || null, content: r.content, createdAt: r.created_at }
    })
}

export async function addComment(flashId: string, userId: string, text: string): Promise<void> {
    const problem = validateComment(text)
    if (problem) throw new Error(problem)
    const { error } = await supabase.from('flash_comments').insert({ flash_id: flashId, author_id: userId, content: text.trim() })
    if (error) throw new Error(error.message || 'Não foi possível comentar.')
}

export async function deleteComment(id: string): Promise<void> {
    const { error } = await supabase.from('flash_comments').delete().eq('id', id)
    if (error) throw error
}

export async function countShare(item: Pick<FlashItem, 'kind' | 'id'>): Promise<void> {
    if (item.kind === 'flash') await supabase.rpc('increment_flash_share_count', { p_flash: item.id })
}
