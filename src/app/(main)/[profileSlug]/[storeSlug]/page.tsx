// src/app/(app)/[profileSlug]/[storeSlug]/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    AlertTriangle,
    ArrowLeft,
    Calendar,
    Search,
    Clock,
    ExternalLink,
    Star,
    X,
    Plus,
    Shield,
    Eye,
    ShoppingBag,
    Home,
    Store,
    MapPin,
    MessageCircle,
    Megaphone,
    ImageIcon,
    Send,
    Trash2,
    ChevronDown,
    ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { getAvatarUrl } from '@/lib/avatar'
import { RatingStars } from '@/components/ratings/RatingStars'
import { useCartStore } from '@/store/useCartStore'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import SacolaButton from '@/app/ButtonSacola'
import StoreSchedule from '../../StoreSchedule'
import { isStoreOpenNow, getStoreStatusText, getNextOpeningInfo, type BusinessHours } from '@/lib/storeHours'

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

type SaleType = {
    id: string
    buyer_id: string
    buyer_name?: string
    product_id?: string
    product_name?: string
    store_id: string
    created_at: string
    rating?: number
    comment?: string
    profiles?: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
    products?: {
        name: string
    } | null
}

type StoreType = {
    id: string
    name: string
    storeSlug: string
    description?: string | null
    address?: string | null
    logo_url?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    owner_id: string
    final_whatsapp?: string | null
    whatsapp?: string | null
    category_order?: string[] | null
    allow_scheduling?: boolean
    business_hours?: BusinessHours | null
    location?: any
    view_count?: number
}

type Publication = {
    id: string
    name: string
    description?: string
    image_url: string | null
    slug: string
    store_id: string
    created_at: string
}

type TabType = 'products' | 'reviews' | 'publications'

// Helpers para identificar visitantes
function getOrCreateAnonymousId(): string {
    const key = 'iuser_anon_id'
    let id = localStorage.getItem(key)
    if (!id) {
        id = crypto.randomUUID?.() || Math.random().toString(36).substring(2)
        localStorage.setItem(key, id)
    }
    return id
}

function getOrCreateSessionId(): string {
    const key = 'iuser_sid'
    let id = sessionStorage.getItem(key)
    if (!id) {
        id = crypto.randomUUID?.() || Math.random().toString(36).substring(2)
        sessionStorage.setItem(key, id)
    }
    return id
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const ua = navigator.userAgent
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet'
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return 'mobile'
    return 'desktop'
}

export default function StorePage() {
    const params = useParams()
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const router = useRouter()

    const { colors } = useTheme()
    const { bgMode, customBgUrl } = useProfile()

    const fileInputRef = useRef<HTMLInputElement>(null)

    const [store, setStore] = useState<StoreType | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [myRating, setMyRating] = useState(0)
    const [recentSales, setRecentSales] = useState<SaleType[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [cartAnimating, setCartAnimating] = useState(false)

    // States para Publicações
    const [publications, setPublications] = useState<Publication[]>([])
    const [isCreatingPublication, setIsCreatingPublication] = useState(false)
    const [pubName, setPubName] = useState('')
    const [pubDescription, setPubDescription] = useState('')
    const [pubImageFile, setPubImageFile] = useState<File | null>(null)
    const [pubPreview, setPubPreview] = useState<string | null>(null)
    const [pubSaving, setPubSaving] = useState(false)
    const [pubLoading, setPubLoading] = useState(false)
    const [storeWhatsapp, setStoreWhatsapp] = useState<string | null>(null)

    const {
        itemsByStore,
        addItem,
        removeItem,
        updateQuantity,
    } = useCartStore()

    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []

    const totalCartQuantity = useMemo(
        () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
        [cartItems]
    )

    const [showAllHours, setShowAllHours] = useState(false)
    const [totalVisitors, setTotalVisitors] = useState(0)
    const [activeTab, setActiveTab] = useState<TabType>('products')
    const [showScheduleModal, setShowScheduleModal] = useState(false)

    const [expandedDesc, setExpandedDesc] = useState(false)
    const DESC_LIMIT = 80

    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)

    // ========== QUANTITY HELPERS ==========
    const getProductQuantity = useCallback(
        (productId: string) => {
            const storeItems = itemsByStore[storeSlug as string] || []
            const found = storeItems.find((item) => item.product.id === productId)
            return found ? found.quantity : 0
        },
        [itemsByStore, storeSlug]
    )

    const increaseQuantity = useCallback(
        (product: any) => {
            if (!store) return
            addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url ?? null }, product)
        },
        [store, storeSlug, addItem]
    )

    const decreaseQuantity = useCallback(
        (productId: string) => {
            updateQuantity(storeSlug as string, productId, -1)
        },
        [storeSlug, updateQuantity]
    )

    const removeAllOfProduct = useCallback(
        (productId: string) => {
            removeItem(storeSlug as string, productId)
        },
        [storeSlug, removeItem]
    )

    // ========== VISIT CAPTURE ==========
    const captureVisit = useCallback(
        async (storeId: string, userId: string | null) => {
            try {
                const sessionId = getOrCreateSessionId()
                const anonymousId = userId ? null : getOrCreateAnonymousId()
                const device = getDeviceType()
                const referrer = document.referrer || null
                const userAgent = navigator.userAgent || null

                const { data, error } = await supabase.rpc('record_store_visit', {
                    p_store_id: storeId,
                    p_session_id: sessionId,
                    p_viewer_id: userId,
                    p_anonymous_id: anonymousId,
                    p_device_type: device,
                    p_referrer: referrer,
                    p_user_agent: userAgent,
                })

                if (error) {
                    console.warn('[StorePage] Erro ao registrar visita via RPC:', error.message)
                    await fallbackCaptureVisit(storeId, userId, anonymousId, sessionId, device, referrer, userAgent)
                    return
                }

                if (data === true) {
                    setTotalVisitors(prev => prev + 1)
                } else {
                    console.log('[StorePage] Visita ignorada (cooldown)')
                }
            } catch (err) {
                console.error('[StorePage] Erro inesperado ao registrar visita:', err)
            }
        },
        []
    )

    const fallbackCaptureVisit = useCallback(
        async (storeId: string, userId: string | null, anonymousId: string | null, sessionId: string, device: string, referrer: string | null, userAgent: string | null) => {
            const { error } = await supabase.from('store_visits').insert({
                store_id: storeId,
                viewer_id: userId || null,
                anonymous_id: anonymousId,
                session_id: sessionId,
                device_type: device,
                referrer,
                user_agent: userAgent,
            })
            if (error) {
                console.warn('[StorePage] Fallback de visita falhou:', error.message)
                return
            }
            const { error: rpcError } = await supabase.rpc('increment_store_view', { store_id: storeId })
            if (!rpcError) {
                setTotalVisitors(prev => prev + 1)
            } else {
                const { data: storeData } = await supabase
                    .from('stores')
                    .select('view_count')
                    .eq('id', storeId)
                    .single()
                if (storeData) {
                    const newCount = (storeData.view_count || 0) + 1
                    await supabase
                        .from('stores')
                        .update({ view_count: newCount })
                        .eq('id', storeId)
                    setTotalVisitors(newCount)
                }
            }
        },
        []
    )

    const captureProductView = useCallback(
        async (productId: string, storeId: string, userId: string | null) => {
            const anonymousId = userId ? null : getOrCreateAnonymousId()
            const sessionId = getOrCreateSessionId()
            const device = getDeviceType()
            const referrer = document.referrer || null
            const userAgent = navigator.userAgent || null

            const { error } = await supabase.from('product_views').insert({
                product_id: productId,
                store_id: storeId,
                viewer_id: userId || null,
                anonymous_id: anonymousId,
                session_id: sessionId,
                device_type: device,
                referrer,
                user_agent: userAgent,
            })
            if (error) console.warn('[StorePage] Erro ao registrar view do produto:', error.message)
        },
        [supabase]
    )

    // ========== FILTROS E AGRUPAMENTO ==========
    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const query = searchQuery.toLowerCase()
        return products.filter(
            p =>
                p.name?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query)
        )
    }, [products, searchQuery])

    const groupedProducts = useMemo(() => {
        const groups: Record<string, any[]> = {}
        filteredProducts.forEach(product => {
            const cat = product.category || 'Geral'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(product)
        })
        return groups
    }, [filteredProducts])

    const isStoreOpen = useMemo(() => {
        if (!store) return false
        return isStoreOpenNow(store.business_hours)
    }, [store])

    const statusText = useMemo(() => {
        if (!store) return ''
        return getStoreStatusText(store.business_hours)
    }, [store])

    const nextAvailable = useMemo(() => {
        if (!store?.business_hours) return null
        const next = getNextOpeningInfo(store.business_hours)
        if (!next) return null
        return {
            day: next.dayLabel,
            open: next.time,
        }
    }, [store?.business_hours])

    useEffect(() => {
        setMounted(true)
    }, [])

    const storeUrl = useMemo(() => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${profileSlug}/${storeSlug}`
    }, [profileSlug, storeSlug])

    // ========== CARREGAR LOJA E DADOS ==========
    const loadRatings = useCallback(
        async (storeId: string, userId: string | null) => {
            const { data, error: ratingsError } = await supabase
                .from('product_reviews')
                .select(
                    'id, rating, comment, is_anonymous, profile_id, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")'
                )
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
            if (ratingsError) return
            const rows = (data || []).map((r: any) => ({
                ...r,
                profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
                products: Array.isArray(r.products) ? r.products[0] : r.products,
            })) as RatingRow[]
            setRatings(rows)
            if (rows.length > 0) {
                const sum = rows.reduce((acc, r) => acc + r.rating, 0)
                const avg = sum / rows.length
                setStore((prev: StoreType | null) =>
                    prev ? { ...prev, ratings_avg: avg, ratings_count: rows.length } : null
                )
            }
            const myLatest = rows.find(rating => rating.profile_id === userId)
            setMyRating(myLatest?.rating ?? 0)
        },
        [supabase]
    )

    const loadPublications = useCallback(async (storeId: string) => {
        setPubLoading(true)
        try {
            const { data, error } = await supabase
                .from('products')
                .select('id, name, description, image_url, slug, created_at')
                .eq('store_id', storeId)
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })

            if (!error && data) {
                setPublications(data as Publication[])
            }
        } catch (err) {
            console.error('[StorePage] Erro ao carregar publicações:', err)
        } finally {
            setPubLoading(false)
        }
    }, [])

    const loadStore = useCallback(async () => {
        if (!storeSlug) return
        setLoading(true)
        setError(null)
        const { data: foundStore, error: storeError } = await supabase
            .from('stores')
            .select('*')
            .ilike('storeSlug', storeSlug)
            .maybeSingle()
        if (storeError) {
            setError(`Erro ao buscar loja: ${storeError.message}`)
            setLoading(false)
            return
        }
        if (!foundStore) {
            setLoading(false)
            return
        }

        const logoUrl = foundStore.logo_url
            ? supabase.storage.from('store-logos').getPublicUrl(foundStore.logo_url).data.publicUrl
            : null
        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id ?? null
        setCurrentUserId(userId)
        setIsOwner(userId === foundStore.owner_id)

        setTotalVisitors(foundStore.view_count ?? 0)

        const { data: productsData } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', foundStore.id)
            .eq('listing_type', 'sale')
            .order('created_at', { ascending: false })
        const mappedProducts = (productsData || []).map(product => ({
            ...product,
            image_url: product.image_url
                ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
                : null,
        }))

        let storeWhatsapp = foundStore.whatsapp
        if (!storeWhatsapp && foundStore.owner_id) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('whatsapp')
                .eq('id', foundStore.owner_id)
                .single()
            storeWhatsapp = profile?.whatsapp
        }

        setStore({ ...foundStore, logo_url: logoUrl, final_whatsapp: storeWhatsapp })
        setStoreWhatsapp(storeWhatsapp)
        setProducts(mappedProducts)
        await loadRatings(foundStore.id, userId)
        await loadPublications(foundStore.id)

        const { data: salesData } = await supabase
            .from('product_reviews')
            .select(
                'id, rating, comment, is_anonymous, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")'
            )
            .eq('store_id', foundStore.id)
            .order('created_at', { ascending: false })
            .limit(10)

        setRecentSales(
            (salesData || []).map((item: any) => ({
                ...item,
                profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
                products: Array.isArray(item.products) ? item.products[0] : item.products,
                buyer_name: item.profiles?.name || 'Cliente',
                product_name: item.is_anonymous ? 'Avaliação da Loja' : item.products?.name || 'Produto',
                buyer_id: item.profiles?.id,
            }))
        )

        setLoading(false)

        setTimeout(() => {
            if (foundStore) {
                captureVisit(foundStore.id, userId)
            }
        }, 2000)
    }, [storeSlug, supabase, loadRatings, loadPublications, captureVisit])

    useEffect(() => {
        loadStore()
    }, [loadStore])

    // ========== REALTIME: atualizar totalVisitors ==========
    useEffect(() => {
        if (!store) return

        const channel = supabase
            .channel(`store-${store.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'stores',
                    filter: `id=eq.${store.id}`,
                },
                (payload) => {
                    const newCount = payload.new.view_count as number
                    if (typeof newCount === 'number') {
                        setTotalVisitors(newCount)
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [store?.id])

    // ========== PUBLICATIONS ==========
    const getImageUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    useEffect(() => {
        if (!pubImageFile) return
        const url = URL.createObjectURL(pubImageFile)
        setPubPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [pubImageFile])

    const handleCreatePublication = async () => {
        if (!pubName.trim()) {
            toast.error('Dê um nome à publicação')
            return
        }
        if (!store) return

        setPubSaving(true)
        try {
            let imagePath: string | null = null
            if (pubImageFile) {
                const fileExt = pubImageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, pubImageFile)
                if (uploadError) throw uploadError
                imagePath = uploadData?.path ?? null
            }

            let slug = pubName
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, '')
            let isUnique = false
            while (!isUnique) {
                const { data: existing } = await supabase
                    .from('products')
                    .select('id')
                    .eq('slug', slug)
                    .eq('store_id', store.id)
                    .maybeSingle()
                if (existing) {
                    slug = slug + '-' + Math.floor(Math.random() * 9999)
                } else {
                    isUnique = true
                }
            }

            const { error: insertError } = await supabase.from('products').insert({
                name: pubName,
                slug,
                description: pubDescription || null,
                price: 0,
                type: 'physical',
                price_type: 'fixed',
                listing_type: 'publication',
                image_url: imagePath,
                store_id: store.id,
            })

            if (insertError) throw insertError

            toast.success('Publicação criada com sucesso!')
            setPubName('')
            setPubDescription('')
            setPubImageFile(null)
            setPubPreview(null)
            setIsCreatingPublication(false)

            await loadPublications(store.id)
        } catch (err: any) {
            console.error('Erro ao criar publicação:', err)
            toast.error('Erro ao criar: ' + (err.message || 'Tente novamente'))
        } finally {
            setPubSaving(false)
        }
    }

    const handleDeletePublication = async (id: string) => {
        if (!confirm('Deletar esta publicação?')) return
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (!error) {
            setPublications(prev => prev.filter(p => p.id !== id))
            toast.success('Publicação removida')
        } else {
            toast.error('Erro ao remover')
        }
    }

    // ========== MAPS E PRODUTOS ==========
    const openGoogleMaps = () => {
        if (!store) return
        let url = ''
        if (store.location) {
            try {
                let lat: number | null = null
                let lng: number | null = null
                if (typeof store.location === 'string') {
                    const match = store.location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
                    if (match) {
                        lng = parseFloat(match[1])
                        lat = parseFloat(match[2])
                    }
                } else if (store.location.type === 'Point' && Array.isArray(store.location.coordinates)) {
                    lng = store.location.coordinates[0]
                    lat = store.location.coordinates[1]
                }
                if (lat !== null && lng !== null) {
                    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                }
            } catch (e) {
                console.error('Erro ao extrair coordenadas:', e)
            }
        }
        if (!url && store.address) {
            url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
        }
        if (url) {
            window.open(url, '_blank')
        } else {
            toast.error('Localização não disponível')
        }
    }

    // ========== HANDLE PRODUCT CLICK ==========
    const handleProductClick = (product: any) => {
        const productIdentifier = product.slug || product.id

        if (!productIdentifier) {
            toast.error('Erro ao acessar este item')
            return
        }

        if (isOwner) {
            router.push(`/${profileSlug}/${storeSlug}/${productIdentifier}/editar-produto`)
            return
        }

        const isPublication = product.listing_type === 'publication'
        if (isPublication) {
            router.push(`/${profileSlug}/${storeSlug}/${productIdentifier}`)
            return
        }

        const alreadyInCart = cartItems.some((item: any) => item.product.id === product.id)
        if (alreadyInCart) return

        if (store) captureProductView(product.id, store.id, currentUserId)
        addItem(storeSlug as string, { name: store!.name, logo_url: store!.logo_url ?? null }, product)
        setCartAnimating(true)
        setTimeout(() => setCartAnimating(false), 500)
    }

    // ========== PEDIDOS E STATUS ==========
    useEffect(() => {
        const fetchOrderStatuses = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: orders } = await supabase
                .from('orders')
                .select('status')
                .eq('buyer_id', user.id)

            if (orders) {
                setPendingCount(orders.filter(o => o.status === 'pending').length)
                setPreparingCount(orders.filter(o => o.status === 'preparing').length)
                setReadyCount(orders.filter(o => o.status === 'ready').length)
            }

            const { data: paidOrders } = await supabase
                .from('orders')
                .select('id')
                .eq('buyer_id', user.id)
                .eq('status', 'paid')

            if (paidOrders && paidOrders.length > 0) {
                const orderIds = paidOrders.map(o => o.id)

                const { data: orderItems } = await supabase
                    .from('order_items')
                    .select('product_id')
                    .in('order_id', orderIds)

                if (orderItems && orderItems.length > 0) {
                    const productIds = orderItems.map(item => item.product_id)

                    const { data: reviews } = await supabase
                        .from('product_reviews')
                        .select('product_id')
                        .eq('profile_id', user.id)
                        .in('product_id', productIds)

                    const reviewedIds = new Set(reviews?.map(r => r.product_id) || [])
                    const pending = productIds.filter(pid => !reviewedIds.has(pid)).length
                    setPendingReviewsCount(pending)
                } else {
                    setPendingReviewsCount(0)
                }
            } else {
                setPendingReviewsCount(0)
            }
        }
        fetchOrderStatuses()
    }, [])

    useEffect(() => {
        if (cartItems.length > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [cartItems.length])

    // ========== ESTILOS ==========
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    // GRADIENTE LARANJA-VERMELHO FIXO
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    const primaryButtonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.75rem 1.25rem',
        borderRadius: '1rem',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s ease',
        background: GRADIENT,
        color: '#ffffff',
        border: 'none',
        boxShadow: `0 4px 14px #f9731660`,
        cursor: 'pointer',
    }

    if (loading) return <LoadingSpinner message="Carregando loja" background={colors.background} />

    if (error || !store)
        return (
            <div className="min-h-screen flex items-center justify-center px-4 text-center" style={{ background: colors.background }}>
                <div className="flex flex-col gap-4 max-w-sm items-center">
                    {error ? (
                        <AlertTriangle className="w-12 h-12" style={{ color: '#f97316' }} />
                    ) : (
                        <Search className="w-12 h-12" style={{ color: colors.textSecondary }} />
                    )}
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error ? 'Erro ao carregar' : 'Loja não encontrada'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        {error || `Nenhuma loja com /${storeSlug} foi encontrada.`}
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="font-bold mt-2"
                        style={{ color: '#f97316' }}
                    >
                        Voltar
                    </button>
                </div>
            </div>
        )

    // ========== RENDER ==========
    return (
        <div className="relative flex flex-col min-h-screen pb-28" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <style jsx global>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-15px) rotate(5deg); }
                }
                @keyframes pulse-glow-open {
                    0%, 100% { box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4), 0 0 0 6px rgba(16, 185, 129, 0.1); }
                    50% { box-shadow: 0 8px 24px rgba(16, 185, 129, 0.6), 0 0 0 12px rgba(16, 185, 129, 0); }
                }
                @keyframes pulse-glow-closed {
                    0%, 100% { box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4), 0 0 0 6px rgba(239, 68, 68, 0.1); }
                    50% { box-shadow: 0 8px 24px rgba(239, 68, 68, 0.6), 0 0 0 12px rgba(239, 68, 68, 0); }
                }
                @keyframes pulse-status {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.03); opacity: 0.85; }
                }
                .animate-pulse-glow-open {
                    animation: pulse-glow-open 2s ease-in-out infinite;
                }
                .animate-pulse-glow-closed {
                    animation: pulse-glow-closed 2s ease-in-out infinite;
                }
                .animate-pulse-status {
                    animation: pulse-status 2s ease-in-out infinite;
                }
            `}</style>

            {showScheduleModal && store && (
                <div
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowScheduleModal(false)}
                >
                    <div
                        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <StoreSchedule
                            storeId={store.id}
                            storeName={store.name}
                            storeSlug={store.storeSlug}
                            onClose={() => setShowScheduleModal(false)}
                            onSuccess={loadStore}
                        />
                    </div>
                </div>
            )}

            <main className="relative z-10 px-4 py-4 flex flex-col gap-5">
                {/* ===== HEADER DA LOJA ===== */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="flex-shrink-0 p-2 rounded-full hover:bg-white/10 transition"
                        style={{ color: colors.textPrimary }}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-shrink-0">
                        <div
                            className={`w-20 h-20 rounded-2xl p-[4px] ${isStoreOpen ? 'animate-pulse-glow-open' : 'animate-pulse-glow-closed'}`}
                            style={{
                                background: isStoreOpen
                                    ? 'linear-gradient(135deg, #10b981, #059669, #34d399)'
                                    : 'linear-gradient(135deg, #ef4444, #dc2626, #f87171)',
                            }}
                        >
                            <div className="w-full h-full rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                                {store.logo_url ? (
                                    <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-2xl font-black" style={{ color: '#f97316' }}>
                                        {store.name?.charAt(0) || '?'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black tracking-tight" style={{ color: colors.textPrimary }}>{store.name}</h2>
                        <div className="flex flex-col gap-1 mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                            <div className="flex items-center gap-1">
                                <Eye size={12} />
                                <span className="font-bold">{totalVisitors} visitantes</span>
                            </div>
                            <button
                                onClick={() => {
                                    if (isOwner) {
                                        router.push(`/${profileSlug}/${storeSlug}/editar-loja`)
                                    } else {
                                        if (store.business_hours && Object.keys(store.business_hours).length > 0) {
                                            setShowAllHours(true)
                                        }
                                    }
                                }}
                                className="flex items-center gap-1 font-bold hover:underline cursor-pointer w-fit"
                                style={{
                                    color: isStoreOpen ? '#10b981' : '#ef4444',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                }}
                            >
                                <Clock className="w-3.5 h-3.5" />
                                <span className="truncate max-w-[200px]">{statusText}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ===== DESCRIÇÃO ===== */}
                {store.description && (
                    <div className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                        {expandedDesc || store.description.length <= DESC_LIMIT
                            ? store.description
                            : `${store.description.slice(0, DESC_LIMIT)}...`}
                        {store.description.length > DESC_LIMIT && (
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

                {/* ===== BOTÃO DE AGENDAR CONDICIONAL ===== */}
                <div className="flex flex-wrap items-center gap-4">
                    {store.address && (
                        <button
                            onClick={openGoogleMaps}
                            className="flex items-center gap-1 font-bold text-xs uppercase hover:underline"
                            style={{ color: '#f97316' }}
                        >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{store.address.split(',')[0].trim()}</span>
                        </button>
                    )}

                    {store.allow_scheduling && (
                        <button
                            onClick={() => setShowScheduleModal(true)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold shadow-xl transition-all hover:scale-105 ${nextAvailable ? 'animate-pulse-status' : ''
                                }`}
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                border: `1px solid #f97316`,
                                boxShadow: `0 8px 18px #f9731650`,
                            }}
                        >
                            <Calendar className="w-4 h-4" />
                            <span>
                                {nextAvailable
                                    ? `Agendar · ${nextAvailable.day} ${nextAvailable.open}`
                                    : 'Agendar'}
                            </span>
                        </button>
                    )}
                </div>

                {/* ===== TABS - CORRIGIDO: terceiro item agora é div ===== */}
                <div className="flex rounded-2xl p-1.5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: colors.border }}>
                    <button
                        onClick={() => setActiveTab('products')}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 ${activeTab === 'products' ? 'shadow-lg scale-[1.02]' : 'hover:bg-white/5'}`}
                        style={
                            activeTab === 'products'
                                ? { background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731650` }
                                : { background: 'transparent', color: colors.textSecondary }
                        }
                    >
                        <span>Produtos</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('publications')}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 ${activeTab === 'publications' ? 'shadow-lg scale-[1.02]' : 'hover:bg-white/5'}`}
                        style={
                            activeTab === 'publications'
                                ? { background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731650` }
                                : { background: 'transparent', color: colors.textSecondary }
                        }
                    >
                        <span>Publicações</span>
                        {publications.length > 0 && (
                            <span className="text-[9px] font-bold opacity-70">({publications.length})</span>
                        )}
                    </button>
                    <div
                        onClick={() => setActiveTab('reviews')}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 cursor-pointer ${activeTab === 'reviews' ? 'shadow-lg scale-[1.02]' : 'hover:bg-white/5'}`}
                        style={
                            activeTab === 'reviews'
                                ? { background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731650` }
                                : { background: 'transparent', color: colors.textSecondary }
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setActiveTab('reviews') } }}
                    >
                        <span>Avaliações</span>
                        {store.ratings_count ? (
                            <span className="flex items-center gap-1" style={{ color: activeTab === 'reviews' ? '#ffffff' : colors.textSecondary }}>
                                <RatingStars value={Number(store.ratings_avg || 0)} size={10} />
                                <span className="text-[10px] font-bold">{Number(store.ratings_avg || 0).toFixed(1)}</span>
                                <span className="text-[9px] opacity-75">({store.ratings_count})</span>
                            </span>
                        ) : null}
                    </div>
                </div>

                {/* ===== TAB PRODUTOS ===== */}
                {activeTab === 'products' && (
                    <>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                                <input
                                    type="text"
                                    placeholder="Buscar produtos..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full border rounded-2xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 transition-all"
                                    style={{
                                        background: `${colors.surface}88`,
                                        borderColor: colors.border,
                                        color: colors.textPrimary,
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                    }}
                                />
                            </div>
                            {isOwner && (
                                <button
                                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/criar-produto`)}
                                    className="flex items-center justify-center w-10 h-10 rounded-xl border shadow-md hover:scale-110 transition-transform"
                                    style={{ background: GRADIENT, color: '#ffffff', borderColor: '#f97316' }}
                                    title="Adicionar produto"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {filteredProducts.length === 0 ? (
                            isOwner ? (
                                <div className="rounded-2xl p-6 flex flex-col items-center text-center gap-4" style={cardStyle}>
                                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${colors.accent}20` }}>
                                        <Store size={28} style={{ color: '#f97316' }} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Sua loja está vazia</h3>
                                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                            Adicione produtos ou serviços para começar a vender.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => router.push(`/${profileSlug}/${storeSlug}/criar-produto`)}
                                        className="w-full"
                                        style={primaryButtonStyle}
                                    >
                                        <Store size={18} />
                                        Adicionar Produto
                                    </button>
                                </div>
                            ) : (
                                <div className="py-16 text-center rounded-2xl border border-dashed flex flex-col items-center gap-3" style={cardStyle}>
                                    <Search className="w-12 h-12" style={{ color: colors.textSecondary }} />
                                    <p className="font-bold text-base" style={{ color: colors.textPrimary }}>Nenhum produto disponível</p>
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>Esta loja ainda não publicou nada.</p>
                                </div>
                            )
                        ) : (
                            Object.entries(groupedProducts).map(([category, products]) => (
                                <div key={category} className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] pl-1"
                                        style={{ color: '#f97316' }}>
                                        {category}
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {products.map(product => {
                                            const isSelected = mounted && cartItems.some((item: any) => item.product.id === product.id)
                                            const quantity = getProductQuantity(product.id)
                                            const isHourly = product.price_type === 'hourly'
                                            const hasImage = !!product.image_url

                                            if (!hasImage) {
                                                return (
                                                    <div
                                                        key={product.id}
                                                        onClick={() => handleProductClick(product)}
                                                        className={`col-span-2 rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer ${isSelected ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-400/20' : ''}`}
                                                        style={{
                                                            background: `${colors.surface}88`,
                                                            borderColor: isSelected ? '#22c55e' : colors.border,
                                                            backdropFilter: 'blur(8px)',
                                                            WebkitBackdropFilter: 'blur(8px)',
                                                        }}
                                                    >
                                                        <div className="p-4 flex flex-col justify-center min-w-0">
                                                            <h4 className="text-sm font-bold line-clamp-1" style={{ color: colors.textPrimary }}>
                                                                {product.name}
                                                            </h4>
                                                            <p className="text-[11px] line-clamp-1 mt-0.5 opacity-75" style={{ color: colors.textSecondary }}>
                                                                {product.description || 'Sem descrição'}
                                                            </p>
                                                            <div className="mt-2">
                                                                <div className="flex items-center">
                                                                    <span className="text-base font-extrabold" style={{ color: '#f97316' }}>
                                                                        R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                    {isHourly && <span className="text-[10px] ml-1 opacity-75">/h</span>}
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 flex justify-end items-center">
                                                                {isOwner ? (
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`) }}
                                                                        className="w-8 h-8 rounded-full border flex items-center justify-center"
                                                                        style={{ borderColor: colors.border, color: '#f97316' }}
                                                                    >
                                                                        <ExternalLink className="w-4 h-4" />
                                                                    </button>
                                                                ) : isSelected ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                if (quantity <= 1) {
                                                                                    removeAllOfProduct(product.id)
                                                                                } else {
                                                                                    decreaseQuantity(product.id)
                                                                                }
                                                                            }}
                                                                            className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 font-bold text-sm"
                                                                        >
                                                                            −
                                                                        </button>
                                                                        <span className="text-sm font-bold min-w-[20px] text-center">{quantity}</span>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                increaseQuantity(product)
                                                                            }}
                                                                            className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 font-bold text-sm"
                                                                        >
                                                                            +
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                removeAllOfProduct(product.id)
                                                                            }}
                                                                            className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                                                                            title="Remover todos"
                                                                        >
                                                                            <X className="w-4 h-4 text-white" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); handleProductClick(product) }}
                                                                        className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                                                                        style={{ background: GRADIENT }}
                                                                    >
                                                                        <Plus className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            return (
                                                <div
                                                    key={product.id}
                                                    onClick={() => handleProductClick(product)}
                                                    className={`relative rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer ${isSelected ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-400/20' : ''
                                                        }`}
                                                    style={{
                                                        background: `${colors.surface}88`,
                                                        borderColor: isSelected ? '#22c55e' : colors.border,
                                                        backdropFilter: 'blur(8px)',
                                                        WebkitBackdropFilter: 'blur(8px)',
                                                    }}
                                                >
                                                    <div className="aspect-square relative overflow-hidden" style={{ background: colors.accentLight }}>
                                                        {product.image_url ? (
                                                            <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-4xl font-black" style={{ color: '#f97316' }}>
                                                                {product.name?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                        {product.type && (
                                                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase backdrop-blur-md"
                                                                style={{ background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
                                                                {product.type === 'physical' ? 'Físico' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="p-3">
                                                        <h4 className="text-sm font-bold line-clamp-1" style={{ color: colors.textPrimary }}>
                                                            {product.name}
                                                        </h4>
                                                        <p className="text-[11px] line-clamp-1 mt-0.5 opacity-75" style={{ color: colors.textSecondary }}>
                                                            {product.description || 'Sem descrição'}
                                                        </p>
                                                        <div className="mt-2">
                                                            <div className="flex items-center">
                                                                <span className="text-base font-extrabold" style={{ color: '#f97316' }}>
                                                                    R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                                {isHourly && <span className="text-[10px] ml-1 opacity-75">/h</span>}
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 flex justify-end items-center">
                                                            {isOwner ? (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`) }}
                                                                    className="w-8 h-8 rounded-full border flex items-center justify-center"
                                                                    style={{ borderColor: colors.border, color: '#f97316' }}
                                                                >
                                                                    <ExternalLink className="w-4 h-4" />
                                                                </button>
                                                            ) : isSelected ? (
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            if (quantity <= 1) {
                                                                                removeAllOfProduct(product.id)
                                                                            } else {
                                                                                decreaseQuantity(product.id)
                                                                            }
                                                                        }}
                                                                        className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 font-bold text-sm"
                                                                    >
                                                                        −
                                                                    </button>
                                                                    <span className="text-sm font-bold min-w-[20px] text-center">{quantity}</span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            increaseQuantity(product)
                                                                        }}
                                                                        className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 font-bold text-sm"
                                                                    >
                                                                        +
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            removeAllOfProduct(product.id)
                                                                        }}
                                                                        className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                                                                        title="Remover todos"
                                                                    >
                                                                        <X className="w-4 h-4 text-white" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); handleProductClick(product) }}
                                                                    className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                                                                    style={{ background: GRADIENT }}
                                                                >
                                                                    <Plus className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                {/* ===== TAB PUBLICAÇÕES ===== */}
                {activeTab === 'publications' && (
                    <div className="space-y-4">
                        {pubLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                            </div>
                        ) : publications.length === 0 ? (
                            <div
                                className="rounded-2xl p-6 flex flex-col items-center text-center gap-4"
                                style={cardStyle}
                            >
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                    style={{ background: `${colors.accent}20` }}
                                >
                                    <Megaphone size={28} style={{ color: '#f97316' }} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                        Apareça no iUser
                                    </h3>
                                    <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                        Faça uma publicação para todos verem.
                                    </p>
                                </div>
                                {!isCreatingPublication && isOwner && (
                                    <button
                                        onClick={() => setIsCreatingPublication(true)}
                                        className="w-full"
                                        style={primaryButtonStyle}
                                    >
                                        <Megaphone size={18} />
                                        Criar Publicação
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {publications.map(pub => {
                                        const imgUrl = getImageUrl(pub.image_url)
                                        const pubIdentifier = pub.slug || pub.id

                                        const handleOpenPub = () => {
                                            if (pubIdentifier) {
                                                router.push(`/${profileSlug}/${storeSlug}/${pubIdentifier}`)
                                            } else {
                                                toast.error('Erro ao abrir esta publicação')
                                            }
                                        }

                                        return (
                                            <div
                                                key={pub.id}
                                                className="rounded-xl border p-3 flex flex-col gap-2 relative group cursor-pointer hover:opacity-90 transition-all"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                }}
                                                onClick={handleOpenPub}
                                            >
                                                <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
                                                    {imgUrl ? (
                                                        <img src={imgUrl} className="w-full h-full object-cover" alt={pub.name} />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center" style={{ color: colors.textSecondary }}>
                                                            <Megaphone size={32} />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {pub.name}
                                                </p>
                                                {isOwner && (
                                                    <div className="flex items-center justify-between mt-auto" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => {
                                                                const editIdentifier = pub.slug || pub.id
                                                                if (editIdentifier) {
                                                                    router.push(`/${profileSlug}/${storeSlug}/${editIdentifier}/editar-produto`)
                                                                }
                                                            }}
                                                            className="p-1.5 rounded hover:bg-white/10 transition-colors"
                                                            title="Editar"
                                                        >
                                                            <ExternalLink size={14} style={{ color: colors.textSecondary }} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeletePublication(pub.id)}
                                                            className="p-1.5 rounded hover:bg-red-50 transition-colors"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={14} style={{ color: '#ef4444' }} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {isOwner && !isCreatingPublication && (
                                    <button
                                        onClick={() => setIsCreatingPublication(true)}
                                        className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:bg-white/5"
                                        style={{
                                            border: `1px dashed ${colors.border}`,
                                            color: '#f97316',
                                        }}
                                    >
                                        <Plus size={16} />
                                        Nova publicação
                                    </button>
                                )}
                            </>
                        )}

                        {isCreatingPublication && isOwner && (
                            <div
                                className="rounded-xl p-4 border space-y-4 animate-in slide-in-from-top-2 duration-200"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    borderColor: colors.border,
                                }}
                            >
                                <h4 className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}>
                                    <Megaphone size={16} style={{ color: '#f97316' }} />
                                    Nova Publicação
                                </h4>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Imagem (opcional)
                                    </label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-24 h-24 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group"
                                    >
                                        {pubPreview ? (
                                            <img src={pubPreview} className="w-full h-full object-cover" alt="" />
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
                                            if (file) setPubImageFile(file)
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Título da publicação
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Promoção de verão!"
                                        value={pubName}
                                        onChange={(e) => setPubName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Descrição
                                    </label>
                                    <textarea
                                        placeholder="Descreva sua novidade..."
                                        value={pubDescription}
                                        onChange={(e) => setPubDescription(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                </div>

                                {storeWhatsapp && (
                                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50/50 px-3 py-2 rounded-lg">
                                        <MessageCircle size={14} />
                                        <span>O cliente será direcionado para o WhatsApp da loja: <strong>{storeWhatsapp}</strong></span>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => {
                                            setIsCreatingPublication(false)
                                            setPubName('')
                                            setPubDescription('')
                                            setPubImageFile(null)
                                            setPubPreview(null)
                                        }}
                                        className="flex-1 py-2.5 rounded-lg font-bold text-sm border transition-colors"
                                        style={{
                                            borderColor: colors.border,
                                            color: colors.textSecondary,
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleCreatePublication}
                                        disabled={pubSaving || !pubName.trim()}
                                        className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                        style={{
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            color: '#ffffff',
                                        }}
                                    >
                                        {pubSaving ? (
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

                {/* ===== TAB AVALIAÇÕES ===== */}
                {activeTab === 'reviews' && (
                    <div className="space-y-4">
                        {ratings.length === 0 ? (
                            <div className="py-16 text-center rounded-2xl border border-dashed" style={cardStyle}>
                                <Star className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                <p className="font-bold text-base" style={{ color: colors.textPrimary }}>Nenhuma avaliação ainda</p>
                                <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>Seja o primeiro a avaliar!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {ratings.map((rating: any) => {
                                    const avatarUrl = getAvatarUrl(supabase, rating.profiles?.avatar_url)
                                    return (
                                        <div key={rating.id} className="flex gap-3 p-4 rounded-2xl border" style={cardStyle}>
                                            <div className="w-10 h-10 rounded-2xl p-[2px] shrink-0" style={{ background: GRADIENT }}>
                                                <div className="w-full h-full rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="font-bold text-sm" style={{ color: '#f97316' }}>
                                                            {(rating.profiles?.name || '?').slice(0, 1).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>{rating.profiles?.name || 'Usuário'}</p>
                                                        <p className="text-[10px] font-medium" style={{ color: '#f97316' }}>
                                                            {new Date(rating.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: `${colors.accent}20`, color: '#f97316' }}>
                                                        <Shield className="w-3 h-3" />
                                                        <span className="text-[9px] font-black uppercase">Verificada</span>
                                                    </div>
                                                </div>
                                                <div className="mt-1.5">
                                                    <RatingStars value={rating.rating} size={14} />
                                                    {!rating.is_anonymous && rating.products?.name && (
                                                        <span className="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style={{ background: `${colors.accent}20`, color: '#f97316' }}>
                                                            {rating.products.name}
                                                        </span>
                                                    )}
                                                </div>
                                                {rating.comment && (
                                                    <p className="mt-2 text-sm italic leading-relaxed" style={{ color: colors.textSecondary }}>"{rating.comment}"</p>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* ===== BOTÕES FLUTUANTES ===== */}
            <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                <SacolaButton
                    totalItems={totalCartQuantity}
                    statusCounts={{
                        pending: pendingCount,
                        preparing: preparingCount,
                        ready: readyCount,
                        reviews: pendingReviewsCount,
                    }}
                    animate={cartAnimating}
                />
                <button
                    onClick={() => router.push('/')}
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                    style={{
                        background: GRADIENT,
                        color: '#ffffff',
                        border: `2px solid #f97316`,
                        boxShadow: `0 8px 24px #f9731660`,
                    }}
                    aria-label="Voltar ao início"
                >
                    <Home size={24} />
                </button>
            </div>

            {/* ===== MODAL DE HORÁRIOS ===== */}
            {showAllHours && store.business_hours && (
                <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAllHours(false)}>
                    <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Horários de Funcionamento</h3>
                            <button onClick={() => setShowAllHours(false)} className="text-2xl" style={{ color: colors.textSecondary }}>×</button>
                        </div>
                        <div className="space-y-2">
                            {[
                                { key: '1', label: 'Segunda-feira' },
                                { key: '2', label: 'Terça-feira' },
                                { key: '3', label: 'Quarta-feira' },
                                { key: '4', label: 'Quinta-feira' },
                                { key: '5', label: 'Sexta-feira' },
                                { key: '6', label: 'Sábado' },
                                { key: '0', label: 'Domingo' },
                            ].map(({ key, label }) => {
                                const weekly = (store.business_hours as any)?.weekly
                                const dayConfig = weekly?.[key]
                                const todayKey = String(new Date().getDay())
                                const isToday = key === todayKey
                                return (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between py-2 border-b last:border-0"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <span
                                            className="text-sm font-bold"
                                            style={{ color: isToday ? '#f97316' : colors.textPrimary }}
                                        >
                                            {label}{isToday ? ' (hoje)' : ''}
                                        </span>
                                        {dayConfig?.isOpen && dayConfig.start && dayConfig.end ? (
                                            <span className="text-sm" style={{ color: colors.textSecondary }}>
                                                {dayConfig.start.slice(0, 5)} - {dayConfig.end.slice(0, 5)}
                                                {dayConfig.lunchStart && dayConfig.lunchEnd ? (
                                                    <span className="text-xs ml-2 opacity-70">
                                                        (almoço {dayConfig.lunchStart.slice(0, 5)}-{dayConfig.lunchEnd.slice(0, 5)})
                                                    </span>
                                                ) : null}
                                            </span>
                                        ) : (
                                            <span className="text-sm italic" style={{ color: colors.textSecondary }}>Fechado</span>
                                        )}
                                    </div>
                                )
                            })}
                            {((store.business_hours as any)?.blocked_dates?.length > 0) && (
                                <div className="mt-4 pt-3 border-t" style={{ borderColor: colors.border }}>
                                    <p className="text-xs font-bold mb-2" style={{ color: colors.textSecondary }}>
                                        Datas fechadas:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(store.business_hours as any).blocked_dates.map((d: string) => {
                                            const [y, mo, day] = d.split('-')
                                            return (
                                                <span
                                                    key={d}
                                                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                                                    style={{ background: '#ef444420', color: '#ef4444' }}
                                                >
                                                    {day}/{mo}/{y}
                                                </span>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}