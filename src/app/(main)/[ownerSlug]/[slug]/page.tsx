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
    User,
    Store as StoreIcon,
    LayoutDashboard,
} from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '@/app/ButtonSacola'
import Header from '@/app/Header'
import { toast } from 'sonner'
import { getAvatarUrl } from '@/lib/avatar'
import StoreDashboard from '../../StoreDashboard'
import ProfileDashboard from '../../ProfileDashboard'
import { Publications } from '../../Publications'
import { Products } from '../../Products'
import { usePublicationsStore } from '@/store/usePublicationStore'

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

// CACHE LOCAL RAPIDO PARA METADADOS DE OWNER/CONTENT
const pageCache = new Map<string, any>()

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
    const [cartAnimating, setCartAnimating] = useState(false)
    const [productQuantity, setProductQuantity] = useState(0)

    // Store do Zustand para publicações
    const publicationsStore = usePublicationsStore()
    const storePublications = publicationsStore.publications
    const storeIndex = publicationsStore.currentIndex
    const currentStorePub = publicationsStore.getCurrent()

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

    // ===== CONTEÚDO E OWNER ATIVOS PARA PUBLICAÇÃO =====
    const isPublication = content?.type === 'publication'
    const isProduct = content?.type === 'product'

    const activeContent = useMemo(() => {
        if (isPublication && currentStorePub) {
            return {
                id: currentStorePub.id,
                name: currentStorePub.name,
                slug: currentStorePub.slug,
                description: currentStorePub.description,
                image_url: currentStorePub.image_url,
                price: currentStorePub.price || 0,
                listing_type: currentStorePub.listing_type || 'publication',
                type: 'publication' as ContentType,
                owner_id: currentStorePub.owner_id,
                store_id: currentStorePub.store_id,
                category: currentStorePub.category,
                created_at: currentStorePub.created_at,
            }
        }
        return content
    }, [isPublication, currentStorePub, content])

    const activeOwner = useMemo(() => {
        if (isPublication && currentStorePub?.owner) {
            return {
                id: currentStorePub.owner.id,
                name: currentStorePub.owner.name,
                slug: currentStorePub.owner.slug,
                type: (currentStorePub.store_id ? 'store' : 'profile') as OwnerType,
                avatar_url: currentStorePub.owner.avatar_url,
            }
        }
        return owner
    }, [isPublication, currentStorePub, owner])

    // Sincronizar URL da página com a publicação ativa sem recarregar
    useEffect(() => {
        if (isPublication && currentStorePub && currentStorePub.slug !== slug) {
            const targetSlug = currentStorePub.owner?.slug || ownerSlug
            window.history.replaceState({}, '', `/${targetSlug}/${currentStorePub.slug}`)
        }
    }, [isPublication, currentStorePub, slug, ownerSlug])

    // ===== CALCULAR TOTAL DE ITENS DO CARRINHO =====
    const totalCartItems = useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

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

    const getProductQuantity = useCallback(() => {
        if (!activeContent) return 0
        let total = 0
        Object.values(itemsByStore).forEach(storeItems => {
            const found = storeItems.find((item: any) => item.product.id === activeContent.id)
            if (found) {
                total += found.quantity
            }
        })
        return total
    }, [itemsByStore, activeContent])

    // ========== DETECTAR OWNER ==========
    const detectOwner = useCallback(async (slug: string) => {
        if (!slug) return null

        const cacheKey = `owner_${slug}`
        if (pageCache.has(cacheKey)) {
            return pageCache.get(cacheKey)
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
            pageCache.set(cacheKey, result)
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
            pageCache.set(cacheKey, result)
            return result
        }

        return null
    }, [])

    // ========== DETECTAR CONTEÚDO ==========
    const detectContent = useCallback(async (slug: string, ownerId: string, ownerType: OwnerType) => {
        if (!slug || !ownerId) return null

        const cacheKey = `content_${slug}_${ownerId}`
        if (pageCache.has(cacheKey)) {
            return pageCache.get(cacheKey)
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
            pageCache.set(cacheKey, result)
            return result
        }

        return null
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

    // ========== CARREGAR INTERAÇÕES DO CONTEÚDO ATIVO ==========
    const loadInteractions = useCallback(async () => {
        if (!activeContent || !currentUserId) return

        const { count: likes } = await supabase
            .from('post_likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', activeContent.id)
        setLikeCount(likes || 0)

        const { data: userLike } = await supabase
            .from('post_likes')
            .select('id')
            .eq('post_id', activeContent.id)
            .eq('user_id', currentUserId)
            .maybeSingle()
        setIsLiked(!!userLike)

        const { count: shares } = await supabase
            .from('post_shares')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', activeContent.id)
        setShareCount(shares || 0)

        const { data: saved } = await supabase
            .from('post_saves')
            .select('id')
            .eq('post_id', activeContent.id)
            .eq('user_id', currentUserId)
            .maybeSingle()
        setIsSaved(!!saved)

        if (currentUserId !== activeContent.owner_id) {
            await supabase
                .from('post_views')
                .insert({
                    post_id: activeContent.id,
                    user_id: currentUserId,
                })
                .select()
        }
    }, [activeContent, currentUserId])

    // ========== CARREGAR COMENTÁRIOS DA PUBLICAÇÃO ATIVA ==========
    const loadComments = useCallback(async () => {
        if (!activeContent) return

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
            .eq('post_id', activeContent.id)
            .order('created_at', { ascending: false })

        if (!error && data) {
            setComments(data)
        }
        setLoadingComments(false)
    }, [activeContent])

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
                // Carregar publicações no store Zustand se ainda não estiver pré-carregado
                await publicationsStore.loadPublicationsForOwner({
                    ownerSlug,
                    initialSlug: slug,
                })
            }

        } catch (err: any) {
            console.error('Erro ao carregar dados:', err)
            setError(err.message || 'Erro ao carregar página')
        } finally {
            setLoading(false)
        }
    }, [ownerSlug, slug, detectOwner, detectContent, publicationsStore])

    // ===== EFFECTS =====
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
        if (activeContent && currentUserId) {
            loadInteractions()
            loadComments()
        }
    }, [activeContent?.id, currentUserId, loadInteractions, loadComments])

    useEffect(() => {
        if (activeContent) {
            setProductQuantity(getProductQuantity())
        }
    }, [activeContent, getProductQuantity])

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
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
    const isInCart = productQuantity > 0
    const isLoggedIn = !!loggedUserSlug && !loading

    // ========== FUNÇÕES PARA CARRINHO ==========
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
        if (!activeOwner || !activeContent) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        const cartProduct = contentToCartProduct(activeContent)
        addItem(storeKey as string, { name: activeOwner.name, logo_url: activeOwner.avatar_url ?? null }, cartProduct)
        setProductQuantity(prev => prev + 1)
        setCartAnimating(true)
        setTimeout(() => setCartAnimating(false), 500)
        toast.success('Adicionado ao carrinho!')
    }, [activeOwner, activeContent, ownerType, ownerSlug, addItem, contentToCartProduct])

    const handleDecreaseQuantity = useCallback(() => {
        if (!activeContent) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        if (productQuantity <= 1) {
            Object.keys(itemsByStore).forEach(key => {
                const storeItems = itemsByStore[key]
                const found = storeItems.find((item: any) => item.product.id === activeContent.id)
                if (found) {
                    removeItem(key, activeContent.id)
                }
            })
            setProductQuantity(0)
        } else {
            updateQuantity(storeKey as string, activeContent.id, -1)
            setProductQuantity(prev => prev - 1)
        }
    }, [activeContent, productQuantity, ownerType, ownerSlug, itemsByStore, removeItem, updateQuantity])

    const handleIncreaseQuantity = useCallback(() => {
        if (!activeOwner || !activeContent) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        const cartProduct = contentToCartProduct(activeContent)
        addItem(storeKey as string, { name: activeOwner.name, logo_url: activeOwner.avatar_url ?? null }, cartProduct)
        setProductQuantity(prev => prev + 1)
        setCartAnimating(true)
        setTimeout(() => setCartAnimating(false), 500)
    }, [activeOwner, activeContent, ownerType, ownerSlug, addItem, contentToCartProduct])

    const handleRemoveAll = useCallback(() => {
        if (!activeContent) return

        Object.keys(itemsByStore).forEach(key => {
            const storeItems = itemsByStore[key]
            const found = storeItems.find((item: any) => item.product.id === activeContent.id)
            if (found) {
                removeItem(key, activeContent.id)
            }
        })
        setProductQuantity(0)
        toast.info('Produto removido do carrinho')
    }, [activeContent, itemsByStore, removeItem])

    // ========== INTERAÇÕES ==========
    const handleLike = useCallback(async () => {
        if (!activeContent || !currentUserId) {
            toast.error('Faça login para curtir')
            return
        }

        if (isLiked) {
            const { error } = await supabase
                .from('post_likes')
                .delete()
                .eq('post_id', activeContent.id)
                .eq('user_id', currentUserId)

            if (!error) {
                setIsLiked(false)
                setLikeCount(prev => Math.max(0, prev - 1))
            }
        } else {
            const { error } = await supabase
                .from('post_likes')
                .insert({
                    post_id: activeContent.id,
                    user_id: currentUserId,
                })

            if (!error) {
                setIsLiked(true)
                setLikeCount(prev => prev + 1)
            }
        }
    }, [activeContent, currentUserId, isLiked])

    const handleComment = useCallback(async () => {
        if (!activeContent || !currentUserId) {
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
                post_id: activeContent.id,
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
    }, [activeContent, currentUserId, commentText])

    const handleShare = useCallback(async () => {
        if (!activeContent) return

        const shareUrl = `${window.location.origin}/${ownerSlug}/${activeContent.slug}`

        if (navigator.share) {
            try {
                await navigator.share({
                    title: activeContent.name,
                    text: `Confira esta publicação no iUser: ${activeContent.name}`,
                    url: shareUrl,
                })

                if (currentUserId) {
                    await supabase
                        .from('post_shares')
                        .insert({
                            post_id: activeContent.id,
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
                        post_id: activeContent.id,
                        user_id: currentUserId,
                    })
                setShareCount(prev => prev + 1)
            }
        } catch (err) {
            toast.error('Erro ao copiar link')
        }
    }, [activeContent, ownerSlug, currentUserId])

    const handleSave = useCallback(async () => {
        if (!activeContent || !currentUserId) {
            toast.error('Faça login para salvar')
            return
        }

        if (isSaved) {
            const { error } = await supabase
                .from('post_saves')
                .delete()
                .eq('post_id', activeContent.id)
                .eq('user_id', currentUserId)

            if (!error) {
                setIsSaved(false)
                toast.info('Removido dos salvos')
            }
        } else {
            const { error } = await supabase
                .from('post_saves')
                .insert({
                    post_id: activeContent.id,
                    user_id: currentUserId,
                })

            if (!error) {
                setIsSaved(true)
                toast.success('Salvo!')
            }
        }
    }, [activeContent, currentUserId, isSaved])

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

    const handleToggleComments = useCallback(() => {
        if (!currentUserId) {
            toast.error('Faça login para comentar')
            return
        }
        setShowComments(!showComments)
    }, [currentUserId, showComments])

    const handleToggleMenu = useCallback(() => {
        setIsMenuOpen(!isMenuOpen)
    }, [isMenuOpen])

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

    if (error || !activeOwner || !activeContent) {
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
                    <>
                        {isPublication && (
                            <Publications
                                owner={activeOwner}
                                content={activeContent}
                                ownerSlug={ownerSlug}
                                isOwner={isOwner}
                                currentUserId={currentUserId}
                                allPublications={storePublications.length > 0 ? storePublications : [activeContent]}
                                currentIndex={storePublications.length > 0 ? storeIndex : 0}
                                onNext={() => publicationsStore.next()}
                                onPrevious={() => publicationsStore.previous()}
                                loadingMore={publicationsStore.isLoadingMore}
                                isLiked={isLiked}
                                likeCount={likeCount}
                                onLike={handleLike}
                                showComments={showComments}
                                onToggleComments={handleToggleComments}
                                commentText={commentText}
                                onCommentChange={setCommentText}
                                onCommentSubmit={handleComment}
                                comments={comments}
                                loadingComments={loadingComments}
                                isSaved={isSaved}
                                onSave={handleSave}
                                shareCount={shareCount}
                                onShare={handleShare}
                                isMenuOpen={isMenuOpen}
                                onToggleMenu={handleToggleMenu}
                                onReport={handleReport}
                                onDeleteComment={handleDeleteComment}
                                commentInputRef={commentInputRef}
                                menuRef={menuRef}
                                containerRef={containerRef}
                                GRADIENT={GRADIENT}
                                loggedUserAvatarUrl={loggedUserAvatarUrl}
                                loggedUserSlug={loggedUserSlug}
                                router={router}
                            />
                        )}

                        {isProduct && (
                            <Products
                                owner={activeOwner}
                                content={activeContent}
                                ownerSlug={ownerSlug}
                                isOwner={isOwner}
                                isInCart={isInCart}
                                productQuantity={productQuantity}
                                onAddToCart={handleAddToCart}
                                onDecrease={handleDecreaseQuantity}
                                onIncrease={handleIncreaseQuantity}
                                onRemoveAll={handleRemoveAll}
                                GRADIENT={GRADIENT}
                                router={router}
                            />
                        )}
                    </>
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