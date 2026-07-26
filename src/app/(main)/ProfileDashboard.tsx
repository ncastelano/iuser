// app/(main)/ProfileDashboard.tsx
'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { RatingStars } from '@/components/ratings/RatingStars'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '../ButtonSacola'
import { toast } from 'sonner'
import {
    Eye,
    Settings,
    Plus,
    Users,
    X,
    Send,
    DollarSign,
    ShoppingCart,
    Package,
    ArrowUpDown,
    Pencil,
    MapPin,
    Phone,
    User,
    Calendar,
    Clock,
    Store,
    Heart,
    Star,
    Truck,
    Home,
    UserCircle,
    Copy,
    ExternalLink,
    ChevronUp,
    ChevronDown,
} from 'lucide-react'
import { OrderModal } from '../../components/OrderModal'
import ButtonInPersonSale from './ButtonInPersonSale'
import Employee from './Employee'
import Publication from './Publication'
import StoreVisitors from './StoreVisitors'
import StoreOperatingDays from './StoreOperatingDays'
import StoreAddress from './StoreAddress'
import AtalhoCompromissosPessoal from './compromissos/AtalhoCompromissosPessoal'
import ProfileVisitors from './ProfileVisitors'

function startOfDay(date: Date = new Date()): string {
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

// ---------- Funções de horário ----------
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function getTodayKey(): string {
    return DAY_KEYS[new Date().getDay()]
}

function getTodaySchedule(businessHours: Record<string, { open: string; close: string }> | null | undefined) {
    if (!businessHours) return null
    const todayKey = getTodayKey()
    return businessHours[todayKey] || null
}

function isOpenNow(schedule: { open: string; close: string } | null | undefined): boolean {
    if (!schedule || !schedule.open || !schedule.close) return false
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const [openH, openM] = schedule.open.split(':').map(Number)
    let [closeH, closeM] = schedule.close.split(':').map(Number)
    if (closeH === 0 && closeM === 0) closeH = 24
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes
}

// ---------- Funções de rota (entregas) ----------
const ROUTE_COLORS = ['#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#eab308']

interface DeliveryStop {
    lat: number | null
    lng: number | null
    label: string
    address: string
    status: string
    payment_method: string
    total_amount: number
    delivery_fee: number
    items: { product_name: string; quantity: number }[]
}

interface EmployeeRoute {
    employeeId: string
    employeeName: string
    color: string
    stops: DeliveryStop[]
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function optimizeRoute(storeLat: number, storeLng: number, stops: { id: string; lat: number; lng: number }[]) {
    if (stops.length === 0) return []
    const remaining = [...stops]
    const sequence: { id: string; sequence: number }[] = []
    let curLat = storeLat, curLng = storeLng, seq = 1
    while (remaining.length > 0) {
        let nearestIdx = 0, nearestDist = Infinity
        remaining.forEach((s, i) => {
            const d = haversineDistance(curLat, curLng, s.lat, s.lng)
            if (d < nearestDist) { nearestDist = d; nearestIdx = i }
        })
        const next = remaining.splice(nearestIdx, 1)[0]
        sequence.push({ id: next.id, sequence: seq++ })
        curLat = next.lat; curLng = next.lng
    }
    return sequence
}

export default function ProfileDashboard({
    profileSlug,
    onBack,
    avatarUrl,
}: {
    profileSlug: string | null
    onBack?: () => void
    avatarUrl?: string | null
}) {
    const router = useRouter()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const { itemsByStore } = useCartStore()
    const [isProductsExpanded, setIsProductsExpanded] = useState(false)
    const [profile, setProfile] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const [orders, setOrders] = useState<any[]>([])
    const [metrics, setMetrics] = useState({
        daily: { spent: 0, orders: 0 },
        total: { spent: 0, orders: 0, stores: 0 },
        revenue: { daily: 0, orders: 0 },
    })

    const [favoriteStores, setFavoriteStores] = useState<any[]>([])
    const [recentViews, setRecentViews] = useState<any[]>([])
    const [reviews, setReviews] = useState<any[]>([])
    const [upcomingSchedules, setUpcomingSchedules] = useState<any[]>([])

    // Estados para o SacolaButton
    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)
    const [cartAnimating, setCartAnimating] = useState(false)

    // Estados para funções de vendedor (Store)
    const [groupedOrders, setGroupedOrders] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [sortBy, setSortBy] = useState<'mostSold' | 'leastSold' | 'mostExpensive' | 'cheapest'>('mostSold')
    const [employees, setEmployees] = useState<any[]>([])
    const [employeeRoutes, setEmployeeRoutes] = useState<EmployeeRoute[]>([])
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
    const [assigning, setAssigning] = useState(false)
    const [selectedOrder, setSelectedOrder] = useState<any>(null)
    const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)
    const [singleAssignOpen, setSingleAssignOpen] = useState<{ order: any } | null>(null)
    const [assignmentMap, setAssignmentMap] = useState<Map<string, { employeeName: string; status: string }>>(new Map())
    const [ownerProfile, setOwnerProfile] = useState<{ name: string; phone?: string } | null>(null)

    // Estados para configurações da loja (perfil)
    const [acceptsPix, setAcceptsPix] = useState(false)
    const [acceptsCard, setAcceptsCard] = useState(false)
    const [acceptsDelivery, setAcceptsDelivery] = useState(false)
    const [acceptsPickup, setAcceptsPickup] = useState(false)
    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState<'cpf' | 'email' | 'phone' | 'random'>('cpf')
    const [deliveryMode, setDeliveryMode] = useState<'fixed' | 'distance'>('fixed')
    const [fixedDeliveryFee, setFixedDeliveryFee] = useState('')
    const [distanceRules, setDistanceRules] = useState<{ max_km: string; fee: string }[]>([])
    const [initialBusinessHours, setInitialBusinessHours] = useState<Record<string, { open: string; close: string }>>({})

    const intervalRef = useRef<any>(null)

    const totalCartItems = React.useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

    // Animação da sacola
    React.useEffect(() => {
        if (totalCartItems > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartItems])

    // Buscar status dos pedidos (comprador)
    React.useEffect(() => {
        const fetchOrderStatuses = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: ordersData } = await supabase
                .from('orders')
                .select('status')
                .eq('buyer_id', user.id)

            if (ordersData) {
                setPendingCount(ordersData.filter(o => o.status === 'pending').length)
                setPreparingCount(ordersData.filter(o => o.status === 'preparing').length)
                setReadyCount(ordersData.filter(o => o.status === 'ready').length)
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

                    const { data: reviewsData } = await supabase
                        .from('product_reviews')
                        .select('product_id')
                        .eq('profile_id', user.id)
                        .in('product_id', productIds)

                    const reviewedIds = new Set(reviewsData?.map(r => r.product_id) || [])
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

    const loadDashboard = useCallback(async () => {
        if (!profileSlug) return
        setLoading(true)

        // Buscar perfil
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .ilike('profileSlug', profileSlug)
            .maybeSingle()

        if (profileError || !profileData) {
            toast.error('Perfil não encontrado')
            setLoading(false)
            return
        }

        // USAR O avatarUrl PASSADO COMO PROP
        const finalAvatarUrl = avatarUrl || (profileData.avatar_url
            ? supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url).data.publicUrl
            : null)

        setProfile({ ...profileData, avatar_url: finalAvatarUrl })
        setInitialBusinessHours(profileData.business_hours || {})

        // Carregar configurações do perfil para funções de vendedor
        setAcceptsPix(profileData.accepts_pix ?? true)
        setAcceptsCard(profileData.accepts_card ?? true)
        setAcceptsDelivery(profileData.accepts_delivery ?? false)
        setAcceptsPickup(profileData.accepts_pickup ?? false)
        setPixKey(profileData.pix_key || '')
        setPixKeyType(profileData.pix_key_type || 'cpf')

        if (profileData.delivery_type === 'fixed') {
            setDeliveryMode('fixed')
            setFixedDeliveryFee(profileData.delivery_fee ? String(profileData.delivery_fee) : '')
        } else if (profileData.delivery_type === 'distance') {
            setDeliveryMode('distance')
            setDistanceRules(profileData.delivery_distance_rules || [])
        } else {
            setDeliveryMode('fixed')
            setFixedDeliveryFee('')
        }

        const profileId = profileData.id
        setOwnerProfile({ name: profileData.name, phone: profileData.whatsapp })

        // Buscar pedidos do usuário (como comprador)
        const { data: ordersData } = await supabase
            .from('orders')
            .select(`
                id,
                checkout_id,
                store_id,
                total_amount,
                delivery_fee,
                delivery_option,
                payment_method,
                delivery_address,
                status,
                created_at,
                stores:store_id (
                    name,
                    storeSlug,
                    logo_url
                ),
                order_items (
                    id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    total_price
                )
            `)
            .eq('buyer_id', profileId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (ordersData) {
            const formattedOrders = ordersData.map((order: any) => {
                const items = order.order_items || []
                const subtotal = items.reduce((acc: number, i: any) => acc + Number(i.total_price || 0), 0)
                const deliveryFee = Number(order.delivery_fee || 0)

                const storeData = Array.isArray(order.stores) ? order.stores[0] : order.stores

                let storeLogo = null
                if (storeData?.logo_url) {
                    storeLogo = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                }

                return {
                    id: order.id,
                    checkout_id: order.checkout_id,
                    store_name: storeData?.name || 'Loja',
                    store_slug: storeData?.storeSlug || '',
                    store_logo: storeLogo,
                    created_at: order.created_at,
                    status: order.status,
                    delivery_address: order.delivery_address,
                    items,
                    subtotal,
                    deliveryFee,
                    totalPrice: Number(order.total_amount || subtotal + deliveryFee),
                }
            })

            setOrders(formattedOrders)

            // Métricas diárias (comprador)
            const todayStart = startOfDay()
            const dailyOrders = formattedOrders.filter((o: any) =>
                new Date(o.created_at).getTime() >= new Date(todayStart).getTime() &&
                o.status === 'paid'
            )
            const dailySpent = dailyOrders.reduce((acc: number, o: any) => acc + o.totalPrice, 0)

            // Métricas totais (comprador)
            const paidOrders = formattedOrders.filter((o: any) => o.status === 'paid')
            const totalSpent = paidOrders.reduce((acc: number, o: any) => acc + o.totalPrice, 0)
            const uniqueStores = new Set(paidOrders.map((o: any) => o.store_slug)).size

            setMetrics(prev => ({
                ...prev,
                daily: { spent: dailySpent, orders: dailyOrders.length },
                total: { spent: totalSpent, orders: paidOrders.length, stores: uniqueStores },
            }))

            // Buscar lojas favoritas (baseado em pedidos frequentes)
            const storeCounts = new Map<string, number>()
            ordersData.forEach((order: any) => {
                const storeData = Array.isArray(order.stores) ? order.stores[0] : order.stores
                if (storeData) {
                    const key = storeData.storeSlug
                    storeCounts.set(key, (storeCounts.get(key) || 0) + 1)
                }
            })

            if (storeCounts.size > 0) {
                const sortedStores = Array.from(storeCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)

                const favoriteStoresData = sortedStores.map(([slug, count]) => {
                    const order = ordersData.find((o: any) => {
                        const storeData = Array.isArray(o.stores) ? o.stores[0] : o.stores
                        return storeData?.storeSlug === slug
                    })

                    const storeData = order ? (Array.isArray(order.stores) ? order.stores[0] : order.stores) : null

                    let logoUrl = null
                    if (storeData?.logo_url) {
                        logoUrl = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                    }

                    return {
                        name: storeData?.name || slug,
                        slug: slug,
                        logo_url: logoUrl,
                        orderCount: count,
                    }
                })

                setFavoriteStores(favoriteStoresData)
            }
        }

        // Buscar visualizações recentes
        const { data: viewsData } = await supabase
            .from('product_views')
            .select(`
                product_id,
                created_at,
                products:product_id (
                    name,
                    price,
                    image_url,
                    slug,
                    stores:store_id (
                        name,
                        storeSlug
                    )
                )
            `)
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(10)

        if (viewsData) {
            const recentViewsData = viewsData.map((v: any) => {
                const productData = Array.isArray(v.products) ? v.products[0] : v.products
                const storeData = productData?.stores
                const storeInfo = Array.isArray(storeData) ? storeData[0] : storeData

                return {
                    product_name: productData?.name || 'Produto',
                    product_slug: productData?.slug || '',
                    price: productData?.price || 0,
                    image_url: productData?.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
                        : null,
                    store_name: storeInfo?.name || 'Loja',
                    store_slug: storeInfo?.storeSlug || '',
                    viewed_at: v.created_at,
                }
            })
            setRecentViews(recentViewsData)
        }

        // Buscar avaliações feitas
        const { data: reviewsData } = await supabase
            .from('product_reviews')
            .select(`
                id,
                rating,
                comment,
                created_at,
                products:product_id (
                    name,
                    slug,
                    stores:store_id (
                        name,
                        storeSlug
                    )
                )
            `)
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(10)

        if (reviewsData) {
            const formattedReviews = reviewsData.map((r: any) => {
                const productData = Array.isArray(r.products) ? r.products[0] : r.products
                const storeData = productData?.stores
                const storeInfo = Array.isArray(storeData) ? storeData[0] : storeData

                return {
                    id: r.id,
                    rating: r.rating,
                    comment: r.comment,
                    product_name: productData?.name || 'Produto',
                    product_slug: productData?.slug || '',
                    store_name: storeInfo?.name || 'Loja',
                    store_slug: storeInfo?.storeSlug || '',
                    created_at: r.created_at,
                }
            })
            setReviews(formattedReviews)
        }

        // Buscar agendamentos futuros
        const now = new Date().toISOString()
        const { data: schedulesData } = await supabase
            .from('schedules')
            .select(`
                id,
                store_id,
                schedule_date,
                schedule_time,
                service_type,
                notes,
                status,
                stores:store_id (
                    name,
                    storeSlug,
                    logo_url
                )
            `)
            .eq('profile_id', profileId)
            .gte('schedule_date', now.split('T')[0])
            .order('schedule_date', { ascending: true })
            .limit(10)

        if (schedulesData) {
            const formattedSchedules = schedulesData.map((s: any) => {
                const storeData = Array.isArray(s.stores) ? s.stores[0] : s.stores

                let storeLogo = null
                if (storeData?.logo_url) {
                    storeLogo = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                }

                return {
                    id: s.id,
                    store_name: storeData?.name || 'Loja',
                    store_slug: storeData?.storeSlug || '',
                    store_logo: storeLogo,
                    date: s.schedule_date,
                    time: s.schedule_time,
                    service_type: s.service_type,
                    notes: s.notes,
                    status: s.status,
                }
            })
            setUpcomingSchedules(formattedSchedules)
        }

        // ===== FUNÇÕES DE VENDEDOR (Store) =====
        // Buscar pedidos como vendedor (orders onde o perfil é o vendedor)
        const { data: storeOrdersData, error: storeOrdersError } = await supabase
            .from('orders')
            .select(`
                id,
                checkout_id,
                buyer_id,
                buyer_name,
                buyer_profile_slug,
                total_amount,
                delivery_fee,
                delivery_option,
                payment_method,
                delivery_address,
                delivery_lat,
                delivery_lng,
                status,
                created_at,
                order_items (
                    id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    total_price
                )
            `)
            .eq('store_id', profileId)
            .order('created_at', { ascending: false })
            .limit(100)

        if (!storeOrdersError && storeOrdersData) {
            const grouped = storeOrdersData.map(order => {
                const items = order.order_items || []
                const subtotal = items.reduce((acc: number, i: any) => acc + Number(i.total_price || 0), 0)
                const deliveryFee = Number(order.delivery_fee || 0)
                return {
                    id: order.id,
                    checkout_id: order.checkout_id,
                    buyer_name: order.buyer_name,
                    buyer_profile_slug: order.buyer_profile_slug,
                    created_at: order.created_at,
                    status: order.status,
                    delivery_address: order.delivery_address,
                    delivery_lat: order.delivery_lat,
                    delivery_lng: order.delivery_lng,
                    items,
                    subtotal,
                    deliveryFee,
                    totalPrice: Number(order.total_amount || subtotal + deliveryFee),
                }
            }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

            setGroupedOrders(grouped)

            // Métricas de vendas diárias
            const todayStartISO = startOfDay()
            const dailyOrders = storeOrdersData.filter(o =>
                new Date(o.created_at).getTime() >= new Date(todayStartISO).getTime() &&
                o.status === 'paid'
            )
            const dailyRev = dailyOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
            setMetrics(prev => ({
                ...prev,
                revenue: { daily: dailyRev, orders: dailyOrders.length }
            }))
        }


        // ===== BUSCAR PRODUTOS DO PERFIL (apenas produtos sem store_id) =====
        const { data: productsData, error: productsError } = await supabase
            .from('products')
            .select('id, name, price, image_url, slug, store_id, owner_id, owner_image_url')
            .eq('owner_id', profileId)
            .is('store_id', null)
            .order('created_at', { ascending: false })
            .limit(12)

        if (productsError) {
            console.error('[ProfileDashboard] Erro ao buscar produtos:', productsError)
        }

        if (productsData && productsData.length > 0) {
            const productIds = productsData.map(p => p.id)
            const todayStartISO = startOfDay()

            // Buscar visualizações de hoje
            const { data: viewsToday } = await supabase.from('product_views')
                .select('product_id').in('product_id', productIds).gte('created_at', todayStartISO)
            const viewsTodayMap = new Map()
            viewsToday?.forEach(v => viewsTodayMap.set(v.product_id, (viewsTodayMap.get(v.product_id) || 0) + 1))

            // Buscar visualizações totais
            const { data: viewsTotal } = await supabase.from('product_views')
                .select('product_id').in('product_id', productIds)
            const viewsTotalMap = new Map()
            viewsTotal?.forEach(v => viewsTotalMap.set(v.product_id, (viewsTotalMap.get(v.product_id) || 0) + 1))

            // Buscar pedidos para contar vendas (usando store_id do perfil)
            const { data: orderIdsData } = await supabase
                .from('orders')
                .select('id')
                .eq('store_id', profileId)
            const orderIds = orderIdsData?.map(o => o.id) || []
            const salesCountMap = new Map()
            if (orderIds.length > 0) {
                const { data: orderItemsSales } = await supabase
                    .from('order_items')
                    .select('product_id, quantity')
                    .in('order_id', orderIds)
                    .in('product_id', productIds)
                orderItemsSales?.forEach(s => {
                    salesCountMap.set(s.product_id, (salesCountMap.get(s.product_id) || 0) + (s.quantity || 1))
                })
            }

            // Buscar itens no carrinho (estimativa)
            let cartMap = new Map()
            try {
                const { data: carts } = await supabase
                    .from('carts')
                    .select('items')
                    .eq('store_id', profileId)

                if (carts) {
                    carts.forEach(cart => {
                        if (cart.items) {
                            const items = typeof cart.items === 'string' ? JSON.parse(cart.items) : cart.items
                            items?.forEach((item: any) => {
                                cartMap.set(item.product_id, (cartMap.get(item.product_id) || 0) + (item.quantity || 1))
                            })
                        }
                    })
                }
            } catch (e) {
                console.error('[ProfileDashboard] Erro ao buscar carrinhos:', e)
            }

            const combined = productsData.map(p => ({
                ...p,
                viewsToday: viewsTodayMap.get(p.id) || 0,
                viewsTotal: viewsTotalMap.get(p.id) || 0,
                inCart: cartMap.get(p.id) || 0,
                salesCount: salesCountMap.get(p.id) || 0,
            }))
            setProducts(combined)
        } else {
            setProducts([])
        }

        // Buscar funcionários do perfil (vendedor)
        const { data: empData } = await supabase.from('employees').select('*').eq('store_id', profileId).eq('is_active', true)
        setEmployees(empData || [])

        setLoading(false)
    }, [profileSlug, avatarUrl])

    // Buscar rotas de entrega
    const fetchEmployeeRoutes = useCallback(async () => {
        if (!profile?.id) return

        const { data: assignments, error: assignError } = await supabase
            .from('delivery_assignments')
            .select('employee_id, checkout_id, sequence_order, status')
            .eq('store_id', profile.id)
            .order('sequence_order')

        if (assignError || !assignments || assignments.length === 0) {
            setEmployeeRoutes([])
            setAssignmentMap(new Map())
            return
        }

        const checkoutIds = [...new Set(assignments.map(a => a.checkout_id))]

        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
                checkout_id,
                delivery_lat,
                delivery_lng,
                delivery_address,
                buyer_name,
                payment_method,
                total_amount,
                delivery_fee,
                order_items (
                    product_name,
                    quantity
                )
            `)
            .in('checkout_id', checkoutIds)

        if (ordersError) return

        const ordersMap = new Map<string, any>()
        orders?.forEach(order => {
            ordersMap.set(order.checkout_id, order)
        })

        const map = new Map<string, any[]>()
        assignments.forEach(assignment => {
            const order = ordersMap.get(assignment.checkout_id)
            if (!map.has(assignment.employee_id)) map.set(assignment.employee_id, [])

            const items = order ? (order.order_items || []).map((item: any) => ({
                product_name: item.product_name,
                quantity: item.quantity,
            })) : []

            map.get(assignment.employee_id)!.push({
                checkout_id: assignment.checkout_id,
                sequence: assignment.sequence_order,
                status: assignment.status,
                lat: order?.delivery_lat || null,
                lng: order?.delivery_lng || null,
                address: order?.delivery_address || '',
                buyer: order?.buyer_name || '',
                payment_method: order?.payment_method || '',
                total_amount: order?.total_amount || 0,
                delivery_fee: order?.delivery_fee || 0,
                items,
            })
        })

        const routes: EmployeeRoute[] = Array.from(map.entries()).map(([eid, stops], idx) => {
            const emp = employees.find(e => e.id === eid)
            return {
                employeeId: eid,
                employeeName: emp?.name || 'Entregador',
                color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
                stops: stops.map(s => ({
                    lat: s.lat,
                    lng: s.lng,
                    label: s.sequence.toString(),
                    address: s.address || '',
                    status: s.status,
                    payment_method: s.payment_method,
                    total_amount: s.total_amount,
                    delivery_fee: s.delivery_fee,
                    items: s.items,
                })),
            }
        })

        setEmployeeRoutes(routes)

        const newMap = new Map<string, { employeeName: string; status: string }>()
        assignments.forEach(a => {
            const emp = employees.find(e => e.id === a.employee_id)
            if (emp) {
                newMap.set(a.checkout_id, {
                    employeeName: emp.name,
                    status: a.status
                })
            }
        })
        setAssignmentMap(newMap)
    }, [profile?.id, employees])

    useEffect(() => { if (profile?.id) fetchEmployeeRoutes() }, [profile?.id, employees, fetchEmployeeRoutes])

    useEffect(() => {
        if (!profile?.id) return
        const ordersChannel = supabase
            .channel(`painel-orders-${profile.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${profile.id}` },
                () => loadDashboard()
            )
            .subscribe()

        const assignmentsChannel = supabase
            .channel(`painel-assignments-${profile.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'delivery_assignments', filter: `store_id=eq.${profile.id}` },
                () => fetchEmployeeRoutes()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(ordersChannel)
            supabase.removeChannel(assignmentsChannel)
            clearInterval(intervalRef.current)
        }
    }, [profile?.id, loadDashboard, fetchEmployeeRoutes])

    useEffect(() => { loadDashboard() }, [loadDashboard])

    const goToPublicProfile = () => {
        if (profileSlug) {
            router.push(`/${profileSlug}`)
        }
    }

    const copyStoreLink = () => {
        if (profileSlug) {
            const url = `${window.location.origin}/${profileSlug}`
            navigator.clipboard.writeText(url)
            toast.success('Link copiado!')
        }
    }

    const formatStatus = (status: string) => {
        const statusMap: Record<string, { label: string; color: string }> = {
            pending: { label: 'Pendente', color: '#3b82f6' },
            preparing: { label: 'Preparando', color: '#f59e0b' },
            ready: { label: 'Pronto', color: '#8b5cf6' },
            in_transit: { label: 'Em trânsito', color: '#06b6d4' },
            delivered: { label: 'Entregue', color: '#22c55e' },
            paid: { label: 'Finalizado', color: '#10b981' },
            cancelled: { label: 'Cancelado', color: '#ef4444' },
        }
        return statusMap[status] || { label: status, color: '#6b7280' }
    }

    const formatAssignmentStatus = (status: string) => {
        switch (status) {
            case 'pending': return 'Pendente'
            case 'in_transit': return 'A caminho'
            case 'delivered': return 'Entregue'
            default: return status
        }
    }

    // ===== Funções de vendedor (Store) =====

    const ensureOwnerEmployee = async (): Promise<string | null> => {
        if (!profile?.id || !profile?.name) return null

        const { data: existing } = await supabase
            .from('employees')
            .select('id')
            .eq('store_id', profile.id)
            .eq('profile_id', profile.id)
            .maybeSingle()

        if (existing) return existing.id

        const { data: newEmp, error } = await supabase
            .from('employees')
            .insert({
                store_id: profile.id,
                name: profile.name || 'Dono',
                phone: profile.whatsapp || '',
                is_active: true,
                profile_id: profile.id,
            })
            .select('id')
            .single()

        if (error) {
            toast.error('Erro ao criar seu perfil de entregador')
            console.error(error)
            return null
        }

        const { data: empData } = await supabase.from('employees').select('*').eq('store_id', profile.id).eq('is_active', true)
        setEmployees(empData || [])
        await fetchEmployeeRoutes()

        return newEmp.id
    }

    const handleAssignDelivery = async (employeeId?: string) => {
        const empId = employeeId || selectedEmployeeId
        if (!empId || selectedOrderIds.size === 0 || !profile) return
        setAssigning(true)

        try {
            const { store_lat, store_lng } = profile
            if (!store_lat || !store_lng) {
                toast.error('Configure as coordenadas do perfil.')
                setAssigning(false)
                return
            }

            const ordersToAssign = groupedOrders.filter(o => selectedOrderIds.has(o.checkout_id))
            if (ordersToAssign.some(o => !o.delivery_lat || !o.delivery_lng)) {
                toast.error('Alguns pedidos não têm coordenadas de entrega.')
                setAssigning(false)
                return
            }

            const { error: deleteError } = await supabase
                .from('delivery_assignments')
                .delete()
                .in('checkout_id', Array.from(selectedOrderIds))

            if (deleteError) {
                console.error('[Painel] Erro ao limpar atribuições anteriores:', deleteError)
                toast.error('Erro ao limpar atribuições anteriores.')
                setAssigning(false)
                return
            }

            const stops = ordersToAssign.map(o => ({ id: o.checkout_id, lat: o.delivery_lat, lng: o.delivery_lng }))
            const optimized = optimizeRoute(store_lat, store_lng, stops)
            const inserts = optimized.map(stop => ({
                store_id: profile.id,
                employee_id: empId,
                checkout_id: stop.id,
                sequence_order: stop.sequence,
                status: 'pending'
            }))

            const { error: insertError } = await supabase.from('delivery_assignments').insert(inserts)
            if (insertError) {
                console.error('[Painel] Erro ao atribuir entregas:', insertError)
                toast.error(`Erro ao atribuir: ${insertError.message}`)
                setAssigning(false)
                return
            }

            toast.success('Entregas atribuídas com sucesso!')
            setSelectedOrderIds(new Set())
            setShowAssignModal(false)
            setSelectedEmployeeId(null)
            loadDashboard()
            fetchEmployeeRoutes()
        } catch (err: any) {
            console.error('[Painel] Erro inesperado:', err)
            toast.error('Erro inesperado ao atribuir entregas.')
        } finally {
            setAssigning(false)
        }
    }

    const handleSingleAssign = async (employeeId: string, order: any) => {
        if (!profile || !employeeId) return
        setAssigning(true)
        try {
            await supabase.from('delivery_assignments').delete().eq('checkout_id', order.checkout_id)

            const { error } = await supabase.from('delivery_assignments').insert({
                store_id: profile.id,
                employee_id: employeeId,
                checkout_id: order.checkout_id,
                sequence_order: 1,
                status: 'pending'
            })

            if (error) throw error

            toast.success(`Pedido atribuído ao entregador!`)
            setSingleAssignOpen(null)
            loadDashboard()
            fetchEmployeeRoutes()
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setAssigning(false)
        }
    }

    const handleAssignAsOwner = async () => {
        const ownerId = await ensureOwnerEmployee()
        if (ownerId) {
            await handleAssignDelivery(ownerId)
        }
    }

    const handleSingleAssignAsOwner = async () => {
        if (!singleAssignOpen) return
        const ownerId = await ensureOwnerEmployee()
        if (ownerId) {
            await handleSingleAssign(ownerId, singleAssignOpen.order)
        }
    }

    const handleOrderAction = async (status: string) => {
        if (!selectedOrder) return
        await supabase.from('orders').update({ status }).eq('checkout_id', selectedOrder.checkout_id)
        setSelectedOrder(null); loadDashboard(); toast.success('Status atualizado.')
    }

    const sortedProducts = [...products].sort((a, b) => {
        switch (sortBy) {
            case 'mostSold': return b.salesCount - a.salesCount
            case 'leastSold': return a.salesCount - b.salesCount
            case 'mostExpensive': return b.price - a.price
            case 'cheapest': return a.price - b.price
            default: return 0
        }
    })

    // ===== DETERMINA STATUS ABERTO/FECHADO =====
    const todaySchedule = getTodaySchedule(profile?.business_hours)
    const storeOpen = isOpenNow(todaySchedule)

    const newOrders = groupedOrders.filter(o => o.status === 'pending')
    const preparing = groupedOrders.filter(o => o.status === 'preparing')
    const ready = groupedOrders.filter(o => o.status === 'ready')
    const finished = groupedOrders.filter(o => o.status === 'paid')

    const selectedAssignment = selectedOrder ? assignmentMap.get(selectedOrder.checkout_id) : null

    // Componente OrderItem (para pedidos da loja)
    const OrderItem = ({ order, showAssignButton = true }: { order: any; showAssignButton?: boolean }) => {
        const isInPerson = !order.buyer_profile_slug
        const channelLabel = isInPerson ? 'v. presencial' : 'v. online'
        const channelColor = isInPerson ? '#22c55e' : '#3b82f6'
        const channelBg = isInPerson ? '#22c55e15' : '#3b82f615'

        return (
            <div
                className="flex items-center justify-between p-2 rounded-lg mb-1"
                style={{ background: channelBg }}
            >
                <div className="flex-1 flex items-center justify-between cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                            {isInPerson ? (
                                <>
                                    <Store size={12} style={{ color: '#22c55e' }} />
                                    <span className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {order.buyer_name || 'Presencial'}
                                    </span>
                                </>
                            ) : (
                                <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    @{order.buyer_profile_slug}
                                </span>
                            )}
                            <span
                                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ background: channelBg, color: channelColor }}
                            >
                                {channelLabel}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-0.5">
                            <span style={{ color: colors.textPrimary }}>
                                R$ {order.totalPrice.toFixed(2)}
                            </span>
                            {order.deliveryFee > 0 && (
                                <span style={{ color: colors.textSecondary }}>
                                    frete R$ {order.deliveryFee.toFixed(2)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right" />
                </div>
                {showAssignButton && !isInPerson && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setSingleAssignOpen({ order })
                        }}
                        className="ml-2 p-1.5 rounded-full hover:bg-white/10 transition-colors"
                        title="Atribuir entregador"
                    >
                        <Send size={14} style={{ color: colors.accent }} />
                    </button>
                )}
            </div>
        )
    }

    if (loading) return <LoadingSpinner message="Carregando perfil..." />
    if (!profile) return null

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
            {/* Header - Avatar e Nome clicáveis */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 cursor-pointer" onClick={goToPublicProfile}>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                        {profile.avatar_url ? (
                            <img src={profile.avatar_url} className="w-full h-full object-cover" alt={profile.name} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-bold" style={{ color: colors.textPrimary }}>
                                {profile.name?.charAt(0) || '@'}
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black hover:underline transition-all" style={{ color: colors.textPrimary }}>
                            {profile.name || `@${profileSlug}`}
                        </h2>
                        <div className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                            <span className={`w-2 h-2 rounded-full ${storeOpen ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span>{storeOpen ? 'Aberto' : 'Fechado'}</span>
                            <span>•</span>
                            <span>@{profileSlug}</span>
                            {profile.whatsapp && (
                                <>
                                    <span>•</span>
                                    <Phone size={12} />
                                    <span>{profile.whatsapp}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* ===== Botões da Loja ===== */}
            <div className="mb-6 mt-4">
                <div className="flex gap-3">
                    <button
                        onClick={goToPublicProfile}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-105"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                        }}
                    >
                        <ExternalLink size={18} />
                        Página do Perfil
                    </button>
                    <button
                        onClick={copyStoreLink}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-105"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                        }}
                    >
                        <Copy size={18} />
                        Copiar Link
                    </button>
                    <button
                        onClick={() => router.push(`/${profileSlug}/editar-perfil`)}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-105"
                        style={{
                            background: colors.accent,
                            color: colors.accentText,
                            boxShadow: `0 4px 12px ${colors.accent}40`,
                        }}
                    >
                        <Pencil size={18} />
                        Editar Loja
                    </button>
                </div>
            </div>

            {/* ===== Métricas (Comprador) ===== */}
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
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Gastos Hoje
                            </h3>
                            <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                <span className="text-2xl font-black" style={{ color: colors.accent }}>
                                    R$ {metrics.daily.spent.toFixed(2)}
                                </span>
                                <span>•</span>
                                <span>
                                    <span className="font-bold" style={{ color: '#10b981' }}>
                                        {metrics.daily.orders}
                                    </span>{' '}
                                    pedidos hoje
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Cards de resumo */}
                    <div className="grid grid-cols-3 gap-3">
                        <div
                            className="rounded-xl p-3 text-center"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <ShoppingCart size={20} style={{ color: colors.accent, margin: '0 auto 4px' }} />
                            <p className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                {metrics.total.orders}
                            </p>
                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                Total de pedidos
                            </p>
                        </div>
                        <div
                            className="rounded-xl p-3 text-center"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <Store size={20} style={{ color: '#22c55e', margin: '0 auto 4px' }} />
                            <p className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                {metrics.total.stores}
                            </p>
                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                Lojas diferentes
                            </p>
                        </div>
                        <div
                            className="rounded-xl p-3 text-center"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <Star size={20} style={{ color: '#f59e0b', margin: '0 auto 4px' }} />
                            <p className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                {reviews.length}
                            </p>
                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                Avaliações
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== Métricas de Vendas (Vendedor) ===== */}
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
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Vendas Hoje
                            </h3>
                            <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                <span className="text-2xl font-black" style={{ color: colors.accent }}>
                                    R$ {metrics.revenue.daily.toFixed(2)}
                                </span>
                                <span>•</span>
                                <span>
                                    <span className="font-bold" style={{ color: '#10b981' }}>
                                        {metrics.revenue.orders}
                                    </span>{' '}
                                    pedidos finalizados
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== Venda Presencial ===== */}
            {profile && (
                <div className="mb-6 mt-4">
                    <ButtonInPersonSale
                        storeId={profile.id}
                        storeName={profile.name || 'Perfil'}
                        storeSlug={profileSlug || ''}
                        profileSlug={profileSlug || ''}
                        onSaleCompleted={() => loadDashboard()}
                    />
                </div>
            )}

            {/* ===== Pedidos da Loja ===== */}
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                    color: colors.accentText,
                                }}
                            >
                                <ShoppingCart size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    Pedidos para mim
                                </h3>
                                <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                    <span>
                                        <span className="font-bold" style={{ color: '#3b82f6' }}>{newOrders.length}</span> pendentes
                                    </span>
                                    <span>•</span>
                                    <span>
                                        <span className="font-bold" style={{ color: '#f59e0b' }}>{preparing.length}</span> preparo
                                    </span>
                                    <span>•</span>
                                    <span>
                                        <span className="font-bold" style={{ color: '#8b5cf6' }}>{ready.length}</span> prontos
                                    </span>
                                    <span>•</span>
                                    <span>
                                        <span className="font-bold" style={{ color: '#10b981' }}>{finished.length}</span> finalizados
                                    </span>
                                </div>
                            </div>
                        </div>

                        {selectedOrderIds.size > 0 && (
                            <button
                                onClick={() => setShowAssignModal(true)}
                                className="text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-md transition-all hover:scale-105"
                                style={{
                                    background: colors.accent,
                                    color: colors.accentText,
                                    boxShadow: `0 4px 12px ${colors.accent}40`,
                                }}
                            >
                                <Send size={14} />
                                Atribuir {selectedOrderIds.size}
                            </button>
                        )}
                    </div>

                    {/* Lista de pedidos */}
                    {groupedOrders.length === 0 ? (
                        <div
                            className="rounded-xl p-6 text-center"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhum pedido ainda.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {newOrders.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#3b82f6' }}>
                                        Novos ({newOrders.length})
                                    </h4>
                                    {newOrders.map(order => <OrderItem key={order.checkout_id} order={order} />)}
                                </div>
                            )}

                            {preparing.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#f59e0b' }}>
                                        Em Preparo ({preparing.length})
                                    </h4>
                                    {preparing.map(order => {
                                        const isAssigned = assignmentMap.has(order.checkout_id)
                                        return (
                                            <div key={order.checkout_id} className="mb-1">
                                                <OrderItem order={order} showAssignButton={!isAssigned} />
                                                {isAssigned && (
                                                    <div className="flex items-center justify-between px-2 py-1 ml-2 border-l-2" style={{ borderColor: colors.accent }}>
                                                        <span className="text-[10px]" style={{ color: colors.accent }}>
                                                            🚚 {assignmentMap.get(order.checkout_id)?.employeeName} • {formatAssignmentStatus(assignmentMap.get(order.checkout_id)?.status || '')}
                                                        </span>
                                                        <button
                                                            onClick={() => setSingleAssignOpen({ order })}
                                                            className="px-3 py-1 rounded-full text-xs font-bold"
                                                            style={{ background: colors.accent, color: 'white' }}
                                                        >
                                                            Trocar entregador
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {ready.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#8b5cf6' }}>
                                        Prontos ({ready.length})
                                    </h4>
                                    {ready.map(order => {
                                        const isAssigned = assignmentMap.has(order.checkout_id)
                                        return (
                                            <div key={order.checkout_id} className="mb-1">
                                                <OrderItem order={order} showAssignButton={!isAssigned} />
                                                {isAssigned && (
                                                    <div className="flex items-center justify-between px-2 py-1 ml-2 border-l-2" style={{ borderColor: colors.accent }}>
                                                        <span className="text-[10px]" style={{ color: colors.accent }}>
                                                            🚚 {assignmentMap.get(order.checkout_id)?.employeeName} • {formatAssignmentStatus(assignmentMap.get(order.checkout_id)?.status || '')}
                                                        </span>
                                                        <button
                                                            onClick={() => setSingleAssignOpen({ order })}
                                                            className="px-3 py-1 rounded-full text-xs font-bold"
                                                            style={{ background: colors.accent, color: 'white' }}
                                                        >
                                                            Trocar entregador
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {finished.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#22c55e' }}>
                                        Finalizados ({finished.length})
                                    </h4>
                                    {finished.slice(0, 5).map(order => <OrderItem key={order.checkout_id} order={order} showAssignButton={false} />)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== Produtos do Perfil ===== */}
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
                    {/* Cabeçalho com toggle */}
                    <button
                        onClick={() => setIsProductsExpanded(!isProductsExpanded)}
                        className="w-full flex items-center justify-between text-left"
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                    color: colors.accentText,
                                }}
                            >
                                <Package size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    Meus Produtos
                                </h3>
                                <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                    <span>{products.length} cadastrados</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {products.length > 0 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: colors.accentLight, color: colors.accent }}>
                                    {products.length}
                                </span>
                            )}
                            {isProductsExpanded ? (
                                <ChevronUp size={22} style={{ color: colors.textSecondary }} />
                            ) : (
                                <ChevronDown size={22} style={{ color: colors.textSecondary }} />
                            )}
                        </div>
                    </button>

                    {isProductsExpanded && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 text-xs" style={{ color: colors.textSecondary }}>
                                        <ArrowUpDown size={14} />
                                        <select
                                            value={sortBy}
                                            onChange={e => setSortBy(e.target.value as any)}
                                            className="bg-transparent border rounded px-2 py-1 text-xs"
                                            style={{ borderColor: colors.border, color: colors.textPrimary }}
                                        >
                                            <option value="mostSold">Mais vendidos</option>
                                            <option value="leastSold">Menos vendidos</option>
                                            <option value="mostExpensive">Mais caro</option>
                                            <option value="cheapest">Mais barato</option>
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(`/${profileSlug}/criar-produto`)}
                                    className="text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-md transition-all hover:scale-105"
                                    style={{
                                        background: colors.accent,
                                        color: colors.accentText,
                                        boxShadow: `0 4px 12px ${colors.accent}40`,
                                    }}
                                >
                                    <Plus size={14} /> Adicionar
                                </button>
                            </div>

                            {products.length === 0 ? (
                                <div
                                    className="rounded-xl p-6 text-center"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px dashed ${colors.border}`,
                                    }}
                                >
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                                        Nenhum produto cadastrado.
                                    </p>
                                    <button
                                        onClick={() => router.push(`/${profileSlug}/criar-produto`)}
                                        className="mt-3 text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1 mx-auto"
                                        style={{ background: colors.accent, color: 'white' }}
                                    >
                                        <Plus size={14} /> Criar primeiro produto
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-400">
                                    {sortedProducts.map(prod => {
                                        const imgUrl = prod.image_url ? supabase.storage.from('product-images').getPublicUrl(prod.image_url).data.publicUrl : null
                                        return (
                                            <div
                                                key={prod.id}
                                                className="flex-shrink-0 w-40 rounded-2xl border p-3 flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow relative"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, borderColor: colors.border }}
                                                onClick={() => router.push(`/${profileSlug}/${prod.slug || prod.id}`)}
                                            >
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        router.push(`/${profileSlug}/${prod.slug || prod.id}/editar-produto`)
                                                    }}
                                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-colors z-10"
                                                    title="Editar produto"
                                                >
                                                    <Pencil size={14} color="white" />
                                                </button>

                                                <div className="w-full h-28 rounded-xl overflow-hidden bg-gray-100">
                                                    {imgUrl ? <img src={imgUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: colors.textSecondary }}>📦</div>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{prod.name}</p>
                                                    <p className="text-xs font-bold mt-1" style={{ color: colors.accent }}>R$ {Number(prod.price).toFixed(2)}</p>
                                                    <div className="flex flex-col text-[10px] mt-1 space-y-0.5" style={{ color: colors.textSecondary }}>
                                                        <span>👁 {prod.viewsToday} hoje</span>
                                                        <span>🛒 {prod.inCart} na sacola</span>
                                                        <span>📊 {prod.viewsTotal} views</span>
                                                        <span>💰 {prod.salesCount} vendas</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ===== Funcionários ===== */}
            <div className="mb-6 mt-4">
                <Employee
                    employees={employees}
                    employeeRoutes={employeeRoutes}
                    assignmentMap={assignmentMap}
                    expandedEmployee={expandedEmployee}
                    onToggleExpand={setExpandedEmployee}
                    storeId={profile?.id || ''}
                    onRefresh={fetchEmployeeRoutes}
                />
            </div>

            {/* ===== Informações do Perfil ===== */}
            <StoreAddress address={profile.address} whatsapp={profile.whatsapp} />

            {/* ===== Agendamentos (AtalhoCompromissosPessoal) ===== */}
            <AtalhoCompromissosPessoal
                profileSlug={profileSlug}
                userAvatarUrl={profile.avatar_url}
            />

            {/* ===== Dias de funcionamento ===== */}
            <StoreOperatingDays storeId={profile?.id || ''} />

            {/* ===== Publicações ===== */}
            <Publication storeId={profile?.id || ''} />

            {/* ===== Visitantes ===== */}

            <ProfileVisitors key={profile.id} profileId={profile.id} />
            {/* ===== Pedidos Recentes (Comprador) ===== */}
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
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            <Package size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Compras Recentes
                            </h3>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                                {orders.length} compras encontradas
                            </p>
                        </div>
                    </div>

                    {orders.length === 0 ? (
                        <div
                            className="rounded-xl p-6 text-center"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}
                        >
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Nenhum pedido ainda.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {orders.slice(0, 10).map((order: any) => {
                                const status = formatStatus(order.status)
                                return (
                                    <div
                                        key={order.checkout_id}
                                        className="flex items-center justify-between p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            border: `1px solid ${colors.border}`,
                                        }}
                                        onClick={() => router.push(`/${profileSlug}/${order.store_slug}`)}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                                                {order.store_logo ? (
                                                    <img src={order.store_logo} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                                                        {order.store_name?.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {order.store_name}
                                                </p>
                                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                                    {order.items?.length || 0} itens • R$ {order.totalPrice.toFixed(2)}
                                                </p>
                                            </div>
                                        </div>
                                        <span
                                            className="px-2 py-1 rounded-full text-[10px] font-bold flex-shrink-0"
                                            style={{ background: `${status.color}20`, color: status.color }}
                                        >
                                            {status.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== Lojas Favoritas ===== */}
            {favoriteStores.length > 0 && (
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
                                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, #ef4444, #f97316)`,
                                    color: 'white',
                                }}
                            >
                                <Heart size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    Lojas Favoritas
                                </h3>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    Mais pedidas por você
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {favoriteStores.map((store: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="flex-shrink-0 w-32 rounded-xl p-3 text-center cursor-pointer hover:shadow-md transition-shadow"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px solid ${colors.border}`,
                                    }}
                                    onClick={() => router.push(`/${profileSlug}/${store.slug}`)}
                                >
                                    <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 mx-auto mb-2">
                                        {store.logo_url ? (
                                            <img src={store.logo_url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-lg font-bold">
                                                {store.name?.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {store.name}
                                    </p>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        {store.orderCount} pedidos
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Produtos Visualizados ===== */}
            {recentViews.length > 0 && (
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
                                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, #3b82f6, #06b6d4)`,
                                    color: 'white',
                                }}
                            >
                                <Eye size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    Vistos Recentemente
                                </h3>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    Produtos que você visitou
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {recentViews.map((view: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="flex-shrink-0 w-36 rounded-xl p-3 cursor-pointer hover:shadow-md transition-shadow"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px solid ${colors.border}`,
                                    }}
                                    onClick={() => router.push(`/${profileSlug}/${view.store_slug}/${view.product_slug}`)}
                                >
                                    <div className="w-full h-24 rounded-lg overflow-hidden bg-gray-100 mb-2">
                                        {view.image_url ? (
                                            <img src={view.image_url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                                        )}
                                    </div>
                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {view.product_name}
                                    </p>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        {view.store_name} • R$ {Number(view.price).toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Avaliações ===== */}
            {reviews.length > 0 && (
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
                                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, #f59e0b, #f97316)`,
                                    color: 'white',
                                }}
                            >
                                <Star size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    Avaliações que fiz
                                </h3>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    {reviews.length} avaliações feitas
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {reviews.map((review: any) => (
                                <div
                                    key={review.id}
                                    className="p-3 rounded-xl"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                            {review.product_name}
                                        </p>
                                        <RatingStars value={review.rating} size={12} />
                                    </div>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        {review.store_name}
                                    </p>
                                    {review.comment && (
                                        <p className="text-xs mt-1" style={{ color: colors.textPrimary }}>
                                            "{review.comment}"
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Agendamentos ===== */}
            {upcomingSchedules.length > 0 && (
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
                                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, #8b5cf6, #a855f7)`,
                                    color: 'white',
                                }}
                            >
                                <Calendar size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    Agendamentos
                                </h3>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    Próximos compromissos
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {upcomingSchedules.map((schedule: any) => (
                                <div
                                    key={schedule.id}
                                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px solid ${colors.border}`,
                                    }}
                                    onClick={() => router.push(`/${profileSlug}/${schedule.store_slug}`)}
                                >
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                                        {schedule.store_logo ? (
                                            <img src={schedule.store_logo} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                                                {schedule.store_name?.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {schedule.store_name}
                                        </p>
                                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                                            {new Date(schedule.date).toLocaleDateString('pt-BR')} às {schedule.time}
                                        </p>
                                        {schedule.service_type && (
                                            <p className="text-[10px]" style={{ color: colors.accent }}>
                                                {schedule.service_type}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className="px-2 py-1 rounded-full text-[10px] font-bold"
                                        style={{
                                            background: schedule.status === 'confirmed' ? '#22c55e20' : '#f59e0b20',
                                            color: schedule.status === 'confirmed' ? '#22c55e' : '#f59e0b',
                                        }}
                                    >
                                        {schedule.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Ações rápidas ===== */}
            <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                    onClick={goToPublicProfile}
                    className="p-3 rounded-2xl border flex items-center gap-2"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                        borderColor: colors.border,
                    }}
                >
                    <User size={18} /> Ver perfil público
                </button>
                <button
                    onClick={() => router.push(`/${profileSlug}/configuracoes`)}
                    className="p-3 rounded-2xl border flex items-center gap-2"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                        borderColor: colors.border,
                    }}
                >
                    <Settings size={18} /> Configurações
                </button>
                <button
                    onClick={() => router.push(`/${profileSlug}/editar-perfil`)}
                    className="p-3 rounded-2xl border flex items-center gap-2"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                        borderColor: colors.border,
                    }}
                >
                    <Pencil size={18} /> Editar perfil
                </button>
            </div>

            {/* ===== SACOLA + HOME (agrupados no canto direito) ===== */}
            <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                <SacolaButton
                    totalItems={totalCartItems}
                    statusCounts={{
                        pending: pendingCount,
                        preparing: preparingCount,
                        ready: readyCount,
                        reviews: pendingReviewsCount,
                    }}
                    animate={cartAnimating}
                />
                <button
                    onClick={onBack}
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                    style={{
                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                        color: colors.accentText,
                        border: `2px solid ${colors.border}`,
                        boxShadow: `0 8px 24px ${colors.accent}60`,
                    }}
                    aria-label="Voltar ao início"
                >
                    <Home size={24} />
                </button>
            </div>

            {/* ===== Modais ===== */}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
                    <div className="w-full max-w-sm rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Selecionar Entregador</h3>
                            <button onClick={() => setShowAssignModal(false)}><X size={20} /></button>
                        </div>
                        <div className="space-y-2">
                            {ownerProfile && (
                                <div onClick={handleAssignAsOwner} className="p-3 rounded-xl cursor-pointer border flex items-center gap-3 hover:bg-white/5 transition-colors" style={{ borderColor: colors.border }}>
                                    <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-sm text-white font-bold">{ownerProfile.name?.charAt(0) || 'D'}</div>
                                    <div>
                                        <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>Eu (dono)</p>
                                        {ownerProfile.phone && <p className="text-xs" style={{ color: colors.textSecondary }}>{ownerProfile.phone}</p>}
                                    </div>
                                </div>
                            )}
                            {employees.map(emp => (
                                <div key={emp.id} onClick={() => setSelectedEmployeeId(emp.id)} className={`p-3 rounded-xl cursor-pointer ${selectedEmployeeId === emp.id ? 'ring-2' : ''}`} style={{ background: selectedEmployeeId === emp.id ? `${colors.accent}20` : 'transparent', border: `1px solid ${colors.border}` }}>
                                    <p className="font-bold" style={{ color: colors.textPrimary }}>{emp.name}</p>
                                    {emp.phone && <p className="text-xs" style={{ color: colors.textSecondary }}>{emp.phone}</p>}
                                </div>
                            ))}
                        </div>
                        <button onClick={() => handleAssignDelivery()} disabled={!selectedEmployeeId || assigning} className="w-full mt-4 py-2 rounded-full font-bold" style={{ background: selectedEmployeeId ? colors.accent : colors.border, color: selectedEmployeeId ? 'white' : colors.textSecondary }}>
                            {assigning ? 'Atribuindo...' : 'Confirmar'}
                        </button>
                    </div>
                </div>
            )}

            {singleAssignOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSingleAssignOpen(null)}>
                    <div className="w-full max-w-xs rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Atribuir pedido</h3>
                            <button onClick={() => setSingleAssignOpen(null)}><X size={20} /></button>
                        </div>
                        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>Pedido de @{singleAssignOpen.order.buyer_profile_slug || singleAssignOpen.order.buyer_name || 'Cliente'} • R$ {singleAssignOpen.order.totalPrice.toFixed(2)}</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {ownerProfile && (
                                <div onClick={handleSingleAssignAsOwner} className="p-3 rounded-xl cursor-pointer border flex items-center gap-3 hover:bg-white/5 transition-colors" style={{ borderColor: colors.border }}>
                                    <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-sm text-white font-bold">{ownerProfile.name?.charAt(0) || 'D'}</div>
                                    <div>
                                        <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>Eu (dono)</p>
                                        {ownerProfile.phone && <p className="text-xs" style={{ color: colors.textSecondary }}>{ownerProfile.phone}</p>}
                                    </div>
                                </div>
                            )}
                            {employees.length === 0 ? (
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum funcionário cadastrado.</p>
                            ) : (
                                employees.map(emp => (
                                    <div key={emp.id} onClick={() => handleSingleAssign(emp.id, singleAssignOpen.order)} className="p-3 rounded-xl cursor-pointer border flex items-center gap-3 hover:bg-white/5 transition-colors" style={{ borderColor: colors.border }}>
                                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm text-white font-bold">{emp.name.charAt(0)}</div>
                                        <div>
                                            <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>{emp.name}</p>
                                            {emp.phone && <p className="text-xs" style={{ color: colors.textSecondary }}>{emp.phone}</p>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedOrder && (
                <OrderModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onAction={handleOrderAction}
                    assignmentInfo={selectedAssignment || undefined}
                    storeLat={profile.store_lat}
                    storeLng={profile.store_lng}
                />
            )}
        </div>
    )
}