// src/lib/communityActivity.ts
//
// O que está acontecendo em cada comunidade (última mensagem e votação de foto em andamento), em lote.
// Usado na lista de comunidades e na home pra: mostrar o "evento" de votação e botar na frente quem tem novidade.
import { supabase } from '@/lib/supabase/client'

export interface CommunityActivity {
    lastMessageAt: number          // ms (0 = nunca)
    photoVoteActive: boolean
    photoCandidates: number
    photoEventAt: number           // ms (0 = sem evento)
    photoThumbs: string[]
    /** O mais recente entre a última mensagem e o último evento — quem tem isso maior fica na frente */
    activityAt: number
}

export async function fetchCommunitiesActivity(ids: string[]): Promise<Record<string, CommunityActivity>> {
    if (ids.length === 0) return {}
    const { data } = await supabase.rpc('get_communities_activity', { p_ids: ids })
    const out: Record<string, CommunityActivity> = {}
    ;((data as any[]) || []).forEach((r) => {
        const lastMessageAt = r.last_message_at ? new Date(r.last_message_at).getTime() : 0
        const photoEventAt = r.photo_event_at ? new Date(r.photo_event_at).getTime() : 0
        out[r.community_id] = {
            lastMessageAt,
            photoVoteActive: !!r.photo_vote_active,
            photoCandidates: Number(r.photo_candidates) || 0,
            photoEventAt,
            photoThumbs: r.photo_thumbs || [],
            activityAt: Math.max(lastMessageAt, photoEventAt),
        }
    })
    return out
}
