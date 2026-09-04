// components/ProfilePublication.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import {
    ChevronDown,
    ChevronUp,
    Plus,
    ImageIcon,
    Send,
    Trash2,
    Pencil,
    Heart,
    Share2,
    MessageCircle,
    Megaphone,
    Eye,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'
import { getAvatarUrl } from '@/lib/avatar'
import { handleShareLink } from '@/lib/share'

interface Publication {
    id: string
    name: string
    description?: string
    image_url: string | null
    slug: string
    owner_id: string
    created_at: string
    view_count?: number
    like_count?: number
    comment_count?: number
    is_liked?: boolean
}

interface ProfilePublicationProps {
    profileId: string
    profileSlug?: string
    isOwner?: boolean
    onLatestUpdate?: (iso: string) => void
}

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

export default function ProfilePublication({ profileId, profileSlug, isOwner = true, onLatestUpdate }: ProfilePublicationProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [isExpanded, setIsExpanded] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [publications, setPublications] = useState<Publication[]>([])
    const [loading, setLoading] = useState(false)

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const [profileWhatsapp, setProfileWhatsapp] = useState<string | null>(null)
    const [ownerName, setOwnerName] = useState<string>('')
    const [ownerAvatar, setOwnerAvatar] = useState<string | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    // ===== Carrega curtidas e comentarios das publicacoes em duas queries =====
    const attachEngagement = async (pubs: Publication[]): Promise<Publication[]> => {
        if (pubs.length === 0) return pubs
        const ids = pubs.map(p => p.id)

        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id ?? null
        setCurrentUserId(userId)

        const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
            supabase.from('likes').select('publication_id, profile_id').in('publication_id', ids),
            supabase.from('comments').select('publication_id').in('publication_id', ids).is('parent_comment_id', null),
        ])

        const likesByPub = new Map<string, number>()
        const likedByMe = new Set<string>()
        for (const row of likeRows || []) {
            likesByPub.set(row.publication_id, (likesByPub.get(row.publication_id) || 0) + 1)
            if (userId && row.profile_id === userId) likedByMe.add(row.publication_id)
        }

        const commentsByPub = new Map<string, number>()
        for (const row of commentRows || []) {
            commentsByPub.set(row.publication_id, (commentsByPub.get(row.publication_id) || 0) + 1)
        }

        return pubs.map(p => ({
            ...p,
            like_count: likesByPub.get(p.id) || 0,
            comment_count: commentsByPub.get(p.id) || 0,
            is_liked: likedByMe.has(p.id),
        }))
    }

    useEffect(() => {
        if (!isExpanded || !profileId) return
        let isMounted = true

        const load = async () => {
            setLoading(true)
            try {
                // Buscar publicações do perfil usando owner_id
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, description, image_url, slug, created_at, view_count')
                    .eq('owner_id', profileId)
                    .eq('listing_type', 'publication')
                    .order('created_at', { ascending: false })

                if (!error && data && isMounted) {
                    const withCounts = await attachEngagement(data as Publication[])
                    if (!isMounted) return
                    setPublications(withCounts)
                    if (data.length > 0) onLatestUpdate?.(data[0].created_at)
                }

                // Buscar dados do perfil (WhatsApp, nome e avatar para o cabecalho do card)
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('whatsapp, name, avatar_url')
                    .eq('id', profileId)
                    .single()

                if (profileData && isMounted) {
                    setProfileWhatsapp(profileData.whatsapp || null)
                    setOwnerName(profileData.name || '')
                    setOwnerAvatar(getAvatarUrl(supabase, profileData.avatar_url) || null)
                }
            } catch (err) {
                console.error('[ProfilePublication] Erro ao carregar:', err)
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        load()

        return () => { isMounted = false }
    }, [isExpanded, profileId])

    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const handleCreate = async () => {
        if (!name.trim()) {
            toast.error('Dê um nome à publicação')
            return
        }
        setSaving(true)
        try {
            let imagePath: string | null = null
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, imageFile)
                if (uploadError) throw uploadError
                imagePath = uploadData?.path ?? null
            }

            // Gerar slug único globalmente (não colide com perfis, lojas, produtos ou publicações)
            const slug = await generateUniqueGlobalSlug(name)

            // Usando owner_id (que é o profile_id) e store_id = null
            const { error: insertError } = await supabase.from('products').insert({
                name,
                slug,
                description: description || null,
                price: 0,
                type: 'physical',
                price_type: 'fixed',
                listing_type: 'publication',
                image_url: imagePath,
                owner_id: profileId,
                store_id: null,
                view_count: 0,
            })

            if (insertError) throw insertError

            toast.success('Publicação criada com sucesso!')
            setName('')
            setDescription('')
            setImageFile(null)
            setPreview(null)
            setIsCreating(false)

            const { data: freshData } = await supabase
                .from('products')
                .select('id, name, description, image_url, slug, created_at, view_count')
                .eq('owner_id', profileId)
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })
            if (freshData) setPublications(await attachEngagement(freshData as Publication[]))
        } catch (err: any) {
            console.error('Erro ao criar publicação:', err)
            toast.error('Erro ao criar: ' + (err.message || 'Tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    const handleToggleLike = async (pub: Publication) => {
        if (!currentUserId) {
            toast.error('Faça login para curtir')
            return
        }

        const liked = !!pub.is_liked
        // atualiza otimista
        setPublications(prev => prev.map(p => p.id === pub.id
            ? { ...p, is_liked: !liked, like_count: Math.max(0, (p.like_count || 0) + (liked ? -1 : 1)) }
            : p))

        const { error } = liked
            ? await supabase.from('likes').delete().eq('publication_id', pub.id).eq('profile_id', currentUserId)
            : await supabase.from('likes').insert({ publication_id: pub.id, profile_id: currentUserId })

        if (error) {
            // desfaz em caso de falha
            setPublications(prev => prev.map(p => p.id === pub.id
                ? { ...p, is_liked: liked, like_count: Math.max(0, (p.like_count || 0) + (liked ? 1 : -1)) }
                : p))
            toast.error('Erro ao curtir')
        }
    }

    const handleShare = (pub: Publication) => {
        handleShareLink({
            title: pub.name || 'Publicação',
            text: pub.description || 'Confira esta publicação no iUser!',
            url: `${window.location.origin}/publicacoes/${pub.slug}`,
        })
    }

    const formatDate = (iso: string) => {
        if (!iso) return ''
        return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Deletar esta publicação?')) return
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (!error) {
            setPublications(prev => prev.filter(p => p.id !== id))
            toast.success('Publicação removida')
        } else {
            toast.error('Erro ao remover')
        }
    }

    const getImageUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    // ===== Card de publicacao (mesmo desenho do feed em /publicacoes) =====
    // ===== Card de publicacao (mesmo desenho do feed em /publicacoes) =====
    const renderPublicationCard = (pub: Publication, showOwnerActions: boolean, compact: boolean = false) => {
        const imgUrl = getImageUrl(pub.image_url)
        const openPublication = () => router.push(`/publicacoes/${pub.slug}`)

        return (
            <div
                key={pub.id}
                onClick={openPublication}
                className={`rounded-2xl flex flex-col gap-1 cursor-pointer transition-transform hover:scale-[1.01] ${compact ? 'p-2.5 w-44 flex-shrink-0' : 'p-5'}`}
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                {/* Cabecalho: autor, data e titulo */}
                <div className="flex items-start gap-2">
                    <div
                        className={`rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center ${compact ? 'w-6 h-6' : 'w-10 h-10'}`}
                        style={{ background: GRADIENT }}
                    >
                        {ownerAvatar ? (
                            <img src={ownerAvatar} className="w-full h-full object-cover" alt={ownerName || 'Perfil'} />
                        ) : (
                            <span className={`text-white font-bold ${compact ? 'text-[10px]' : 'text-lg'}`}>
                                {ownerName?.charAt(0).toUpperCase() || '?'}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        {!compact && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold" style={{ color: textPrimary }}>
                                    {ownerName || (profileSlug ? `@${profileSlug}` : 'Voce')}
                                </span>
                                <span className="text-[10px]" style={{ color: textSecondary }}>
                                    • {formatDate(pub.created_at)}
                                </span>
                                <span
                                    className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase"
                                    style={{ background: '#10b98120', color: '#10b981' }}
                                >
                                    Novidade
                                </span>
                            </div>
                        )}
                        <p className={`font-bold ${compact ? 'text-xs' : 'text-sm mt-1'} truncate`} style={{ color: textPrimary }}>
                            {pub.name || 'Sem titulo'}
                        </p>
                        {pub.description && !compact && (
                            <p className="text-xs mt-1 line-clamp-2" style={{ color: textSecondary }}>
                                {pub.description}
                            </p>
                        )}
                    </div>

                    {showOwnerActions && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                            {profileSlug && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); router.push(`/${profileSlug}/${pub.slug}/editar`) }}
                                    className="rounded-full hover:bg-white/10 transition-colors"
                                    style={{ padding: compact ? 4 : 6 }}
                                    title="Editar"
                                >
                                    <Pencil size={compact ? 11 : 14} style={{ color: textSecondary }} />
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(pub.id) }}
                                className="rounded-full hover:bg-red-50 transition-colors"
                                style={{ padding: compact ? 4 : 6 }}
                                title="Excluir"
                            >
                                <Trash2 size={compact ? 11 : 14} style={{ color: '#ef4444' }} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Imagem da publicacao */}
                {imgUrl && (
                    <div className={`rounded-xl overflow-hidden ${compact ? 'mt-1.5' : 'mt-3'}`}>
                        <img src={imgUrl} className={`w-full object-cover ${compact ? 'max-h-[100px]' : 'max-h-[300px]'}`} alt={pub.name} />
                    </div>
                )}

                {/* Acoes: curtidas, comentarios, visualizacoes e compartilhar */}
                <div
                    className={`flex items-center flex-wrap border-t ${compact ? 'gap-1 mt-1.5 pt-1.5' : 'gap-2 mt-3 pt-3'}`}
                    style={{ borderColor: colors.border }}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); handleToggleLike(pub) }}
                        className={`flex items-center rounded-full font-bold transition-all hover:scale-105 ${compact ? 'gap-1 px-1.5 py-0.5 text-[9px]' : 'gap-1.5 px-3 py-1 text-[10px]'}`}
                        style={{
                            background: pub.is_liked ? '#ef444420' : 'rgba(255,255,255,0.05)',
                            color: pub.is_liked ? '#ef4444' : textSecondary,
                            border: pub.is_liked ? '1px solid #ef444440' : `1px solid ${colors.border}`,
                        }}
                    >
                        <Heart size={compact ? 10 : 12} fill={pub.is_liked ? '#ef4444' : 'none'} />
                        <span>{pub.like_count || 0}</span>
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); openPublication() }}
                        className={`flex items-center rounded-full font-bold transition-all hover:scale-105 ${compact ? 'gap-1 px-1.5 py-0.5 text-[9px]' : 'gap-1.5 px-3 py-1 text-[10px]'}`}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            color: textSecondary,
                            border: `1px solid ${colors.border}`,
                        }}
                    >
                        <MessageCircle size={compact ? 10 : 12} />
                        <span>{pub.comment_count || 0}</span>
                    </button>

                    {!compact && (
                        <span
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold"
                            style={{
                                background: 'rgba(255,255,255,0.05)',
                                color: textSecondary,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <Eye size={12} />
                            {pub.view_count || 0}
                        </span>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); handleShare(pub) }}
                        className={`flex items-center rounded-full font-bold transition-all hover:scale-105 ${compact ? 'gap-1 px-1.5 py-0.5 text-[9px]' : 'gap-1.5 px-3 py-1 text-[10px]'}`}
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
                            border: 'none',
                        }}
                    >
                        <Share2 size={compact ? 10 : 12} />
                        {!compact && 'Compartilhar'}
                    </button>
                </div>
            </div>
        )
    }

    // Se não for o dono, mostra apenas as publicações
    if (!isOwner) {
        return (
            <div className="mb-6 mt-4">
                <div
                    className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                        >
                            <Megaphone size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Publicações
                            </h3>
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                {publications.length} {publications.length === 1 ? 'publicação' : 'publicações'}
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                        </div>
                    ) : publications.length === 0 ? (
                        <div
                            className="rounded-2xl p-6 text-center flex flex-col items-center gap-4"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}
                        >
                            <div
                                className="w-16 h-16 rounded-full flex items-center justify-center"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                            >
                                <MessageCircle size={28} />
                            </div>
                            <div>
                                <p className="text-sm font-bold" style={{ color: textPrimary }}>
                                    Nenhuma publicação ainda
                                </p>
                                <p className="text-xs mt-1" style={{ color: textSecondary }}>
                                    Este perfil ainda não fez nenhuma publicação.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {publications.map(pub => renderPublicationCard(pub, false))}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Versão completa para o dono
    return (
        <div className="mb-6 mt-4">
            <div
                className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                    style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '9999px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                        >
                            <Megaphone size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Minhas Publicações
                            </h3>
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                Compartilhe suas ideias, produtos ou serviços
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {publications.length > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {publications.length}
                            </span>
                        )}
                        {isExpanded ? (
                            <ChevronUp size={22} style={{ color: textSecondary }} />
                        ) : (
                            <ChevronDown size={22} style={{ color: textSecondary }} />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    <div className="flex flex-col gap-4">
                        {!isCreating && publications.length > 0 && (
                            <button
                                onClick={() => setIsCreating(true)}
                                style={{
                                    ...pillButtonStyle,
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: 'transparent',
                                    border: `1px dashed ${colors.border}`,
                                    color: '#f97316',
                                }}
                                className="hover:bg-white/5 transition-colors"
                            >
                                <Plus size={16} />
                                Nova publicação
                            </button>
                        )}

                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                            </div>
                        ) : publications.length === 0 ? (
                            <div
                                className="rounded-2xl p-6 text-center flex flex-col items-center gap-4"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px dashed ${colors.border}`,
                                }}
                            >
                                <div
                                    className="w-16 h-16 rounded-full flex items-center justify-center"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <MessageCircle size={28} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold" style={{ color: textPrimary }}>
                                        Você ainda não fez nenhuma publicação
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: textSecondary }}>
                                        Comece compartilhando suas ideias, produtos ou serviços.
                                    </p>
                                </div>
                                {!isCreating && (
                                    <button
                                        onClick={() => setIsCreating(true)}
                                        style={{
                                            ...pillButtonStyle,
                                            padding: '0.625rem 1.5rem',
                                            background: GRADIENT,
                                            color: '#ffffff',
                                            boxShadow: `0 4px 12px #f9731640`,
                                        }}
                                        className="hover:scale-105 transition-transform"
                                    >
                                        <Plus size={16} />
                                        Publicar
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                                {publications.map(pub => renderPublicationCard(pub, true, true))}
                            </div>
                        )}

                        {isCreating && (
                            <div
                                className="rounded-2xl p-4 border space-y-4 animate-in slide-in-from-top-2 duration-200"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    borderColor: colors.border,
                                }}
                            >
                                <h4 className="text-sm font-black flex items-center gap-2" style={{ color: textPrimary }}>
                                    <Send size={16} style={{ color: '#f97316' }} />
                                    Nova Publicação
                                </h4>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>
                                        Imagem (opcional)
                                    </label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group"
                                    >
                                        {preview ? (
                                            <img src={preview} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <ImageIcon className="text-orange-400 group-hover:scale-110 transition-transform" size={24} />
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) setImageFile(file)
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>
                                        Título da publicação
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Minha nova ideia!"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-full border text-sm focus:outline-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: textPrimary,
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>
                                        Descrição
                                    </label>
                                    <textarea
                                        placeholder="Descreva sua novidade..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-2xl border text-sm focus:outline-none resize-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: textPrimary,
                                        }}
                                    />
                                </div>

                                {profileWhatsapp && (
                                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50/50 px-3 py-2 rounded-full">
                                        <MessageCircle size={14} />
                                        <span>Contato para interessados: <strong>{profileWhatsapp}</strong></span>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => {
                                            setIsCreating(false)
                                            setName('')
                                            setDescription('')
                                            setImageFile(null)
                                            setPreview(null)
                                        }}
                                        style={{
                                            ...pillButtonStyle,
                                            flex: 1,
                                            background: 'transparent',
                                            border: `2px solid ${colors.border}`,
                                            color: textSecondary,
                                        }}
                                        className="hover:opacity-70 transition-opacity"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={saving || !name.trim()}
                                        style={{
                                            ...pillButtonStyle,
                                            flex: 1,
                                            background: GRADIENT,
                                            color: '#ffffff',
                                            opacity: saving || !name.trim() ? 0.5 : 1,
                                        }}
                                        className="hover:opacity-80 transition-opacity"
                                    >
                                        {saving ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <Send size={14} />
                                                Publicar
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}