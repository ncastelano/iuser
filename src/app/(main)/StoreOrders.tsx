// app/(main)/StoreOrders.tsx
'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import {
    ShoppingCart,
    Send,
    X,
    Store,
    ChevronDown,
    ChevronUp,
    Clock,
    RefreshCw,
} from 'lucide-react'
import { OrderModal } from '../../components/OrderModal'

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
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
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

export default function StoreOrders({
    storeId,
    storeName = 'Loja',
    onOrderCountsChange,
    onRefresh,
}: StoreOrdersProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
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
    const [store, setStore] = useState<any>(null)
    const [isOrdersExpanded, setIsOrdersExpanded] = useState(true)

    const loadOrders = useCallback(async () => {
        if (!storeId) return
        setLoading(true)

        try {
            // Buscar dados da loja
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, owner_id, store_lat, store_lng')
                .eq('id', storeId)
                .single()

            if (storeData) {
                setStore(storeData)

                // Buscar dono da loja
                if (storeData.owner_id) {
                    const { data: ownerData } = await supabase
                        .from('profiles')
                        .select('name, phone')
                        .eq('id', storeData.owner_id)
                        .single()
                    if (ownerData) setOwnerProfile({ name: ownerData.name, phone: ownerData.phone })
                }

                // Buscar funcionários
                const { data: empData } = await supabase
                    .from('employees')
                    .select('*')
                    .eq('store_id', storeId)
                    .eq('is_active', true)
                setEmployees(empData || [])
            }

            // Buscar pedidos
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

            // Atualizar contadores
            if (onOrderCountsChange) {
                const counts = {
                    pending: grouped.filter(o => o.status === 'pending').length,
                    preparing: grouped.filter(o => o.status === 'preparing').length,
                    ready: grouped.filter(o => o.status === 'ready').length,
                }
                onOrderCountsChange(counts)
            }

        } catch (err) {
            console.error('[StoreOrders] Erro:', err)
            toast.error('Erro ao carregar dados')
        }

        setLoading(false)
    }, [storeId, onOrderCountsChange])

    const fetchEmployeeRoutes = useCallback(async () => {
        if (!storeId) return

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
    }, [storeId, employees])

    // Realtime
    useEffect(() => {
        if (!storeId) return

        const ordersChannel = supabase
            .channel(`store-orders-${storeId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
                () => {
                    loadOrders()
                }
            )
            .subscribe()

        const assignmentsChannel = supabase
            .channel(`store-assignments-${storeId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'delivery_assignments', filter: `store_id=eq.${storeId}` },
                () => fetchEmployeeRoutes()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(ordersChannel)
            supabase.removeChannel(assignmentsChannel)
        }
    }, [storeId, loadOrders, fetchEmployeeRoutes])

    useEffect(() => {
        loadOrders()
    }, [loadOrders])

    useEffect(() => {
        if (storeId) {
            fetchEmployeeRoutes()
        }
    }, [storeId, fetchEmployeeRoutes])

    const handleRefresh = () => {
        setRefreshing(true)
        Promise.all([loadOrders(), fetchEmployeeRoutes()]).finally(() => setRefreshing(false))
    }

    const handleOrderAction = async (status: string) => {
        if (!selectedOrder) return

        try {
            const { error } = await supabase
                .from('orders')
                .update({ status })
                .eq('checkout_id', selectedOrder.checkout_id)

            if (error) {
                toast.error('Erro ao atualizar status: ' + error.message)
                return
            }

            setSelectedOrder(null)
            await loadOrders()
            await fetchEmployeeRoutes()
            toast.success('Status atualizado!')
        } catch (err: any) {
            toast.error('Erro: ' + err.message)
        }
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
                console.error('[StoreOrders] Erro ao limpar atribuições anteriores:', deleteError)
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
                console.error('[StoreOrders] Erro ao atribuir entregas:', insertError)
                toast.error(`Erro ao atribuir: ${insertError.message}`)
                setAssigning(false)
                return
            }

            toast.success('Entregas atribuídas com sucesso!')
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

            toast.success(`Pedido atribuído ao entregador!`)
            setSingleAssignOpen(null)
            await loadOrders()
            await fetchEmployeeRoutes()
        } catch (err: any) {
            toast.error(`Erro: ${err.message}`)
        } finally {
            setAssigning(false)
        }
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

    // Calcular cores da borda
    const orderBorderColor = useMemo(() => {
        const pending = groupedOrders.filter(o => o.status === 'pending').length
        const preparing = groupedOrders.filter(o => o.status === 'preparing').length
        const ready = groupedOrders.filter(o => o.status === 'ready').length

        if (pending > 0) {
            return {
                color: '#3b82f6',
                glow: '0 0 20px rgba(59, 130, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.15)',
                border: '2px solid #3b82f6'
            }
        } else if (preparing > 0) {
            return {
                color: '#f59e0b',
                glow: '0 0 20px rgba(245, 158, 11, 0.3), 0 0 40px rgba(245, 158, 11, 0.15)',
                border: '2px solid #f59e0b'
            }
        } else if (ready > 0) {
            return {
                color: '#8b5cf6',
                glow: '0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(139, 92, 246, 0.15)',
                border: '2px solid #8b5cf6'
            }
        } else {
            return {
                color: 'transparent',
                glow: 'none',
                border: 'none'
            }
        }
    }, [groupedOrders])

    const newOrders = groupedOrders.filter(o => o.status === 'pending')
    const preparing = groupedOrders.filter(o => o.status === 'preparing')
    const ready = groupedOrders.filter(o => o.status === 'ready')
    const finished = groupedOrders.filter(o => o.status === 'paid')

    const selectedAssignment = selectedOrder ? assignmentMap.get(selectedOrder.checkout_id) : null

    // Componente OrderItem
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

    if (loading) {
        return (
            <div
                className="rounded-2xl p-6 text-center"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                    border: `1px solid ${colors.border}`,
                }}
            >
                <p className="text-sm" style={{ color: colors.textSecondary }}>Carregando pedidos...</p>
            </div>
        )
    }

    return (
        <>
            <div
                className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: orderBorderColor.border || `1px solid ${colors.border}`,
                    boxShadow: orderBorderColor.glow || colors.shadow,
                    animation: orderBorderColor.color !== 'transparent' ? 'borderPulse 2s ease-in-out infinite' : 'none',
                    transition: 'all 0.5s ease',
                }}
            >
                {orderBorderColor.color !== 'transparent' && (
                    <>
                        <style>{`
                            @keyframes borderPulse {
                                0%, 100% { 
                                    box-shadow: ${orderBorderColor.glow};
                                    border-color: ${orderBorderColor.color};
                                }
                                50% { 
                                    box-shadow: 0 0 30px ${orderBorderColor.color}60, 0 0 60px ${orderBorderColor.color}30;
                                    border-color: ${orderBorderColor.color}dd;
                                }
                            }
                            @keyframes shimmer {
                                0% { transform: translateX(-100%) rotate(0deg); }
                                100% { transform: translateX(100%) rotate(0deg); }
                            }
                            .shimmer-border {
                                position: absolute;
                                top: -2px;
                                left: -2px;
                                right: -2px;
                                bottom: -2px;
                                border-radius: 1rem;
                                overflow: hidden;
                                pointer-events: none;
                            }
                            .shimmer-border::before {
                                content: '';
                                position: absolute;
                                top: 0;
                                left: 0;
                                right: 0;
                                bottom: 0;
                                background: linear-gradient(
                                    90deg,
                                    transparent 0%,
                                    ${orderBorderColor.color}33 25%,
                                    ${orderBorderColor.color}66 50%,
                                    ${orderBorderColor.color}33 75%,
                                    transparent 100%
                                );
                                animation: shimmer 3s ease-in-out infinite;
                                transform: translateX(-100%);
                            }
                        `}</style>
                        <div className="shimmer-border" />
                    </>
                )}

                {/* Cabeçalho com toggle */}
                <button
                    onClick={() => setIsOrdersExpanded(!isOrdersExpanded)}
                    className="w-full flex items-center justify-between text-left relative z-10"
                    style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '9999px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                        >
                            <ShoppingCart size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Pedidos na loja
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
                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                handleRefresh()
                            }}
                            className="p-1 rounded-full hover:bg-white/10 transition-colors"
                            title="Atualizar"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} style={{ color: colors.textSecondary }} />
                        </button>
                        {groupedOrders.length > 0 && (
                            <span
                                className="text-xs font-bold px-2 py-0.5 rounded-full"
                                style={{
                                    background: orderBorderColor.color !== 'transparent'
                                        ? `${orderBorderColor.color}30`
                                        : '#f9731620',
                                    color: orderBorderColor.color !== 'transparent'
                                        ? orderBorderColor.color
                                        : '#f97316'
                                }}
                            >
                                {groupedOrders.length}
                            </span>
                        )}
                        {isOrdersExpanded ? (
                            <ChevronUp size={22} style={{ color: colors.textSecondary }} />
                        ) : (
                            <ChevronDown size={22} style={{ color: colors.textSecondary }} />
                        )}
                    </div>
                </button>

                {isOrdersExpanded && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2 relative z-10">
                            {selectedOrderIds.size > 0 && (
                                <button
                                    onClick={() => setShowAssignModal(true)}
                                    style={{
                                        ...pillButtonStyle,
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 12px #f9731640`,
                                    }}
                                    className="hover:scale-105 transition-transform"
                                >
                                    <Send size={14} />
                                    Atribuir {selectedOrderIds.size}
                                </button>
                            )}
                        </div>

                        {/* Lista de pedidos */}
                        {groupedOrders.length === 0 ? (
                            <div
                                className="rounded-xl p-6 text-center relative z-10"
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
                            <div className="space-y-4 relative z-10">
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
                                                        <div className="flex items-center justify-between px-2 py-1 ml-2 border-l-2" style={{ borderColor: '#f97316' }}>
                                                            <span className="text-[10px]" style={{ color: '#f97316' }}>
                                                                🚚 {assignmentMap.get(order.checkout_id)?.employeeName} • {formatAssignmentStatus(assignmentMap.get(order.checkout_id)?.status || '')}
                                                            </span>
                                                            <button
                                                                onClick={() => setSingleAssignOpen({ order })}
                                                                className="px-3 py-1 rounded-full text-xs font-bold"
                                                                style={{ background: GRADIENT, color: '#ffffff' }}
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
                                                        <div className="flex items-center justify-between px-2 py-1 ml-2 border-l-2" style={{ borderColor: '#f97316' }}>
                                                            <span className="text-[10px]" style={{ color: '#f97316' }}>
                                                                🚚 {assignmentMap.get(order.checkout_id)?.employeeName} • {formatAssignmentStatus(assignmentMap.get(order.checkout_id)?.status || '')}
                                                            </span>
                                                            <button
                                                                onClick={() => setSingleAssignOpen({ order })}
                                                                className="px-3 py-1 rounded-full text-xs font-bold"
                                                                style={{ background: GRADIENT, color: '#ffffff' }}
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
                                        <h4 className="text-xs font-black uppercase mb-2" style={{ color: '#10b981' }}>
                                            Finalizados ({finished.length})
                                        </h4>
                                        {finished.slice(0, 5).map(order => <OrderItem key={order.checkout_id} order={order} showAssignButton={false} />)}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

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
                    storeLat={store?.store_lat}
                    storeLng={store?.store_lng}
                />
            )}
        </>
    )
}