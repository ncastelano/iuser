// src/components/owner/Profile.tsx
'use client'

import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    AlertTriangle,
    ArrowLeft,
    Megaphone,

    MapPin,
    MessageCircle,
    Pencil,
    Plus,

    X,
    Store,

    Trash2,
    Eye,
    Share2,
    Users,
    Heart,
    MoreHorizontal,
    UserPlus,
    UserCheck,

    Camera,

    User,

    Send,
    LogIn,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { getAvatarUrl } from '@/lib/avatar'
import { usePublicationsStore } from '@/store/usePublicationStore'
import { handleShareLink } from '@/lib/share'
import { Follows } from './Follows'
import { EditProfile } from './EditProfile'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ProfileProps {
    ownerSlug: string
    colors: any
    bgMode: string
    customBgUrl?: string | null
    loggedUserSlug?: string | null
}

interface OwnerData {
    id: string
    name: string
    slug: string
    type: 'profile'
    avatar_url?: string | null
    business_hours?: any
    description?: string | null
    address?: string | null
    whatsapp?: string | null
    view_count?: number
    ratings_avg?: number
    ratings_count?: number
    show_location?: boolean
    location?: any
}

type RatingRow = {
    id: string
    rating: number
    profile_id: string
    created_at: string
    comment?: string
    is_anonymous?: boolean
    profiles?: {
        id: string
        name: string | null
        avatar_url: string | null
        profileSlug?: string | null
    } | null
    products?: {
        name: string
    } | null
}

// Tipos para comentários
type CommentType = 'publication' | 'profile'

interface Comment {
    id: string
    content: string
    profile_id: string
    created_at: string
    updated_at: string
    comment_type: CommentType
    publication_id: string | null
    profile_target_id: string | null
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

type ProfileTab = 'publications' | 'profile_comments' | 'about'

// Função para formatar telefone brasileiro
export const formatBrazilianPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers.length === 0) return ''
    if (numbers.length <= 2) return `(${numbers}`
    if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`
    if (numbers.length <= 10) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`
}

// Função para limpar formatação (apenas números)
export const cleanPhoneNumber = (value: string) => value.replace(/\D/g, '')

// ========== FUNÇÕES DE GEOLOCALIZAÇÃO (compartilhadas) ==========
export const geocodeCache: Map<string, { lat: number; lng: number; address: string } | null> = new Map()
export const reverseGeocodeCache: Map<string, string> = new Map()

export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; address: string } | null> {
    const key = query.toLowerCase().trim()
    if (geocodeCache.has(key)) return geocodeCache.get(key)!

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
            { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
        )
        if (!res.ok) throw new Error('Erro')
        const data = await res.json()

        if (data?.length > 0) {
            const result = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                address: data[0].display_name || query
            }
            geocodeCache.set(key, result)
            return result
        }
        geocodeCache.set(key, null)
        return null
    } catch {
        return null
    }
}

export async function reverseGeocode(lat: number, lng: number): Promise<{
    fullAddress: string;
    streetDisplay: string;
    extractedNumber: string;
}> {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
        )
        if (!res.ok) throw new Error('Erro')
        const data = await res.json()

        let formatted = ''
        let extractedNumber = ''

        if (data?.address) {
            const addr = data.address
            const street = addr.road || addr.street || ''
            const number = addr.house_number || ''
            const neighbourhood = addr.neighbourhood || addr.suburb || addr.district || ''
            const city = addr.city || addr.town || addr.municipality || ''
            const state = addr.state || ''

            extractedNumber = number

            const parts = []
            if (street) {
                parts.push(number ? `${street}, ${number}` : street)
            }
            if (neighbourhood) parts.push(neighbourhood)
            if (city) parts.push(city)
            if (state) parts.push(state)

            formatted = parts.length > 0 ? parts.join(', ') : data.display_name || ''
        }

        if (!formatted) {
            formatted = data?.display_name || ''
        }

        if (!formatted) {
            formatted = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        }

        reverseGeocodeCache.set(key, formatted)

        return {
            fullAddress: formatted,
            streetDisplay: extractStreetDisplay(formatted),
            extractedNumber
        }
    } catch {
        const fallback = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        reverseGeocodeCache.set(key, fallback)
        return { fullAddress: fallback, streetDisplay: fallback, extractedNumber: '' }
    }
}

export function extractStreetDisplay(fullAddress: string): string {
    if (fullAddress.startsWith('Local (')) return fullAddress
    const parts = fullAddress.split(',')
    return parts[0].trim()
}
// ========== FIM DA LOGICA DO LOCATION PICKER ==========

export function Profile({ ownerSlug, colors, bgMode, customBgUrl, loggedUserSlug }: ProfileProps) {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [owner, setOwner] = useState<OwnerData | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [isFollowing, setIsFollowing] = useState(false)
    const [totalVisitors, setTotalVisitors] = useState(0)
    const [publications, setPublications] = useState<any[]>([])
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const [stores, setStores] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState<ProfileTab>('publications')
    const [mounted, setMounted] = useState(false)
    const [expandedDesc, setExpandedDesc] = useState(false)
    const DESC_LIMIT = 100

    // ===== FOLLOWS MODAL STATE =====
    const [showFollows, setShowFollows] = useState(false)
    const [followType, setFollowType] = useState<'followers' | 'following'>('followers')

    // ===== EDIT PROFILE STATE =====
    const [showEditDialog, setShowEditDialog] = useState(false)

    // ===== PROFILE COMMENT STATES =====
    const [profileComments, setProfileComments] = useState<Comment[]>([])
    const [loadingComments, setLoadingComments] = useState(false)
    const [commentContent, setCommentContent] = useState('')
    const [submittingComment, setSubmittingComment] = useState(false)
    const [replyTo, setReplyTo] = useState<Comment | null>(null)
    const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())

    // ===== PUBLICATION COMMENT STATES =====
    const [publicationComments, setPublicationComments] = useState<Record<string, Comment[]>>({})
    const [expandedPublicationComments, setExpandedPublicationComments] = useState<Set<string>>(new Set())
    const [commentingPublicationId, setCommentingPublicationId] = useState<string | null>(null)
    const [pubCommentContent, setPubCommentContent] = useState('')
    const [submittingPubComment, setSubmittingPubComment] = useState(false)
    const [pubReplyTo, setPubReplyTo] = useState<{ publicationId: string; comment: Comment } | null>(null)

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
    const WHATSAPP_GRADIENT = 'linear-gradient(135deg, #075e54, #25D366)'
    const LOCATION_GRADIENT = 'linear-gradient(135deg, #dc2626, #f97316)'

    // ========== ESTILOS ==========
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.5)`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    const glassBg = 'rgba(255, 255, 255, 0.08)'
    const glassBgLight = 'rgba(255, 255, 255, 0.05)'

    useEffect(() => {
        setMounted(true)
    }, [])

    // ========== CARREGAR DADOS DO PERFIL ==========
    const loadProfileData = useCallback(async () => {
        if (!ownerSlug) {
            setError('Parâmetro inválido')
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('profileSlug', ownerSlug)
                .maybeSingle()

            if (profileError || !profile) {
                setError('Perfil não encontrado')
                setLoading(false)
                return
            }

            const { data: ratingsData } = await supabase
                .from('product_reviews')
                .select('rating')
                .is('store_id', null)

            let avg = 0
            let count = 0
            if (ratingsData && ratingsData.length > 0) {
                count = ratingsData.length
                avg = ratingsData.reduce((sum, r) => sum + r.rating, 0) / count
            }

            const ownerData: OwnerData = {
                id: profile.id,
                name: profile.name,
                slug: profile.profileSlug,
                type: 'profile',
                avatar_url: profile.avatar_url,
                business_hours: profile.business_hours,
                description: profile.description,
                address: profile.address,
                whatsapp: profile.whatsapp,
                view_count: profile.view_count || 0,
                ratings_avg: avg,
                ratings_count: count,
                show_location: profile.show_location || false,
                location: profile.location,
            }

            setOwner(ownerData)
            setTotalVisitors(profile.view_count || 0)

            if (profile.avatar_url) {
                const avatarUrl = getAvatarUrl(supabase, profile.avatar_url)
                setImageUrl(avatarUrl || null)
            }

            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
            setIsOwner(user?.id === profile.id)

            const [followersRes, followingRes, checkFollowRes] = await Promise.all([
                supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
                supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
                user ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', profile.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
            ])

            setFollowersCount(followersRes.count || 0)
            setFollowingCount(followingRes.count || 0)
            setIsFollowing(!!checkFollowRes.data)

            const { data: storesData } = await supabase
                .from('stores')
                .select('*')
                .eq('owner_id', profile.id)

            setStores(storesData || [])

            // Carregar publicações com contagem de curtidas e comentários
            const { data: publicationsData } = await supabase
                .from('products')
                .select(`
                    *,
                    likes:likes(count),
                    comments:comments(count)
                `)
                .eq('owner_id', profile.id)
                .is('store_id', null)
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })

            const mappedPublications = (publicationsData || []).map((pub: any) => ({
                ...pub,
                image_url: pub.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                    : null,
                like_count: pub.likes?.[0]?.count || 0,
                comment_count: pub.comments?.[0]?.count || 0,
                is_liked: false,
            }))
            setPublications(mappedPublications)

            // Carregar curtidas do usuário para cada publicação
            if (user) {
                const pubIds = mappedPublications.map((p: any) => p.id)
                if (pubIds.length > 0) {
                    const { data: likesData } = await supabase
                        .from('likes')
                        .select('publication_id')
                        .eq('profile_id', user.id)
                        .in('publication_id', pubIds)

                    const likedIds = new Set(likesData?.map((l: any) => l.publication_id) || [])
                    setPublications(prev =>
                        prev.map(p => ({
                            ...p,
                            is_liked: likedIds.has(p.id)
                        }))
                    )
                }
            }

            const { data: profileRatings } = await supabase
                .from('product_reviews')
                .select('id, rating, comment, is_anonymous, profile_id, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")')
                .is('store_id', null)
                .order('created_at', { ascending: false })

            if (profileRatings) {
                const rows = (profileRatings || []).map((r: any) => ({
                    ...r,
                    profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
                    products: Array.isArray(r.products) ? r.products[0] : r.products,
                })) as RatingRow[]
                setRatings(rows)
            }

            // Carregar comentários do perfil
            await loadProfileComments(profile.id)

        } catch (err: any) {
            console.error('Erro ao carregar perfil:', err)
            setError(err.message || 'Erro ao carregar perfil')
        } finally {
            setLoading(false)
        }
    }, [ownerSlug])

    // ========== CARREGAR COMENTÁRIOS DO PERFIL ==========
    const loadProfileComments = async (profileId: string) => {
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
                .eq('profile_target_id', profileId)
                .is('parent_comment_id', null)
                .order('created_at', { ascending: false })

            if (error) throw error

            // Processar comentários com curtidas
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

            setProfileComments(processed)
        } catch (error) {
            console.error('Erro ao carregar comentários do perfil:', error)
        } finally {
            setLoadingComments(false)
        }
    }

    // ========== CARREGAR COMENTÁRIOS DE PUBLICAÇÃO ==========
    const loadPublicationComments = async (publicationId: string) => {
        try {
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

            setPublicationComments(prev => ({
                ...prev,
                [publicationId]: processed
            }))
        } catch (error) {
            console.error('Erro ao carregar comentários da publicação:', error)
        }
    }

    useEffect(() => {
        loadProfileData()
    }, [loadProfileData])

    // ========== FOLLOW ==========
    const handleFollowToggle = async () => {
        if (!currentUserId || !owner) return
        if (isFollowing) {
            setIsFollowing(false)
            setFollowersCount(prev => prev - 1)
            await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', owner.id)
            toast.success('Deixou de seguir')
        } else {
            setIsFollowing(true)
            setFollowersCount(prev => prev + 1)
            await supabase.from('follows').insert({ follower_id: currentUserId, following_id: owner.id })
            toast.success('Começou a seguir')
        }
    }

    // ========== AVATAR ==========
    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !owner) return
        setUploadingAvatar(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${owner.id}-${Date.now()}.${fileExt}`
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true })
            if (uploadError) throw uploadError
            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
            const publicUrl = data.publicUrl
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', owner.id)
            if (updateError) throw updateError
            setImageUrl(publicUrl)
            setOwner({ ...owner, avatar_url: publicUrl })
            toast.success('Foto atualizada com sucesso!')
        } catch (err: any) {
            toast.error('Erro ao enviar foto: ' + err.message)
        } finally {
            setUploadingAvatar(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // ========== CURTIR PUBLICAÇÃO ==========
    const handleLikePublication = async (publicationId: string) => {
        if (!currentUserId) {
            toast.error('Faça login para curtir')
            return
        }

        const pub = publications.find(p => p.id === publicationId)
        if (!pub) return

        const isLiked = pub.is_liked

        try {
            if (isLiked) {
                const { error } = await supabase
                    .from('likes')
                    .delete()
                    .eq('publication_id', publicationId)
                    .eq('profile_id', currentUserId)

                if (error) throw error

                setPublications(prev =>
                    prev.map(p =>
                        p.id === publicationId
                            ? { ...p, is_liked: false, like_count: (p.like_count || 0) - 1 }
                            : p
                    )
                )
            } else {
                const { error } = await supabase
                    .from('likes')
                    .insert({
                        publication_id: publicationId,
                        profile_id: currentUserId
                    })

                if (error) throw error

                setPublications(prev =>
                    prev.map(p =>
                        p.id === publicationId
                            ? { ...p, is_liked: true, like_count: (p.like_count || 0) + 1 }
                            : p
                    )
                )
            }
        } catch (error: any) {
            toast.error('Erro ao curtir: ' + error.message)
        }
    }

    // ========== COMENTÁRIO DA PUBLICAÇÃO ==========
    const handleAddPublicationComment = async (publicationId: string, parentCommentId?: string) => {
        if (!currentUserId) {
            toast.error('Faça login para comentar')
            return
        }

        if (!pubCommentContent.trim()) return

        setSubmittingPubComment(true)
        try {
            const insertData: any = {
                content: pubCommentContent.trim(),
                profile_id: currentUserId,
                comment_type: 'publication',
                publication_id: publicationId,
            }

            if (parentCommentId) {
                insertData.parent_comment_id = parentCommentId
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

            setPublicationComments(prev => {
                const currentComments = prev[publicationId] || []

                if (parentCommentId) {
                    const updatedComments = currentComments.map(c => {
                        if (c.id === parentCommentId) {
                            return {
                                ...c,
                                replies: [...(c.replies || []), newComment]
                            }
                        }
                        if (c.replies) {
                            const updatedReplies = c.replies.map(r => {
                                if (r.id === parentCommentId) {
                                    return {
                                        ...r,
                                        replies: [...(r.replies || []), newComment]
                                    }
                                }
                                return r
                            })
                            return { ...c, replies: updatedReplies }
                        }
                        return c
                    })
                    return { ...prev, [publicationId]: updatedComments }
                } else {
                    return { ...prev, [publicationId]: [newComment, ...currentComments] }
                }
            })

            setPubReplyTo(null)
            setPubCommentContent('')
            setCommentingPublicationId(null)

            setPublications(prev =>
                prev.map(p =>
                    p.id === publicationId
                        ? { ...p, comment_count: (p.comment_count || 0) + 1 }
                        : p
                )
            )

            toast.success(parentCommentId ? 'Resposta adicionada!' : 'Comentário adicionado!')
        } catch (error: any) {
            toast.error('Erro ao comentar: ' + error.message)
        } finally {
            setSubmittingPubComment(false)
        }
    }

    // ========== COMENTÁRIO DO PERFIL ==========
    const handleAddProfileComment = async () => {
        if (!currentUserId || !owner) {
            toast.error('Faça login para comentar')
            return
        }

        if (!commentContent.trim()) return

        setSubmittingComment(true)
        try {
            const insertData: any = {
                content: commentContent.trim(),
                profile_id: currentUserId,
                comment_type: 'profile',
                profile_target_id: owner.id,
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
                setProfileComments(prev =>
                    prev.map(c =>
                        c.id === replyTo.id
                            ? { ...c, replies: [...(c.replies || []), newComment] }
                            : c
                    )
                )
                setReplyTo(null)
                toast.success('Resposta adicionada!')
            } else {
                setProfileComments(prev => [newComment, ...prev])
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
    const handleDeleteComment = async (commentId: string, type: 'profile' | 'publication', publicationId?: string) => {
        if (!confirm('Tem certeza que deseja excluir este comentário?')) return

        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId)

            if (error) throw error

            if (type === 'profile') {
                setProfileComments(prev => prev.filter(c => c.id !== commentId))
                toast.success('Comentário excluído')
            } else if (publicationId) {
                setPublicationComments(prev => ({
                    ...prev,
                    [publicationId]: (prev[publicationId] || []).filter(c => c.id !== commentId)
                }))
                setPublications(prev =>
                    prev.map(p =>
                        p.id === publicationId
                            ? { ...p, comment_count: Math.max(0, (p.comment_count || 0) - 1) }
                            : p
                    )
                )
                toast.success('Comentário excluído')
            }
        } catch (error: any) {
            toast.error('Erro ao excluir: ' + error.message)
        }
    }

    // ========== CURTIR COMENTÁRIO ==========
    const handleLikeComment = async (commentId: string, type: 'profile' | 'publication', publicationId?: string) => {
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

                if (type === 'profile') {
                    setProfileComments(prev => updateComment(prev))
                } else if (publicationId) {
                    setPublicationComments(prev => ({
                        ...prev,
                        [publicationId]: updateComment(prev[publicationId] || [])
                    }))
                }
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

                if (type === 'profile') {
                    setProfileComments(prev => updateComment(prev))
                } else if (publicationId) {
                    setPublicationComments(prev => ({
                        ...prev,
                        [publicationId]: updateComment(prev[publicationId] || [])
                    }))
                }
            }
        } catch (error: any) {
            toast.error('Erro ao curtir: ' + error.message)
        }
    }

    // ========== TOGGLE COMENTÁRIOS PUBLICAÇÃO ==========
    const togglePublicationComments = (publicationId: string) => {
        if (expandedPublicationComments.has(publicationId)) {
            expandedPublicationComments.delete(publicationId)
            setExpandedPublicationComments(new Set(expandedPublicationComments))
        } else {
            expandedPublicationComments.add(publicationId)
            setExpandedPublicationComments(new Set(expandedPublicationComments))
            if (!publicationComments[publicationId]) {
                loadPublicationComments(publicationId)
            }
        }
    }

    // ========== RATINGS STATS ==========
    const ratingsStats = useMemo(() => {
        if (ratings.length === 0) return null
        const sum = ratings.reduce((acc, r) => acc + r.rating, 0)
        const avg = sum / ratings.length
        return { avg: avg.toFixed(1), count: ratings.length }
    }, [ratings])

    // ========== WHATSAPP ==========
    const whatsappLink = useMemo(() => {
        if (!owner?.whatsapp) return null
        const cleaned = cleanPhoneNumber(owner.whatsapp)
        if (!cleaned) return null
        return `https://wa.me/${cleaned}?text=${encodeURIComponent(`Olá! Vi seu perfil no iUser e tenho interesse nos seus produtos/serviços.`)}`
    }, [owner])

    // ========== FORMAT SHORT ADDRESS ==========
    const formatShortAddress = (addr: string) => {
        if (!addr) return ''
        const parts = addr.split(',')
        const street = parts[0]?.trim() || ''
        const city = parts[2]?.trim()?.split('-')[0] || ''
        return `${street}${city ? `, ${city}` : ''}`
    }

    // ========== RENDER COMENTÁRIO ==========
    const renderCommentTree = (comments: Comment[], type: 'profile' | 'publication', publicationId?: string, isReply = false) => {
        return comments.map((comment) => {
            const isBeingReplied = type === 'profile'
                ? replyTo?.id === comment.id
                : pubReplyTo?.comment.id === comment.id && pubReplyTo?.publicationId === publicationId

            return (
                <div key={comment.id} className={`${isReply ? 'ml-8' : ''}`}>
                    {/* Comentário */}
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
                                        onClick={() => handleDeleteComment(comment.id, type, publicationId)}
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
                                    onClick={() => handleLikeComment(comment.id, type, publicationId)}
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

                                        if (type === 'profile') {
                                            if (replyTo?.id === comment.id) {
                                                setReplyTo(null)
                                                setCommentContent('')
                                            } else {
                                                setReplyTo(comment)
                                                setCommentContent('')
                                            }
                                        } else if (type === 'publication' && publicationId) {
                                            if (pubReplyTo?.comment.id === comment.id && pubReplyTo?.publicationId === publicationId) {
                                                setPubReplyTo(null)
                                                setPubCommentContent('')
                                                setCommentingPublicationId(null)
                                            } else {
                                                setPubReplyTo({ publicationId, comment })
                                                setCommentingPublicationId(publicationId)
                                                setPubCommentContent('')
                                            }
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

                    {/* Input de resposta - aparece DENTRO do comentário quando está sendo respondido */}
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
                                        if (type === 'profile') {
                                            setReplyTo(null)
                                            setCommentContent('')
                                        } else {
                                            setPubReplyTo(null)
                                            setPubCommentContent('')
                                            setCommentingPublicationId(null)
                                        }
                                    }}
                                    className="p-1 rounded hover:bg-white/10 transition"
                                >
                                    <X size={14} style={{ color: colors.textSecondary }} />
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={type === 'profile' ? commentContent : pubCommentContent}
                                    onChange={(e) => {
                                        if (type === 'profile') {
                                            setCommentContent(e.target.value)
                                        } else {
                                            setPubCommentContent(e.target.value)
                                        }
                                    }}
                                    placeholder={`Escreva sua resposta para ${comment.profiles?.name}...`}
                                    className="flex-1 rounded-xl py-2 px-3 text-sm focus:outline-none transition"
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                    disabled={type === 'profile' ? submittingComment : submittingPubComment}
                                    autoFocus
                                />
                                <button
                                    onClick={() => {
                                        if (type === 'profile') {
                                            handleAddProfileComment()
                                        } else if (publicationId) {
                                            handleAddPublicationComment(publicationId, comment.id)
                                        }
                                    }}
                                    disabled={
                                        type === 'profile'
                                            ? !commentContent.trim() || submittingComment
                                            : !pubCommentContent.trim() || submittingPubComment
                                    }
                                    className="px-4 py-2 rounded-xl transition-all hover:scale-105 disabled:opacity-50 flex items-center gap-1"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',
                                    }}
                                >
                                    {(type === 'profile' ? submittingComment : submittingPubComment) ? (
                                        <Spinner size={16} />
                                    ) : (
                                        <Send size={16} />
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Respostas existentes */}
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
                                    {renderCommentTree(comment.replies, type, publicationId, true)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )
        })
    }

    // ========== RENDER ==========
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: colors.accent }}></div>
            </div>
        )
    }

    if (error || !owner) {
        return (
            <div className="min-h-[400px] flex items-center justify-center px-4">
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <AlertTriangle className="w-12 h-12" style={{ color: colors.accent }} />
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Perfil não encontrado'}
                    </h2>
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Voltar ao início
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full px-4 md:px-6 py-4 flex flex-col gap-4">
            <style jsx global>{`
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(249, 115, 22, 0); }
                }
                .animate-pulse-glow {
                    animation: pulse-glow 2s ease-in-out infinite;
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(30px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-slide-up {
                    animation: slideUp 0.3s ease-out forwards;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out forwards;
                }
            `}</style>

            {/* ===== HEADER DO PERFIL ===== */}
            <div className="rounded-2xl p-5" style={cardStyle}>
                <div className="flex flex-col items-center text-center">
                    <div className="relative">
                        <div
                            className="w-28 h-28 rounded-full p-[3px] animate-pulse-glow"
                            style={{ background: GRADIENT }}
                        >
                            <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                {imageUrl ? (
                                    <img src={imageUrl} alt={owner.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-5xl font-black" style={{ color: '#f97316' }}>
                                        {owner.name?.charAt(0) || '?'}
                                    </span>
                                )}
                            </div>
                        </div>
                        {isOwner && (
                            <>
                                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" style={{ display: 'none' }} />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute -bottom-1 -right-1 p-1.5 rounded-full transition-all hover:scale-110"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    <Camera size={14} />
                                </button>
                            </>
                        )}
                    </div>

                    <h1 className="text-2xl font-black mt-3 tracking-tight" style={{ color: colors.textPrimary }}>
                        {owner.name}
                    </h1>

                    <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                        <button
                            onClick={() => {
                                setFollowType('followers')
                                setShowFollows(true)
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] transition-all hover:scale-105 hover:bg-white/10"
                            style={{ background: glassBg, color: colors.textSecondary }}
                        >
                            <Users size={12} />
                            <span className="font-bold" style={{ color: colors.textPrimary }}>{followersCount}</span>
                            <span>seguidores</span>
                        </button>

                        <button
                            onClick={() => {
                                setFollowType('following')
                                setShowFollows(true)
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] transition-all hover:scale-105 hover:bg-white/10"
                            style={{ background: glassBg, color: colors.textSecondary }}
                        >
                            <UserCheck size={12} />
                            <span className="font-bold" style={{ color: colors.textPrimary }}>{followingCount}</span>
                            <span>seguindo</span>
                        </button>

                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px]" style={{ background: glassBg, color: colors.textSecondary }}>
                            <Eye size={12} />
                            <span className="font-bold" style={{ color: colors.textPrimary }}>{totalVisitors}</span>
                            <span>visitas</span>
                        </div>
                    </div>

                    {owner.description && (
                        <div className="mt-3 text-sm leading-relaxed max-w-lg mx-auto" style={{ color: colors.textSecondary }}>
                            {expandedDesc || owner.description.length <= DESC_LIMIT
                                ? owner.description
                                : `${owner.description.slice(0, DESC_LIMIT)}...`}
                            {owner.description.length > DESC_LIMIT && (
                                <button
                                    onClick={() => setExpandedDesc(!expandedDesc)}
                                    className="ml-1 font-bold text-xs uppercase hover:underline"
                                    style={{ color: '#f97316' }}
                                >
                                    {expandedDesc ? 'ver menos' : 'ver mais'}
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                        {currentUserId && currentUserId !== owner.id && (
                            <button
                                onClick={handleFollowToggle}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105"
                                style={isFollowing ? {
                                    background: 'transparent',
                                    color: '#f97316',
                                    border: `2px solid ${GRADIENT}`,
                                } : {
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                                    border: 'none',
                                }}
                            >
                                {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                                {isFollowing ? 'Seguindo' : 'Seguir'}
                            </button>
                        )}

                        <button
                            onClick={() => handleShareLink({
                                title: owner.name,
                                text: owner.description || `Confira o perfil de ${owner.name} no iUser!`
                            })}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                                border: 'none',
                            }}
                        >
                            <Share2 size={14} />
                            Compartilhar
                        </button>

                        {owner.address && (
                            <button
                                onClick={() => {
                                    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(owner.address!)}`
                                    window.open(url, '_blank')
                                }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105"
                                style={{
                                    background: LOCATION_GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
                                    border: 'none',
                                }}
                            >
                                <MapPin size={14} />
                                <span>{formatShortAddress(owner.address)}</span>
                            </button>
                        )}

                        {whatsappLink && (
                            <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105"
                                style={{
                                    background: WHATSAPP_GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: '0 4px 14px rgba(37, 211, 102, 0.4)',
                                    border: 'none',
                                }}
                            >
                                <MessageCircle size={14} />
                                WhatsApp
                            </a>
                        )}

                        {isOwner && (
                            <button
                                onClick={() => setShowEditDialog(true)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                                    border: 'none',
                                }}
                            >
                                <Pencil size={14} />
                                Editar Perfil
                            </button>
                        )}
                    </div>
                </div>

                {stores.length > 0 && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: colors.border }}>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider mr-1" style={{ color: colors.textSecondary }}>
                                Lojas
                            </span>
                            {stores.map((store) => {
                                const logoUrl = store.logo_url
                                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                                    : null
                                return (
                                    <button
                                        key={store.id}
                                        onClick={() => router.push(`/${store.storeSlug}`)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-105"
                                        style={{
                                            background: GRADIENT,
                                            color: '#ffffff',
                                            boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',
                                            border: 'none',
                                        }}
                                    >
                                        <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                                            {logoUrl ? (
                                                <img src={logoUrl} className="w-full h-full object-cover" alt={store.name} />
                                            ) : (
                                                <span className="text-xs font-black text-white">
                                                    {store.name?.charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <span>{store.name}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ===== TABS ===== */}
            <div className="flex rounded-2xl p-1.5 gap-1" style={cardStyle}>
                {[
                    { id: 'publications', label: 'Publicações', icon: Megaphone, count: publications.length },
                    { id: 'profile_comments', label: 'Comentários', icon: MessageCircle, count: profileComments.length },
                    { id: 'about', label: 'Sobre', icon: MoreHorizontal, count: 0 },
                ].map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as ProfileTab)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 ${isActive ? 'shadow-lg scale-[1.02]' : 'hover:bg-white/5'}`}
                            style={
                                isActive
                                    ? {
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 12px #f9731650`,
                                        border: 'none',
                                    }
                                    : {
                                        background: 'transparent',
                                        color: colors.textSecondary,
                                        border: '1px solid transparent',
                                    }
                            }
                        >
                            <Icon size={14} />
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                                <span className="text-[9px] font-bold opacity-70">({tab.count})</span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* ===== CONTEÚDO DAS TABS ===== */}
            <div className="space-y-4">
                {/* TAB PUBLICAÇÕES */}
                {activeTab === 'publications' && (
                    <div className="rounded-2xl p-4" style={cardStyle}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Megaphone size={16} style={{ color: '#f97316' }} />
                                <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>
                                    Publicações
                                </h3>
                            </div>
                            {isOwner && (
                                <button
                                    onClick={() => router.push(`/${ownerSlug}/fazer-divulgacao`)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all hover:scale-105"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: '0 2px 10px rgba(249, 115, 22, 0.4)',
                                        border: 'none',
                                    }}
                                >
                                    <Plus size={12} />
                                    Nova
                                </button>
                            )}
                        </div>

                        {publications.length === 0 ? (
                            <div className="py-10 text-center rounded-xl" style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}>
                                <Megaphone className="w-10 h-10 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    {isOwner ? 'Comece sua primeira publicação' : 'Nenhuma publicação ainda'}
                                </p>
                                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                    {isOwner ? 'Compartilhe novidades com seus seguidores' : 'Volte em breve para novidades'}
                                </p>
                                {isOwner && (
                                    <button
                                        onClick={() => router.push(`/${ownerSlug}/fazer-divulgacao`)}
                                        className="mt-4 flex items-center gap-2 mx-auto px-6 py-2.5 rounded-full text-xs font-bold transition-all hover:scale-105"
                                        style={{
                                            background: GRADIENT,
                                            color: '#ffffff',
                                            boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                                            border: 'none',
                                        }}
                                    >
                                        <Megaphone size={14} />
                                        Fazer Publicação
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {publications.map((pub, idx) => (
                                    <div
                                        key={pub.id}
                                        className="rounded-xl border p-4 transition-all hover:shadow-lg cursor-pointer"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                            borderColor: colors.border,
                                        }}
                                        onClick={() => {
                                            if (!owner) return
                                            const feed = publications.map(p => ({
                                                id: p.id,
                                                name: p.name,
                                                slug: p.slug,
                                                description: p.description,
                                                image_url: p.image_url,
                                                listing_type: p.listing_type || 'publication',
                                                owner_id: owner.id,
                                                created_at: p.created_at,
                                                owner: {
                                                    id: owner.id,
                                                    name: owner.name,
                                                    slug: owner.slug,
                                                    avatar_url: imageUrl,
                                                },
                                                profiles: {
                                                    name: owner.name,
                                                    profileSlug: owner.slug,
                                                    avatar_url: imageUrl,
                                                }
                                            }))
                                            usePublicationsStore.getState().setPublicationFeed(feed, idx, ownerSlug)
                                            const pubSlug = pub.slug || pub.id
                                            router.push(`/${ownerSlug}/${pubSlug}`)
                                        }}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ background: glassBgLight }}>
                                                {imageUrl ? (
                                                    <img src={imageUrl} className="w-full h-full object-cover" alt={owner.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-lg font-black" style={{ color: '#f97316' }}>
                                                        {owner.name?.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                        {owner.name}
                                                    </span>
                                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                        • {new Date(pub.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase" style={{ background: '#10b98120', color: '#10b981' }}>
                                                        Novidade
                                                    </span>
                                                </div>
                                                <p className="text-sm font-bold mt-1" style={{ color: colors.textPrimary }}>
                                                    {pub.name}
                                                </p>
                                                {pub.description && (
                                                    <p className="text-xs mt-1 line-clamp-2" style={{ color: colors.textSecondary }}>
                                                        {pub.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {pub.image_url && (
                                            <div className="mt-3 rounded-xl overflow-hidden">
                                                <img src={pub.image_url} className="w-full max-h-[300px] object-cover" alt={pub.name} />
                                            </div>
                                        )}

                                        {/* ===== AÇÕES DA PUBLICAÇÃO ===== */}
                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap" style={{ borderColor: colors.border }}>
                                            <button
                                                onClick={() => handleLikePublication(pub.id)}
                                                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all hover:scale-105"
                                                style={{
                                                    background: pub.is_liked ? '#ef444420' : 'rgba(255,255,255,0.05)',
                                                    color: pub.is_liked ? '#ef4444' : colors.textSecondary,
                                                    border: pub.is_liked ? '1px solid #ef444440' : `1px solid ${colors.border}`,
                                                }}
                                            >
                                                <Heart size={12} fill={pub.is_liked ? '#ef4444' : 'none'} />
                                                <span>{pub.like_count || 0}</span>
                                            </button>

                                            <button
                                                onClick={() => togglePublicationComments(pub.id)}
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
                                                onClick={() => handleShareLink({
                                                    title: pub.name,
                                                    text: pub.description || `Confira ${pub.name} no iUser!`,
                                                    url: `${window.location.origin}/${ownerSlug}/${pub.slug || pub.id}`
                                                })}
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

                                            {isOwner && (
                                                <>
                                                    <button
                                                        onClick={() => router.push(`/${ownerSlug}/${pub.slug || pub.id}/editar`)}
                                                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all hover:scale-105"
                                                        style={{
                                                            background: glassBg,
                                                            color: colors.textSecondary,
                                                            border: `1px solid ${colors.border}`,
                                                        }}
                                                    >
                                                        <Pencil size={12} />
                                                        Editar
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm('Remover esta publicação?')) return
                                                            const { error } = await supabase.from('products').delete().eq('id', pub.id)
                                                            if (!error) {
                                                                setPublications(prev => prev.filter(p => p.id !== pub.id))
                                                                toast.success('Publicação removida')
                                                            } else {
                                                                toast.error('Erro ao remover')
                                                            }
                                                        }}
                                                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all hover:scale-105"
                                                        style={{
                                                            background: '#ef444420',
                                                            color: '#ef4444',
                                                            border: '1px solid #ef444440',
                                                        }}
                                                    >
                                                        <Trash2 size={12} />
                                                        Excluir
                                                    </button>
                                                </>
                                            )}
                                        </div>

                                        {/* ===== SEÇÃO DE COMENTÁRIOS DA PUBLICAÇÃO ===== */}
                                        {expandedPublicationComments.has(pub.id) && (
                                            <div className="mt-4 pt-4 border-t" style={{ borderColor: colors.border }}>
                                                {publicationComments[pub.id] && publicationComments[pub.id].length > 0 ? (
                                                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                                                        {renderCommentTree(
                                                            publicationComments[pub.id] || [],
                                                            'publication',
                                                            pub.id
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-4" style={{ color: colors.textSecondary }}>
                                                        <p className="text-xs">Nenhum comentário ainda. Seja o primeiro!</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB COMENTÁRIOS DO PERFIL */}
                {activeTab === 'profile_comments' && (
                    <div className="rounded-2xl p-4" style={cardStyle}>
                        <div className="flex items-center gap-2 mb-4">
                            <MessageCircle size={16} style={{ color: '#f97316' }} />
                            <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>
                                Comentários do Perfil
                            </h3>
                            <span className="text-xs font-bold ml-auto px-3 py-1 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {profileComments.length}
                            </span>
                        </div>

                        {/* Input para novo comentário principal */}
                        {currentUserId ? (
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={commentContent}
                                    onChange={(e) => setCommentContent(e.target.value)}
                                    placeholder="Escreva um comentário sobre este perfil..."
                                    className="flex-1 rounded-xl py-2 px-3 text-sm focus:outline-none transition"
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                    disabled={submittingComment}
                                />
                                <button
                                    onClick={handleAddProfileComment}
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
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    <button
                                        onClick={() => router.push('/login')}
                                        className="font-bold hover:underline inline-flex items-center gap-1"
                                        style={{ color: '#f97316' }}
                                    >
                                        <LogIn size={12} />
                                        Faça login
                                    </button>
                                    {' '}para comentar neste perfil
                                </p>
                            </div>
                        )}

                        {loadingComments ? (
                            <div className="flex justify-center py-8">
                                <Spinner size={24} color={colors.textSecondary} />
                            </div>
                        ) : profileComments.length === 0 ? (
                            <div className="py-10 text-center rounded-xl" style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}>
                                <MessageCircle className="w-10 h-10 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nenhum comentário ainda</p>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Seja o primeiro a comentar neste perfil!</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                                {renderCommentTree(profileComments, 'profile')}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB SOBRE */}
                {activeTab === 'about' && (
                    <div className="rounded-2xl p-4" style={cardStyle}>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <MoreHorizontal size={16} style={{ color: '#f97316' }} />
                                <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>
                                    Sobre
                                </h3>
                            </div>

                            <div className="space-y-3">
                                {owner.description && (
                                    <div className="p-3 rounded-xl" style={{ background: glassBg }}>
                                        <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Descrição</p>
                                        <p className="text-sm mt-1 leading-relaxed" style={{ color: colors.textPrimary }}>
                                            {owner.description}
                                        </p>
                                    </div>
                                )}

                                {owner.address && (
                                    <div className="p-3 rounded-xl" style={{ background: glassBg }}>
                                        <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Localização</p>
                                        <button
                                            onClick={() => {
                                                const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(owner.address!)}`
                                                window.open(url, '_blank')
                                            }}
                                            className="flex items-center gap-2 text-sm mt-1 font-bold hover:underline"
                                            style={{ color: '#f97316' }}
                                        >
                                            <MapPin size={14} />
                                            {owner.address}
                                        </button>
                                    </div>
                                )}

                                {owner.whatsapp && (
                                    <div className="p-3 rounded-xl" style={{ background: glassBg }}>
                                        <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Contato</p>
                                        <a
                                            href={whatsappLink!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-sm mt-1 font-bold hover:underline"
                                            style={{ color: '#25D366' }}
                                        >
                                            <MessageCircle size={14} />
                                            {formatBrazilianPhone(owner.whatsapp)}
                                        </a>
                                    </div>
                                )}

                                <div className="p-3 rounded-xl" style={{ background: glassBg }}>
                                    <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Estatísticas</p>
                                    <div className="flex gap-4 mt-1 flex-wrap">
                                        <button
                                            onClick={() => {
                                                setFollowType('followers')
                                                setShowFollows(true)
                                            }}
                                            className="text-left hover:scale-105 transition-transform"
                                        >
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{followersCount}</p>
                                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>Seguidores</p>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setFollowType('following')
                                                setShowFollows(true)
                                            }}
                                            className="text-left hover:scale-105 transition-transform"
                                        >
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{followingCount}</p>
                                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>Seguindo</p>
                                        </button>
                                        <div>
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{totalVisitors}</p>
                                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>Visitas</p>
                                        </div>
                                    </div>
                                </div>

                                {stores.length > 0 && (
                                    <div className="p-3 rounded-xl" style={{ background: glassBg }}>
                                        <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Lojas</p>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {stores.map(store => (
                                                <button
                                                    key={store.id}
                                                    onClick={() => router.push(`/${store.storeSlug}`)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-105"
                                                    style={{
                                                        background: GRADIENT,
                                                        color: '#ffffff',
                                                        boxShadow: '0 2px 10px rgba(249, 115, 22, 0.3)',
                                                        border: 'none',
                                                    }}
                                                >
                                                    <Store size={12} />
                                                    {store.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== EDIT PROFILE DIALOG ===== */}
            {showEditDialog && owner && (
                <EditProfile
                    owner={owner}
                    imageUrl={imageUrl}
                    colors={colors}
                    onClose={() => setShowEditDialog(false)}
                    onUpdate={(updatedOwner) => {
                        setOwner(updatedOwner)
                        if (updatedOwner.avatar_url) {
                            setImageUrl(updatedOwner.avatar_url)
                        }
                    }}
                />
            )}

            {/* ===== FOLLOWS MODAL ===== */}
            {showFollows && owner && (
                <Follows
                    profileId={owner.id}
                    profileSlug={ownerSlug}
                    currentUserId={currentUserId}
                    colors={colors}
                    type={followType}
                    onClose={() => setShowFollows(false)}
                />
            )}
        </div>
    )
}