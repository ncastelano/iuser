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
    name: string
    description: string | null
    image_url: string | null
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
}

interface PublicationCard {
    id: string
    imageUrl: string | null
    storeName: string
    storeSlug: string
    storeLogoUrl: string | null
    name?: string
    description?: string | null
    view_count?: number
    created_at?: string
}

interface StoreData {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
}

interface ProfileData {
    id: string
    name: string
    profileSlug: string
    avatar_url: string | null
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

    const videoRef = useRef<HTMLVideoElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const slug = params?.slug as string

    // ===== BUSCAR PUBLICAÇÃO =====
    useEffect(() => {
        if (!slug) {
            setError('Publicação não encontrada')
            setLoading(false)
            return
        }

        const fetchPublication = async () => {
            setLoading(true)
            setError(null)

            try {
                console.log('🔍 Buscando publicação com ID:', slug)

                const { data: productData, error: productError } = await supabase
                    .from('products')
                    .select(`
                        id,
                        name,
                        description,
                        image_url,
                        view_count,
                        created_at,
                        price,
                        listing_type,
                        store_id,
                        user_id,
                        is_active
                    `)
                    .eq('id', slug)
                    .single()

                if (productError) {
                    console.error('❌ Erro ao buscar produto:', productError)
                    throw new Error('Publicação não encontrada')
                }
                if (!productData) {
                    console.error('❌ Produto não encontrado para o ID:', slug)
                    throw new Error('Publicação não encontrada')
                }
                if (productData.listing_type !== 'publication') {
                    console.error('❌ Produto não é uma publicação:', productData.listing_type)
                    throw new Error('Este produto não é uma publicação')
                }

                console.log('✅ Produto encontrado:', productData)

                let storeData = null
                let isFromUser = false

                // Tenta buscar da loja primeiro
                if (productData.store_id) {
                    console.log('🔍 Buscando loja:', productData.store_id)
                    const { data, error } = await supabase
                        .from('stores')
                        .select('id, name, storeSlug, logo_url, address, business_hours, whatsapp')
                        .eq('id', productData.store_id)
                        .single()

                    if (error) {
                        console.warn('⚠️ Erro ao buscar loja:', error)
                    } else {
                        storeData = data
                        console.log('✅ Loja encontrada:', storeData)
                    }
                }

                // Se não encontrou loja, busca do perfil do usuário
                if (!storeData && productData.user_id) {
                    isFromUser = true
                    console.log('🔍 Buscando perfil do usuário:', productData.user_id)
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('id, name, profileSlug, avatar_url')
                        .eq('id', productData.user_id)
                        .single()

                    if (error) {
                        console.warn('⚠️ Erro ao buscar perfil:', error)
                    } else if (data) {
                        storeData = {
                            id: data.id,
                            name: data.name || 'Usuário',
                            storeSlug: data.profileSlug || '#',
                            logo_url: data.avatar_url || null,
                            address: null,
                            business_hours: null,
                            whatsapp: null,
                        }
                        console.log('✅ Perfil encontrado:', data)
                    }
                }

                // Se não encontrou nem loja nem perfil, usa dados padrão
                if (!storeData) {
                    console.warn('⚠️ Nenhum criador encontrado, usando dados padrão')
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

                try {
                    await supabase
                        .from('products')
                        .update({ view_count: (productData.view_count || 0) + 1 })
                        .eq('id', productData.id)
                    console.log('✅ Visualização incrementada')
                } catch (viewErr) {
                    console.warn('⚠️ Erro ao incrementar visualização:', viewErr)
                }

                const imageUrl = productData.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
                    : null

                console.log('🖼️ URL da imagem:', imageUrl)

                const formattedPublication: PublicationDetail = {
                    ...productData,
                    image_url: imageUrl,
                    isFromUser,
                    store: {
                        ...storeData,
                        logo_url: storeData.logo_url
                            ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                            : null,
                    }
                }

                setPublication(formattedPublication)

                // Busca lista de publicações relacionadas
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
    }, [slug])

    // ===== BUSCAR LISTA DE PUBLICAÇÕES =====
    const fetchAllPublications = async (storeId?: string | null, userId?: string | null) => {
        setLoadingList(true)
        try {
            let query = supabase
                .from('products')
                .select('id, image_url, store_id, user_id, name, description, view_count, created_at')
                .eq('listing_type', 'publication')
                .eq('is_active', true)

            // Busca publicações da mesma loja ou do mesmo usuário
            if (storeId) {
                query = query.eq('store_id', storeId)
            } else if (userId) {
                query = query.eq('user_id', userId)
            }

            const { data, error } = await query.order('created_at', { ascending: false })

            if (error) throw error

            // Busca stores para os dados
            const storeIds = [...new Set(data.filter(p => p.store_id).map(p => p.store_id))]
            let storesMap = new Map<string, StoreData>()
            if (storeIds.length > 0) {
                const { data: stores } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, logo_url')
                    .in('id', storeIds)

                if (stores) {
                    stores.forEach(s => storesMap.set(s.id, s as StoreData))
                }
            }

            // Busca profiles para os dados
            const userIds = [...new Set(data.filter(p => p.user_id && !p.store_id).map(p => p.user_id))]
            let profilesMap = new Map<string, ProfileData>()
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, name, profileSlug, avatar_url')
                    .in('id', userIds)

                if (profiles) {
                    profiles.forEach(p => profilesMap.set(p.id, p as ProfileData))
                }
            }

            const cards: PublicationCard[] = data.map(pub => {
                let store = null
                if (pub.store_id) {
                    store = storesMap.get(pub.store_id)
                } else if (pub.user_id) {
                    const profile = profilesMap.get(pub.user_id)
                    if (profile) {
                        store = {
                            id: profile.id,
                            name: profile.name || 'Usuário',
                            storeSlug: profile.profileSlug || '#',
                            logo_url: profile.avatar_url || null
                        }
                    }
                }

                return {
                    id: pub.id,
                    imageUrl: pub.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                        : null,
                    storeName: store?.name || 'Desconhecido',
                    storeSlug: store?.storeSlug || '#',
                    storeLogoUrl: store?.logo_url || null,
                    name: pub.name,
                    description: pub.description,
                    view_count: pub.view_count,
                    created_at: pub.created_at,
                }
            })

            setAllPublications(cards)
            const index = cards.findIndex(p => p.id === slug)
            setCurrentIndex(index >= 0 ? index : 0)
        } catch (error) {
            console.error('Erro ao buscar lista:', error)
        } finally {
            setLoadingList(false)
        }
    }

    // ===== NAVEGAÇÃO ENTRE PUBLICAÇÕES =====
    const goToPrevious = useCallback(() => {
        if (currentIndex > 0) {
            const prev = allPublications[currentIndex - 1]
            if (prev) {
                router.push(`/publicacoes/${prev.id}`)
            }
        }
    }, [currentIndex, allPublications, router])

    const goToNext = useCallback(() => {
        if (currentIndex < allPublications.length - 1) {
            const next = allPublications[currentIndex + 1]
            if (next) {
                router.push(`/publicacoes/${next.id}`)
            }
        }
    }, [currentIndex, allPublications, router])

    // ===== KEYBOARD NAVIGATION =====
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') goToPrevious()
            if (e.key === 'ArrowRight') goToNext()
            if (e.key === 'Escape') router.back()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [goToPrevious, goToNext, router])

    // ===== SWIPE NAVIGATION =====
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

            if (diffX > diffY && diffX > 10) {
                e.preventDefault()
            }
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

    // ===== CONTROLES DO VÍDEO =====
    useEffect(() => {
        if (!videoRef.current) return
        const video = videoRef.current

        const handleTimeUpdate = () => {
            if (video.duration) {
                setProgress((video.currentTime / video.duration) * 100)
            }
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

    // ===== CONTROLES DE TOQUE =====
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (target.closest('button')) return

            if (videoRef.current) {
                if (isPlaying) {
                    videoRef.current.pause()
                } else {
                    videoRef.current.play()
                }
            }
        }

        const container = containerRef.current
        if (container) {
            container.addEventListener('click', handleClick)
            return () => container.removeEventListener('click', handleClick)
        }
    }, [isPlaying])

    // ===== PROGRESS BAR =====
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!videoRef.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width
        videoRef.current.currentTime = x * videoRef.current.duration
    }

    // ===== FULLSCREEN =====
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

    // ===== SHARE =====
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

    // ===== HANDLE BACK =====
    const handleBack = () => {
        router.back()
    }

    // ===== FORMATAR DATA =====
    const formattedDate = publication?.created_at
        ? new Date(publication.created_at).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
        : ''

    // ===== LOADING =====
    if (loading) {
        return (
            <div className="relative min-h-dvh bg-black">
                <div className="flex items-center justify-center min-h-dvh">
                    <Loader2 className="w-12 h-12 animate-spin" style={{ color: '#f97316' }} />
                </div>
            </div>
        )
    }

    // ===== ERROR =====
    if (error || !publication) {
        return (
            <div className="relative min-h-dvh bg-black">
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
                <main className="relative z-10 min-h-dvh flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 text-center px-4">
                        <AlertCircle className="w-16 h-16" style={{ color: '#ef4444' }} />
                        <h2 className="text-xl font-bold text-white">Oops! Algo deu errado</h2>
                        <p className="text-sm max-w-md text-gray-400">
                            {error || 'Publicação não encontrada'}
                            {slug && (
                                <span className="block mt-1 text-xs text-gray-500 font-mono">
                                    ID: {slug}
                                </span>
                            )}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                            <button onClick={() => window.location.reload()} className="px-6 py-2.5 rounded-full text-sm font-bold transition hover:scale-105" style={{ background: GRADIENT, color: '#ffffff' }}>
                                Tentar novamente
                            </button>
                            <button onClick={handleBack} className="px-6 py-2.5 rounded-full text-sm font-bold transition hover:scale-105 bg-white/10 text-white border border-white/20">
                                Voltar
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        )
    }

    // ===== VERIFICA SE É VÍDEO =====
    const isVideo = publication.image_url?.match(/\.(mp4|webm|mov|avi|m3u8)$/i)

    // ===== RENDER =====
    return (
        <div className="relative h-dvh w-full bg-black overflow-hidden">
            <div ref={containerRef} className="relative w-full h-full bg-black">
                {/* Imagem/Vídeo */}
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
                            key={publication.id}
                        />
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
                        <Store className="w-24 h-24 text-white/20" />
                    </div>
                )}

                {/* Gradiente de fundo */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

                {/* Navegação lateral - setas */}
                {allPublications.length > 1 && (
                    <>
                        {currentIndex > 0 && (
                            <button
                                onClick={goToPrevious}
                                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition pointer-events-auto"
                            >
                                <ChevronLeft className="w-8 h-8 text-white" />
                            </button>
                        )}
                        {currentIndex < allPublications.length - 1 && (
                            <button
                                onClick={goToNext}
                                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition pointer-events-auto"
                            >
                                <ChevronRight className="w-8 h-8 text-white" />
                            </button>
                        )}
                    </>
                )}

                {/* Indicador de posição */}
                {allPublications.length > 1 && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 pointer-events-none">
                        {allPublications.map((_, idx) => {
                            const show = allPublications.length <= 20 ||
                                Math.abs(idx - currentIndex) <= 3 ||
                                idx === 0 ||
                                idx === allPublications.length - 1

                            if (!show) {
                                if (idx === currentIndex - 4 || idx === currentIndex + 4) {
                                    return (
                                        <div key={idx} className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                    )
                                }
                                return null
                            }

                            return (
                                <div
                                    key={idx}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-7 bg-white' : 'w-2 bg-white/40'
                                        }`}
                                />
                            )
                        })}
                    </div>
                )}

                {/* Número da publicação */}
                {allPublications.length > 1 && (
                    <div className="absolute top-4 right-4 z-20 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-sm font-medium pointer-events-none">
                        {currentIndex + 1} / {allPublications.length}
                    </div>
                )}

                {/* Botão de voltar */}
                <button
                    onClick={handleBack}
                    className="absolute top-4 left-4 z-20 p-2.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition pointer-events-auto"
                >
                    <X className="w-6 h-6 text-white" />
                </button>

                {/* Controles superiores direita */}
                {isVideo && (
                    <div className="absolute top-4 right-20 z-20 flex items-center gap-2 pointer-events-auto">
                        <button onClick={() => setIsMuted(!isMuted)} className="p-2 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition">
                            {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                        </button>
                        <button onClick={toggleFullscreen} className="p-2 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition">
                            <Maximize className="w-5 h-5 text-white" />
                        </button>
                    </div>
                )}

                {/* Progress Bar */}
                {isVideo && (
                    <div className="pointer-events-auto absolute bottom-32 left-0 right-0 px-4">
                        <div
                            className="w-full h-1 bg-white/30 rounded-full cursor-pointer relative"
                            onClick={handleProgressClick}
                        >
                            <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${progress}%`, background: GRADIENT }}
                            />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (videoRef.current) {
                                        if (isPlaying) videoRef.current.pause()
                                        else videoRef.current.play()
                                    }
                                }}
                                className="absolute left-1/2 -translate-x-1/2 -top-6 p-2 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition"
                            >
                                {isPlaying ? (
                                    <Pause className="w-4 h-4 text-white" />
                                ) : (
                                    <Play className="w-4 h-4 text-white" />
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Conteúdo inferior - colado na parte de baixo */}
                <div className="absolute bottom-0 left-0 right-0 p-5 pb-6 pointer-events-none">
                    <div className="pointer-events-auto">
                        {/* Título */}
                        <h1 className="text-2xl font-bold text-white drop-shadow-lg">
                            {publication.name}
                        </h1>

                        {/* Descrição - esquerda, com ações na direita */}
                        <div className="flex items-start justify-between mt-1">
                            <div className="flex-1">
                                {publication.description && (
                                    <p className="text-base text-white/90 drop-shadow-lg line-clamp-2">
                                        {publication.description}
                                    </p>
                                )}
                            </div>
                            {/* Ações na mesma linha da descrição */}
                            <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                                {/* Like */}
                                <button
                                    onClick={() => setIsLiked(!isLiked)}
                                    className="flex items-center gap-1.5 group"
                                >
                                    <Heart
                                        className={`w-7 h-7 transition ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'
                                            }`}
                                    />
                                    <span className="text-sm text-white font-medium">12.3k</span>
                                </button>

                                {/* Comentários */}
                                <button
                                    onClick={() => setShowComments(!showComments)}
                                    className="flex items-center gap-1.5 group"
                                >
                                    <MessageCircle className="w-7 h-7 text-white" />
                                    <span className="text-sm text-white font-medium">234</span>
                                </button>

                                {/* Share */}
                                <button
                                    onClick={handleShare}
                                    disabled={isSharing}
                                    className="flex items-center gap-1.5 group"
                                >
                                    <Share2 className="w-7 h-7 text-white" />
                                    <span className="text-sm text-white font-medium">Compart.</span>
                                </button>
                            </div>
                        </div>

                        {/* Nome do criador (loja ou usuário) */}
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/30 flex-shrink-0">
                                {publication.store.logo_url ? (
                                    <img src={publication.store.logo_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-white/10">
                                        {publication.isFromUser ? (
                                            <User size={18} className="text-white/60" />
                                        ) : (
                                            <Store size={18} className="text-white/60" />
                                        )}
                                    </div>
                                )}
                            </div>
                            <p className="text-sm font-medium text-white/80">
                                {publication.store.name}
                                {publication.isFromUser && (
                                    <span className="text-[10px] text-white/40 ml-1">• Usuário</span>
                                )}
                            </p>
                        </div>

                        {/* Data e visualizações */}
                        <div className="flex items-center gap-3 text-xs text-white/50 mt-1.5">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {formattedDate}
                            </span>
                            <span className="flex items-center gap-1">
                                <Eye className="w-4 h-4" />
                                {publication.view_count}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}