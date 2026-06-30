'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
import {
    ArrowLeft,
    Phone,
    MapPin,
    CheckCircle2,
    Clock,
    Truck,
    Navigation,
    Check,
    X,
    Map as MapIcon
} from 'lucide-react'
import dynamic from 'next/dynamic'

const DeliveryMap = dynamic(() => import('@/app/(main)/[profileSlug]/[storeSlug]/entregadores/components/DeliveryMap'), { ssr: false })

interface DeliveryStop {
    checkout_id: string
    sequence_order: number
    status: string
    delivery_address: string | null
    delivery_lat: number | null
    delivery_lng: number | null
    buyer_name: string | null
    buyer_profile_slug: string | null
}

export default function EntregadorPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const employeeId = params.id as string
    const token = searchParams.get('token') || ''
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [employee, setEmployee] = useState<any>(null)
    const [stops, setStops] = useState<DeliveryStop[]>([])
    const [authorized, setAuthorized] = useState(false)

    // Validar acesso via RPC
    const validateAccess = useCallback(async () => {
        try {
            const { data, error } = await supabase.rpc('get_employee_deliveries', {
                p_employee_id: employeeId,
                p_token: token,
            })
            if (error) throw error
            setStops(data || [])
            setAuthorized(true)
        } catch (err: any) {
            toast.error('Acesso inválido ou expirado')
            setAuthorized(false)
        } finally {
            setLoading(false)
        }
    }, [employeeId, token])

    const fetchEmployee = useCallback(async () => {
        const { data } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .maybeSingle()
        setEmployee(data)
    }, [employeeId])

    useEffect(() => {
        validateAccess()
        fetchEmployee()
    }, [validateAccess, fetchEmployee])

    const handleUpdateStatus = async (checkoutId: string, newStatus: string) => {
        const { error } = await supabase
            .from('delivery_assignments')
            .update({ status: newStatus })
            .eq('employee_id', employeeId)
            .eq('checkout_id', checkoutId)
        if (error) {
            toast.error('Erro ao atualizar status')
            return
        }
        // Atualizar localmente
        setStops(prev =>
            prev.map(s => (s.checkout_id === checkoutId ? { ...s, status: newStatus } : s))
        )
        toast.success(`Status alterado para ${newStatus === 'in_transit' ? 'em trânsito' : 'entregue'}`)
    }

    const mapStops = stops
        .filter(s => s.delivery_lat && s.delivery_lng)
        .map(s => ({
            lat: s.delivery_lat!,
            lng: s.delivery_lng!,
            label: s.sequence_order.toString(),
            address: s.delivery_address || '',
            status: s.status,
        }))

    if (loading) {
        return <LoadingSpinner message="Carregando entregas..." />
    }

    if (!authorized) {
        return (
            <div className="px-4 max-w-lg mx-auto py-20 text-center">
                <X size={40} className="mx-auto mb-4" style={{ color: colors.textSecondary }} />
                <h1 className="text-xl font-black" style={{ color: colors.textPrimary }}>Acesso Negado</h1>
                <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>Token inválido ou expirado.</p>
            </div>
        )
    }

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black"
                    style={{ background: `${colors.accent}22`, color: colors.accent }}>
                    {employee?.name?.charAt(0) || 'E'}
                </div>
                <div>
                    <h1 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                        {employee?.name || 'Entregador'}
                    </h1>
                    {employee?.phone && (
                        <p className="text-xs flex items-center gap-1" style={{ color: colors.textSecondary }}>
                            <Phone size={10} /> {employee.phone}
                        </p>
                    )}
                </div>
            </div>

            {/* Mapa */}
            <div className="h-56 rounded-2xl overflow-hidden mb-4">
                <DeliveryMap stops={mapStops} />
            </div>

            {/* Lista de paradas interativas */}
            <div className="space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}>
                    <MapIcon size={14} /> Rota ({stops.length} paradas)
                </h3>
                {stops.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhuma entrega para hoje.</p>
                ) : (
                    stops.map(stop => (
                        <div key={stop.checkout_id}
                            className="rounded-2xl p-4 border"
                            style={{
                                background: 'transparent',
                                borderColor: stop.status === 'delivered' ? '#22c55e30' : colors.border,
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black"
                                        style={{
                                            background: stop.status === 'delivered' ? '#22c55e30' : colors.accent + '30',
                                            color: stop.status === 'delivered' ? '#22c55e' : colors.accent,
                                        }}
                                    >
                                        {stop.sequence_order}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                            {stop.buyer_name || `@${stop.buyer_profile_slug}`}
                                        </p>
                                        <p className="text-[10px] flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                            <MapPin size={10} /> {stop.delivery_address || 'Endereço não informado'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {stop.status === 'pending' && (
                                        <button
                                            onClick={() => handleUpdateStatus(stop.checkout_id, 'in_transit')}
                                            className="px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1"
                                            style={{ background: colors.accent, color: colors.accentText }}
                                        >
                                            <Truck size={12} /> Iniciar
                                        </button>
                                    )}
                                    {stop.status === 'in_transit' && (
                                        <button
                                            onClick={() => handleUpdateStatus(stop.checkout_id, 'delivered')}
                                            className="px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1"
                                            style={{ background: '#22c55e', color: 'white' }}
                                        >
                                            <Check size={12} /> Entregue
                                        </button>
                                    )}
                                    {stop.status === 'delivered' && (
                                        <CheckCircle2 size={20} style={{ color: '#22c55e' }} />
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}