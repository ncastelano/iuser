// app/components/SocialList.tsx
'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import {
    ChevronRight,
    Loader2,
    AlertCircle,
    User,
    MapPin,
    Star,
    Store,
    Clock,
    Clock as ClockIcon,
    X,
    Search,
} from 'lucide-react'
import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'

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
}

interface RecentProfile {
    id: string
    name: string
    profileSlug: string
    avatar_url: string | null
}

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function SocialList() {
    const router = useRouter()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [searchQuery, setSearchQuery] = useState('')
    const [profiles, setProfiles] = useState<ProfileWithDetails[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSearchFocused, setIsSearchFocused] = useState(false)
    const [recentProfiles, setRecentProfiles] = useState<RecentProfile[]>([])
    const searchInputRef = useRef<HTMLInputElement>(null)

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

    // ===== LOAD PROFILES =====
    const loadProfiles = useCallback(async () => {
        setLoadingData(true)
        setError(null)

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(`
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
                    created_at
                `)
                .eq('is_active', true)
                .order('view_count', { ascending: false })
                .order('ratings_avg', { ascending: false })
                .limit(100)

            if (error) {
                console.error('Erro ao buscar perfis:', error)
                setError('Erro ao carregar perfis')
                setProfiles([])
                setLoadingData(false)
                return
            }

            if (data) {
                const mapped = data.map((p: any) => ({
                    ...p,
                    avatar_url: getAvatarUrl(supabase, p.avatar_url),
                    ratings_avg: p.ratings_avg ?? null,
                    ratings_count: p.ratings_count ?? null,
                    view_count: p.view_count ?? null,
                }))
                setProfiles(mapped)
            }
        } catch (err) {
            console.error('Erro ao carregar perfis:', err)
            setError('Erro ao carregar perfis')
            setProfiles([])
        }

        setLoadingData(false)
    }, [])

    useEffect(() => {
        loadProfiles()
    }, [loadProfiles])

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
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return ''
        const date = new Date(dateString)
        const now = new Date()
        const diffTime = Math.abs(now.getTime() - date.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays === 0) return 'Hoje'
        if (diffDays === 1) return 'Ontem'
        if (diffDays < 7) return `${diffDays} dias atrás`
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses atrás`
        return `${Math.floor(diffDays / 365)} anos atrás`
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
                                            <div
                                                className="w-14 h-14 rounded-full overflow-hidden"
                                                style={{
                                                    background: `${colors.surface}44`,
                                                    padding: '2px',
                                                    backgroundImage: GRADIENT,
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
                            <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.accent }} />
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
                                        {searchQuery ? 'Nenhum perfil encontrado para esta busca.' : 'Nenhum perfil disponível.'}
                                    </p>
                                    {!searchQuery && (
                                        <p className="text-xs opacity-60" style={{ color: colors.textSecondary }}>
                                            Conecte-se com outros usuários da plataforma!
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredProfiles.map((profile) => (
                                        <Link
                                            key={profile.id}
                                            href={`/${profile.profileSlug}`}
                                            className="block group"
                                            onClick={() => {
                                                saveRecentProfile({
                                                    id: profile.id,
                                                    name: profile.name,
                                                    profileSlug: profile.profileSlug,
                                                    avatar_url: profile.avatar_url,
                                                })
                                            }}
                                        >
                                            <div
                                                className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
                                                style={{
                                                    background: cardBg,
                                                    backdropFilter: 'blur(12px)',
                                                    borderColor: colors.border,
                                                    boxShadow: colors.shadow,
                                                }}
                                            >
                                                <div className="flex gap-4">
                                                    <div
                                                        className="w-20 h-20 rounded-full overflow-hidden shrink-0"
                                                        style={{
                                                            background: `${colors.surface}44`,
                                                            padding: '2px',
                                                            backgroundImage: GRADIENT,
                                                        }}
                                                    >
                                                        <div
                                                            className="w-full h-full rounded-full overflow-hidden"
                                                            style={{
                                                                background: colors.surface,
                                                            }}
                                                        >
                                                            {profile.avatar_url && profile.avatar_url.trim() !== '' ? (
                                                                <img
                                                                    src={profile.avatar_url}
                                                                    alt={profile.name || 'Perfil'}
                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                    onError={(e) => {
                                                                        const target = e.target as HTMLImageElement
                                                                        target.style.display = 'none'
                                                                        const parent = target.parentElement
                                                                        if (parent) {
                                                                            const fallback = document.createElement('div')
                                                                            fallback.className = 'w-full h-full flex items-center justify-center text-3xl font-black'
                                                                            fallback.style.color = colors.textSecondary
                                                                            fallback.textContent = profile.name?.charAt(0).toUpperCase() || '?'
                                                                            parent.appendChild(fallback)
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <div
                                                                    className="w-full h-full flex items-center justify-center text-3xl font-black"
                                                                    style={{ color: colors.textSecondary }}
                                                                >
                                                                    {profile.name?.charAt(0).toUpperCase() || '?'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <h3
                                                                    className="text-lg font-black truncate"
                                                                    style={{ color: colors.textPrimary }}
                                                                >
                                                                    {profile.name || 'Usuário'}
                                                                </h3>
                                                                <p className="text-sm" style={{ color: colors.accent }}>
                                                                    @{profile.profileSlug}
                                                                </p>

                                                                {(profile.bio || profile.description) && (
                                                                    <p
                                                                        className="text-xs line-clamp-2 mt-1"
                                                                        style={{ color: colors.textSecondary }}
                                                                    >
                                                                        {profile.bio || profile.description}
                                                                    </p>
                                                                )}

                                                                {profile.address && (
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        <MapPin className="w-3 h-3 opacity-50" style={{ color: colors.textSecondary }} />
                                                                        <span className="text-xs truncate" style={{ color: colors.textSecondary }}>
                                                                            {profile.address.split(',')[0]?.trim() || profile.address}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                                {profile.is_seller && (
                                                                    <span
                                                                        className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                                                                        style={{
                                                                            background: `${colors.accent}20`,
                                                                            color: colors.accent
                                                                        }}
                                                                    >
                                                                        <Store className="w-3 h-3 inline mr-0.5" />
                                                                        Vendedor
                                                                    </span>
                                                                )}
                                                                {profile.category && (
                                                                    <span
                                                                        className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                                                                        style={{
                                                                            background: `#f9731620`,
                                                                            color: '#f97316'
                                                                        }}
                                                                    >
                                                                        {profile.category}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                                                            {profile.ratings_avg !== null &&
                                                                profile.ratings_avg !== undefined &&
                                                                profile.ratings_avg > 0 && (
                                                                    <div className="flex items-center gap-1">
                                                                        <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                                                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                                            {Number(profile.ratings_avg).toFixed(1)}
                                                                        </span>
                                                                        <span className="text-xs" style={{ color: colors.textSecondary }}>
                                                                            ({profile.ratings_count || 0})
                                                                        </span>
                                                                    </div>
                                                                )}

                                                            {profile.view_count !== null &&
                                                                profile.view_count !== undefined &&
                                                                profile.view_count > 0 && (
                                                                    <div className="flex items-center gap-1">
                                                                        <User size={14} style={{ color: colors.textSecondary }} />
                                                                        <span className="text-xs" style={{ color: colors.textSecondary }}>
                                                                            {profile.view_count} visualizações
                                                                        </span>
                                                                    </div>
                                                                )}

                                                            {profile.created_at && (
                                                                <div className="flex items-center gap-1">
                                                                    <Clock size={14} style={{ color: colors.textSecondary }} />
                                                                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                                                                        {formatDate(profile.created_at)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                            {profile.whatsapp && (
                                                                <span className="text-[10px] font-bold text-green-600">
                                                                    📱 WhatsApp
                                                                </span>
                                                            )}
                                                            {profile.instagram && (
                                                                <span className="text-[10px] font-bold text-pink-600">
                                                                    📸 Instagram
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <ChevronRight
                                                        className="w-5 h-5 self-center group-hover:text-orange-400 transition-colors"
                                                        style={{ color: colors.textSecondary }}
                                                    />
                                                </div>
                                            </div>
                                        </Link>
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