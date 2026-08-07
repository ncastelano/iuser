// app/(main)/publicacoes/[slug]/page.tsx

'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Store,
    Eye,
    Calendar,
    Heart,
    Share2,
    Loader2,
    AlertCircle,
    X,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    MessageCircle,
    ChevronLeft,
    ChevronRight,
    User,
    ArrowLeft,
    MapPin,
    Clock,
    Tag,
    Building2,
    List,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'

// ===== GRADIENTE =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== TIPOS =====
interface PublicationDetail {
    id: string
    slug: string
    name: string
    description: string | null
    image_url: string | null
    video_url: string | null
    media_type: string | null
    view_count: number
    created_at: string
    price: number | null
    listing_type: string
    store: {
        id: string
        name: string
        storeSlug: string
        logo_url: string | null
        address: string | null
        business_hours: any
        whatsapp: string | null
    }
    isFromUser?: boolean
    user_id?: string | null
    store_id?: string | null
    button_data?: any
    category?: string | null
    address?: string | null
    city?: string | null
}

interface PublicationCard {
    id: string
    slug: string
    imageUrl: string | null
    storeName: string
    storeSlug: string
    storeLogoUrl: string | null
    name?: string
    description?: string | null
    view_count?: number
    created_at?: string
}

// ===== COMPONENTE =====
export default function PublicationPage() {
    const router = useRouter()
    const params = useParams()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [publication, setPublication] = useState<PublicationDetail | null>(null)
    const [allPublications, setAllPublications] = useState<PublicationCard[]>([])
    const [currentIndex, setCurrentIndex] = useState<number>(-1)
    const [loading, setLoading] = useState(true)
    const [loadingList, setLoadingList] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isLiked, setIsLiked] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const [isPlaying, setIsPlaying] = useState(true)
    const [isMuted, setIsMuted] = useState(false)
    const [progress, setProgress] = useState(0)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showComments, setShowComments] = useState(false)
    const [showAvailableSlugs, setShowAvailableSlugs] = useState(false)
    const [availableSlugs, setAvailableSlugs] = useState<{ id: string, slug: string, name: string }[]>([])

    const videoRef = useRef<HTMLVideoElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const slugParam = params?.slug as string

    // ===== BUSCAR PUBLICAÇÃO =====
    useEffect(() => {
        if (!slugParam) {
            setError('Publicação não encontrada')
            setLoading(false)
            return
        }

        const fetchPublication = async () => {
            setLoading(true)
            setError(null)

            try {
                console.log('🔍 Buscando publicação com slug:', slugParam)

                // Busca a publicação
                const { data: productData, error: productError } = await supabase
                    .from('products')
                    .select(`
                        id,
                        slug,
                        name,
                        description,
                        image_url,
                        video_url,
                        media_type,
                        view_count,
                        created_at,
                        price,
                        listing_type,
                        store_id,
                        user_id,
                        is_active,
                        button_data,
                        category,
                        address,
                        city
                    `)
                    .eq('listing_type', 'publication')
                    .eq('is_active', true)
                    .eq('slug', slugParam)
                    .maybeSingle()

                if (productError) {
                    console.error('❌ Erro ao buscar produto:', productError)
                    throw new Error('Publicação não encontrada')
                }

                if (!productData) {
                    console.error('❌ Produto não encontrado para o slug:', slugParam)

                    // Busca todos os slugs disponíveis para ajudar o usuário
                    const { data: allSlugs, error: slugsError } = await supabase
                        .from('products')
                        .select('id, slug, name')
                        .eq('listing_type', 'publication')
                        .eq('is_active', true)
                        .limit(50)

                    if (!slugsError && allSlugs) {
                        setAvailableSlugs(allSlugs)
                        console.log('📋 Slugs disponíveis:', allSlugs.map(s => s.slug).join(', '))
                    }

                    throw new Error(`Publicação não encontrada: ${slugParam}`)
                }

                console.log('✅ Produto encontrado:', productData)

                // Busca dados do criador
                let storeData = null
                let isFromUser = false

                if (productData.store_id) {
                    const { data, error } = await supabase
                        .from('stores')
                        .select('id, name, storeSlug, logo_url, address, business_hours, whatsapp')
                        .eq('id', productData.store_id)
                        .single()

                    if (!error) {
                        storeData = data
                        storeData.logo_url = storeData.logo_url
                            ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                            : null
                    }
                }

                if (!storeData && productData.user_id) {
                    isFromUser = true
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('id, name, profileSlug, avatar_url')
                        .eq('id', productData.user_id)
                        .single()

                    if (!error && data) {
                        storeData = {
                            id: data.id,
                            name: data.name || 'Usuário',
                            storeSlug: data.profileSlug || '#',
                            logo_url: data.avatar_url
                                ? supabase.storage.from('avatars').getPublicUrl(data.avatar_url).data.publicUrl
                                : null,
                            address: null,
                            business_hours: null,
                            whatsapp: null,
                        }
                    }
                }

                if (!storeData) {
                    storeData = {
                        id: '',
                        name: 'Desconhecido',
                        storeSlug: '#',
                        logo_url: null,
                        address: null,
                        business_hours: null,
                        whatsapp: null,
                    }
                }

                // Incrementa visualização
                try {
                    await supabase
                        .from('products')
                        .update({ view_count: (productData.view_count || 0) + 1 })
                        .eq('id', productData.id)
                } catch (viewErr) {
                    console.warn('⚠️ Erro ao incrementar visualização:', viewErr)
                }

                // Gera URLs
                const imageUrl = productData.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
                    : null

                const videoUrl = productData.video_url
                    ? supabase.storage.from('product-videos').getPublicUrl(productData.video_url).data.publicUrl
                    : null

                const mediaUrl = productData.media_type === 'video' && videoUrl ? videoUrl : (imageUrl || videoUrl)

                const formattedPublication: PublicationDetail = {
                    ...productData,
                    image_url: mediaUrl,
                    video_url: videoUrl,
                    isFromUser,
                    store: storeData,
                }

                setPublication(formattedPublication)

                // Busca publicações relacionadas
                await fetchAllPublications(productData.store_id, productData.user_id)

            } catch (err: any) {
                console.error('❌ Erro ao carregar publicação:', err)
                setError(err.message || 'Erro ao carregar publicação')
                toast.error(err.message || 'Erro ao carregar publicação')
            } finally {
                setLoading(false)
            }
        }

        fetchPublication()
    }, [slugParam])

    // ===== BUSCAR PUBLICAÇÕES RELACIONADAS =====
    const fetchAllPublications = async (storeId?: string | null, userId?: string | null) => {
        setLoadingList(true)
        try {
            let query = supabase
                .from('products')
                .select('id, slug, image_url, video_url, media_type, store_id, user_id, name, description, view_count, created_at')
                .eq('listing_type', 'publication')
                .eq('is_active', true)

            if (storeId) {
                query = query.eq('store_id', storeId)
            } else if (userId) {
                query = query.eq('user_id', userId)
            }

            const { data, error } = await query.order('created_at', { ascending: false }).limit(20)

            if (error) throw error

            const cards: PublicationCard[] = data.map(pub => {
                let imageUrl = null
                if (pub.media_type === 'video' && pub.video_url) {
                    imageUrl = supabase.storage.from('product-videos').getPublicUrl(pub.video_url).data.publicUrl
                } else if (pub.image_url) {
                    imageUrl = supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                }

                return {
                    id: pub.id,
                    slug: pub.slug || pub.id,
                    imageUrl: imageUrl,
                    storeName: publication?.store.name || 'Desconhecido',
                    storeSlug: publication?.store.storeSlug || '#',
                    storeLogoUrl: publication?.store.logo_url || null,
                    name: pub.name,
                    description: pub.description,
                    view_count: pub.view_count,
                    created_at: pub.created_at,
                }
            })

            setAllPublications(cards.filter(c => c.id !== publication?.id))
            const index = cards.findIndex(p => p.slug === slugParam)
            setCurrentIndex(index >= 0 ? index : 0)
        } catch (error) {
            console.error('Erro ao buscar lista:', error)
        } finally {
            setLoadingList(false)
        }
    }

    // ===== NAVEGAÇÃO =====
    const goToPrevious = useCallback(() => {
        if (currentIndex > 0) {
            const prev = allPublications[currentIndex - 1]
            if (prev) {
                router.push(`/publicacoes/${prev.slug}`)
            }
        }
    }, [currentIndex, allPublications, router])

    const goToNext = useCallback(() => {
        if (currentIndex < allPublications.length - 1) {
            const next = allPublications[currentIndex + 1]
            if (next) {
                router.push(`/publicacoes/${next.slug}`)
            }
        }
    }, [currentIndex, allPublications, router])

    // ===== KEYBOARD =====
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') goToPrevious()
            if (e.key === 'ArrowRight') goToNext()
            if (e.key === 'Escape') router.back()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [goToPrevious, goToNext, router])

    // ===== SWIPE =====
    useEffect(() => {
        let touchStartX = 0
        let touchStartY = 0
        let isSwiping = false

        const handleTouchStart = (e: TouchEvent) => {
            touchStartX = e.changedTouches[0].screenX
            touchStartY = e.changedTouches[0].screenY
            isSwiping = true
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (!isSwiping) return
            const diffX = Math.abs(e.changedTouches[0].screenX - touchStartX)
            const diffY = Math.abs(e.changedTouches[0].screenY - touchStartY)
            if (diffX > diffY && diffX > 10) e.preventDefault()
        }

        const handleTouchEnd = (e: TouchEvent) => {
            if (!isSwiping) return
            isSwiping = false
            const diffX = touchStartX - e.changedTouches[0].screenX
            const diffY = Math.abs(touchStartY - e.changedTouches[0].screenY)
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) {
                if (diffX > 0) goToNext()
                else goToPrevious()
            }
        }

        const container = containerRef.current
        if (container) {
            container.addEventListener('touchstart', handleTouchStart, { passive: true })
            container.addEventListener('touchmove', handleTouchMove, { passive: false })
            container.addEventListener('touchend', handleTouchEnd, { passive: true })
            return () => {
                container.removeEventListener('touchstart', handleTouchStart)
                container.removeEventListener('touchmove', handleTouchMove)
                container.removeEventListener('touchend', handleTouchEnd)
            }
        }
    }, [goToNext, goToPrevious])

    // ===== VÍDEO =====
    useEffect(() => {
        if (!videoRef.current) return
        const video = videoRef.current

        const handleTimeUpdate = () => {
            if (video.duration) setProgress((video.currentTime / video.duration) * 100)
        }
        const handlePlay = () => setIsPlaying(true)
        const handlePause = () => setIsPlaying(false)

        video.addEventListener('timeupdate', handleTimeUpdate)
        video.addEventListener('play', handlePlay)
        video.addEventListener('pause', handlePause)

        video.play().catch(() => setIsPlaying(false))

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate)
            video.removeEventListener('play', handlePlay)
            video.removeEventListener('pause', handlePause)
        }
    }, [publication?.image_url])

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!videoRef.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width
        videoRef.current.currentTime = x * videoRef.current.duration
    }

    const toggleFullscreen = () => {
        if (!containerRef.current) return
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen()
            setIsFullscreen(true)
        } else {
            document.exitFullscreen()
            setIsFullscreen(false)
        }
    }

    const handleShare = async () => {
        setIsSharing(true)
        try {
            if (navigator.share) {
                await navigator.share({
                    title: publication?.name || 'Publicação',
                    text: publication?.description || '',
                    url: window.location.href,
                })
            } else {
                await navigator.clipboard.writeText(window.location.href)
                toast.success('Link copiado!')
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                console.error('Erro ao compartilhar:', err)
            }
        } finally {
            setIsSharing(false)
        }
    }

    const handleBack = () => router.back()

    const formattedDate = publication?.created_at
        ? new Date(publication.created_at).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
        : ''

    const isVideo = publication?.media_type === 'video' ||
        publication?.image_url?.match(/\.(mp4|webm|mov|avi|m3u8)$/i) ||
        publication?.video_url

    if (loading) {
        return (
            <div className="relative min-h-dvh bg-black">
                <div className="flex items-center justify-center min-h-dvh">
                    <Loader2 className="w-12 h-12 animate-spin" style={{ color: '#f97316' }} />
                </div>
            </div>
        )
    }

    if (error || !publication) {
        return (
            <div className="relative min-h-dvh bg-black">
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
                <main className="relative z-10 min-h-dvh flex items-center justify-center p-4">
                    <div className="flex flex-col items-center gap-4 text-center px-4 max-w-lg w-full">
                        <AlertCircle className="w-16 h-16" style={{ color: '#ef4444' }} />
                        <h2 className="text-xl font-bold text-white">Publicação não encontrada</h2>
                        <p className="text-sm text-gray-400">
                            {error || 'Publicação não encontrada'}
                            {slugParam && (
                                <span className="block mt-1 text-xs text-gray-500 font-mono break-all">
                                    Slug: {slugParam}
                                </span>
                            )}
                        </p>

                        {/* Lista de slugs disponíveis */}
                        {availableSlugs.length > 0 && (
                            <div className="w-full mt-2">
                                <button
                                    onClick={() => setShowAvailableSlugs(!showAvailableSlugs)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition hover:bg-white/10"
                                    style={{ color: colors.accent }}
                                >
                                    <List className="w-4 h-4" />
                                    {showAvailableSlugs ? 'Ocultar' : 'Ver'} publicações disponíveis
                                </button>

                                {showAvailableSlugs && (
                                    <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10 max-h-60 overflow-y-auto">
                                        <p className="text-xs text-gray-400 mb-2">Clique em um slug para acessar:</p>
                                        <div className="flex flex-col gap-1.5">
                                            {availableSlugs.map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => router.push(`/publicacoes/${item.slug}`)}
                                                    className="text-left px-3 py-2 rounded-lg text-xs hover:bg-white/10 transition flex items-center justify-between"
                                                >
                                                    <span className="text-white font-mono">{item.slug}</span>
                                                    <span className="text-gray-500 text-[10px] truncate max-w-[150px]">
                                                        {item.name}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 mt-2 justify-center">
                            <button
                                onClick={() => router.push('/publicacoes-de-lojas')}
                                className="px-6 py-2.5 rounded-full text-sm font-bold transition hover:scale-105"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                            >
                                Ver publicações
                            </button>
                            <button
                                onClick={handleBack}
                                className="px-6 py-2.5 rounded-full text-sm font-bold transition hover:scale-105 bg-white/10 text-white border border-white/20"
                            >
                                Voltar
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="relative min-h-dvh bg-black">
            {/* Botão voltar fixo */}
            <button
                onClick={handleBack}
                className="fixed top-4 left-4 z-50 p-2.5 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 transition pointer-events-auto border border-white/10"
            >
                <ArrowLeft className="w-5 h-5 text-white" />
            </button>

            <div ref={containerRef} className="relative w-full min-h-dvh">
                {/* Conteúdo principal */}
                <div className="relative w-full min-h-dvh flex flex-col">
                    {/* Mídia */}
                    <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                        {publication.image_url ? (
                            isVideo ? (
                                <video
                                    ref={videoRef}
                                    src={publication.image_url}
                                    className="w-full h-full object-cover"
                                    loop
                                    muted={isMuted}
                                    playsInline
                                    autoPlay
                                    key={publication.id}
                                />
                            ) : (
                                <img
                                    src={publication.image_url}
                                    alt={publication.name}
                                    className="w-full h-full object-cover"
                                />
                            )
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
                                <Store className="w-24 h-24 text-white/20" />
                            </div>
                        )}

                        {/* Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                        {/* Controles de vídeo */}
                        {isVideo && (
                            <>
                                <div className="absolute bottom-20 left-0 right-0 px-4 pointer-events-auto">
                                    <div
                                        className="w-full h-1 bg-white/30 rounded-full cursor-pointer relative"
                                        onClick={handleProgressClick}
                                    >
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{ width: `${progress}%`, background: GRADIENT }}
                                        />
                                    </div>
                                </div>

                                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
                                    <button
                                        onClick={() => {
                                            if (videoRef.current) {
                                                if (isPlaying) videoRef.current.pause()
                                                else videoRef.current.play()
                                            }
                                        }}
                                        className="p-3 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition"
                                    >
                                        {isPlaying ? (
                                            <Pause className="w-5 h-5 text-white" />
                                        ) : (
                                            <Play className="w-5 h-5 text-white" />
                                        )}
                                    </button>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setIsMuted(!isMuted)}
                                            className="p-3 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition"
                                        >
                                            {isMuted ? (
                                                <VolumeX className="w-5 h-5 text-white" />
                                            ) : (
                                                <Volume2 className="w-5 h-5 text-white" />
                                            )}
                                        </button>
                                        <button
                                            onClick={toggleFullscreen}
                                            className="p-3 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition"
                                        >
                                            <Maximize className="w-5 h-5 text-white" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Informações */}
                    <div className="flex-1 bg-black px-4 py-6">
                        <div className="max-w-3xl mx-auto w-full">
                            {/* Título */}
                            <h1 className="text-2xl font-bold text-white mb-2">
                                {publication.name}
                            </h1>

                            {/* Meta informações */}
                            <div className="flex flex-wrap items-center gap-4 text-sm text-white/50 mb-4">
                                <span className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4" />
                                    {formattedDate}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Eye className="w-4 h-4" />
                                    {publication.view_count || 0} visualizações
                                </span>
                                {publication.category && (
                                    <span className="flex items-center gap-1.5">
                                        <Tag className="w-4 h-4" />
                                        {publication.category}
                                    </span>
                                )}
                            </div>

                            {/* Descrição */}
                            {publication.description && (
                                <p className="text-white/80 text-base leading-relaxed mb-6">
                                    {publication.description}
                                </p>
                            )}

                            {/* Criador */}
                            <div className="flex items-center gap-3 p-4 rounded-xl mb-6"
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                }}
                            >
                                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-white/20">
                                    {publication.store.logo_url ? (
                                        <img src={publication.store.logo_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/10">
                                            {publication.isFromUser ? (
                                                <User size={24} className="text-white/40" />
                                            ) : (
                                                <Store size={24} className="text-white/40" />
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-white font-medium">
                                        {publication.store.name}
                                        {publication.isFromUser && (
                                            <span className="text-xs text-white/40 ml-1">• Usuário</span>
                                        )}
                                    </p>
                                    {publication.store.address && (
                                        <p className="text-xs text-white/40 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            {publication.store.address}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        if (publication.store.whatsapp) {
                                            window.open(`https://wa.me/${publication.store.whatsapp.replace(/\D/g, '')}`, '_blank')
                                        }
                                    }}
                                    className="ml-auto px-4 py-2 rounded-full text-xs font-bold text-white transition hover:scale-105"
                                    style={{
                                        background: '#25D366',
                                    }}
                                >
                                    WhatsApp
                                </button>
                            </div>

                            {/* Botão do cartaz */}
                            {publication.button_data && (
                                <div className="mb-6">
                                    <button
                                        className="w-full py-3 rounded-xl text-sm font-bold text-white shadow-lg transition hover:scale-[1.02]"
                                        style={{
                                            backgroundColor: publication.button_data.color || '#f97316',
                                        }}
                                        onClick={() => {
                                            if (publication.button_data.link) {
                                                window.open(publication.button_data.link, '_blank')
                                            }
                                        }}
                                    >
                                        {publication.button_data.text || 'Saiba Mais'}
                                    </button>
                                </div>
                            )}

                            {/* Publicações relacionadas */}
                            {allPublications.length > 0 && (
                                <div className="mt-8">
                                    <h3 className="text-white font-bold text-lg mb-4">
                                        Publicações relacionadas
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {allPublications.slice(0, 4).map((pub) => (
                                            <div
                                                key={pub.id}
                                                onClick={() => router.push(`/publicacoes/${pub.slug}`)}
                                                className="rounded-xl overflow-hidden cursor-pointer group relative"
                                                style={{ aspectRatio: '4/3' }}
                                            >
                                                {pub.imageUrl ? (
                                                    <img
                                                        src={pub.imageUrl}
                                                        alt={pub.name}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-white/5">
                                                        <Store className="w-8 h-8 text-white/20" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                                                <div className="absolute bottom-2 left-2 right-2">
                                                    <p className="text-white text-xs font-medium truncate">
                                                        {pub.name || 'Publicação'}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}