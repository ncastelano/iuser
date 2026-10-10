// src/hooks/useProfileCardData.ts
//
// Tudo que o cartão de perfil do /social (SocialProfileCard) precisa, a partir de uma lista de ids de perfil: os dados do
// perfil, a loja de cada um, quem eu sigo, quantos seguidores, os pontos e o "visto por último". Em lote (uma consulta por
// tipo de dado), pra reaproveitar o mesmo cartão em outras telas (busca da home, últimos acessados...).
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { useLastSeen } from '@/hooks/useLastSeen'
import type { SocialCardProfile, SocialCardStore } from '@/app/(main)/social/SocialProfileCard'

const COLUMNS = 'id, name, avatar_url, "profileSlug", description, bio, address, ratings_avg, ratings_count, category, chat_enabled, show_location, show_in_social'

export function useProfileCardData(ids: string[], viewerId: string | null | undefined) {
    const key = useMemo(() => Array.from(new Set(ids)).join(','), [ids])
    const uniqueIds = useMemo(() => (key ? key.split(',') : []), [key])

    const [profiles, setProfiles] = useState<Record<string, SocialCardProfile>>({})
    const [storesByOwner, setStoresByOwner] = useState<Record<string, SocialCardStore>>({})
    const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({})
    const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const lastSeen = useLastSeen(uniqueIds)

    useEffect(() => {
        if (uniqueIds.length === 0) { setProfiles({}); setStoresByOwner({}); setFollowerCounts({}); setFollowingIds(new Set()); return }
        let cancelled = false
        setLoading(true)
        const slice = uniqueIds.slice(0, 100)
        ;(async () => {
            const [profRes, pointsRes, storesRes, countsRes, followsRes] = await Promise.all([
                supabase.from('profiles').select(COLUMNS).in('id', slice).eq('is_active', true),
                supabase.rpc('get_profiles_ranking_info', { p_ids: slice }),
                supabase.from('stores').select('owner_id, name, storeSlug, logo_url').in('owner_id', slice).eq('is_active', true),
                supabase.rpc('get_follower_counts', { p_ids: slice }),
                viewerId ? supabase.from('follows').select('following_id').eq('follower_id', viewerId).in('following_id', slice) : Promise.resolve({ data: [] as any[] }),
            ])
            if (cancelled) return
            const points = new Map<string, number>(((pointsRes.data as { id: string; points: number }[]) || []).map((r) => [r.id, r.points]))
            setProfiles(Object.fromEntries((profRes.data || []).map((p: any) => [p.id, {
                ...p,
                avatar_url: getAvatarUrl(supabase, p.avatar_url),
                points: points.get(p.id) ?? 0,
            } as SocialCardProfile])))
            const map: Record<string, SocialCardStore> = {}
            ;(storesRes.data || []).forEach((s: any) => {
                if (map[s.owner_id]) return
                map[s.owner_id] = { name: s.name, storeSlug: s.storeSlug, logoUrl: s.logo_url ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : null }
            })
            setStoresByOwner(map)
            setFollowerCounts(Object.fromEntries(((countsRes.data as { profile_id: string; followers: number }[]) || []).map((r) => [r.profile_id, Number(r.followers)])))
            setFollowingIds(new Set(((followsRes.data as any[]) || []).map((f) => f.following_id)))
            setLoading(false)
        })()
        return () => { cancelled = true }
    }, [uniqueIds, viewerId])

    const onFollowChange = useCallback((id: string, nowFollowing: boolean) => {
        setFollowingIds((prev) => {
            const next = new Set(prev)
            if (nowFollowing) next.add(id); else next.delete(id)
            return next
        })
        setFollowerCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (nowFollowing ? 1 : -1)) }))
    }, [])

    return { profiles, storesByOwner, followerCounts, followingIds, lastSeen, loading, onFollowChange }
}
