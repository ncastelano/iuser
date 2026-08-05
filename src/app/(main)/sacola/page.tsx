// src/app/(app)/sacola/page.tsx
'use client'

import { useCartStore } from '@/store/useCartStore'
import { useRouter } from 'next/navigation'
import {
    Store,
    ChevronRight,
    Trash2,
    CheckCircle2,
    Minus,
    Plus,
    Eye,
    EyeOff,
    Package,
    ShoppingBag,
    MapPin,
    ArrowLeft,
    Home,
    Star,
    Truck,
    QrCode,
    CreditCard,
    Banknote,
    X,
    Navigation,
    Search,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ReviewModal } from '@/components/ratings/ReviewModal'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ----- Tipagem para dados de entrega -----
interface StoreDeliveryInfo {
    delivery_type: string | null
    delivery_fee: number | null
    delivery_fee_per_km: number | null
    delivery_base_distance: number | null
    delivery_base_fee: number | null
    store_lat: number | null
    store_lng: number | null
}

// ----- Haversine (distância em km) -----
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ----- Geocodificação -----
async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; address: string } | null> {
    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (!token) return null
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=BR`
        )
        const data = await res.json()
        if (data?.features?.length > 0) {
            const [lng, lat] = data.features[0].center
            return {
                lat,
                lng,
                address: data.features[0].place_name || query
            }
        }
        return null
    } catch {
        return null
    }
}

export default function SacolaPage() {
    const {
        itemsByStore,
        storeDetails,
        updateQuantity,
        removeItem,
        clearStoreCart,
        loadFromSupabase,
        syncToSupabase,
    } = useCartStore()

    const router = useRouter()
    const { colors } = useTheme()
    const { bgMode, customBgUrl } = useProfile()

    const [mounted, setMounted] = useState(false)
    const [globalLoading, setGlobalLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [userAddress, setUserAddress] = useState<string | null>(null)

    // ===== ESTADO PARA LOCALIZAÇÃO DE ENTREGA (por loja) =====
    const [deliveryLocationByStore, setDeliveryLocationByStore] = useState<Record<string, {
        address: string
        lat: number
        lng: number
        isSaved: boolean
    }>>({})

    // ===== MODAL DE SELECIONAR LOCAL =====
    const [showLocationModal, setShowLocationModal] = useState(false)
    const [locationModalStore, setLocationModalStore] = useState<string | null>(null)
    const [locationSearchQuery, setLocationSearchQuery] = useState('')
    const [locationSuggestions, setLocationSuggestions] = useState<any[]>([])
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null)
    const [isSearchingLocation, setIsSearchingLocation] = useState(false)

    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
    const [myPurchases, setMyPurchases] = useState<any[]>([])
    const [addressInput, setAddressInput] = useState('')
    const [isEditingAddress, setIsEditingAddress] = useState(false)
    const [finishedOrders, setFinishedOrders] = useState<any[]>([])

    const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
    const [authEmail, setAuthEmail] = useState('')
    const [authPassword, setAuthPassword] = useState('')
    const [authConfirmPassword, setAuthConfirmPassword] = useState('')
    const [authName, setAuthName] = useState('')
    const [authProfileSlug, setAuthProfileSlug] = useState('')
    const [authLoading, setAuthLoading] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null)
    const slugTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const [reviewOrder, setReviewOrder] = useState({
        isOpen: false,
        orderId: '',
        productId: '',
        productName: '',
        storeId: '',
    })

    const [pendingReviews, setPendingReviews] = useState<any[]>([])
    const [userReviews, setUserReviews] = useState<any[]>([])
    const [pendingProductDetails, setPendingProductDetails] = useState<Record<string, { image_url?: string; price?: number }>>({})
    const [loadingPendingReviews, setLoadingPendingReviews] = useState(false)

    // Configurações individuais por loja
    const [storeConfigs, setStoreConfigs] = useState<Record<string, {
        accepts_delivery: boolean
        accepts_pickup: boolean
        accepts_pix: boolean
        accepts_card: boolean
        accepts_cash: boolean
    }>>({})

    // Opções selecionadas por loja
    const [deliveryOptionByStore, setDeliveryOptionByStore] = useState<Record<string, 'entrega' | 'retirada'>>({})
    const [paymentMethodByStore, setPaymentMethodByStore] = useState<Record<string, 'pix' | 'cartao' | 'dinheiro'>>({})

    // Cache dos dados de entrega da loja
    const [storeDeliveryInfo, setStoreDeliveryInfo] = useState<Record<string, StoreDeliveryInfo>>({})

    // ===== ESTADO DA TAB ATIVA =====
    const [activeTab, setActiveTab] = useState<string>('carrinho')

    // ===== FUNÇÃO PARA SALVAR LOCALIZAÇÃO NO LOCALSTORAGE =====
    const saveDeliveryLocationToStorage = useCallback((slug: string, location: {
        address: string
        lat: number
        lng: number
        isSaved: boolean
    }) => {
        try {
            const key = `delivery_location_${currentUserId}_${slug}`
            localStorage.setItem(key, JSON.stringify(location))
        } catch (e) {
            console.error('Erro ao salvar localização:', e)
        }
    }, [currentUserId])

    // ===== FUNÇÃO PARA CARREGAR LOCALIZAÇÃO DO LOCALSTORAGE =====
    const loadDeliveryLocationFromStorage = useCallback((slug: string) => {
        try {
            const key = `delivery_location_${currentUserId}_${slug}`
            const saved = localStorage.getItem(key)
            if (saved) {
                return JSON.parse(saved)
            }
            return null
        } catch (e) {
            console.error('Erro ao carregar localização:', e)
            return null
        }
    }, [currentUserId])

    // ===== FUNÇÃO PARA REMOVER LOCALIZAÇÃO DO LOCALSTORAGE =====
    const removeDeliveryLocationFromStorage = useCallback((slug: string) => {
        try {
            const key = `delivery_location_${currentUserId}_${slug}`
            localStorage.removeItem(key)
        } catch (e) {
            console.error('Erro ao remover localização:', e)
        }
    }, [currentUserId])

    // ----- Funções auxiliares -----
    const fetchPendingReviews = useCallback(async (userId: string) => {
        setLoadingPendingReviews(true)
        try {
            const { data: orderItemsRaw } = await supabase
                .from('orders')
                .select('id, checkout_id, store_id, created_at, order_items(product_id, product_name, total_price)')
                .eq('buyer_id', userId)
                .eq('status', 'paid')

            const allPaidItems: any[] = []
            orderItemsRaw?.forEach((order) => {
                order.order_items?.forEach((item: any) => {
                    allPaidItems.push({
                        id: item.product_id,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        store_id: order.store_id,
                        checkout_id: order.checkout_id,
                        price: item.total_price,
                        created_at: order.created_at,
                    })
                })
            })

            const { data: reviews } = await supabase
                .from('product_reviews')
                .select('product_id')
                .eq('profile_id', userId)

            const reviewedProductIds = new Set(reviews?.map((r) => r.product_id) || [])

            const pending = allPaidItems.filter((item) => !reviewedProductIds.has(item.product_id))
            const uniquePending = Array.from(new Map(pending.map((item) => [item.product_id, item])).values())

            setPendingReviews(uniquePending)

            const productIds = uniquePending.map((p) => p.product_id)
            if (productIds.length > 0) {
                const { data: products } = await supabase
                    .from('products')
                    .select('id, image_url, price')
                    .in('id', productIds)
                const details: Record<string, { image_url?: string; price?: number }> = {}
                products?.forEach((prod) => {
                    details[prod.id] = {
                        image_url: prod.image_url,
                        price: prod.price,
                    }
                })
                setPendingProductDetails(details)
            }
        } catch (err) {
            console.error('Erro ao buscar avaliações pendentes:', err)
        } finally {
            setLoadingPendingReviews(false)
        }
    }, [supabase])

    const fetchUserReviews = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('product_reviews')
                .select('id, rating, comment, created_at, product_id, products(name, price, image_url)')
                .eq('profile_id', userId)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Erro ao buscar avaliações:', error)
                return
            }

            const mapped = (data || []).map((review: any) => ({
                id: review.id,
                rating: review.rating,
                comment: review.comment,
                created_at: review.created_at,
                product_id: review.product_id,
                product_name: review.products?.name || 'Produto',
                product_price: review.products?.price || 0,
                product_image_url: review.products?.image_url || null,
            }))

            setUserReviews(mapped)
        } catch (err) {
            console.error('Erro ao buscar avaliações:', err)
        }
    }, [supabase])

    const loadUserData = useCallback(
        async (userId: string) => {
            setCurrentUserId(userId)

            const { data: profile } = await supabase
                .from('profiles')
                .select('profileSlug, avatar_url, name, address, store_lat, store_lng')
                .eq('id', userId)
                .single()

            if (profile) {
                setCurrentUserSlug(profile.profileSlug)
                setCurrentUserAvatar(profile.avatar_url)
                setCurrentUserName(profile.name)
                setUserAddress(profile.address)
                if (profile.address) setAddressInput(profile.address)
                if (profile.store_lat && profile.store_lng) {
                    setUserLocation({ lat: profile.store_lat, lng: profile.store_lng })
                }
            }

            const { data: ordersData } = await supabase
                .from('orders')
                .select(`
                    *,
                    order_items (*),
                    stores:store_id ( name )
                `)
                .eq('buyer_id', userId)
                .order('created_at', { ascending: false })

            let allPurchases: any[] = []

            if (ordersData) {
                allPurchases = ordersData.flatMap((o: any) => {
                    return o.order_items.map((i: any) => ({
                        id: i.id,
                        product_id: i.product_id,
                        product_name: i.product_name,
                        quantity: i.quantity,
                        price: i.total_price,
                        created_at: o.created_at,
                        status: o.status,
                        checkout_id: o.checkout_id,
                        buyer_id: o.buyer_id,
                        buyer_name: o.buyer_name,
                        buyer_profile_slug: o.buyer_profile_slug,
                        store_id: o.store_id,
                        store_name: o.stores?.name || 'Loja',
                        delivery_fee: Number(o.delivery_fee || 0),
                        delivery_address: o.delivery_address,
                        delivery_option: o.delivery_option,
                        payment_method: o.payment_method,
                    }))
                })
            }

            setMyPurchases(allPurchases)

            setFinishedOrders((prev) => {
                if (prev.length === 0) return prev
                return prev.map((order) => {
                    const updated = allPurchases.find(
                        (p) => p.checkout_id === order.checkout_id
                    )
                    if (updated) return { ...order, status: updated.status }
                    return order
                }).filter(Boolean)
            })

            await fetchPendingReviews(userId)
            await fetchUserReviews(userId)
        },
        [supabase, fetchPendingReviews, fetchUserReviews]
    )

    useEffect(() => {
        setMounted(true)
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                await loadUserData(user.id)
            }
            setGlobalLoading(false)
        }
        checkUser()
    }, [supabase, loadUserData])

    useEffect(() => {
        if (!currentUserId) return
        const localItems = useCartStore.getState().itemsByStore
        const localDetails = useCartStore.getState().storeDetails

        loadFromSupabase(currentUserId).then(() => {
            const state = useCartStore.getState()
            let changed = false
            for (const slug of Object.keys(localItems)) {
                const localStoreItems = localItems[slug]
                const currentStoreItems = state.itemsByStore[slug] || []
                for (const localItem of localStoreItems) {
                    const exists = currentStoreItems.some(
                        (item) => item.product.id === localItem.product.id
                    )
                    if (!exists) {
                        state.addItem(slug, localDetails[slug] || { name: '', logo_url: null }, localItem.product)
                        state.updateQuantity(slug, localItem.product.id, localItem.quantity - 1)
                        changed = true
                    }
                }
            }
            if (changed) {
                syncToSupabase(currentUserId)
            }
        })
    }, [currentUserId, loadFromSupabase, syncToSupabase])

    useEffect(() => {
        if (!currentUserId) return
        const timer = setTimeout(() => {
            syncToSupabase(currentUserId)
        }, 500)
        return () => clearTimeout(timer)
    }, [itemsByStore, currentUserId, syncToSupabase])

    useEffect(() => {
        if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current)
        if (authProfileSlug.length < 3) {
            setIsSlugAvailable(null)
            return
        }
        slugTimeoutRef.current = setTimeout(async () => {
            const { data } = await supabase
                .from('profiles')
                .select('profileSlug')
                .eq('profileSlug', authProfileSlug)
                .single()
            setIsSlugAvailable(!data)
        }, 500)
        return () => {
            if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current)
        }
    }, [authProfileSlug, supabase])

    // Listener em tempo real
    useEffect(() => {
        if (!currentUserId) return
        const channel = supabase
            .channel(`buyer-status-${currentUserId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders', filter: `buyer_id=eq.${currentUserId}` },
                (payload) => {
                    const newStatus = payload.new.status
                    const checkoutId = payload.new.checkout_id
                    setMyPurchases((prev) => {
                        const existing = prev.find((p) => p.checkout_id === checkoutId)
                        if (!existing) return prev
                        if (existing.status !== newStatus) {
                            if (newStatus === 'preparing') toast.info('👨‍🍳 O lojista começou a preparar seu pedido!')
                            if (newStatus === 'ready') toast.success('✅ Seu pedido está pronto!')
                            if (newStatus === 'paid') toast.success('🎉 Pedido finalizado com sucesso!')
                            if (newStatus === 'rejected') toast.error('❌ Seu pedido foi recusado pelo lojista.')
                        }
                        return prev.map((p) =>
                            p.checkout_id === checkoutId ? { ...p, status: newStatus } : p
                        )
                    })
                    setFinishedOrders((prev) => {
                        const hasMatch = prev.some(
                            (o) => o.checkout_id === checkoutId || o.id === payload.new.id
                        )
                        if (!hasMatch) return prev
                        return prev.map((o) =>
                            o.checkout_id === checkoutId || o.id === payload.new.id
                                ? { ...o, status: newStatus }
                                : o
                        )
                    })
                }
            )
            .subscribe()
        const interval = setInterval(() => loadUserData(currentUserId), 8000)
        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [currentUserId, supabase, loadUserData])

    // Busca configurações das lojas do carrinho
    useEffect(() => {
        const storeSlugs = Object.keys(itemsByStore)
        if (storeSlugs.length === 0) {
            setStoreConfigs({})
            setDeliveryOptionByStore({})
            setPaymentMethodByStore({})
            setStoreDeliveryInfo({})
            return
        }

        const fetchConfigs = async () => {
            const { data } = await supabase
                .from('stores')
                .select('storeSlug, accepts_delivery, accepts_pickup, accepts_pix, accepts_card, accepts_cash, delivery_type, delivery_fee, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, store_lat, store_lng')
                .in('storeSlug', storeSlugs)

            if (data) {
                const configs: Record<string, any> = {}
                const defaultDelivery: Record<string, 'entrega' | 'retirada'> = {}
                const defaultPayment: Record<string, 'pix' | 'cartao' | 'dinheiro'> = {}
                const deliveryInfo: Record<string, any> = {}

                data.forEach(s => {
                    configs[s.storeSlug] = {
                        accepts_delivery: s.accepts_delivery,
                        accepts_pickup: s.accepts_pickup,
                        accepts_pix: s.accepts_pix,
                        accepts_card: s.accepts_card,
                        accepts_cash: s.accepts_cash,
                    }

                    deliveryInfo[s.storeSlug] = {
                        delivery_type: s.delivery_type,
                        delivery_fee: s.delivery_fee,
                        delivery_fee_per_km: s.delivery_fee_per_km,
                        delivery_base_distance: s.delivery_base_distance,
                        delivery_base_fee: s.delivery_base_fee,
                        store_lat: s.store_lat,
                        store_lng: s.store_lng,
                    }

                    if (s.accepts_delivery) {
                        defaultDelivery[s.storeSlug] = 'entrega'
                    } else if (s.accepts_pickup) {
                        defaultDelivery[s.storeSlug] = 'retirada'
                    }

                    if (s.accepts_pix) defaultPayment[s.storeSlug] = 'pix'
                    else if (s.accepts_card) defaultPayment[s.storeSlug] = 'cartao'
                    else if (s.accepts_cash) defaultPayment[s.storeSlug] = 'dinheiro'
                })

                setStoreConfigs(configs)
                setDeliveryOptionByStore(prev => ({ ...defaultDelivery, ...prev }))
                setPaymentMethodByStore(prev => ({ ...defaultPayment, ...prev }))
                setStoreDeliveryInfo(deliveryInfo)

                // Inicializa localização de entrega com localStorage
                const initialLocation = userLocation
                if (initialLocation && userAddress) {
                    storeSlugs.forEach(slug => {
                        // Verifica se já tem uma localização salva no localStorage
                        const saved = loadDeliveryLocationFromStorage(slug)
                        if (saved) {
                            setDeliveryLocationByStore(prev => ({
                                ...prev,
                                [slug]: saved
                            }))
                        } else {
                            setDeliveryLocationByStore(prev => ({
                                ...prev,
                                [slug]: {
                                    address: userAddress || '',
                                    lat: initialLocation.lat,
                                    lng: initialLocation.lng,
                                    isSaved: true,
                                }
                            }))
                        }
                    })
                }
            }
        }
        fetchConfigs()
    }, [itemsByStore, userLocation, userAddress, loadDeliveryLocationFromStorage])

    // Recarrega pendentes e avaliações quando o modal de review é fechado
    useEffect(() => {
        if (!reviewOrder.isOpen && currentUserId) {
            fetchPendingReviews(currentUserId)
            fetchUserReviews(currentUserId)
        }
    }, [reviewOrder.isOpen, currentUserId, fetchPendingReviews, fetchUserReviews])

    // ===== FUNÇÃO PARA CALCULAR TOTAIS COM LOCALIZAÇÃO PERSONALIZADA =====
    const getStoreTotals = (slug: string) => {
        const items = itemsByStore[slug] || []
        const itemsTotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
        const deliveryOpt = deliveryOptionByStore[slug] || 'retirada'
        let deliveryFee = 0
        let isCalculating = false

        if (deliveryOpt === 'entrega') {
            const info = storeDeliveryInfo[slug]
            const deliveryLoc = deliveryLocationByStore[slug]

            if (info && deliveryLoc) {
                if (info.delivery_type === 'fixed') {
                    deliveryFee = Number(info.delivery_fee) || 0
                } else if (info.delivery_type === 'distance') {
                    const feePerKm = Number(info.delivery_fee_per_km) || 0
                    const storeLat = info.store_lat
                    const storeLng = info.store_lng
                    const userLat = deliveryLoc.lat
                    const userLng = deliveryLoc.lng

                    if (storeLat != null && storeLng != null && userLat != null && userLng != null) {
                        const dist = getDistanceKm(storeLat, storeLng, userLat, userLng)
                        if (info.delivery_base_distance != null && info.delivery_base_fee != null) {
                            const baseDist = Number(info.delivery_base_distance) || 0
                            const baseFee = Number(info.delivery_base_fee) || 0
                            if (dist <= baseDist) {
                                deliveryFee = baseFee
                            } else {
                                const extraKm = dist - baseDist
                                deliveryFee = baseFee + (extraKm * feePerKm)
                            }
                        } else {
                            deliveryFee = dist * feePerKm
                        }
                        isCalculating = false
                    } else {
                        isCalculating = true
                        deliveryFee = 0
                    }
                }
            } else {
                isCalculating = true
                deliveryFee = 0
            }
        }

        const finalTotal = isCalculating ? itemsTotal : itemsTotal + deliveryFee
        return { itemsTotal, deliveryFee, finalTotal, isCalculating }
    }

    // ===== FUNÇÃO PARA ABRIR MODAL DE LOCALIZAÇÃO =====
    const openLocationModal = (slug: string) => {
        setLocationModalStore(slug)

        // Primeiro verifica se tem no estado
        let current = deliveryLocationByStore[slug]

        // Se não tiver no estado, tenta carregar do localStorage
        if (!current) {
            const saved = loadDeliveryLocationFromStorage(slug)
            if (saved) {
                current = saved
                // Atualiza o estado com o valor do localStorage
                setDeliveryLocationByStore(prev => ({
                    ...prev,
                    [slug]: saved
                }))
            }
        }

        setLocationSearchQuery(current?.address || userAddress || '')
        setSelectedLocation(current ? {
            lat: current.lat,
            lng: current.lng,
            address: current.address
        } : userLocation ? {
            lat: userLocation.lat,
            lng: userLocation.lng,
            address: userAddress || ''
        } : null)
        setLocationSuggestions([])
        setShowLocationModal(true)
    }

    // ===== FUNÇÃO PARA BUSCAR ENDEREÇO =====
    const searchLocation = async () => {
        if (!locationSearchQuery.trim()) return
        setIsSearchingLocation(true)
        const result = await geocodeAddress(locationSearchQuery.trim())
        setIsSearchingLocation(false)

        if (result) {
            setSelectedLocation(result)
            setLocationSuggestions([])
        } else {
            toast.error('Endereço não encontrado')
        }
    }

    // ===== FUNÇÃO PARA CONFIRMAR LOCALIZAÇÃO =====
    const confirmLocation = () => {
        if (!selectedLocation || !locationModalStore) return

        const locationData = {
            address: selectedLocation.address,
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
            isSaved: false,
        }

        setDeliveryLocationByStore(prev => ({
            ...prev,
            [locationModalStore!]: locationData
        }))

        // Salva no localStorage
        saveDeliveryLocationToStorage(locationModalStore, locationData)

        setShowLocationModal(false)
        setLocationModalStore(null)
        toast.success('Localização de entrega atualizada!')
    }

    // ===== FUNÇÃO PARA USAR LOCAL SALVO =====
    const useSavedLocation = (slug: string) => {
        if (userLocation && userAddress) {
            const locationData = {
                address: userAddress,
                lat: userLocation.lat,
                lng: userLocation.lng,
                isSaved: true,
            }

            setDeliveryLocationByStore(prev => ({
                ...prev,
                [slug]: locationData
            }))

            // Remove do localStorage se existir (pois está usando o salvo do perfil)
            removeDeliveryLocationFromStorage(slug)

            toast.success('Usando localização salva do perfil')
        }
    }

    // ---- Handler de finalização por loja ----
    const handleFinalizarLoja = async (slug: string) => {
        if (!currentUserId) return
        setCheckoutLoading(slug)

        try {
            const items = itemsByStore[slug]
            const details = storeDetails[slug]
            const deliveryLoc = deliveryLocationByStore[slug]

            const { data: storeDeliveryData } = await supabase
                .from('stores')
                .select('delivery_type, delivery_fee, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, store_lat, store_lng')
                .eq('storeSlug', slug)
                .single()

            const deliveryInfo: StoreDeliveryInfo = storeDeliveryData || {
                delivery_type: null,
                delivery_fee: null,
                delivery_fee_per_km: null,
                delivery_base_distance: null,
                delivery_base_fee: null,
                store_lat: null,
                store_lng: null,
            }

            const itemsTotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)

            const { data: storeData } = await supabase
                .from('stores')
                .select('id, owner_id, whatsapp, storeSlug')
                .eq('storeSlug', slug)
                .single()

            if (!storeData) {
                toast.error('Loja não encontrada')
                setCheckoutLoading(null)
                return
            }

            const deliveryOpt = deliveryOptionByStore[slug] || 'retirada'
            const paymentOpt = paymentMethodByStore[slug] || 'pix'

            if (deliveryOpt === 'entrega') {
                if (!deliveryLoc) {
                    toast.error('Selecione um endereço de entrega')
                    setCheckoutLoading(null)
                    return
                }
                if (!deliveryLoc.address.trim()) {
                    toast.error('Informe o endereço de entrega.')
                    setCheckoutLoading(null)
                    return
                }
            }

            const address = deliveryOpt === 'entrega' ? deliveryLoc?.address || '' : 'Retirada no local'

            let deliveryLat: number | null = null
            let deliveryLng: number | null = null
            if (deliveryOpt === 'entrega' && deliveryLoc) {
                deliveryLat = deliveryLoc.lat
                deliveryLng = deliveryLoc.lng
            }

            let deliveryFee = 0
            if (deliveryOpt === 'entrega' && deliveryLoc) {
                const dtype = deliveryInfo.delivery_type
                if (dtype === 'fixed') {
                    deliveryFee = Number(deliveryInfo.delivery_fee) || 0
                } else if (dtype === 'distance') {
                    const feePerKm = Number(deliveryInfo.delivery_fee_per_km) || 0
                    const storeLat = deliveryInfo.store_lat
                    const storeLng = deliveryInfo.store_lng
                    if (storeLat != null && storeLng != null && deliveryLat != null && deliveryLng != null) {
                        const dist = getDistanceKm(storeLat, storeLng, deliveryLat, deliveryLng)
                        if (deliveryInfo.delivery_base_distance != null && deliveryInfo.delivery_base_fee != null) {
                            const baseDist = Number(deliveryInfo.delivery_base_distance) || 0
                            const baseFee = Number(deliveryInfo.delivery_base_fee) || 0
                            if (dist <= baseDist) {
                                deliveryFee = baseFee
                            } else {
                                const extraKm = dist - baseDist
                                deliveryFee = baseFee + (extraKm * feePerKm)
                            }
                        } else {
                            deliveryFee = dist * feePerKm
                        }
                    } else {
                        toast.error('Não foi possível calcular a distância.')
                        setCheckoutLoading(null)
                        return
                    }
                }
            }

            const finalTotal = itemsTotal + deliveryFee
            const checkout_id = crypto.randomUUID()

            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    store_id: storeData.id,
                    buyer_id: currentUserId,
                    buyer_name: (currentUserName || authName || 'Cliente').trim(),
                    buyer_profile_slug: (currentUserSlug || currentUserId).trim(),
                    total_amount: finalTotal,
                    delivery_fee: deliveryFee,
                    delivery_option: deliveryOpt,
                    payment_method: paymentOpt,
                    delivery_address: address,
                    delivery_lat: deliveryLat,
                    delivery_lng: deliveryLng,
                    status: 'pending',
                    checkout_id,
                })
                .select()
                .single()

            if (orderError) {
                console.error('[Checkout] Erro ao inserir order:', orderError)
                toast.error(`Erro ao criar pedido: ${orderError.message}`)
                setCheckoutLoading(null)
                return
            }

            const orderItemsToInsert = items.map((item) => ({
                order_id: orderData.id,
                product_id: item.product.id,
                product_name: item.product.name,
                quantity: item.quantity,
                unit_price: item.product.price,
                total_price: item.product.price * item.quantity,
            }))

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItemsToInsert)

            if (itemsError) {
                console.error('[Checkout] Erro ao inserir order_items:', itemsError)
                await supabase.from('orders').delete().eq('id', orderData.id)
                toast.error(`Erro ao salvar itens: ${itemsError.message}`)
                setCheckoutLoading(null)
                return
            }

            clearStoreCart(slug)
            await loadUserData(currentUserId)
            await syncToSupabase(currentUserId)

            const remainingSlugs = Object.keys(itemsByStore).filter(s => s !== slug)
            if (remainingSlugs.length === 0) {
                try {
                    const { data: storeForWa } = await supabase
                        .from('stores')
                        .select('whatsapp, owner_id')
                        .eq('storeSlug', slug)
                        .single()
                    let whatsapp = storeForWa?.whatsapp
                    if (!whatsapp && storeForWa?.owner_id) {
                        const { data: owner } = await supabase
                            .from('profiles')
                            .select('whatsapp')
                            .eq('id', storeForWa.owner_id)
                            .single()
                        whatsapp = owner?.whatsapp
                    }
                    if (whatsapp) {
                        const paymentLabel = paymentOpt === 'pix' ? 'PIX' : paymentOpt === 'cartao' ? 'Cartão' : 'Dinheiro'
                        const deliveryLabel = deliveryOpt === 'entrega'
                            ? `Entrega (${address})${deliveryFee > 0 ? ` - Taxa: R$ ${deliveryFee.toFixed(2)}` : ' - Grátis'}`
                            : 'Retirada no Balcão'
                        const message = encodeURIComponent(
                            `*Novo Pedido - iUser*\n\n` +
                            `*Cliente:* @${currentUserSlug || 'cliente'}\n` +
                            `*Pagamento:* ${paymentLabel}\n` +
                            `*Entrega:* ${deliveryLabel}\n` +
                            `*Itens:*\n${items.map((i: any) => `- ${i.quantity}x ${i.product.name} (R$ ${i.product.price.toFixed(2)})`).join('\n')}\n\n` +
                            `*Subtotal: R$ ${itemsTotal.toFixed(2)}*\n` +
                            `*Taxa de entrega: R$ ${deliveryFee.toFixed(2)}*\n` +
                            `*Total: R$ ${finalTotal.toFixed(2)}*`
                        )
                        window.open(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${message}`, '_blank')
                    }
                } catch (waErr) {
                    console.warn('[Checkout] Falha ao abrir WhatsApp:', waErr)
                }
            }

            setFinishedOrders(prev => [...prev, {
                id: orderData.id,
                checkout_id,
                store_id: storeData.id,
                store_name: details?.name || slug,
                storeName: details?.name || slug,
                total_amount: finalTotal,
                deliveryFee: deliveryFee,
                status: 'pending',
                created_at: orderData.created_at,
                items: items.map(item => ({
                    product_id: item.product.id,
                    product_name: item.product.name,
                    quantity: item.quantity,
                    unit_price: item.product.price,
                    price: item.product.price * item.quantity,
                })),
            }])

            toast.success('Pedido realizado com sucesso! 🎉')
        } catch (err: any) {
            console.error('[Checkout] Erro inesperado:', err)
            toast.error(`Erro inesperado: ${err?.message ?? 'Tente novamente.'}`)
        } finally {
            setCheckoutLoading(null)
        }
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)
        const { data, error } = await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword,
        })
        if (error) {
            setAuthError('Email ou senha inválidos')
            setAuthLoading(false)
            return
        }
        if (data.user) await loadUserData(data.user.id)
        setAuthLoading(false)
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)
        if (authPassword !== authConfirmPassword) {
            setAuthError('As senhas não coincidem')
            setAuthLoading(false)
            return
        }
        if (!authProfileSlug || !/^[a-z0-9-]+$/.test(authProfileSlug)) {
            setAuthError('O link do perfil deve conter apenas letras, números e hifens')
            setAuthLoading(false)
            return
        }
        const { data: slugCheck } = await supabase
            .from('profiles')
            .select('profileSlug')
            .eq('profileSlug', authProfileSlug)
            .single()
        if (slugCheck) {
            setAuthError('Este link de perfil já está em uso')
            setAuthLoading(false)
            return
        }
        const { data, error } = await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
            options: { data: { full_name: authName, slug: authProfileSlug } },
        })
        if (error) {
            setAuthError(error.message)
            setAuthLoading(false)
            return
        }
        if (data.user) {
            await supabase.from('profiles').upsert({
                id: data.user.id,
                name: authName,
                profileSlug: authProfileSlug,
            })
            await loadUserData(data.user.id)
        }
        setAuthLoading(false)
    }

    const getStatusColor = (status: string) => {
        const colorMap: Record<string, string> = {
            pending: '#DBEAFE',
            preparing: '#FEF3C7',
            ready: '#EDE9FE',
            paid: '#D1FAE5',
            rejected: '#FEE2E2',
        }
        return colorMap[status] || '#F3F4F6'
    }

    const getStatusStyles = (status: string) => {
        const styles: any = {
            pending: { badge: 'bg-blue-100 text-blue-800 border border-blue-200', label: 'Pendente', icon: '⏳', message: 'Aguardando confirmação do vendedor' },
            preparing: { badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200', label: 'Preparando', icon: '👨‍🍳', message: 'O lojista está preparando seu pedido' },
            ready: { badge: 'bg-purple-100 text-purple-800 border border-purple-200', label: 'Pronto', icon: '✅', message: 'Seu pedido está pronto para retirada!' },
            paid: { badge: 'bg-green-100 text-green-800 border border-green-200', label: 'Finalizado', icon: '🎉', message: 'Pedido finalizado com sucesso' },
            rejected: { badge: 'bg-red-100 text-red-800 border border-red-200', label: 'Recusado', icon: '❌', message: 'O pedido foi recusado pelo vendedor' },
        }
        return styles[status] || styles.pending
    }

    const storeSlugs = Object.keys(itemsByStore)
    const filteredCartSlugs = useMemo(() => {
        if (!searchQuery.trim()) return storeSlugs
        const q = searchQuery.toLowerCase()
        return storeSlugs.filter((slug) => {
            const details = storeDetails[slug]
            const storeName = (details?.name || slug).toLowerCase()
            if (storeName.includes(q)) return true
            const items = itemsByStore[slug]
            return items.some((item) => item.product.name.toLowerCase().includes(q))
        })
    }, [storeSlugs, searchQuery, itemsByStore, storeDetails])

    const filteredPurchases = useMemo(() => {
        if (!searchQuery.trim()) return myPurchases
        const q = searchQuery.toLowerCase()
        return myPurchases.filter(
            (p) =>
                (p.store_name || '').toLowerCase().includes(q) ||
                (p.product_name || '').toLowerCase().includes(q)
        )
    }, [myPurchases, searchQuery])

    const filteredGroupedOrders = useMemo(() => {
        const source = searchQuery.trim() ? filteredPurchases : myPurchases
        const groups: Record<string, any> = {}
        source.forEach((p: any) => {
            if (!groups[p.checkout_id]) {
                groups[p.checkout_id] = {
                    checkout_id: p.checkout_id,
                    store_name: p.store_name,
                    store_id: p.store_id,
                    created_at: p.created_at,
                    status: p.status,
                    total_amount: 0,
                    deliveryFee: Number(p.delivery_fee || 0),
                    delivery_address: p.delivery_address,
                    items: [],
                }
            }
            groups[p.checkout_id].items.push({
                product_id: p.product_id,
                product_name: p.product_name,
                quantity: p.quantity,
                unit_price: p.unit_price,
                price: p.price,
            })
            groups[p.checkout_id].total_amount += Number(p.price || 0)
        })
        Object.values(groups).forEach((group: any) => {
            group.total_amount = group.total_amount + group.deliveryFee
        })
        let grouped = Object.values(groups)
        const statusOrder: Record<string, number> = {
            ready: 1,
            preparing: 2,
            pending: 3,
            paid: 4,
            rejected: 5,
        }
        grouped.sort((a: any, b: any) => {
            const orderA = statusOrder[a.status] || 99
            const orderB = statusOrder[b.status] || 99
            if (orderA !== orderB) return orderA - orderB
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        return grouped
    }, [myPurchases, filteredPurchases, searchQuery])

    // Contagem de pedidos únicos por status (apenas pendente, preparando, pronto)
    const activeOrderCounts = useMemo(() => {
        const uniqueCheckoutIds = new Set<string>()
        const counts: Record<string, number> = { pending: 0, preparing: 0, ready: 0 }
        myPurchases.forEach(p => {
            if (p.status in counts && !uniqueCheckoutIds.has(p.checkout_id)) {
                uniqueCheckoutIds.add(p.checkout_id)
                counts[p.status]++
            }
        })
        return counts
    }, [myPurchases])

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
        borderRadius: '1rem',
        padding: '1.5rem',
    }

    // ===== TABS =====
    const tabs = useMemo(() => {
        if (!currentUserId) return []

        const tabList: Array<{
            id: string
            label: string
            icon: any
            sectionId: string
            indicator: any
            isActive: boolean
            onClick: () => void
        }> = [
                {
                    id: 'carrinho',
                    label: 'Sacola',
                    icon: ShoppingBag,
                    sectionId: 'section-sacola',
                    indicator: null,
                    isActive: activeTab === 'carrinho',
                    onClick: () => setActiveTab('carrinho'),
                },
                {
                    id: 'pedidos',
                    label: 'Pedidos',
                    icon: Package,
                    sectionId: 'section-pedidos',
                    indicator:
                        activeOrderCounts.pending > 0 ||
                            activeOrderCounts.preparing > 0 ||
                            activeOrderCounts.ready > 0
                            ? {
                                pending: activeOrderCounts.pending,
                                preparing: activeOrderCounts.preparing,
                                ready: activeOrderCounts.ready,
                            }
                            : null,
                    isActive: activeTab === 'pedidos',
                    onClick: () => setActiveTab('pedidos'),
                },
                {
                    id: 'avaliacoes',
                    label: 'Avaliações',
                    icon: Star,
                    sectionId: 'section-avaliar',
                    indicator: pendingReviews.length > 0 ? { count: pendingReviews.length } : null,
                    isActive: activeTab === 'avaliacoes',
                    onClick: () => setActiveTab('avaliacoes'),
                },
            ]

        return tabList
    }, [currentUserId, activeOrderCounts, pendingReviews.length, activeTab])

    const OrderCard = ({ order }: { order: any }) => {
        const statusStyle = getStatusStyles(order.status)
        const bgColor = getStatusColor(order.status)
        return (
            <div
                className="rounded-2xl p-4 shadow-sm"
                style={{
                    background: bgColor,
                    border: `1px solid ${colors.border}`,
                    color: '#000',
                }}
            >
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-black italic" style={{ color: '#000' }}>
                        {order.storeName || order.store_name}
                    </h3>
                    <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${statusStyle.badge}`}>
                        {statusStyle.icon} {statusStyle.label}
                    </span>
                </div>
                <div className="w-full bg-white/50 rounded-full h-2 mb-3 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                            width:
                                order.status === 'pending' ? '25%' :
                                    order.status === 'preparing' ? '50%' :
                                        order.status === 'ready' ? '75%' :
                                            order.status === 'paid' ? '100%' : '100%',
                            background:
                                order.status === 'pending' ? '#3b82f6' :
                                    order.status === 'preparing' ? '#eab308' :
                                        order.status === 'ready' ? '#a855f7' :
                                            order.status === 'paid' ? '#10b981' : '#ef4444',
                        }}
                    ></div>
                </div>
                <div className="space-y-2">
                    {order.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="font-bold" style={{ color: '#000' }}>
                                {item.quantity}x {item.product_name}
                            </span>
                            <div className="flex items-center gap-3">
                                <span className="font-black" style={{ color: '#000' }}>
                                    R$ {Number(item.price).toFixed(2)}
                                </span>
                                {order.status === 'paid' && (
                                    <button
                                        onClick={() =>
                                            setReviewOrder({
                                                isOpen: true,
                                                orderId: order.id,
                                                productId: item.product_id,
                                                productName: item.product_name,
                                                storeId: order.store_id,
                                            })
                                        }
                                        className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase transition-all"
                                        style={{ background: '#f9731620', color: '#f97316' }}
                                    >
                                        Avaliar
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between items-center mt-3 pt-2 border-t border-black/20">
                    <span className="text-[8px] font-black uppercase" style={{ color: '#000' }}>Total</span>
                    <div className="text-right">
                        <span className="text-xl font-black block" style={{ color: '#000' }}>
                            R$ {Number(order.total_amount).toFixed(2)}
                        </span>
                        {Number(order.deliveryFee) > 0 && (
                            <span className="text-[9px] font-bold text-black/60 block -mt-1">
                                (frete R$ {Number(order.deliveryFee).toFixed(2)})
                            </span>
                        )}
                    </div>
                </div>
                <div className={`mt-3 text-[10px] font-bold text-center py-2 rounded-lg ${statusStyle.badge}`}>
                    {statusStyle.icon} {statusStyle.message}
                </div>
            </div>
        )
    }

    if (!mounted || globalLoading) return <LoadingSpinner message="Carregando sacola" background={colors.background} />

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            {/* ===== FUNDO ANIMADO ===== */}
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="iUser"
                    showBack={false}
                    greeting={`Olá, ${currentUserSlug ? `@${currentUserSlug}` : 'Visitante'}`}
                    avatarUrl={currentUserAvatar}
                    loading={false}
                    tabs={tabs}
                    showSearch={true}
                    searchPlaceholder="Buscar pedido, produto ou loja..."
                    onSearch={setSearchQuery}
                    profileSlug={currentUserSlug}
                    onHomeClick={() => router.push('/')}
                />

                <div className="px-4 pt-4 pb-24 space-y-10">
                    {/* Seção Sacola - visível apenas quando activeTab === 'carrinho' */}
                    {activeTab === 'carrinho' && (
                        <section id="section-sacola" className="scroll-mt-24">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#ffffff' }}>
                                    <ShoppingBag size={16} />
                                </div>
                                <h2 className="text-base font-black italic uppercase tracking-tighter" style={{ color: colors.textPrimary }}>
                                    Sacola
                                </h2>
                                {storeSlugs.length > 0 && (
                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                        {filteredCartSlugs.length} loja(s)
                                    </span>
                                )}
                            </div>
                            {filteredCartSlugs.length === 0 ? (
                                <div className="flex items-center gap-4 p-4 rounded-2xl" style={cardStyle}>
                                    <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: '#f9731620' }}>
                                        <ShoppingBag className="w-7 h-7" style={{ color: '#f97316' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-sm font-black" style={{ color: colors.textPrimary }}>Sua sacola está vazia</h2>
                                        <p className="text-xs" style={{ color: colors.textSecondary }}>Explore as lojas e encontre o que você procura</p>
                                    </div>
                                    <Link href="/" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-black uppercase text-[10px] tracking-wider transition-all shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                                        Ver Vitrine <ChevronRight className="w-3.5 h-3.5" />
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    {filteredCartSlugs.map((slug) => {
                                        const details = storeDetails[slug]
                                        const items = itemsByStore[slug]
                                        const config = storeConfigs[slug] || {}
                                        const { itemsTotal, deliveryFee, finalTotal, isCalculating } = getStoreTotals(slug)
                                        const deliveryOpt = deliveryOptionByStore[slug] || 'retirada'
                                        const paymentOpt = paymentMethodByStore[slug] || 'pix'
                                        const deliveryLoc = deliveryLocationByStore[slug]

                                        const canDelivery = config.accepts_delivery
                                        const canPickup = config.accepts_pickup
                                        const canPix = config.accepts_pix
                                        const canCard = config.accepts_card
                                        const canCash = config.accepts_cash

                                        const uniqueItems = items.filter(
                                            (item: any, index: number, self: any[]) =>
                                                index === self.findIndex((t: any) => t.product.id === item.product.id)
                                        )

                                        return (
                                            <div key={slug} className="rounded-2xl p-5 mb-4 border" style={{ borderColor: colors.border, background: colors.surface }}>
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <Store size={18} style={{ color: '#f97316' }} />
                                                        <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: colors.textPrimary }}>{details?.name || slug}</h3>
                                                    </div>
                                                    <span className="text-lg font-black" style={{ color: '#f97316' }}>R$ {itemsTotal.toFixed(2)}</span>
                                                </div>

                                                <div className="space-y-3 mb-4">
                                                    {uniqueItems.map((item) => (
                                                        <div key={item.product.id} className="flex gap-3 items-center">
                                                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                                                {item.product.image_url ? (
                                                                    <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">?</div>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{item.product.name}</p>
                                                                <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>
                                                                    R$ {item.product.price.toFixed(2)} cada
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <div className="flex items-center rounded-full overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                                                                        <button
                                                                            onClick={() => updateQuantity(slug, item.product.id, -1)}
                                                                            className="w-7 h-7 flex items-center justify-center transition-all hover:scale-110"
                                                                            style={{ background: GRADIENT, color: '#ffffff' }}
                                                                        >
                                                                            <Minus size={12} />
                                                                        </button>
                                                                        <span className="w-8 text-center text-xs font-bold" style={{ color: colors.textPrimary }}>{item.quantity}</span>
                                                                        <button
                                                                            onClick={() => updateQuantity(slug, item.product.id, 1)}
                                                                            className="w-7 h-7 flex items-center justify-center transition-all hover:scale-110"
                                                                            style={{ background: GRADIENT, color: '#ffffff' }}
                                                                        >
                                                                            <Plus size={12} />
                                                                        </button>
                                                                    </div>
                                                                    <button onClick={() => removeItem(slug, item.product.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                                                </div>
                                                            </div>
                                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                                R$ {(item.product.price * item.quantity).toFixed(2)}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="border-t pt-3 space-y-1 text-xs" style={{ borderColor: colors.border }}>
                                                    <div className="flex justify-between">
                                                        <span style={{ color: colors.textSecondary }}>Subtotal</span>
                                                        <span className="font-bold" style={{ color: colors.textPrimary }}>R$ {itemsTotal.toFixed(2)}</span>
                                                    </div>
                                                    {deliveryOpt === 'entrega' && (
                                                        <div className="flex justify-between">
                                                            <span style={{ color: colors.textSecondary }}>Taxa de entrega</span>
                                                            {isCalculating ? (
                                                                <span className="italic animate-pulse" style={{ color: colors.textSecondary }}>Calculando...</span>
                                                            ) : deliveryFee === 0 ? (
                                                                <span className="font-bold text-green-500">Grátis</span>
                                                            ) : (
                                                                <span className="font-bold" style={{ color: '#f97316' }}>
                                                                    R$ {deliveryFee.toFixed(2)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between pt-1 border-t" style={{ borderColor: colors.border }}>
                                                        <span className="font-bold" style={{ color: colors.textPrimary }}>Total</span>
                                                        {isCalculating ? (
                                                            <span className="font-bold text-base italic" style={{ color: colors.textSecondary }}>Calculando...</span>
                                                        ) : (
                                                            <span className="font-bold text-base" style={{ color: '#f97316' }}>R$ {finalTotal.toFixed(2)}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {currentUserId && (
                                                    <div className="mt-4 space-y-3">
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Recebimento</p>
                                                            <div className="flex gap-2">
                                                                {canDelivery && (
                                                                    <button
                                                                        onClick={() => setDeliveryOptionByStore(prev => ({ ...prev, [slug]: 'entrega' }))}
                                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${deliveryOpt === 'entrega' ? 'text-white' : ''}`}
                                                                        style={deliveryOpt === 'entrega' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                    >
                                                                        <Truck size={14} /> Entrega
                                                                    </button>
                                                                )}
                                                                {canPickup && (
                                                                    <button
                                                                        onClick={() => setDeliveryOptionByStore(prev => ({ ...prev, [slug]: 'retirada' }))}
                                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${deliveryOpt === 'retirada' ? 'text-white' : ''}`}
                                                                        style={deliveryOpt === 'retirada' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                    >
                                                                        <Store size={14} /> Retirada
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {deliveryOpt === 'entrega' && (
                                                                <div className="mt-2">
                                                                    {deliveryLoc ? (
                                                                        <div className="flex items-center justify-between gap-2 text-xs p-2 rounded-xl" style={{ background: '#f9731610', color: colors.textPrimary }}>
                                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                                <MapPin size={14} style={{ color: '#f97316' }} />
                                                                                <span className="truncate">{deliveryLoc.address}</span>
                                                                                {deliveryLoc.isSaved && (
                                                                                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 flex-shrink-0">Salvo</span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex gap-1 flex-shrink-0">
                                                                                {!deliveryLoc.isSaved && userLocation && userAddress && (
                                                                                    <button
                                                                                        onClick={() => useSavedLocation(slug)}
                                                                                        className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-600 hover:bg-blue-500/30 transition"
                                                                                    >
                                                                                        Usar salvo
                                                                                    </button>
                                                                                )}
                                                                                <button
                                                                                    onClick={() => openLocationModal(slug)}
                                                                                    className="text-[9px] font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-600 hover:bg-orange-500/30 transition"
                                                                                >
                                                                                    Alterar
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => openLocationModal(slug)}
                                                                            className="w-full text-xs font-bold p-2 rounded-xl border-2 border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 transition flex items-center justify-center gap-2"
                                                                        >
                                                                            <MapPin size={14} />
                                                                            Selecionar endereço de entrega
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Pagamento</p>
                                                            <div className="flex gap-2 flex-wrap">
                                                                {canPix && (
                                                                    <button
                                                                        onClick={() => setPaymentMethodByStore(prev => ({ ...prev, [slug]: 'pix' }))}
                                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentOpt === 'pix' ? 'text-white' : ''}`}
                                                                        style={paymentOpt === 'pix' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                    >
                                                                        <QrCode size={14} /> Pix
                                                                    </button>
                                                                )}
                                                                {canCard && (
                                                                    <button
                                                                        onClick={() => setPaymentMethodByStore(prev => ({ ...prev, [slug]: 'cartao' }))}
                                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentOpt === 'cartao' ? 'text-white' : ''}`}
                                                                        style={paymentOpt === 'cartao' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                    >
                                                                        <CreditCard size={14} /> Cartão
                                                                    </button>
                                                                )}
                                                                {canCash && (
                                                                    <button
                                                                        onClick={() => setPaymentMethodByStore(prev => ({ ...prev, [slug]: 'dinheiro' }))}
                                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentOpt === 'dinheiro' ? 'text-white' : ''}`}
                                                                        style={paymentOpt === 'dinheiro' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                    >
                                                                        <Banknote size={14} /> Dinheiro
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleFinalizarLoja(slug)}
                                                            disabled={checkoutLoading === slug || isCalculating || (deliveryOpt === 'entrega' && !deliveryLoc)}
                                                            className="w-full py-3 rounded-full font-black uppercase text-sm tracking-wider transition shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50"
                                                            style={{ background: GRADIENT, color: '#ffffff' }}
                                                        >
                                                            {checkoutLoading === slug ? 'Finalizando...' : isCalculating ? 'Calculando frete...' : (deliveryOpt === 'entrega' && !deliveryLoc) ? 'Selecione o endereço' : `Finalizar Pedido (R$ ${finalTotal.toFixed(2)})`}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {!currentUserId && storeSlugs.length > 0 && (
                                        <div className="rounded-2xl p-5" style={cardStyle}>
                                            <p className="text-xs text-center mb-4" style={{ color: colors.textSecondary }}>Identifique-se para fazermos o seu pedido</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setAuthMode('login')} className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase transition-all ${authMode === 'login' ? 'shadow-sm' : ''}`}
                                                    style={authMode === 'login' ? { background: GRADIENT, color: '#ffffff' } : { background: colors.surface, color: colors.textSecondary, border: `2px solid ${colors.border}` }}>
                                                    Entrar
                                                </button>
                                                <button onClick={() => setAuthMode('register')} className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase transition-all ${authMode === 'register' ? 'shadow-sm' : ''}`}
                                                    style={authMode === 'register' ? { background: GRADIENT, color: '#ffffff' } : { background: colors.surface, color: colors.textSecondary, border: `2px solid ${colors.border}` }}>
                                                    Criar Conta
                                                </button>
                                            </div>
                                            {authError && <div className="p-3 border rounded-full text-[8px] font-black uppercase text-center mt-3" style={{ background: '#f9731620', borderColor: '#f97316', color: '#f97316' }}>⚠️ {authError}</div>}
                                            {authMode === 'login' ? (
                                                <form onSubmit={handleLogin} className="space-y-3 mt-3">
                                                    <input type="email" placeholder="seu@email.com" className="w-full border-2 rounded-full px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required autoComplete="email" />
                                                    <div className="relative">
                                                        <input type={showPassword ? 'text' : 'password'} placeholder="sua senha" className="w-full border-2 rounded-full px-4 py-2.5 text-sm pr-10" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required autoComplete="current-password" />
                                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                                                    </div>
                                                    <button type="submit" disabled={authLoading} className="w-full py-2.5 rounded-full font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50" style={{ background: GRADIENT, color: '#ffffff' }}>{authLoading ? 'Entrando...' : 'Entrar'}</button>
                                                </form>
                                            ) : (
                                                <form onSubmit={handleRegister} className="space-y-3 mt-3">
                                                    <input type="text" placeholder="Nome Completo" className="w-full border-2 rounded-full px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authName} onChange={(e) => setAuthName(e.target.value)} required autoComplete="name" />
                                                    <div className="flex items-center gap-1 border-2 rounded-full px-3" style={{ background: colors.surface, borderColor: colors.border }}>
                                                        <span className="text-[9px] font-black" style={{ color: colors.textSecondary }}>iuser.com.br/</span>
                                                        <input type="text" placeholder="seu-perfil" className="flex-1 py-2.5 bg-transparent text-sm outline-none" style={{ color: colors.textPrimary }} value={authProfileSlug} onChange={(e) => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} required autoComplete="off" />
                                                        {isSlugAvailable !== null && <span className={`text-[9px] font-black ${isSlugAvailable ? 'text-green-500' : 'text-red-500'}`}>{isSlugAvailable ? '✓' : '✗'}</span>}
                                                    </div>
                                                    <input type="email" placeholder="seu@email.com" className="w-full border-2 rounded-full px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required autoComplete="email" />
                                                    <input type={showPassword ? 'text' : 'password'} placeholder="Senha" className="w-full border-2 rounded-full px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required autoComplete="new-password" />
                                                    <input type={showPassword ? 'text' : 'password'} placeholder="Confirmar senha" className="w-full border-2 rounded-full px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} required autoComplete="new-password" />
                                                    <button type="submit" disabled={authLoading || isSlugAvailable === false} className="w-full py-2.5 rounded-full font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50" style={{ background: GRADIENT, color: '#ffffff' }}>{authLoading ? 'Criando...' : 'Criar Conta'}</button>
                                                </form>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </section>
                    )}

                    {/* Seção Pedidos - visível apenas quando activeTab === 'pedidos' */}
                    {currentUserId && activeTab === 'pedidos' && (
                        <section id="section-pedidos" className="scroll-mt-24">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#ffffff' }}>
                                    <Package size={16} />
                                </div>
                                <h2 className="text-base font-black italic uppercase tracking-tighter" style={{ color: colors.textPrimary }}>
                                    Meus Pedidos
                                </h2>
                                <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                    {filteredGroupedOrders.length}
                                </span>
                            </div>
                            {filteredGroupedOrders.length === 0 ? (
                                <div className="flex items-center gap-4 p-4 rounded-2xl" style={cardStyle}>
                                    <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: '#f9731620' }}>
                                        <Package className="w-7 h-7" style={{ color: '#f97316' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-sm font-black" style={{ color: colors.textPrimary }}>Nenhum pedido ainda</h2>
                                        <p className="text-xs" style={{ color: colors.textSecondary }}>Seus pedidos aparecerão aqui</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredGroupedOrders.map((order: any) => (
                                        <OrderCard key={order.checkout_id} order={order} />
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {/* Seção Avaliações - visível apenas quando activeTab === 'avaliacoes' */}
                    {currentUserId && activeTab === 'avaliacoes' && (
                        <section id="section-avaliar" className="scroll-mt-24">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#ffffff' }}>
                                    <Star size={16} />
                                </div>
                                <h2 className="text-base font-black italic uppercase tracking-tighter" style={{ color: colors.textPrimary }}>
                                    Avaliações
                                </h2>
                                {pendingReviews.length > 0 && (
                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white">
                                        {pendingReviews.length} pendente(s)
                                    </span>
                                )}
                            </div>
                            {pendingReviews.length === 0 && userReviews.length === 0 ? (
                                <div className="flex items-center gap-4 p-4 rounded-2xl" style={cardStyle}>
                                    <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: '#f9731620' }}>
                                        <Star className="w-7 h-7" style={{ color: '#f97316' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-sm font-black" style={{ color: colors.textPrimary }}>Nenhuma avaliação ainda</h2>
                                        <p className="text-xs" style={{ color: colors.textSecondary }}>Após finalizar uma compra você poderá avaliar o produto</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {/* Pendentes */}
                                    {pendingReviews.length > 0 && (
                                        <div>
                                            <h3 className="text-xs font-black uppercase mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                                                Pendentes de avaliação
                                            </h3>
                                            <div className="space-y-3">
                                                {pendingReviews.map((item: any) => {
                                                    const details = pendingProductDetails[item.product_id] || {}
                                                    return (
                                                        <div key={item.product_id} className="rounded-2xl p-4 flex items-center justify-between shadow-sm" style={cardStyle}>
                                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                                                    {details.image_url ? (
                                                                        <img src={details.image_url} alt="" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">?</div>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{item.product_name}</p>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                                                            {new Date(item.created_at).toLocaleDateString('pt-BR')}
                                                                        </span>
                                                                        <span className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                                                            R$ {Number(item.price).toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() =>
                                                                    setReviewOrder({
                                                                        isOpen: true,
                                                                        orderId: item.checkout_id || item.id,
                                                                        productId: item.product_id,
                                                                        productName: item.product_name,
                                                                        storeId: item.store_id,
                                                                    })
                                                                }
                                                                className="ml-4 px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all flex-shrink-0"
                                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                                            >
                                                                Avaliar
                                                            </button>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Já avaliados */}
                                    {userReviews.length > 0 && (
                                        <div>
                                            <h3 className="text-xs font-black uppercase mb-3 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                                                <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                                                Você já avaliou
                                            </h3>
                                            <div className="space-y-3">
                                                {userReviews.map((review) => (
                                                    <div key={review.id} className="rounded-2xl p-4 shadow-sm flex gap-3" style={cardStyle}>
                                                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                                            {review.product_image_url ? (
                                                                <img src={review.product_image_url} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">?</div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-start justify-between">
                                                                <div>
                                                                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{review.product_name}</p>
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        {Array.from({ length: 5 }).map((_, i) => (
                                                                            <Star
                                                                                key={i}
                                                                                size={12}
                                                                                fill={i < review.rating ? '#f59e0b' : 'none'}
                                                                                color={i < review.rating ? '#f59e0b' : colors.textSecondary}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                    {review.comment && (
                                                                        <p className="text-[10px] mt-1 italic" style={{ color: colors.textSecondary }}>
                                                                            &ldquo;{review.comment}&rdquo;
                                                                        </p>
                                                                    )}
                                                                    <p className="text-[10px] font-bold mt-1" style={{ color: '#f97316' }}>
                                                                        R$ {Number(review.product_price).toFixed(2)}
                                                                    </p>
                                                                </div>
                                                                <span className="text-[8px] font-bold flex-shrink-0" style={{ color: colors.textSecondary }}>
                                                                    {new Date(review.created_at).toLocaleDateString('pt-BR')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    )}

                    {/* Seção Pedidos Finalizados (cartão de confirmação) */}
                    {finishedOrders.length > 0 && (
                        <section className="space-y-4 animate-slide-in">
                            <div className="rounded-2xl p-5 text-center" style={cardStyle}>
                                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: GRADIENT, color: '#ffffff' }}>
                                    <CheckCircle2 className="w-8 h-8" />
                                </div>
                                <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Pedido Realizado!</h2>
                                <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>Acompanhe o status abaixo em tempo real</p>
                            </div>
                            {finishedOrders.map((order, index) => (
                                <OrderCard key={index} order={order} />
                            ))}
                            <button
                                onClick={async () => {
                                    if (currentUserId) await loadUserData(currentUserId)
                                    setFinishedOrders([])
                                    setActiveTab('pedidos')
                                }}
                                className="w-full py-4 rounded-full font-black uppercase text-xs tracking-wider transition-all shadow-md hover:scale-105 active:scale-95"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                            >
                                Ver Meus Pedidos
                            </button>
                        </section>
                    )}
                </div>

                <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                    <button
                        onClick={() => router.back()}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            border: `2px solid #f97316`,
                            boxShadow: `0 8px 24px #f9731660`,
                        }}
                        aria-label="Voltar para a página anterior"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            border: `2px solid #f97316`,
                            boxShadow: `0 8px 24px #f9731660`,
                        }}
                        aria-label="Ir para o início"
                    >
                        <Home size={24} />
                    </button>
                </div>
            </main>

            {/* ===== MODAL DE LOCALIZAÇÃO ===== */}
            {showLocationModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" style={{ background: colors.surface, border: `2px solid ${colors.border}` }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Selecionar Endereço de Entrega</h3>
                            <button onClick={() => setShowLocationModal(false)} className="p-1 rounded-full hover:bg-black/5 transition">
                                <X size={20} style={{ color: colors.textSecondary }} />
                            </button>
                        </div>

                        {/* Localização salva */}
                        {userLocation && userAddress && (
                            <button
                                onClick={() => {
                                    if (locationModalStore) {
                                        useSavedLocation(locationModalStore)
                                    }
                                    setShowLocationModal(false)
                                }}
                                className="w-full p-3 rounded-xl mb-3 border-2 border-green-500/30 hover:bg-green-50 transition flex items-center gap-3"
                                style={{ background: 'rgba(16,185,129,0.05)' }}
                            >
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-500/20">
                                    <Home size={18} style={{ color: '#10b981' }} />
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>Endereço salvo no perfil</p>
                                    <p className="text-[10px] truncate" style={{ color: colors.textSecondary }}>{userAddress}</p>
                                </div>
                                <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                            </button>
                        )}

                        {/* Buscar endereço */}
                        <div className="flex gap-2 mb-3">
                            <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: colors.border }}>
                                <Search size={16} style={{ color: colors.textSecondary }} />
                                <input
                                    type="text"
                                    value={locationSearchQuery}
                                    onChange={(e) => setLocationSearchQuery(e.target.value)}
                                    placeholder="Buscar endereço..."
                                    className="flex-1 bg-transparent outline-none text-sm"
                                    style={{ color: colors.textPrimary }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') searchLocation() }}
                                />
                            </div>
                            <button
                                onClick={searchLocation}
                                disabled={isSearchingLocation}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-white disabled:opacity-50"
                                style={{ background: GRADIENT }}
                            >
                                {isSearchingLocation ? '...' : 'Buscar'}
                            </button>
                        </div>

                        {/* Endereço selecionado */}
                        {selectedLocation && (
                            <div className="p-3 rounded-xl mb-3" style={{ background: `${colors.accent}10`, border: `1px solid ${colors.accent}30` }}>
                                <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>Endereço selecionado</p>
                                <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>{selectedLocation.address}</p>
                            </div>
                        )}

                        <button
                            onClick={confirmLocation}
                            disabled={!selectedLocation}
                            className="w-full py-3 rounded-full font-black uppercase text-xs tracking-wider disabled:opacity-50"
                            style={{ background: GRADIENT, color: '#ffffff' }}
                        >
                            Confirmar Endereço
                        </button>
                    </div>
                </div>
            )}

            <ReviewModal
                isOpen={reviewOrder.isOpen}
                onClose={() => setReviewOrder((prev) => ({ ...prev, isOpen: false }))}
                orderId={reviewOrder.orderId}
                productId={reviewOrder.productId}
                productName={reviewOrder.productName}
                storeId={reviewOrder.storeId}
            />
        </div>
    )
}