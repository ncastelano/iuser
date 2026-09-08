// src/app/(main)/inicio/sections/MotoristaSection.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Car, MapPin, Search, CheckCircle2, CalendarClock } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import { hexToRgb } from '@/lib/color'

interface RecentRideTrip {
    originAddress: string
    originCoords: [number, number] | null
    destinationAddress: string
    destinationCoords: [number, number] | null
}

interface ActiveOrder {
    id: string
    status: 'pending' | 'accepted'
    applicant_count: number
    scheduled_for: string | null
    driver_en_route: boolean
    origin_address: string
    destination_address: string
}

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 24 ? firstPart.substring(0, 22) + '...' : firstPart
}

function formatScheduledFor(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface MotoristaSectionProps {
    dragHandle?: ReactNode
    onBreveStatusChange?: (isBreve: boolean) => void
}

export default function MotoristaSection({ dragHandle, onBreveStatusChange }: MotoristaSectionProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const [recentTrips, setRecentTrips] = useState<RecentRideTrip[]>([])
    const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null)

    useEffect(() => {
        onBreveStatusChange?.(false)
    }, [onBreveStatusChange])

    useEffect(() => {
        let active = true

        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Pedido ativo (pending/accepted) tem prioridade sobre os
            // trajetos recentes — enquanto ele existe, mostramos o status
            // do pedido em vez de sugestões de para onde ir de novo.
            const { data: order } = await supabase
                .from('ride_requests')
                .select('id, status, applicant_count, scheduled_for, driver_en_route, origin_address, destination_address')
                .eq('requester_id', user.id)
                .in('status', ['pending', 'accepted'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (!active) return
            if (order) {
                setActiveOrder(order as ActiveOrder)
                return
            }
            setActiveOrder(null)

            const { data } = await supabase
                .from('ride_requests')
                .select('origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng')
                .eq('requester_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20)
            if (!active || !data) return

            const seen = new Set<string>()
            const trips: RecentRideTrip[] = []
            for (const r of data) {
                const key = `${r.origin_address}|${r.destination_address}`
                if (seen.has(key)) continue
                seen.add(key)
                trips.push({
                    originAddress: r.origin_address,
                    originCoords: r.origin_lat != null && r.origin_lng != null ? [r.origin_lng, r.origin_lat] : null,
                    destinationAddress: r.destination_address,
                    destinationCoords: r.destination_lat != null && r.destination_lng != null ? [r.destination_lng, r.destination_lat] : null,
                })
                if (trips.length >= 3) break
            }
            setRecentTrips(trips)
        }

        load()
        const poll = setInterval(load, 15000)
        return () => { active = false; clearInterval(poll) }
    }, [])

    const goToTrip = (trip: RecentRideTrip) => {
        const params = new URLSearchParams({ origem: trip.originAddress, destino: trip.destinationAddress })
        if (trip.originCoords) {
            params.set('origem_lng', String(trip.originCoords[0]))
            params.set('origem_lat', String(trip.originCoords[1]))
        }
        if (trip.destinationCoords) {
            params.set('lng', String(trip.destinationCoords[0]))
            params.set('lat', String(trip.destinationCoords[1]))
        }
        startNavProgress()
        router.push(`/pedir-motorista?${params.toString()}`)
    }

    const surfaceRgb = hexToRgb(colors.surface)

    const buttonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.5rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s',
        background: GRADIENT,
        color: '#ffffff',
        border: 'none',
        boxShadow: `0 4px 12px #f9731640`,
        cursor: 'pointer',
    }

    return (
        <section>
            <div
                className="rounded-2xl p-6 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                    transform: 'translateZ(0)',
                    willChange: 'transform',
                }}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {dragHandle && <div>{dragHandle}</div>}

                        {/* Ícone com gradiente laranja-vermelho - igual ao ButtonSettingsHome */}
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                        >
                            <Car size={28} />
                        </div>

                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Motorista Particular
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textPrimary }}>
                                Chame um motorista para te levar aonde quiser
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => { startNavProgress(); router.push('/pedir-motorista') }}
                        className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95"
                        style={buttonStyle}
                    >
                        <Car size={16} />
                        {activeOrder ? 'ver meu pedido' : 'pedir motorista'}
                    </button>
                </div>

                {activeOrder ? (
                    <button
                        onClick={() => { startNavProgress(); router.push('/pedir-motorista') }}
                        className="w-full mt-4 p-3 rounded-xl text-left transition-all hover:scale-[1.01]"
                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                    >
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <span
                                className="flex items-center gap-1.5 text-xs font-black"
                                style={{ color: activeOrder.status === 'accepted' ? '#22c55e' : '#f97316' }}
                            >
                                {activeOrder.status === 'accepted' ? <CheckCircle2 size={13} /> : <Search size={13} />}
                                {activeOrder.status === 'accepted'
                                    ? (activeOrder.driver_en_route ? 'Motorista a caminho!' : 'Motorista aceito, aguardando ele sair')
                                    : 'Buscando motorista...'}
                            </span>
                            {activeOrder.status === 'pending' && (
                                <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                    {activeOrder.applicant_count > 0
                                        ? `${activeOrder.applicant_count} candidato${activeOrder.applicant_count > 1 ? 's' : ''}`
                                        : 'sem candidatos ainda'}
                                </span>
                            )}
                        </div>
                        {activeOrder.scheduled_for && (
                            <span className="flex items-center gap-1 text-[10px] font-bold mb-1" style={{ color: '#8b5cf6' }}>
                                <CalendarClock size={11} />
                                Agendada: {formatScheduledFor(activeOrder.scheduled_for)}
                            </span>
                        )}
                        <span className="text-xs" style={{ color: colors.textPrimary }}>
                            {shortAddress(activeOrder.origin_address)} → {shortAddress(activeOrder.destination_address)}
                        </span>
                    </button>
                ) : (
                    recentTrips.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {recentTrips.map((trip) => (
                                <button
                                    key={`${trip.originAddress}|${trip.destinationAddress}`}
                                    onClick={() => goToTrip(trip)}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95"
                                    style={{
                                        background: `${colors.border}30`,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                >
                                    <MapPin size={14} />
                                    {shortAddress(trip.originAddress)} → {shortAddress(trip.destinationAddress)}
                                </button>
                            ))}
                        </div>
                    )
                )}
            </div>
        </section>
    )
}
