// components/PainelDaLoja.tsx
'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { RatingStars } from '@/components/ratings/RatingStars'
import { toast } from 'sonner'
import {
    Eye,
    ShoppingBag,
    Clock,
    TrendingUp,
    Calendar,
    Settings,
    Plus,
    Users,
    PackageOpen,
    RefreshCw,
    ChevronRight,
    Package,
    CheckCircle2,
    Save,
    Clock3,
    X,
    StoreIcon,
    Truck,
    MapPin,
    CheckSquare,
    Square,
    Map as MapIcon,
    UserCheck,
    Send,
    BarChart3,
    DollarSign,
    ShoppingCart,
    Star,
    Layers
} from 'lucide-react'
import { OrderModal } from './eu/components/OrderModal'

// Helpers de data
function daysAgo(n: number): string {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

function startOfDay(date: Date = new Date()): string {
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
}

function startOfWeek(): string {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

function startOfMonth(): string {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
}

function startOfYear(): string {
    const d = new Date()
    d.setMonth(0, 1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
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

const COMMON_HOURS = [
    '06:00', '07:00', '08:00', '09:00', '10:00',
    '11:00', '12:00', '13:00', '14:00', '15:00',
    '16:00', '17:00', '18:00', '19:00', '20:00',
    '21:00', '22:00', '23:00', '00:00'
]

// Cores para rotas de entregadores
const ROUTE_COLORS = ['#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#eab308']

// Haversine
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

// Otimizador de rota
function optimizeRoute(storeLat: number, storeLng: number, stops: { id: string; lat: number; lng: number }[]) {
    if (stops.length === 0) return []
    const remaining = [...stops]
    const sequence: { id: string; sequence: number }[] = []
    let currentLat = storeLat, currentLng = storeLng, seq = 1
    while (remaining.length > 0) {
        let nearestIdx = 0, nearestDist = Infinity
        remaining.forEach((stop, idx) => {
            const d = haversineDistance(currentLat, currentLng, stop.lat, stop.lng)
            if (d < nearestDist) { nearestDist = d; nearestIdx = idx }
        })
        const next = remaining.splice(nearestIdx, 1)[0]
        sequence.push({ id: next.id, sequence: seq++ })
        currentLat = next.lat; currentLng = next.lng
    }
    return sequence
}

// Componente principal
export default function PainelDaLoja({ profileSlug, storeSlug, onBack }: { profileSlug: string; storeSlug: string; onBack?: () => void }) {
    const router = useRouter()
    const { colors } = useTheme()

    // Estados principais
    const [store, setStore] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // Visitantes
    const [onlineNow, setOnlineNow] = useState(0)
    const [todayVisitsCount, setTodayVisitsCount] = useState(0)
    const [totalUniqueVisitors, setTotalUniqueVisitors] = useState(0)

    // Vendas e pedidos
    const [sales, setSales] = useState<any[]>([])
    const [groupedOrders, setGroupedOrders] = useState<any[]>([])
    const [metrics, setMetrics] = useState({ daily: { revenue: 0, orders: 0 } })

    // Produtos mais vistos
    const [productViews, setProductViews] = useState<Record<string, number>>({})
    const [productsViewedNow, setProductsViewedNow] = useState<any[]>([])

    // Produtos mais vendidos (derivado dos pedidos)
    const [topProducts, setTopProducts] = useState<{ name: string; count: number }[]>([])

    // Entregadores e rotas
    const [employees, setEmployees] = useState<any[]>([])
    const [employeeRoutes, setEmployeeRoutes] = useState<any[]>([]) // resumo para o mapa rápido
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
    const [assigning, setAssigning] = useState(false)

    // Pedido selecionado para modal de detalhes
    const [selectedOrder, setSelectedOrder] = useState<any>(null)

    // Horários
    const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string }>>({})
    const [showScheduleEditor, setShowScheduleEditor] = useState(false)
    const [savingSchedule, setSavingSchedule] = useState(false)

    // Diálogos de visitantes
    const [dialogOpen, setDialogOpen] = useState<'online' | 'today' | 'all' | null>(null)

    // Refs para realtime
    const realtimeChannel = useRef<any>(null)
    const intervalRef = useRef<any>(null)

    // Funções de busca de dados
    const fetchVisitorData = useCallback(async (storeId: string) => {
        const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0); const todayISO = todayStart.toISOString()

        const { data: online } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id')
            .eq('store_id', storeId)
            .gte('created_at', oneMinuteAgo)

        const uniqueOnline = new Set(online?.map(v => v.viewer_id || v.anonymous_id))
        setOnlineNow(uniqueOnline.size)

        const { data: todayViews } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id')
            .eq('store_id', storeId)
            .gte('created_at', todayISO)

        const uniqueToday = new Set(todayViews?.map(v => v.viewer_id || v.anonymous_id))
        setTodayVisitsCount(uniqueToday.size)

        const { data: allViews } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id')
            .eq('store_id', storeId)

        const uniqueAll = new Set(allViews?.map(v => v.viewer_id || v.anonymous_id))
        setTotalUniqueVisitors(uniqueAll.size)
    }, [])

    const loadDashboard = useCallback(async () => {
        if (!storeSlug || !profileSlug) return
        setLoading(true)

        // Loja
        const { data: storeData, error: storeError } = await supabase
            .from('stores')
            .select('*')
            .ilike('storeSlug', storeSlug)
            .maybeSingle()
        if (storeError || !storeData) {
            setLoading(false)
            toast.error('Loja não encontrada')
            return
        }
        const logoUrl = storeData.logo_url
            ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
            : null
        setStore({ ...storeData, logo_url: logoUrl })
        setBusinessHours(storeData.business_hours || {})
        const storeId = storeData.id

        // Funcionários
        const { data: employeesData } = await supabase
            .from('employees')
            .select('*')
            .eq('store_id', storeId)
            .eq('is_active', true)
        setEmployees(employeesData || [])

        // Vendas (últimos 100)
        const { data: salesData } = await supabase
            .from('store_sales')
            .select('*')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })
            .limit(100)
        setSales(salesData || [])

        // Produtos mais vistos (últimos 5 min)
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data: recentProductViews } = await supabase
            .from('product_views')
            .select('product_id, products(name)')
            .eq('store_id', storeId)
            .gte('created_at', fiveMinAgo)
            .limit(10)
        const uniqueProducts = Array.from(
            new Map(recentProductViews?.map((pv: any) => [pv.product_id, pv.products?.name || 'Produto'])).entries()
        ).map(([id, name]) => ({ id, name }))
        setProductsViewedNow(uniqueProducts)

        // Contagens de visualizações por período
        const periods: Record<string, { gte?: string; lte?: string }> = {
            today: { gte: startOfDay(), lte: new Date().toISOString() },
            yesterday: { gte: daysAgo(1), lte: daysAgo(1).replace('T00:00:00.000Z', 'T23:59:59.999Z') },
            week: { gte: startOfWeek(), lte: new Date().toISOString() },
            month: { gte: startOfMonth(), lte: new Date().toISOString() },
            year: { gte: startOfYear(), lte: new Date().toISOString() },
            all: {}
        }
        const productViewsData: Record<string, number> = {}
        for (const [key, range] of Object.entries(periods)) {
            let query = supabase.from('product_views').select('*', { count: 'exact', head: true }).eq('store_id', storeId)
            if (range.gte) query = query.gte('created_at', range.gte)
            if (range.lte) query = query.lte('created_at', range.lte)
            const { count } = await query
            productViewsData[key] = count || 0
        }
        setProductViews(productViewsData)

        // Visitantes
        await fetchVisitorData(storeId)

        setLoading(false)
    }, [storeSlug, profileSlug, fetchVisitorData])

    useEffect(() => { loadDashboard() }, [loadDashboard])

    // Agrupar pedidos e calcular métricas
    useEffect(() => {
        const groups: Record<string, any> = {}
        sales.forEach((s: any) => {
            if (!groups[s.checkout_id]) {
                groups[s.checkout_id] = {
                    checkout_id: s.checkout_id,
                    buyer_name: s.buyer_name,
                    buyer_profile_slug: s.buyer_profile_slug,
                    created_at: s.created_at,
                    status: s.status,
                    items: [],
                    totalPrice: 0,
                    delivery_address: s.delivery_address,
                    delivery_lat: s.delivery_lat,
                    delivery_lng: s.delivery_lng,
                    employee_id: s.employee_id,
                }
            }
            groups[s.checkout_id].items.push(s)
            groups[s.checkout_id].totalPrice += s.price
        })
        const orders = Object.values(groups).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setGroupedOrders(orders)

        // Métricas do dia
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const dailySales = sales.filter(s => new Date(s.created_at).getTime() >= today)
        const dailyRevenue = dailySales.reduce((acc, s) => acc + s.price, 0)
        const dailyOrders = new Set(dailySales.map(s => s.checkout_id)).size
        setMetrics({ daily: { revenue: dailyRevenue, orders: dailyOrders } })

        // Produtos mais vendidos (últimos 100 pedidos)
        const productCount: Record<string, number> = {}
        sales.forEach(s => {
            const name = s.product_name || s.description?.split('\n')[0] || 'Item'
            productCount[name] = (productCount[name] || 0) + 1
        })
        const sorted = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
        setTopProducts(sorted.map(([name, count]) => ({ name, count })))
    }, [sales])

    // Buscar rotas dos entregadores (assignments ativas)
    const fetchEmployeeRoutes = useCallback(async () => {
        if (!store?.id) return
        const { data } = await supabase
            .from('delivery_assignments')
            .select('employee_id, checkout_id, sequence_order, status, store_sales(delivery_lat, delivery_lng, delivery_address, buyer_name)')
            .eq('store_id', store.id)
            .order('sequence_order')
        if (!data) return
        // Agrupar por entregador
        const map = new Map<string, any[]>()
        data.forEach((d: any) => {
            const eId = d.employee_id
            if (!map.has(eId)) map.set(eId, [])
            map.get(eId)!.push({
                checkout_id: d.checkout_id,
                sequence: d.sequence_order,
                status: d.status,
                lat: d.store_sales?.delivery_lat,
                lng: d.store_sales?.delivery_lng,
                address: d.store_sales?.delivery_address,
                buyer: d.store_sales?.buyer_name,
            })
        })
        const routes = Array.from(map.entries()).map(([employeeId, stops], idx) => {
            const emp = employees.find(e => e.id === employeeId)
            return {
                employeeId,
                employeeName: emp?.name || 'Entregador',
                color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
                stops: stops.filter(s => s.lat && s.lng).map(s => ({
                    lat: s.lat,
                    lng: s.lng,
                    label: s.sequence.toString(),
                    address: s.address || '',
                    status: s.status,
                })),
            }
        })
        setEmployeeRoutes(routes)
    }, [store?.id, employees])

    useEffect(() => { if (store?.id) fetchEmployeeRoutes() }, [store?.id, employees, fetchEmployeeRoutes])

    // Realtime
    useEffect(() => {
        if (!store?.id) return
        const channel = supabase
            .channel(`painel-${store.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'store_sales', filter: `store_id=eq.${store.id}` }, () => loadDashboard())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments', filter: `store_id=eq.${store.id}` }, () => fetchEmployeeRoutes())
            .subscribe()
        realtimeChannel.current = channel
        intervalRef.current = setInterval(() => fetchVisitorData(store.id), 10000)
        return () => {
            supabase.removeChannel(channel)
            clearInterval(intervalRef.current)
        }
    }, [store?.id, loadDashboard, fetchVisitorData, fetchEmployeeRoutes])

    const handleRefresh = () => { setRefreshing(true); loadDashboard().finally(() => setRefreshing(false)) }

    // Seleção de pedidos para atribuir
    const toggleOrderSelection = (checkoutId: string) => {
        const newSet = new Set(selectedOrderIds)
        newSet.has(checkoutId) ? newSet.delete(checkoutId) : newSet.add(checkoutId)
        setSelectedOrderIds(newSet)
    }

    const handleAssignDelivery = async () => {
        if (!selectedEmployeeId || selectedOrderIds.size === 0 || !store) return
        setAssigning(true)
        const storeLat = store.store_lat, storeLng = store.store_lng
        if (!storeLat || !storeLng) { toast.error('Configure as coordenadas da loja.'); setAssigning(false); return }

        const ordersToAssign = groupedOrders.filter(o => selectedOrderIds.has(o.checkout_id))
        const invalid = ordersToAssign.filter(o => !o.delivery_lat || !o.delivery_lng)
        if (invalid.length > 0) { toast.error('Alguns pedidos não possuem coordenadas.'); setAssigning(false); return }

        const stops = ordersToAssign.map(o => ({ id: o.checkout_id, lat: o.delivery_lat, lng: o.delivery_lng }))
        const optimized = optimizeRoute(storeLat, storeLng, stops)
        const inserts = optimized.map(stop => ({
            store_id: store.id,
            employee_id: selectedEmployeeId,
            checkout_id: stop.id,
            sequence_order: stop.sequence,
            status: 'pending'
        }))
        const { error } = await supabase.from('delivery_assignments').insert(inserts)
        if (error) { toast.error('Erro ao atribuir entregas.'); setAssigning(false); return }

        for (const checkoutId of selectedOrderIds) {
            await supabase.from('store_sales').update({ employee_id: selectedEmployeeId }).eq('checkout_id', checkoutId)
        }
        toast.success('Entregas atribuídas!')
        setSelectedOrderIds(new Set())
        setShowAssignModal(false)
        setSelectedEmployeeId(null)
        loadDashboard()
        fetchEmployeeRoutes()
        setAssigning(false)
    }

    const handleOrderAction = async (status: string) => {
        if (!selectedOrder) return
        const { error } = await supabase.from('store_sales').update({ status }).eq('checkout_id', selectedOrder.checkout_id)
        if (!error) {
            setSelectedOrder(null)
            loadDashboard()
            toast.success('Status atualizado.')
        } else toast.error('Erro ao atualizar.')
    }

    // Horários
    const setTimeForDay = (day: string, type: 'open' | 'close', value: string) => {
        setBusinessHours(prev => ({ ...prev, [day]: { ...(prev[day] || { open: '', close: '' }), [type]: value } }))
    }
    const clearDay = (day: string) => {
        setBusinessHours(prev => { const n = { ...prev }; delete n[day]; return n })
    }
    const handleSaveSchedule = async () => {
        setSavingSchedule(true)
        const { error } = await supabase.from('stores').update({ business_hours: businessHours }).eq('id', store.id)
        if (!error) { toast.success('Horários salvos!'); setShowScheduleEditor(false) }
        else toast.error('Erro ao salvar.')
        setSavingSchedule(false)
    }

    if (loading) return <LoadingSpinner message="Carregando painel..." />
    if (!store) return null

    const storeOpen = store.is_open // simplificado

    // Classes de status de pedidos
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

            {/* Vendas do dia */}
            <div className="mb-6 p-4 rounded-2xl border" style={{ background: `linear-gradient(135deg, ${colors.accent}20, ${colors.accentLight}20)`, borderColor: colors.border }}>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Vendas Hoje</p>
                        <p className="text-2xl font-black" style={{ color: colors.accent }}>R$ {metrics.daily.revenue.toFixed(2)}</p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>{metrics.daily.orders} pedidos</p>
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

                {/* Novos */}
                {newOrders.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: colors.accent }}>Novos ({newOrders.length})</h4>
                        {newOrders.map(order => (
                            <div key={order.checkout_id} onClick={() => setSelectedOrder(order)} className="flex items-center justify-between p-2 rounded-lg mb-1 cursor-pointer" style={{ background: `${colors.accent}10` }}>
                                <span style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                <span style={{ color: colors.textSecondary }}>R$ {order.totalPrice.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Em preparo */}
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
                                <span style={{ color: colors.textSecondary }}>R$ {order.totalPrice.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Prontos */}
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
                                <span style={{ color: colors.textSecondary }}>R$ {order.totalPrice.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Finalizados */}
                {finished.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#22c55e' }}>Finalizados ({finished.length})</h4>
                        {finished.slice(0, 3).map(order => (
                            <div key={order.checkout_id} onClick={() => setSelectedOrder(order)} className="flex items-center justify-between p-2 rounded-lg mb-1 cursor-pointer" style={{ background: '#22c55e10' }}>
                                <span style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                <span style={{ color: colors.textSecondary }}>R$ {order.totalPrice.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {groupedOrders.length === 0 && <p className="text-center text-sm" style={{ color: colors.textSecondary }}>Nenhum pedido ainda.</p>}
            </div>

            {/* Produtos mais vistos */}
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <h3 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: colors.textPrimary }}><Eye size={16} /> Produtos mais vistos hoje</h3>
                <div className="grid grid-cols-2 gap-2">
                    <div><span style={{ color: colors.textSecondary }}>Hoje</span><p className="text-xl font-black" style={{ color: colors.accent }}>{productViews.today || 0}</p></div>
                    <div><span style={{ color: colors.textSecondary }}>Semana</span><p className="text-xl font-black" style={{ color: colors.accentLight }}>{productViews.week || 0}</p></div>
                    <div><span style={{ color: colors.textSecondary }}>Mês</span><p className="text-xl font-black" style={{ color: colors.accent }}>{productViews.month || 0}</p></div>
                    <div><span style={{ color: colors.textSecondary }}>Total</span><p className="text-xl font-black" style={{ color: colors.accentLight }}>{productViews.all || 0}</p></div>
                </div>
                {productsViewedNow.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {productsViewedNow.map(p => <span key={p.id} className="px-2 py-1 rounded-full text-xs" style={{ background: `${colors.accent}20`, color: colors.accent }}>{p.name}</span>)}
                    </div>
                )}
            </div>

            {/* Produtos mais vendidos */}
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <h3 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: colors.textPrimary }}><BarChart3 size={16} /> Mais vendidos</h3>
                {topProducts.length === 0 ? <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhuma venda registrada.</p> : (
                    <div className="space-y-1">
                        {topProducts.map((prod, i) => (
                            <div key={i} className="flex justify-between text-xs" style={{ color: colors.textPrimary }}>
                                <span>{prod.name}</span>
                                <span style={{ color: colors.accent }}>{prod.count} vendas</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Entregadores e rotas */}
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}><Truck size={16} /> Entregadores</h3>
                    <button onClick={() => router.push(`/${profileSlug}/${storeSlug}/entregadores`)} className="text-xs font-bold" style={{ color: colors.accent }}>Gerenciar</button>
                </div>
                {employees.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum entregador cadastrado.</p>
                ) : (
                    <div className="space-y-2">
                        {employees.slice(0, 3).map(emp => {
                            const route = employeeRoutes.find(r => r.employeeId === emp.id)
                            return (
                                <div key={emp.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: `${colors.accent}10` }}>
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{emp.name}</p>
                                        <p className="text-xs" style={{ color: colors.textSecondary }}>{route ? `${route.stops.length} paradas` : 'Sem entregas'}</p>
                                    </div>
                                    {route && <div className="flex gap-1">
                                        {route.stops.slice(0, 3).map((stop: { label: string }, i: number) => (
                                            <div key={i} className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white" style={{ background: route.color }}>{stop.label}</div>
                                        ))}
                                    </div>}
                                </div>
                            )
                        })}
                    </div>
                )}
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

            {/* Modal de atribuição de entregador */}
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

            {/* Modal de detalhes do pedido */}
            {selectedOrder && (
                <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onAction={handleOrderAction} />
            )}

            {/* Diálogos de visitantes (simples) */}
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