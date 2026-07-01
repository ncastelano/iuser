// components/PainelDaLoja.tsx
'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { RatingStars } from '@/components/ratings/RatingStars'
import { toast } from 'sonner'
import {
    Eye,
    Calendar,
    Settings,
    Plus,
    Users,
    RefreshCw,
    ChevronRight,
    Clock3,
    X,
    Truck,
    CheckSquare,
    Square,
    Send,
    DollarSign,
    ShoppingCart,
    CreditCard,
    QrCode,
    Save,
    Package,
    ArrowUpDown,
    Pencil,
    MapPin,
    Phone,
    Store,
} from 'lucide-react'
import { OrderModal } from '../../components/OrderModal'

// Helpers de data
function startOfDay(date: Date = new Date()): string {
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
}

const DAYS_OF_WEEK = [
    { key: 'mon', label: 'Segunda' },
    { key: 'tue', label: 'Terça' },
    { key: 'wed', label: 'Quarta' },
    { key: 'thu', label: 'Quinta' },
    { key: 'fri', label: 'Sexta' },
    { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' },
]

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

export default function PainelDaLoja({ profileSlug, storeSlug, onBack }: { profileSlug: string; storeSlug: string; onBack?: () => void }) {
    const router = useRouter()
    const { colors } = useTheme()

    const [store, setStore] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const [onlineNow, setOnlineNow] = useState(0)
    const [todayVisitsCount, setTodayVisitsCount] = useState(0)
    const [totalUniqueVisitors, setTotalUniqueVisitors] = useState(0)

    const [groupedOrders, setGroupedOrders] = useState<any[]>([])
    const [metrics, setMetrics] = useState({ daily: { revenue: 0, orders: 0 } })

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

    const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string }>>({})
    const [showScheduleEditor, setShowScheduleEditor] = useState(false)
    const [savingSchedule, setSavingSchedule] = useState(false)
    const [dialogOpen, setDialogOpen] = useState<'online' | 'today' | 'all' | null>(null)

    const [acceptsPix, setAcceptsPix] = useState(false)
    const [acceptsCard, setAcceptsCard] = useState(false)
    const [acceptsDelivery, setAcceptsDelivery] = useState(false)
    const [acceptsPickup, setAcceptsPickup] = useState(false)
    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState<'cpf' | 'email' | 'phone' | 'random'>('cpf')
    const [deliveryMode, setDeliveryMode] = useState<'fixed' | 'distance'>('fixed')
    const [fixedDeliveryFee, setFixedDeliveryFee] = useState('')
    const [distanceRules, setDistanceRules] = useState<{ max_km: string; fee: string }[]>([])
    const [savingConfig, setSavingConfig] = useState(false)

    const intervalRef = useRef<any>(null)

    const fetchVisitorData = useCallback(async (storeId: string) => {
        const oneMinAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        const todayISO = todayStart.toISOString()

        const { data: online } = await supabase.from('store_views').select('viewer_id, anonymous_id').eq('store_id', storeId).gte('created_at', oneMinAgo)
        setOnlineNow(new Set(online?.map(v => v.viewer_id || v.anonymous_id)).size)

        const { data: today } = await supabase.from('store_views').select('viewer_id, anonymous_id').eq('store_id', storeId).gte('created_at', todayISO)
        setTodayVisitsCount(new Set(today?.map(v => v.viewer_id || v.anonymous_id)).size)

        const { data: all } = await supabase.from('store_views').select('viewer_id, anonymous_id').eq('store_id', storeId)
        setTotalUniqueVisitors(new Set(all?.map(v => v.viewer_id || v.anonymous_id)).size)
    }, [])

    const loadDashboard = useCallback(async () => {
        if (!storeSlug || !profileSlug) return
        setLoading(true)

        const { data: storeData } = await supabase.from('stores').select('*').ilike('storeSlug', storeSlug).maybeSingle()
        if (!storeData) { toast.error('Loja não encontrada'); setLoading(false); return }

        const logoUrl = storeData.logo_url ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl : null
        setStore({ ...storeData, logo_url: logoUrl })
        setBusinessHours(storeData.business_hours || {})

        setAcceptsPix(storeData.accepts_pix ?? true)
        setAcceptsCard(storeData.accepts_card ?? true)
        setAcceptsDelivery(storeData.accepts_delivery ?? false)
        setAcceptsPickup(storeData.accepts_pickup ?? false)
        setPixKey(storeData.pix_key || '')
        setPixKeyType(storeData.pix_key_type || 'cpf')

        if (storeData.delivery_type === 'fixed') {
            setDeliveryMode('fixed')
            setFixedDeliveryFee(storeData.delivery_fee ? String(storeData.delivery_fee) : '')
        } else if (storeData.delivery_type === 'distance') {
            setDeliveryMode('distance')
            setDistanceRules(storeData.delivery_distance_rules || [])
        } else {
            setDeliveryMode('fixed')
            setFixedDeliveryFee('')
        }

        const storeId = storeData.id

        const { data: ordersData, error: ordersError } = await supabase
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
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })
            .limit(100)

        if (ordersError) {
            console.error('[Painel] Erro ao buscar pedidos:', ordersError)
            toast.error('Erro ao carregar pedidos')
            setLoading(false)
            return
        }

        const grouped = (ordersData || []).map(order => {
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

        const todayStart = startOfDay()
        const dailyOrders = (ordersData || []).filter(o =>
            new Date(o.created_at).getTime() >= new Date(todayStart).getTime() &&
            o.status === 'paid'
        )
        const dailyRev = dailyOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
        setMetrics({ daily: { revenue: dailyRev, orders: dailyOrders.length } })

        const { data: productsData } = await supabase
            .from('products')
            .select('id, name, price, image_url, slug')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })
            .limit(12)

        if (productsData && productsData.length > 0) {
            const productIds = productsData.map(p => p.id)
            const todayStartISO = startOfDay()

            const { data: viewsToday } = await supabase.from('product_views')
                .select('product_id').in('product_id', productIds).gte('created_at', todayStartISO)
            const viewsTodayMap = new Map()
            viewsToday?.forEach(v => viewsTodayMap.set(v.product_id, (viewsTodayMap.get(v.product_id) || 0) + 1))

            const { data: viewsTotal } = await supabase.from('product_views')
                .select('product_id').in('product_id', productIds)
            const viewsTotalMap = new Map()
            viewsTotal?.forEach(v => viewsTotalMap.set(v.product_id, (viewsTotalMap.get(v.product_id) || 0) + 1))

            const { data: orderIdsData } = await supabase
                .from('orders')
                .select('id')
                .eq('store_id', storeId)
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

            const combined = productsData.map(p => ({
                ...p,
                viewsToday: viewsTodayMap.get(p.id) || 0,
                viewsTotal: viewsTotalMap.get(p.id) || 0,
                inCart: 0,
                salesCount: salesCountMap.get(p.id) || 0,
            }))
            setProducts(combined)
        } else {
            setProducts([])
        }

        const { data: empData } = await supabase.from('employees').select('*').eq('store_id', storeId).eq('is_active', true)
        setEmployees(empData || [])

        await fetchVisitorData(storeId)
        setLoading(false)
    }, [storeSlug, profileSlug, fetchVisitorData])

    useEffect(() => { loadDashboard() }, [loadDashboard])

    const fetchEmployeeRoutes = useCallback(async () => {
        if (!store?.id) return

        // 1. Busca as atribuições
        const { data: assignments, error: assignError } = await supabase
            .from('delivery_assignments')
            .select('employee_id, checkout_id, sequence_order, status')
            .eq('store_id', store.id)
            .order('sequence_order')

        if (assignError) {
            console.error('[Painel] Erro ao buscar atribuições:', assignError)
            return
        }
        if (!assignments || assignments.length === 0) {
            setEmployeeRoutes([])
            return
        }

        // 2. Extrai os checkout_ids únicos
        const checkoutIds = [...new Set(assignments.map(a => a.checkout_id))]

        // 3. Busca os pedidos correspondentes com seus itens
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

        if (ordersError) {
            console.error('[Painel] Erro ao buscar pedidos das rotas:', ordersError)
            return
        }

        // 4. Cria um mapa de pedidos por checkout_id
        const ordersMap = new Map<string, any>()
        orders?.forEach(order => {
            ordersMap.set(order.checkout_id, order)
        })

        // 5. Monta as rotas por entregador
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
    }, [store?.id, employees])

    useEffect(() => { if (store?.id) fetchEmployeeRoutes() }, [store?.id, employees, fetchEmployeeRoutes])

    useEffect(() => {
        if (!store?.id) return
        const ordersChannel = supabase
            .channel(`painel-orders-${store.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${store.id}` },
                () => loadDashboard()
            )
            .subscribe()

        const assignmentsChannel = supabase
            .channel(`painel-assignments-${store.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'delivery_assignments', filter: `store_id=eq.${store.id}` },
                () => fetchEmployeeRoutes()
            )
            .subscribe()

        intervalRef.current = setInterval(() => fetchVisitorData(store.id), 10000)

        return () => {
            supabase.removeChannel(ordersChannel)
            supabase.removeChannel(assignmentsChannel)
            clearInterval(intervalRef.current)
        }
    }, [store?.id, loadDashboard, fetchVisitorData, fetchEmployeeRoutes])

    const handleRefresh = () => { setRefreshing(true); loadDashboard().finally(() => setRefreshing(false)) }

    const toggleOrderSelection = (id: string) => {
        const next = new Set(selectedOrderIds)
        next.has(id) ? next.delete(id) : next.add(id)
        setSelectedOrderIds(next)
    }

    const handleAssignDelivery = async () => {
        if (!selectedEmployeeId || selectedOrderIds.size === 0 || !store) return
        setAssigning(true)

        try {
            const { store_lat, store_lng } = store
            if (!store_lat || !store_lng) {
                toast.error('Configure as coordenadas da loja.')
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
                store_id: store.id,
                employee_id: selectedEmployeeId,
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
        if (!store || !employeeId) return
        setAssigning(true)
        try {
            await supabase.from('delivery_assignments').delete().eq('checkout_id', order.checkout_id)

            const { error } = await supabase.from('delivery_assignments').insert({
                store_id: store.id,
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

    const handleOrderAction = async (status: string) => {
        if (!selectedOrder) return
        await supabase.from('orders').update({ status }).eq('checkout_id', selectedOrder.checkout_id)
        setSelectedOrder(null); loadDashboard(); toast.success('Status atualizado.')
    }

    const setTimeForDay = (day: string, type: 'open' | 'close', value: string) => setBusinessHours(prev => ({ ...prev, [day]: { ...(prev[day] || { open: '', close: '' }), [type]: value } }))
    const clearDay = (day: string) => { const n = { ...businessHours }; delete n[day]; setBusinessHours(n) }
    const handleSaveSchedule = async () => {
        setSavingSchedule(true)
        await supabase.from('stores').update({ business_hours: businessHours }).eq('id', store.id)
        toast.success('Horários salvos!'); setShowScheduleEditor(false); setSavingSchedule(false)
    }

    const handleSaveConfig = async () => {
        if (!store) return
        setSavingConfig(true)

        let deliveryType = 'none'
        let deliveryFee = null
        let deliveryDistanceRules = null
        if (acceptsDelivery) {
            if (deliveryMode === 'fixed') {
                deliveryType = 'fixed'
                deliveryFee = fixedDeliveryFee ? parseFloat(fixedDeliveryFee) : 0
            } else {
                deliveryType = 'distance'
                deliveryDistanceRules = distanceRules.map(r => ({ max_km: parseFloat(r.max_km), fee: parseFloat(r.fee) }))
            }
        }

        const { error } = await supabase.from('stores').update({
            accepts_pix: acceptsPix,
            accepts_card: acceptsCard,
            accepts_delivery: acceptsDelivery,
            accepts_pickup: acceptsPickup,
            pix_key: acceptsPix ? pixKey : null,
            pix_key_type: acceptsPix ? pixKeyType : null,
            delivery_type: deliveryType,
            delivery_fee: deliveryFee,
            delivery_distance_rules: deliveryDistanceRules,
        }).eq('id', store.id)

        if (error) { toast.error('Erro ao salvar configurações.'); }
        else { toast.success('Configurações salvas!'); }
        setSavingConfig(false)
    }

    const addDistanceRule = () => setDistanceRules([...distanceRules, { max_km: '', fee: '' }])
    const removeDistanceRule = (index: number) => setDistanceRules(distanceRules.filter((_, i) => i !== index))
    const updateDistanceRule = (index: number, field: 'max_km' | 'fee', value: string) => {
        const updated = [...distanceRules]
        updated[index] = { ...updated[index], [field]: value }
        setDistanceRules(updated)
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

    if (loading) return <LoadingSpinner message="Carregando painel..." />
    if (!store) return null

    const storeOpen = store.is_open
    const newOrders = groupedOrders.filter(o => o.status === 'pending')
    const preparing = groupedOrders.filter(o => o.status === 'preparing')
    const ready = groupedOrders.filter(o => o.status === 'ready')
    const finished = groupedOrders.filter(o => o.status === 'paid')

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <Link href={`/${profileSlug}/${storeSlug}`} className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200">
                        {store.logo_url ? <img src={store.logo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl font-bold">{store.name?.charAt(0)}</div>}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>{store.name}</h2>
                        <div className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                            <span className={`w-2 h-2 rounded-full ${storeOpen ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span>{storeOpen ? 'Aberto' : 'Fechado'}</span>
                            <RatingStars value={store.ratings_avg || 0} size={10} />
                            <span>{Number(store.ratings_avg || 0).toFixed(1)}</span>
                        </div>
                    </div>
                </Link>
                <button onClick={handleRefresh} className="p-2 rounded-full" style={{ background: 'transparent', border: `1px solid ${colors.border}` }}>
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Vendas do dia */}
            <div className="mb-6 p-4 rounded-2xl border" style={{ background: `linear-gradient(135deg, ${colors.accent}20, ${colors.accentLight}20)`, borderColor: colors.border }}>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Vendas Hoje</p>
                        <p className="text-2xl font-black" style={{ color: colors.accent }}>R$ {metrics.daily.revenue.toFixed(2)}</p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>{metrics.daily.orders} pedidos finalizados</p>
                    </div>
                    <DollarSign size={40} style={{ color: colors.accent, opacity: 0.6 }} />
                </div>
            </div>

            {/* Seção de pedidos */}
            <div className="space-y-4 mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}><ShoppingCart size={20} /> Pedidos</h3>

                {selectedOrderIds.size > 0 && (
                    <button onClick={() => setShowAssignModal(true)} className="w-full py-2 rounded-full font-bold text-sm flex items-center justify-center gap-2" style={{ background: colors.accent, color: 'white' }}>
                        <Send size={16} /> Atribuir {selectedOrderIds.size} pedido(s)
                    </button>
                )}

                {newOrders.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: colors.accent }}>Novos ({newOrders.length})</h4>
                        {newOrders.map(order => (
                            <div key={order.checkout_id} className="flex items-center justify-between p-2 rounded-lg mb-1" style={{ background: `${colors.accent}10` }}>
                                <div className="flex-1 flex items-center justify-between cursor-pointer" onClick={() => setSelectedOrder(order)}>
                                    <span style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                    <div className="text-right">
                                        <span style={{ color: colors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                                        {order.deliveryFee > 0 && (
                                            <span className="text-[9px] block" style={{ color: colors.textSecondary }}>frete R$ {order.deliveryFee.toFixed(2)}</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setSingleAssignOpen({ order })
                                    }}
                                    className="ml-2 p-1 rounded-full hover:bg-white/10 transition-colors"
                                    title="Atribuir entregador"
                                >
                                    <Send size={14} style={{ color: colors.accent }} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {preparing.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: colors.accentLight }}>Em Preparo ({preparing.length})</h4>
                        {preparing.map(order => (
                            <div key={order.checkout_id} className="flex items-center justify-between p-2 rounded-lg mb-1" style={{ background: `${colors.accentLight}10` }}>
                                <div className="flex items-center gap-2">
                                    <div onClick={(e) => { e.stopPropagation(); toggleOrderSelection(order.checkout_id) }}>
                                        {selectedOrderIds.has(order.checkout_id) ? <CheckSquare size={16} color={colors.accent} /> : <Square size={16} color={colors.textSecondary} />}
                                    </div>
                                    <span style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        <span style={{ color: colors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                                        {order.deliveryFee > 0 && (
                                            <span className="text-[9px] block" style={{ color: colors.textSecondary }}>frete R$ {order.deliveryFee.toFixed(2)}</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setSingleAssignOpen({ order })
                                        }}
                                        className="p-1 rounded-full hover:bg-white/10 transition-colors"
                                        title="Atribuir entregador"
                                    >
                                        <Send size={14} style={{ color: colors.accent }} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {ready.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#8b5cf6' }}>Prontos ({ready.length})</h4>
                        {ready.map(order => (
                            <div key={order.checkout_id} className="flex items-center justify-between p-2 rounded-lg mb-1" style={{ background: '#8b5cf610' }}>
                                <div className="flex items-center gap-2">
                                    <div onClick={(e) => { e.stopPropagation(); toggleOrderSelection(order.checkout_id) }}>
                                        {selectedOrderIds.has(order.checkout_id) ? <CheckSquare size={16} color={colors.accent} /> : <Square size={16} color={colors.textSecondary} />}
                                    </div>
                                    <span style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        <span style={{ color: colors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                                        {order.deliveryFee > 0 && (
                                            <span className="text-[9px] block" style={{ color: colors.textSecondary }}>frete R$ {order.deliveryFee.toFixed(2)}</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setSingleAssignOpen({ order })
                                        }}
                                        className="p-1 rounded-full hover:bg-white/10 transition-colors"
                                        title="Atribuir entregador"
                                    >
                                        <Send size={14} style={{ color: colors.accent }} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {finished.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#22c55e' }}>Finalizados ({finished.length})</h4>
                        {finished.slice(0, 3).map(order => (
                            <div key={order.checkout_id} onClick={() => setSelectedOrder(order)} className="flex items-center justify-between p-2 rounded-lg mb-1 cursor-pointer" style={{ background: '#22c55e10' }}>
                                <span style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                <div className="text-right">
                                    <span style={{ color: colors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                                    {order.deliveryFee > 0 && (
                                        <span className="text-[9px] block" style={{ color: colors.textSecondary }}>frete R$ {order.deliveryFee.toFixed(2)}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {groupedOrders.length === 0 && <p className="text-center text-sm" style={{ color: colors.textSecondary }}>Nenhum pedido ainda.</p>}
            </div>

            {/* Produtos */}
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}><Package size={16} /> Produtos</h3>
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
                        <button onClick={() => router.push(`/${profileSlug}/${storeSlug}/criar-produto`)} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: colors.accent, color: 'white' }}>+ Adicionar</button>
                    </div>
                </div>
                {products.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum produto cadastrado.</p>
                ) : (
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-400">
                        {sortedProducts.map(prod => {
                            const imgUrl = prod.image_url ? supabase.storage.from('product-images').getPublicUrl(prod.image_url).data.publicUrl : null
                            return (
                                <div
                                    key={prod.id}
                                    className="flex-shrink-0 w-40 rounded-2xl border p-3 flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow relative"
                                    style={{ background: 'transparent', borderColor: colors.border }}
                                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/${prod.slug || prod.id}`)}
                                >
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/${profileSlug}/${storeSlug}/${prod.slug || prod.id}/editar-produto`);
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
            </div>

            {/* Entregadores e rotas */}
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}>
                        <Truck size={16} /> Entregadores ({employees.length})
                    </h3>
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}/entregadores`)}
                        className="text-xs font-bold"
                        style={{ color: colors.accent }}
                    >
                        Gerenciar
                    </button>
                </div>

                {employees.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum entregador cadastrado.</p>
                ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {employees.map(emp => {
                            const route = employeeRoutes.find(r => r.employeeId === emp.id)
                            const isExpanded = expandedEmployee === emp.id

                            return (
                                <div
                                    key={emp.id}
                                    className="rounded-xl border"
                                    style={{ background: 'transparent', borderColor: colors.border }}
                                >
                                    <div
                                        onClick={() => setExpandedEmployee(isExpanded ? null : emp.id)}
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                                                style={{ background: route?.color || '#6b7280' }}
                                            >
                                                {emp.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{emp.name}</p>
                                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                                    {route ? `${route.stops.length} paradas` : 'Sem entregas'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {route && route.stops.length > 0 && (
                                                <div className="flex -space-x-1">
                                                    {route.stops.slice(0, 3).map((stop, i) => (
                                                        <div
                                                            key={i}
                                                            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white border border-black/20"
                                                            style={{ background: route.color }}
                                                        >
                                                            {stop.label}
                                                        </div>
                                                    ))}
                                                    {route.stops.length > 3 && (
                                                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white bg-gray-600 border border-black/20">
                                                            +{route.stops.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <ChevronRight
                                                size={16}
                                                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                style={{ color: colors.textSecondary }}
                                            />
                                        </div>
                                    </div>

                                    {isExpanded && route && (
                                        <div className="px-3 pb-3 pt-0">
                                            <div className="space-y-2 mt-2">
                                                <p className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                                    Entregas atribuídas:
                                                </p>
                                                {route.stops.map((stop: DeliveryStop, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        className="p-3 rounded-lg text-xs"
                                                        style={{ background: `${route.color}10`, border: `1px solid ${route.color}30` }}
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white font-bold"
                                                                    style={{ background: route.color }}
                                                                >
                                                                    {stop.label}
                                                                </span>
                                                                <span className="font-medium" style={{ color: colors.textPrimary }}>
                                                                    {stop.address
                                                                        ? stop.address.substring(0, 40) + (stop.address.length > 40 ? '...' : '')
                                                                        : 'Sem endereço'}
                                                                </span>
                                                            </div>
                                                            <span
                                                                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                                                style={{
                                                                    background:
                                                                        stop.status === 'delivered' ? '#22c55e' :
                                                                            stop.status === 'in_transit' ? '#f59e0b' : '#94a3b8',
                                                                    color: 'white',
                                                                }}
                                                            >
                                                                {stop.status === 'pending' ? 'Pendente' :
                                                                    stop.status === 'in_transit' ? 'A caminho' : 'Entregue'}
                                                            </span>
                                                        </div>

                                                        <div className="ml-7 space-y-2">
                                                            {stop.items && stop.items.length > 0 && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold mb-1" style={{ color: colors.textSecondary }}>
                                                                        Produtos:
                                                                    </p>
                                                                    <ul className="list-disc list-inside text-[10px]" style={{ color: colors.textPrimary }}>
                                                                        {stop.items.map((item, i) => (
                                                                            <li key={i}>
                                                                                {item.product_name} x{item.quantity}
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}

                                                            <div className="flex flex-col gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="font-bold">Pagamento:</span>
                                                                    <span className="capitalize" style={{ color: colors.textPrimary }}>
                                                                        {stop.payment_method === 'credit_card' ? '💳 Cartão' :
                                                                            stop.payment_method === 'pix' ? '🔷 Pix' :
                                                                                stop.payment_method === 'money' ? '💵 Dinheiro' :
                                                                                    stop.payment_method || '—'}
                                                                    </span>
                                                                    {stop.payment_method === 'credit_card' && (
                                                                        <span className="text-red-400 font-bold">(Levar máquina)</span>
                                                                    )}
                                                                    {stop.payment_method === 'money' && (
                                                                        <span className="text-yellow-400 font-bold">(Levar troco)</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="font-bold">Total:</span>
                                                                    <span style={{ color: colors.textPrimary }}>
                                                                        R$ {Number(stop.total_amount || 0).toFixed(2)}
                                                                    </span>
                                                                    {stop.delivery_fee > 0 && (
                                                                        <span style={{ color: colors.textSecondary }}>
                                                                            (frete R$ {Number(stop.delivery_fee).toFixed(2)})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                {route.stops.length === 0 && (
                                                    <p className="text-xs text-center py-2" style={{ color: colors.textSecondary }}>
                                                        Nenhuma entrega mapeada.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Informações da Loja */}
            {store.address || store.whatsapp ? (
                <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                    <h3 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: colors.textPrimary }}>
                        <Store size={16} /> Informações da Loja
                    </h3>
                    {store.address && (
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: colors.textSecondary }}>
                            <MapPin size={14} />
                            <span>{store.address}</span>
                        </div>
                    )}
                    {store.whatsapp && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                            <Phone size={14} />
                            <span>{store.whatsapp}</span>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Configurações */}
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: colors.textPrimary }}>
                    <Settings size={16} /> Configurações da Loja
                </h3>

                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Truck size={18} style={{ color: acceptsDelivery ? colors.accent : colors.textSecondary }} />
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Faz entrega</span>
                    </div>
                    <button onClick={() => setAcceptsDelivery(!acceptsDelivery)} className={`w-12 h-6 rounded-full transition-colors relative ${acceptsDelivery ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${acceptsDelivery ? 'left-6' : 'left-0.5'}`} />
                    </button>
                </div>
                {acceptsDelivery && (
                    <div className="ml-7 mb-3 space-y-2">
                        <div className="flex gap-2">
                            <button onClick={() => setDeliveryMode('fixed')} className={`px-3 py-1 rounded-full text-xs font-bold ${deliveryMode === 'fixed' ? 'text-white' : ''}`} style={{ background: deliveryMode === 'fixed' ? colors.accent : 'transparent', border: `1px solid ${colors.border}`, color: deliveryMode === 'fixed' ? 'white' : colors.textSecondary }}>Valor Fixo</button>
                            <button onClick={() => setDeliveryMode('distance')} className={`px-3 py-1 rounded-full text-xs font-bold ${deliveryMode === 'distance' ? 'text-white' : ''}`} style={{ background: deliveryMode === 'distance' ? colors.accent : 'transparent', border: `1px solid ${colors.border}`, color: deliveryMode === 'distance' ? 'white' : colors.textSecondary }}>Por Distância</button>
                        </div>

                        {deliveryMode === 'fixed' && (
                            <input type="number" value={fixedDeliveryFee} onChange={e => setFixedDeliveryFee(e.target.value)} placeholder="Valor da entrega" className="w-full bg-transparent border rounded-lg px-2 py-1 text-xs" style={{ borderColor: colors.border, color: colors.textPrimary }} />
                        )}
                        {deliveryMode === 'distance' && (
                            <div>
                                {distanceRules.map((rule, idx) => (
                                    <div key={idx} className="flex items-center gap-2 mb-1">
                                        <input type="number" value={rule.max_km} onChange={e => updateDistanceRule(idx, 'max_km', e.target.value)} placeholder="Distância (km)" className="w-1/2 bg-transparent border rounded-lg px-2 py-1 text-xs" style={{ borderColor: colors.border, color: colors.textPrimary }} />
                                        <input type="number" value={rule.fee} onChange={e => updateDistanceRule(idx, 'fee', e.target.value)} placeholder="Valor" className="w-1/2 bg-transparent border rounded-lg px-2 py-1 text-xs" style={{ borderColor: colors.border, color: colors.textPrimary }} />
                                        <button onClick={() => removeDistanceRule(idx)} className="text-red-400"><X size={16} /></button>
                                    </div>
                                ))}
                                <button onClick={addDistanceRule} className="text-xs text-blue-400 mt-1">+ Adicionar faixa</button>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Store size={18} style={{ color: acceptsPickup ? colors.accent : colors.textSecondary }} />
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Retirada no local</span>
                    </div>
                    <button onClick={() => setAcceptsPickup(!acceptsPickup)} className={`w-12 h-6 rounded-full transition-colors relative ${acceptsPickup ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${acceptsPickup ? 'left-6' : 'left-0.5'}`} />
                    </button>
                </div>

                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <CreditCard size={18} style={{ color: acceptsCard ? '#0984e3' : colors.textSecondary }} />
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Aceitar Cartão</span>
                    </div>
                    <button onClick={() => setAcceptsCard(!acceptsCard)} className={`w-12 h-6 rounded-full transition-colors relative ${acceptsCard ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${acceptsCard ? 'left-6' : 'left-0.5'}`} />
                    </button>
                </div>

                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <QrCode size={18} style={{ color: acceptsPix ? '#00b894' : colors.textSecondary }} />
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Aceitar PIX</span>
                    </div>
                    <button onClick={() => setAcceptsPix(!acceptsPix)} className={`w-12 h-6 rounded-full transition-colors relative ${acceptsPix ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${acceptsPix ? 'left-6' : 'left-0.5'}`} />
                    </button>
                </div>
                {acceptsPix && (
                    <div className="ml-7 mb-3 space-y-2">
                        <select value={pixKeyType} onChange={e => setPixKeyType(e.target.value as any)} className="w-full bg-transparent border rounded-lg px-2 py-1 text-xs" style={{ borderColor: colors.border, color: colors.textPrimary }}>
                            <option value="cpf">CPF</option>
                            <option value="email">E-mail</option>
                            <option value="phone">Telefone</option>
                            <option value="random">Chave aleatória</option>
                        </select>
                        <input type="text" value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="Chave Pix" className="w-full bg-transparent border rounded-lg px-2 py-1 text-xs" style={{ borderColor: colors.border, color: colors.textPrimary }} />
                    </div>
                )}

                <button onClick={handleSaveConfig} disabled={savingConfig} className="w-full mt-3 py-2 rounded-full text-xs font-bold flex items-center justify-center gap-2" style={{ background: colors.accent, color: 'white' }}>
                    {savingConfig ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Salvar Configurações</>}
                </button>
            </div>

            {/* Cards de visitantes */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="p-4 rounded-2xl border" style={{ background: 'transparent', borderColor: colors.border }} onClick={() => setDialogOpen('online')}>
                    <Users size={16} style={{ color: colors.accent }} />
                    <p className="text-2xl font-black mt-1" style={{ color: colors.accent }}>{onlineNow}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>online</p>
                </div>
                <div className="p-4 rounded-2xl border" style={{ background: 'transparent', borderColor: colors.border }} onClick={() => setDialogOpen('today')}>
                    <Eye size={16} style={{ color: colors.accentLight }} />
                    <p className="text-2xl font-black mt-1" style={{ color: colors.accentLight }}>{todayVisitsCount}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>hoje</p>
                </div>
                <div className="p-4 rounded-2xl border" style={{ background: 'transparent', borderColor: colors.border }} onClick={() => setDialogOpen('all')}>
                    <Users size={16} style={{ color: colors.accent }} />
                    <p className="text-2xl font-black mt-1" style={{ color: colors.accent }}>{totalUniqueVisitors}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>total</p>
                </div>
            </div>

            {/* Horários */}
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <button onClick={() => setShowScheduleEditor(!showScheduleEditor)} className="flex items-center gap-2 text-xs font-bold w-full" style={{ color: colors.textSecondary }}>
                    <Clock3 size={14} /> Horários de Funcionamento
                    <ChevronRight size={14} className={`transform ${showScheduleEditor ? 'rotate-90' : ''}`} />
                </button>
                {showScheduleEditor && (
                    <div className="mt-3 space-y-3">
                        {DAYS_OF_WEEK.map(day => {
                            const current = businessHours[day.key] || { open: '', close: '' }
                            return (
                                <div key={day.key} className="flex items-center gap-2">
                                    <span className="w-20 text-xs font-bold" style={{ color: colors.textPrimary }}>{day.label}</span>
                                    <input type="time" value={current.open} onChange={e => setTimeForDay(day.key, 'open', e.target.value)} className="bg-transparent border rounded px-2 py-1 text-xs" style={{ borderColor: colors.border, color: colors.textPrimary }} />
                                    <span style={{ color: colors.textSecondary }}>-</span>
                                    <input type="time" value={current.close} onChange={e => setTimeForDay(day.key, 'close', e.target.value)} className="bg-transparent border rounded px-2 py-1 text-xs" style={{ borderColor: colors.border, color: colors.textPrimary }} />
                                    <button onClick={() => clearDay(day.key)} className="text-xs text-red-400">Fechado</button>
                                </div>
                            )
                        })}
                        <button onClick={handleSaveSchedule} disabled={savingSchedule} className="w-full py-2 rounded-full text-sm font-bold" style={{ background: colors.accent, color: 'white' }}>Salvar</button>
                    </div>
                )}
            </div>

            {/* Ações rápidas */}
            <div className="grid grid-cols-2 gap-3">
                <button onClick={() => router.push(`/${profileSlug}/${storeSlug}/editar-loja`)} className="p-3 rounded-2xl border flex items-center gap-2" style={{ background: 'transparent', borderColor: colors.border }}>
                    <Settings size={18} /> Editar loja
                </button>
                <button onClick={() => router.push(`/${profileSlug}/${storeSlug}/criar-produto`)} className="p-3 rounded-2xl border flex items-center gap-2" style={{ background: 'transparent', borderColor: colors.border }}>
                    <Plus size={18} /> Adicionar produto
                </button>
                <button onClick={() => router.push(`/${profileSlug}/${storeSlug}/agendamentos`)} className="p-3 rounded-2xl border flex items-center gap-2" style={{ background: 'transparent', borderColor: colors.border }}>
                    <Calendar size={18} /> Agendamentos
                </button>
            </div>

            {/* Modal de atribuição múltipla */}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
                    <div className="w-full max-w-sm rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Selecionar Entregador</h3>
                            <button onClick={() => setShowAssignModal(false)}><X size={20} /></button>
                        </div>
                        <div className="space-y-2">
                            {employees.map(emp => (
                                <div key={emp.id} onClick={() => setSelectedEmployeeId(emp.id)} className={`p-3 rounded-xl cursor-pointer ${selectedEmployeeId === emp.id ? 'ring-2' : ''}`} style={{ background: selectedEmployeeId === emp.id ? `${colors.accent}20` : 'transparent', border: `1px solid ${colors.border}` }}>
                                    <p className="font-bold" style={{ color: colors.textPrimary }}>{emp.name}</p>
                                    {emp.phone && <p className="text-xs" style={{ color: colors.textSecondary }}>{emp.phone}</p>}
                                </div>
                            ))}
                        </div>
                        <button onClick={handleAssignDelivery} disabled={!selectedEmployeeId || assigning} className="w-full mt-4 py-2 rounded-full font-bold" style={{ background: selectedEmployeeId ? colors.accent : colors.border, color: selectedEmployeeId ? 'white' : colors.textSecondary }}>
                            {assigning ? 'Atribuindo...' : 'Confirmar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de atribuição rápida */}
            {singleAssignOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSingleAssignOpen(null)}>
                    <div className="w-full max-w-xs rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Atribuir pedido</h3>
                            <button onClick={() => setSingleAssignOpen(null)}><X size={20} /></button>
                        </div>
                        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                            Pedido de @{singleAssignOpen.order.buyer_profile_slug} • R$ {singleAssignOpen.order.totalPrice.toFixed(2)}
                        </p>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {employees.length === 0 ? (
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum entregador cadastrado.</p>
                            ) : (
                                employees.map(emp => (
                                    <div
                                        key={emp.id}
                                        onClick={() => handleSingleAssign(emp.id, singleAssignOpen.order)}
                                        className="p-3 rounded-xl cursor-pointer border flex items-center gap-3 hover:bg-white/5 transition-colors"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm text-white font-bold">
                                            {emp.name.charAt(0)}
                                        </div>
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

            {selectedOrder && <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onAction={handleOrderAction} />}

            {dialogOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDialogOpen(null)}>
                    <div className="w-full max-w-sm rounded-3xl p-6" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-2" style={{ color: colors.textPrimary }}>
                            {dialogOpen === 'online' ? 'Visitantes online' : dialogOpen === 'today' ? 'Visitantes hoje' : 'Total de visitantes'}
                        </h3>
                        <p style={{ color: colors.textSecondary }}>Detalhes em breve.</p>
                    </div>
                </div>
            )}
        </div>
    )
}