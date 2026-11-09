// app/(main)/StoreOrders.tsx
'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import StoreServiceOrders, { useStoreServiceAppointments } from './StoreServiceOrders'
import StatChips from './StatChips'
import { supabase } from '@/lib/supabase/client'
import { useInsideShell } from '@/components/InsideShell'
import { callAdminApi } from '@/lib/callAdminApi'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { releaseOrder } from '@/modules/digital'
import { hexToRgb } from '@/lib/color'
import {
    Send,
    X,
    Store,
    ChevronDown,
    ChevronUp,
    Clock,
    RefreshCw,
    CheckCircle,
    Package,
    Truck,
    MessageCircle,
    KeyRound,
    Check,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import CallIuserDriverDialog from './CallIuserDriverDialog'
import { etaMinutes, haversineKm, fetchPickupCodes, type PickupCode } from '@/modules/deliveries'
import { OrderModal } from '@/components/OrderModal'
import { fetchOptimizedRoute } from '@/lib/mapboxRoute'
import { ensureEmployeeAccessToken, buildCourierRouteMessage } from '@/lib/courierLink'
import { getWhatsAppLink } from '@/lib/whatsapp'
import { handleShareLink } from '@/lib/share'
import { STORE_STATE_TEXT, brl as brlText } from '@/modules/delivery-search'
import StoreDeliveryPayment from '@/components/DeliveryPayment/StoreDeliveryPayment'

// Entrega V2 vista pela loja: o estado vem da fase da entrega (o pedido continua com o status dele)
const RELEASED_PHASES = ['ENTREGA_LIBERADA', 'A_CAMINHO_DA_LOJA', 'CHEGOU_NA_LOJA', 'PEDIDO_RETIRADO', 'A_CAMINHO_DO_CLIENTE', 'ENTREGUE', 'CONCLUIDO']
const isReleasedPhase = (phase: string) => RELEASED_PHASES.includes(phase)
function v2StateOf(phase: string): string {
    if (phase === 'AGUARDANDO_AUTORIZACAO_REAJUSTE') return 'awaiting_authorization'
    if (phase === 'ENTREGADOR_RESERVADO') return 'driver_reserved'
    if (phase === 'AGUARDANDO_PAGAMENTO_CLIENTE') return 'awaiting_payment'
    if (phase === 'LOJA_INFORMOU_RECEBIMENTO') return 'customer_payment_reported'
    if (phase === 'AGUARDANDO_PAGAMENTO_ENTREGADOR') return 'awaiting_driver_payment'
    if (phase === 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR') return 'driver_payment_reported'
    if (phase === 'PAGAMENTO_EM_VERIFICACAO') return 'payment_in_verification'
    if (phase === 'ENTREGADOR_CONFIRMOU_RECEBIMENTO') return 'receipt_confirmed'
    if (phase === 'SEM_ENTREGADOR') return 'no_driver'
    if (isReleasedPhase(phase)) return 'released'
    return 'searching'
}
/** Texto do entregador de um pedido (o que a loja precisa saber de relance): confirmado quem é, onde está, ou que ainda busca */
function driverText(info: { stage?: string; driver?: string | null; freight: number; radius: number; v2State?: string | null; frozen?: number | null; etaMin?: number | null } | undefined, accepted: boolean): string {
    if (info?.v2State) return storeV2Text(info as { freight: number; radius: number; v2State?: string | null; frozen?: number | null })
    if (accepted) {
        const quem = info?.driver ? info.driver.trim().split(' ')[0] : 'Entregador'
        // ainda a caminho da loja: quanto falta para chegar (pela posição ao vivo dele)
        if ((info?.stage === 'assigned' || info?.stage === 'to_store' || !info?.stage) && info?.etaMin != null) {
            return info.etaMin <= 1 ? `${quem} está chegando na loja` : `${quem} chega em ~${info.etaMin} min`
        }
        const m: Record<string, string> = { assigned: `${quem} vai buscar o pedido`, to_store: `${quem} a caminho da loja`, at_store: `${quem} está na loja esperando`, in_transit: `${quem} saiu para entregar` }
        return m[info?.stage || ''] || `${quem} vai buscar o pedido`
    }
    return `Buscando motorista${info ? ` · R$ ${info.freight.toFixed(2)} · até ${info.radius} km` : ''}`
}

function storeV2Text(info: { freight: number; radius: number; v2State?: string | null; frozen?: number | null }): string {
    const base = STORE_STATE_TEXT[info.v2State || 'searching'] || 'Entrega em andamento'
    if (info.v2State === 'searching') return `${base} · ${brlText(info.freight)} · até ${info.radius} km`
    if ((info.v2State === 'driver_reserved' || info.v2State === 'awaiting_payment') && info.frozen != null) return `${base} · frete ${brlText(info.frozen)}`
    return base
}

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

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

interface StoreOrdersProps {
    storeId: string
    storeName?: string
    onOrderCountsChange?: (counts: { pending: number; preparing: number; ready: number }) => void
    onRefresh?: () => void
    /** 'panel' (padrão): o cartão-resumo do painel (contadores + só os pedidos NOVOS + atalho); 'page': a lista completa da página "Pedidos da loja" */
    variant?: 'panel' | 'page'
    /** O endereço da loja (o atalho "Ver todos os pedidos" do painel leva a /painel-loja/<storeSlug>/pedidos) */
    storeSlug?: string
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Fallback por linha reta (vizinho mais próximo) - usado quando a rota real
// por ruas (fetchOptimizedRoute, em mapboxRoute.ts) falha ou não dá conta
// (mais de 11 paradas de uma vez).
function optimizeRouteFallback(storeLat: number, storeLng: number, stops: { id: string; lat: number; lng: number }[]) {
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

const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
}

const pillButtonFullStyle = {
    ...pillButtonStyle,
    flex: 1,
}

export default function StoreOrders({
    storeId,
    storeName = 'Loja',
    onOrderCountsChange,
    onRefresh,
    variant = 'panel',
    storeSlug,
}: StoreOrdersProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const v3 = useInsideShell()
    const router = useRouter()

    const [groupedOrders, setGroupedOrders] = useState<any[]>([])
    const [selectedOrder, setSelectedOrder] = useState<any>(null)
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
    const [assigning, setAssigning] = useState(false)
    const [employees, setEmployees] = useState<any[]>([])
    const [employeeRoutes, setEmployeeRoutes] = useState<EmployeeRoute[]>([])
    const [assignmentMap, setAssignmentMap] = useState<Map<string, { employeeName: string; status: string }>>(new Map())
    const [ownerProfile, setOwnerProfile] = useState<{ name: string; phone?: string } | null>(null)
    const [singleAssignOpen, setSingleAssignOpen] = useState<{ order: any } | null>(null)
    const [iuserDeliveryEnabled, setIuserDeliveryEnabled] = useState(false)
    const [dispatchedOrderIds, setDispatchedOrderIds] = useState<Set<string>>(new Set())
    const [acceptedDispatchIds, setAcceptedDispatchIds] = useState<Set<string>>(new Set())
    const [dispatchInfo, setDispatchInfo] = useState<Map<string, { id: string; freight: number; radius: number; stage: string; v2State?: string | null; frozen?: number | null; driver?: string | null; etaMin?: number | null }>>(new Map())
    const [callDriverOrder, setCallDriverOrder] = useState<any>(null)
    // a posição dos entregadores muda: refaz o "chega em X min" a cada 20 s (com a aba à vista)
    const [etaTick, setEtaTick] = useState(0)
    useEffect(() => {
        const t = setInterval(() => { if (!document.hidden) setEtaTick((n) => n + 1) }, 20000)
        return () => clearInterval(t)
    }, [])
    const [store, setStore] = useState<any>(null)

    useEffect(() => {
        supabase.from('stores').select('iuser_delivery_enabled').eq('id', storeId).maybeSingle()
            .then(({ data }) => setIuserDeliveryEnabled(!!data?.iuser_delivery_enabled))
    }, [storeId])

    // Pedidos que já têm motorista iUser chamado (corrida ativa ligada ao pedido).
    useEffect(() => {
        const ids = groupedOrders.map((o) => o.id).filter(Boolean)
        if (ids.length === 0) return
        supabase.from('order_delivery_dispatches').select('id, order_id, ride_request_id, status, stage, final_freight, radius_km, flow_version, phase, frozen_freight').in('order_id', ids).or('status.in.(searching,accepted),and(status.eq.cancelled,phase.eq.SEM_ENTREGADOR)')
            .then(({ data }) => {
                setDispatchedOrderIds(new Set((data || []).map((r) => r.order_id as string)))
                setAcceptedDispatchIds(new Set((data || []).filter((r) => r.status === 'accepted' && !(r.flow_version === 2 && !isReleasedPhase(r.phase as string))).map((r) => r.order_id as string)))
                const base = new Map((data || []).map((r) => [r.order_id as string, { id: r.id as string, freight: Number(r.final_freight), radius: Number(r.radius_km), stage: r.stage as string, v2State: r.flow_version === 2 ? v2StateOf(r.phase as string) : null, frozen: r.frozen_freight != null ? Number(r.frozen_freight) : null, driver: null as string | null, etaMin: null as number | null }]))
                setDispatchInfo(base)
                // quem é o entregador que aceitou (nome público): a loja precisa saber de relance quem vem buscar
                const rideOf = new Map((data || []).filter((r) => r.status === 'accepted' && r.ride_request_id).map((r) => [r.ride_request_id as string, r.order_id as string]))
                if (rideOf.size === 0) return
                supabase.from('ride_requests').select('id, driver_id, origin_lat, origin_lng').in('id', Array.from(rideOf.keys())).then(async ({ data: rides }) => {
                    const driverIds = Array.from(new Set((rides || []).map((x) => x.driver_id as string).filter(Boolean)))
                    if (driverIds.length === 0) return
                    const [{ data: profs }, { data: live }] = await Promise.all([
                        supabase.from('profiles').select('id, name').in('id', driverIds),
                        // posição ao vivo do entregador da corrida aceita (a loja é quem pediu a corrida, então o banco deixa ver)
                        supabase.from('driver_pricing').select('driver_id, live_lat, live_lng, live_updated_at').in('driver_id', driverIds),
                    ])
                    const nameOf = new Map((profs || []).map((p) => [p.id as string, p.name as string]))
                    const posOf = new Map((live || []).map((l) => [l.driver_id as string, l]))
                    const next = new Map(base)
                    for (const x of rides || []) {
                        const oid = rideOf.get(x.id as string)
                        const cur = oid ? next.get(oid) : null
                        if (!(oid && cur && x.driver_id)) continue
                        // minutos até a loja: linha reta × 1,3 (ruas) a ~30 km/h; sem posição recente (3 min) não chuta
                        const l = posOf.get(x.driver_id as string)
                        const fresh = l?.live_lat != null && l?.live_lng != null && l?.live_updated_at && Date.now() - new Date(l.live_updated_at as string).getTime() < 3 * 60_000
                        const eta = fresh && x.origin_lat != null && x.origin_lng != null
                            ? etaMinutes(haversineKm({ lat: Number(l!.live_lat), lng: Number(l!.live_lng) }, { lat: Number(x.origin_lat), lng: Number(x.origin_lng) }))
                            : null
                        next.set(oid, { ...cur, driver: nameOf.get(x.driver_id as string) || null, etaMin: eta })
                    }
                    setDispatchInfo(next)
                })
            })
    }, [groupedOrders, etaTick])

    const iuserDelivery = {
        enabled: iuserDeliveryEnabled,
        dispatchedIds: dispatchedOrderIds,
        acceptedIds: acceptedDispatchIds,
        info: dispatchInfo,
        onCall: (order: any) => setCallDriverOrder(order),
    }
    const [isOrdersExpanded, setIsOrdersExpanded] = usePersistedExpanded('storeOrders', true)
    // Pedidos de PRODUTOS e pedidos de SERVIÇOS (agendamentos que a loja precisa aceitar; só os aceitos vão para a agenda)
    const [ordersTab, setOrdersTab] = useState<'products' | 'services'>('products')
    const svc = useStoreServiceAppointments(storeId)
    // Página "Pedidos da loja": situação aberta (null = a primeira que tem pedido), quantos aparecem e qual pedido está sendo mudado
    const [pageTab, setPageTab] = useState<'pending' | 'preparing' | 'ready' | 'paid' | null>(null)
    const [shown, setShown] = useState(20)
    const [quickBusy, setQuickBusy] = useState<string | null>(null)
    // código de retirada de quem chegou para pegar pedidos (só o dono lê): a loja confere o que entrega e só então passa o código
    const [pickupCodes, setPickupCodes] = useState<PickupCode[]>([])
    useEffect(() => {
        if (!storeId || !iuserDeliveryEnabled) { setPickupCodes([]); return }
        let alive = true
        const run = () => fetchPickupCodes(storeId).then((c) => { if (alive) setPickupCodes(c) }).catch(() => { })
        run()
        const t = setInterval(run, 6000)
        return () => { alive = false; clearInterval(t) }
    }, [storeId, iuserDeliveryEnabled])

    // Ref para evitar múltiplas chamadas
    const isLoadingRef = useRef(false)
    const isMountedRef = useRef(true)
    const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const [isAutoRefreshing, setIsAutoRefreshing] = useState(false)
    const [initialLoading, setInitialLoading] = useState(true)

    // ===== LOAD ORDERS =====
    const loadOrders = useCallback(async () => {
        if (!storeId) return
        if (isLoadingRef.current) {
            console.log('[StoreOrders] Já está carregando, ignorando...')
            return
        }

        isLoadingRef.current = true

        try {
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, owner_id, store_lat, store_lng')
                .eq('id', storeId)
                .single()

            if (storeData) {
                setStore(storeData)

                if (storeData.owner_id) {
                    const { data: ownerData } = await supabase
                        .from('profiles')
                        .select('name')
                        .eq('id', storeData.owner_id)
                        .single()
                    if (ownerData) setOwnerProfile({ name: ownerData.name })
                }

                const { data: empData } = await supabase
                    .from('employees')
                    .select('*')
                    .eq('store_id', storeId)
                    .eq('is_active', true)
                setEmployees(empData || [])
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
                console.error('[StoreOrders] Erro ao buscar pedidos:', ordersError)
                toast.error('Erro ao carregar pedidos')
                if (isMountedRef.current) {
                    setGroupedOrders([])
                }
                isLoadingRef.current = false
                return
            }

            // Pedido SÓ de produto digital: não tem preparo nem entrega — a loja confirma o Pix e libera o acesso
            const productIds = [...new Set((ordersData || []).flatMap((o: any) => (o.order_items || []).map((i: any) => i.product_id).filter(Boolean)))] as string[]
            const digitalIds = new Set<string>()
            if (productIds.length > 0) {
                const { data: types } = await supabase.from('products').select('id').eq('type', 'digital').in('id', productIds)
                ;(types || []).forEach((t: any) => digitalIds.add(t.id))
            }
            const grouped = (ordersData || []).map(order => {
                const items = order.order_items || []
                const subtotal = items.reduce((acc: number, i: any) => acc + Number(i.total_price || 0), 0)
                const deliveryFee = Number(order.delivery_fee || 0)
                return {
                    id: order.id,
                    store_id: storeId,
                    checkout_id: order.checkout_id,
                    buyer_id: order.buyer_id,
                    is_digital: items.length > 0 && items.every((i: any) => digitalIds.has(i.product_id)),
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

            if (isMountedRef.current) {
                setGroupedOrders(grouped)

                if (onOrderCountsChange) {
                    const counts = {
                        pending: grouped.filter(o => o.status === 'pending').length,
                        preparing: grouped.filter(o => o.status === 'preparing').length,
                        ready: grouped.filter(o => o.status === 'ready').length,
                    }
                    onOrderCountsChange(counts)
                }
            }

        } catch (err) {
            console.error('[StoreOrders] Erro:', err)
            toast.error('Erro ao carregar dados')
        }

        isLoadingRef.current = false
        if (initialLoading) {
            setInitialLoading(false)
        }
    }, [storeId, onOrderCountsChange])

    // ===== FETCH EMPLOYEE ROUTES =====
    const fetchEmployeeRoutes = useCallback(async () => {
        if (!storeId) return

        try {
            const { data: assignments, error: assignError } = await supabase
                .from('delivery_assignments')
                .select('employee_id, checkout_id, sequence_order, status')
                .eq('store_id', storeId)
                .order('sequence_order')

            if (assignError) {
                console.error('[StoreOrders] Erro ao buscar atribuições:', assignError)
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
                console.error('[StoreOrders] Erro ao buscar pedidos das rotas:', ordersError)
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

            if (isMountedRef.current) {
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
            }
        } catch (err) {
            console.error('[StoreOrders] Erro em fetchEmployeeRoutes:', err)
        }
    }, [storeId, employees])

    // ===== AUTO REFRESH A CADA 3 SEGUNDOS =====
    const autoRefresh = useCallback(async () => {
        if (isLoadingRef.current) return

        setIsAutoRefreshing(true)

        try {
            await Promise.all([loadOrders(), fetchEmployeeRoutes()])
        } catch (err) {
            console.error('[StoreOrders] Erro no auto-refresh:', err)
        } finally {
            setIsAutoRefreshing(false)
        }
    }, [loadOrders, fetchEmployeeRoutes])

    // ===== INICIAR AUTO REFRESH =====
    useEffect(() => {
        if (!storeId) return

        if (autoRefreshIntervalRef.current) {
            clearInterval(autoRefreshIntervalRef.current)
            autoRefreshIntervalRef.current = null
        }

        autoRefreshIntervalRef.current = setInterval(() => {
            autoRefresh()
        }, 3000)

        console.log('[StoreOrders] Auto-refresh iniciado a cada 3 segundos')

        return () => {
            if (autoRefreshIntervalRef.current) {
                clearInterval(autoRefreshIntervalRef.current)
                autoRefreshIntervalRef.current = null
                console.log('[StoreOrders] Auto-refresh parado')
            }
        }
    }, [storeId, autoRefresh])

    // ===== REALTIME =====
    useEffect(() => {
        if (!storeId) return

        isMountedRef.current = true
        console.log('[StoreOrders] Conectando ao Realtime para pedidos da loja:', storeId)

        const ordersChannel = supabase
            .channel(`store-orders-${storeId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
                () => {
                    console.log('[StoreOrders] Mudança detectada nos pedidos')
                    loadOrders()
                }
            )
            .subscribe()

        const assignmentsChannel = supabase
            .channel(`store-assignments-${storeId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'delivery_assignments', filter: `store_id=eq.${storeId}` },
                () => {
                    console.log('[StoreOrders] Mudança detectada nas atribuições')
                    fetchEmployeeRoutes()
                }
            )
            .subscribe()

        return () => {
            isMountedRef.current = false
            console.log('[StoreOrders] Desconectando do Realtime')
            supabase.removeChannel(ordersChannel)
            supabase.removeChannel(assignmentsChannel)

            if (autoRefreshIntervalRef.current) {
                clearInterval(autoRefreshIntervalRef.current)
                autoRefreshIntervalRef.current = null
            }
        }
    }, [storeId, loadOrders, fetchEmployeeRoutes])

    // ===== CARREGAMENTO INICIAL =====
    useEffect(() => {
        if (storeId) {
            loadOrders()
        }
    }, [storeId])

    // ===== CARREGAR ROTAS INICIALMENTE =====
    useEffect(() => {
        if (storeId) {
            fetchEmployeeRoutes()
        }
    }, [storeId])

    // ===== HANDLE REFRESH (manual) =====
    const handleRefresh = () => {
        setIsAutoRefreshing(true)
        Promise.all([loadOrders(), fetchEmployeeRoutes()]).finally(() => {
            setIsAutoRefreshing(false)
        })
    }

    // ===== HANDLE ORDER ACTION =====
    const handleOrderAction = async (status: string, target: any = selectedOrder) => {
        const selectedOrder = target
        if (!selectedOrder) return

        // Produto digital: "Liberar acesso" confirma o Pix e abre o conteúdo para o cliente (release_digital_order; só a dona da loja)
        if (status === 'release') {
            try {
                await releaseOrder(selectedOrder.id)
                toast.success('Acesso liberado! O cliente já pode abrir o conteúdo.')
                loadOrders?.()
            } catch (e: any) { toast.error(e?.message || 'Não foi possível liberar') }
            return
        }

        try {
            const { error } = await supabase
                .from('orders')
                .update({ status })
                .eq('checkout_id', selectedOrder.checkout_id)

            if (error) {
                toast.error('Erro ao atualizar status: ' + error.message)
                return
            }

            supabase.auth.getSession().then(({ data: { session } }) => {
                if (!session) return
                fetch('/api/push/send-order-status-update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ checkoutId: selectedOrder.checkout_id, status }),
                }).catch(() => { })
            })

            // Entregador iUser: o banco abre a oferta ao aceitar; aqui só avisamos os motoristas do raio
            if (status === 'preparing' && iuserDeliveryEnabled && selectedOrder.delivery_address) {
                callAdminApi('/api/store-orders/dispatch-driver', { orderId: selectedOrder.id }).catch(() => { })
            }

            setSelectedOrder(null)
            await loadOrders()
            await fetchEmployeeRoutes()
            toast.success('Status atualizado!')
        } catch (err: any) {
            toast.error('Erro: ' + err.message)
        }
    }

    // ===== HANDLE ASSIGN DELIVERY =====
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
                console.error('[StoreOrders] Erro ao limpar atribuições anteriores:', deleteError)
                toast.error('Erro ao limpar atribuições anteriores.')
                setAssigning(false)
                return
            }

            const stops = ordersToAssign.map(o => ({ id: o.checkout_id, lat: o.delivery_lat, lng: o.delivery_lng }))
            const optimized = (await fetchOptimizedRoute(store_lat, store_lng, stops)) || optimizeRouteFallback(store_lat, store_lng, stops)
            const inserts = optimized.map(stop => ({
                store_id: store.id,
                employee_id: empId,
                checkout_id: stop.id,
                sequence_order: stop.sequence,
                status: 'pending'
            }))

            const { error: insertError } = await supabase.from('delivery_assignments').insert(inserts)
            if (insertError) {
                console.error('[StoreOrders] Erro ao atribuir entregas:', insertError)
                toast.error(`Erro ao atribuir: ${insertError.message}`)
                setAssigning(false)
                return
            }

            notifyEmployeeOfRoute(empId)
            setSelectedOrderIds(new Set())
            setShowAssignModal(false)
            setSelectedEmployeeId(null)
            await loadOrders()
            await fetchEmployeeRoutes()
        } catch (err: any) {
            console.error('[StoreOrders] Erro inesperado:', err)
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

            notifyEmployeeOfRoute(employeeId)
            setSingleAssignOpen(null)
            await loadOrders()
            await fetchEmployeeRoutes()
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setAssigning(false)
        }
    }

    // Manda o link de "minhas entregas" pro WhatsApp do entregador - funciona
    // pra quem tem conta no iUser e pra quem não tem, é sempre o mesmo link.
    const sendRouteToEmployee = async (emp: any) => {
        try {
            const token = await ensureEmployeeAccessToken(supabase, emp.id, emp.access_token)
            const url = `${window.location.origin}/entregador/${token}`
            const message = buildCourierRouteMessage(emp.name, storeName, url)

            if (emp.phone) {
                window.open(getWhatsAppLink(emp.phone, encodeURIComponent(message)), '_blank')
            } else {
                await handleShareLink({ title: 'Rota de entregas', text: message, url })
            }
        } catch (err: any) {
            toast.error(err.message || 'Erro ao gerar o link')
        }
    }

    // Depois de atribuir, oferece mandar a rota pro WhatsApp na hora (em vez
    // de a pessoa ter que ir até "Funcionários" fazer isso separado).
    const notifyEmployeeOfRoute = (employeeId: string) => {
        const emp = employees.find(e => e.id === employeeId)
        toast.success('Entregas atribuídas com sucesso!', emp ? {
            action: { label: 'Enviar rota no WhatsApp', onClick: () => sendRouteToEmployee(emp) },
        } : undefined)
    }

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

    const formatAssignmentStatus = (status: string) => {
        switch (status) {
            case 'pending': return 'Pendente'
            case 'in_transit': return 'A caminho'
            case 'delivered': return 'Entregue'
            default: return status
        }
    }

    const newOrders = groupedOrders.filter(o => o.status === 'pending')
    const preparing = groupedOrders.filter(o => o.status === 'preparing')
    const ready = groupedOrders.filter(o => o.status === 'ready')
    const finished = groupedOrders.filter(o => o.status === 'paid')
    // funil do painel: novos → em preparo → prontos (esperando quem retira) → a caminho do cliente
    const isDelivery = (o: any) => !!o.delivery_address && o.delivery_address !== 'Retirada no local'
    const onTheWay = ready.filter((o) => isDelivery(o) && dispatchInfo.get(o.id)?.stage === 'in_transit')
    const readyWaiting = ready.filter((o) => !onTheWay.includes(o))
    /** uma frase sobre COMO o pedido sai: retirada, entregador do iUser (quem e quando chega) ou entrega da própria loja */
    const lineFor = (o: any): { text: string; tone: 'ok' | 'wait' | 'warn' | 'plain' } => {
        if (!isDelivery(o)) return { text: 'Cliente retira na loja', tone: 'plain' }
        if (!iuserDeliveryEnabled) {
            const a = assignmentMap.get(o.checkout_id)
            return { text: a ? `Entregador: ${a.employeeName}` : 'Entrega pela loja', tone: 'plain' }
        }
        if (!dispatchedOrderIds.has(o.id)) return { text: 'Sem entregador', tone: 'warn' }
        const accepted = acceptedDispatchIds.has(o.id)
        const info = dispatchInfo.get(o.id)
        // entregador já na loja e o pedido ainda não está pronto: quem está esperando é ELE — fica em âmbar para a loja ver
        const waitingOnStore = accepted && info?.stage === 'at_store' && o.status !== 'ready'
        return { text: driverText(info, accepted), tone: accepted && !waitingOnStore ? 'ok' : 'wait' }
    }

    const selectedAssignment = selectedOrder ? assignmentMap.get(selectedOrder.checkout_id) : null
    // o que o dono precisa saber ao abrir o pedido: quem vem buscar (e em quanto tempo) ou que o cliente retira
    const selectedDeliveryLine = (() => {
        if (!selectedOrder || !selectedOrder.buyer_id) return undefined
        const addr = selectedOrder.delivery_address as string | undefined
        if (!addr || addr === 'Retirada no local') return { label: 'Retirada na loja', text: 'O cliente busca o pedido na loja. Não tem entregador.', tone: 'pickup' as const }
        if (!iuserDeliveryEnabled) return undefined
        if (!dispatchedOrderIds.has(selectedOrder.id)) return { label: 'Entregador do iUser', text: 'Ainda sem entregador. Use o caminhão na lista para chamar um.', tone: 'warn' as const }
        const accepted = acceptedDispatchIds.has(selectedOrder.id)
        return { label: 'Entregador do iUser', text: driverText(dispatchInfo.get(selectedOrder.id), accepted), tone: accepted ? ('ok' as const) : ('wait' as const) }
    })()

    // ===== CORES DOS PEDIDOS INDIVIDUAIS (MAIS ESCURAS) =====
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return '#16a34a'
            case 'preparing': return '#d97706'
            case 'ready': return '#7c3aed'
            case 'paid': return '#2563eb'
            default: return '#4b5563'
        }
    }

    const getStatusGradient = (status: string) => {
        switch (status) {
            case 'pending': return 'linear-gradient(135deg, #064e3b, #021a12)'
            case 'preparing': return 'linear-gradient(135deg, #451a03, #1c0f00)'
            case 'ready': return 'linear-gradient(135deg, #2e1065, #1a0a3a)'
            case 'paid': return 'linear-gradient(135deg, #1e293b, #0f172a)'
            default: return 'linear-gradient(135deg, #1a1a2e, #0d0d0d)'
        }
    }

    // ===== ESTADO VISUAL DO CARD "PEDIDOS NA LOJA" =====
    const cardState = useMemo(() => {
        const hasPending = groupedOrders.some(order => order.status === 'pending')
        const hasPreparing = groupedOrders.some(order => order.status === 'preparing')
        const hasReady = groupedOrders.some(order => order.status === 'ready')
        const onlyFinished = groupedOrders.length > 0 && groupedOrders.every(order => order.status === 'paid')

        if (hasPending) {
            return {
                border: '2px solid #16a34a',
                shadow: '0 0 20px rgba(22, 163, 74, 0.3), 0 0 40px rgba(22, 163, 74, 0.15)',
                hasAnimation: true,
                animationName: 'borderPulseGreen',
                badgeBackground: 'rgba(22, 163, 74, 0.15)',
                badgeColor: '#16a34a',
                animationKeyframes: `
                    @keyframes borderPulseGreen {
                        0%, 100% { 
                            box-shadow: 0 0 20px rgba(22, 163, 74, 0.3), 0 0 40px rgba(22, 163, 74, 0.15);
                            border-color: #16a34a;
                        }
                        50% { 
                            box-shadow: 0 0 30px rgba(22, 163, 74, 0.4), 0 0 60px rgba(22, 163, 74, 0.2);
                            border-color: #16a34add;
                        }
                    }
                `,
                borderColor: '#16a34a',
            }
        }

        if (hasPreparing) {
            return {
                border: '2px solid #d97706',
                shadow: '0 0 20px rgba(217, 119, 6, 0.3), 0 0 40px rgba(217, 119, 6, 0.15)',
                hasAnimation: true,
                animationName: 'borderPulseYellow',
                badgeBackground: 'rgba(217, 119, 6, 0.15)',
                badgeColor: '#d97706',
                animationKeyframes: `
                    @keyframes borderPulseYellow {
                        0%, 100% { 
                            box-shadow: 0 0 20px rgba(217, 119, 6, 0.3), 0 0 40px rgba(217, 119, 6, 0.15);
                            border-color: #d97706;
                        }
                        50% { 
                            box-shadow: 0 0 30px rgba(217, 119, 6, 0.4), 0 0 60px rgba(217, 119, 6, 0.2);
                            border-color: #d97706dd;
                        }
                    }
                `,
                borderColor: '#d97706',
            }
        }

        if (hasReady) {
            return {
                border: '2px solid #7c3aed',
                shadow: '0 0 20px rgba(124, 58, 237, 0.3), 0 0 40px rgba(124, 58, 237, 0.15)',
                hasAnimation: true,
                animationName: 'borderPulsePurple',
                badgeBackground: 'rgba(124, 58, 237, 0.15)',
                badgeColor: '#7c3aed',
                animationKeyframes: `
                    @keyframes borderPulsePurple {
                        0%, 100% { 
                            box-shadow: 0 0 20px rgba(124, 58, 237, 0.3), 0 0 40px rgba(124, 58, 237, 0.15);
                            border-color: #7c3aed;
                        }
                        50% { 
                            box-shadow: 0 0 30px rgba(124, 58, 237, 0.4), 0 0 60px rgba(124, 58, 237, 0.2);
                            border-color: #7c3aeddd;
                        }
                    }
                `,
                borderColor: '#7c3aed',
            }
        }

        if (onlyFinished) {
            return {
                border: '2px solid #2563eb',
                shadow: '0 0 20px rgba(37, 99, 235, 0.3), 0 0 40px rgba(37, 99, 235, 0.15)',
                hasAnimation: true,
                animationName: 'borderPulseBlue',
                badgeBackground: 'rgba(37, 99, 235, 0.15)',
                badgeColor: '#2563eb',
                animationKeyframes: `
                    @keyframes borderPulseBlue {
                        0%, 100% { 
                            box-shadow: 0 0 20px rgba(37, 99, 235, 0.3), 0 0 40px rgba(37, 99, 235, 0.15);
                            border-color: #2563eb;
                        }
                        50% { 
                            box-shadow: 0 0 30px rgba(37, 99, 235, 0.4), 0 0 60px rgba(37, 99, 235, 0.2);
                            border-color: #2563ebdd;
                        }
                    }
                `,
                borderColor: '#2563eb',
            }
        }

        return {
            border: `1px solid ${colors.border}`,
            shadow: 'none',
            hasAnimation: false,
            animationName: '',
            badgeBackground: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.35)`,
            badgeColor: colors.textSecondary,
            animationKeyframes: '',
            borderColor: colors.border,
        }
    }, [groupedOrders, colors.border, colors.textSecondary, surfaceRgb.r, surfaceRgb.g, surfaceRgb.b])

    // ===== PÁGINA "PEDIDOS DA LOJA" (variant='page'): a lista completa, por situação, em linhas compactas =====
    const renderPage = () => {
        const TABS = [
            { id: 'pending' as const, label: 'Novos', color: '#16a34a', list: newOrders },
            { id: 'preparing' as const, label: 'Preparando', color: '#d97706', list: preparing },
            { id: 'ready' as const, label: 'Prontos', color: '#7c3aed', list: ready },
            { id: 'paid' as const, label: 'Finalizados', color: '#2563eb', list: finished },
        ]
        const first = TABS.find((t) => t.list.length > 0)
        const active = TABS.find((t) => t.id === (pageTab ?? first?.id ?? 'pending'))!
        // Prontos que esperam um motorista iUser (ainda ninguém aceitou): numa fileira horizontal, para não encher a lista
        const waiting = active.id === 'ready' && iuserDeliveryEnabled ? ready.filter((o: any) => dispatchedOrderIds.has(o.id) && !acceptedDispatchIds.has(o.id)) : []
        const rest = active.list.filter((o: any) => !waiting.includes(o))
        const quickFor = (o: any): { label: string; next: string } | null =>
            o.is_digital && o.status !== 'paid' && o.status !== 'rejected' ? { label: 'Liberar acesso', next: 'release' }
            : o.status === 'pending' ? { label: 'Aceitar', next: 'preparing' }
                : o.status === 'preparing' ? { label: 'Pronto', next: 'ready' }
                    // entrega: quem conclui é o motorista; a loja só finaliza o que o cliente retira
                    : o.status === 'ready' && !o.delivery_address ? { label: 'Finalizar', next: 'paid' }
                        : null
        const renderOrder = (order: any, isPaid: boolean) => {
            const q = quickFor(order)
            return (
                <OrderButton
                    iuserDelivery={iuserDelivery}
                    key={order.checkout_id}
                    order={order}
                    assignmentMap={assignmentMap}
                    setSelectedOrder={setSelectedOrder}
                    setSingleAssignOpen={setSingleAssignOpen}
                    getStatusColor={getStatusColor}
                    getStatusGradient={getStatusGradient}
                    formatAssignmentStatus={formatAssignmentStatus}
                    isInPerson={!order.buyer_profile_slug}
                    borderColor={colors.border}
                    isPaid={isPaid}
                    compact
                    quick={q ? {
                        label: q.label,
                        busy: quickBusy === order.checkout_id,
                        onClick: async () => { setQuickBusy(order.checkout_id); await handleOrderAction(q.next, order); setQuickBusy(null) },
                    } : null}
                />
            )
        }
        return (
            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2">
                    {([['products', 'Produtos', newOrders.length], ['services', 'Serviços', svc.pending.length]] as const).map(([k, label, n]) => (
                        <button key={k} onClick={() => setOrdersTab(k)} className="h-10 rounded-full text-[13px] font-black flex items-center justify-center gap-2 transition active:scale-95" style={ordersTab === k ? { background: '#f97316', color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}>
                            {label}
                            {n > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center text-white" style={{ background: '#22c55e' }}>{n}</span>}
                        </button>
                    ))}
                </div>

                {ordersTab === 'services' ? (
                    <StoreServiceOrders pending={svc.pending} onChanged={svc.refetch} />
                ) : initialLoading && groupedOrders.length === 0 ? (
                    <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <span key={i} className="block h-14 rounded-2xl animate-pulse" style={{ background: `${colors.border}40` }} />)}</div>
                ) : groupedOrders.length === 0 ? (
                    <div className="rounded-2xl p-6 text-center" style={{ border: `1px dashed ${colors.border}` }}>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>Nenhum pedido ainda.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                            {TABS.map((t) => {
                                const on = t.id === active.id
                                return (
                                    <button key={t.id} onClick={() => { setPageTab(t.id); setShown(20) }} className="h-10 px-3.5 rounded-full text-[12px] font-black flex items-center gap-2 flex-shrink-0 transition active:scale-95" style={on ? { background: t.color, color: '#fff' } : { background: `${t.color}${t.list.length ? '1a' : '0d'}`, color: t.list.length ? t.color : colors.textSecondary, border: `1px solid ${t.color}${t.list.length ? '40' : '20'}` }}>
                                        {t.label}
                                        <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center tabular-nums" style={on ? { background: 'rgba(255,255,255,0.28)' } : { background: `${t.color}22` }}>{t.list.length}</span>
                                    </button>
                                )
                            })}
                        </div>

                        {waiting.length > 0 && (
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: active.color }}>Esperando motorista ({waiting.length})</p>
                                <div className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1 snap-x" style={{ scrollbarWidth: 'none' }}>
                                    {waiting.map((o: any) => {
                                        const info = dispatchInfo.get(o.id)
                                        return (
                                            <button key={o.checkout_id} onClick={() => setSelectedOrder(o)} className="snap-start flex-shrink-0 w-[196px] rounded-2xl p-3 text-left flex flex-col gap-1 transition active:scale-95" style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${active.color}` }}>
                                                <span className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{o.buyer_profile_slug ? `@${o.buyer_profile_slug}` : o.buyer_name || 'Presencial'}</span>
                                                <span className="text-[13px] font-black" style={{ color: colors.textPrimary }}>R$ {o.totalPrice.toFixed(2)}</span>
                                                <span className="text-[10px] font-bold leading-tight" style={{ color: active.color }}>{info?.v2State ? storeV2Text(info) : `Buscando motorista${info ? ` · R$ ${info.freight.toFixed(2)} · até ${info.radius} km` : ''}`}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {rest.length === 0 && waiting.length === 0 ? (
                            <div className="rounded-2xl p-5 text-center" style={{ border: `1px dashed ${colors.border}` }}>
                                <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Nenhum pedido {active.label.toLowerCase().replace('novos', 'novo').replace('finalizados', 'finalizado')} agora.</p>
                            </div>
                        ) : rest.length > 0 && (
                            <div className="flex flex-col gap-2">
                                {rest.slice(0, shown).map((o: any) => renderOrder(o, active.id === 'paid'))}
                                {rest.length > shown && (
                                    <button onClick={() => setShown((n) => n + 20)} className="h-11 rounded-full text-[13px] font-black transition active:scale-95" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                                        Mostrar mais ({rest.length - shown})
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        )
    }

    return (
        <>
            {variant === 'page' ? renderPage() : (
            <div
                className={v3 ? 'rounded-3xl relative overflow-hidden flex flex-col p-4 gap-4' : `rounded-2xl relative overflow-hidden flex flex-col ${isOrdersExpanded ? 'p-6 pt-7 gap-5' : 'p-4'}`}
                style={v3 ? {
                    // 3.0: cartão limpo (sem brilho nem borda animada); só ganha o realce laranja quando há pedido novo esperando
                    background: colors.surface,
                    border: newOrders.length + svc.pending.length > 0 ? '1.5px solid #f97316' : `1px solid ${colors.border}`,
                    boxShadow: newOrders.length + svc.pending.length > 0 ? '0 6px 20px #f9731626' : 'none',
                } : {
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: cardState.border,
                    boxShadow: cardState.shadow,
                    transition: 'all 0.5s ease',
                    animation: cardState.hasAnimation ? `${cardState.animationName} 2s ease-in-out infinite` : 'none',
                }}
            >
                <style>{`
                    @keyframes pulse-order {
                        0%, 100% { 
                            transform: scale(1);
                        }
                        50% { 
                            transform: scale(1.01);
                        }
                    }
                    @keyframes shimmer-order {
                        0% { transform: translateX(-100%) rotate(0deg); }
                        100% { transform: translateX(100%) rotate(0deg); }
                    }
                    @keyframes spin-smooth {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .animate-spin-smooth {
                        animation: spin-smooth 0.8s linear infinite;
                    }
                    ${cardState.animationKeyframes}
                `}</style>

                {/* ===== SHIMMER BORDER ===== */}
                {cardState.hasAnimation && !v3 && (
                    <div className="absolute inset-[-2px] rounded-2xl overflow-hidden pointer-events-none shimmer-border">
                        <div className="absolute inset-[-2px] rounded-2xl" style={{
                            background: `linear-gradient(
                                90deg,
                                transparent 0%,
                                ${cardState.borderColor}22 20%,
                                ${cardState.borderColor}55 40%,
                                ${cardState.borderColor}88 50%,
                                ${cardState.borderColor}55 60%,
                                ${cardState.borderColor}22 80%,
                                transparent 100%
                            )`,
                            animation: 'shimmer-order 3s ease-in-out infinite',
                            transform: 'translateX(-100%)',
                        }} />
                    </div>
                )}

                {/* Cabeçalho com toggle */}
                <div
                    className="w-full flex items-center justify-between text-left relative z-10"
                    style={{
                        padding: isOrdersExpanded ? '0.5rem 0.75rem' : 0,
                        borderRadius: '9999px',
                    }}
                >
                    <button
                        onClick={() => setIsOrdersExpanded(!isOrdersExpanded)}
                        className="flex-1 flex items-center justify-between text-left"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {v3 ? (
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="min-w-0">
                                    <h3 className="text-base font-black leading-tight" style={{ color: colors.textPrimary }}>Pedidos na loja</h3>
                                    <p className="text-[11px] mt-0.5" style={{ color: newOrders.length + svc.pending.length > 0 ? '#16a34a' : colors.textSecondary }}>
                                        {newOrders.length + svc.pending.length > 0
                                            ? [newOrders.length > 0 ? `${newOrders.length} ${newOrders.length === 1 ? 'pedido novo' : 'pedidos novos'}` : '', svc.pending.length > 0 ? `${svc.pending.length} ${svc.pending.length === 1 ? 'serviço para aceitar' : 'serviços para aceitar'}` : ''].filter(Boolean).join(' · ') + ' esperando'
                                            : preparing.length + ready.length > 0
                                                ? `${preparing.length + ready.length} em andamento`
                                                : 'Nada esperando agora'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                        <div className="flex items-center gap-3">
                            <div>
                                <h3 className={`${isOrdersExpanded ? 'text-lg' : 'text-sm'} font-black`} style={{ color: colors.textPrimary }}>
                                    Pedidos na loja
                                </h3>
                                <div className="flex items-center gap-2 text-xs mt-0.5">
                                    <span
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[10px]"
                                        style={{
                                            background: 'rgba(22, 163, 74, 0.15)',
                                            backdropFilter: 'blur(8px)',
                                            WebkitBackdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(22, 163, 74, 0.2)',
                                            color: '#16a34a',
                                        }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
                                        {newOrders.length}
                                    </span>

                                    <span style={{ color: colors.textSecondary }}>•</span>

                                    <span
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[10px]"
                                        style={{
                                            background: 'rgba(217, 119, 6, 0.15)',
                                            backdropFilter: 'blur(8px)',
                                            WebkitBackdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(217, 119, 6, 0.2)',
                                            color: '#d97706',
                                        }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-600" />
                                        {preparing.length}
                                    </span>

                                    <span style={{ color: colors.textSecondary }}>•</span>

                                    <span
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[10px]"
                                        style={{
                                            background: 'rgba(124, 58, 237, 0.15)',
                                            backdropFilter: 'blur(8px)',
                                            WebkitBackdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(124, 58, 237, 0.2)',
                                            color: '#7c3aed',
                                        }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-700" />
                                        {ready.length}
                                    </span>

                                    <span style={{ color: colors.textSecondary }}>•</span>

                                    <span
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[10px]"
                                        style={{
                                            background: 'rgba(37, 99, 235, 0.15)',
                                            backdropFilter: 'blur(8px)',
                                            WebkitBackdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(37, 99, 235, 0.2)',
                                            color: '#2563eb',
                                        }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                                        {finished.length}
                                    </span>
                                </div>
                            </div>
                        </div>
                        )}
                        <div className="flex items-center gap-2">
                            {isOrdersExpanded ? (
                                <ChevronUp size={22} style={{ color: colors.textSecondary }} />
                            ) : (
                                <ChevronDown size={22} style={{ color: colors.textSecondary }} />
                            )}
                        </div>
                    </button>
                </div>

                {/* Pedidos de produtos × pedidos de serviços */}
                <div className="grid grid-cols-2 gap-2 relative z-10">
                    {([['products', 'Produtos', newOrders.length], ['services', 'Serviços', svc.pending.length]] as const).map(([k, label, n]) => (
                        <button
                            key={k}
                            onClick={() => { setOrdersTab(k); setIsOrdersExpanded(true) }}
                            className="h-10 rounded-full text-[13px] font-black flex items-center justify-center gap-2 transition active:scale-95"
                            style={ordersTab === k ? { background: '#f97316', color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}
                        >
                            {label}
                            {n > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] flex items-center justify-center text-white" style={{ background: '#22c55e' }}>{n}</span>}
                        </button>
                    ))}
                </div>

                {/* 3.0: serviços — os números em chips pequenos (o destaque são os pedidos) */}
                {v3 && ordersTab === 'services' && (
                    <StatChips onClick={() => setIsOrdersExpanded(true)} items={[
                        { label: 'Novos', n: svc.pending.length, color: '#16a34a' },
                        { label: 'Na agenda', n: svc.confirmed.length, color: '#7c3aed' },
                        { label: 'Feitos', n: svc.completed.length, color: '#2563eb' },
                    ]} />
                )}

                {isOrdersExpanded && ordersTab === 'services' && <StoreServiceOrders pending={svc.pending} onChanged={svc.refetch} />}

                {/* ===== FUNIL DE PEDIDOS: novos → em preparo → prontos → a caminho. Cada linha tem só o que importa e a ação da etapa ===== */}
                {isOrdersExpanded && ordersTab === 'products' && (
                    <div className="flex flex-col gap-4 relative z-10">
                        {/* o entregador chegou: o código de retirada, depois de conferir o que está entregando */}
                        {pickupCodes.map((c) => (
                            <div key={c.driver_id} className="rounded-2xl p-3" style={{ background: '#22c55e14', border: '1.5px solid #22c55e' }}>
                                <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>{c.driver_name} chegou para retirar {c.rides} {c.rides === 1 ? 'pedido' : 'pedidos'}</p>
                                <div className="mt-1.5 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1" style={{ color: '#16a34a' }}><KeyRound size={11} /> Código de retirada</p>
                                        <p className="text-3xl font-black tracking-[0.3em] leading-tight" style={{ color: colors.textPrimary }}>{c.code}</p>
                                    </div>
                                    <p className="text-[11px] font-bold text-right max-w-[50%]" style={{ color: c.ready < c.rides ? '#b45309' : colors.textSecondary }}>
                                        {c.locked ? 'Travado por tentativas erradas.' : c.ready < c.rides ? `${c.rides - c.ready} ainda em preparo: marque pronto antes de passar o código.` : 'Confira os pedidos com ele e passe o código.'}
                                    </p>
                                </div>
                            </div>
                        ))}

                        {(() => {
                            const Head = ({ color, title, n }: { color: string; title: string; n: number }) => (
                                <div className="flex items-center gap-2 px-0.5">
                                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                                    <h4 className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textPrimary }}>{title}</h4>
                                    <span className="text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-white" style={{ background: color }}>{n}</span>
                                </div>
                            )
                            const SHOW = 6
                            const act = async (o: any, next: string) => { setQuickBusy(o.checkout_id); await handleOrderAction(next, o); setQuickBusy(null) }
                            const Btn = ({ o, next, label, color }: { o: any; next: string; label: string; color: string }) => (
                                <button type="button" disabled={quickBusy === o.checkout_id} onClick={() => act(o, next)} className="h-9 px-4 rounded-full text-[12px] font-black text-white transition active:scale-95 disabled:opacity-60" style={{ background: color }}>
                                    {quickBusy === o.checkout_id ? '…' : label}
                                </button>
                            )
                            const more = (n: number) => n > SHOW && storeSlug ? (
                                <button type="button" onClick={() => router.push(`/painel-loja/${encodeURIComponent(storeSlug)}/pedidos`)} className="text-[11px] font-black self-start px-1 underline" style={{ color: colors.textSecondary }}>+ {n - SHOW} na página de pedidos</button>
                            ) : null
                            const sections = [
                                { key: 'new', title: 'Novos', color: '#22c55e', list: newOrders },
                                { key: 'prep', title: 'Em preparo', color: '#eab308', list: preparing },
                                { key: 'ready', title: 'Prontos', color: '#a855f7', list: readyWaiting },
                                { key: 'way', title: 'A caminho do cliente', color: '#3b82f6', list: onTheWay },
                            ]
                            const total = sections.reduce((n, x) => n + x.list.length, 0)
                            return (
                                <>
                                    {total === 0 && (
                                        <p className="text-[13px] font-bold px-0.5" style={{ color: colors.textSecondary }}>Nenhum pedido em andamento. Quando chegar um, ele aparece aqui para você aceitar.</p>
                                    )}
                                    {sections.filter((x) => x.list.length > 0).map((x) => (
                                        <div key={x.key} className="flex flex-col gap-1.5">
                                            <Head color={x.color} title={x.title} n={x.list.length} />
                                            {x.list.slice(0, SHOW).map((o: any) => (
                                                <FlowRow key={o.checkout_id} order={o} color={x.color} line={lineFor(o)} colors={colors} onOpen={() => setSelectedOrder(o)}>
                                                    {x.key === 'new' && (
                                                        <>
                                                            <button type="button" aria-label="Recusar pedido" title="Recusar" disabled={quickBusy === o.checkout_id}
                                                                onClick={() => { if (window.confirm('Recusar este pedido? O cliente será avisado.')) act(o, 'rejected') }}
                                                                className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 disabled:opacity-60" style={{ background: '#ef444418', color: '#dc2626' }}>
                                                                <X size={16} />
                                                            </button>
                                                            <Btn o={o} next="preparing" label="Aceitar" color="#16a34a" />
                                                        </>
                                                    )}
                                                    {x.key === 'prep' && <Btn o={o} next="ready" label="Pronto" color="#d97706" />}
                                                    {/* entrega: quem conclui é o entregador; a loja só finaliza o que o cliente retira */}
                                                    {x.key === 'ready' && !isDelivery(o) && <Btn o={o} next="paid" label="Retirado" color="#7c3aed" />}
                                                </FlowRow>
                                            ))}
                                            {more(x.list.length)}
                                        </div>
                                    ))}
                                    {storeSlug && (
                                        <button type="button" onClick={() => router.push(`/painel-loja/${encodeURIComponent(storeSlug)}/pedidos`)} className="h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-2 transition active:scale-95" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                                            Ver todos os pedidos e o histórico
                                            {finished.length > 0 && <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: '#3b82f622', color: '#3b82f6' }}>{finished.length} finalizados</span>}
                                        </button>
                                    )}
                                </>
                            )
                        })()}
                    </div>
                )}
            </div>
            )}

            {/* Modais */}
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
                                    <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-sm text-white font-bold">{ownerProfile.name.charAt(0)}</div>
                                    <div>
                                        <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>Eu (dono)</p>
                                        {ownerProfile.phone && <p className="text-xs" style={{ color: colors.textSecondary }}>{ownerProfile.phone}</p>}
                                    </div>
                                </div>
                            )}
                            {employees.map(emp => (
                                <div key={emp.id} onClick={() => setSelectedEmployeeId(emp.id)} className={`p-3 rounded-xl cursor-pointer ${selectedEmployeeId === emp.id ? 'ring-2' : ''}`} style={{ background: selectedEmployeeId === emp.id ? '#f9731620' : 'transparent', border: `1px solid ${colors.border}` }}>
                                    <p className="font-bold" style={{ color: colors.textPrimary }}>{emp.name}</p>
                                    {emp.phone && <p className="text-xs" style={{ color: colors.textSecondary }}>{emp.phone}</p>}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => handleAssignDelivery()}
                            disabled={!selectedEmployeeId || assigning}
                            style={{
                                ...pillButtonStyle,
                                background: selectedEmployeeId ? GRADIENT : colors.border,
                                color: selectedEmployeeId ? '#ffffff' : colors.textSecondary,
                            }}
                            className="w-full justify-center hover:opacity-80 transition-opacity"
                        >
                            {assigning ? 'Atribuindo...' : 'Confirmar'}
                        </button>
                    </div>
                </div>
            )}

            {callDriverOrder && (
                <CallIuserDriverDialog
                    storeId={storeId}
                    order={callDriverOrder}
                    onClose={() => setCallDriverOrder(null)}
                    onDispatched={(id) => setDispatchedOrderIds((prev) => new Set(prev).add(id))}
                />
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
                                    <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-sm text-white font-bold">{ownerProfile.name.charAt(0)}</div>
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
                    deliveryLine={selectedDeliveryLine}
                    storeLat={store?.store_lat}
                    storeLng={store?.store_lng}
                />
            )}
        </>
    )
}

/** Uma linha do FUNIL de pedidos do painel da loja: quem pediu, o que é, quanto, e UMA frase sobre a entrega — com a ação da etapa à direita */
function FlowRow({ order, color, line, onOpen, children, colors }: { order: any; color: string; line: { text: string; tone: 'ok' | 'wait' | 'warn' | 'plain' }; onOpen: () => void; children?: React.ReactNode; colors: any }) {
    const who = order.buyer_profile_slug ? `@${order.buyer_profile_slug}` : (order.buyer_name || 'Cliente')
    const first = order.items?.[0]
    const more = (order.items?.length || 0) - 1
    const summary = first ? `${first.quantity}× ${first.product_name}${more > 0 ? ` +${more}` : ''}` : ''
    const time = order.created_at ? new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
    const tone = { ok: '#16a34a', wait: '#d97706', warn: '#dc2626', plain: colors.textSecondary }[line.tone]
    return (
        <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }} className="rounded-2xl pl-3 pr-2 py-2 flex items-center gap-2 cursor-pointer active:scale-[0.995] transition" style={{ background: `${colors.border}26`, borderLeft: `3px solid ${color}` }}>
            <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5">
                    <span className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{who}</span>
                    <span className="text-[10.5px] flex-shrink-0 tabular-nums" style={{ color: colors.textSecondary }}>{time}</span>
                    <span className="ml-auto text-[12px] font-black flex-shrink-0 tabular-nums" style={{ color: colors.textPrimary }}>R$ {Number(order.totalPrice || 0).toFixed(2).replace('.', ',')}</span>
                </p>
                <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{summary}</p>
                <p className="text-[11px] font-bold truncate" style={{ color: tone }}>{line.text}</p>
            </div>
            {children && <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>{children}</div>}
        </div>
    )
}

// ===== COMPONENTE ORDER BUTTON SEPARADO =====
function OrderButton({
    order,
    assignmentMap,
    setSelectedOrder,
    setSingleAssignOpen,
    getStatusColor,
    getStatusGradient,
    formatAssignmentStatus,
    isInPerson,
    borderColor,
    isPaid = false,
    iuserDelivery,
    compact = false,
    quick = null,
}: any) {
    const v3 = useInsideShell()
    const { colors: themeColors } = useTheme()
    const channelLabel = isInPerson ? 'Presencial' : 'Online'
    const statusColor = getStatusColor(order.status)
    const isAssigned = assignmentMap.has(order.checkout_id)
    const assignment = isAssigned ? assignmentMap.get(order.checkout_id) : null
    // O status já fica claro pela seção onde o pedido está agrupado (Novos,
    // Em Preparo, Prontos, Finalizados) - repetir "Pendente"/"Preparando" no
    // próprio card é redundante, então aqui mostramos o horário do pedido.
    const orderTime = order.created_at
        ? new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : ''

    const handleAssignClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        setSingleAssignOpen({ order })
    }

    // Conversa com quem comprou: abre (ou cria) o chat da loja com o cliente e vai direto pra dentro dele
    const router = useRouter()
    const [openingChat, setOpeningChat] = useState(false)
    // conversar só depois de aceitar (pedido novo = só "Aceitar"); atribuir entregador só vale para entrega feita PELA loja (com o entregador iUser o motorista já vem do pedido, e retirada não tem entrega)
    const canChat = !isInPerson && !!order.buyer_id && order.status !== 'pending'
    const isDeliveryOrder = !!order.delivery_address && order.delivery_address !== 'Retirada no local'
    const canAssign = !isInPerson && !isPaid && order.status !== 'rejected' && isDeliveryOrder && !iuserDelivery?.enabled
    const handleChatClick = async (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        if (openingChat) return
        setOpeningChat(true)
        const { data, error } = await supabase.rpc('start_store_conversation_with_buyer', { p_store: order.store_id, p_buyer: order.buyer_id })
        if (error || !data?.id) {
            toast.error(error?.message || 'Não foi possível abrir a conversa')
            setOpeningChat(false)
            return
        }
        router.push(`/conversas?sala=${encodeURIComponent(data.store_slug)}&c=${data.id}`)
    }

    // ===== 3.0: cartão claro (nome, canal, valor e hora), com a cor do status só na barra da esquerda =====
    if (v3) {
        return (
            <div
                className={`w-full rounded-2xl relative overflow-hidden transition active:scale-[0.99] ${isPaid ? 'opacity-70' : 'cursor-pointer'}`}
                style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}`, borderLeft: `4px solid ${statusColor}` }}
                onClick={() => setSelectedOrder(order)}
            >
                <div className={`flex items-center gap-3 ${compact ? 'px-3 py-2' : 'px-3.5 py-3'}`}>
                    <div className="flex flex-col min-w-0 flex-1 gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                            {isInPerson ? (
                                <>
                                    <Store size={14} className="flex-shrink-0" style={{ color: themeColors.textSecondary }} />
                                    <span className="text-sm font-black truncate" style={{ color: themeColors.textPrimary }}>{order.buyer_name || 'Presencial'}</span>
                                </>
                            ) : (
                                <span className="text-sm font-black truncate" style={{ color: themeColors.textPrimary }}>@{order.buyer_profile_slug}</span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide flex-shrink-0" style={{ background: `${statusColor}1f`, color: statusColor }}>
                                {channelLabel}
                            </span>
                        </div>
                        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs">
                            <span className="font-black text-sm" style={{ color: themeColors.textPrimary }}>R$ {order.totalPrice.toFixed(2)}</span>
                            {order.deliveryFee > 0 && <span style={{ color: themeColors.textSecondary }}>frete R$ {order.deliveryFee.toFixed(2)}</span>}
                            {isAssigned && <span className="text-[10px] font-bold" style={{ color: themeColors.textSecondary }}>Entregador: {assignment?.employeeName}</span>}
                        </div>
                        {!isInPerson && !isPaid && iuserDelivery?.enabled && order.delivery_address && iuserDelivery.dispatchedIds.has(order.id) && (
                            <span className="self-start text-[10px] font-black px-2.5 py-1 rounded-full" style={{ background: `${statusColor}1f`, color: statusColor }}>
                                {driverText(iuserDelivery.info?.get(order.id), !!iuserDelivery.acceptedIds?.has(order.id))}
                            </span>
                        )}
                        {!isInPerson && !isPaid && order.status !== 'rejected' && !isDeliveryOrder && (
                            <span className="self-start text-[10px] font-black px-2.5 py-1 rounded-full" style={{ background: `${themeColors.border}40`, color: themeColors.textSecondary }}>
                                Cliente retira na loja
                            </span>
                        )}
                        {!isInPerson && !isPaid && order.status !== 'rejected' && iuserDelivery?.enabled && order.delivery_address && order.delivery_address !== 'Retirada no local' && !iuserDelivery.dispatchedIds.has(order.id) && (
                            <span className="self-start text-[10px] font-black px-2.5 py-1 rounded-full" style={{ background: '#f59e0b22', color: '#b45309' }}>
                                Sem motorista{['preparing', 'ready'].includes(order.status) ? ' · toque no caminhão para chamar' : ' ainda'}
                            </span>
                        )}
                        {iuserDelivery?.info?.get(order.id)?.v2State && ['awaiting_payment', 'customer_payment_reported', 'awaiting_driver_payment', 'driver_payment_reported', 'payment_in_verification'].includes(iuserDelivery.info.get(order.id)!.v2State!) && (
                            <StoreDeliveryPayment dispatchId={iuserDelivery.info.get(order.id)!.id} />
                        )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {orderTime && <span className="text-[11px] font-bold tabular-nums" style={{ color: themeColors.textSecondary }}>{orderTime}</span>}
                        {quick && (
                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (!quick.busy) quick.onClick() }} disabled={quick.busy} className="h-8 px-3.5 rounded-full text-[11px] font-black text-white transition active:scale-95 disabled:opacity-60 ml-1" style={{ background: statusColor }} type="button">
                                {quick.busy ? '…' : quick.label}
                            </button>
                        )}
                        {!isInPerson && !isPaid && iuserDelivery?.enabled && order.delivery_address && (iuserDelivery.dispatchedIds.has(order.id) || ['preparing', 'ready'].includes(order.status)) && (
                            iuserDelivery.dispatchedIds.has(order.id) ? (
                                null
                            ) : (
                                <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); iuserDelivery.onCall(order) }} className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90" style={{ background: `${themeColors.border}50` }} title="Chamar motorista iUser" type="button">
                                    <Truck size={14} style={{ color: themeColors.textPrimary }} />
                                </button>
                            )
                        )}
                        {canChat && (
                            <button onClick={handleChatClick} disabled={openingChat} className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90 disabled:opacity-50" style={{ background: `${themeColors.border}50` }} title="Conversar com o cliente" type="button">
                                <MessageCircle size={14} style={{ color: '#f97316' }} />
                            </button>
                        )}
                        {canAssign && (
                            <button onClick={handleAssignClick} className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90" style={{ background: `${themeColors.border}50` }} title="Atribuir entregador" type="button">
                                <Send size={14} style={{ color: themeColors.textPrimary }} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            data-keep-color
            className={`w-full rounded-2xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] hover:shadow-xl relative overflow-hidden will-change-transform ${isPaid ? 'opacity-80' : 'cursor-pointer'}`}
            style={{
                background: getStatusGradient(order.status),
                color: statusColor,
                boxShadow: `0 4px 16px ${statusColor}40`,
                border: `1px solid ${statusColor}55`,
                borderLeft: `4px solid ${statusColor}`,
            }}
            onClick={() => {
                // AGORA PERMITE CLICAR EM TODOS OS PEDIDOS, inclusive finalizados
                setSelectedOrder(order)
            }}
        >
            {!isPaid && (
                <div className="absolute inset-0 pointer-events-none opacity-15">
                    <div className="absolute inset-[-2px] rounded-2xl" style={{
                        background: `linear-gradient(90deg, transparent, ${statusColor}33, transparent)`,
                        animation: 'shimmer-order 4s ease-in-out infinite',
                        transform: 'translateX(-100%)',
                    }} />
                </div>
            )}

            <div className="flex items-center justify-between gap-3 px-4 py-3.5 relative z-10">
                <div className="flex flex-col items-start min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                        {isInPerson ? (
                            <>
                                <Store size={14} className="flex-shrink-0" style={{ color: `${statusColor}cc` }} />
                                <span className="text-sm font-bold truncate" style={{ color: statusColor }}>
                                    {order.buyer_name || 'Presencial'}
                                </span>
                            </>
                        ) : (
                            <span className="text-sm font-bold truncate" style={{ color: statusColor }}>
                                @{order.buyer_profile_slug}
                            </span>
                        )}
                        <span
                            className="px-2 py-0.5 rounded-md text-[9px] font-bold flex-shrink-0 uppercase tracking-wide"
                            style={{ background: `${statusColor}1a`, color: `${statusColor}b3` }}
                        >
                            {channelLabel}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs mt-1.5 flex-wrap">
                        <span className="font-black text-sm" style={{ color: statusColor }}>
                            R$ {order.totalPrice.toFixed(2)}
                        </span>
                        {order.deliveryFee > 0 && (
                            <span style={{ color: `${statusColor}80` }}>
                                frete R$ {order.deliveryFee.toFixed(2)}
                            </span>
                        )}
                        {isAssigned && (
                            <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: `${statusColor}99` }}>
                                🚚 {assignment?.employeeName}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {orderTime && (
                        <span className="text-[11px] font-medium flex-shrink-0 tabular-nums" style={{ color: `${statusColor}80` }}>
                            {orderTime}
                        </span>
                    )}
                    {!isInPerson && !isPaid && iuserDelivery?.enabled && order.delivery_address && (iuserDelivery.dispatchedIds.has(order.id) || ['preparing', 'ready'].includes(order.status)) && (
                        iuserDelivery.dispatchedIds.has(order.id) ? (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: `${statusColor}1a`, color: `${statusColor}b3` }}>
                                {driverText(iuserDelivery.info?.get(order.id), !!iuserDelivery.acceptedIds?.has(order.id))}
                            </span>
                        ) : (
                            <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); iuserDelivery.onCall(order) }}
                                className="p-2 rounded-full transition-all duration-200 active:scale-90 flex-shrink-0"
                                title="Chamar motorista iUser"
                                type="button"
                            >
                                <Truck size={14} style={{ color: statusColor }} />
                            </button>
                        )
                    )}
                    {canChat && (
                        <button
                            onClick={handleChatClick}
                            disabled={openingChat}
                            className="p-2 rounded-full transition-all duration-200 active:scale-90 flex-shrink-0 disabled:opacity-50"
                            title="Conversar com o cliente"
                            type="button"
                        >
                            <MessageCircle size={14} style={{ color: statusColor }} />
                        </button>
                    )}
                    {canAssign && (
                        <button
                            onClick={handleAssignClick}
                            className="p-2 rounded-full transition-all duration-200 active:scale-90 flex-shrink-0"
                            title="Atribuir entregador"
                            type="button"
                        >
                            <Send size={14} style={{ color: `${statusColor}99` }} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}