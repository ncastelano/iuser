// app/(main)/rastrear/[checkout_id]/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MapPin, Clock, Truck, CheckCircle2 } from 'lucide-react'
import dynamic from 'next/dynamic'

const CustomerTrackingMap = dynamic(() => import('./components/CustomerTrackingMap'), { ssr: false })

interface TrackingStop {
    sequence: number
    lat: number
    lng: number
    address: string
    status: string
}

interface TrackingInfo {
    employee_name: string
    employee_phone: string
    store_lat: number
    store_lng: number
    stops: TrackingStop[]
}

export default function RastrearPage() {
    const params = useParams()
    const checkoutId = params.checkout_id as string
    const { colors } = useTheme()

    const [tracking, setTracking] = useState<TrackingInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const fetchTracking = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase.rpc('get_tracking_info', { p_checkout_id: checkoutId })
            if (error) throw error
            if (!data || data.length === 0) {
                setError('Pedido não encontrado ou sem rastreamento.')
                setTracking(null)
            } else {
                setTracking(data[0] as TrackingInfo)
                setError('')
            }
        } catch (err: any) {
            setError('Erro ao carregar informações de rastreamento.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTracking()
        // Inscrever em tempo real na tabela delivery_tracking
        const channel = supabase
            .channel(`tracking-${checkoutId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'delivery_tracking',
                filter: `checkout_id=eq.${checkoutId}`
            }, () => {
                fetchTracking()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [checkoutId])

    if (loading) {
        return <LoadingSpinner message="Carregando rastreamento..." />
    }

    if (error || !tracking) {
        return (
            <div className="px-4 max-w-lg mx-auto py-20 text-center">
                <MapPin size={40} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-black" style={{ color: colors.textPrimary }}>Pedido não rastreado</p>
                <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>{error || 'Tente novamente mais tarde.'}</p>
            </div>
        )
    }

    // Encontrar a parada atual e o progresso
    const currentIndex = tracking.stops.findIndex(s => s.status === 'in_transit')
    const nextPendingIndex = tracking.stops.findIndex(s => s.status === 'pending')
    const activeIndex = currentIndex >= 0 ? currentIndex : nextPendingIndex
    const totalStops = tracking.stops.length

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
            {/* Cabeçalho */}
            <div className="text-center mb-6">
                <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Acompanhar Pedido</h1>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    Entregador: {tracking.employee_name} {tracking.employee_phone && `• ${tracking.employee_phone}`}
                </p>
            </div>

            {/* Mapa com a rota */}
            <div className="h-56 rounded-2xl overflow-hidden mb-6">
                <CustomerTrackingMap
                    storeLat={tracking.store_lat}
                    storeLng={tracking.store_lng}
                    stops={tracking.stops}
                    activeStopIndex={activeIndex}
                />
            </div>

            {/* Status e progresso */}
            <div className="rounded-2xl p-4 border mb-6"
                style={{
                    background: 'transparent',
                    borderColor: colors.border,
                    backdropFilter: 'blur(8px)',
                }}
            >
                <div className="flex items-center gap-3">
                    {currentIndex >= 0 ? (
                        <Truck size={24} style={{ color: colors.accent }} />
                    ) : nextPendingIndex >= 0 ? (
                        <Clock size={24} style={{ color: colors.accentLight }} />
                    ) : (
                        <CheckCircle2 size={24} style={{ color: '#22c55e' }} />
                    )}
                    <div>
                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                            {currentIndex >= 0
                                ? `Entregador está na parada ${currentIndex + 1} de ${totalStops}`
                                : nextPendingIndex >= 0
                                    ? `Seu pedido é a ${nextPendingIndex + 1}ª parada (a caminho)`
                                    : 'Pedido entregue!'}
                        </p>
                        <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                            {tracking.stops[currentIndex]?.address || 'Aguardando atualização'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Lista de paradas com destaque */}
            <div className="space-y-2">
                {tracking.stops.map((stop, idx) => (
                    <div key={idx}
                        className={`flex items-center gap-3 p-3 rounded-xl border ${idx === activeIndex ? 'border-opacity-100' : 'border-opacity-30'
                            }`}
                        style={{
                            background: idx === activeIndex ? `${colors.accent}15` : 'transparent',
                            borderColor: idx === activeIndex ? colors.accent : colors.border,
                        }}
                    >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black"
                            style={{
                                background: stop.status === 'delivered' ? '#22c55e30' : idx === activeIndex ? colors.accent + '30' : 'transparent',
                                color: stop.status === 'delivered' ? '#22c55e' : idx === activeIndex ? colors.accent : colors.textSecondary,
                            }}
                        >
                            {stop.sequence}
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-bold" style={{ color: idx === activeIndex ? colors.textPrimary : colors.textSecondary }}>
                                {stop.address}
                            </p>
                        </div>
                        <div>
                            {stop.status === 'delivered' ? (
                                <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                            ) : stop.status === 'in_transit' ? (
                                <Truck size={16} style={{ color: colors.accent }} />
                            ) : (
                                <Clock size={16} style={{ color: colors.textSecondary }} />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}