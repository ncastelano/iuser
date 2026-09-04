// app/(main)/publicacoes/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Store,
    Search,
    Grid,
    List,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    Eye,
    Clock,
    Heart,
    Share2,
    Calendar,
    User,
    MessageCircle,
    Pencil,
    Trash2,
    Plus,
    Megaphone,
    MessageSquare,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import { getAvatarUrl } from '@/lib/avatar'
import { handleShareLink } from '@/lib/share'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ========== FUNÇÃO HEX TO RGB ==========
function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
}

// ========== TIPOS ==========
interface TopComment {
    id: string
    content: string
    profile_id: string
    like_count: number
    profiles?: {
        id: string
        name: string
        avatar_url: string | null
        profileSlug: string
    }
}

interface PublicationCard {
    id: string
    slug: string
    imageUrl: string | null
    ownerName: string
    ownerSlug: string
    ownerImageUrl: string | null
    ownerType: 'profile' | 'store'
    ownerId: string
    isProfileAvatar: boolean
    title: string
    description?: string | null
    view_count?: number
    created_at?: string
    like_count?: number
    comment_count?: number
    is_liked?: boolean
    top_comment?: TopComment | null
}

// ========== COMPONENTE CARD ==========
function PublicationCardComponent({
    pub,
    colors,
    currentUserId,
    onLike,
}: {
    pub: PublicationCard
    colors: any
    currentUserId?: string | null
    onLike?: (pubId: string) => void
}) {
    const router = useRouter()
    const [isLiked, setIsLiked] = useState(pub.is_liked || false)
    const [likeCount, setLikeCount] = useState(pub.like_count || 0)
    const [liking, setLiking] = useState(false)

    const formattedDate = pub.created_at
        ? new Date(pub.created_at).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
        : ''

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!currentUserId) {
            toast.error('Faça login para curtir')
            return
        }
        if (liking) return

        setLiking(true)
        try {
            if (isLiked) {
                const { error } = await supabase
                    .from('likes')
                    .delete()
                    .eq('publication_id', pub.id)
                    .eq('profile_id', currentUserId)
                if (error) throw error
                setIsLiked(false)
                setLikeCount(prev => prev - 1)
                onLike?.(pub.id)
            } else {
                const { error } = await supabase
                    .from('likes')
                    .insert({
                        publication_id: pub.id,
                        profile_id: currentUserId
                    })
                if (error) throw error
                setIsLiked(true)
                setLikeCount(prev => prev + 1)
                onLike?.(pub.id)
            }
        } catch (error: any) {
            toast.error('Erro ao curtir: ' + error.message)
        } finally {
            setLiking(false)
        }
    }

    const handleClick = () => {
        if (pub.slug) {
            router.push(`/publicacoes/${pub.slug}`)
        } else {
            router.push(`/publicacoes/${pub.id}`)
        }
    }

    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    return (
        <div
            className="rounded-2xl p-5 flex flex-col gap-1"
            style={{
                background: cardBg,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${colors.border}`,
                boxShadow: colors.shadow,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
            }}
            onClick={handleClick}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.01)'
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.15)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = colors.shadow
            }}
        >
            {/* Header do card */}
            <div className="flex items-start gap-3">
                <div
                    className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: GRADIENT }}
                >
                    {pub.ownerImageUrl ? (
                        <img src={pub.ownerImageUrl} className="w-full h-full object-cover" alt={pub.ownerName} />
                    ) : (
                        <span className="text-white font-bold text-lg">
                            {pub.ownerName?.charAt(0).toUpperCase() || '?'}
                        </span>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                            {pub.ownerName}
                        </span>
                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                            • {formattedDate || 'Data desconhecida'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase" style={{ background: '#10b98120', color: '#10b981' }}>
                            Novidade
                        </span>
                    </div>
                    <p className="text-sm font-bold mt-1" style={{ color: colors.textPrimary }}>
                        {pub.title || 'Sem título'}
                    </p>
                    {pub.description && (
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: colors.textSecondary }}>
                            {pub.description}
                        </p>
                    )}
                </div>
            </div>

            {/* Imagem da publicação */}
            {pub.imageUrl && (
                <div className="mt-3 rounded-xl overflow-hidden">
                    <img src={pub.imageUrl} className="w-full max-h-[300px] object-cover" alt={pub.title} />
                </div>
            )}

            {/* Ações da publicação */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap" style={{ borderColor: colors.border }}>
                <button
                    onClick={handleLike}
                    disabled={liking}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all hover:scale-105 disabled:opacity-50"
                    style={{
                        background: isLiked ? '#ef444420' : 'rgba(255,255,255,0.05)',
                        color: isLiked ? '#ef4444' : colors.textSecondary,
                        border: isLiked ? '1px solid #ef444440' : `1px solid ${colors.border}`,
                    }}
                >
                    <Heart size={12} fill={isLiked ? '#ef4444' : 'none'} />
                    <span>{likeCount}</span>
                </button>

                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        handleClick()
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all hover:scale-105"
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: colors.textSecondary,
                        border: `1px solid ${colors.border}`,
                    }}
                >
                    <MessageCircle size={12} />
                    <span>{pub.comment_count || 0}</span>
                </button>

                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        handleShareLink({
                            title: pub.title || 'Publicação',
                            text: pub.description || `Confira esta publicação no iUser!`,
                            url: `${window.location.origin}/publicacoes/${pub.slug || pub.id}`
                        })
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all hover:scale-105"
                    style={{
                        background: GRADIENT,
                        color: '#ffffff',
                        boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
                        border: 'none',
                    }}
                >
                    <Share2 size={12} />
                    Compartilhar
                </button>
            </div>

            {/* Comentário mais curtido (embaixo das ações) */}
            {pub.top_comment && (
                <div
                    className="mt-3 p-3 rounded-xl border-l-4 transition-all hover:opacity-90"
                    style={{
                        background: `${colors.surface}50`,
                        borderColor: '#f97316',
                        borderLeftWidth: '4px',
                    }}
                >
                    <div className="flex items-start gap-2">
                        <div
                            className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                            style={{ background: GRADIENT }}
                        >
                            {pub.top_comment.profiles?.avatar_url ? (
                                <img
                                    src={getAvatarUrl(supabase, pub.top_comment.profiles.avatar_url) || ''}
                                    className="w-full h-full object-cover"
                                    alt={pub.top_comment.profiles?.name || 'Usuário'}
                                />
                            ) : (
                                <span className="text-white font-bold text-[10px]">
                                    {pub.top_comment.profiles?.name?.charAt(0).toUpperCase() || '?'}
                                </span>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold" style={{ color: colors.textPrimary }}>
                                    {pub.top_comment.profiles?.name || 'Usuário'}
                                </span>
                                <span className="text-[9px]" style={{ color: colors.textSecondary }}>
                                    • Comentário mais curtido
                                </span>
                            </div>
                            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: colors.textSecondary }}>
                                "{pub.top_comment.content}"
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                                <Heart size={10} fill="#ef4444" color="#ef4444" />
                                <span className="text-[9px] font-semibold" style={{ color: colors.textSecondary }}>
                                    {pub.top_comment.like_count} {pub.top_comment.like_count === 1 ? 'curtida' : 'curtidas'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ========== SKELETON CARD ==========
function PublicationCardSkeleton({ colors }: { colors: any }) {
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    return (
        <div
            className="rounded-2xl p-5 flex flex-col gap-1"
            style={{
                background: cardBg,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${colors.border}`,
                boxShadow: colors.shadow,
            }}
        >
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 animate-pulse" style={{ background: `${colors.border}30` }} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="h-4 rounded w-24 animate-pulse" style={{ background: `${colors.border}30` }} />
                        <div className="h-3 rounded w-16 animate-pulse" style={{ background: `${colors.border}20` }} />
                    </div>
                    <div className="h-5 rounded w-3/4 mt-1 animate-pulse" style={{ background: `${colors.border}30` }} />
                    <div className="h-3 rounded w-full mt-1 animate-pulse" style={{ background: `${colors.border}20` }} />
                    <div className="h-3 rounded w-2/3 mt-0.5 animate-pulse" style={{ background: `${colors.border}20` }} />
                </div>
            </div>
            <div className="mt-3 h-48 rounded-xl animate-pulse" style={{ background: `${colors.border}20` }} />
            <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
                <div className="h-8 w-16 rounded-full animate-pulse" style={{ background: `${colors.border}20` }} />
                <div className="h-8 w-16 rounded-full animate-pulse" style={{ background: `${colors.border}20` }} />
                <div className="h-8 w-20 rounded-full animate-pulse" style={{ background: `${colors.border}20` }} />
            </div>
        </div>
    )
}

// ========== PÁGINA PRINCIPAL ==========
export default function AllPublicationsPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadMoreRef = useRef<HTMLDivElement>(null)

    const [publications, setPublications] = useState<PublicationCard[]>([])
    const [displayedPublications, setDisplayedPublications] = useState<PublicationCard[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(true)
    const [page, setPage] = useState(0)

    const ITEMS_PER_LOAD = 10

    // ===== CARREGAR USUÁRIO =====
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
        }
        getUser()
    }, [])

    // ===== CARREGAR PUBLICAÇÕES =====
    const loadPublications = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const { data: publicationsList, error: pubErr } = await supabase
                .from('products')
                .select(`
                    id,
                    slug,
                    name,
                    description,
                    image_url,
                    view_count,
                    created_at,
                    store_id,
                    owner_id,
                    listing_type
                `)
                .eq('listing_type', 'publication')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(100)

            if (pubErr) throw new Error('Erro ao buscar publicações: ' + pubErr.message)

            if (!publicationsList || publicationsList.length === 0) {
                setPublications([])
                setDisplayedPublications([])
                setHasMore(false)
                setLoading(false)
                return
            }

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

            const cards = await Promise.all(publicationsList.map(async (pub: any) => {
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

                const imageUrl = pub.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                    : null

                const { count: likeCount } = await supabase
                    .from('likes')
                    .select('*', { count: 'exact', head: true })
                    .eq('publication_id', pub.id)

                const { count: commentCount } = await supabase
                    .from('comments')
                    .select('*', { count: 'exact', head: true })
                    .eq('publication_id', pub.id)
                    .is('parent_comment_id', null)

                // Buscar comentário mais curtido
                let topComment: TopComment | null = null
                const commentCountValue = commentCount || 0
                if (commentCountValue > 0) {
                    const { data: commentsData } = await supabase
                        .from('comments')
                        .select(`
                            id,
                            content,
                            profile_id,
                            created_at
                        `)
                        .eq('publication_id', pub.id)
                        .is('parent_comment_id', null)
                        .limit(10)

                    if (commentsData && commentsData.length > 0) {
                        const commentsWithLikes = await Promise.all(
                            commentsData.map(async (comment: any) => {
                                const { count: cLikeCount } = await supabase
                                    .from('comment_likes')
                                    .select('*', { count: 'exact', head: true })
                                    .eq('comment_id', comment.id)

                                let profileData = profileMap.get(comment.profile_id)
                                if (!profileData) {
                                    const { data: fetchedProfile } = await supabase
                                        .from('profiles')
                                        .select('id, name, avatar_url, profileSlug')
                                        .eq('id', comment.profile_id)
                                        .maybeSingle()
                                    profileData = fetchedProfile
                                }

                                return {
                                    id: comment.id,
                                    content: comment.content,
                                    profile_id: comment.profile_id,
                                    like_count: cLikeCount || 0,
                                    profiles: profileData || undefined,
                                }
                            })
                        )

                        commentsWithLikes.sort((a, b) => (b.like_count || 0) - (a.like_count || 0))
                        topComment = commentsWithLikes[0]
                    }
                }

                let isLiked = false
                if (currentUserId) {
                    const { data: likeData } = await supabase
                        .from('likes')
                        .select('id')
                        .eq('publication_id', pub.id)
                        .eq('profile_id', currentUserId)
                        .maybeSingle()
                    isLiked = !!likeData
                }

                return {
                    id: pub.id,
                    slug: pub.slug || pub.id,
                    imageUrl,
                    ownerName,
                    ownerSlug,
                    ownerImageUrl: finalOwnerImage,
                    ownerType,
                    ownerId,
                    isProfileAvatar,
                    title: pub.name || 'Sem título',
                    description: pub.description,
                    view_count: pub.view_count || 0,
                    created_at: pub.created_at,
                    like_count: likeCount || 0,
                    comment_count: commentCount || 0,
                    is_liked: isLiked,
                    top_comment: topComment,
                }
            }))

            setPublications(cards)
            setDisplayedPublications(cards.slice(0, ITEMS_PER_LOAD))
            setHasMore(cards.length > ITEMS_PER_LOAD)
            setPage(1)
        } catch (err: any) {
            console.error('Erro ao carregar publicações:', err)
            setError(err.message || 'Erro ao carregar publicações')
            toast.error('Erro ao carregar publicações')
        } finally {
            setLoading(false)
        }
    }, [currentUserId])

    useEffect(() => {
        loadPublications()
    }, [loadPublications])

    // ===== FILTROS =====
    const filteredPublications = useMemo(() => {
        let filtered = [...publications]

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(
                p =>
                    p.title.toLowerCase().includes(q) ||
                    p.ownerName.toLowerCase().includes(q) ||
                    (p.description && p.description.toLowerCase().includes(q))
            )
        }

        return filtered
    }, [publications, searchQuery])

    // ===== RESETAR DISPLAY =====
    useEffect(() => {
        setDisplayedPublications(filteredPublications.slice(0, ITEMS_PER_LOAD))
        setHasMore(filteredPublications.length > ITEMS_PER_LOAD)
        setPage(1)
    }, [filteredPublications])

    // ===== CARREGAR MAIS =====
    const loadMore = useCallback(() => {
        if (loadingMore || !hasMore) return

        const nextPage = page + 1
        const start = nextPage * ITEMS_PER_LOAD
        const end = start + ITEMS_PER_LOAD
        const newItems = filteredPublications.slice(start, end)

        if (newItems.length === 0) {
            setHasMore(false)
            return
        }

        setLoadingMore(true)
        setTimeout(() => {
            setDisplayedPublications(prev => [...prev, ...newItems])
            setPage(nextPage)
            setHasMore(end < filteredPublications.length)
            setLoadingMore(false)
        }, 300)
    }, [loadingMore, hasMore, page, filteredPublications])

    // ===== OBSERVADOR DE SCROLL =====
    useEffect(() => {
        if (loading) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore) {
                    loadMore()
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        )

        observerRef.current = observer

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current)
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect()
            }
        }
    }, [loading, hasMore, loadingMore, loadMore])

    // ===== ATUALIZAR CURTIDA =====
    const handleLikeUpdate = (pubId: string) => {
        setPublications(prev =>
            prev.map(p =>
                p.id === pubId
                    ? { ...p, is_liked: !p.is_liked, like_count: p.is_liked ? (p.like_count || 0) - 1 : (p.like_count || 0) + 1 }
                    : p
            )
        )
        setDisplayedPublications(prev =>
            prev.map(p =>
                p.id === pubId
                    ? { ...p, is_liked: !p.is_liked, like_count: p.is_liked ? (p.like_count || 0) - 1 : (p.like_count || 0) + 1 }
                    : p
            )
        )
    }

    // ===== RENDER =====
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Todas publicações"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch={true}
                    searchPlaceholder="Buscar publicações..."
                    onSearch={setSearchQuery}
                />

                <section className="w-full px-4 md:px-6 mt-2 pb-24">
                    {/* CONTADOR */}
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                            {filteredPublications.length} publicações
                        </span>
                    </div>

                    {/* LOADING */}
                    {loading && (
                        <div className="space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <PublicationCardSkeleton key={`skeleton-${i}`} colors={colors} />
                            ))}
                        </div>
                    )}

                    {/* ERROR */}
                    {error && !loading && (
                        <div
                            className="rounded-2xl p-12 flex flex-col items-center gap-4"
                            style={{
                                background: `${colors.surface}66`,
                                backdropFilter: 'blur(12px)',
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <AlertCircle className="w-12 h-12" style={{ color: '#ef4444' }} />
                            <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                                {error}
                            </p>
                            <button
                                onClick={() => {
                                    setError(null)
                                    loadPublications()
                                }}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold transition hover:scale-105"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                }}
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* LISTA DE PUBLICAÇÕES */}
                    {!loading && !error && (
                        <>
                            {displayedPublications.length === 0 ? (
                                <div
                                    className="rounded-2xl p-12 flex flex-col items-center gap-4"
                                    style={{
                                        background: `${colors.surface}66`,
                                        backdropFilter: 'blur(12px)',
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <Megaphone className="w-12 h-12 opacity-30" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                                        {searchQuery ? 'Nenhuma publicação encontrada para esta busca.' : 'Nenhuma publicação disponível no momento.'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-4">
                                        {displayedPublications.map((pub, index) => (
                                            <div key={`${pub.id}-${index}`} className="animate-fadeIn">
                                                <PublicationCardComponent
                                                    pub={pub}
                                                    colors={colors}
                                                    currentUserId={currentUserId}
                                                    onLike={handleLikeUpdate}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* LOADER DE CARREGAMENTO */}
                                    {hasMore && (
                                        <div
                                            ref={loadMoreRef}
                                            className="flex justify-center py-8 mt-6"
                                        >
                                            {loadingMore ? (
                                                <Spinner size={32} color={colors.accent} />
                                            ) : (
                                                <div className="h-8" />
                                            )}
                                        </div>
                                    )}

                                    {/* FIM DA LISTA */}
                                    {!hasMore && displayedPublications.length > 0 && (
                                        <div className="text-center py-8">
                                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                                🎉 Você já viu todas as publicações disponíveis
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </section>
            </main>

            <style jsx>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.5s ease-out forwards;
                }
            `}</style>
        </div>
    )
}