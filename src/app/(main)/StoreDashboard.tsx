// app/(main)/[profileSlug]/[storeSlug]/StoreDashboard.tsx
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
    Settings,
    Plus,
    Users,
    RefreshCw,
    X,
    Truck,
    Send,
    DollarSign,
    ShoppingCart,
    Package,
    ArrowUpDown,
    Pencil,
    MapPin,
    Phone,
    Store,
} from 'lucide-react'
import { OrderModal } from '../../components/OrderModal'
import Employee from './Employee'
import SchedulesAndAvailability from './SchedulesAndAvailability'
import ButtonInPersonSale from './ButtonInPersonSale'
import Publication from './Publication' // 👈 novo componente

function startOfDay(date: Date = new Date()): string {
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
}

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

export default function StoreDashboard({ profileSlug, storeSlug, onBack }: { profileSlug: string; storeSlug: string; onBack?: () => void }) {
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

    const [acceptsPix, setAcceptsPix] = useState(false)
    const [acceptsCard, setAcceptsCard] = useState(false)
    const [acceptsDelivery, setAcceptsDelivery] = useState(false)
    const [acceptsPickup, setAcceptsPickup] = useState(false)
    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState<'cpf' | 'email' | 'phone' | 'random'>('cpf')
    const [deliveryMode, setDeliveryMode] = useState<'fixed' | 'distance'>('fixed')
    const [fixedDeliveryFee, setFixedDeliveryFee] = useState('')
    const [distanceRules, setDistanceRules] = useState<{ max_km: string; fee: string }[]>([])

    const [assignmentMap, setAssignmentMap] = useState<Map<string, { employeeName: string; status: string }>>(new Map())
    const [ownerProfile, setOwnerProfile] = useState<{ name: string; phone?: string } | null>(null)

    const [dialogOpen, setDialogOpen] = useState<'online' | 'today' | 'all' | null>(null)

    const [initialBusinessHours, setInitialBusinessHours] = useState<Record<string, { open: string; close: string }>>({})

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
        setInitialBusinessHours(storeData.business_hours || {})

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

        if (storeData.owner_id) {
            const { data: ownerData } = await supabase
                .from('profiles')
                .select('name, phone')
                .eq('id', storeData.owner_id)
                .single()
            if (ownerData) setOwnerProfile({ name: ownerData.name, phone: ownerData.phone })
        }

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

        if (ordersError) {
            console.error('[Painel] Erro ao buscar pedidos das rotas:', ordersError)
            return
        }

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

    const ensureOwnerEmployee = async (): Promise<string | null> => {
        if (!store?.id || !store?.owner_id || !ownerProfile) return null

        const { data: existing } = await supabase
            .from('employees')
            .select('id')
            .eq('store_id', store.id)
            .eq('profile_id', store.owner_id)
            .maybeSingle()

        if (existing) return existing.id

        const { data: newEmp, error } = await supabase
            .from('employees')
            .insert({
                store_id: store.id,
                name: ownerProfile.name || 'Dono',
                phone: ownerProfile.phone || '',
                is_active: true,
                profile_id: store.owner_id,
            })
            .select('id')
            .single()

        if (error) {
            toast.error('Erro ao criar seu perfil de entregador')
            console.error(error)
            return null
        }

        const { data: empData } = await supabase.from('employees').select('*').eq('store_id', store.id).eq('is_active', true)
        setEmployees(empData || [])
        await fetchEmployeeRoutes()

        return newEmp.id
    }

    const handleAssignDelivery = async (employeeId?: string) => {
        const empId = employeeId || selectedEmployeeId
        if (!empId || selectedOrderIds.size === 0 || !store) return
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

    const formatAssignmentStatus = (status: string) => {
        switch (status) {
            case 'pending': return 'Pendente'
            case 'in_transit': return 'A caminho'
            case 'delivered': return 'Entregue'
            default: return status
        }
    }

    if (loading) return <LoadingSpinner message="Carregando painel..." />
    if (!store) return null

    const storeOpen = store.is_open
    const newOrders = groupedOrders.filter(o => o.status === 'pending')
    const preparing = groupedOrders.filter(o => o.status === 'preparing')
    const ready = groupedOrders.filter(o => o.status === 'ready')
    const finished = groupedOrders.filter(o => o.status === 'paid')

    const selectedAssignment = selectedOrder ? assignmentMap.get(selectedOrder.checkout_id) : null

    // Componente de item do pedido (com tag de canal na mesma linha do nome)
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
                    <div className="text-right">
                        {/* espaço vazio para alinhamento */}
                    </div>
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

            {/* Venda Presencial */}
            <ButtonInPersonSale
                storeId={store.id}
                storeName={store.name}
                storeSlug={storeSlug}
                profileSlug={profileSlug}
                onSaleCompleted={() => loadDashboard()}
            />

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
                            <OrderItem key={order.checkout_id} order={order} />
                        ))}
                    </div>
                )}

                {/* Em Preparo */}
                {preparing.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: colors.accentLight }}>Em Preparo ({preparing.length})</h4>
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
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setSingleAssignOpen({ order })
                                                }}
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

                {/* Prontos */}
                {ready.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#8b5cf6' }}>Prontos ({ready.length})</h4>
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
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setSingleAssignOpen({ order })
                                                }}
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

                {/* Finalizados */}
                {finished.length > 0 && (
                    <div className="rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#22c55e' }}>Finalizados ({finished.length})</h4>
                        {finished.slice(0, 5).map(order => (
                            <OrderItem key={order.checkout_id} order={order} showAssignButton={false} />
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

            {/* Funcionários */}
            <Employee
                employees={employees}
                employeeRoutes={employeeRoutes}
                assignmentMap={assignmentMap}
                expandedEmployee={expandedEmployee}
                onToggleExpand={setExpandedEmployee}
                storeId={store.id}
                onRefresh={fetchEmployeeRoutes}
            />

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

            {/* Agendamentos */}
            <SchedulesAndAvailability storeId={store.id} />

            {/* Publicações */}
            <Publication storeId={store.id} />

            {/* Ações rápidas */}
            <div className="grid grid-cols-2 gap-3">
                <button onClick={() => router.push(`/${profileSlug}/${storeSlug}/editar-loja`)} className="p-3 rounded-2xl border flex items-center gap-2" style={{ background: 'transparent', borderColor: colors.border }}>
                    <Settings size={18} /> Editar loja
                </button>
                <button onClick={() => router.push(`/${profileSlug}/${storeSlug}/criar-produto`)} className="p-3 rounded-2xl border flex items-center gap-2" style={{ background: 'transparent', borderColor: colors.border }}>
                    <Plus size={18} /> Adicionar produto
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
                            {ownerProfile && (
                                <div
                                    onClick={handleAssignAsOwner}
                                    className="p-3 rounded-xl cursor-pointer border flex items-center gap-3 hover:bg-white/5 transition-colors"
                                    style={{ borderColor: colors.border }}
                                >
                                    <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-sm text-white font-bold">
                                        {ownerProfile.name.charAt(0)}
                                    </div>
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

            {/* Modal de atribuição rápida */}
            {singleAssignOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSingleAssignOpen(null)}>
                    <div className="w-full max-w-xs rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Atribuir pedido</h3>
                            <button onClick={() => setSingleAssignOpen(null)}><X size={20} /></button>
                        </div>
                        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                            Pedido de @{singleAssignOpen.order.buyer_profile_slug || singleAssignOpen.order.buyer_name || 'Cliente'} • R$ {singleAssignOpen.order.totalPrice.toFixed(2)}
                        </p>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {ownerProfile && (
                                <div
                                    onClick={handleSingleAssignAsOwner}
                                    className="p-3 rounded-xl cursor-pointer border flex items-center gap-3 hover:bg-white/5 transition-colors"
                                    style={{ borderColor: colors.border }}
                                >
                                    <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-sm text-white font-bold">
                                        {ownerProfile.name.charAt(0)}
                                    </div>
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

            {selectedOrder && (
                <OrderModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onAction={handleOrderAction}
                    assignmentInfo={selectedAssignment || undefined}
                    storeLat={store.store_lat}
                    storeLng={store.store_lng}
                />
            )}

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