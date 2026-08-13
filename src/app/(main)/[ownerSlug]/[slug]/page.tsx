// src/app/(app)/[ownerSlug]/[slug]/page.tsx
'use client'

import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import {
    AlertTriangle,
    ArrowLeft,
    Home,
    ShoppingBag,
    Pencil,
    Trash2,
    Clock,
    MessageCircle,
    User,
    Store as StoreIcon,
    LayoutDashboard,
    Plus,
    Minus,
    X,
    Heart,
    Share2,
    MessageSquare,
    MoreHorizontal,
    Link2,
    Bookmark,
    Flag,
} from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '@/app/ButtonSacola'
import Header from '@/app/Header'
import { toast } from 'sonner'
import { getAvatarUrl } from '@/lib/avatar'
import StoreDashboard from '../../StoreDashboard'
import ProfileDashboard from '../../ProfileDashboard'

type OwnerType = 'profile' | 'store'
type ContentType = 'product' | 'publication'

interface OwnerData {
    id: string
    name: string
    slug: string
    type: OwnerType
    avatar_url?: string | null
    description?: string | null
    address?: string | null
    whatsapp?: string | null
}

interface ContentData {
    id: string
    name: string
    slug: string
    description?: string | null
    image_url?: string | null
    price?: number
    listing_type: 'sale' | 'publication'
    type: ContentType
    owner_id: string
    store_id?: string | null
    category?: string
    created_at: string
    profiles?: {
        name: string
        profileSlug: string
    }
}

// ===== FUNÇÃO PARA FORMATAR DATA =====
function formatPostDate(dateString: string): string {
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

// ===== FUNÇÃO PARA FORMATAR NÚMERO =====
function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
}

// ===== CACHE DE PUBLICAÇÕES PRÉ-CARREGADAS =====
const publicationCache = new Map<string, any>()

export default function SlugPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { bgMode, customBgUrl, profileSlug: loggedUserSlug, avatarUrl: loggedUserAvatarUrl } = useProfile()

    const ownerSlug = Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug
    const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [owner, setOwner] = useState<OwnerData | null>(null)
    const [content, setContent] = useState<ContentData | null>(null)
    const [ownerType, setOwnerType] = useState<OwnerType | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [cartAnimating, setCartAnimating] = useState(false)
    const [productQuantity, setProductQuantity] = useState(0)

    // ===== ESTADOS PARA NAVEGAÇÃO =====
    const [allPublications, setAllPublications] = useState<any[]>([])
    const [currentIndex, setCurrentIndex] = useState<number>(-1)
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [touchStartY, setTouchStartY] = useState(0)
    const [touchEndY, setTouchEndY] = useState(0)
    const [isSwiping, setIsSwiping] = useState(false)
    const [isNavigating, setIsNavigating] = useState(false)
    const [preloadedNext, setPreloadedNext] = useState<any>(null)
    const [preloadedPrev, setPreloadedPrev] = useState<any>(null)
    const [isTransitioning, setIsTransitioning] = useState(false)

    // ===== ESTADOS PARA INTERAÇÕES =====
    const [isLiked, setIsLiked] = useState(false)
    const [likeCount, setLikeCount] = useState(0)
    const [showComments, setShowComments] = useState(false)
    const [commentText, setCommentText] = useState('')
    const [comments, setComments] = useState<any[]>([])
    const [loadingComments, setLoadingComments] = useState(false)
    const [isSaved, setIsSaved] = useState(false)
    const [shareCount, setShareCount] = useState(0)
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    // States para Dashboards
    const [showProfile, setShowProfile] = useState(false)
    const [showStoreDashboard, setShowStoreDashboard] = useState<{ slug: string; name: string } | null>(null)
    const [stores, setStores] = useState<any[]>([])
    const [loadingStores, setLoadingStores] = useState(true)
    const [storeOrderCounts, setStoreOrderCounts] = useState<
        Record<string, { pending: number; preparing: number; ready: number }>
    >({})

    const { itemsByStore, addItem, removeItem, updateQuantity } = useCartStore()

    // ===== REFS =====
    const commentInputRef = useRef<HTMLInputElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const touchStartTime = useRef<number>(0)
    const isSwipingRef = useRef(false)

    // ===== CALCULAR TOTAL DE ITENS DO CARRINHO =====
    const totalCartItems = useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

    // ===== CALCULAR VALOR TOTAL DO CARRINHO =====
    const totalCartValue = useMemo(() => {
        let total = 0
        Object.values(itemsByStore).forEach(items => {
            items.forEach(item => {
                const price = item.product?.price || 0
                const quantity = item.quantity || 1
                total += Number(price) * quantity
            })
        })
        return total
    }, [itemsByStore])

    // ===== VERIFICAR SE O PRODUTO ESTÁ NO CARRINHO =====
    const getProductQuantity = useCallback(() => {
        if (!content) return 0
        let total = 0
        Object.values(itemsByStore).forEach(storeItems => {
            const found = storeItems.find((item: any) => item.product.id === content.id)
            if (found) {
                total += found.quantity
            }
        })
        return total
    }, [itemsByStore, content])

    // ========== DETECTAR OWNER ==========
    const detectOwner = useCallback(async (slug: string) => {
        if (!slug) return null

        // Verificar cache
        const cacheKey = `owner_${slug}`
        if (publicationCache.has(cacheKey)) {
            return publicationCache.get(cacheKey)
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, name, profileSlug, avatar_url, description, address, whatsapp')
            .eq('profileSlug', slug)
            .maybeSingle()

        if (profile && !profileError) {
            const result = {
                data: {
                    id: profile.id,
                    name: profile.name,
                    slug: profile.profileSlug,
                    type: 'profile' as OwnerType,
                    avatar_url: getAvatarUrl(supabase, profile.avatar_url),
                    description: profile.description,
                    address: profile.address,
                    whatsapp: profile.whatsapp,
                },
                type: 'profile' as OwnerType
            }
            publicationCache.set(cacheKey, result)
            return result
        }

        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url, owner_id, description, address, whatsapp')
            .eq('storeSlug', slug)
            .maybeSingle()

        if (store && !storeError) {
            let storeWhatsapp = store.whatsapp
            if (!storeWhatsapp && store.owner_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('whatsapp')
                    .eq('id', store.owner_id)
                    .single()
                storeWhatsapp = profile?.whatsapp
            }

            const result = {
                data: {
                    id: store.id,
                    name: store.name,
                    slug: store.storeSlug,
                    type: 'store' as OwnerType,
                    avatar_url: store.logo_url
                        ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                        : null,
                    description: store.description,
                    address: store.address,
                    whatsapp: storeWhatsapp,
                },
                type: 'store' as OwnerType
            }
            publicationCache.set(cacheKey, result)
            return result
        }

        return null
    }, [])

    // ========== DETECTAR CONTEÚDO ==========
    const detectContent = useCallback(async (slug: string, ownerId: string, ownerType: OwnerType) => {
        if (!slug || !ownerId) return null

        const cacheKey = `content_${slug}_${ownerId}`
        if (publicationCache.has(cacheKey)) {
            return publicationCache.get(cacheKey)
        }

        const ownerField = ownerType === 'profile' ? 'owner_id' : 'store_id'

        const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('slug', slug)
            .eq(ownerField, ownerId)
            .maybeSingle()

        if (product && !productError) {
            let imageUrl = product.image_url
            if (imageUrl) {
                if (!imageUrl.startsWith('http')) {
                    imageUrl = supabase.storage.from('product-images').getPublicUrl(imageUrl).data.publicUrl
                }
            }

            const result = {
                data: {
                    id: product.id,
                    name: product.name,
                    slug: product.slug,
                    description: product.description,
                    image_url: imageUrl,
                    price: product.price || 0,
                    listing_type: product.listing_type,
                    type: product.listing_type === 'sale' ? 'product' as ContentType : 'publication' as ContentType,
                    owner_id: product.owner_id,
                    store_id: product.store_id,
                    category: product.category,
                    created_at: product.created_at,
                },
                type: product.listing_type === 'sale' ? 'product' as ContentType : 'publication' as ContentType
            }
            publicationCache.set(cacheKey, result)
            return result
        }

        return null
    }, [])

    // ========== CARREGAR PUBLICAÇÕES PARA NAVEGAÇÃO ==========
    const loadPublicationsForNavigation = useCallback(async () => {
        const { data, error } = await supabase
            .from('products')
            .select(`
                id,
                name,
                slug,
                description,
                image_url,
                price,
                listing_type,
                owner_id,
                store_id,
                category,
                created_at
            `)
            .eq('listing_type', 'publication')
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error('Erro ao carregar publicações:', error)
            return []
        }

        const publicationsWithProfiles = await Promise.all(
            data.map(async (pub) => {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('name, profileSlug')
                    .eq('id', pub.owner_id)
                    .single()

                return {
                    ...pub,
                    profiles: profile || { name: 'Usuário', profileSlug: 'usuario' }
                }
            })
        )

        return publicationsWithProfiles
    }, [])

    // ========== CARREGAR LOJAS DO USUÁRIO ==========
    const loadStores = useCallback(async () => {
        if (!loggedUserSlug) {
            setStores([])
            setLoadingStores(false)
            return
        }

        setLoadingStores(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
            setStores([])
            setLoadingStores(false)
            return
        }

        const { data: fetchedStores } = await supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url, business_hours')
            .eq('owner_id', session.user.id)
            .order('created_at', { ascending: true })

        if (fetchedStores) {
            const storesData = fetchedStores.map((s: any) => ({
                id: s.id,
                slug: s.storeSlug,
                logoUrl: s.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                    : null,
                name: s.name,
                business_hours: s.business_hours || null,
            }))
            setStores(storesData)
        } else {
            setStores([])
        }
        setLoadingStores(false)
    }, [loggedUserSlug])

    // ========== CARREGAR CONTAGENS DOS PEDIDOS ==========
    const fetchStoreOrderCounts = useCallback(async () => {
        if (!stores || stores.length === 0) return
        const storeIds = stores.map(s => s.id)
        const { data, error } = await supabase
            .from('orders')
            .select('store_id, status')
            .in('store_id', storeIds)
            .in('status', ['pending', 'preparing', 'ready'])

        if (error) {
            console.error('Erro ao buscar contagens de pedidos:', error)
            return
        }

        const counts: Record<string, { pending: number; preparing: number; ready: number }> = {}
        storeIds.forEach(id => {
            counts[id] = { pending: 0, preparing: 0, ready: 0 }
        })
        data?.forEach(order => {
            if (counts[order.store_id]) {
                counts[order.store_id][order.status as 'pending' | 'preparing' | 'ready']++
            }
        })
        setStoreOrderCounts(counts)
    }, [stores])

    // ========== CARREGAR INTERAÇÕES ==========
    const loadInteractions = useCallback(async () => {
        if (!content || !currentUserId) return

        const { count: likes } = await supabase
            .from('post_likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', content.id)

        setLikeCount(likes || 0)

        const { data: userLike } = await supabase
            .from('post_likes')
            .select('id')
            .eq('post_id', content.id)
            .eq('user_id', currentUserId)
            .maybeSingle()

        setIsLiked(!!userLike)

        const { count: shares } = await supabase
            .from('post_shares')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', content.id)

        setShareCount(shares || 0)

        const { data: saved } = await supabase
            .from('post_saves')
            .select('id')
            .eq('post_id', content.id)
            .eq('user_id', currentUserId)
            .maybeSingle()

        setIsSaved(!!saved)

        if (currentUserId !== content.owner_id) {
            await supabase
                .from('post_views')
                .insert({
                    post_id: content.id,
                    user_id: currentUserId,
                })
                .select()
        }
    }, [content, currentUserId])

    // ========== CARREGAR COMENTÁRIOS ==========
    const loadComments = useCallback(async () => {
        if (!content) return

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
            .eq('post_id', content.id)
            .order('created_at', { ascending: false })

        if (!error && data) {
            setComments(data)
        }
        setLoadingComments(false)
    }, [content])

    // ========== CARREGAR DADOS ==========
    const loadData = useCallback(async () => {
        if (!ownerSlug || !slug) {
            setError('Parâmetros inválidos')
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const ownerResult = await detectOwner(ownerSlug)
            if (!ownerResult) {
                setError('Perfil ou loja não encontrado')
                setLoading(false)
                return
            }

            setOwner(ownerResult.data)
            setOwnerType(ownerResult.type)

            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
            setIsOwner(user?.id === ownerResult.data.id)

            const contentResult = await detectContent(slug, ownerResult.data.id, ownerResult.type)
            if (!contentResult) {
                setError('Produto ou publicação não encontrado')
                setLoading(false)
                return
            }

            setContent(contentResult.data)

            if (contentResult.data.type === 'publication') {
                const publications = await loadPublicationsForNavigation()
                setAllPublications(publications)
                const index = publications.findIndex(p => p.slug === slug)
                setCurrentIndex(index >= 0 ? index : 0)
                setHasMore(true)

                // Pré-carregar próximas publicações
                if (index >= 0) {
                    preloadAdjacentPublications(publications, index)
                }
            }

        } catch (err: any) {
            console.error('Erro ao carregar dados:', err)
            setError(err.message || 'Erro ao carregar página')
        } finally {
            setLoading(false)
        }
    }, [ownerSlug, slug, detectOwner, detectContent, loadPublicationsForNavigation])

    // ========== PRÉ-CARREGAR PUBLICAÇÕES ADJACENTES ==========
    const preloadAdjacentPublications = useCallback((publications: any[], index: number) => {
        const nextIndex = index + 1
        const prevIndex = index - 1

        if (nextIndex < publications.length) {
            const nextPub = publications[nextIndex]
            if (nextPub) {
                // Pré-carregar dados da próxima publicação
                detectContent(nextPub.slug, nextPub.owner_id, nextPub.store_id ? 'store' : 'profile')
                setPreloadedNext(nextPub)
            }
        }

        if (prevIndex >= 0) {
            const prevPub = publications[prevIndex]
            if (prevPub) {
                detectContent(prevPub.slug, prevPub.owner_id, prevPub.store_id ? 'store' : 'profile')
                setPreloadedPrev(prevPub)
            }
        }
    }, [detectContent])

    useEffect(() => {
        loadData()
    }, [loadData])

    useEffect(() => {
        loadStores()
    }, [loadStores])

    useEffect(() => {
        if (stores.length > 0) {
            fetchStoreOrderCounts()
        }
    }, [stores, fetchStoreOrderCounts])

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (content && currentUserId) {
            loadInteractions()
            loadComments()
        }
    }, [content, currentUserId, loadInteractions, loadComments])

    useEffect(() => {
        if (content) {
            setProductQuantity(getProductQuantity())
        }
    }, [content, getProductQuantity])

    useEffect(() => {
        if (totalCartItems > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartItems])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
        }

        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isMenuOpen])

    // ===== VARIÁVEIS DERIVADAS =====
    const isProduct = content?.type === 'product'
    const isPublication = content?.type === 'publication'
    const isProfileOwner = ownerType === 'profile'
    const hasImage = content?.image_url
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
    const isInCart = productQuantity > 0
    const isLoggedIn = !!loggedUserSlug && !loading
    const isOwnerOrAdmin = isOwner
    const showNavigation = isPublication && allPublications.length > 1

    // ========== NAVEGAR PARA PUBLICAÇÃO ==========
    const navigateToPublication = useCallback(async (publication: any, direction: 'next' | 'prev' = 'next') => {
        if (isNavigating || isTransitioning) return

        setIsTransitioning(true)
        setIsNavigating(true)

        try {
            let targetOwnerSlug = publication.profiles?.profileSlug

            if (!targetOwnerSlug) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('profileSlug')
                    .eq('id', publication.owner_id)
                    .single()
                if (profile) {
                    targetOwnerSlug = profile.profileSlug
                }
            }

            if (!targetOwnerSlug) {
                targetOwnerSlug = ownerSlug
            }

            const ownerResult = await detectOwner(targetOwnerSlug)
            if (!ownerResult) {
                toast.error('Erro ao carregar publicação')
                setIsNavigating(false)
                setIsTransitioning(false)
                return
            }

            const isStoreOwner = !!publication.store_id
            const ownerId = isStoreOwner ? publication.store_id : publication.owner_id

            const contentResult = await detectContent(
                publication.slug,
                ownerId,
                isStoreOwner ? 'store' : 'profile'
            )

            if (!contentResult) {
                toast.error('Erro ao carregar conteúdo')
                setIsNavigating(false)
                setIsTransitioning(false)
                return
            }

            setOwner(ownerResult.data)
            setOwnerType(ownerResult.type)
            setIsOwner(currentUserId === ownerResult.data.id)
            setContent(contentResult.data)
            setError(null)

            const newUrl = `/${targetOwnerSlug}/${publication.slug}`
            window.history.pushState({}, '', newUrl)

            if (currentUserId && contentResult.data) {
                const { count: likes } = await supabase
                    .from('post_likes')
                    .select('*', { count: 'exact', head: true })
                    .eq('post_id', contentResult.data.id)
                setLikeCount(likes || 0)

                const { data: userLike } = await supabase
                    .from('post_likes')
                    .select('id')
                    .eq('post_id', contentResult.data.id)
                    .eq('user_id', currentUserId)
                    .maybeSingle()
                setIsLiked(!!userLike)

                const { count: shares } = await supabase
                    .from('post_shares')
                    .select('*', { count: 'exact', head: true })
                    .eq('post_id', contentResult.data.id)
                setShareCount(shares || 0)

                const { data: saved } = await supabase
                    .from('post_saves')
                    .select('id')
                    .eq('post_id', contentResult.data.id)
                    .eq('user_id', currentUserId)
                    .maybeSingle()
                setIsSaved(!!saved)

                const { data: commentsData } = await supabase
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
                    .eq('post_id', contentResult.data.id)
                    .order('created_at', { ascending: false })

                if (commentsData) {
                    setComments(commentsData)
                }

                if (currentUserId !== contentResult.data.owner_id) {
                    await supabase
                        .from('post_views')
                        .insert({
                            post_id: contentResult.data.id,
                            user_id: currentUserId,
                        })
                        .select()
                }
            }

            // Pré-carregar próximas publicações
            const currentIdx = allPublications.findIndex(p => p.id === publication.id)
            if (currentIdx >= 0) {
                preloadAdjacentPublications(allPublications, currentIdx)
            }

        } catch (err) {
            console.error('Erro ao navegar:', err)
            toast.error('Erro ao carregar publicação')
        } finally {
            setIsNavigating(false)
            setTimeout(() => setIsTransitioning(false), 300)
        }
    }, [detectOwner, detectContent, currentUserId, ownerSlug, isNavigating, isTransitioning, allPublications, preloadAdjacentPublications])

    // ========== PROXIMA PUBLICAÇÃO ==========
    const nextPublication = useCallback(async () => {
        if (isNavigating || loadingMore || !hasMore || isTransitioning) return

        const nextIndex = currentIndex + 1
        if (nextIndex < allPublications.length) {
            setCurrentIndex(nextIndex)
            await navigateToPublication(allPublications[nextIndex], 'next')
        } else {
            setLoadingMore(true)
            const morePublications = await loadPublicationsForNavigation()
            if (morePublications.length > 0) {
                setAllPublications(prev => [...prev, ...morePublications])
                const newIndex = allPublications.length
                setCurrentIndex(newIndex)
                await navigateToPublication(morePublications[0], 'next')
            } else {
                setHasMore(false)
                toast.info('Chegou ao fim das publicações')
            }
            setLoadingMore(false)
        }
    }, [currentIndex, allPublications, loadingMore, hasMore, navigateToPublication, loadPublicationsForNavigation, isNavigating, isTransitioning])

    // ========== PUBLICAÇÃO ANTERIOR ==========
    const previousPublication = useCallback(async () => {
        if (isNavigating || isTransitioning) return

        if (currentIndex > 0) {
            const prevIndex = currentIndex - 1
            setCurrentIndex(prevIndex)
            await navigateToPublication(allPublications[prevIndex], 'prev')
        } else {
            toast.info('Você está na primeira publicação')
        }
    }, [currentIndex, allPublications, navigateToPublication, isNavigating, isTransitioning])

    // ========== HANDLERS DE TOUCH PARA SWIPE ==========
    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (!isPublication) return
        setTouchStartY(e.touches[0].clientY)
        touchStartTime.current = Date.now()
        setIsSwiping(true)
        isSwipingRef.current = true
    }, [isPublication])

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isPublication || !isSwipingRef.current) return
        setTouchEndY(e.touches[0].clientY)
    }, [isPublication])

    const handleTouchEnd = useCallback(async () => {
        if (!isPublication || !isSwipingRef.current) return

        setIsSwiping(false)
        isSwipingRef.current = false

        const deltaY = touchStartY - touchEndY
        const deltaTime = Date.now() - touchStartTime.current

        // Mais sensível para navegação rápida
        if (Math.abs(deltaY) > 30 || (Math.abs(deltaY) > 15 && deltaTime < 150)) {
            if (deltaY > 0) {
                await nextPublication()
            } else {
                await previousPublication()
            }
        }

        // Reset para próximo swipe
        setTouchStartY(0)
        setTouchEndY(0)
    }, [isPublication, touchStartY, touchEndY, nextPublication, previousPublication])

    useEffect(() => {
        const container = containerRef.current
        if (container) {
            container.addEventListener('touchstart', handleTouchStart, { passive: true })
            container.addEventListener('touchmove', handleTouchMove, { passive: true })
            container.addEventListener('touchend', handleTouchEnd, { passive: true })
        }

        return () => {
            if (container) {
                container.removeEventListener('touchstart', handleTouchStart)
                container.removeEventListener('touchmove', handleTouchMove)
                container.removeEventListener('touchend', handleTouchEnd)
            }
        }
    }, [handleTouchStart, handleTouchMove, handleTouchEnd])

    // ========== FUNÇÃO PARA CONVERTER CONTENT PARA CART PRODUCT ==========
    const contentToCartProduct = useCallback((contentData: ContentData) => {
        return {
            id: contentData.id,
            name: contentData.name,
            price: contentData.price || 0,
            image_url: contentData.image_url || null,
            price_type: 'fixed',
            type: contentData.type === 'product' ? 'physical' : 'digital',
            slug: contentData.slug,
            description: contentData.description || '',
            category: contentData.category || '',
        }
    }, [])

    // ========== FUNÇÕES DOS DASHBOARDS ==========
    const handleProfileClick = () => {
        if (loggedUserSlug && !loading) {
            setShowProfile(true)
            setShowStoreDashboard(null)
        } else {
            router.push('/login')
        }
    }

    const handleStoreDashboardClick = (storeSlug: string, storeName: string) => {
        setShowStoreDashboard({ slug: storeSlug, name: storeName })
        setShowProfile(false)
    }

    const showMainContent = () => {
        setShowProfile(false)
        setShowStoreDashboard(null)
    }

    // ========== CART FUNCTIONS ==========
    const handleAddToCart = useCallback(() => {
        if (!owner || !content) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        const cartProduct = contentToCartProduct(content)
        addItem(storeKey as string, { name: owner.name, logo_url: owner.avatar_url ?? null }, cartProduct)
        setProductQuantity(prev => prev + 1)
        setCartAnimating(true)
        setTimeout(() => setCartAnimating(false), 500)
        toast.success('Adicionado ao carrinho!')
    }, [owner, content, ownerType, ownerSlug, addItem, contentToCartProduct])

    const handleDecreaseQuantity = useCallback(() => {
        if (!content) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        if (productQuantity <= 1) {
            Object.keys(itemsByStore).forEach(key => {
                const storeItems = itemsByStore[key]
                const found = storeItems.find((item: any) => item.product.id === content.id)
                if (found) {
                    removeItem(key, content.id)
                }
            })
            setProductQuantity(0)
        } else {
            updateQuantity(storeKey as string, content.id, -1)
            setProductQuantity(prev => prev - 1)
        }
    }, [content, productQuantity, ownerType, ownerSlug, itemsByStore, removeItem, updateQuantity])

    const handleIncreaseQuantity = useCallback(() => {
        if (!owner || !content) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        const cartProduct = contentToCartProduct(content)
        addItem(storeKey as string, { name: owner.name, logo_url: owner.avatar_url ?? null }, cartProduct)
        setProductQuantity(prev => prev + 1)
        setCartAnimating(true)
        setTimeout(() => setCartAnimating(false), 500)
    }, [owner, content, ownerType, ownerSlug, addItem, contentToCartProduct])

    const handleRemoveAll = useCallback(() => {
        if (!content) return

        Object.keys(itemsByStore).forEach(key => {
            const storeItems = itemsByStore[key]
            const found = storeItems.find((item: any) => item.product.id === content.id)
            if (found) {
                removeItem(key, content.id)
            }
        })
        setProductQuantity(0)
        toast.info('Produto removido do carrinho')
    }, [content, itemsByStore, removeItem])

    // ========== FUNÇÕES DE INTERAÇÃO ==========
    const handleLike = useCallback(async () => {
        if (!content || !currentUserId) {
            toast.error('Faça login para curtir')
            return
        }

        if (isLiked) {
            const { error } = await supabase
                .from('post_likes')
                .delete()
                .eq('post_id', content.id)
                .eq('user_id', currentUserId)

            if (!error) {
                setIsLiked(false)
                setLikeCount(prev => prev - 1)
            }
        } else {
            const { error } = await supabase
                .from('post_likes')
                .insert({
                    post_id: content.id,
                    user_id: currentUserId,
                })

            if (!error) {
                setIsLiked(true)
                setLikeCount(prev => prev + 1)
            }
        }
    }, [content, currentUserId, isLiked])

    const handleComment = useCallback(async () => {
        if (!content || !currentUserId) {
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
                post_id: content.id,
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
    }, [content, currentUserId, commentText])

    const handleShare = useCallback(async () => {
        if (!content) return

        const shareUrl = `${window.location.origin}/${ownerSlug}/${slug}`

        if (navigator.share) {
            try {
                await navigator.share({
                    title: content.name,
                    text: `Confira esta publicação no iUser: ${content.name}`,
                    url: shareUrl,
                })

                if (currentUserId) {
                    await supabase
                        .from('post_shares')
                        .insert({
                            post_id: content.id,
                            user_id: currentUserId,
                        })
                    setShareCount(prev => prev + 1)
                }
                return
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return
                console.error('Erro ao compartilhar:', err)
            }
        }

        try {
            await navigator.clipboard.writeText(shareUrl)
            toast.success('Link copiado!')

            if (currentUserId) {
                await supabase
                    .from('post_shares')
                    .insert({
                        post_id: content.id,
                        user_id: currentUserId,
                    })
                setShareCount(prev => prev + 1)
            }
        } catch (err) {
            toast.error('Erro ao copiar link')
        }
    }, [content, ownerSlug, slug, currentUserId])

    const handleSave = useCallback(async () => {
        if (!content || !currentUserId) {
            toast.error('Faça login para salvar')
            return
        }

        if (isSaved) {
            const { error } = await supabase
                .from('post_saves')
                .delete()
                .eq('post_id', content.id)
                .eq('user_id', currentUserId)

            if (!error) {
                setIsSaved(false)
                toast.info('Removido dos salvos')
            }
        } else {
            const { error } = await supabase
                .from('post_saves')
                .insert({
                    post_id: content.id,
                    user_id: currentUserId,
                })

            if (!error) {
                setIsSaved(true)
                toast.success('Salvo!')
            }
        }
    }, [content, currentUserId, isSaved])

    const handleDeleteComment = useCallback(async (commentId: string) => {
        if (!confirm('Tem certeza que deseja excluir este comentário?')) return

        const { error } = await supabase
            .from('post_comments')
            .delete()
            .eq('id', commentId)

        if (!error) {
            setComments(prev => prev.filter(c => c.id !== commentId))
            toast.success('Comentário removido')
        } else {
            toast.error('Erro ao remover comentário')
        }
    }, [])

    const handleReport = useCallback(() => {
        toast.info('Denúncia enviada para análise')
        setIsMenuOpen(false)
    }, [])

    // ===== HEADER TABS =====
    const headerTabs = useMemo(() => {
        const allTabs: any[] = []

        allTabs.push({
            id: 'perfil',
            label: isLoggedIn ? `@${loggedUserSlug}` : 'Entrar',
            icon: User,
            imageUrl: isLoggedIn ? loggedUserAvatarUrl : null,
            onClick: handleProfileClick,
            isActive: showProfile,
        })

        if (!loadingStores && stores.length > 0) {
            stores.forEach((s) => {
                const counts = storeOrderCounts[s.id] || { pending: 0, preparing: 0, ready: 0 }
                const hasActive = counts.pending + counts.preparing + counts.ready > 0

                allTabs.push({
                    id: `loja-${s.slug}`,
                    label: s.name,
                    icon: LayoutDashboard,
                    imageUrl: s.logoUrl,
                    onClick: () => handleStoreDashboardClick(s.slug, s.name),
                    isActive: showStoreDashboard?.slug === s.slug,
                    indicator: hasActive ? counts : null,
                })
            })
        } else if (isLoggedIn && !loadingStores) {
            allTabs.push({
                id: 'criar-loja',
                label: 'Quer criar uma loja?',
                icon: StoreIcon,
                imageUrl: null,
                onClick: () => router.push('/criar-loja'),
                isActive: false,
            })
        }

        return allTabs
    }, [
        isLoggedIn, loggedUserSlug, loggedUserAvatarUrl,
        stores, loadingStores, storeOrderCounts, showProfile, showStoreDashboard,
        handleProfileClick, handleStoreDashboardClick, router
    ])

    // ===== VERIFICAÇÃO DE PARÂMETROS =====
    if (!ownerSlug || !slug) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <AlertTriangle className="w-12 h-12" style={{ color: colors.accent }} />
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        Parâmetros inválidos
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

    if (loading) {
        return <LoadingSpinner message="Carregando..." background={colors.background} />
    }

    if (error || !owner || !content) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <AlertTriangle className="w-12 h-12" style={{ color: colors.accent }} />
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Conteúdo não encontrado'}
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

    // ===== RENDER PRINCIPAL =====
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="iUser"
                    showBack={true}
                    onBack={() => router.back()}
                    greeting={`Olá, ${loading ? '...' : loggedUserSlug ? `@${loggedUserSlug}` : 'Visitante'}`}
                    avatarUrl={loggedUserAvatarUrl || null}
                    loading={loading}
                    tabs={headerTabs}
                    showSearch={false}
                    searchPlaceholder="Buscar..."
                    onSearch={() => { }}
                    profileSlug={loggedUserSlug}
                />

                {/* ===== CONTEÚDO ===== */}
                {showProfile ? (
                    <div className="max-w-4xl mx-auto px-4 py-6">
                        <ProfileDashboard
                            profileSlug={loggedUserSlug || ''}
                            onBack={showMainContent}
                            avatarUrl={loggedUserAvatarUrl || undefined}
                        />
                    </div>
                ) : showStoreDashboard ? (
                    <div className="max-w-4xl mx-auto px-4 py-6">
                        <StoreDashboard
                            profileSlug={loggedUserSlug || ''}
                            storeSlug={showStoreDashboard.slug}
                            onBack={showMainContent}
                            onOrderCountsChange={(counts) => {
                                setStoreOrderCounts(prev => {
                                    const store = stores.find(s => s.slug === showStoreDashboard.slug)
                                    if (store) {
                                        return {
                                            ...prev,
                                            [store.id]: counts
                                        }
                                    }
                                    return prev
                                })
                            }}
                        />
                    </div>
                ) : (
                    <div
                        ref={containerRef}
                        className="relative h-[calc(100dvh-64px)] w-full overflow-hidden"
                        style={{ touchAction: 'none' }}
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
                                                placeholder.textContent = isProduct ? '🛒' : '📢'
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
                                        <div className="text-8xl mb-4">
                                            {isProduct ? '🛒' : '📢'}
                                        </div>
                                        <p className="text-xl font-bold uppercase tracking-widest">
                                            {isProduct ? 'Produto' : 'Publicação'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ===== CONTADOR DE PUBLICAÇÕES - CANTO SUPERIOR ESQUERDO ===== */}
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
                            {/* ===== INFO DO USUÁRIO - INFERIOR ESQUERDO (INVERTIDO) ===== */}
                            <div className="absolute bottom-32 left-4 md:left-8 pointer-events-auto max-w-[60%]">
                                {/* ===== DESCRIÇÃO E TÍTULO PRIMEIRO ===== */}
                                <div className="text-white space-y-2 mb-3">
                                    <h1 className="text-xl font-bold">
                                        {content.name}
                                    </h1>
                                    {content.description && (
                                        <p className="text-sm text-white/90 line-clamp-3">
                                            {content.description}
                                        </p>
                                    )}
                                    {isProduct && content.price !== undefined && content.price > 0 && (
                                        <div className="text-2xl font-black text-orange-400">
                                            R$ {content.price.toFixed(2)}
                                        </div>
                                    )}
                                </div>

                                {/* ===== AVATAR E NOME DO USUÁRIO EMBAIXO ===== */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => router.push(`/${ownerSlug}`)}
                                        className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-white/30 hover:scale-105 transition-transform"
                                        style={{
                                            background: GRADIENT,
                                            padding: '2px'
                                        }}
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

                                {/* ===== BOTÕES DE AÇÃO DO PRODUTO ===== */}
                                {isProduct && !isOwnerOrAdmin && (
                                    <div className="mt-4 pointer-events-auto">
                                        {isInCart ? (
                                            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full p-2 border border-white/10">
                                                <button
                                                    onClick={handleDecreaseQuantity}
                                                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg hover:scale-110 transition-transform"
                                                    style={{ background: GRADIENT, color: '#fff' }}
                                                >
                                                    <Minus size={18} />
                                                </button>
                                                <span className="text-lg font-bold min-w-[40px] text-center text-white">
                                                    {productQuantity}
                                                </span>
                                                <button
                                                    onClick={handleIncreaseQuantity}
                                                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg hover:scale-110 transition-transform"
                                                    style={{ background: GRADIENT, color: '#fff' }}
                                                >
                                                    <Plus size={18} />
                                                </button>
                                                <button
                                                    onClick={handleRemoveAll}
                                                    className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 transition-transform bg-red-500/80 text-white"
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={handleAddToCart}
                                                className="px-6 py-3 rounded-full font-bold transition hover:scale-105 flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30"
                                            >
                                                <ShoppingBag className="w-4 h-4" />
                                                Adicionar ao carrinho
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ===== CATEGORIA - CANTO SUPERIOR DIREITO ===== */}
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

                            {/* ===== BOTÕES DE AÇÃO - LATERAL DIREITA ===== */}
                            <div className="absolute bottom-32 right-4 md:right-8 flex flex-col items-center gap-5 pointer-events-auto">
                                <button
                                    onClick={handleLike}
                                    className="flex flex-col items-center group"
                                >
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-orange-500/30' : 'bg-black/30'} backdrop-blur-md border border-white/20 hover:scale-110`}>
                                        <Heart className={`w-6 h-6 transition-all ${isLiked ? 'fill-orange-500 text-orange-500' : 'text-white'}`} />
                                    </div>
                                    <span className="text-xs text-white font-medium mt-1">
                                        {formatNumber(likeCount)}
                                    </span>
                                </button>

                                <button
                                    onClick={() => {
                                        if (!currentUserId) {
                                            toast.error('Faça login para comentar')
                                            return
                                        }
                                        setShowComments(!showComments)
                                    }}
                                    className="flex flex-col items-center group"
                                >
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md border border-white/20 hover:scale-110 transition-all">
                                        <MessageCircle className="w-6 h-6 text-white" />
                                    </div>
                                    <span className="text-xs text-white font-medium mt-1">
                                        {formatNumber(comments.length)}
                                    </span>
                                </button>

                                <button
                                    onClick={handleShare}
                                    className="flex flex-col items-center group"
                                >
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md border border-white/20 hover:scale-110 transition-all">
                                        <Share2 className="w-6 h-6 text-white" />
                                    </div>
                                    <span className="text-xs text-white font-medium mt-1">
                                        {formatNumber(shareCount)}
                                    </span>
                                </button>

                                <button
                                    onClick={handleSave}
                                    className="flex flex-col items-center group"
                                >
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isSaved ? 'bg-orange-500/30' : 'bg-black/30'} backdrop-blur-md border border-white/20 hover:scale-110`}>
                                        <Bookmark className={`w-6 h-6 transition-all ${isSaved ? 'fill-orange-500 text-orange-500' : 'text-white'}`} />
                                    </div>
                                    <span className="text-xs text-white font-medium mt-1">
                                        {isSaved ? 'Salvo' : 'Salvar'}
                                    </span>
                                </button>

                                <div className="relative" ref={menuRef}>
                                    <button
                                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                                        className="w-12 h-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md border border-white/20 hover:scale-110 transition-all"
                                    >
                                        <MoreHorizontal className="w-6 h-6 text-white" />
                                    </button>

                                    {isMenuOpen && (
                                        <div className="absolute bottom-full right-0 mb-2 min-w-[180px] rounded-2xl overflow-hidden border bg-black/90 backdrop-blur-xl border-white/10 shadow-2xl">
                                            <button
                                                onClick={handleReport}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-red-400 text-sm"
                                            >
                                                <Flag className="w-4 h-4" />
                                                Denunciar
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const url = `${window.location.origin}/${ownerSlug}/${slug}`
                                                    navigator.clipboard.writeText(url)
                                                    toast.success('Link copiado!')
                                                    setIsMenuOpen(false)
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-white/80 text-sm border-t border-white/5"
                                            >
                                                <Link2 className="w-4 h-4" />
                                                Copiar link
                                            </button>
                                            {isOwnerOrAdmin && (
                                                <>
                                                    <button
                                                        onClick={() => router.push(`/${ownerSlug}/${slug}/editar-produto`)}
                                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-white/80 text-sm border-t border-white/5"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                        Editar
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm(`Tem certeza que deseja excluir esta ${isProduct ? 'produto' : 'publicação'}?`)) return
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
                                                        <Trash2 className="w-4 h-4" />
                                                        Excluir
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ===== INDICADOR DE CARREGAMENTO ===== */}
                        {loadingMore && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
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
                                        <button
                                            onClick={() => setShowComments(false)}
                                            className="text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                        {loadingComments ? (
                                            <div className="flex items-center justify-center py-8">
                                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#f97316' }} />
                                            </div>
                                        ) : comments.length === 0 ? (
                                            <p className="text-center text-white/50 py-8">
                                                Nenhum comentário ainda. Seja o primeiro!
                                            </p>
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
                                                            <span className="text-xs text-white/40">
                                                                @{comment.profiles?.profileSlug || 'unknown'}
                                                            </span>
                                                            <span className="text-xs text-white/40">
                                                                • {formatPostDate(comment.created_at)}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-white/90 mt-1">
                                                            {comment.content}
                                                        </p>
                                                        {comment.user_id === currentUserId && (
                                                            <button
                                                                onClick={() => handleDeleteComment(comment.id)}
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
                )}
            </main>

            {/* ===== BOTÕES FLUTUANTES ===== */}
            {!showProfile && !showStoreDashboard && (
                <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button
                        onClick={() => router.back()}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            borderTop: '2px solid #f97316',
                            borderRight: '2px solid #f97316',
                            borderBottom: '2px solid #f97316',
                            borderLeft: '2px solid #f97316',
                            boxShadow: `0 8px 24px #f9731660`,
                        }}
                        aria-label="Voltar"
                    >
                        <ArrowLeft size={24} />
                    </button>

                    {isProduct && (
                        <SacolaButton
                            totalItems={totalCartItems}
                            totalValue={totalCartValue}
                            statusCounts={{ pending: 0, preparing: 0, ready: 0, reviews: 0 }}
                            animate={cartAnimating}
                        />
                    )}

                    <button
                        onClick={() => router.push('/')}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            borderTop: '2px solid #f97316',
                            borderRight: '2px solid #f97316',
                            borderBottom: '2px solid #f97316',
                            borderLeft: '2px solid #f97316',
                            boxShadow: `0 8px 24px #f9731660`,
                        }}
                        aria-label="Voltar ao início"
                    >
                        <Home size={24} />
                    </button>
                </div>
            )}

            {(showProfile || showStoreDashboard) && (
                <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998, display: 'flex', gap: 12 }}>
                    <button
                        onClick={showMainContent}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            borderTop: '2px solid #f97316',
                            borderRight: '2px solid #f97316',
                            borderBottom: '2px solid #f97316',
                            borderLeft: '2px solid #f97316',
                            boxShadow: `0 8px 24px #f9731660`,
                        }}
                        aria-label="Voltar ao conteúdo"
                    >
                        <ArrowLeft size={24} />
                    </button>

                    <button
                        onClick={() => router.push('/')}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            borderTop: '2px solid #f97316',
                            borderRight: '2px solid #f97316',
                            borderBottom: '2px solid #f97316',
                            borderLeft: '2px solid #f97316',
                            boxShadow: `0 8px 24px #f9731660`,
                        }}
                        aria-label="Voltar ao início"
                    >
                        <Home size={24} />
                    </button>
                </div>
            )}
        </div>
    )
}