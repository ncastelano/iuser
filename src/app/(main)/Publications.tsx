// src/components/Publications.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
    Heart,
    MessageCircle,
    Share2,
    Bookmark,
    MoreHorizontal,
    Flag,
    Link2,
    Pencil,
    Trash2,
    X,
    Clock,
    MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { usePublicationsStore } from '@/store/usePublicationStore'

interface PublicationsProps { // <-- Renomeado de PublicationsViewProps
    ownerSlug?: string
    storeSlug?: string
    category?: string
    initialSlug?: string
    onClose?: () => void
    GRADIENT: string
    router: any
    loggedUserSlug?: string | null
    loggedUserAvatarUrl?: string | null
    currentUserId?: string | null
}

export function Publications({ // <-- Renomeado de PublicationsView para Publications
    ownerSlug,
    storeSlug,
    category,
    initialSlug,
    onClose,
    GRADIENT,
    router,
    loggedUserSlug,
    loggedUserAvatarUrl,
    currentUserId,
}: PublicationsProps) {
    const {
        publications,
        currentIndex,
        isLoading,
        hasMore,
        isLoadingMore,
        loadPublications,
        next,
        previous,
        getCurrent,
        getNext,
        getPrevious,
    } = usePublicationsStore()

    // Estados de interação
    const [isLiked, setIsLiked] = useState(false)
    const [likeCount, setLikeCount] = useState(0)
    const [showComments, setShowComments] = useState(false)
    const [commentText, setCommentText] = useState('')
    const [comments, setComments] = useState<any[]>([])
    const [loadingComments, setLoadingComments] = useState(false)
    const [isSaved, setIsSaved] = useState(false)
    const [shareCount, setShareCount] = useState(0)
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    // Estados de drag
    const [dragOffset, setDragOffset] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const dragStartY = useRef(0)
    const dragCurrentY = useRef(0)
    const isDraggingRef = useRef(false)
    const animationFrameRef = useRef<number>()

    // Refs
    const containerRef = useRef<HTMLDivElement>(null)
    const commentInputRef = useRef<HTMLInputElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    // Publicação atual
    const currentPub = getCurrent()
    const nextPub = getNext()
    const prevPub = getPrevious()

    // Carregar publicações ao montar
    useEffect(() => {
        loadPublications({ ownerSlug, storeSlug, category })

        if (initialSlug && publications.length > 0) {
            const index = publications.findIndex(p => p.slug === initialSlug)
            if (index >= 0) {
                usePublicationsStore.getState().navigateTo(index)
            }
        }
    }, [ownerSlug, storeSlug, category])

    // Carregar interações quando mudar a publicação
    useEffect(() => {
        if (currentPub && currentUserId) {
            loadInteractions(currentPub.id)
            loadComments(currentPub.id)
        }
    }, [currentPub?.id, currentUserId])

    const loadInteractions = useCallback(async (postId: string) => {
        if (!currentUserId) return

        const { count: likes } = await supabase
            .from('post_likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId)
        setLikeCount(likes || 0)

        const { data: userLike } = await supabase
            .from('post_likes')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', currentUserId)
            .maybeSingle()
        setIsLiked(!!userLike)

        const { count: shares } = await supabase
            .from('post_shares')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId)
        setShareCount(shares || 0)

        const { data: saved } = await supabase
            .from('post_saves')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', currentUserId)
            .maybeSingle()
        setIsSaved(!!saved)
    }, [currentUserId])

    const loadComments = useCallback(async (postId: string) => {
        setLoadingComments(true)
        const { data, error } = await supabase
            .from('post_comments')
            .select(`
                *,
                profiles:user_id (
                    id,
                    name,
                    profileSlug,
                    avatar_url
                )
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: false })

        if (!error && data) {
            setComments(data)
        }
        setLoadingComments(false)
    }, [])

    // ===== HANDLERS DE DRAG =====
    const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
        if (showComments) return

        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
        dragStartY.current = clientY
        dragCurrentY.current = clientY
        isDraggingRef.current = true
        setIsDragging(true)

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
    }

    const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDraggingRef.current || showComments) return

        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
        dragCurrentY.current = clientY

        const deltaY = dragStartY.current - dragCurrentY.current
        const resistance = 0.6
        const maxOffset = window.innerHeight * 0.5
        let newOffset = deltaY * resistance

        if (Math.abs(newOffset) > maxOffset) {
            newOffset = Math.sign(newOffset) * maxOffset
        }

        setDragOffset(newOffset)
    }

    const handleDragEnd = () => {
        if (!isDraggingRef.current || showComments) return

        isDraggingRef.current = false
        setIsDragging(false)

        const deltaY = dragStartY.current - dragCurrentY.current
        const threshold = window.innerHeight * 0.15

        if (Math.abs(deltaY) > threshold) {
            if (deltaY > 0) {
                next()
            } else {
                previous()
            }
        }

        setDragOffset(0)
    }

    // ===== EVENTOS =====
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleTouchStart = (e: TouchEvent) => {
            if (showComments) return
            handleDragStart(e as unknown as React.TouchEvent)
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (showComments) return
            handleDragMove(e as unknown as React.TouchEvent)
        }

        const handleTouchEnd = () => {
            if (showComments) return
            handleDragEnd()
        }

        container.addEventListener('touchstart', handleTouchStart, { passive: true })
        container.addEventListener('touchmove', handleTouchMove, { passive: true })
        container.addEventListener('touchend', handleTouchEnd, { passive: true })

        return () => {
            container.removeEventListener('touchstart', handleTouchStart)
            container.removeEventListener('touchmove', handleTouchMove)
            container.removeEventListener('touchend', handleTouchEnd)
        }
    }, [showComments])

    // ===== INTERAÇÕES =====
    const handleLike = useCallback(async () => {
        if (!currentPub || !currentUserId) {
            toast.error('Faça login para curtir')
            return
        }

        if (isLiked) {
            const { error } = await supabase
                .from('post_likes')
                .delete()
                .eq('post_id', currentPub.id)
                .eq('user_id', currentUserId)

            if (!error) {
                setIsLiked(false)
                setLikeCount(prev => prev - 1)
            }
        } else {
            const { error } = await supabase
                .from('post_likes')
                .insert({
                    post_id: currentPub.id,
                    user_id: currentUserId,
                })

            if (!error) {
                setIsLiked(true)
                setLikeCount(prev => prev + 1)
            }
        }
    }, [currentPub, currentUserId, isLiked])

    const handleComment = useCallback(async () => {
        if (!currentPub || !currentUserId) {
            toast.error('Faça login para comentar')
            return
        }

        if (!commentText.trim()) {
            toast.error('Digite um comentário')
            return
        }

        const { data, error } = await supabase
            .from('post_comments')
            .insert({
                post_id: currentPub.id,
                user_id: currentUserId,
                content: commentText.trim(),
            })
            .select(`
                *,
                profiles:user_id (
                    id,
                    name,
                    profileSlug,
                    avatar_url
                )
            `)
            .single()

        if (!error && data) {
            setComments(prev => [data, ...prev])
            setCommentText('')
            toast.success('Comentário adicionado!')
            if (commentInputRef.current) {
                commentInputRef.current.focus()
            }
        } else {
            toast.error('Erro ao comentar')
        }
    }, [currentPub, currentUserId, commentText])

    const handleShare = useCallback(async () => {
        if (!currentPub) return

        const shareUrl = `${window.location.origin}/${currentPub.owner?.slug || 'perfil'}/${currentPub.slug}`

        if (navigator.share) {
            try {
                await navigator.share({
                    title: currentPub.name,
                    text: `Confira esta publicação no iUser: ${currentPub.name}`,
                    url: shareUrl,
                })
                return
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return
            }
        }

        try {
            await navigator.clipboard.writeText(shareUrl)
            toast.success('Link copiado!')
        } catch (err) {
            toast.error('Erro ao copiar link')
        }
    }, [currentPub])

    const handleSave = useCallback(async () => {
        if (!currentPub || !currentUserId) {
            toast.error('Faça login para salvar')
            return
        }

        if (isSaved) {
            const { error } = await supabase
                .from('post_saves')
                .delete()
                .eq('post_id', currentPub.id)
                .eq('user_id', currentUserId)

            if (!error) {
                setIsSaved(false)
                toast.info('Removido dos salvos')
            }
        } else {
            const { error } = await supabase
                .from('post_saves')
                .insert({
                    post_id: currentPub.id,
                    user_id: currentUserId,
                })

            if (!error) {
                setIsSaved(true)
                toast.success('Salvo!')
            }
        }
    }, [currentPub, currentUserId, isSaved])

    // ===== FUNÇÕES AUXILIARES =====
    const formatPostDate = (dateString: string): string => {
        const now = new Date()
        const date = new Date(dateString)
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
        const diffInMinutes = Math.floor(diffInSeconds / 60)
        const diffInHours = Math.floor(diffInMinutes / 60)
        const diffInDays = Math.floor(diffInHours / 24)
        const diffInWeeks = Math.floor(diffInDays / 7)
        const diffInMonths = Math.floor(diffInDays / 30)
        const diffInYears = Math.floor(diffInDays / 365)

        if (diffInSeconds < 60) return 'Agora mesmo'
        if (diffInMinutes < 60) return `${diffInMinutes}m`
        if (diffInHours < 24) return `${diffInHours}h`
        if (diffInDays < 7) return `${diffInDays}d`
        if (diffInWeeks < 4) return `${diffInWeeks}sem`
        if (diffInMonths < 12) return `${diffInMonths}meses`
        return `${diffInYears}anos`
    }

    const formatNumber = (num: number): string => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
        return num.toString()
    }

    // ===== RENDER =====
    if (isLoading) {
        return (
            <div className="h-[calc(100dvh-64px)] flex items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#f97316' }} />
            </div>
        )
    }

    if (!currentPub) {
        return (
            <div className="h-[calc(100dvh-64px)] flex items-center justify-center bg-black text-white">
                <div className="text-center">
                    <p className="text-4xl mb-4">📢</p>
                    <p>Nenhuma publicação encontrada</p>
                </div>
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className="relative h-[calc(100dvh-64px)] w-full overflow-hidden select-none bg-black"
            style={{ touchAction: 'none' }}
        >
            {/* Conteúdo atual com drag */}
            <div
                className="absolute inset-0 transition-transform duration-75 ease-out"
                style={{
                    transform: `translateY(${dragOffset}px)`,
                    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
            >
                {/* Imagem */}
                <div className="w-full h-full relative">
                    {currentPub.image_url ? (
                        <img
                            src={currentPub.image_url}
                            alt={currentPub.name}
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <span className="text-8xl">📢</span>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
                </div>

                {/* Overlay com informações */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Info do usuário */}
                    <div className="absolute bottom-32 left-4 md:left-8 pointer-events-auto max-w-[60%]">
                        <h1 className="text-xl font-bold text-white mb-2">{currentPub.name}</h1>
                        {currentPub.description && (
                            <p className="text-sm text-white/90 line-clamp-3 mb-3">
                                {currentPub.description}
                            </p>
                        )}

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => router.push(`/${currentPub.owner?.slug}`)}
                                className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/30"
                                style={{ background: GRADIENT, padding: '2px' }}
                            >
                                <div className="w-full h-full rounded-full overflow-hidden bg-black/50 flex items-center justify-center">
                                    {currentPub.owner?.avatar_url ? (
                                        <img src={currentPub.owner.avatar_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <span className="text-lg font-black text-white">
                                            {currentPub.owner?.name?.charAt(0).toUpperCase() || '?'}
                                        </span>
                                    )}
                                </div>
                            </button>
                            <div>
                                <button
                                    onClick={() => router.push(`/${currentPub.owner?.slug}`)}
                                    className="font-bold text-white hover:underline text-base"
                                >
                                    {currentPub.owner?.name || 'Usuário'}
                                </button>
                                <div className="flex items-center gap-2 text-xs text-white/70">
                                    <span>@{currentPub.owner?.slug || 'usuario'}</span>
                                    <span>•</span>
                                    <span>{formatPostDate(currentPub.created_at)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Botões de ação */}
                    <div className="absolute bottom-32 right-4 md:right-8 flex flex-col items-center gap-5 pointer-events-auto">
                        <button onClick={handleLike} className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-orange-500/30' : 'bg-black/30'} backdrop-blur-md border border-white/20 hover:scale-110`}>
                                <Heart className={`w-6 h-6 ${isLiked ? 'fill-orange-500 text-orange-500' : 'text-white'}`} />
                            </div>
                            <span className="text-xs text-white font-medium mt-1">{formatNumber(likeCount)}</span>
                        </button>

                        <button onClick={() => setShowComments(!showComments)} className="flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md border border-white/20 hover:scale-110">
                                <MessageCircle className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xs text-white font-medium mt-1">{formatNumber(comments.length)}</span>
                        </button>

                        <button onClick={handleShare} className="flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md border border-white/20 hover:scale-110">
                                <Share2 className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xs text-white font-medium mt-1">{formatNumber(shareCount)}</span>
                        </button>

                        <button onClick={handleSave} className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isSaved ? 'bg-orange-500/30' : 'bg-black/30'} backdrop-blur-md border border-white/20 hover:scale-110`}>
                                <Bookmark className={`w-6 h-6 ${isSaved ? 'fill-orange-500 text-orange-500' : 'text-white'}`} />
                            </div>
                            <span className="text-xs text-white font-medium mt-1">{isSaved ? 'Salvo' : 'Salvar'}</span>
                        </button>
                    </div>

                    {/* Contador */}
                    <div className="absolute top-4 left-4 pointer-events-auto">
                        <span className="px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md border border-white/30 bg-black/50 text-white">
                            {currentIndex + 1} / {publications.length}
                        </span>
                    </div>

                    {/* Categoria */}
                    {currentPub.category && (
                        <div className="absolute top-4 right-4 pointer-events-auto">
                            <span className="px-4 py-2 rounded-full text-xs font-bold uppercase backdrop-blur-md border border-white/30 bg-black/50 text-white">
                                {currentPub.category}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview do próximo */}
            {isDragging && Math.abs(dragOffset) > 20 && nextPub && (
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        transform: `translateY(${-dragOffset * 0.15}px)`,
                        opacity: Math.min(Math.abs(dragOffset) / 100, 0.5),
                    }}
                >
                    <div className="w-full h-full bg-black/50 flex items-center justify-center">
                        <div className="text-white/40 text-4xl">
                            {dragOffset > 0 ? '⬆️' : '⬇️'}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de comentários */}
            {showComments && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-end justify-center pointer-events-auto z-20">
                    <div className="w-full max-w-lg bg-black/90 backdrop-blur-xl rounded-t-3xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <MessageSquare className="w-5 h-5" />
                                Comentários ({comments.length})
                            </h3>
                            <button onClick={() => setShowComments(false)} className="text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {loadingComments ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#f97316' }} />
                                </div>
                            ) : comments.length === 0 ? (
                                <p className="text-center text-white/50 py-8">Nenhum comentário ainda. Seja o primeiro!</p>
                            ) : (
                                comments.map((comment) => (
                                    <div key={comment.id} className="flex gap-3">
                                        <button
                                            onClick={() => router.push(`/${comment.profiles?.profileSlug}`)}
                                            className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-white/20"
                                        >
                                            <img
                                                src={getAvatarUrl(supabase, comment.profiles?.avatar_url)}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement
                                                    target.style.display = 'none'
                                                    const parent = target.parentElement
                                                    if (parent) {
                                                        const fallback = document.createElement('div')
                                                        fallback.className = 'w-full h-full flex items-center justify-center bg-orange-500/20 text-orange-400 font-bold text-lg'
                                                        fallback.textContent = comment.profiles?.name?.charAt(0).toUpperCase() || '?'
                                                        parent.appendChild(fallback)
                                                    }
                                                }}
                                            />
                                        </button>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => router.push(`/${comment.profiles?.profileSlug}`)}
                                                    className="font-bold text-sm hover:underline text-white"
                                                >
                                                    {comment.profiles?.name || 'Usuário'}
                                                </button>
                                                <span className="text-xs text-white/40">@{comment.profiles?.profileSlug || 'unknown'}</span>
                                                <span className="text-xs text-white/40">• {formatPostDate(comment.created_at)}</span>
                                            </div>
                                            <p className="text-sm text-white/90 mt-1">{comment.content}</p>
                                            {comment.user_id === currentUserId && (
                                                <button
                                                    onClick={() => {
                                                        if (!confirm('Tem certeza que deseja excluir este comentário?')) return
                                                        supabase
                                                            .from('post_comments')
                                                            .delete()
                                                            .eq('id', comment.id)
                                                            .then(({ error }) => {
                                                                if (!error) {
                                                                    setComments(prev => prev.filter(c => c.id !== comment.id))
                                                                    toast.success('Comentário removido')
                                                                }
                                                            })
                                                    }}
                                                    className="text-xs text-red-400 hover:text-red-300 mt-1 transition-colors"
                                                >
                                                    Excluir
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {currentUserId ? (
                            <div className="p-4 border-t border-white/10">
                                <div className="flex gap-2">
                                    <input
                                        ref={commentInputRef}
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        placeholder="Escreva um comentário..."
                                        className="flex-1 px-4 py-2 rounded-full bg-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                handleComment()
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={handleComment}
                                        disabled={!commentText.trim()}
                                        className="px-6 py-2 rounded-full font-bold text-sm transition hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-orange-500 to-red-500 text-white"
                                    >
                                        Enviar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 border-t border-white/10 text-center">
                                <p className="text-white/60 text-sm">Faça login para comentar</p>
                                <button
                                    onClick={() => router.push('/login')}
                                    className="mt-2 px-6 py-2 rounded-full font-bold text-sm transition hover:scale-105 bg-gradient-to-r from-orange-500 to-red-500 text-white"
                                >
                                    Entrar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Loading mais */}
            {isLoadingMore && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 z-10">
                    <div className="flex items-center gap-2 text-white text-sm">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent border-white" />
                        Carregando mais...
                    </div>
                </div>
            )}
        </div>
    )
}