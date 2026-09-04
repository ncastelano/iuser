// components/FeaturedProfiles.tsx
'use client'

import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, UserCircle, ArrowRight } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ---------- Tipos ----------
interface ProfileCard {
    id: string
    slug: string
    name: string
    avatarUrl: string | null
}

// ---------- Props ----------
interface FeaturedProfilesProps {
    dragHandle?: ReactNode
    title?: string
    maxItems?: number
    className?: string
    onProfileClick?: (profileId: string, slug: string) => void
}

// ---------- Hook de dados ----------
function useFeaturedProfiles() {
    const [profiles, setProfiles] = useState<ProfileCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchProfiles = async () => {
            setLoading(true)
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, name, avatar_url, "profileSlug"')
                    .eq('is_active', true)
                    .not('profileSlug', 'is', null)
                    .order('view_count', { ascending: false })
                    .limit(30)

                if (error) {
                    console.error('[FeaturedProfiles] Erro ao buscar perfis:', error)
                    setLoading(false)
                    return
                }

                if (!data || data.length === 0) {
                    console.log('[FeaturedProfiles] Nenhum perfil encontrado')
                    setProfiles([])
                    setLoading(false)
                    return
                }

                console.log(`[FeaturedProfiles] ${data.length} perfis encontrados`)

                const cards: ProfileCard[] = data.map((p: any) => ({
                    id: p.id,
                    slug: p.profileSlug || p.id,
                    name: p.name || 'Usuário',
                    avatarUrl: p.avatar_url ? (getAvatarUrl(supabase, p.avatar_url) || null) : null,
                }))

                setProfiles(cards)
            } catch (error) {
                console.error('[FeaturedProfiles] Erro inesperado:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchProfiles()
    }, [])

    return { profiles, loading }
}

// ---------- Hook para detectar breakpoint ----------
function useBreakpoint() {
    const [itemsPerView, setItemsPerView] = useState(4)

    useEffect(() => {
        const update = () => {
            const width = window.innerWidth
            if (width >= 1280) {
                setItemsPerView(6)
            } else if (width >= 1024) {
                setItemsPerView(5)
            } else if (width >= 768) {
                setItemsPerView(4)
            } else if (width >= 500) {
                setItemsPerView(3)
            } else {
                setItemsPerView(2)
            }
        }

        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return itemsPerView
}

// ---------- Componente Principal ----------
export default function FeaturedProfiles({
    dragHandle,
    title = 'Pessoas em destaque',
    maxItems,
    className = '',
    onProfileClick,
}: FeaturedProfilesProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { profiles, loading } = useFeaturedProfiles()
    const itemsPerView = useBreakpoint()

    const displayProfiles = useMemo(() => {
        const result = maxItems && profiles.length > maxItems
            ? profiles.slice(0, maxItems)
            : profiles
        return result
    }, [profiles, maxItems])

    const [currentIndex, setCurrentIndex] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    const hasProfiles = useMemo(() => {
        return displayProfiles.length > 0
    }, [displayProfiles])

    const totalPages = Math.max(1, Math.ceil(displayProfiles.length / itemsPerView))

    // ===== AUTOPLAY =====
    useEffect(() => {
        if (isHovered || totalPages <= 1 || displayProfiles.length === 0) {
            if (autoPlayRef.current) {
                clearInterval(autoPlayRef.current)
                autoPlayRef.current = null
            }
            return
        }

        autoPlayRef.current = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % totalPages)
        }, 5000)

        return () => {
            if (autoPlayRef.current) {
                clearInterval(autoPlayRef.current)
                autoPlayRef.current = null
            }
        }
    }, [isHovered, totalPages, displayProfiles.length])

    useEffect(() => {
        setCurrentIndex(0)
    }, [itemsPerView])

    const goToNext = useCallback(() => {
        setCurrentIndex(prev => (prev + 1) % totalPages)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        setCurrentIndex(prev => (prev - 1 + totalPages) % totalPages)
    }, [totalPages])

    const goToPage = useCallback((page: number) => {
        setCurrentIndex(page)
    }, [])

    // ===== ITEMS ATUAIS =====
    const currentItems = useMemo(() => {
        if (displayProfiles.length === 0) return []

        const start = currentIndex * itemsPerView
        const items: ProfileCard[] = []

        for (let i = 0; i < itemsPerView; i++) {
            const index = (start + i) % displayProfiles.length
            items.push(displayProfiles[index])
        }

        return items
    }, [displayProfiles, currentIndex, itemsPerView])

    // ===== GRID COLUMNS =====
    const gridCols = itemsPerView >= 6 ? 'grid-cols-6'
        : itemsPerView >= 5 ? 'grid-cols-5'
            : itemsPerView >= 4 ? 'grid-cols-4'
                : itemsPerView >= 3 ? 'grid-cols-3'
                    : 'grid-cols-2'

    // ===== HANDLE CLICK =====
    const handleProfileClick = (profile: ProfileCard) => {
        if (onProfileClick) {
            onProfileClick(profile.id, profile.slug)
            return
        }
        startNavProgress()
        router.push(`/${profile.slug}`)
    }

    // ===== HANDLE "VER TODOS" =====
    const handleViewAll = () => {
        startNavProgress()
        router.push('/social')
    }

    // ===== LOADING =====
    if (loading) {
        return (
            <div className={`w-full ${className}`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        {dragHandle}
                        <div className="h-6 rounded w-48 animate-pulse" style={{ background: `${colors.border}60` }} />
                    </div>
                </div>
                <div className={`grid ${gridCols} gap-4`}>
                    {Array.from({ length: Math.min(itemsPerView, 6) }).map((_, i) => (
                        <div
                            key={i}
                            className="aspect-[3/4] rounded-xl animate-pulse"
                            style={{ background: `${colors.border}40` }}
                        />
                    ))}
                </div>
            </div>
        )
    }

    if (!profiles.length) {
        console.log('[FeaturedProfiles] Nenhum perfil para exibir')
        return null
    }

    // ===== RENDER =====
    return (
        <div
            className={`relative w-full ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Título */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {dragHandle}
                    <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>
                        {title}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                        background: `${colors.accent}20`,
                        color: colors.accent
                    }}>
                        {profiles.length}
                    </span>
                </div>

                {hasProfiles && (
                    <button
                        onClick={handleViewAll}
                        className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 2px 8px rgba(249, 115, 22, 0.3)`,
                        }}
                    >
                        <span>Ver todas as pessoas</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Grid de perfis */}
            <div className="relative">
                <div className={`grid ${gridCols} gap-4 transition-all duration-500`}>
                    {currentItems.map((profile, idx) => (
                        <div
                            key={`${profile.id}-${idx}`}
                            onClick={() => handleProfileClick(profile)}
                            className="group relative rounded-xl overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                            style={{
                                borderColor: colors.border,
                                background: colors.surface,
                                aspectRatio: '3/4',
                            }}
                        >
                            {profile.avatarUrl ? (
                                <>
                                    <img
                                        src={profile.avatarUrl}
                                        alt={profile.name}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                                </>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center"
                                    style={{ background: GRADIENT, opacity: 0.3 }}>
                                    <UserCircle className="w-12 h-12 opacity-30" style={{ color: colors.textPrimary }} />
                                </div>
                            )}

                            {/* Conteúdo na parte inferior - Nome e @slug */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                                <h3 className="text-white font-semibold text-sm leading-tight line-clamp-1 drop-shadow-lg">
                                    {profile.name}
                                </h3>
                                <p className="text-white/70 text-xs leading-tight line-clamp-1 drop-shadow-lg">
                                    @{profile.slug}
                                </p>
                            </div>

                            {/* Efeito de brilho no hover */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"
                                style={{
                                    boxShadow: `inset 0 0 40px ${colors.accent}30`,
                                    border: `2px solid ${colors.accent}40`,
                                }}
                            />
                        </div>
                    ))}
                </div>

                {/* Paginação inferior */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-4">
                        <button
                            onClick={goToPrev}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                            aria-label="Anterior"
                        >
                            <ChevronLeft size={14} />
                        </button>

                        <div className="flex items-center gap-1.5">
                            {Array.from({ length: totalPages }).map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => goToPage(idx)}
                                    className="rounded-full transition-all duration-300"
                                    style={{
                                        width: idx === currentIndex ? '1.2rem' : '0.5rem',
                                        height: '0.5rem',
                                        background: idx === currentIndex ? '#f97316' : colors.border,
                                        boxShadow: idx === currentIndex ? `0 0 8px #f9731650` : 'none',
                                    }}
                                    aria-label={`Ir para página ${idx + 1}`}
                                />
                            ))}
                        </div>

                        <span className="text-xs font-medium px-2" style={{ color: colors.textSecondary }}>
                            {currentIndex + 1}/{totalPages}
                        </span>

                        <button
                            onClick={goToNext}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                            aria-label="Próximo"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
