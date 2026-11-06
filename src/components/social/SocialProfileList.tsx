// src/components/social/SocialProfileList.tsx
//
// As listas de perfis do Social, uma por aba: QUEM EU SIGO e QUEM ME SEGUE (os melhores perfis agora são uma seção de "Agora no mundo").
// Era a página /social antiga; agora é a parte de baixo das abas do Social. A busca (`query`) filtra a lista carregada. Só dado público do perfil.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, User } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { hexToRgb } from '@/lib/color'
import { Spinner } from '@/components/Spinner'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import { useLastSeen } from '@/hooks/useLastSeen'
import SocialProfileCard, { type SocialCardStore } from './SocialProfileCard'

export type SocialListTab = 'sigo' | 'seguem'

interface ProfileWithDetails {
    id: string
    name: string
    avatar_url: string | null
    profileSlug: string
    description?: string | null
    bio?: string | null
    address?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    category?: string | null
    points?: number
    chat_enabled?: boolean
    show_location?: boolean | null
    show_in_social?: boolean | null
}

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const PROFILE_COLUMNS = `
    id,
    name,
    avatar_url,
    "profileSlug",
    description,
    bio,
    address:public_address,
    instagram,
    ratings_avg,
    ratings_count,
    is_seller,
    is_active,
    category,
    view_count,
    created_at,
    chat_enabled,
    show_location,
    show_in_social
`

export default function SocialProfileList({ tab, query, onOpenProfile }: {
    tab: SocialListTab
    query: string
    onOpenProfile: (p: { id: string; name: string; profileSlug: string; avatar_url: string | null }) => void
}) {
    const { userId } = useProfile()
    const { colors } = useTheme()

    const [profiles, setProfiles] = useState<ProfileWithDetails[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [storesByOwner, setStoresByOwner] = useState<Record<string, SocialCardStore>>({})
    const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
    const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({})
    // Colocação de cada perfil em Melhores perfis (1º, 2º...) — aparece como #N em qualquer aba
    const [rankById, setRankById] = useState<Record<string, number>>({})
    const lastSeen = useLastSeen(useMemo(() => profiles.map((p) => p.id), [profiles]))

    const loadProfiles = useCallback(async () => {
        setLoadingData(true)
        setError(null)
        try {
            let q = supabase.from('profiles').select(PROFILE_COLUMNS).eq('is_active', true)
            const info = new Map<string, { points: number }>()

            // Sem conta não há ninguém pra listar
            if (!userId) { setProfiles([]); setLoadingData(false); return }
            const { data: rel, error: relError } = tab === 'sigo'
                ? await supabase.from('follows').select('following_id').eq('follower_id', userId).order('created_at', { ascending: false }).limit(200)
                : await supabase.from('follows').select('follower_id').eq('following_id', userId).order('created_at', { ascending: false }).limit(200)
            if (relError) throw relError
            const ids = (rel || []).map((r: any) => (tab === 'sigo' ? r.following_id : r.follower_id))
            if (ids.length === 0) { setProfiles([]); setLoadingData(false); return }
            q = q.in('id', ids)

            const { data, error: qError } = await q.limit(100)
            if (qError) {
                console.error('Erro ao buscar perfis:', qError)
                setError('Erro ao carregar perfis')
                setProfiles([])
                setLoadingData(false)
                return
            }

            if (data) {
                // Os pontos aparecem nos cartões
                if (data.length > 0) {
                    const { data: extra } = await supabase.rpc('get_profiles_ranking_info', { p_ids: data.map((p: any) => p.id) })
                    ;(extra || []).forEach((r: any) => info.set(r.id, { points: r.points }))
                }
                const mapped = data.map((p: any) => ({
                    ...p,
                    avatar_url: getAvatarUrl(supabase, p.avatar_url),
                    ratings_avg: p.ratings_avg ?? null,
                    ratings_count: p.ratings_count ?? null,
                    points: info.get(p.id)?.points ?? 0,
                }))
                setProfiles(mapped)
            }
        } catch (err) {
            console.error('Erro ao carregar perfis:', err)
            setError('Erro ao carregar perfis')
            setProfiles([])
        }
        setLoadingData(false)
    }, [tab, userId])

    useEffect(() => { loadProfiles() }, [loadProfiles])

    useEffect(() => {
        supabase.rpc('get_best_profiles', { p_limit: 200 }).then(({ data }) => {
            setRankById(Object.fromEntries(((data as { id: string }[]) || []).map((r, i) => [r.id, i])))
        })
    }, [])

    // Loja de cada pessoa (se tiver) e quem eu já sigo, pros botões do cartão
    useEffect(() => {
        const ids = profiles.map((p) => p.id)
        if (ids.length === 0) return
        supabase.rpc('get_follower_counts', { p_ids: ids }).then(({ data }) => {
            setFollowerCounts(Object.fromEntries(((data as { profile_id: string; followers: number }[]) || []).map((r) => [r.profile_id, Number(r.followers)])))
        })
        supabase.from('stores').select('owner_id, name, storeSlug, logo_url').in('owner_id', ids).eq('is_active', true).then(({ data }) => {
            const map: Record<string, SocialCardStore> = {}
            ;(data || []).forEach((s: any) => {
                if (map[s.owner_id]) return
                map[s.owner_id] = { name: s.name, storeSlug: s.storeSlug, logoUrl: s.logo_url ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : null }
            })
            setStoresByOwner(map)
        })
        if (userId) {
            supabase.from('follows').select('following_id').eq('follower_id', userId).in('following_id', ids).then(({ data }) => {
                setFollowingIds(new Set((data || []).map((f: any) => f.following_id)))
            })
        } else {
            setFollowingIds(new Set())
        }
    }, [profiles, userId])

    const filtered = useMemo(() => {
        if (!query.trim()) return profiles
        const q = query.toLowerCase()
        return profiles.filter((p) =>
            p.name?.toLowerCase().includes(q) || p.profileSlug?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) ||
            p.bio?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
    }, [profiles, query])

    const emptyText = query
        ? 'Nenhum perfil encontrado para esta busca.'
        : tab === 'sigo' ? (userId ? 'Você ainda não segue ninguém. Siga perfis para ver aqui.' : 'Entre na sua conta para ver quem você segue.')
            : tab === 'seguem' ? (userId ? 'Ninguém te segue ainda.' : 'Entre na sua conta para ver quem te segue.')
                : 'Nenhum perfil disponível.'

    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`
    const box = { background: cardBg, backdropFilter: 'blur(12px)', border: `1px solid ${colors.border}` }

    if (loadingData) return <div className="flex justify-center py-16"><Spinner size={32} color={colors.accent} /></div>
    if (error) return (
        <div className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4" style={box}>
            <AlertCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>{error}</p>
            <button onClick={() => loadProfiles()} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: GRADIENT, color: '#ffffff' }}>Tentar novamente</button>
        </div>
    )
    if (filtered.length === 0) return (
        <div className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4" style={box}>
            <User className="w-8 h-8 opacity-40" style={{ color: colors.textSecondary }} />
            <p className="text-sm font-medium text-center" style={{ color: colors.textSecondary }}>{emptyText}</p>
            {!query && <p className="text-xs opacity-60" style={{ color: colors.textSecondary }}>Conecte-se com outros usuários da plataforma!</p>}
        </div>
    )
    return (
        <div className="flex flex-col">
            {filtered.map((profile) => (
                <SocialProfileCard
                    key={profile.id}
                    profile={profile}
                    store={storesByOwner[profile.id] || null}
                    rank={rankById[profile.id]}
                    isMe={profile.id === userId}
                    userId={userId || null}
                    following={followingIds.has(profile.id)}
                    followers={followerCounts[profile.id] ?? 0}
                    onFollowChange={(id, nowFollowing) => {
                        setFollowingIds((prev) => { const next = new Set(prev); if (nowFollowing) next.add(id); else next.delete(id); return next })
                        setFollowerCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (nowFollowing ? 1 : -1)) }))
                    }}
                    seenAt={lastSeen[profile.id]}
                    colors={colors}
                    cardBg={cardBg}
                    onOpen={() => onOpenProfile({ id: profile.id, name: profile.name, profileSlug: profile.profileSlug, avatar_url: profile.avatar_url })}
                />
            ))}
        </div>
    )
}
