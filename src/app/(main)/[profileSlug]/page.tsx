// app/(main)/[profileSlug]/page.tsx

'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Store as StoreIcon,
    Star,
    ArrowLeft,
    ShoppingBag,
    MapPin,
    MapPinned,
    X,
    Pencil,
    Clock,
    CalendarDays,
    Calendar,
    Camera,
    Search,
    User,
    Plus,
    ExternalLink,
    MessageCircle,
    Eye,
    Shield,
    Home,
    Store,
    AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import EditarPerfil from './EditarPerfil'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import { RatingStars } from '@/components/ratings/RatingStars'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '@/app/ButtonSacola'
import type { Tab } from '@/app/Header'

type ProfileTab = 'compras' | 'agenda' | 'produtos' | 'avaliacoes'

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

export default function ProfilePage() {
    const params = useParams()
    const router = useRouter()
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { colors } = useTheme()

    const {
        avatarUrl: loggedUserAvatarUrl,
        profileSlug: loggedUserSlug,
        bgMode,
        customBgUrl,
        loading: profileLoading,
    } = useProfile()

    const [profile, setProfile] = useState<any>(null)
    const [stores, setStores] = useState<any[]>([])
    const [purchases, setPurchases] = useState<any[]>([])
    const [appointmentsToday, setAppointmentsToday] = useState<any[]>([])
    const [allAppointments, setAllAppointments] = useState<any[]>([])
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [activeTab, setActiveTab] = useState<ProfileTab>('produtos')
    const [loading, setLoading] = useState(true)
    const [profileNotFound, setProfileNotFound] = useState(false)
    const [editMode, setEditMode] = useState(false)

    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [isFollowing, setIsFollowing] = useState(false)
    const [isOwner, setIsOwner] = useState(false)

    const [showLocationModal, setShowLocationModal] = useState(false)
    const [manualAddress, setManualAddress] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [tempAddress, setTempAddress] = useState('')

    const [profileProducts, setProfileProducts] = useState<any[]>([])
    const [profileRatings, setProfileRatings] = useState<RatingRow[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [cartAnimating, setCartAnimating] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [totalProfileVisitors, setTotalProfileVisitors] = useState(0)

    const {
        itemsByStore,
        addItem,
        removeItem,
        updateQuantity,
    } = useCartStore()

    const cartItems = typeof profileSlug === 'string' ? (itemsByStore[`profile_${profileSlug}`] || []) : []

    const totalCartQuantity = useMemo(
        () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
        [cartItems]
    )

    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)

    useEffect(() => {
        setMounted(true)
    }, [])

    const getProductQuantity = useCallback(
        (productId: string) => {
            const storeItems = itemsByStore[`profile_${profileSlug}`] || []
            const found = storeItems.find((item) => item.product.id === productId)
            return found ? found.quantity : 0
        },
        [itemsByStore, profileSlug]
    )

    const increaseQuantity = useCallback(
        (product: any) => {
            if (!profile) return
            addItem(`profile_${profileSlug}`, { name: profile.name, logo_url: profile.avatar_url ?? null }, product)
        },
        [profile, profileSlug, addItem]
    )

    const decreaseQuantity = useCallback(
        (productId: string) => {
            updateQuantity(`profile_${profileSlug}`, productId, -1)
        },
        [profileSlug, updateQuantity]
    )

    const removeAllOfProduct = useCallback(
        (productId: string) => {
            removeItem(`profile_${profileSlug}`, productId)
        },
        [profileSlug, removeItem]
    )

    const loadProfileData = useCallback(async () => {
        if (!profileSlug) {
            setLoading(false)
            setProfileNotFound(true)
            return
        }
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user)

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('profileSlug', profileSlug)
            .single()

        if (profileError || !profileData) {
            setLoading(false)
            setProfileNotFound(true)
            return
        }

        setProfile(profileData)
        setIsOwner(user?.id === profileData.id)
        setTotalProfileVisitors(profileData.view_count || 0)

        const [storesRes, followersRes, followingRes, checkFollowRes] = await Promise.all([
            supabase.from('stores').select('*').eq('owner_id', profileData.id),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileData.id),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileData.id),
            user ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', profileData.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        ])

        setStores(storesRes.data || [])
        setFollowersCount(followersRes.count || 0)
        setFollowingCount(followingRes.count || 0)
        setIsFollowing(!!checkFollowRes.data)

        const { data: paidOrders, error: ordersErr } = await supabase
            .from('orders')
            .select('id, store_id, stores!inner(name, logo_url, storeSlug)')
            .eq('buyer_id', profileData.id)
            .eq('status', 'paid')
            .order('created_at', { ascending: false })

        if (!ordersErr) {
            const uniqueStorePurchases: any[] = []
            const seenStoreIds = new Set<string>()
            paidOrders?.forEach((order: any) => {
                if (!seenStoreIds.has(order.store_id)) {
                    seenStoreIds.add(order.store_id)
                    uniqueStorePurchases.push({
                        id: order.id,
                        store_id: order.store_id,
                        stores: order.stores,
                    })
                }
            })
            setPurchases(uniqueStorePurchases)
        }

        const { data: productsData } = await supabase
            .from('products')
            .select('*')
            .eq('owner_id', profileData.id)
            .is('store_id', null)
            .order('created_at', { ascending: false })

        const mappedProducts = (productsData || []).map((product: any) => ({
            ...product,
            image_url: product.image_url
                ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
                : null,
        }))
        setProfileProducts(mappedProducts)

        const { data: ratingsData } = await supabase
            .from('product_reviews')
            .select('id, rating, comment, is_anonymous, profile_id, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")')
            .eq('store_id', null as any)
            .order('created_at', { ascending: false })

        if (ratingsData) {
            const rows = (ratingsData || []).map((r: any) => ({
                ...r,
                profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
                products: Array.isArray(r.products) ? r.products[0] : r.products,
            })) as RatingRow[]
            setProfileRatings(rows)
        }

        const todayStr = new Date().toISOString().split('T')[0]
        try {
            const { data: todayAppts } = await supabase
                .from('appointments')
                .select('*, profiles:customer_id(name, avatar_url, profileSlug)')
                .eq('provider_profile_id', profileData.id)
                .eq('date', todayStr)
                .neq('status', 'declined')
                .order('time', { ascending: true })
            setAppointmentsToday(todayAppts || [])

            const { data: allAppts } = await supabase
                .from('appointments')
                .select('*, profiles:customer_id(name, avatar_url, profileSlug)')
                .eq('provider_profile_id', profileData.id)
                .gte('date', todayStr)
                .neq('status', 'declined')
                .order('date', { ascending: true })
                .order('time', { ascending: true })
            setAllAppointments(allAppts || [])
        } catch {
            setAppointmentsToday([])
            setAllAppointments([])
        }

        setLoading(false)
        setProfileNotFound(false)
    }, [profileSlug])

    useEffect(() => {
        loadProfileData()
    }, [loadProfileData])

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

    const [loggedUserStores, setLoggedUserStores] = useState<any[]>([])
    useEffect(() => {
        if (!loggedUserSlug || profileLoading) return
        const loadLoggedStores = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: storesData } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')
                .eq('owner_id', user.id)
                .order('created_at', { ascending: true })
            if (storesData) {
                const mapped = storesData.map((s: any) => ({
                    id: s.id,
                    slug: s.storeSlug,
                    name: s.name,
                    logoUrl: s.logo_url
                        ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                        : null,
                }))
                setLoggedUserStores(mapped)
            }
        }
        loadLoggedStores()
    }, [loggedUserSlug, profileLoading])

    const finalTabs: Tab[] = useMemo(() => {
        const isLoggedIn = !!loggedUserSlug && !profileLoading
        const allTabs: Tab[] = [

            {
                id: 'perfil',
                label: isLoggedIn ? `@${loggedUserSlug}` : 'Entrar',
                icon: User as any,
                imageUrl: isLoggedIn ? loggedUserAvatarUrl : null,
                onClick: () => {
                    if (isLoggedIn) {
                        router.push('/')
                    } else {
                        router.push('/login')
                    }
                },
                isActive: false,
            },
        ]

        if (loggedUserStores.length > 0) {
            loggedUserStores.forEach((store) => {
                allTabs.push({
                    id: `loja-${store.slug}`,
                    label: store.name,
                    icon: StoreIcon as any,
                    imageUrl: store.logoUrl,
                    onClick: () => router.push(`/${loggedUserSlug}/${store.slug}`),
                    isActive: false,
                })
            })
        } else if (isLoggedIn) {
            allTabs.push({
                id: 'criar-loja',
                label: 'Criar loja',
                icon: StoreIcon as any,
                imageUrl: null,
                onClick: () => router.push('/criar-loja'),
                isActive: false,
            })
        } else {
            allTabs.push({
                id: 'criar-loja',
                label: 'Criar loja',
                icon: StoreIcon as any,
                imageUrl: null,
                onClick: () => router.push('/criar-loja-com-cadastro'),
                isActive: false,
            })
        }

        return allTabs
    }, [loggedUserSlug, profileLoading, loggedUserAvatarUrl, loggedUserStores, router])

    const handleFollowToggle = async () => {
        if (!currentUser || !profile) return
        if (isFollowing) {
            setIsFollowing(false)
            setFollowersCount(prev => prev - 1)
            await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', profile.id)
        } else {
            setIsFollowing(true)
            setFollowersCount(prev => prev + 1)
            await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: profile.id })
        }
    }

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !profile) return
        setUploadingAvatar(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${profile.id}-${Date.now()}.${fileExt}`
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true })
            if (uploadError) throw uploadError
            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
            const publicUrl = data.publicUrl
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', profile.id)
            if (updateError) throw updateError
            setProfile({ ...profile, avatar_url: publicUrl })
        } catch (err: any) {
            alert('Erro ao enviar foto: ' + err.message)
        } finally {
            setUploadingAvatar(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const fetchSuggestions = useCallback(async (query: string) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&country=BR&limit=5`
            )
            const data = await res.json()
            setSuggestions(data.features || [])
        } catch (e) { console.error(e) }
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (manualAddress.length >= 4) fetchSuggestions(manualAddress)
        }, 500)
        return () => clearTimeout(timer)
    }, [manualAddress, fetchSuggestions])

    const selectSuggestion = (feature: any) => {
        const [lng, lat] = feature.center
        setSelectedLocation({ lat, lng })
        setTempAddress(feature.place_name)
        setManualAddress(feature.place_name)
        setSuggestions([])
    }

    const saveLocation = async () => {
        if (!tempAddress || !selectedLocation || !profile) return
        const { error } = await supabase.from('profiles').update({
            address: tempAddress,
            location: `POINT(${selectedLocation.lng} ${selectedLocation.lat})`,
            show_location: true,
        }).eq('id', profile.id)
        if (!error) {
            setProfile({ ...profile, address: tempAddress, show_location: true })
            setShowLocationModal(false)
        }
    }

    const toggleLocationVisibility = async () => {
        if (!profile || !isOwner) return
        const next = !profile.show_location
        setProfile({ ...profile, show_location: next })
        await supabase.from('profiles').update({ show_location: next }).eq('id', profile.id)
    }

    useEffect(() => {
        if (profile?.id) {
            const recordView = async () => {
                const { data: { user } } = await supabase.auth.getUser()
                if (user?.id === profile.id) return
                await supabase.from('profile_views').insert({ profile_id: profile.id, visitor_id: user?.id || null })
            }
            recordView()
        }
    }, [profile?.id])

    const getAvatarUrl = (path: string | null) => {
        if (!path) return undefined
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const getLogoUrl = (path: string | null) => {
        if (!path) return null
        return supabase.storage.from('store-logos').getPublicUrl(path).data.publicUrl
    }

    const formatShortAddress = (addr: string) => {
        if (!addr) return ''
        const parts = addr.split(',')
        const street = parts[0]?.trim() || ''
        const num = parts[1]?.trim()?.split('-')[0] || ''
        const city = parts[2]?.trim()?.split('-')[0] || ''
        return `${street}${num ? `, ${num}` : ''}${city ? `, ${city}` : ''}`
    }

    const formatDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-')
        return `${day}/${month}/${year}`
    }

    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return profileProducts
        const query = searchQuery.toLowerCase()
        return profileProducts.filter(
            p =>
                p.name?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query)
        )
    }, [profileProducts, searchQuery])

    const groupedProducts = useMemo(() => {
        const groups: Record<string, any[]> = {}
        filteredProducts.forEach(product => {
            const cat = product.category || 'Geral'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(product)
        })
        return groups
    }, [filteredProducts])

    const handleProductClick = (product: any) => {
        if (isOwner) {
            router.push(`/${profileSlug}/editar-produto/${product.slug || product.id}`)
            return
        }
        const isPublication = product.listing_type === 'publication'
        if (isPublication) {
            router.push(`/${profileSlug}/produto/${product.slug || product.id}`)
            return
        }
        const alreadyInCart = cartItems.some((item: any) => item.product.id === product.id)
        if (alreadyInCart) return

        addItem(`profile_${profileSlug}`, { name: profile!.name, logo_url: profile!.avatar_url ?? null }, product)
        setCartAnimating(true)
        setTimeout(() => setCartAnimating(false), 500)
    }

    const ratingsStats = useMemo(() => {
        if (profileRatings.length === 0) return null
        const sum = profileRatings.reduce((acc, r) => acc + r.rating, 0)
        const avg = sum / profileRatings.length
        return { avg: avg.toFixed(1), count: profileRatings.length }
    }, [profileRatings])

    const whatsappLink = useMemo(() => {
        if (!profile?.whatsapp) return null
        return `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi seu perfil no iUser e tenho interesse nos seus produtos/serviços.`)}`
    }, [profile])

    // ===== ESTILOS CONSISTENTES =====
    const glassBg = 'rgba(255, 255, 255, 0.08)'
    const glassBgHover = 'rgba(255, 255, 255, 0.12)'
    const glassBgLight = 'rgba(255, 255, 255, 0.06)'
    const glassBorder = 'rgba(255, 255, 255, 0.12)'
    const glassBorderDashed = 'rgba(255, 255, 255, 0.1)'
    const textBlack = '#000000'
    const textGray = '#666666'
    const blurAmount = 'blur(20px)'

    const inputSearchStyle: React.CSSProperties = {
        background: glassBg,
        backdropFilter: blurAmount,
        WebkitBackdropFilter: blurAmount,
        borderColor: glassBorder,
        color: textBlack,
    }

    return (
        <main className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <style jsx global>{`
    @keyframes float {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-15px) rotate(5deg); }
    }
    @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4), 0 0 0 6px rgba(139, 92, 246, 0.1); }
        50% { box-shadow: 0 8px 24px rgba(139, 92, 246, 0.6), 0 0 0 12px rgba(139, 92, 246, 0); }
    }
    @keyframes pulse-status {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.03); opacity: 0.85; }
    }
    .animate-pulse-glow {
        animation: pulse-glow 2s ease-in-out infinite;
    }
    .animate-pulse-status {
        animation: pulse-status 2s ease-in-out infinite;
    }
    
    /* Todos os placeholders pretos */
    input::placeholder,
    textarea::placeholder {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        opacity: 1 !important;
    }
    input::-webkit-input-placeholder,
    textarea::-webkit-input-placeholder {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
    }
    input::-moz-placeholder,
    textarea::-moz-placeholder {
        color: #000000 !important;
        opacity: 1 !important;
    }
    input:-ms-input-placeholder,
    textarea:-ms-input-placeholder {
        color: #000000 !important;
    }
    input:-moz-placeholder,
    textarea:-moz-placeholder {
        color: #000000 !important;
        opacity: 1 !important;
    }
`}</style>

            <Header
                title="iUser"
                showBack={false}
                greeting={`Olá, ${profileLoading ? '...' : loggedUserSlug ? `@${loggedUserSlug}` : 'Visitante'}`}
                avatarUrl={loggedUserAvatarUrl}
                loading={loading || profileLoading}
                tabs={finalTabs}
                showSearch={false}
                searchPlaceholder="Buscar..."
                onSearch={() => { }}
                profileSlug={loggedUserSlug}
            />

            <div className="relative z-10 max-w-5xl mx-auto px-4 pt-8 pb-24">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                        <p className="text-sm font-bold mt-4 animate-pulse" style={{ color: colors.textSecondary }}>
                            Carregando...
                        </p>
                    </div>
                )}

                {!loading && profileNotFound && (
                    <div className="flex flex-col items-center text-center py-20">
                        <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Perfil não encontrado</h1>
                        <button onClick={() => router.push('/')} className="flex items-center gap-2 mt-4 font-bold hover:underline" style={{ color: colors.accent }}>
                            <ArrowLeft className="w-5 h-5" /> Voltar para o Início
                        </button>
                    </div>
                )}

                {!loading && profile && !editMode && (
                    <>
                        {/* Card do perfil */}
                        <div className="flex flex-col md:flex-row items-center gap-8 mb-8 p-6 rounded-3xl"
                            style={{
                                background: glassBg,
                                backdropFilter: blurAmount,
                                WebkitBackdropFilter: blurAmount,
                                border: `1px solid ${glassBorder}`,
                            }}>
                            <div className="relative flex-shrink-0">
                                <div className="w-32 h-32 md:w-44 md:h-44 rounded-full overflow-hidden p-1 shadow-xl animate-pulse-glow"
                                    style={{ background: glassBgLight }}>
                                    {profile.avatar_url ? (
                                        <img src={getAvatarUrl(profile.avatar_url)!} className="w-full h-full object-cover rounded-full" alt={profile.name} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-4xl font-black" style={{ color: colors.textSecondary }}>
                                            {profile.name?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                {isOwner && (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingAvatar}
                                        className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-50"
                                        style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.accentText }}
                                    >
                                        {uploadingAvatar ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Camera size={14} />
                                        )}
                                    </button>
                                )}
                                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" style={{ display: 'none' }} />
                            </div>

                            <div className="flex-1 text-center md:text-left space-y-3">
                                <h1 className="text-3xl md:text-5xl font-black italic" style={{ color: colors.textPrimary }}>{profile.name}</h1>
                                <div className="flex flex-wrap justify-center md:justify-start gap-2">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                                        style={{ background: `${colors.accent}22`, color: colors.accent }}>Verificado iUser</span>
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                                        style={{ background: glassBg, color: colors.textSecondary }}>/{profile.profileSlug}</span>
                                </div>

                                <div className="flex justify-center md:justify-start gap-8 pt-2">
                                    <div className="text-center">
                                        <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{followersCount}</p>
                                        <p className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Seguidores</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{followingCount}</p>
                                        <p className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Seguindo</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{totalProfileVisitors}</p>
                                        <p className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Visitas</p>
                                    </div>
                                </div>

                                {ratingsStats && (
                                    <div className="flex justify-center md:justify-start items-center gap-2 pt-1">
                                        <RatingStars value={parseFloat(ratingsStats.avg)} size={14} />
                                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{ratingsStats.avg}</span>
                                        <span className="text-xs" style={{ color: colors.textSecondary }}>({ratingsStats.count} avaliações)</span>
                                    </div>
                                )}

                                <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2">
                                    {currentUser?.id !== profile.id ? (
                                        <>
                                            <button onClick={handleFollowToggle}
                                                className={`px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${isFollowing ? 'border-2 hover:bg-white/10' : 'hover:scale-105 shadow-lg'}`}
                                                style={isFollowing ? { borderColor: colors.accent, color: colors.accent, background: 'transparent' } : { background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.accentText }}>
                                                {isFollowing ? 'Seguindo' : 'Seguir'}
                                            </button>
                                            {whatsappLink && (
                                                <a
                                                    href={whatsappLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all hover:scale-105 shadow-lg flex items-center gap-2"
                                                    style={{ background: '#25D366', color: '#fff' }}
                                                >
                                                    <MessageCircle size={16} />
                                                    WhatsApp
                                                </a>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {profile.address && !profile.address.toLowerCase().includes('rua tal') ? (
                                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                                                    style={{ background: glassBgLight }}>
                                                    <MapPin size={14} style={{ color: colors.accent }} />
                                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{formatShortAddress(profile.address)}</span>
                                                    <button onClick={toggleLocationVisibility}
                                                        className="ml-2 px-2 py-1 rounded-lg text-[10px] font-bold"
                                                        style={{ background: `${colors.accent}22`, color: colors.accent }}>
                                                        {profile.show_location ? 'Ocultar' : 'Mostrar'}
                                                    </button>
                                                    <button onClick={() => setShowLocationModal(true)} className="p-1 rounded-lg hover:bg-white/10">
                                                        <Pencil size={12} style={{ color: colors.accent }} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setShowLocationModal(true)}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase border border-dashed"
                                                    style={{ borderColor: glassBorder, color: colors.textSecondary }}>
                                                    <MapPinned size={14} /> Localização não definida
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setEditMode(true)}
                                                className="px-4 py-2 rounded-xl text-xs font-bold uppercase border"
                                                style={{ borderColor: glassBorder, color: colors.textSecondary, background: glassBgLight }}
                                            >
                                                <Pencil size={14} className="inline mr-1" /> Editar
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Lojas do perfil visitado */}
                        {stores.length > 0 && (
                            <div className="mb-8">
                                <h3 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: colors.accent }}>
                                    <StoreIcon size={16} /> Lojas
                                </h3>
                                <div className="flex overflow-x-auto gap-3 pb-4 snap-x snap-mandatory">
                                    {stores.map((store) => (
                                        <button key={store.id} onClick={() => router.push(`/${profileSlug}/${store.storeSlug}`)}
                                            className="flex-shrink-0 w-[140px] snap-start rounded-2xl p-3 flex flex-col items-center gap-2 hover:scale-105 transition-transform"
                                            style={{
                                                background: glassBg,
                                                backdropFilter: blurAmount,
                                                WebkitBackdropFilter: blurAmount,
                                                border: `1px solid ${glassBorder}`,
                                            }}>
                                            <div className="w-12 h-12 rounded-full overflow-hidden" style={{ background: glassBgLight }}>
                                                {store.logo_url ? (
                                                    <img src={getLogoUrl(store.logo_url)!} className="w-full h-full object-cover" alt={store.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: colors.textSecondary }}>
                                                        {store.name?.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-xs font-bold truncate w-full text-center" style={{ color: colors.textPrimary }}>/{store.storeSlug}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex justify-center mb-8">
                            <div className="rounded-3xl p-2 flex gap-2 shadow-lg overflow-x-auto"
                                style={{
                                    background: glassBg,
                                    backdropFilter: blurAmount,
                                    WebkitBackdropFilter: blurAmount,
                                    border: `1px solid ${glassBorder}`,
                                }}>
                                {[
                                    { id: 'produtos', label: 'Produtos', icon: ShoppingBag, count: profileProducts.length },
                                    { id: 'avaliacoes', label: 'Avaliações', icon: Star, count: profileRatings.length },
                                    { id: 'compras', label: 'Compras', icon: ShoppingBag, count: purchases.length },
                                    { id: 'agenda', label: 'Agenda', icon: CalendarDays, count: allAppointments.length },
                                ].map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id as ProfileTab)}
                                        className={`px-6 py-4 rounded-2xl flex items-center gap-3 transition-all flex-shrink-0 ${activeTab === tab.id ? 'text-white shadow-lg' : ''}`}
                                        style={activeTab === tab.id ? { background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` } : { color: colors.textSecondary, background: 'transparent' }}>
                                        <tab.icon size={18} />
                                        <span className="text-xs font-black uppercase hidden sm:inline">{tab.label}</span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: 'rgba(255,255,255,0.2)' }}>{tab.count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Conteúdo das abas */}
                        <div className="space-y-12">
                            {/* TAB PRODUTOS */}
                            {activeTab === 'produtos' && (
                                <>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: textBlack }} />
                                            <input
                                                type="text"
                                                placeholder="Buscar produtos..."
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                className="w-full border rounded-2xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 transition-all"
                                                style={inputSearchStyle}
                                            />
                                        </div>
                                        {isOwner && (
                                            <button
                                                onClick={() => router.push(`/${profileSlug}/criar-produto`)}
                                                className="flex items-center justify-center w-10 h-10 rounded-xl shadow-md hover:scale-110 transition-transform"
                                                style={{ background: colors.accent, color: colors.accentText }}
                                                title="Adicionar produto"
                                            >
                                                <Plus className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>

                                    {filteredProducts.length === 0 ? (
                                        isOwner ? (
                                            <div className="rounded-2xl p-6 flex flex-col items-center text-center gap-4"
                                                style={{
                                                    background: glassBg,
                                                    backdropFilter: blurAmount,
                                                    WebkitBackdropFilter: blurAmount,
                                                    border: `1px solid ${glassBorder}`,
                                                }}>
                                                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: glassBgLight }}>
                                                    <Store size={28} style={{ color: colors.accent }} />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Você ainda não tem produtos</h3>
                                                    <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                                        Adicione produtos ou serviços para começar a vender direto pelo seu perfil.
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => router.push(`/${profileSlug}/criar-produto`)}
                                                    className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:scale-105 transition"
                                                    style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.accentText }}
                                                >
                                                    <Plus size={18} className="inline mr-1" /> Adicionar Produto ou Serviço
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="py-16 text-center rounded-2xl border border-dashed flex flex-col items-center gap-3"
                                                style={{
                                                    background: glassBg,
                                                    backdropFilter: blurAmount,
                                                    WebkitBackdropFilter: blurAmount,
                                                    borderColor: glassBorderDashed,
                                                }}>
                                                <ShoppingBag className="w-12 h-12" style={{ color: colors.textSecondary }} />
                                                <p className="font-bold text-base" style={{ color: colors.textPrimary }}>Nenhum produto disponível</p>
                                                <p className="text-sm" style={{ color: colors.textSecondary }}>Este perfil ainda não publicou produtos.</p>
                                            </div>
                                        )
                                    ) : (
                                        Object.entries(groupedProducts).map(([category, products]) => (
                                            <div key={category} className="space-y-3">
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.25em] pl-1"
                                                    style={{ color: colors.accent }}>
                                                    {category}
                                                </h4>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {products.map(product => {
                                                        const isSelected = mounted && cartItems.some((item: any) => item.product.id === product.id)
                                                        const quantity = getProductQuantity(product.id)
                                                        const isHourly = product.price_type === 'hourly'
                                                        const isPublication = product.listing_type === 'publication'
                                                        const profileWhatsapp = profile?.whatsapp || null
                                                        const productWhatsappLink = isPublication && profileWhatsapp
                                                            ? `https://wa.me/${profileWhatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Tenho interesse no item "${product.name}" do seu perfil.`)}`
                                                            : '#'
                                                        const hasImage = !!product.image_url

                                                        // Estilo base do card
                                                        const cardBaseStyle: React.CSSProperties = {
                                                            background: glassBg,
                                                            backdropFilter: blurAmount,
                                                            WebkitBackdropFilter: blurAmount,
                                                            borderColor: isSelected && !isPublication ? '#22c55e' : isPublication ? '#10b981' : glassBorder,
                                                        }

                                                        if (!hasImage) {
                                                            return (
                                                                <div
                                                                    key={product.id}
                                                                    onClick={() => handleProductClick(product)}
                                                                    className={`col-span-2 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer ${isSelected && !isPublication ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-400/20' : ''}`}
                                                                    style={cardBaseStyle}
                                                                >
                                                                    <div className="p-4 flex flex-col justify-center min-w-0">
                                                                        <h4 className="text-sm font-bold line-clamp-1" style={{ color: colors.textPrimary }}>
                                                                            {product.name}
                                                                        </h4>
                                                                        <p className="text-[11px] line-clamp-1 mt-0.5 opacity-75" style={{ color: colors.textSecondary }}>
                                                                            {product.description || 'Sem descrição'}
                                                                        </p>
                                                                        <div className="mt-2">
                                                                            {isPublication ? (
                                                                                <p className="text-sm font-black text-green-600">Sob consulta</p>
                                                                            ) : (
                                                                                <div className="flex items-center">
                                                                                    <span className="text-base font-extrabold" style={{ color: colors.accent }}>
                                                                                        R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                                    </span>
                                                                                    {isHourly && <span className="text-[10px] ml-1 opacity-75">/h</span>}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="mt-3 flex justify-end items-center">
                                                                            {isOwner ? (
                                                                                <button
                                                                                    onClick={e => { e.stopPropagation(); router.push(`/${profileSlug}/editar-produto/${product.slug || product.id}`) }}
                                                                                    className="w-8 h-8 rounded-full flex items-center justify-center"
                                                                                    style={{ background: glassBg, color: colors.accent }}
                                                                                >
                                                                                    <ExternalLink className="w-4 h-4" />
                                                                                </button>
                                                                            ) : isPublication ? (
                                                                                <a
                                                                                    href={productWhatsappLink}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="w-full py-2 rounded-xl text-xs font-bold bg-green-500 text-white flex items-center justify-center gap-1 hover:bg-green-600 transition-colors"
                                                                                >
                                                                                    <MessageCircle size={14} />
                                                                                    Saber mais
                                                                                </a>
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
                                                                                    <span className="text-sm font-bold min-w-[20px] text-center" style={{ color: colors.textPrimary }}>{quantity}</span>
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
                                                                                    style={{ background: colors.accent }}
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
                                                                className={`relative rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer ${isSelected && !isPublication ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-400/20' : ''}`}
                                                                style={cardBaseStyle}
                                                            >
                                                                <div className="aspect-square relative overflow-hidden" style={{ background: glassBgLight }}>
                                                                    {product.image_url ? (
                                                                        <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-4xl font-black" style={{ color: colors.accent }}>
                                                                            {product.name?.charAt(0) || '?'}
                                                                        </div>
                                                                    )}
                                                                    {product.type && (
                                                                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase backdrop-blur-md"
                                                                            style={{ background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
                                                                            {product.type === 'physical' ? 'Físico' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                                        </span>
                                                                    )}
                                                                    {isPublication && (
                                                                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-green-500 text-white shadow-md">
                                                                            Divulgação
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
                                                                        {isPublication ? (
                                                                            <p className="text-sm font-black text-green-600">Sob consulta</p>
                                                                        ) : (
                                                                            <div className="flex items-center">
                                                                                <span className="text-base font-extrabold" style={{ color: colors.accent }}>
                                                                                    R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                                </span>
                                                                                {isHourly && <span className="text-[10px] ml-1 opacity-75">/h</span>}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="mt-3 flex justify-end items-center">
                                                                        {isOwner ? (
                                                                            <button
                                                                                onClick={e => { e.stopPropagation(); router.push(`/${profileSlug}/editar-produto/${product.slug || product.id}`) }}
                                                                                className="w-8 h-8 rounded-full flex items-center justify-center"
                                                                                style={{ background: glassBg, color: colors.accent }}
                                                                            >
                                                                                <ExternalLink className="w-4 h-4" />
                                                                            </button>
                                                                        ) : isPublication ? (
                                                                            <a
                                                                                href={productWhatsappLink}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className="w-full py-2 rounded-xl text-xs font-bold bg-green-500 text-white flex items-center justify-center gap-1 hover:bg-green-600 transition-colors"
                                                                            >
                                                                                <MessageCircle size={14} />
                                                                                Saber mais
                                                                            </a>
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
                                                                                <span className="text-sm font-bold min-w-[20px] text-center" style={{ color: colors.textPrimary }}>{quantity}</span>
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
                                                                                style={{ background: colors.accent }}
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

                            {/* TAB AVALIAÇÕES */}
                            {activeTab === 'avaliacoes' && (
                                <div className="space-y-4">
                                    {profileRatings.length === 0 ? (
                                        <div className="py-16 text-center rounded-2xl border border-dashed"
                                            style={{
                                                background: glassBg,
                                                backdropFilter: blurAmount,
                                                WebkitBackdropFilter: blurAmount,
                                                borderColor: glassBorderDashed,
                                            }}>
                                            <Star className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                            <p className="font-bold text-base" style={{ color: colors.textPrimary }}>Nenhuma avaliação ainda</p>
                                            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>Seja o primeiro a avaliar!</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {profileRatings.map((rating: any) => {
                                                const avatarUrl = getAvatarUrl(rating.profiles?.avatar_url)
                                                return (
                                                    <div key={rating.id} className="flex gap-3 p-4 rounded-2xl"
                                                        style={{
                                                            background: glassBg,
                                                            backdropFilter: blurAmount,
                                                            WebkitBackdropFilter: blurAmount,
                                                            border: `1px solid ${glassBorder}`,
                                                        }}>
                                                        <div className="w-10 h-10 rounded-2xl p-[2px] shrink-0" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                                                            <div className="w-full h-full rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                                                                {avatarUrl ? (
                                                                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <span className="font-bold text-sm" style={{ color: colors.accent }}>
                                                                        {(rating.profiles?.name || '?').slice(0, 1).toUpperCase()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>{rating.profiles?.name || 'Usuário'}</p>
                                                                    <p className="text-[10px] font-medium" style={{ color: colors.accent }}>
                                                                        {new Date(rating.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: glassBg, color: colors.accent }}>
                                                                    <Shield className="w-3 h-3" />
                                                                    <span className="text-[9px] font-black uppercase">Verificada</span>
                                                                </div>
                                                            </div>
                                                            <div className="mt-1.5">
                                                                <RatingStars value={rating.rating} size={14} />
                                                                {!rating.is_anonymous && rating.products?.name && (
                                                                    <span className="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style={{ background: glassBgLight, color: colors.accent }}>
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

                            {/* TAB COMPRAS */}
                            {activeTab === 'compras' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {purchases.length === 0 ? (
                                        <div className="col-span-full py-24 text-center rounded-3xl border border-dashed"
                                            style={{
                                                background: glassBg,
                                                backdropFilter: blurAmount,
                                                WebkitBackdropFilter: blurAmount,
                                                borderColor: glassBorderDashed,
                                            }}>
                                            <ShoppingBag className="w-16 h-16 mx-auto mb-6" style={{ color: colors.textSecondary }} />
                                            <p className="font-bold uppercase" style={{ color: colors.textSecondary }}>Ainda não realizou compras</p>
                                        </div>
                                    ) : (
                                        purchases.map((purchase) => (
                                            <div key={purchase.id}
                                                onClick={() => router.push(`/${purchase.stores?.storeSlug ? profileSlug + '/' + purchase.stores.storeSlug : ''}`)}
                                                className="group rounded-3xl p-6 flex items-center gap-5 hover:shadow-lg transition cursor-pointer"
                                                style={{
                                                    background: glassBg,
                                                    backdropFilter: blurAmount,
                                                    WebkitBackdropFilter: blurAmount,
                                                    border: `1px solid ${glassBorder}`,
                                                }}>
                                                <div className="w-16 h-16 rounded-2xl overflow-hidden" style={{ background: glassBgLight }}>
                                                    {purchase.stores?.logo_url ? (
                                                        <img src={getLogoUrl(purchase.stores.logo_url)!} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: colors.textSecondary }}>
                                                            {purchase.stores?.name?.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-black uppercase mb-1" style={{ color: colors.accent }}>Cliente desta Loja</p>
                                                    <h3 className="text-xl font-black truncate" style={{ color: colors.textPrimary }}>{purchase.stores?.name}</h3>
                                                    <p className="text-xs font-bold mt-1" style={{ color: colors.textSecondary }}>/{purchase.stores?.storeSlug}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* TAB AGENDA */}
                            {activeTab === 'agenda' && (
                                <div className="space-y-8">
                                    {isOwner && appointmentsToday.length > 0 && (
                                        <div className="w-full space-y-4">
                                            <div className="flex items-center gap-4 px-2">
                                                <div className="h-px flex-1" style={{ background: glassBorder }} />
                                                <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: colors.accent }}>
                                                    <CalendarDays size={16} /> Agenda de Hoje
                                                </h3>
                                                <div className="h-px flex-1" style={{ background: glassBorder }} />
                                            </div>
                                            <div className="flex overflow-x-auto pb-4 gap-4 snap-x">
                                                {appointmentsToday.map((appt, i) => (
                                                    <div key={appt.id || i}
                                                        onClick={() => appt.profiles?.profileSlug && router.push(`/${appt.profiles.profileSlug}`)}
                                                        className="flex-shrink-0 w-[240px] snap-start rounded-3xl p-5 flex items-center gap-4 hover:shadow-lg transition cursor-pointer"
                                                        style={{
                                                            background: glassBg,
                                                            backdropFilter: blurAmount,
                                                            WebkitBackdropFilter: blurAmount,
                                                            border: `1px solid ${glassBorder}`,
                                                        }}>
                                                        <div className="w-12 h-12 rounded-2xl overflow-hidden" style={{ background: glassBgLight }}>
                                                            {appt.profiles?.avatar_url ? (
                                                                <img src={getAvatarUrl(appt.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-xs font-black" style={{ color: colors.accent }}>
                                                                    {appt.profiles?.name?.charAt(0) || 'U'}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold" style={{ color: colors.accent }}>{appt.time}</p>
                                                            <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{appt.profiles?.name || 'Cliente'}</p>
                                                            <p className="text-xs font-bold truncate" style={{ color: colors.textSecondary }}>{appt.service_name || 'Agendamento'}</p>
                                                        </div>
                                                        <Clock className="w-4 h-4" style={{ color: colors.textSecondary }} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {isOwner && appointmentsToday.length === 0 && (
                                        <div className="w-full">
                                            <div className="rounded-3xl p-6 text-center border border-dashed"
                                                style={{
                                                    background: glassBg,
                                                    backdropFilter: blurAmount,
                                                    WebkitBackdropFilter: blurAmount,
                                                    borderColor: glassBorderDashed,
                                                }}>
                                                <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                                <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Você não tem agendamentos para hoje.</p>
                                            </div>
                                        </div>
                                    )}

                                    {allAppointments.length === 0 ? (
                                        <div className="py-24 text-center rounded-3xl border border-dashed"
                                            style={{
                                                background: glassBg,
                                                backdropFilter: blurAmount,
                                                WebkitBackdropFilter: blurAmount,
                                                borderColor: glassBorderDashed,
                                            }}>
                                            <Calendar className="w-16 h-16 mx-auto mb-6" style={{ color: colors.textSecondary }} />
                                            <p className="font-bold uppercase" style={{ color: colors.textSecondary }}>Nenhum compromisso na agenda</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {allAppointments.map((appt) => (
                                                <div key={appt.id}
                                                    className="rounded-3xl p-6 flex gap-5 items-center hover:shadow-lg transition"
                                                    style={{
                                                        background: glassBg,
                                                        backdropFilter: blurAmount,
                                                        WebkitBackdropFilter: blurAmount,
                                                        border: `1px solid ${glassBorder}`,
                                                    }}>
                                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: glassBgLight }}>
                                                        <CalendarDays size={28} style={{ color: colors.textSecondary }} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 text-xs font-black mb-1" style={{ color: colors.accent }}>
                                                            <Calendar size={12} />{formatDate(appt.date)}
                                                            <span style={{ color: colors.textSecondary }}>|</span>
                                                            <Clock size={12} />{appt.time}
                                                        </div>
                                                        <h3 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>{appt.service_name}</h3>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="w-5 h-5 rounded-full overflow-hidden" style={{ background: glassBgLight }}>
                                                                {appt.profiles?.avatar_url ? (
                                                                    <img src={getAvatarUrl(appt.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-[8px] font-black" style={{ color: colors.textSecondary }}>
                                                                        {appt.profiles?.name?.charAt(0) || 'C'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <p className="text-xs font-bold" style={{ color: colors.textSecondary }}>{appt.profiles?.name || 'Cliente'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Modo Edição */}
                {!loading && profile && editMode && (
                    <EditarPerfil
                        profile={profile}
                        onUpdate={(updated: any) => {
                            setProfile(updated)
                        }}
                        onClose={() => setEditMode(false)}
                    />
                )}
            </div>

            {/* Botões flutuantes */}
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
                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                        color: colors.accentText,
                        border: `2px solid ${glassBorder}`,
                        boxShadow: `0 8px 24px ${colors.accent}60`,
                    }}
                    aria-label="Voltar ao início"
                >
                    <Home size={24} />
                </button>
            </div>

            {/* Modal de Localização */}
            {showLocationModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="w-full max-w-xl rounded-3xl p-8 shadow-2xl space-y-6"
                        style={{
                            background: glassBg,
                            backdropFilter: blurAmount,
                            WebkitBackdropFilter: blurAmount,
                            border: `1px solid ${glassBorder}`,
                        }}>
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Sua Localidade</h2>
                            <button onClick={() => setShowLocationModal(false)} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition" style={{ background: glassBgLight }}>
                                <X className="w-5 h-5" style={{ color: colors.textSecondary }} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Digite seu endereço"
                                value={manualAddress}
                                onChange={(e) => setManualAddress(e.target.value)}
                                className="w-full rounded-xl py-4 px-5 text-sm font-bold focus:outline-none transition"
                                style={{
                                    background: glassBgLight,
                                    border: `1px solid ${glassBorder}`,
                                    color: textBlack,
                                }}
                            />
                            {suggestions.length > 0 && (
                                <div className="rounded-2xl overflow-hidden shadow-lg"
                                    style={{
                                        background: glassBg,
                                        backdropFilter: blurAmount,
                                        WebkitBackdropFilter: blurAmount,
                                        border: `1px solid ${glassBorder}`,
                                    }}>
                                    {suggestions.map((s, i) => (
                                        <div key={i} onClick={() => selectSuggestion(s)} className="p-4 hover:bg-white/10 cursor-pointer" style={{ borderBottom: `1px solid ${glassBorderDashed}` }}>
                                            <p className="text-xs font-bold mb-1" style={{ color: colors.textSecondary }}>Sugestão</p>
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{s.place_name}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button onClick={saveLocation} disabled={!tempAddress}
                                className="w-full py-4 rounded-xl font-black uppercase text-sm tracking-widest shadow-lg hover:scale-105 transition disabled:opacity-50"
                                style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.accentText }}>
                                Confirmar Endereço
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}