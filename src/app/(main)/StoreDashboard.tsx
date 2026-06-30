// components/StoreDashboard.tsx
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
    Navigation,
    UserPlus,
    CheckSquare,
    Square,
    Map as MapIcon,   // <--- renomeado
    Route,
    UserCheck,
    Send
} from 'lucide-react'
import { OrderModal } from './eu/components/OrderModal'

interface StoreDashboardProps {
    profileSlug: string | null
    storeSlug: string
    onBack?: () => void
}

// Helpers de data (mantidos)
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

// Fórmula de Haversine para calcular distância entre duas coordenadas
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371 // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

// Otimizador de rota: vizinho mais próximo a partir da loja
function optimizeRoute(
    storeLat: number,
    storeLng: number,
    stops: { id: string; lat: number; lng: number }[]
): { id: string; sequence: number }[] {
    if (stops.length === 0) return []
    const remaining = [...stops]
    const sequence: { id: string; sequence: number }[] = []
    let currentLat = storeLat
    let currentLng = storeLng
    let seq = 1
    while (remaining.length > 0) {
        let nearestIdx = 0
        let nearestDist = Infinity
        remaining.forEach((stop, idx) => {
            const d = haversineDistance(currentLat, currentLng, stop.lat, stop.lng)
            if (d < nearestDist) {
                nearestDist = d
                nearestIdx = idx
            }
        })
        const next = remaining.splice(nearestIdx, 1)[0]
        sequence.push({ id: next.id, sequence: seq++ })
        currentLat = next.lat
        currentLng = next.lng
    }
    return sequence
}

export default function StoreDashboard({ profileSlug, storeSlug, onBack }: StoreDashboardProps) {
    const router = useRouter()
    const { colors } = useTheme()

    if (!profileSlug) return null

    // Estados gerais (mantidos)
    const [store, setStore] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // Visitantes
    const [onlineNow, setOnlineNow] = useState(0)
    const [onlineVisitors, setOnlineVisitors] = useState<any[]>([])
    const [fullOnlineVisitors, setFullOnlineVisitors] = useState<any[]>([])
    const [todayVisitsCount, setTodayVisitsCount] = useState(0)
    const [todayRecentVisitors, setTodayRecentVisitors] = useState<any[]>([])
    const [fullTodayVisitors, setFullTodayVisitors] = useState<any[]>([])
    const [totalUniqueVisitors, setTotalUniqueVisitors] = useState(0)
    const [allUniqueVisitors, setAllUniqueVisitors] = useState<any[]>([])

    const [productsViewedNow, setProductsViewedNow] = useState<any[]>([])
    const [pendingAppointments, setPendingAppointments] = useState<any[]>([])
    const [storeVisits, setStoreVisits] = useState<Record<string, number>>({})
    const [productViews, setProductViews] = useState<Record<string, number>>({})

    const [sales, setSales] = useState<any[]>([])
    const [selectedOrder, setSelectedOrder] = useState<any>(null)

    const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string }>>({})
    const [savingSchedule, setSavingSchedule] = useState(false)
    const [showScheduleEditor, setShowScheduleEditor] = useState(false)
    const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({})
    const [customClose, setCustomClose] = useState<Record<string, boolean>>({})

    const [dialogOpen, setDialogOpen] = useState<'online' | 'today' | 'all' | null>(null)

    // NOVOS ESTADOS - ENTREGAS
    const [employees, setEmployees] = useState<any[]>([])
    const [showEmployeeManager, setShowEmployeeManager] = useState(false)
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [assigning, setAssigning] = useState(false)
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
    const [showRoutesMap, setShowRoutesMap] = useState(false)

    const realtimeChannel = useRef<any>(null)
    const intervalRef = useRef<any>(null)

    // Funções (mantidas)
    const fetchVisitorData = useCallback(async (storeId?: string) => {
        const id = storeId || store?.id
        if (!id) return

        const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayISO = todayStart.toISOString()

        const { data: online } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id, created_at, profiles:viewer_id(avatar_url, name, "profileSlug")')
            .eq('store_id', id)
            .gte('created_at', oneMinuteAgo)
            .order('created_at', { ascending: false })

        const onlineMap = new Map<string, any>()
        online?.forEach(v => {
            const key = v.viewer_id || v.anonymous_id
            if (key && !onlineMap.has(key)) {
                onlineMap.set(key, {
                    ...v,
                    profiles: Array.isArray(v.profiles) ? v.profiles[0] : v.profiles,
                })
            }
        })
        const onlineList = Array.from(onlineMap.values())
        setOnlineNow(onlineList.length)
        setOnlineVisitors(onlineList.slice(0, 5))
        setFullOnlineVisitors(onlineList)

        const { data: todayViews } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id, created_at, profiles:viewer_id(avatar_url, name, "profileSlug")')
            .eq('store_id', id)
            .gte('created_at', todayISO)
            .order('created_at', { ascending: false })
            .limit(200)

        const uniqueTodayMap = new Map<string, any>()
        todayViews?.forEach(v => {
            const key = v.viewer_id || v.anonymous_id
            if (key && !uniqueTodayMap.has(key)) {
                uniqueTodayMap.set(key, {
                    ...v,
                    profiles: Array.isArray(v.profiles) ? v.profiles[0] : v.profiles,
                })
            }
        })
        const uniqueTodayList = Array.from(uniqueTodayMap.values())
        setTodayVisitsCount(uniqueTodayList.length)
        setTodayRecentVisitors(uniqueTodayList.slice(0, 5))
        setFullTodayVisitors(uniqueTodayList)

        const { data: allViews } = await supabase
            .from('store_views')
            .select('viewer_id, anonymous_id, created_at, profiles:viewer_id(avatar_url, name, "profileSlug")')
            .eq('store_id', id)
            .order('created_at', { ascending: false })
            .limit(500)

        const allUniqueMap = new Map<string, any>()
        allViews?.forEach(v => {
            const key = v.viewer_id || v.anonymous_id
            if (key && !allUniqueMap.has(key)) {
                allUniqueMap.set(key, {
                    ...v,
                    profiles: Array.isArray(v.profiles) ? v.profiles[0] : v.profiles,
                })
            }
        })
        const allUniqueList = Array.from(allUniqueMap.values())
        setAllUniqueVisitors(allUniqueList)
        setTotalUniqueVisitors(allUniqueList.length)
    }, [store?.id])

    const loadEmployees = useCallback(async (storeId: string) => {
        const { data } = await supabase
            .from('employees')
            .select('*')
            .eq('store_id', storeId)
            .eq('is_active', true)
            .order('name')
        setEmployees(data || [])
    }, [])

    const loadDashboard = useCallback(async () => {
        if (!storeSlug || !profileSlug) return
        setLoading(true)

        const { data: storeData, error: storeError } = await supabase
            .from('stores')
            .select('*')
            .ilike('storeSlug', storeSlug)
            .maybeSingle()

        if (storeError || !storeData) {
            setLoading(false)
            toast.error('Erro ao carregar a loja')
            return
        }

        const logoUrl = storeData.logo_url
            ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
            : null
        setStore({ ...storeData, logo_url: logoUrl })
        setBusinessHours(storeData.business_hours || {})
        const storeId = storeData.id

        loadEmployees(storeId)

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data: recentProductViews } = await supabase
            .from('product_views')
            .select('product_id, products(name)')
            .eq('store_id', storeId)
            .gte('created_at', fiveMinutesAgo)
            .limit(10)
        const uniqueProducts = Array.from(
            new Map(recentProductViews?.map((pv: any) => [pv.product_id, pv.products?.name || 'Produto'])).entries()
        ).map(([id, name]) => ({ id, name }))
        setProductsViewedNow(uniqueProducts)

        const { data: appointments } = await supabase
            .from('appointments')
            .select('*, client:client_id(name, "profileSlug", avatar_url)')
            .eq('store_id', storeId)
            .eq('status', 'pending')
            .order('start_time', { ascending: true })
        setPendingAppointments(appointments || [])

        const nowISO = new Date().toISOString()
        const periods: Record<string, { gte?: string; lte?: string }> = {
            today: { gte: startOfDay(), lte: nowISO },
            yesterday: { gte: daysAgo(1), lte: daysAgo(1).replace('T00:00:00.000Z', 'T23:59:59.999Z') },
            week: { gte: startOfWeek(), lte: nowISO },
            month: { gte: startOfMonth(), lte: nowISO },
            year: { gte: startOfYear(), lte: nowISO },
            all: {},
        }

        const visitsData: Record<string, number> = {}
        for (const [key, range] of Object.entries(periods)) {
            let query = supabase.from('store_views').select('*', { count: 'exact', head: true }).eq('store_id', storeId)
            if (range.gte) query = query.gte('created_at', range.gte)
            if (range.lte) query = query.lte('created_at', range.lte)
            const { count } = await query
            visitsData[key] = count || 0
        }
        setStoreVisits(visitsData)

        const prodViewsData: Record<string, number> = {}
        for (const [key, range] of Object.entries(periods)) {
            let query = supabase.from('product_views').select('*', { count: 'exact', head: true }).eq('store_id', storeId)
            if (range.gte) query = query.gte('created_at', range.gte)
            if (range.lte) query = query.lte('created_at', range.lte)
            const { count } = await query
            prodViewsData[key] = count || 0
        }
        setProductViews(prodViewsData)

        const { data: salesData } = await supabase
            .from('store_sales')
            .select('*')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })
            .limit(100)
        setSales(salesData || [])

        await fetchVisitorData(storeId)

        setLoading(false)
        setRefreshing(false)
    }, [storeSlug, profileSlug, fetchVisitorData, loadEmployees])

    useEffect(() => {
        loadDashboard()
    }, [loadDashboard])

    useEffect(() => {
        if (!store?.id) return

        fetchVisitorData(store.id)
        loadDashboard()

        const channel = supabase
            .channel(`store-dash-views-${store.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'store_views', filter: `store_id=eq.${store.id}` },
                () => {
                    fetchVisitorData(store.id)
                    loadDashboard()
                }
            )
            .subscribe()

        realtimeChannel.current = channel

        intervalRef.current = setInterval(() => {
            fetchVisitorData(store.id)
        }, 5000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(intervalRef.current)
        }
    }, [store?.id, fetchVisitorData, loadDashboard])

    const handleRefresh = () => {
        setRefreshing(true)
        loadDashboard()
    }

    const groupedOrders = useMemo(() => {
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
        return Object.values(groups).sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
    }, [sales])

    const invites = groupedOrders.filter((o: any) => o.status === 'pending')
    const inPreparo = groupedOrders.filter((o: any) => o.status === 'preparing')
    const forReady = groupedOrders.filter((o: any) => o.status === 'ready')
    const accepted = groupedOrders.filter((o: any) => o.status === 'paid')

    const metrics = useMemo(() => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const daily = sales.filter((s: any) => new Date(s.created_at).getTime() >= today)
        const dailyRev = daily.reduce((acc: number, s: any) => acc + s.price, 0)
        const dailyOrd = new Set(daily.map((d: any) => d.checkout_id)).size
        return {
            daily: {
                revenue: dailyRev,
                orders: dailyOrd,
            },
        }
    }, [sales])

    const handleOrderAction = async (status: string) => {
        if (!selectedOrder) return
        const { error: salesError } = await supabase
            .from('store_sales')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)
        const { error: ordersError } = await supabase
            .from('orders')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)
        if (!salesError && !ordersError) {
            setSelectedOrder(null)
            loadDashboard()
            toast.success(`Pedido ${status === 'preparing' ? 'aceito' : status === 'ready' ? 'marcado como pronto' : 'finalizado'}!`)
        } else {
            toast.error('Erro ao atualizar pedido')
        }
    }

    const setTimeForDay = (day: string, type: 'open' | 'close', value: string) => {
        setBusinessHours(prev => ({
            ...prev,
            [day]: { ...(prev[day] || { open: '', close: '' }), [type]: value },
        }))
    }

    const clearDay = (day: string) => {
        setBusinessHours(prev => {
            const next = { ...prev }
            delete next[day]
            return next
        })
        setCustomOpen(prev => ({ ...prev, [day]: false }))
        setCustomClose(prev => ({ ...prev, [day]: false }))
    }

    const toggleCustom = (day: string, type: 'open' | 'close') => {
        if (type === 'open') setCustomOpen(prev => ({ ...prev, [day]: !prev[day] }))
        else setCustomClose(prev => ({ ...prev, [day]: !prev[day] }))
    }

    const handleSaveSchedule = async () => {
        for (const day of DAYS_OF_WEEK) {
            const { open, close } = businessHours[day.key] || { open: '', close: '' }
            if (open && close && open >= close) {
                toast.error(`Horário inválido para ${day.label}.`)
                return
            }
        }
        setSavingSchedule(true)
        const { error } = await supabase
            .from('stores')
            .update({ business_hours: businessHours })
            .eq('id', store.id)
        if (error) {
            toast.error('Erro ao salvar horários.')
        } else {
            toast.success('Horários salvos!')
            setShowScheduleEditor(false)
        }
        setSavingSchedule(false)
    }

    // NOVAS FUNÇÕES DE ENTREGA
    const toggleOrderSelection = (checkoutId: string) => {
        const newSet = new Set(selectedOrderIds)
        if (newSet.has(checkoutId)) {
            newSet.delete(checkoutId)
        } else {
            newSet.add(checkoutId)
        }
        setSelectedOrderIds(newSet)
    }

    const handleAssignDelivery = async () => {
        if (!selectedEmployeeId || selectedOrderIds.size === 0 || !store) return
        setAssigning(true)
        try {
            // Obter coordenadas da loja
            const storeLat = store.store_lat
            const storeLng = store.store_lng
            if (!storeLat || !storeLng) {
                toast.error('Configure o endereço da loja primeiro (coordenadas).')
                setAssigning(false)
                return
            }

            // Obter pedidos selecionados com coordenadas
            const selectedOrders = groupedOrders.filter(o => selectedOrderIds.has(o.checkout_id))
            const invalidOrders = selectedOrders.filter(o => !o.delivery_lat || !o.delivery_lng)
            if (invalidOrders.length > 0) {
                toast.error(`Os pedidos de ${invalidOrders.map(o => o.buyer_name || o.buyer_profile_slug).join(', ')} não possuem coordenadas de entrega.`)
                setAssigning(false)
                return
            }

            const stops = selectedOrders.map(o => ({
                id: o.checkout_id,
                lat: o.delivery_lat,
                lng: o.delivery_lng,
            }))

            const optimized = optimizeRoute(storeLat, storeLng, stops)

            // Inserir assignments no banco
            const inserts = optimized.map(stop => ({
                store_id: store.id,
                employee_id: selectedEmployeeId,
                checkout_id: stop.id,
                sequence_order: stop.sequence,
                status: 'pending',
            }))

            const { error } = await supabase.from('delivery_assignments').insert(inserts)
            if (error) throw error

            // Atualizar store_sales com employee_id
            for (const checkoutId of selectedOrderIds) {
                await supabase
                    .from('store_sales')
                    .update({ employee_id: selectedEmployeeId })
                    .eq('checkout_id', checkoutId)
            }

            toast.success('Entregas atribuídas e rota otimizada!')
            setShowAssignModal(false)
            setSelectedOrderIds(new Set())
            setSelectedEmployeeId(null)
            loadDashboard() // recarregar para refletir mudanças
        } catch (err: any) {
            toast.error('Erro ao atribuir entregas: ' + err.message)
        } finally {
            setAssigning(false)
        }
    }

    if (loading && !store) {
        return <LoadingSpinner message="Carregando estatísticas da sua loja..." />
    }
    if (!store) return null

    const getTodayKey = () => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()]
    const todaySchedule = store.business_hours?.[getTodayKey()]
    const storeOpen = todaySchedule?.open && todaySchedule?.close
        ? (() => {
            const now = new Date()
            const cur = now.getHours() * 60 + now.getMinutes()
            const [oh, om] = todaySchedule.open.split(':').map(Number)
            let [ch, cm] = todaySchedule.close.split(':').map(Number)
            if (ch === 0 && cm === 0) ch = 24
            const openM = oh * 60 + om
            const closeM = ch * 60 + cm
            return cur >= openM && cur <= closeM
        })()
        : store.is_open

    // Estilos padronizados com fundo transparente
    const cardStyle = {
        background: 'transparent',
        border: `1px solid ${colors.border}`,
        borderRadius: '1rem',
        padding: '1.5rem',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
    }

    const sectionTitle = {
        color: colors.textPrimary,
        fontSize: '0.875rem',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem',
    }

    const renderVisitorItem = (v: any) => (
        <Link
            key={v.viewer_id || v.anonymous_id}
            href={v.profiles?.profileSlug ? `/${v.profiles.profileSlug}` : '#'}
            className="flex items-center gap-3 py-2 border-b border-opacity-20"
            style={{ borderColor: colors.border }}
        >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                {v.profiles?.avatar_url ? (
                    <img
                        src={v.profiles.avatar_url.startsWith('http') ? v.profiles.avatar_url : supabase.storage.from('avatars').getPublicUrl(v.profiles.avatar_url).data.publicUrl}
                        className="w-full h-full object-cover"
                        alt=""
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
                        {v.profiles?.name?.charAt(0) || '?'}
                    </div>
                )}
            </div>
            <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                    {v.profiles?.name || 'Anônimo'}
                </p>
                <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                    {v.profiles?.profileSlug ? `@${v.profiles.profileSlug}` : v.anonymous_id?.slice(0, 8)}
                </p>
            </div>
        </Link>
    )

    // Componente para seleção de entregador no modal
    const EmployeeSelectItem = ({ employee }: { employee: any }) => (
        <div
            onClick={() => setSelectedEmployeeId(employee.id)}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${selectedEmployeeId === employee.id
                ? 'border-opacity-100'
                : 'border-opacity-30 hover:border-opacity-60'
                }`}
            style={{
                background: selectedEmployeeId === employee.id ? `${colors.accent}20` : 'transparent',
                borderColor: selectedEmployeeId === employee.id ? colors.accent : colors.border,
                backdropFilter: 'blur(4px)',
            }}
        >
            <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-sm font-black" style={{ color: colors.textPrimary }}>
                {employee.name?.charAt(0) || 'E'}
            </div>
            <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{employee.name}</p>
                {employee.phone && <p className="text-[10px]" style={{ color: colors.textSecondary }}>{employee.phone}</p>}
            </div>
            {selectedEmployeeId === employee.id && (
                <UserCheck size={18} style={{ color: colors.accent }} />
            )}
        </div>
    )

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between mb-6">
                <Link
                    href={`/${profileSlug}/${storeSlug}`}
                    className="flex items-center gap-3 group cursor-pointer"
                >
                    <div className="w-12 h-12 rounded-full p-[2px] shadow-md transition-transform group-hover:scale-105"
                        style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                        <div className="w-full h-full rounded-full overflow-hidden" style={{ background: 'transparent' }}>
                            {store.logo_url ? (
                                <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: colors.accent }}>
                                    {store.name?.charAt(0) || '?'}
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black group-hover:text-opacity-80 transition-colors" style={{ color: colors.textPrimary }}>{store.name}</h2>
                        <div className="flex items-center gap-2 text-xs mt-1" style={{ color: colors.textSecondary }}>
                            <span className={`w-2 h-2 rounded-full ${storeOpen ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                            <span className="font-black uppercase text-[10px]">{storeOpen ? 'Aberto' : 'Fechado'}</span>
                            <span>·</span>
                            <RatingStars value={Number(store.ratings_avg || 0)} size={10} />
                            <span>{Number(store.ratings_avg || 0).toFixed(1)} ({store.ratings_count || 0})</span>
                        </div>
                    </div>
                </Link>
                <button onClick={handleRefresh} disabled={refreshing}
                    className="p-2 rounded-full transition-colors"
                    style={{ background: 'transparent', color: colors.accent, border: `1px solid ${colors.border}` }}>
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Link rápido para a página da loja */}
            <div className="mb-6">
                <Link
                    href={`/${profileSlug}/${storeSlug}`}
                    className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-bold transition-colors hover:bg-opacity-80"
                    style={{
                        background: `${colors.accent}15`,
                        border: `1px solid ${colors.accent}30`,
                        color: colors.accent,
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                    }}
                >
                    <StoreIcon size={16} />
                    Página da Loja
                    <ChevronRight size={16} />
                </Link>
            </div>

            {/* Cards principais (3 colunas) */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <button
                    onClick={() => setDialogOpen('online')}
                    className="p-4 rounded-2xl border text-left transition-all hover:shadow-md group"
                    style={{ background: 'transparent', borderColor: colors.border, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <Users size={16} style={{ color: colors.accent }} />
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Online</span>
                    </div>
                    <p className="text-2xl font-black" style={{ color: colors.accent }}>{onlineNow}</p>
                    <p className="text-[10px] font-bold mt-0.5" style={{ color: colors.textSecondary }}>agora</p>
                    {onlineVisitors.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                            {onlineVisitors.map((v, i) => (
                                <div key={i} className="w-5 h-5 rounded-full overflow-hidden border border-white/20">
                                    {v.profiles?.avatar_url ? (
                                        <img
                                            src={v.profiles.avatar_url.startsWith('http') ? v.profiles.avatar_url : supabase.storage.from('avatars').getPublicUrl(v.profiles.avatar_url).data.publicUrl}
                                            className="w-full h-full object-cover"
                                            alt=""
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gray-600 flex items-center justify-center text-[7px] font-bold text-white">
                                            {v.profiles?.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </button>

                <button
                    onClick={() => setDialogOpen('today')}
                    className="p-4 rounded-2xl border text-left transition-all hover:shadow-md group"
                    style={{ background: 'transparent', borderColor: colors.border, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <Eye size={16} style={{ color: colors.accentLight }} />
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Hoje</span>
                    </div>
                    <p className="text-2xl font-black" style={{ color: colors.accentLight }}>{todayVisitsCount}</p>
                    <p className="text-[10px] font-bold mt-0.5" style={{ color: colors.textSecondary }}>únicos</p>
                    {todayRecentVisitors.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                            {todayRecentVisitors.map((v, i) => (
                                <div key={i} className="w-5 h-5 rounded-full overflow-hidden border border-white/20">
                                    {v.profiles?.avatar_url ? (
                                        <img
                                            src={v.profiles.avatar_url.startsWith('http') ? v.profiles.avatar_url : supabase.storage.from('avatars').getPublicUrl(v.profiles.avatar_url).data.publicUrl}
                                            className="w-full h-full object-cover"
                                            alt=""
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gray-600 flex items-center justify-center text-[7px] font-bold text-white">
                                            {v.profiles?.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </button>

                <button
                    onClick={() => setDialogOpen('all')}
                    className="p-4 rounded-2xl border text-left transition-all hover:shadow-md group"
                    style={{ background: 'transparent', borderColor: colors.border, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <Users size={16} style={{ color: colors.accent }} />
                        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Visitantes</span>
                    </div>
                    <p className="text-2xl font-black" style={{ color: colors.accent }}>{totalUniqueVisitors}</p>
                    <p className="text-[10px] font-bold mt-0.5" style={{ color: colors.textSecondary }}>total</p>
                    {allUniqueVisitors.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                            {allUniqueVisitors.slice(0, 5).map((v, i) => (
                                <div key={i} className="w-5 h-5 rounded-full overflow-hidden border border-white/20">
                                    {v.profiles?.avatar_url ? (
                                        <img
                                            src={v.profiles.avatar_url.startsWith('http') ? v.profiles.avatar_url : supabase.storage.from('avatars').getPublicUrl(v.profiles.avatar_url).data.publicUrl}
                                            className="w-full h-full object-cover"
                                            alt=""
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gray-600 flex items-center justify-center text-[7px] font-bold text-white">
                                            {v.profiles?.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </button>
            </div>

            {/* Vendas do dia */}
            <div className="mb-6">
                <Link href={`/${profileSlug}/${storeSlug}`} className="block">
                    <div className="rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Vendas hoje</p>
                        <p className="text-2xl font-black mt-1" style={{ color: colors.textPrimary }}>
                            R$ {metrics.daily.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] font-bold mt-1" style={{ color: colors.accent }}>{metrics.daily.orders} pedidos</p>
                    </div>
                </Link>
            </div>

            {/* SEÇÃO DE ENTREGADORES E ROTAS */}
            <div className="mb-6 rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}>
                        <Truck size={16} style={{ color: colors.accent }} /> Entregadores
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => router.push(`/${profileSlug}/${storeSlug}/entregadores`)}
                            className="text-[10px] font-black uppercase px-3 py-1 rounded-full transition-colors"
                            style={{
                                background: 'transparent',
                                border: `1px solid ${colors.border}`,
                                color: colors.textSecondary,
                            }}
                        >
                            Gerenciar
                        </button>
                        <button
                            onClick={() => router.push(`/${profileSlug}/${storeSlug}/rotas`)}
                            className="text-[10px] font-black uppercase px-3 py-1 rounded-full transition-colors flex items-center gap-1"
                            style={{
                                background: colors.accent,
                                color: colors.accentText,
                            }}
                        >
                            <MapIcon size={12} /> Rotas do dia
                        </button>
                    </div>
                </div>
                {employees.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        Nenhum entregador cadastrado. Clique em "Gerenciar" para adicionar.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {employees.slice(0, 4).map((emp: any) => (
                            <div key={emp.id} className="flex items-center gap-2 p-2 rounded-xl"
                                style={{ background: 'transparent', border: `1px solid ${colors.border}30` }}>
                                <div className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center text-xs font-black"
                                    style={{ color: colors.accent }}>
                                    {emp.name?.charAt(0) || 'E'}
                                </div>
                                <div>
                                    <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>{emp.name}</p>
                                    <p className="text-[9px]" style={{ color: colors.textSecondary }}>Ativo</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Produtos vistos agora e Agendamentos pendentes */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <DashboardCard
                    title="Prod. vistos hoje"
                    value={productViews.today || 0}
                    icon={<ShoppingBag size={20} />}
                    color={colors.accent}
                />
                <DashboardCard
                    title="Agend. pendentes"
                    value={pendingAppointments.length}
                    icon={<Clock size={20} />}
                    color={colors.accentLight}
                />
            </div>

            {/* Produtos sendo vistos agora */}
            {productsViewedNow.length > 0 && (
                <div className="mb-6 rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                    <div style={sectionTitle}>
                        <Eye size={16} /> Produtos sendo vistos agora
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {productsViewedNow.map(p => (
                            <span key={p.id} className="px-3 py-1 rounded-full text-xs font-medium"
                                style={{ background: `${colors.accent}22`, color: colors.accent }}>{p.name}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Agendamentos pendentes */}
            {pendingAppointments.length > 0 && (
                <div className="mb-6 rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                    <div style={sectionTitle}>
                        <Calendar size={16} /> Agendamentos aguardando confirmação
                    </div>
                    <div className="space-y-2">
                        {pendingAppointments.slice(0, 3).map((apt: any) => (
                            <div key={apt.id} className="flex items-center justify-between py-2 px-3 rounded-xl"
                                style={{ background: 'transparent', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center text-xs font-bold">
                                        {apt.client?.name?.[0] || '?'}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>{apt.client?.name || 'Cliente'}</p>
                                        <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                            {new Date(apt.start_time).toLocaleString('pt-BR')} - {apt.service_name}
                                        </p>
                                    </div>
                                </div>
                                <button className="text-[10px] font-bold px-2 py-1 rounded-full"
                                    style={{ background: colors.accent, color: colors.accentText }}
                                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/agendamentos`)}>Ver</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pedidos com seleção para entrega */}
            <div className="mb-6 space-y-5">
                {/* Botão de atribuir em massa (aparece se houver selecionados) */}
                {selectedOrderIds.size > 0 && (
                    <div className="sticky top-4 z-30 flex justify-center">
                        <button
                            onClick={() => setShowAssignModal(true)}
                            className="px-6 py-2 rounded-full font-black text-xs flex items-center gap-2 shadow-lg"
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                color: colors.accentText,
                            }}
                        >
                            <Send size={14} />
                            Atribuir {selectedOrderIds.size} pedido(s) a um entregador
                        </button>
                    </div>
                )}

                {invites.length > 0 && (
                    <div className="rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                        <h4 className="text-[10px] font-black uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: colors.accent }}>
                            <Clock size={12} /> Novos Pedidos ({invites.length})
                        </h4>
                        {invites.map((order: any) => (
                            <div key={order.checkout_id} onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-3 rounded-xl mb-2 cursor-pointer transition-all"
                                style={{ background: `${colors.accent}10`, border: `1px solid ${colors.accent}30`, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                <div>
                                    <span className="text-base font-black" style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                    <p className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{order.items.length} itens</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black" style={{ color: colors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                                    <ChevronRight size={16} style={{ color: colors.accent }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {inPreparo.length > 0 && (
                    <div className="rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                        <h4 className="text-[10px] font-black uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: colors.accentLight }}>
                            <Package size={12} /> Em Preparo ({inPreparo.length})
                        </h4>
                        {inPreparo.map((order: any) => (
                            <div key={order.checkout_id}
                                className="flex items-center justify-between p-3 rounded-xl mb-2 cursor-pointer"
                                style={{ background: `${colors.accentLight}10`, border: `1px solid ${colors.accentLight}30`, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                <div className="flex items-center gap-2">
                                    {/* Checkbox para seleção */}
                                    <div onClick={(e) => { e.stopPropagation(); toggleOrderSelection(order.checkout_id) }}
                                        className="cursor-pointer">
                                        {selectedOrderIds.has(order.checkout_id) ? (
                                            <CheckSquare size={18} style={{ color: colors.accent }} />
                                        ) : (
                                            <Square size={18} style={{ color: colors.textSecondary }} />
                                        )}
                                    </div>
                                    <div onClick={() => setSelectedOrder(order)}>
                                        <span className="text-base font-black" style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                        {order.delivery_address && (
                                            <p className="text-[9px] flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                                <MapPin size={10} /> {order.delivery_address}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2" onClick={() => setSelectedOrder(order)}>
                                    <span className="text-lg font-black" style={{ color: colors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                                    <ChevronRight size={16} style={{ color: colors.accentLight }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {forReady.length > 0 && (
                    <div className="rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                        <h4 className="text-[10px] font-black uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: '#8b5cf6' }}>
                            <CheckCircle2 size={12} /> Prontos ({forReady.length})
                        </h4>
                        {forReady.map((order: any) => (
                            <div key={order.checkout_id}
                                className="flex items-center justify-between p-3 rounded-xl mb-2 cursor-pointer"
                                style={{ background: '#8b5cf610', border: '1px solid #8b5cf630', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                <div className="flex items-center gap-2">
                                    <div onClick={(e) => { e.stopPropagation(); toggleOrderSelection(order.checkout_id) }}
                                        className="cursor-pointer">
                                        {selectedOrderIds.has(order.checkout_id) ? (
                                            <CheckSquare size={18} style={{ color: colors.accent }} />
                                        ) : (
                                            <Square size={18} style={{ color: colors.textSecondary }} />
                                        )}
                                    </div>
                                    <div onClick={() => setSelectedOrder(order)}>
                                        <span className="text-base font-black" style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                        {order.delivery_address && (
                                            <p className="text-[9px] flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                                <MapPin size={10} /> {order.delivery_address}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2" onClick={() => setSelectedOrder(order)}>
                                    <span className="text-lg font-black" style={{ color: colors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                                    <ChevronRight size={16} style={{ color: '#8b5cf6' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {accepted.length > 0 && (
                    <div className="rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                        <h4 className="text-[10px] font-black uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: '#22c55e' }}>
                            <CheckCircle2 size={12} /> Finalizados ({accepted.length})
                        </h4>
                        {accepted.slice(0, 3).map((order: any) => (
                            <div key={order.checkout_id} onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-3 rounded-xl mb-2 cursor-pointer"
                                style={{ background: '#22c55e10', border: '1px solid #22c55e30', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                <span className="text-base font-black" style={{ color: colors.textPrimary }}>@{order.buyer_profile_slug}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black" style={{ color: colors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                                    <ChevronRight size={16} style={{ color: '#22c55e' }} />
                                </div>
                            </div>
                        ))}
                        {accepted.length > 3 && <p className="text-[9px] text-center mt-1" style={{ color: colors.textSecondary }}>+{accepted.length - 3} finalizados</p>}
                    </div>
                )}

                {groupedOrders.length === 0 && (
                    <div className="text-center py-8" style={{ color: colors.textSecondary }}>
                        <Package size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="font-bold text-sm">Nenhum pedido ainda</p>
                    </div>
                )}
            </div>

            {/* Estatísticas de Visitas */}
            <div className="mb-6 rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: colors.textPrimary }}>
                    <TrendingUp size={16} /> Visitas na loja
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    <StatItem label="Hoje" value={storeVisits.today || 0} />
                    <StatItem label="Ontem" value={storeVisits.yesterday || 0} />
                    <StatItem label="Semana" value={storeVisits.week || 0} />
                    <StatItem label="Mês" value={storeVisits.month || 0} />
                    <StatItem label="Ano" value={storeVisits.year || 0} />
                    <StatItem label="Total" value={storeVisits.all || 0} highlight color={colors.accent} />
                </div>
            </div>

            {/* Visualizações de Produtos */}
            <div className="mb-6 rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: colors.textPrimary }}>
                    <PackageOpen size={16} /> Visualizações de produtos
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    <StatItem label="Hoje" value={productViews.today || 0} />
                    <StatItem label="Ontem" value={productViews.yesterday || 0} />
                    <StatItem label="Semana" value={productViews.week || 0} />
                    <StatItem label="Mês" value={productViews.month || 0} />
                    <StatItem label="Ano" value={productViews.year || 0} />
                    <StatItem label="Total" value={productViews.all || 0} highlight color={colors.accent} />
                </div>
            </div>

            {/* Horários de Funcionamento */}
            <div className="mb-6 rounded-2xl p-6 border shadow-sm" style={cardStyle}>
                <button onClick={() => setShowScheduleEditor(!showScheduleEditor)}
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider hover:text-opacity-80 transition-colors"
                    style={{ color: colors.textSecondary }}>
                    <Clock3 size={14} /> Horários de Funcionamento
                    <ChevronRight size={14} className={`transform transition-transform ${showScheduleEditor ? 'rotate-90' : ''}`} />
                </button>
                {showScheduleEditor && (
                    <div className="mt-3 space-y-4">
                        <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                            Defina o horário para cada dia
                        </p>
                        {DAYS_OF_WEEK.map(day => {
                            const current = businessHours[day.key] || { open: '', close: '' }
                            return (
                                <div key={day.key} className="border-b border-opacity-20 pb-2 last:border-0" style={{ borderColor: colors.border }}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold uppercase w-20" style={{ color: colors.textPrimary }}>{day.label}</span>
                                        <button onClick={() => clearDay(day.key)} className="text-[9px] font-bold text-red-400 hover:text-red-300">Fechado</button>
                                    </div>
                                    <div className="mb-1">
                                        <p className="text-[8px] mb-1" style={{ color: colors.textSecondary }}>Abre às</p>
                                        <div className="flex flex-wrap gap-1 items-center">
                                            {COMMON_HOURS.slice(0, 9).map(hour => (
                                                <button key={`open-${day.key}-${hour}`}
                                                    onClick={() => { setTimeForDay(day.key, 'open', hour); setCustomOpen(prev => ({ ...prev, [day.key]: false })) }}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors ${current.open === hour ? 'text-white border-transparent' : 'border-gray-500 text-gray-400 hover:border-orange-500'}`}
                                                    style={current.open === hour ? { background: colors.accent } : { background: 'transparent', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                                    {hour}
                                                </button>
                                            ))}
                                            <button onClick={() => toggleCustom(day.key, 'open')}
                                                className={`px-2 py-1 text-[10px] font-bold rounded-lg border ${customOpen[day.key] ? 'bg-gray-600 border-gray-400' : 'border-dashed border-gray-500 text-gray-400'}`}
                                                style={{ background: customOpen[day.key] ? undefined : 'transparent', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                                {customOpen[day.key] ? 'Fechar' : 'Outro'}
                                            </button>
                                        </div>
                                        {customOpen[day.key] && (
                                            <input type="time" value={current.open}
                                                onChange={e => setTimeForDay(day.key, 'open', e.target.value)}
                                                className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none focus:border-orange-500" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[8px] mb-1" style={{ color: colors.textSecondary }}>Fecha às</p>
                                        <div className="flex flex-wrap gap-1 items-center">
                                            {COMMON_HOURS.slice(9).map(hour => (
                                                <button key={`close-${day.key}-${hour}`}
                                                    onClick={() => { setTimeForDay(day.key, 'close', hour); setCustomClose(prev => ({ ...prev, [day.key]: false })) }}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors ${current.close === hour ? 'text-white border-transparent' : 'border-gray-500 text-gray-400 hover:border-orange-500'}`}
                                                    style={current.close === hour ? { background: colors.accent } : { background: 'transparent', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                                    {hour}
                                                </button>
                                            ))}
                                            <button onClick={() => toggleCustom(day.key, 'close')}
                                                className={`px-2 py-1 text-[10px] font-bold rounded-lg border ${customClose[day.key] ? 'bg-gray-600 border-gray-400' : 'border-dashed border-gray-500 text-gray-400'}`}
                                                style={{ background: customClose[day.key] ? undefined : 'transparent', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                                {customClose[day.key] ? 'Fechar' : 'Outro'}
                                            </button>
                                        </div>
                                        {customClose[day.key] && (
                                            <input type="time" value={current.close}
                                                onChange={e => setTimeForDay(day.key, 'close', e.target.value)}
                                                className="mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none focus:border-orange-500" />
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        <button onClick={handleSaveSchedule} disabled={savingSchedule}
                            className="w-full py-2 rounded-full font-black text-[10px] uppercase flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.accentText }}>
                            {savingSchedule ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Salvar Horários</>}
                        </button>
                    </div>
                )}
            </div>

            {/* Ações rápidas */}
            <div className="grid grid-cols-2 gap-3">
                <QuickActionButton icon={<Settings size={18} />} label="Editar loja"
                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/editar-loja`)} />
                <QuickActionButton icon={<Plus size={18} />} label="Adicionar produto"
                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/criar-produto`)} />
                <QuickActionButton icon={<Calendar size={18} />} label="Agendamentos"
                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/agendamentos`)} />
                <QuickActionButton icon={<Truck size={18} />} label="Entregadores"
                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/entregadores`)} />
            </div>

            {/* Modal de pedido */}
            {selectedOrder && (
                <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onAction={handleOrderAction} />
            )}

            {/* Modal de atribuição de entregador */}
            {showAssignModal && (
                <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
                    <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Selecionar Entregador
                            </h3>
                            <button onClick={() => setShowAssignModal(false)}>
                                <X size={20} style={{ color: colors.textSecondary }} />
                            </button>
                        </div>
                        <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                            {selectedOrderIds.size} pedido(s) selecionado(s). Escolha o entregador que fará a rota.
                        </p>
                        {employees.length === 0 ? (
                            <div className="text-center py-4">
                                <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhum entregador disponível.</p>
                                <button
                                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/entregadores`)}
                                    className="mt-2 text-xs font-bold underline" style={{ color: colors.accent }}>
                                    Cadastrar entregador
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2 mb-4">
                                {employees.map((emp: any) => (
                                    <EmployeeSelectItem key={emp.id} employee={emp} />
                                ))}
                            </div>
                        )}
                        <button
                            onClick={handleAssignDelivery}
                            disabled={!selectedEmployeeId || assigning}
                            className="w-full py-2 rounded-full font-black text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{
                                background: selectedEmployeeId
                                    ? `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`
                                    : `${colors.border}`,
                                color: selectedEmployeeId ? colors.accentText : colors.textSecondary,
                            }}
                        >
                            {assigning ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <><Send size={14} /> Confirmar Atribuição</>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Diálogos de visitantes */}
            {dialogOpen === 'online' && (
                <DialogContainer title="Visitantes olhando a loja atualmente" count={onlineNow} onClose={() => setDialogOpen(null)}>
                    {fullOnlineVisitors.map(renderVisitorItem)}
                </DialogContainer>
            )}

            {dialogOpen === 'today' && (
                <DialogContainer title="Visitantes hoje" count={todayVisitsCount} onClose={() => setDialogOpen(null)}>
                    {fullTodayVisitors.map(renderVisitorItem)}
                </DialogContainer>
            )}

            {dialogOpen === 'all' && (
                <DialogContainer title="Visitantes" count={totalUniqueVisitors} onClose={() => setDialogOpen(null)}>
                    {allUniqueVisitors.map(renderVisitorItem)}
                </DialogContainer>
            )}
        </div>
    )
}

// Componentes auxiliares com fundo transparente
function DashboardCard({ title, value, icon, color }: any) {
    const { colors } = useTheme()
    return (
        <div className="p-4 rounded-2xl flex flex-col"
            style={{ background: 'transparent', border: `1px solid ${color}30`, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
            <div className="flex items-center gap-2 mb-2">
                <span style={{ color }}>{icon}</span>
                <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{title}</span>
            </div>
            <span className="text-2xl font-black" style={{ color }}>{value}</span>
        </div>
    )
}

function StatItem({ label, value, highlight = false, color = '' }: { label: string; value: number; highlight?: boolean; color?: string }) {
    const { colors } = useTheme()
    const textColor = highlight ? color || colors.accent : colors.textPrimary
    return (
        <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: colors.textSecondary }}>{label}</p>
            <p className="text-lg font-black mt-1" style={{ color: textColor }}>{value}</p>
        </div>
    )
}

function QuickActionButton({ icon, label, onClick }: any) {
    const { colors } = useTheme()
    return (
        <button onClick={onClick}
            className="flex items-center justify-center gap-2 p-3 rounded-2xl transition-colors hover:bg-opacity-80"
            style={{ background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textPrimary, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
            {icon}
            <span className="text-xs font-bold">{label}</span>
        </button>
    )
}

function DialogContainer({ title, count, onClose, children }: { title: string; count: number; onClose: () => void; children: React.ReactNode }) {
    const { colors } = useTheme()
    return (
        <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>{title} ({count})</h3>
                    <button onClick={onClose}><X size={20} style={{ color: colors.textSecondary }} /></button>
                </div>
                {React.Children.count(children) === 0 ? (
                    <p style={{ color: colors.textSecondary }}>Nenhum visitante.</p>
                ) : (
                    <div className="space-y-2">{children}</div>
                )}
            </div>
        </div>
    )
}