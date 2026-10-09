// app/components/SocialList.tsx
'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { hexToRgb } from '@/lib/color'
import {
    ChevronRight,
    AlertCircle,
    User,
    MapPin,
    Star,
    Store,
    Clock,
    Clock as ClockIcon,
    X,
    Search,
    Trophy,
    Heart,
    Users,
    Sparkles,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useLastSeen } from '@/hooks/useLastSeen'
import SocialProfileCard, { type SocialCardStore } from './SocialProfileCard'

interface ProfileWithDetails {
    id: string
    name: string
    avatar_url: string | null
    profileSlug: string
    description?: string | null
    bio?: string | null
    address?: string | null
    whatsapp?: string | null
    instagram?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    is_seller?: boolean
    is_active?: boolean
    category?: string | null
    view_count?: number | null
    created_at?: string | null
    // Pontuação (Melhores perfis = quem tem mais pontos primeiro)
    points?: number
    chat_enabled?: boolean
    show_location?: boolean | null
    show_in_social?: boolean | null
}

interface RecentProfile {
    id: string
    name: string
    profileSlug: string
    avatar_url: string | null
}

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type SocialTab = 'melhores' | 'sigo' | 'seguem' | 'novos'

const PROFILE_COLUMNS = `
    id,
    name,
    avatar_url,
    "profileSlug",
    description,
    bio,
    address,
    whatsapp,
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

export default function SocialList() {
    const router = useRouter()
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [searchQuery, setSearchQuery] = useState('')
    // Os melhores perfis da plataforma sempre vêm primeiro: já é a aba que abre
    const [tab, setTab] = useState<SocialTab>('melhores')
    const [profiles, setProfiles] = useState<ProfileWithDetails[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSearchFocused, setIsSearchFocused] = useState(false)
    const [recentProfiles, setRecentProfiles] = useState<RecentProfile[]>([])
    const searchInputRef = useRef<HTMLInputElement>(null)
    // Visto por último: só vem de quem deixou visível pra mim
    const [storesByOwner, setStoresByOwner] = useState<Record<string, SocialCardStore>>({})
    const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
    const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({})
    // Colocação de cada perfil em Melhores perfis (1º, 2º...) — aparece como #N em qualquer aba
    const [rankById, setRankById] = useState<Record<string, number>>({})
    const lastSeen = useLastSeen(useMemo(() => profiles.map((p) => p.id), [profiles]))

    // ===== RECENT PROFILES (últimos perfis visitados) =====
    const loadRecentProfiles = useCallback(() => {
        try {
            const saved = localStorage.getItem('social_recent_profiles')
            if (saved) {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    setRecentProfiles(parsed.slice(0, 5))
                }
            }
        } catch (e) {
            console.error('Erro ao carregar perfis recentes:', e)
        }
    }, [])

    const saveRecentProfile = useCallback((profile: { id: string; name: string; profileSlug: string; avatar_url: string | null }) => {
        try {
            const saved = localStorage.getItem('social_recent_profiles')
            let profiles: RecentProfile[] = saved ? JSON.parse(saved) : []

            profiles = profiles.filter(p => p.id !== profile.id)

            profiles.unshift({
                id: profile.id,
                name: profile.name,
                profileSlug: profile.profileSlug,
                avatar_url: profile.avatar_url,
            })

            profiles = profiles.slice(0, 5)

            localStorage.setItem('social_recent_profiles', JSON.stringify(profiles))
            setRecentProfiles(profiles)
        } catch (e) {
            console.error('Erro ao salvar perfil recente:', e)
        }
    }, [])

    const removeRecentProfile = useCallback((profileId: string) => {
        try {
            const saved = localStorage.getItem('social_recent_profiles')
            if (saved) {
                let profiles: RecentProfile[] = JSON.parse(saved)
                profiles = profiles.filter(p => p.id !== profileId)
                localStorage.setItem('social_recent_profiles', JSON.stringify(profiles))
                setRecentProfiles(profiles)
            }
        } catch (e) {
            console.error('Erro ao remover perfil recente:', e)
        }
    }, [])

    const clearRecentProfiles = useCallback(() => {
        try {
            localStorage.removeItem('social_recent_profiles')
            setRecentProfiles([])
        } catch (e) {
            console.error('Erro ao limpar perfis recentes:', e)
        }
    }, [])

    useEffect(() => {
        loadRecentProfiles()
    }, [loadRecentProfiles])

    // ===== LOAD PROFILES (por aba) =====
    const loadProfiles = useCallback(async () => {
        setLoadingData(true)
        setError(null)

        try {
            let query = supabase.from('profiles').select(PROFILE_COLUMNS).eq('is_active', true)
            // Na aba Melhores a ordem vem do banco (mais pontos primeiro); o resto ordena aqui
            let rankedIds: string[] | null = null
            const info = new Map<string, { points: number }>()

            if (tab === 'sigo' || tab === 'seguem') {
                // Sem conta não há ninguém pra listar
                if (!userId) { setProfiles([]); setLoadingData(false); return }
                const { data: rel, error: relError } = tab === 'sigo'
                    ? await supabase.from('follows').select('following_id').eq('follower_id', userId).order('created_at', { ascending: false }).limit(200)
                    : await supabase.from('follows').select('follower_id').eq('following_id', userId).order('created_at', { ascending: false }).limit(200)
                if (relError) throw relError
                const ids = (rel || []).map((r: any) => (tab === 'sigo' ? r.following_id : r.follower_id))
                if (ids.length === 0) { setProfiles([]); setLoadingData(false); return }
                query = query.in('id', ids)
            } else if (tab === 'novos') {
                query = query.order('created_at', { ascending: false })
            } else {
                // Melhores: quem tem mais pontos primeiro
                const { data: ranked, error: rankError } = await supabase.rpc('get_best_profiles', { p_limit: 100 })
                if (rankError) throw rankError
                rankedIds = ((ranked || []) as { id: string }[]).map((r) => r.id)
                ;(ranked || []).forEach((r: any) => info.set(r.id, { points: r.points }))
                if (rankedIds.length === 0) { setProfiles([]); setLoadingData(false); return }
                query = query.in('id', rankedIds)
            }

            const { data, error } = rankedIds ? await query : await query.limit(100)

            if (error) {
                console.error('Erro ao buscar perfis:', error)
                setError('Erro ao carregar perfis')
                setProfiles([])
                setLoadingData(false)
                return
            }

            if (data) {
                // As outras abas também mostram os pontos nos cartões
                if (!rankedIds && data.length > 0) {
                    const { data: extra } = await supabase.rpc('get_profiles_ranking_info', { p_ids: data.map((p: any) => p.id) })
                    ;(extra || []).forEach((r: any) => info.set(r.id, { points: r.points }))
                }
                let mapped = data.map((p: any) => ({
                    ...p,
                    avatar_url: getAvatarUrl(supabase, p.avatar_url),
                    ratings_avg: p.ratings_avg ?? null,
                    ratings_count: p.ratings_count ?? null,
                    view_count: p.view_count ?? null,
                    points: info.get(p.id)?.points ?? 0,
                }))
                if (rankedIds) {
                    const order = new Map(rankedIds.map((id, i) => [id, i]))
                    mapped = mapped.sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
                }
                setProfiles(mapped)
            }
        } catch (err) {
            console.error('Erro ao carregar perfis:', err)
            setError('Erro ao carregar perfis')
            setProfiles([])
        }

        setLoadingData(false)
    }, [tab, userId])

    useEffect(() => {
        loadProfiles()
    }, [loadProfiles])

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

    const filteredProfiles = useMemo(() => {
        if (!searchQuery.trim()) return profiles
        const q = searchQuery.toLowerCase()
        return profiles.filter(
            (p) =>
                p.name?.toLowerCase().includes(q) ||
                p.profileSlug?.toLowerCase().includes(q) ||
                p.description?.toLowerCase().includes(q) ||
                p.bio?.toLowerCase().includes(q) ||
                p.address?.toLowerCase().includes(q) ||
                p.category?.toLowerCase().includes(q)
        )
    }, [profiles, searchQuery])

    const tabs = useMemo(() => ([
        { id: 'melhores', label: 'Melhores perfis', icon: Trophy, onClick: () => setTab('melhores'), isActive: tab === 'melhores' },
        { id: 'sigo', label: 'Quem eu sigo', icon: Heart, onClick: () => setTab('sigo'), isActive: tab === 'sigo' },
        { id: 'seguem', label: 'Quem me segue', icon: Users, onClick: () => setTab('seguem'), isActive: tab === 'seguem' },
        { id: 'novos', label: 'Entraram por último', icon: Sparkles, onClick: () => setTab('novos'), isActive: tab === 'novos' },
    ]), [tab])

    const emptyText = searchQuery
        ? 'Nenhum perfil encontrado para esta busca.'
        : tab === 'sigo' ? (userId ? 'Você ainda não segue ninguém. Siga perfis para ver aqui.' : 'Entre na sua conta para ver quem você segue.')
            : tab === 'seguem' ? (userId ? 'Ninguém te segue ainda.' : 'Entre na sua conta para ver quem te segue.')
                : 'Nenhum perfil disponível.'

    // ===== HANDLERS =====
    const handleSearchFocus = useCallback(() => {
        setIsSearchFocused(true)
        if (!searchQuery.trim()) {
            loadRecentProfiles()
        }
    }, [loadRecentProfiles, searchQuery])

    const handleSearchBlur = useCallback(() => {
        setTimeout(() => {
            setIsSearchFocused(false)
        }, 200)
    }, [])

    // ===== STYLES =====
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return ''
        const date = new Date(dateString)
        const now = new Date()
        // Compara por dia de calendário (não por 24h corridas) - senão um
        // perfil criado hoje às 23h já contava quase 1 dia inteiro de
        // diferença e o Math.ceil arredondava pra cima, mostrando "Ontem"
        // pra algo criado minutos atrás.
        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
        const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / (1000 * 60 * 60 * 24))

        if (diffDays <= 0) return 'Hoje'
        if (diffDays === 1) return 'Ontem'
        if (diffDays < 7) return `${diffDays} dias atrás`
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses atrás`
        return `${Math.floor(diffDays / 365)} anos atrás`
    }

    // Data de criação da conta (não é o último acesso): deixa claro que é quando a pessoa ENTROU
    const joinedLabel = (dateString?: string | null) => {
        const t = formatDate(dateString)
        if (t === 'Hoje') return 'Entrou hoje'
        if (t === 'Ontem') return 'Entrou ontem'
        return `Entrou ${t.replace(' atrás', '').replace(/^(\d)/, 'há $1')}`
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Social"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    tabs={tabs}
                    showSearch={true}
                    searchPlaceholder="Buscar nome ou @iusername"
                    onSearch={setSearchQuery}
                    searchValue={searchQuery}
                    searchRef={searchInputRef}
                    onSearchFocus={handleSearchFocus}
                    onSearchBlur={handleSearchBlur}
                />

                <section className="px-4 md:px-6 mt-2 pb-24">
                    {/* Recent Profiles Dropdown */}
                    {isSearchFocused && !searchQuery.trim() && recentProfiles.length > 0 && (
                        <div
                            className="rounded-2xl p-4 mb-4 border"
                            style={{
                                background: cardBg,
                                backdropFilter: 'blur(12px)',
                                borderColor: colors.border,
                                boxShadow: colors.shadow,
                            }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <ClockIcon size={14} style={{ color: colors.textSecondary }} />
                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                        Últimos perfis visitados
                                    </span>
                                </div>
                                <button
                                    onClick={clearRecentProfiles}
                                    className="text-[10px] font-bold uppercase tracking-wider hover:opacity-70 transition"
                                    style={{ color: colors.textSecondary }}
                                >
                                    Limpar tudo
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {recentProfiles.map((profile) => (
                                    <div
                                        key={profile.id}
                                        className="relative"
                                    >
                                        <button
                                            onClick={() => {
                                                router.push(`/${profile.profileSlug}`)
                                                setIsSearchFocused(false)
                                            }}
                                            className="flex flex-col items-center gap-1 transition hover:scale-105"
                                        >
                                            <PlanAvatarRing userId={profile.id} width={3}>
                                                <div
                                                    className="w-14 h-14 rounded-full overflow-hidden"
                                                    style={{
                                                        background: `${colors.surface}44`,
                                                    }}
                                                >
                                                    <div
                                                        className="w-full h-full rounded-full overflow-hidden"
                                                        style={{
                                                            background: colors.surface,
                                                        }}
                                                    >
                                                        {profile.avatar_url ? (
                                                            <img
                                                                src={profile.avatar_url}
                                                                alt={profile.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div
                                                                className="w-full h-full flex items-center justify-center text-xl font-black"
                                                                style={{ color: colors.textSecondary }}
                                                            >
                                                                {profile.name?.charAt(0).toUpperCase() || '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </PlanAvatarRing>
                                            <span
                                                className="text-[10px] font-bold truncate max-w-[60px]"
                                                style={{ color: colors.textSecondary }}
                                            >
                                                @{profile.profileSlug}
                                            </span>
                                        </button>
                                        {/* Botão X sempre visível */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                removeRecentProfile(profile.id)
                                            }}
                                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                            style={{
                                                background: GRADIENT,
                                                border: '2px solid white',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                            }}
                                        >
                                            <X
                                                size={10}
                                                style={{ color: '#ffffff' }}
                                            />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {loadingData && (
                        <div className="flex justify-center py-20">
                            <Spinner size={32} color={colors.accent} />
                        </div>
                    )}

                    {error && !loadingData && (
                        <div
                            className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                            style={{
                                background: cardBg,
                                backdropFilter: 'blur(12px)',
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <AlertCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
                            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                {error}
                            </p>
                            <button
                                onClick={() => loadProfiles()}
                                className="px-4 py-2 rounded-xl text-xs font-bold"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                }}
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {!loadingData && !error && (
                        <>
                            {filteredProfiles.length === 0 ? (
                                <div
                                    className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                                    style={{
                                        background: cardBg,
                                        backdropFilter: 'blur(12px)',
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <User className="w-8 h-8 opacity-40" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                        {emptyText}
                                    </p>
                                    {!searchQuery && (
                                        <p className="text-xs opacity-60" style={{ color: colors.textSecondary }}>
                                            Conecte-se com outros usuários da plataforma!
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                                    {filteredProfiles.map((profile) => (
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
                                                setFollowingIds((prev) => {
                                                    const next = new Set(prev)
                                                    if (nowFollowing) next.add(id); else next.delete(id)
                                                    return next
                                                })
                                                setFollowerCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (nowFollowing ? 1 : -1)) }))
                                            }}
                                            seenAt={lastSeen[profile.id]}
                                            colors={colors}
                                            cardBg={cardBg}
                                            onOpen={() => {
                                                saveRecentProfile({ id: profile.id, name: profile.name, profileSlug: profile.profileSlug, avatar_url: profile.avatar_url })
                                                router.push(`/${profile.profileSlug}`)
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    )
}