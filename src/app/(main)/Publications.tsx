// src/components/Publications.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
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

interface PublicationProps {
    owner: {
        id: string
        name: string
        slug: string
        avatar_url?: string | null
    }
    content: {
        id: string
        name: string
        slug: string
        description?: string | null
        image_url?: string | null
        category?: string
        created_at: string
    }
    ownerSlug: string
    isOwner: boolean
    currentUserId: string | null
    allPublications: any[]
    currentIndex: number
    onNext: () => void
    onPrevious: () => void
    loadingMore: boolean
    // Interações
    isLiked: boolean
    likeCount: number
    onLike: () => void
    showComments: boolean
    onToggleComments: () => void
    commentText: string
    onCommentChange: (text: string) => void
    onCommentSubmit: () => void
    comments: any[]
    loadingComments: boolean
    isSaved: boolean
    onSave: () => void
    shareCount: number
    onShare: () => void
    isMenuOpen: boolean
    onToggleMenu: () => void
    onReport: () => void
    onDeleteComment: (commentId: string) => void
    commentInputRef: React.RefObject<HTMLInputElement>
    menuRef: React.RefObject<HTMLDivElement>
    containerRef: React.RefObject<HTMLDivElement>
    GRADIENT: string
    loggedUserAvatarUrl?: string | null
    loggedUserSlug?: string | null
    router: any
}

export function Publications({
    owner,
    content,
    ownerSlug,
    isOwner,
    currentUserId,
    allPublications,
    currentIndex,
    onNext,
    onPrevious,
    loadingMore,
    isLiked,
    likeCount,
    onLike,
    showComments,
    onToggleComments,
    commentText,
    onCommentChange,
    onCommentSubmit,
    comments,
    loadingComments,
    isSaved,
    onSave,
    shareCount,
    onShare,
    isMenuOpen,
    onToggleMenu,
    onReport,
    onDeleteComment,
    commentInputRef,
    menuRef,
    containerRef,
    GRADIENT,
    loggedUserAvatarUrl,
    loggedUserSlug,
    router,
}: PublicationProps) {
    const [dragOffset, setDragOffset] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const [dragDirection, setDragDirection] = useState<'up' | 'down' | null>(null)
    const dragStartY = useRef(0)
    const dragCurrentY = useRef(0)
    const isDraggingRef = useRef(false)
    const animationFrameRef = useRef<number>()
    const hasTriggeredRef = useRef(false)

    const hasImage = content?.image_url
    const showNavigation = allPublications.length > 1

    // Formatar data
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

    // ===== HANDLERS DE DRAG =====
    const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
        if (showComments) return

        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
        dragStartY.current = clientY
        dragCurrentY.current = clientY
        isDraggingRef.current = true
        setIsDragging(true)
        hasTriggeredRef.current = false
        setDragDirection(null)

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
    }

    const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDraggingRef.current || showComments) return

        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
        dragCurrentY.current = clientY

        const deltaY = dragStartY.current - dragCurrentY.current

        // Calcular offset com resistência
        const resistance = 0.6
        const maxOffset = window.innerHeight * 0.5
        let newOffset = deltaY * resistance

        // Limitar offset máximo
        if (Math.abs(newOffset) > maxOffset) {
            newOffset = Math.sign(newOffset) * maxOffset
        }

        setDragOffset(newOffset)

        // Determinar direção
        if (Math.abs(deltaY) > 10) {
            setDragDirection(deltaY > 0 ? 'up' : 'down')
        }

        // Atualizar com requestAnimationFrame para suavidade
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
        animationFrameRef.current = requestAnimationFrame(() => {
            // O estado já foi atualizado
        })
    }

    const handleDragEnd = () => {
        if (!isDraggingRef.current || showComments) return

        isDraggingRef.current = false
        setIsDragging(false)

        const deltaY = dragStartY.current - dragCurrentY.current
        const threshold = window.innerHeight * 0.15 // 15% da tela

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }

        // Verificar se deve navegar
        if (Math.abs(deltaY) > threshold) {
            if (deltaY > 0) {
                // Swipe para cima -> próximo
                onNext()
            } else {
                // Swipe para baixo -> anterior
                onPrevious()
            }
        }

        // Resetar offset com animação suave
        setDragOffset(0)
        setDragDirection(null)
    }

    // ===== HANDLERS DE TOUCH/MOUSE =====
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        // Touch events
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

        // Mouse events (para desktop)
        const handleMouseDown = (e: MouseEvent) => {
            if (showComments) return
            handleDragStart(e as unknown as React.MouseEvent)
        }

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current || showComments) return
            handleDragMove(e as unknown as React.MouseEvent)
        }

        const handleMouseUp = () => {
            if (showComments) return
            handleDragEnd()
        }

        // Adicionar eventos
        container.addEventListener('touchstart', handleTouchStart, { passive: true })
        container.addEventListener('touchmove', handleTouchMove, { passive: true })
        container.addEventListener('touchend', handleTouchEnd, { passive: true })

        // Mouse events no documento para capturar fora do container
        document.addEventListener('mousedown', handleMouseDown)
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)

        return () => {
            container.removeEventListener('touchstart', handleTouchStart)
            container.removeEventListener('touchmove', handleTouchMove)
            container.removeEventListener('touchend', handleTouchEnd)

            document.removeEventListener('mousedown', handleMouseDown)
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)

            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }, [showComments, onNext, onPrevious])

    // Calcular posição da próxima publicação para preview
    const getPreviewOffset = () => {
        if (!isDragging || Math.abs(dragOffset) < 5) return 0

        const direction = dragOffset > 0 ? 1 : -1
        const progress = Math.min(Math.abs(dragOffset) / (window.innerHeight * 0.3), 1)

        // Mostrar preview com opacidade baseado no progresso
        return {
            translateY: dragOffset,
            opacity: progress,
            scale: 1 - (progress * 0.05),
        }
    }

    const preview = getPreviewOffset()

    return (
        <div
            ref={containerRef}
            className="relative h-[calc(100dvh-64px)] w-full overflow-hidden select-none"
            style={{ touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab' }}
        >
            {/* ===== CONTEÚDO ATUAL COM TRANSFORMAÇÃO ===== */}
            <div
                className="absolute inset-0 transition-transform duration-75 ease-out"
                style={{
                    transform: `translateY(${dragOffset}px) scale(${1 - (Math.abs(dragOffset) / (window.innerHeight * 2)) * 0.05})`,
                    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
            >
                {/* ===== CONTAINER DA IMAGEM - FULLSCREEN ===== */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    {hasImage ? (
                        <div className="w-full h-full relative">
                            <img
                                src={hasImage}
                                alt={content.name}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                    const parent = target.parentElement
                                    if (parent) {
                                        const placeholder = document.createElement('div')
                                        placeholder.className = 'w-full h-full flex items-center justify-center text-6xl'
                                        placeholder.style.background = 'rgba(0,0,0,0.5)'
                                        placeholder.textContent = '📢'
                                        parent.appendChild(placeholder)
                                    }
                                }}
                            />

                            {/* ===== OVERLAY GRADIENTE ===== */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-black/50">
                            <div className="text-center text-white">
                                <div className="text-8xl mb-4">📢</div>
                                <p className="text-xl font-bold uppercase tracking-widest">Publicação</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* ===== CONTADOR DE PUBLICAÇÕES ===== */}
                {showNavigation && (
                    <div className="absolute top-4 left-4 pointer-events-auto z-10">
                        <span className="px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md border border-white/30" style={{
                            background: 'rgba(0,0,0,0.5)',
                            color: '#fff'
                        }}>
                            {currentIndex + 1} / {allPublications.length}
                        </span>
                    </div>
                )}

                {/* ===== OVERLAY DE INFORMAÇÕES ===== */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* ===== INFO DO USUÁRIO ===== */}
                    <div className="absolute bottom-32 left-4 md:left-8 pointer-events-auto max-w-[60%]">
                        <div className="text-white space-y-2 mb-3">
                            <h1 className="text-xl font-bold">{content.name}</h1>
                            {content.description && (
                                <p className="text-sm text-white/90 line-clamp-3">{content.description}</p>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => router.push(`/${ownerSlug}`)}
                                className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-white/30 hover:scale-105 transition-transform"
                                style={{ background: GRADIENT, padding: '2px' }}
                            >
                                <div className="w-full h-full rounded-full overflow-hidden bg-black/50 flex items-center justify-center">
                                    {owner.avatar_url ? (
                                        <img src={owner.avatar_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <span className="text-lg font-black text-white">
                                            {owner.name?.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            </button>
                            <div>
                                <button
                                    onClick={() => router.push(`/${ownerSlug}`)}
                                    className="font-bold text-white hover:underline text-base"
                                >
                                    {owner.name}
                                </button>
                                <div className="flex items-center gap-2 text-xs text-white/70">
                                    <span>@{owner.slug}</span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatPostDate(content.created_at)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ===== CATEGORIA ===== */}
                    {content.category && (
                        <div className="absolute top-4 right-4 pointer-events-auto">
                            <span className="px-4 py-2 rounded-full text-xs font-bold uppercase backdrop-blur-md border border-white/30" style={{
                                background: 'rgba(0,0,0,0.5)',
                                color: '#fff'
                            }}>
                                {content.category}
                            </span>
                        </div>
                    )}

                    {/* ===== BOTÕES DE AÇÃO ===== */}
                    <div className="absolute bottom-32 right-4 md:right-8 flex flex-col items-center gap-5 pointer-events-auto">
                        <button onClick={onLike} className="flex flex-col items-center group">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-orange-500/30' : 'bg-black/30'} backdrop-blur-md border border-white/20 hover:scale-110`}>
                                <Heart className={`w-6 h-6 transition-all ${isLiked ? 'fill-orange-500 text-orange-500' : 'text-white'}`} />
                            </div>
                            <span className="text-xs text-white font-medium mt-1">{formatNumber(likeCount)}</span>
                        </button>

                        <button onClick={onToggleComments} className="flex flex-col items-center group">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md border border-white/20 hover:scale-110 transition-all">
                                <MessageCircle className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xs text-white font-medium mt-1">{formatNumber(comments.length)}</span>
                        </button>

                        <button onClick={onShare} className="flex flex-col items-center group">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md border border-white/20 hover:scale-110 transition-all">
                                <Share2 className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xs text-white font-medium mt-1">{formatNumber(shareCount)}</span>
                        </button>

                        <button onClick={onSave} className="flex flex-col items-center group">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isSaved ? 'bg-orange-500/30' : 'bg-black/30'} backdrop-blur-md border border-white/20 hover:scale-110`}>
                                <Bookmark className={`w-6 h-6 transition-all ${isSaved ? 'fill-orange-500 text-orange-500' : 'text-white'}`} />
                            </div>
                            <span className="text-xs text-white font-medium mt-1">{isSaved ? 'Salvo' : 'Salvar'}</span>
                        </button>

                        <div className="relative" ref={menuRef}>
                            <button onClick={onToggleMenu} className="w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md border border-white/20 hover:scale-110 transition-all">
                                <MoreHorizontal className="w-6 h-6 text-white" />
                            </button>

                            {isMenuOpen && (
                                <div className="absolute bottom-full right-0 mb-2 min-w-[180px] rounded-2xl overflow-hidden border bg-black/90 backdrop-blur-xl border-white/10 shadow-2xl">
                                    <button onClick={onReport} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-red-400 text-sm">
                                        <Flag className="w-4 h-4" /> Denunciar
                                    </button>
                                    <button
                                        onClick={() => {
                                            const url = `${window.location.origin}/${ownerSlug}/${content.slug}`
                                            navigator.clipboard.writeText(url)
                                            toast.success('Link copiado!')
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-white/80 text-sm border-t border-white/5"
                                    >
                                        <Link2 className="w-4 h-4" /> Copiar link
                                    </button>
                                    {isOwner && (
                                        <>
                                            <button
                                                onClick={() => router.push(`/${ownerSlug}/${content.slug}/editar-produto`)}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-white/80 text-sm border-t border-white/5"
                                            >
                                                <Pencil className="w-4 h-4" /> Editar
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm('Tem certeza que deseja excluir esta publicação?')) return
                                                    const { error } = await supabase
                                                        .from('products')
                                                        .delete()
                                                        .eq('id', content.id)
                                                    if (!error) {
                                                        toast.success('Removido com sucesso!')
                                                        router.push(`/${ownerSlug}`)
                                                    } else {
                                                        toast.error('Erro ao remover')
                                                    }
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-red-400 text-sm border-t border-white/5"
                                            >
                                                <Trash2 className="w-4 h-4" /> Excluir
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== PREVIEW DA PRÓXIMA PUBLICAÇÃO ===== */}
            {isDragging && Math.abs(dragOffset) > 10 && allPublications[currentIndex + (dragOffset > 0 ? 1 : -1)] && (
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        transform: `translateY(${-dragOffset * 0.15}px) scale(${1 - (Math.abs(dragOffset) / (window.innerHeight * 3)) * 0.02})`,
                        opacity: Math.min(Math.abs(dragOffset) / (window.innerHeight * 0.15), 0.5),
                    }}
                >
                    <div className="w-full h-full bg-black/30 flex items-center justify-center">
                        <div className="text-white/30 text-4xl">
                            {dragOffset > 0 ? '⬆️ Próximo' : '⬇️ Anterior'}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== INDICADOR DE PROGRESSO ===== */}
            {isDragging && Math.abs(dragOffset) > 20 && (
                <div
                    className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-20"
                    style={{
                        top: dragOffset > 0 ? '20%' : 'auto',
                        bottom: dragOffset < 0 ? '20%' : 'auto',
                        opacity: Math.min(Math.abs(dragOffset) / 100, 1),
                    }}
                >
                    <div className={`px-4 py-2 rounded-full backdrop-blur-md border border-white/20 text-white text-sm font-medium`}
                        style={{
                            background: 'rgba(0,0,0,0.6)',
                        }}
                    >
                        {dragOffset > 0 ? '⬆️ Solte para ver próximo' : '⬇️ Solte para ver anterior'}
                    </div>
                </div>
            )}

            {/* ===== INDICADOR DE CARREGAMENTO ===== */}
            {loadingMore && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 z-10">
                    <div className="flex items-center gap-2 text-white text-sm">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent border-white" />
                        Carregando...
                    </div>
                </div>
            )}

            {/* ===== MODAL DE COMENTÁRIOS ===== */}
            {showComments && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-end justify-center pointer-events-auto z-20 animate-in fade-in duration-300">
                    <div className="w-full max-w-lg bg-black/90 backdrop-blur-xl rounded-t-3xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <MessageSquare className="w-5 h-5" />
                                Comentários ({comments.length})
                            </h3>
                            <button onClick={onToggleComments} className="text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
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
                                                    onClick={() => onDeleteComment(comment.id)}
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
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-white/20">
                                        <img
                                            src={loggedUserAvatarUrl || undefined}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement
                                                target.style.display = 'none'
                                                const parent = target.parentElement
                                                if (parent) {
                                                    const fallback = document.createElement('div')
                                                    fallback.className = 'w-full h-full flex items-center justify-center bg-orange-500/20 text-orange-400 font-bold text-lg'
                                                    fallback.textContent = loggedUserSlug?.charAt(0).toUpperCase() || '?'
                                                    parent.appendChild(fallback)
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="flex-1 flex gap-2">
                                        <input
                                            ref={commentInputRef}
                                            value={commentText}
                                            onChange={(e) => onCommentChange(e.target.value)}
                                            placeholder="Escreva um comentário..."
                                            className="flex-1 px-4 py-2 rounded-full bg-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    onCommentSubmit()
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={onCommentSubmit}
                                            disabled={!commentText.trim()}
                                            className="px-6 py-2 rounded-full font-bold text-sm transition hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-orange-500 to-red-500 text-white"
                                        >
                                            Enviar
                                        </button>
                                    </div>
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
        </div>
    )
}