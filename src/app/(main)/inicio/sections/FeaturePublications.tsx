//app/(main)/inicio/sections/FeaturePublications.tsx
'use client'

import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Store, ArrowRight, UserCircle } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ---------- Tipos ----------
interface PublicationCard {
    id: string
    slug: string
    imageUrl: string | null
    title: string | null
    ownerName: string
    ownerSlug: string
    ownerImageUrl: string | null
    ownerType: 'profile' | 'store'
    ownerId: string
    isProfileAvatar: boolean
}

// ---------- Props ----------
interface FeaturedPublicationsProps {
    dragHandle?: ReactNode
    title?: string
    maxItems?: number
    className?: string
    onPublicationClick?: (productId: string, slug: string) => void
}

// ---------- Hook de dados ----------
function usePublications() {
    const [publications, setPublications] = useState<PublicationCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchPublications = async () => {
            setLoading(true)
            try {
                const { data: publicationsList, error: pubErr } = await supabase
                    .from('products')
                    .select('id, slug, name, description, image_url, store_id, owner_id, listing_type')
                    .eq('listing_type', 'publication')
                    .eq('is_active', true)
                    .order('view_count', { ascending: false })
                    .limit(30)

                if (pubErr) {
                    console.error('[FeaturedPublications] Erro ao buscar publicações:', pubErr)
                    setLoading(false)
                    return
                }

                if (!publicationsList || publicationsList.length === 0) {
                    console.log('[FeaturedPublications] Nenhuma publicação encontrada')
                    setPublications([])
                    setLoading(false)
                    return
                }

                console.log(`[FeaturedPublications] ${publicationsList.length} publicações encontradas`)

                const withStore = publicationsList.filter(p => p.store_id)
                const withProfile = publicationsList.filter(p => p.owner_id && !p.store_id)

                const storeIds = [...new Set(withStore.map(p => p.store_id).filter(Boolean))] as string[]
                let storeMap = new Map()
                if (storeIds.length > 0) {
                    const { data: storesList } = await supabase
                        .from('stores')
                        .select('id, name, storeSlug, logo_url, owner_id')
                        .in('id', storeIds)

                    if (storesList) {
                        storeMap = new Map(storesList.map(s => [s.id, s]))
                    }
                }

                const profileIds = [...new Set([
                    ...withProfile.map(p => p.owner_id).filter(Boolean),
                    ...withStore.map(p => {
                        const store = storeMap.get(p.store_id)
                        return store?.owner_id
                    }).filter(Boolean)
                ])] as string[]

                let profileMap = new Map()
                if (profileIds.length > 0) {
                    const { data: profilesList } = await supabase
                        .from('profiles')
                        .select('id, name, avatar_url, profileSlug')
                        .in('id', profileIds)

                    if (profilesList) {
                        profileMap = new Map(profilesList.map(p => [p.id, p]))
                    }
                }

                const cards: PublicationCard[] = publicationsList.map(pub => {
                    let ownerType: 'profile' | 'store' = 'profile'
                    let ownerName = 'Usuário'
                    let ownerSlug = '#'
                    let ownerImageUrl: string | null = null
                    let isProfileAvatar = true
                    let ownerId = pub.owner_id || ''

                    if (pub.store_id) {
                        const store = storeMap.get(pub.store_id)
                        if (store) {
                            ownerType = 'store'
                            ownerName = store.name || 'Loja'
                            ownerSlug = store.storeSlug || '#'
                            ownerImageUrl = store.logo_url || null
                            isProfileAvatar = false
                            ownerId = store.owner_id || pub.owner_id || ''
                        } else {
                            if (pub.owner_id) {
                                const profile = profileMap.get(pub.owner_id)
                                if (profile) {
                                    ownerType = 'profile'
                                    ownerName = profile.name || 'Usuário'
                                    ownerSlug = profile.profileSlug || '#'
                                    ownerImageUrl = profile.avatar_url || null
                                    isProfileAvatar = true
                                    ownerId = profile.id
                                }
                            }
                        }
                    } else if (pub.owner_id) {
                        const profile = profileMap.get(pub.owner_id)
                        if (profile) {
                            ownerType = 'profile'
                            ownerName = profile.name || 'Usuário'
                            ownerSlug = profile.profileSlug || '#'
                            ownerImageUrl = profile.avatar_url || null
                            isProfileAvatar = true
                            ownerId = profile.id
                        }
                    }

                    const imageUrl = pub.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                        : null

                    let finalOwnerImage: string | null = null

                    if (ownerImageUrl) {
                        if (isProfileAvatar) {
                            finalOwnerImage = getAvatarUrl(supabase, ownerImageUrl) || null
                        } else {
                            try {
                                const { data } = supabase.storage.from('store-logos').getPublicUrl(ownerImageUrl)
                                finalOwnerImage = data?.publicUrl || null
                            } catch {
                                finalOwnerImage = null
                            }
                        }
                    }

                    return {
                        id: pub.id,
                        slug: pub.slug || pub.id,
                        imageUrl,
                        title: pub.name || null,
                        ownerName,
                        ownerSlug,
                        ownerImageUrl: finalOwnerImage,
                        ownerType,
                        ownerId,
                        isProfileAvatar
                    }
                })

                console.log('[FeaturedPublications] Cards gerados:', cards.length)
                setPublications(cards)
            } catch (error) {
                console.error('[FeaturedPublications] Erro inesperado:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchPublications()
    }, [])

    return { publications, loading }
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
export default function FeaturedPublications({
    dragHandle,
    title = 'Publicações em destaque',
    maxItems,
    className = '',
    onPublicationClick,
}: FeaturedPublicationsProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { publications, loading } = usePublications()
    const itemsPerView = useBreakpoint()

    const displayPublications = useMemo(() => {
        const result = maxItems && publications.length > maxItems
            ? publications.slice(0, maxItems)
            : publications
        return result
    }, [publications, maxItems])

    const [currentIndex, setCurrentIndex] = useState(0)
    const [isHovered, setIsHovered] = useState(false)

    const hasPublications = useMemo(() => {
        return displayPublications.length > 0
    }, [displayPublications])

    const totalPages = Math.max(1, Math.ceil(displayPublications.length / itemsPerView))

    // ===== AUTOPLAY =====
    useEffect(() => {
        if (isHovered || totalPages <= 1 || displayPublications.length === 0) {
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
    }, [isHovered, totalPages, displayPublications.length])

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
        if (displayPublications.length === 0) return []

        const start = currentIndex * itemsPerView
        const items: PublicationCard[] = []

        for (let i = 0; i < itemsPerView; i++) {
            const index = (start + i) % displayPublications.length
            items.push(displayPublications[index])
        }

        return items
    }, [displayPublications, currentIndex, itemsPerView])

    // ===== GRID COLUMNS =====
    const gridCols = itemsPerView >= 6 ? 'grid-cols-6'
        : itemsPerView >= 5 ? 'grid-cols-5'
            : itemsPerView >= 4 ? 'grid-cols-4'
                : itemsPerView >= 3 ? 'grid-cols-3'
                    : 'grid-cols-2'

    // ===== HANDLE CLICK =====
    const handlePublicationClick = (pub: PublicationCard) => {
        if (onPublicationClick) {
            onPublicationClick(pub.id, pub.slug)
            return
        }
        startNavProgress()
        if (pub.slug) {
            router.push(`/publicacoes/${pub.slug}`)
        } else {
            router.push(`/publicacoes/${pub.id}`)
        }
    }

    // ===== HANDLE "VER TODOS" =====
    const handleViewAll = () => {
        startNavProgress()
        router.push('/publicacoes')
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

    if (!publications.length) {
        console.log('[FeaturedPublications] Nenhuma publicação para exibir')
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
                        {publications.length}
                    </span>
                </div>

                {hasPublications && (
                    <button
                        onClick={handleViewAll}
                        className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 2px 8px rgba(249, 115, 22, 0.3)`,
                        }}
                    >
                        <span>Ver todas as publicações</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Grid de publicações */}
            <div className="relative">
                <div className={`grid ${gridCols} gap-4 transition-all duration-500`}>
                    {currentItems.map((pub, idx) => (
                        <div
                            key={`${pub.id}-${idx}`}
                            onClick={() => handlePublicationClick(pub)}
                            className="group relative rounded-xl overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                            style={{
                                borderColor: colors.border,
                                background: colors.surface,
                                aspectRatio: '3/4',
                            }}
                        >
                            {pub.imageUrl ? (
                                <>
                                    <img
                                        src={pub.imageUrl}
                                        alt={pub.title || pub.ownerName}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                                </>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center"
                                    style={{ background: GRADIENT, opacity: 0.3 }}>
                                    <Store className="w-12 h-12 opacity-30" style={{ color: colors.textPrimary }} />
                                </div>
                            )}

                            {/* Avatar/Logo no canto superior esquerdo */}
                            <div className="absolute top-2 left-2 z-10">
                                <div className="w-8 h-8 rounded-full border-2 border-white/40 overflow-hidden bg-black/50 shadow-lg">
                                    {pub.ownerImageUrl ? (
                                        <img src={pub.ownerImageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div
                                            className="w-full h-full flex items-center justify-center text-white font-bold text-xs"
                                            style={{ background: GRADIENT }}
                                        >
                                            {pub.ownerName?.charAt(0).toUpperCase() || '?'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Conteúdo na parte inferior - Apenas título da publicação */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                                <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2 drop-shadow-lg">
                                    {pub.title || 'Publicação'}
                                </h3>
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