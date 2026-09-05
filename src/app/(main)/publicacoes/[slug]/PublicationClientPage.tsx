//app/(main)/publicacoes/[slug]/PublicationClientPage.tsx

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { Spinner } from '@/components/Spinner'
import {
    ArrowLeft,
    Store,
    Calendar,
    Eye,
    User,
    Share2,
    MessageCircle,
    Heart,
    Send,
    LogIn,
    X,
    Trash2,
    UserCircle
} from 'lucide-react'
import { useProfile } from '@/app/contexts/ProfileContext'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/app/Header'
import { handleShareLink } from '@/lib/share'
import { getAvatarUrl } from '@/lib/avatar'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

// ===== TIPOS =====
interface PublicationWithStore {
    id: string
    name: string
    slug: string
    description: string | null
    image_url: string | null
    view_count: number | null
    created_at: string
    store_id: string | null
    owner_id: string | null
    store?: {
        id: string
        name: string
        storeSlug: string
        logo_url: string | null
        owner_id: string
        profile?: {
            id: string
            name: string
            avatar_url: string | null
            profileSlug: string
        } | null
    } | null
    profile?: {
        id: string
        name: string
        avatar_url: string | null
        profileSlug: string
    } | null
}

interface Comment {
    id: string
    content: string
    profile_id: string
    created_at: string
    updated_at: string
    comment_type: 'publication'
    publication_id: string
    profile_target_id: null
    parent_comment_id: string | null
    profiles?: {
        id: string
        name: string
        avatar_url: string | null
        profileSlug: string
    }
    replies?: Comment[]
    like_count?: number
    is_liked?: boolean
}

export default function PublicationClientPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug

    const [loading, setLoading] = useState(true)
    const [publication, setPublication] = useState<PublicationWithStore | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    // ===== COMMENT STATES =====
    const [comments, setComments] = useState<Comment[]>([])
    const [loadingComments, setLoadingComments] = useState(false)
    const [commentContent, setCommentContent] = useState('')
    const [submittingComment, setSubmittingComment] = useState(false)
    const [replyTo, setReplyTo] = useState<Comment | null>(null)
    const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    // ========== CARREGAR USUÁRIO ==========
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
        }
        getUser()
    }, [])

    // ========== CARREGAR PUBLICAÇÃO ==========
    useEffect(() => {
        const fetchPublication = async () => {
            if (!slug) return

            setLoading(true)
            setError(null)

            try {
                let { data: pubData, error: pubErr } = await supabase
                    .from('products')
                    .select(`
                        id,
                        name,
                        slug,
                        description,
                        image_url,
                        view_count,
                        created_at,
                        store_id,
                        owner_id
                    `)
                    .eq('slug', slug)
                    .eq('listing_type', 'publication')
                    .maybeSingle()

                if (pubErr || !pubData) {
                    const { data: pubById, error: byIdErr } = await supabase
                        .from('products')
                        .select(`
                            id,
                            name,
                            slug,
                            description,
                            image_url,
                            view_count,
                            created_at,
                            store_id,
                            owner_id
                        `)
                        .eq('id', slug)
                        .eq('listing_type', 'publication')
                        .maybeSingle()

                    if (byIdErr || !pubById) {
                        throw new Error('Publicação não encontrada')
                    }

                    pubData = pubById
                }

                let publicationWithData: PublicationWithStore = {
                    ...pubData,
                    store: null,
                    profile: null
                }

                // Se tem store_id, busca os dados da loja
                if (pubData?.store_id) {
                    const { data: storeData, error: storeErr } = await supabase
                        .from('stores')
                        .select(`
                            id,
                            name,
                            storeSlug,
                            logo_url,
                            owner_id
                        `)
                        .eq('id', pubData.store_id)
                        .maybeSingle()

                    if (!storeErr && storeData) {
                        let profileData = null
                        if (storeData.owner_id) {
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('id, name, avatar_url, profileSlug')
                                .eq('id', storeData.owner_id)
                                .maybeSingle()
                            profileData = profile
                        }

                        publicationWithData = {
                            ...pubData,
                            store: {
                                ...storeData,
                                profile: profileData
                            },
                            profile: null
                        }
                    }
                }
                // Se não tem store_id, busca o perfil do owner
                else if (pubData?.owner_id) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('id, name, avatar_url, profileSlug')
                        .eq('id', pubData.owner_id)
                        .maybeSingle()

                    publicationWithData = {
                        ...pubData,
                        store: null,
                        profile: profile || null
                    }
                }

                setPublication(publicationWithData)

                if (pubData?.id) {
                    await supabase
                        .from('products')
                        .update({ view_count: (pubData.view_count || 0) + 1 })
                        .eq('id', pubData.id)

                    await loadPublicationComments(pubData.id)
                }

            } catch (err: any) {
                console.error('Erro ao carregar publicação:', err)
                setError(err.message || 'Publicação não encontrada')
            } finally {
                setLoading(false)
            }
        }

        fetchPublication()
    }, [slug])

    // ========== CARREGAR COMENTÁRIOS ==========
    const loadPublicationComments = async (publicationId: string) => {
        try {
            setLoadingComments(true)
            const { data, error } = await supabase
                .from('comments')
                .select(`
                    *,
                    profiles:profile_id (
                        id,
                        name,
                        avatar_url,
                        profileSlug
                    ),
                    replies:comments!parent_comment_id (
                        *,
                        profiles:profile_id (
                            id,
                            name,
                            avatar_url,
                            profileSlug
                        )
                    )
                `)
                .eq('publication_id', publicationId)
                .is('parent_comment_id', null)
                .order('created_at', { ascending: false })

            if (error) throw error

            const processed = await Promise.all((data || []).map(async (comment: any) => {
                const { count: likeCount } = await supabase
                    .from('comment_likes')
                    .select('*', { count: 'exact', head: true })
                    .eq('comment_id', comment.id)

                let isLiked = false
                if (currentUserId) {
                    const { data: likeData } = await supabase
                        .from('comment_likes')
                        .select('id')
                        .eq('comment_id', comment.id)
                        .eq('profile_id', currentUserId)
                        .maybeSingle()
                    isLiked = !!likeData
                }

                const repliesWithLikes = await Promise.all((comment.replies || []).map(async (reply: any) => {
                    const { count: replyLikeCount } = await supabase
                        .from('comment_likes')
                        .select('*', { count: 'exact', head: true })
                        .eq('comment_id', reply.id)

                    let replyIsLiked = false
                    if (currentUserId) {
                        const { data: replyLikeData } = await supabase
                            .from('comment_likes')
                            .select('id')
                            .eq('comment_id', reply.id)
                            .eq('profile_id', currentUserId)
                            .maybeSingle()
                        replyIsLiked = !!replyLikeData
                    }

                    return {
                        ...reply,
                        like_count: replyLikeCount || 0,
                        is_liked: replyIsLiked
                    }
                }))

                return {
                    ...comment,
                    like_count: likeCount || 0,
                    is_liked: isLiked,
                    replies: repliesWithLikes.sort((a: any, b: any) =>
                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    )
                }
            }))

            setComments(processed)
        } catch (error) {
            console.error('Erro ao carregar comentários:', error)
        } finally {
            setLoadingComments(false)
        }
    }

    // ========== ADICIONAR COMENTÁRIO ==========
    const handleAddComment = async () => {
        if (!currentUserId) {
            toast.error('Faça login para comentar')
            return
        }

        if (!commentContent.trim() || !publication) return

        setSubmittingComment(true)
        try {
            const insertData: any = {
                content: commentContent.trim(),
                profile_id: currentUserId,
                comment_type: 'publication',
                publication_id: publication.id,
            }

            if (replyTo) {
                insertData.parent_comment_id = replyTo.id
            }

            const { data, error } = await supabase
                .from('comments')
                .insert(insertData)
                .select(`
                    *,
                    profiles:profile_id (
                        id,
                        name,
                        avatar_url,
                        profileSlug
                    )
                `)
                .single()

            if (error) throw error

            const newComment = {
                ...data,
                like_count: 0,
                is_liked: false,
                replies: []
            }

            if (replyTo) {
                setComments(prev =>
                    prev.map(c =>
                        c.id === replyTo.id
                            ? { ...c, replies: [...(c.replies || []), newComment] }
                            : c
                    )
                )
                setReplyTo(null)
                toast.success('Resposta adicionada!')
            } else {
                setComments(prev => [newComment, ...prev])
                toast.success('Comentário adicionado!')
            }

            setCommentContent('')
        } catch (error: any) {
            toast.error('Erro ao comentar: ' + error.message)
        } finally {
            setSubmittingComment(false)
        }
    }

    // ========== DELETAR COMENTÁRIO ==========
    const handleDeleteComment = async (commentId: string) => {
        if (!confirm('Tem certeza que deseja excluir este comentário?')) return

        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId)

            if (error) throw error

            setComments(prev => prev.filter(c => c.id !== commentId))
            toast.success('Comentário excluído')
        } catch (error: any) {
            toast.error('Erro ao excluir: ' + error.message)
        }
    }

    // ========== CURTIR COMENTÁRIO ==========
    const handleLikeComment = async (commentId: string) => {
        if (!currentUserId) {
            toast.error('Faça login para curtir')
            return
        }

        try {
            const { data: existing } = await supabase
                .from('comment_likes')
                .select('id')
                .eq('comment_id', commentId)
                .eq('profile_id', currentUserId)
                .maybeSingle()

            if (existing) {
                const { error } = await supabase
                    .from('comment_likes')
                    .delete()
                    .eq('comment_id', commentId)
                    .eq('profile_id', currentUserId)

                if (error) throw error

                const updateComment = (comments: Comment[]): Comment[] => {
                    return comments.map(c => {
                        if (c.id === commentId) {
                            return { ...c, is_liked: false, like_count: Math.max(0, (c.like_count || 0) - 1) }
                        }
                        if (c.replies) {
                            return { ...c, replies: updateComment(c.replies) }
                        }
                        return c
                    })
                }

                setComments(prev => updateComment(prev))
            } else {
                const { error } = await supabase
                    .from('comment_likes')
                    .insert({
                        comment_id: commentId,
                        profile_id: currentUserId
                    })

                if (error) throw error

                const updateComment = (comments: Comment[]): Comment[] => {
                    return comments.map(c => {
                        if (c.id === commentId) {
                            return { ...c, is_liked: true, like_count: (c.like_count || 0) + 1 }
                        }
                        if (c.replies) {
                            return { ...c, replies: updateComment(c.replies) }
                        }
                        return c
                    })
                }

                setComments(prev => updateComment(prev))
            }
        } catch (error: any) {
            toast.error('Erro ao curtir: ' + error.message)
        }
    }

    // ========== RENDER COMENTÁRIO ==========
    const renderCommentTree = (commentsList: Comment[], isReply = false) => {
        return commentsList.map((comment) => {
            const isBeingReplied = replyTo?.id === comment.id

            return (
                <div key={comment.id} className={`${isReply ? 'ml-8' : ''}`}>
                    <div className="flex gap-3 p-3 rounded-xl" style={{
                        background: isReply ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isBeingReplied ? '#f97316' : colors.border}`,
                        boxShadow: isBeingReplied ? '0 0 0 2px rgba(249, 115, 22, 0.2)' : 'none',
                        transition: 'all 0.2s ease',
                    }}>
                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }}>
                            {comment.profiles?.avatar_url ? (
                                <img src={getAvatarUrl(supabase, comment.profiles.avatar_url) || ''} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <User size={14} style={{ color: colors.textSecondary }} />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        {comment.profiles?.name || 'Usuário'}
                                    </span>
                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        {formatDistanceToNow(new Date(comment.created_at), {
                                            addSuffix: true,
                                            locale: ptBR
                                        })}
                                    </span>
                                </div>
                                {currentUserId === comment.profile_id && (
                                    <button
                                        onClick={() => handleDeleteComment(comment.id)}
                                        className="p-1 rounded hover:bg-red-500/10 transition"
                                    >
                                        <Trash2 size={12} style={{ color: '#ef4444' }} />
                                    </button>
                                )}
                            </div>

                            <p className="text-sm mt-1 leading-relaxed" style={{ color: colors.textPrimary }}>
                                {comment.content}
                            </p>

                            <div className="flex items-center gap-4 mt-2">
                                <button
                                    onClick={() => handleLikeComment(comment.id)}
                                    className="flex items-center gap-1 text-xs transition hover:opacity-70"
                                    style={{ color: comment.is_liked ? '#ef4444' : colors.textSecondary }}
                                >
                                    <Heart size={12} fill={comment.is_liked ? '#ef4444' : 'none'} />
                                    <span>{comment.like_count || 0}</span>
                                </button>

                                <button
                                    onClick={() => {
                                        if (!currentUserId) {
                                            toast.error('Faça login para responder')
                                            return
                                        }
                                        if (replyTo?.id === comment.id) {
                                            setReplyTo(null)
                                            setCommentContent('')
                                        } else {
                                            setReplyTo(comment)
                                            setCommentContent('')
                                        }
                                    }}
                                    className="flex items-center gap-1 text-xs transition hover:opacity-70"
                                    style={{
                                        color: isBeingReplied ? '#ef4444' : '#f97316',
                                        fontWeight: isBeingReplied ? 'bold' : 'normal',
                                    }}
                                >
                                    <MessageCircle size={12} />
                                    {isBeingReplied ? 'Cancelar' : 'Responder'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {isBeingReplied && (
                        <div className="mt-2 ml-11 animate-slide-up">
                            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg mb-2" style={{
                                background: 'rgba(249, 115, 22, 0.08)',
                                border: `1px solid rgba(249, 115, 22, 0.2)`,
                            }}>
                                <span className="text-xs" style={{ color: colors.textSecondary }}>
                                    Respondendo a <strong>{comment.profiles?.name}</strong>
                                </span>
                                <button
                                    onClick={() => {
                                        setReplyTo(null)
                                        setCommentContent('')
                                    }}
                                    className="p-1 rounded hover:bg-white/10 transition"
                                >
                                    <X size={14} style={{ color: colors.textSecondary }} />
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={commentContent}
                                    onChange={(e) => setCommentContent(e.target.value)}
                                    placeholder={`Escreva sua resposta para ${comment.profiles?.name}...`}
                                    className="flex-1 rounded-xl py-2 px-3 text-sm focus:outline-none transition"
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                    disabled={submittingComment}
                                    autoFocus
                                />
                                <button
                                    onClick={handleAddComment}
                                    disabled={!commentContent.trim() || submittingComment}
                                    className="px-4 py-2 rounded-xl transition-all hover:scale-105 disabled:opacity-50 flex items-center gap-1"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',
                                    }}
                                >
                                    {submittingComment ? (
                                        <Spinner size={16} />
                                    ) : (
                                        <Send size={16} />
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-2">
                            <button
                                onClick={() => {
                                    const key = comment.id
                                    if (expandedComments.has(key)) {
                                        expandedComments.delete(key)
                                    } else {
                                        expandedComments.add(key)
                                    }
                                    setExpandedComments(new Set(expandedComments))
                                }}
                                className="text-xs font-bold transition hover:opacity-70 ml-3"
                                style={{ color: colors.textSecondary }}
                            >
                                {expandedComments.has(comment.id) ? 'Ocultar' : 'Mostrar'} {comment.replies.length} respostas
                            </button>

                            {expandedComments.has(comment.id) && (
                                <div className="space-y-2 mt-2">
                                    {renderCommentTree(comment.replies, true)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )
        })
    }

    // ===== FUNÇÃO PARA IR PARA A LOJA OU PERFIL =====
    const goToOwner = () => {
        if (!publication) return

        if (publication.store) {
            if (publication.store.storeSlug) {
                router.push(`/${publication.store.storeSlug}`)
                return
            }
            if (publication.store.profile?.profileSlug) {
                router.push(`/${publication.store.profile.profileSlug}`)
                return
            }
            if (publication.store.id) {
                router.push(`/loja/${publication.store.id}`)
                return
            }
        }

        if (publication.profile?.profileSlug) {
            router.push(`/${publication.profile.profileSlug}`)
            return
        }

        if (publication.owner_id) {
            router.push(`/perfil/${publication.owner_id}`)
        }
    }

    // ===== DETERMINA O NOME E IMAGEM PARA EXIBIR =====
    const getOwnerDisplayInfo = () => {
        if (!publication) {
            return {
                name: 'Carregando...',
                imageUrl: null,
                slug: null,
                type: 'unknown'
            }
        }

        if (publication.store) {
            if (publication.store.profile) {
                return {
                    name: publication.store.profile.name || publication.store.name,
                    imageUrl: publication.store.profile.avatar_url || publication.store.logo_url,
                    slug: publication.store.profile.profileSlug || publication.store.storeSlug,
                    type: 'store',
                    isProfileAvatar: !!publication.store.profile.avatar_url
                }
            }
            return {
                name: publication.store.name,
                imageUrl: publication.store.logo_url,
                slug: publication.store.storeSlug,
                type: 'store',
                isProfileAvatar: false
            }
        }

        if (publication.profile) {
            return {
                name: publication.profile.name || 'Usuário',
                imageUrl: publication.profile.avatar_url,
                slug: publication.profile.profileSlug,
                type: 'profile',
                isProfileAvatar: true
            }
        }

        return {
            name: 'Usuário desconhecido',
            imageUrl: null,
            slug: null,
            type: 'unknown',
            isProfileAvatar: false
        }
    }

    const ownerDisplay = getOwnerDisplayInfo()

    // ===== FUNÇÃO PARA OBTER A IMAGEM CORRETA =====
    const getOwnerImageUrl = () => {
        if (!ownerDisplay.imageUrl) return null

        // Se for avatar de perfil, usa getAvatarUrl
        if (ownerDisplay.isProfileAvatar) {
            return getAvatarUrl(supabase, ownerDisplay.imageUrl)
        }

        // Se for logo de loja, usa o bucket store-logos
        try {
            const { data } = supabase.storage.from('store-logos').getPublicUrl(ownerDisplay.imageUrl)
            return data?.publicUrl || null
        } catch {
            return null
        }
    }

    const finalOwnerImage = getOwnerImageUrl()

    // ===== ÍCONE DO TIPO =====
    const OwnerIcon = ownerDisplay.type === 'store' ? Store : UserCircle

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
                <div className="text-center">
                    <Spinner size={48} color={colors.accent} className="mx-auto mb-4" />
                    <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Carregando publicação...</p>
                </div>
            </div>
        )
    }

    if (error || !publication) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">🔍</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Publicação não encontrada'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        A publicação que você está procurando não existe ou foi removida.
                    </p>
                    <button
                        onClick={() => router.push('/publicacoes')}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        <ArrowLeft size={18} />
                        Ver todas as publicações
                    </button>
                </div>
            </div>
        )
    }

    const imageUrl = publication.image_url
        ? supabase.storage.from('product-images').getPublicUrl(publication.image_url).data.publicUrl
        : null

    const formattedDate = publication.created_at
        ? new Date(publication.created_at).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
        : ''

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Publicação"
                    showBack={true}
                    onBack={() => router.back()}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <div className="w-full px-4 md:px-6 py-6">
                    <div className="rounded-2xl overflow-hidden border" style={{
                        background: colors.surface,
                        borderColor: colors.border,
                    }}>
                        {/* Imagem */}
                        {imageUrl ? (
                            <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                                <img
                                    src={imageUrl}
                                    alt={publication.name || 'Publicação'}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ) : (
                            <div className="w-full flex items-center justify-center py-16" style={{
                                background: `${colors.border}50`
                            }}>
                                <Store size={64} style={{ color: colors.textSecondary }} />
                            </div>
                        )}

                        {/* Conteúdo */}
                        <div className="p-6 space-y-4">
                            {/* Cabeçalho - Dono da publicação (Loja ou Perfil) */}
                            <div
                                className="flex items-center gap-3 cursor-pointer group"
                                onClick={goToOwner}
                            >
                                <div
                                    className="w-12 h-12 rounded-full overflow-hidden border-2 flex-shrink-0 transition-all duration-300 group-hover:scale-105"
                                    style={{ borderColor: colors.border }}
                                >
                                    {finalOwnerImage ? (
                                        <img
                                            src={finalOwnerImage}
                                            alt={ownerDisplay.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ background: colors.border }}>
                                            <OwnerIcon size={20} style={{ color: colors.textSecondary }} />
                                        </div>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <h3
                                        className="font-bold truncate transition-colors duration-300 group-hover:text-opacity-70"
                                        style={{ color: colors.textPrimary }}
                                    >
                                        {ownerDisplay.name}
                                        {ownerDisplay.type === 'store' && (
                                            <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{
                                                background: `${colors.accent}20`,
                                                color: colors.accent
                                            }}>
                                                Loja
                                            </span>
                                        )}
                                        {ownerDisplay.type === 'profile' && (
                                            <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{
                                                background: 'rgba(249, 115, 22, 0.15)',
                                                color: '#f97316'
                                            }}>
                                                Perfil
                                            </span>
                                        )}
                                        <span className="ml-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            →
                                        </span>
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: colors.textSecondary }}>
                                        <span className="flex items-center gap-1">
                                            <Calendar size={14} />
                                            {formattedDate}
                                        </span>
                                        {publication.view_count !== null && publication.view_count !== undefined && publication.view_count > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Eye size={14} />
                                                {publication.view_count} visualizações
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <User size={18} style={{ color: colors.accent }} />
                                </div>
                            </div>

                            {/* Título */}
                            <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>
                                {publication.name || 'Sem título'}
                            </h1>

                            {/* Descrição */}
                            {publication.description && (
                                <div className="p-4 rounded-xl" style={{ background: `${colors.border}30` }}>
                                    <p style={{ color: colors.textSecondary, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                                        {publication.description}
                                    </p>
                                </div>
                            )}

                            {/* Botões de ação */}
                            <div className="pt-4 flex flex-wrap gap-3">
                                <button
                                    onClick={goToOwner}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition hover:scale-105"
                                    style={{
                                        background: colors.accent,
                                        color: '#fff',
                                    }}
                                >
                                    {ownerDisplay.type === 'store' ? (
                                        <Store size={18} />
                                    ) : (
                                        <UserCircle size={18} />
                                    )}
                                    Visitar {ownerDisplay.type === 'store' ? 'Loja' : 'Perfil'}
                                </button>

                                <button
                                    onClick={() => handleShareLink({
                                        title: `${publication.name || 'Publicação'} | ${ownerDisplay.name}`,
                                        text: publication.description || 'Confira no iUser!'
                                    })}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition hover:scale-105"
                                    style={{
                                        background: colors.surface,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                >
                                    <Share2 size={18} />
                                    Compartilhar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ===== SEÇÃO DE COMENTÁRIOS ===== */}
                    <div className="mt-6 rounded-2xl border p-6" style={{
                        background: colors.surface,
                        borderColor: colors.border,
                    }}>
                        <div className="flex items-center gap-2 mb-4">
                            <MessageCircle size={20} style={{ color: '#f97316' }} />
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Comentários
                            </h3>
                            <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {comments.length}
                            </span>
                        </div>

                        {/* Input para novo comentário */}
                        {currentUserId ? (
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={commentContent}
                                    onChange={(e) => {
                                        setCommentContent(e.target.value)
                                        if (replyTo) setReplyTo(null)
                                    }}
                                    placeholder={replyTo ? `Respondendo a ${replyTo.profiles?.name}...` : "Escreva um comentário..."}
                                    className="flex-1 rounded-xl py-2 px-3 text-sm focus:outline-none transition"
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                    disabled={submittingComment}
                                />
                                {replyTo && (
                                    <button
                                        onClick={() => {
                                            setReplyTo(null)
                                            setCommentContent('')
                                        }}
                                        className="px-3 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105"
                                        style={{
                                            background: 'rgba(255,255,255,0.05)',
                                            color: colors.textSecondary,
                                            border: `1px solid ${colors.border}`,
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                                <button
                                    onClick={handleAddComment}
                                    disabled={!commentContent.trim() || submittingComment}
                                    className="px-4 py-2 rounded-xl transition-all hover:scale-105 disabled:opacity-50 flex items-center gap-1"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',
                                    }}
                                >
                                    {submittingComment ? (
                                        <Spinner size={16} />
                                    ) : (
                                        <Send size={16} />
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="p-3 rounded-xl text-center mb-4" style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: `1px dashed ${colors.border}`
                            }}>
                                <p className="text-sm" style={{ color: colors.textSecondary }}>
                                    <button
                                        onClick={() => router.push('/login')}
                                        className="font-bold hover:underline inline-flex items-center gap-1"
                                        style={{ color: '#f97316' }}
                                    >
                                        <LogIn size={16} />
                                        Faça login
                                    </button>
                                    {' '}para comentar
                                </p>
                            </div>
                        )}

                        {/* Lista de comentários */}
                        {loadingComments ? (
                            <div className="flex justify-center py-8">
                                <Spinner size={24} color={colors.textSecondary} />
                            </div>
                        ) : comments.length === 0 ? (
                            <div className="py-8 text-center rounded-xl" style={{
                                background: `rgba(255,255,255,0.02)`,
                                border: `1px dashed ${colors.border}`,
                            }}>
                                <MessageCircle className="w-10 h-10 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nenhum comentário ainda</p>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Seja o primeiro a comentar!</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                                {renderCommentTree(comments)}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <style jsx global>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(10px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-slide-up {
                    animation: slideUp 0.25s ease-out forwards;
                }
            `}</style>
        </div>
    )
}