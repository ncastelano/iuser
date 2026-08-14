// src/components/PublicationsListView.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from '@/app/theme'
import { ChevronLeft, ChevronRight, X, Pause } from 'lucide-react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { usePublicationsStore } from '@/store/usePublicationStore'

interface PublicationsListViewProps {
    ownerSlug: string
    storeSlug?: string
    initialSlug?: string
    onClose: () => void
}

export function PublicationsListView({
    ownerSlug,
    storeSlug,
    initialSlug,
    onClose
}: PublicationsListViewProps) {
    const { colors } = useTheme()
    const store = usePublicationsStore()

    const [isPaused, setIsPaused] = useState(false)
    const [progress, setProgress] = useState(0)
    const [direction, setDirection] = useState(1) // 1 = next, -1 = previous
    const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({})
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [exitX, setExitX] = useState(0)

    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const touchStartXRef = useRef<number | null>(null)
    const touchStartYRef = useRef<number | null>(null)
    const touchEndXRef = useRef<number | null>(null)
    const isDraggingRef = useRef(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Carregar publicações quando o componente montar
    useEffect(() => {
        const loadPublications = async () => {
            await store.loadPublicationsForOwner({
                ownerSlug,
                storeSlug,
                initialSlug,
            })

            // Pré-carregar todas as imagens
            const pubs = store.publications
            if (pubs.length > 0) {
                pubs.forEach((pub, index) => {
                    if (pub.image_url) {
                        const img = new Image()
                        img.onload = () => {
                            setImageLoaded(prev => ({ ...prev, [pub.id]: true }))
                        }
                        img.onerror = () => {
                            setImageLoaded(prev => ({ ...prev, [pub.id]: true }))
                        }
                        img.src = pub.image_url
                    }
                })
            }
        }

        loadPublications()

        return () => {
            // Não resetar ao fechar para manter cache
        }
    }, [ownerSlug, storeSlug, initialSlug])

    const publications = store.publications
    const currentIndex = store.currentIndex
    const isLoading = store.isLoading
    const currentPublication = store.getCurrent()
    const nextPublication = store.getNext()
    const previousPublication = store.getPrevious()
    const hasNext = currentIndex < publications.length - 1 || store.hasMore
    const hasPrevious = currentIndex > 0

    // Verificar se a imagem atual está carregada
    const isCurrentImageLoaded = currentPublication?.id
        ? imageLoaded[currentPublication.id]
        : false

    // Controlar progresso da publicação atual
    const startProgress = useCallback(() => {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
        }

        // Reset progress
        setProgress(0)

        // Duração de cada publicação (5 segundos)
        const DURATION = 5000
        const INTERVAL = 50
        const STEP = (INTERVAL / DURATION) * 100

        progressIntervalRef.current = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    // Avançar para próxima publicação
                    if (currentIndex < publications.length - 1) {
                        setDirection(1)
                        store.next()
                        return 0
                    } else if (store.hasMore) {
                        store.loadMore()
                        return 0
                    } else {
                        if (progressIntervalRef.current) {
                            clearInterval(progressIntervalRef.current)
                        }
                        onClose()
                        return 100
                    }
                }
                return prev + STEP
            })
        }, INTERVAL)
    }, [currentIndex, publications.length, store, onClose])

    // Controlar pausa/reprodução
    useEffect(() => {
        if (!isPaused && publications.length > 0 && !isLoading && isCurrentImageLoaded) {
            startProgress()
        }

        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
            }
        }
    }, [isPaused, publications.length, isLoading, startProgress, isCurrentImageLoaded])

    // Resetar progresso quando mudar de publicação
    useEffect(() => {
        setProgress(0)
        setImageLoaded(prev => ({ ...prev, [currentPublication?.id || '']: false }))

        // Pré-carregar imagem atual e próximas
        if (currentPublication?.image_url) {
            const img = new Image()
            img.onload = () => {
                setImageLoaded(prev => ({ ...prev, [currentPublication.id]: true }))
            }
            img.onerror = () => {
                setImageLoaded(prev => ({ ...prev, [currentPublication.id]: true }))
            }
            img.src = currentPublication.image_url
        }

        if (!isPaused && publications.length > 0 && !isLoading) {
            startProgress()
        }
    }, [currentIndex, isPaused, startProgress, publications.length, isLoading])

    // Navegação com transição
    const goToNext = useCallback(() => {
        if (isTransitioning) return

        if (currentIndex < publications.length - 1) {
            setDirection(1)
            setExitX(-100)
            setIsTransitioning(true)

            setTimeout(() => {
                store.next()
                setExitX(0)
                setIsTransitioning(false)
                setProgress(0)
            }, 200)
        } else if (store.hasMore) {
            store.loadMore()
        } else {
            onClose()
        }
    }, [currentIndex, publications.length, store, onClose, isTransitioning])

    const goToPrevious = useCallback(() => {
        if (isTransitioning) return

        if (currentIndex > 0) {
            setDirection(-1)
            setExitX(100)
            setIsTransitioning(true)

            setTimeout(() => {
                store.previous()
                setExitX(0)
                setIsTransitioning(false)
                setProgress(0)
            }, 200)
        }
    }, [currentIndex, store, isTransitioning])

    // Touch events para swipe estilo WhatsApp
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

        // Detectar se é um swipe horizontal
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
            isDraggingRef.current = true
            touchEndXRef.current = currentX

            // Atualizar posição do card durante o arrasto
            const progress = Math.min(Math.abs(diffX) / window.innerWidth, 1)
            const direction = diffX > 0 ? 1 : -1
            const offset = direction * progress * 80 // 80% do tamanho máximo

            if (containerRef.current) {
                containerRef.current.style.transform = `translateX(${-diffX}px)`
                containerRef.current.style.opacity = `${1 - progress * 0.3}`
            }
        }
    }

    const handleTouchEnd = () => {
        const startX = touchStartXRef.current
        const endX = touchEndXRef.current

        // Resetar posição do container
        if (containerRef.current) {
            containerRef.current.style.transform = 'translateX(0px)'
            containerRef.current.style.opacity = '1'
        }

        if (startX !== null && endX !== null && isDraggingRef.current) {
            const diff = startX - endX
            const threshold = window.innerWidth * 0.3 // 30% da tela

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

    // Toggle pause com clique
    const togglePause = () => {
        setIsPaused(!isPaused)
    }

    // Se estiver carregando inicialmente
    if (isLoading && publications.length === 0) {
        return (
            <div
                className="fixed inset-0 z-[999] flex items-center justify-center"
                style={{ background: colors.background }}
            >
                <LoadingSpinner message="Carregando publicações..." background={colors.background} />
            </div>
        )
    }

    // Se não houver publicações
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

    return (
        <div
            className="fixed inset-0 z-[999] overflow-hidden"
            style={{ background: '#000' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className="relative w-full h-full">
                {/* Container com efeito de transição */}
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
                                {/* Loading placeholder */}
                                {!isCurrentImageLoaded && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                                    </div>
                                )}

                                <img
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
                                />
                            </>
                        ) : (
                            <div className="text-white/50 text-center p-4">
                                <p>Imagem não disponível</p>
                            </div>
                        )}
                    </div>

                    {/* Overlay com informações na parte superior */}
                    <div
                        className="absolute top-0 left-0 right-0 p-4 pointer-events-none"
                        style={{
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)',
                        }}
                    >
                        <div className="flex items-center gap-3">
                            {/* Avatar do dono */}
                            {currentPublication.owner?.avatar_url && (
                                <img
                                    src={currentPublication.owner.avatar_url}
                                    alt={storeName}
                                    className="w-10 h-10 rounded-full border-2 border-white/50 object-cover"
                                />
                            )}
                            <div>
                                <p className="text-white font-semibold text-sm">
                                    {storeName}
                                </p>
                                <p className="text-white/60 text-xs">
                                    {new Date(currentPublication.created_at).toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Overlay com legenda */}
                    {hasCaption && (
                        <div
                            className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none"
                            style={{
                                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                            }}
                        >
                            <p
                                className="text-center text-white text-base font-medium max-w-2xl mx-auto px-4"
                                style={{
                                    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                }}
                            >
                                {currentPublication.description}
                            </p>
                        </div>
                    )}
                </div>

                {/* Barra de progresso superior */}
                <div className="absolute top-4 left-0 right-0 px-4 z-10">
                    <div className="flex gap-1.5 max-w-2xl mx-auto">
                        {publications.slice(0, 20).map((pub, index) => (
                            <div
                                key={pub.id}
                                className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
                            >
                                <div
                                    className="h-full bg-white transition-all duration-100"
                                    style={{
                                        width: index === currentIndex
                                            ? `${progress}%`
                                            : index < currentIndex
                                                ? '100%'
                                                : '0%'
                                    }}
                                />
                            </div>
                        ))}
                        {publications.length > 20 && (
                            <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden flex items-center justify-center">
                                <span className="text-white/40 text-[10px]">+{publications.length - 20}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Botão de fechar */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 text-white hover:opacity-80 transition-opacity p-2 rounded-full bg-black/30 hover:bg-black/50"
                    aria-label="Fechar publicações"
                >
                    <X size={24} />
                </button>

                {/* Áreas de clique para navegação */}
                <div className="absolute inset-0 flex items-center pointer-events-none">
                    {/* Área anterior (1/3 esquerda) */}
                    <div
                        className="h-full w-1/3 cursor-pointer pointer-events-auto"
                        onClick={goToPrevious}
                    />

                    {/* Área central (para pausar) */}
                    <div
                        className="h-full w-1/3 cursor-pointer pointer-events-auto"
                        onClick={togglePause}
                    />

                    {/* Área próximo (1/3 direita) */}
                    <div
                        className="h-full w-1/3 cursor-pointer pointer-events-auto"
                        onClick={goToNext}
                    />
                </div>

                {/* Botões de navegação (Desktop) */}
                {hasPrevious && (
                    <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                        <button
                            className="ml-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors pointer-events-auto"
                            onClick={(e) => {
                                e.stopPropagation()
                                goToPrevious()
                            }}
                        >
                            <ChevronLeft size={24} />
                        </button>
                    </div>
                )}

                {hasNext && (
                    <div className="absolute inset-y-0 right-0 flex items-center pointer-events-none">
                        <button
                            className="mr-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors pointer-events-auto"
                            onClick={(e) => {
                                e.stopPropagation()
                                goToNext()
                            }}
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>
                )}

                {/* Indicador de pausa */}
                {isPaused && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="p-4 rounded-full bg-black/50 backdrop-blur-sm pointer-events-none">
                            <Pause size={32} className="text-white" />
                        </div>
                    </div>
                )}

                {/* Indicador de contagem e carregamento */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3 pointer-events-none">
                    <span className="text-white/70 text-sm font-medium">
                        {currentIndex + 1} / {publications.length}
                    </span>
                    {store.isLoadingMore && (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                </div>

                {/* Indicador de carregamento da imagem */}
                {!isCurrentImageLoaded && currentPublication.image_url && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                )}
            </div>
        </div>
    )
}