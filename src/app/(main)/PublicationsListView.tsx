// src/components/PublicationsListView.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from '@/app/theme'
import { ChevronLeft, ChevronRight, X, Pause } from 'lucide-react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
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

    // Estado local
    const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({})
    const [isPaused, setIsPaused] = useState(false)
    const [progress, setProgress] = useState(0)

    // Refs
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const isTransitioningRef = useRef(false)
    const touchStartXRef = useRef<number | null>(null)
    const touchStartYRef = useRef<number | null>(null)
    const touchEndXRef = useRef<number | null>(null)
    const isDraggingRef = useRef(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const isMountedRef = useRef(true)
    const currentIndexRef = useRef(0)
    const isProgressRunningRef = useRef(false)

    // Carregar publicações
    useEffect(() => {
        isMountedRef.current = true

        const loadPublications = async () => {
            await store.loadPublicationsForOwner({
                ownerSlug,
                storeSlug,
                initialSlug,
            })

            if (!isMountedRef.current) return

            const pubs = store.publications
            if (pubs.length > 0) {
                pubs.forEach((pub) => {
                    if (pub.image_url) {
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
        }

        loadPublications()

        return () => {
            isMountedRef.current = false
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
            }
        }
    }, [ownerSlug, storeSlug, initialSlug])

    // Pegar dados da store
    const publications = store.publications
    const storeCurrentIndex = store.currentIndex
    const isLoading = store.isLoading
    const currentPublication = store.getCurrent()
    const hasNext = storeCurrentIndex < publications.length - 1 || store.hasMore
    const hasPrevious = storeCurrentIndex > 0

    // Atualizar ref do índice
    useEffect(() => {
        currentIndexRef.current = storeCurrentIndex
    }, [storeCurrentIndex])

    // Verificar se a imagem atual está carregada
    const isCurrentImageLoaded = currentPublication?.id
        ? imageLoaded[currentPublication.id] || false
        : false

    // Função para parar o progresso
    const stopProgress = useCallback(() => {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
        }
        isProgressRunningRef.current = false
    }, [])

    // Função para avançar - DEFINIDA PRIMEIRO
    const goToNext = useCallback(() => {
        if (isTransitioningRef.current) return
        isTransitioningRef.current = true

        // Parar o progresso atual
        stopProgress()

        const currentIdx = storeCurrentIndex

        if (currentIdx < publications.length - 1) {
            store.next()
            setProgress(0)

            setTimeout(() => {
                isTransitioningRef.current = false
                // Iniciar progresso para a nova publicação
                if (isMountedRef.current) {
                    startProgress()
                }
            }, 300)
        } else if (store.hasMore) {
            store.loadMore()
            setTimeout(() => {
                isTransitioningRef.current = false
            }, 300)
        } else {
            onClose()
            isTransitioningRef.current = false
        }
    }, [storeCurrentIndex, publications.length, store, onClose, stopProgress])

    // Função para voltar
    const goToPrevious = useCallback(() => {
        if (isTransitioningRef.current) return
        isTransitioningRef.current = true

        // Parar o progresso atual
        stopProgress()

        if (storeCurrentIndex > 0) {
            store.previous()
            setProgress(0)

            setTimeout(() => {
                isTransitioningRef.current = false
                // Iniciar progresso para a nova publicação
                if (isMountedRef.current) {
                    startProgress()
                }
            }, 300)
        } else {
            isTransitioningRef.current = false
        }
    }, [storeCurrentIndex, store, stopProgress])

    // Função para iniciar o progresso - DEFINIDA DEPOIS DE goToNext
    const startProgress = useCallback(() => {
        // Parar qualquer progresso existente
        stopProgress()

        // Condições para não iniciar
        if (
            publications.length === 0 ||
            isPaused ||
            isLoading ||
            isTransitioningRef.current ||
            !isMountedRef.current
        ) {
            return
        }

        const currentPub = currentPublication
        if (!currentPub || !currentPub.image_url) return

        // Verificar se a imagem está carregada
        const isLoaded = imageLoaded[currentPub.id] || false

        if (!isLoaded) {
            // Tentar carregar a imagem
            const img = new Image()
            img.onload = () => {
                if (isMountedRef.current) {
                    setImageLoaded(prev => ({ ...prev, [currentPub.id]: true }))
                }
            }
            img.onerror = () => {
                if (isMountedRef.current) {
                    setImageLoaded(prev => ({ ...prev, [currentPub.id]: true }))
                }
            }
            img.src = currentPub.image_url

            // Tentar novamente em 500ms
            setTimeout(() => {
                if (isMountedRef.current && !isPaused && !isLoading) {
                    startProgress()
                }
            }, 500)
            return
        }

        // Se chegou aqui, a imagem está pronta
        isProgressRunningRef.current = true
        setProgress(0)

        const DURATION = 5000
        const INTERVAL = 50
        const STEP = (INTERVAL / DURATION) * 100

        progressIntervalRef.current = setInterval(() => {
            if (!isMountedRef.current || !isProgressRunningRef.current) {
                stopProgress()
                return
            }

            setProgress(prev => {
                const newProgress = prev + STEP

                if (newProgress >= 100) {
                    // Parar o intervalo antes de navegar
                    stopProgress()
                    // Avançar para próxima publicação
                    goToNext()
                    return 100
                }

                return newProgress
            })
        }, INTERVAL)
    }, [
        publications.length,
        isPaused,
        isLoading,
        currentPublication,
        imageLoaded,
        stopProgress,
        goToNext
    ])

    // Iniciar progresso quando as condições mudarem
    useEffect(() => {
        // Se estiver em transição, não inicia
        if (isTransitioningRef.current) return

        // Se a imagem mudou, reinicia o progresso
        if (currentPublication?.id) {
            // Pequeno delay para garantir que a imagem foi atualizada
            const timer = setTimeout(() => {
                if (isMountedRef.current) {
                    startProgress()
                }
            }, 100)

            return () => clearTimeout(timer)
        }
    }, [currentPublication?.id, startProgress])

    // Touch events
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartXRef.current = e.touches[0].clientX
        touchStartYRef.current = e.touches[0].clientY
        touchEndXRef.current = null
        isDraggingRef.current = false
        setIsPaused(true)
        stopProgress()
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
                const progress = Math.min(Math.abs(diffX) / window.innerWidth, 1)
                containerRef.current.style.transform = `translateX(${-diffX}px)`
                containerRef.current.style.opacity = `${1 - progress * 0.3}`
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
        const newPaused = !isPaused
        setIsPaused(newPaused)

        if (newPaused) {
            stopProgress()
        } else {
            startProgress()
        }
    }

    // Loading inicial
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

    // Empty
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
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
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
                                />
                            </>
                        ) : (
                            <div className="text-white/50 text-center p-4">
                                <p>Imagem não disponível</p>
                            </div>
                        )}
                    </div>

                    {/* Overlay superior */}
                    <div
                        className="absolute top-0 left-0 right-0 p-4 pointer-events-none"
                        style={{
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)',
                        }}
                    >
                        <div className="flex items-center gap-3">
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

                    {/* Overlay inferior com legenda */}
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

                {/* Barra de progresso */}
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
                                        width: index === storeCurrentIndex
                                            ? `${progress}%`
                                            : index < storeCurrentIndex
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

                {/* Botão fechar */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 text-white hover:opacity-80 transition-opacity p-2 rounded-full bg-black/30 hover:bg-black/50"
                    aria-label="Fechar publicações"
                >
                    <X size={24} />
                </button>

                {/* Áreas de clique */}
                <div className="absolute inset-0 flex items-center pointer-events-none">
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

                {/* Botões desktop */}
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

                {/* Contador e loading */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3 pointer-events-none">
                    <span className="text-white/70 text-sm font-medium">
                        {storeCurrentIndex + 1} / {publications.length}
                    </span>
                    {store.isLoadingMore && (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                </div>
            </div>
        </div>
    )
}