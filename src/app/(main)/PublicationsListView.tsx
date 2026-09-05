// src/components/PublicationsListView.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from '@/app/theme'
import { ChevronLeft, ChevronRight, X, Pause, MessageCircle } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { usePublicationsStore } from '@/store/usePublicationStore'

interface PublicationsListViewProps {
    ownerSlug: string
    storeSlug?: string
    initialSlug?: string
    onClose: () => void
}

// Função para formatar tempo relativo
function getRelativeTime(dateString: string): string {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    const diffWeek = Math.floor(diffDay / 7)
    const diffMonth = Math.floor(diffDay / 30)
    const diffYear = Math.floor(diffDay / 365)

    if (diffSec < 60) return 'agora'
    if (diffMin < 60) return `${diffMin} min`
    if (diffHour < 24) return `${diffHour} h`
    if (diffDay < 7) return `${diffDay} dia${diffDay > 1 ? 's' : ''}`
    if (diffWeek < 4) return `${diffWeek} sem${diffWeek > 1 ? 'as' : 'ana'}`
    if (diffMonth < 12) return `${diffMonth} mês${diffMonth > 1 ? 'es' : ''}`
    return `${diffYear} ano${diffYear > 1 ? 's' : ''}`
}

export function PublicationsListView({
    ownerSlug,
    storeSlug,
    initialSlug,
    onClose
}: PublicationsListViewProps) {
    const { colors } = useTheme()
    const store = usePublicationsStore()

    // Estado local
    const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({})
    const [isPaused, setIsPaused] = useState(false)
    const [progress, setProgress] = useState(0)

    // Refs para gestos de touch
    const touchStartXRef = useRef<number | null>(null)
    const touchStartYRef = useRef<number | null>(null)
    const touchEndXRef = useRef<number | null>(null)
    const isDraggingRef = useRef(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const isMountedRef = useRef(true)

    // Carregar publicações na montagem do componente
    useEffect(() => {
        isMountedRef.current = true

        const loadPublications = async () => {
            await store.loadPublicationsForOwner({
                ownerSlug,
                storeSlug,
                initialSlug,
            })
        }

        loadPublications()

        return () => {
            isMountedRef.current = false
        }
    }, [ownerSlug, storeSlug, initialSlug])

    // Pegar dados reativos da store
    const publications = store.publications
    const storeCurrentIndex = store.currentIndex
    const isLoading = store.isLoading
    const currentPublication = store.getCurrent()
    const hasNext = storeCurrentIndex < publications.length - 1 || store.hasMore
    const hasPrevious = storeCurrentIndex > 0

    // Pré-carregar imagens
    useEffect(() => {
        if (publications.length > 0) {
            publications.forEach((pub) => {
                if (pub.image_url && !imageLoaded[pub.id]) {
                    const img = new Image()
                    img.onload = () => {
                        if (isMountedRef.current) {
                            setImageLoaded(prev => ({ ...prev, [pub.id]: true }))
                        }
                    }
                    img.onerror = () => {
                        if (isMountedRef.current) {
                            setImageLoaded(prev => ({ ...prev, [pub.id]: true }))
                        }
                    }
                    img.src = pub.image_url
                }
            })
        }
    }, [publications])

    // Verificar se a imagem atual já carregou
    const isCurrentImageLoaded = currentPublication
        ? !currentPublication.image_url || imageLoaded[currentPublication.id] || false
        : false

    // Função para avançar publicação
    const goToNext = useCallback(async () => {
        setProgress(0)
        const currentIdx = store.currentIndex
        const pubs = store.publications

        if (currentIdx < pubs.length - 1) {
            store.next()
        } else if (store.hasMore && !store.isLoadingMore) {
            await store.loadMore()
            const updatedPubs = usePublicationsStore.getState().publications
            if (currentIdx + 1 < updatedPubs.length) {
                store.next()
            } else {
                onClose()
            }
        } else {
            onClose()
        }
    }, [store, onClose])

    // Função para voltar publicação
    const goToPrevious = useCallback(() => {
        if (store.currentIndex > 0) {
            setProgress(0)
            store.previous()
        }
    }, [store])

    // Reseta o progresso quando a publicação atual muda
    useEffect(() => {
        setProgress(0)
    }, [storeCurrentIndex])

    // Timer de progresso (Stories)
    useEffect(() => {
        if (
            publications.length === 0 ||
            !currentPublication ||
            isPaused ||
            isLoading ||
            store.isLoadingMore ||
            !isCurrentImageLoaded
        ) {
            return
        }

        const DURATION = 5000 // 5 segundos por publicação
        const INTERVAL = 50   // Atualização a cada 50ms
        const STEP = (INTERVAL / DURATION) * 100

        const timer = setInterval(() => {
            setProgress(prev => {
                const nextVal = prev + STEP
                if (nextVal >= 100) {
                    return 100
                }
                return nextVal
            })
        }, INTERVAL)

        return () => clearInterval(timer)
    }, [
        storeCurrentIndex,
        currentPublication?.id,
        isCurrentImageLoaded,
        isPaused,
        isLoading,
        store.isLoadingMore,
        publications.length
    ])

    // Avançar automaticamente quando atinge 100%
    useEffect(() => {
        if (progress >= 100) {
            goToNext()
        }
    }, [progress, goToNext])

    // Eventos de Touch / Drag Swipe
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartXRef.current = e.touches[0].clientX
        touchStartYRef.current = e.touches[0].clientY
        touchEndXRef.current = null
        isDraggingRef.current = false
        setIsPaused(true)
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchStartXRef.current) return

        const currentX = e.touches[0].clientX
        const currentY = e.touches[0].clientY
        const diffX = touchStartXRef.current - currentX
        const diffY = touchStartYRef.current ? touchStartYRef.current - currentY : 0

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
            isDraggingRef.current = true
            touchEndXRef.current = currentX

            if (containerRef.current) {
                const progressVal = Math.min(Math.abs(diffX) / window.innerWidth, 1)
                containerRef.current.style.transform = `translateX(${-diffX}px)`
                containerRef.current.style.opacity = `${1 - progressVal * 0.3}`
            }
        }
    }

    const handleTouchEnd = () => {
        const startX = touchStartXRef.current
        const endX = touchEndXRef.current

        if (containerRef.current) {
            containerRef.current.style.transform = 'translateX(0px)'
            containerRef.current.style.opacity = '1'
        }

        if (startX !== null && endX !== null && isDraggingRef.current) {
            const diff = startX - endX
            const threshold = window.innerWidth * 0.3

            if (Math.abs(diff) > threshold) {
                if (diff > 0) {
                    goToNext()
                } else {
                    goToPrevious()
                }
            }
        }

        setIsPaused(false)
        touchStartXRef.current = null
        touchStartYRef.current = null
        touchEndXRef.current = null
        isDraggingRef.current = false
    }

    const togglePause = () => {
        setIsPaused(prev => !prev)
    }

    // Função para abrir chat (placeholder)
    const handleOpenChat = () => {
        // TODO: Implementar navegação para o chat com o dono da publicação
        console.log('Abrir chat com:', currentPublication?.owner?.id)
    }

    // Loading inicial
    if (isLoading && publications.length === 0) {
        return (
            <div
                className="fixed inset-0 z-[999] flex items-center justify-center"
                style={{ background: colors.background }}
            >
                <div className="text-center">
                    <Spinner size={48} color={colors.accent} className="mx-auto mb-4" />
                    <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Carregando publicações...</p>
                </div>
            </div>
        )
    }

    // Estado sem publicações
    if (publications.length === 0 && !isLoading) {
        return (
            <div
                className="fixed inset-0 z-[999] flex flex-col items-center justify-center p-8"
                style={{ background: colors.background }}
            >
                <div className="text-6xl mb-4">📸</div>
                <h3 className="text-xl font-bold" style={{ color: colors.textPrimary }}>
                    Nenhuma publicação
                </h3>
                <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                    Esta loja ainda não possui publicações.
                </p>
                <button
                    onClick={onClose}
                    className="mt-6 px-6 py-3 rounded-lg font-bold transition hover:scale-105"
                    style={{ background: colors.accent, color: '#fff' }}
                >
                    Fechar
                </button>
            </div>
        )
    }

    if (!currentPublication) return null

    const hasCaption = currentPublication.description
    const storeName = currentPublication.owner?.name || 'Loja'
    const relativeTime = getRelativeTime(currentPublication.created_at)

    return (
        <div
            className="fixed inset-0 z-[999] overflow-hidden select-none"
            style={{ background: '#000' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className="relative w-full h-full">
                <div
                    ref={containerRef}
                    className="relative w-full h-full transition-transform duration-300 ease-out"
                    style={{
                        transform: 'translateX(0px)',
                        opacity: 1,
                    }}
                >
                    {/* Imagem atual */}
                    <div className="relative w-full h-full flex items-center justify-center">
                        {currentPublication.image_url ? (
                            <>
                                {!isCurrentImageLoaded && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                                        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                                    </div>
                                )}

                                <img
                                    key={currentPublication.id}
                                    src={currentPublication.image_url}
                                    alt={currentPublication.name || 'Publicação'}
                                    className={`w-full h-full object-contain select-none transition-opacity duration-300 ${isCurrentImageLoaded ? 'opacity-100' : 'opacity-0'
                                        }`}
                                    style={{
                                        maxHeight: '100vh',
                                        maxWidth: '100vw',
                                    }}
                                    draggable={false}
                                    onLoad={() => {
                                        if (currentPublication.id) {
                                            setImageLoaded(prev => ({ ...prev, [currentPublication.id]: true }))
                                        }
                                    }}
                                    onError={() => {
                                        if (currentPublication.id) {
                                            setImageLoaded(prev => ({ ...prev, [currentPublication.id]: true }))
                                        }
                                    }}
                                />
                            </>
                        ) : (
                            <div className="text-white/50 text-center p-4">
                                <p>Imagem não disponível</p>
                            </div>
                        )}
                    </div>

                    {/* Overlay superior com dados do criador - DESIGN MELHORADO */}
                    <div
                        className="absolute top-0 left-0 right-0 px-4 pt-6 pb-4 pointer-events-none z-10"
                        style={{
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
                        }}
                    >
                        <div className="flex items-center justify-between pointer-events-auto">
                            {/* Lado esquerdo: Avatar e nome */}
                            <div className="flex items-center gap-3">
                                {currentPublication.owner?.avatar_url ? (
                                    <img
                                        src={currentPublication.owner.avatar_url}
                                        alt={storeName}
                                        className="w-10 h-10 rounded-full border-2 border-white/60 object-cover shadow-lg"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                        {storeName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <p className="text-white font-semibold text-sm drop-shadow-lg">
                                        {storeName}
                                    </p>
                                    <p className="text-white/60 text-xs drop-shadow-lg">
                                        {relativeTime}
                                    </p>
                                </div>
                            </div>

                            {/* Lado direito: Botão de chat e fechar */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleOpenChat}
                                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 text-white hover:scale-110"
                                    aria-label="Abrir chat"
                                >
                                    <MessageCircle size={20} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 text-white hover:scale-110"
                                    aria-label="Fechar publicações"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Overlay inferior com legenda - DESIGN MELHORADO */}
                    {hasCaption && (
                        <div
                            className="absolute bottom-0 left-0 right-0 px-6 pb-8 pt-12 pointer-events-none z-10"
                            style={{
                                background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.8) 100%)',
                            }}
                        >
                            <div className="max-w-2xl mx-auto">
                                <div className="bg-black/30 backdrop-blur-sm rounded-2xl px-5 py-3 border border-white/10">
                                    <p
                                        className="text-center text-white/95 text-base font-medium leading-relaxed"
                                        style={{
                                            textShadow: '0 2px 8px rgba(0,0,0,0.4)',
                                        }}
                                    >
                                        {currentPublication.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Barra de progresso superior - MAIS FINA E ELEGANTE */}
                <div className="absolute top-2 left-0 right-0 px-4 z-20">
                    <div className="flex gap-1 max-w-2xl mx-auto">
                        {publications.slice(0, 20).map((pub, index) => (
                            <div
                                key={pub.id}
                                className="flex-1 h-[2px] bg-white/20 rounded-full overflow-hidden"
                            >
                                <div
                                    className="h-full bg-white transition-[width] duration-75 ease-linear rounded-full"
                                    style={{
                                        width: index === storeCurrentIndex
                                            ? `${progress}%`
                                            : index < storeCurrentIndex
                                                ? '100%'
                                                : '0%',
                                        boxShadow: index === storeCurrentIndex ? '0 0 8px rgba(255,255,255,0.3)' : 'none'
                                    }}
                                />
                            </div>
                        ))}
                        {publications.length > 20 && (
                            <div className="flex-1 h-[2px] bg-white/20 rounded-full overflow-hidden flex items-center justify-center">
                                <span className="text-white/30 text-[8px] font-medium">+{publications.length - 20}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Áreas de clique para navegação / pausa */}
                <div className="absolute inset-0 flex items-center pointer-events-none z-10">
                    <div
                        className="h-full w-1/3 cursor-pointer pointer-events-auto"
                        onClick={goToPrevious}
                    />
                    <div
                        className="h-full w-1/3 cursor-pointer pointer-events-auto"
                        onClick={togglePause}
                    />
                    <div
                        className="h-full w-1/3 cursor-pointer pointer-events-auto"
                        onClick={goToNext}
                    />
                </div>

                {/* Botões laterais para Desktop - MAIS ELEGANTES */}
                {hasPrevious && (
                    <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none z-20">
                        <button
                            className="ml-4 p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-all duration-200 pointer-events-auto hover:scale-110 border border-white/10"
                            onClick={(e) => {
                                e.stopPropagation()
                                goToPrevious()
                            }}
                            aria-label="Publicação anterior"
                        >
                            <ChevronLeft size={22} />
                        </button>
                    </div>
                )}

                {hasNext && (
                    <div className="absolute inset-y-0 right-0 flex items-center pointer-events-none z-20">
                        <button
                            className="mr-4 p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-all duration-200 pointer-events-auto hover:scale-110 border border-white/10"
                            onClick={(e) => {
                                e.stopPropagation()
                                goToNext()
                            }}
                            aria-label="Próxima publicação"
                        >
                            <ChevronRight size={22} />
                        </button>
                    </div>
                )}

                {/* Indicador visual de Pausa - MAIS ESTILIZADO */}
                {isPaused && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                        <div className="p-5 rounded-full bg-black/50 backdrop-blur-md pointer-events-none border border-white/20 shadow-2xl">
                            <Pause size={36} className="text-white" fill="white" />
                        </div>
                    </div>
                )}

                {/* Contador e indicador de carregando mais - MAIS DISCRETO */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3 pointer-events-none z-20">
                    <span className="text-white/50 text-xs font-medium tracking-wider drop-shadow">
                        {storeCurrentIndex + 1} <span className="text-white/30">/</span> {publications.length}
                    </span>
                    {store.isLoadingMore && (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                </div>
            </div>
        </div>
    )
}