// src/app/(main)/inicio/sections/MotoristaSection.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Car, MapPin, Search, CheckCircle2, CalendarClock, Navigation } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { hexToRgb } from '@/lib/color'
import { getAvatarUrl } from '@/lib/avatar'
import { fetchRoute } from '@/lib/mapboxRoute'
import { buildRideSpecRows } from '@/lib/rideSpecs'
import RideChat from '@/components/RideChat'

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
    driver_arrived_at: string | null
    extra_task_minutes: number | null
    extra_task_fee: number | null
    extra_task_description: string | null
    driver_id: string | null
    origin_address: string
    destination_address: string
    origin_complement: string | null
    destination_complement: string | null
    origin_lat: number | null
    origin_lng: number | null
    // Campos usados só pra montar "o que eu pedi" (buildRideSpecRows)
    ride_type: 'pessoa' | 'objeto' | 'animal'
    passenger_count: number
    has_child: boolean
    children_count: number | null
    child_age: string | null
    child_needs_car_seat: boolean | null
    has_shopping: boolean
    bag_count: number | null
    has_extra_object: boolean
    extra_object_description: string | null
    has_pet: boolean
    pet_description: string | null
    pet_weight_range: 'ate_5kg' | '5_a_15kg' | '15_a_30kg' | 'acima_30kg' | null
    pet_has_carrier: boolean | null
    object_description: string | null
    object_is_sensitive: boolean
    delivery_location: 'portaria' | 'area_interna' | 'apartamento' | null
    payment_method: 'dinheiro' | 'pix' | 'cartao' | null
    cash_change_for: number | null
    has_special_needs: boolean
    special_needs_description: string | null
    special_needs_wheelchair: boolean
    special_needs_wheelchair_type: 'dobravel' | 'grande' | null
    special_needs_visual_impairment: boolean
    has_guide_dog: boolean
}

interface DriverInfo {
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const ORDER_FIELDS = `
    id, status, applicant_count, scheduled_for, driver_en_route, driver_arrived_at, extra_task_minutes, extra_task_fee, extra_task_description, driver_id,
    origin_address, destination_address, origin_complement, destination_complement, origin_lat, origin_lng,
    ride_type, passenger_count, has_child, children_count, child_age, child_needs_car_seat,
    has_shopping, bag_count, has_extra_object, extra_object_description,
    has_pet, pet_description, pet_weight_range, pet_has_carrier, object_description, object_is_sensitive, delivery_location,
    payment_method, cash_change_for,
    has_special_needs, special_needs_description,
    special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog
`

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
    // Dispara quando o pedido ativo passa a exigir atenção (candidato novo
    // se candidatando, ou motorista aceito/a caminho) — a home usa isso pra
    // subir esse componente na frente de Categorias enquanto durar.
    onUrgentChange?: (urgent: boolean) => void
}

export default function MotoristaSection({ dragHandle, onBreveStatusChange, onUrgentChange }: MotoristaSectionProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { userId: contextUserId, loading: profileLoading } = useProfile()
    const [recentTrips, setRecentTrips] = useState<RecentRideTrip[]>([])
    const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null)
    const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null)
    const [proposedPrice, setProposedPrice] = useState<number | null>(null)
    const [liveEta, setLiveEta] = useState<{ distanceKm: number; durationMin: number } | null>(null)

    useEffect(() => {
        onBreveStatusChange?.(false)
    }, [onBreveStatusChange])

    useEffect(() => {
        if (profileLoading) return
        let active = true
        let channel: ReturnType<typeof supabase.channel> | null = null
        const userId: string | null = contextUserId

        const load = async () => {
            if (!userId) return

            // Pedido ativo (pending/accepted) tem prioridade sobre os
            // trajetos recentes — enquanto ele existe, mostramos o status
            // do pedido em vez de sugestões de para onde ir de novo.
            const { data: order } = await supabase
                .from('ride_requests')
                .select(ORDER_FIELDS)
                .eq('requester_id', userId)
                .in('status', ['pending', 'accepted'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (!active) return
            if (order) {
                setActiveOrder(order as unknown as ActiveOrder)

                if (order.status === 'accepted' && order.driver_id) {
                    const [{ data: driver }, { data: application }] = await Promise.all([
                        supabase.from('profiles').select('name, profileSlug, avatar_url').eq('id', order.driver_id).maybeSingle(),
                        supabase
                            .from('ride_applications')
                            .select('proposed_price')
                            .eq('ride_request_id', order.id)
                            .eq('applicant_id', order.driver_id)
                            .eq('status', 'accepted')
                            .maybeSingle(),
                    ])
                    if (!active) return
                    setDriverInfo({
                        name: driver?.name || null,
                        profileSlug: driver?.profileSlug || null,
                        avatarUrl: getAvatarUrl(supabase, driver?.avatar_url),
                    })
                    setProposedPrice(application?.proposed_price ?? null)
                } else {
                    setDriverInfo(null)
                    setProposedPrice(null)
                }
                return
            }
            setActiveOrder(null)
            setDriverInfo(null)
            setProposedPrice(null)

            const { data } = await supabase
                .from('ride_requests')
                .select('origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng')
                .eq('requester_id', userId)
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

        const init = async () => {
            if (!active || !userId) return
            await load()

            // Tempo real: candidato se candidatando bate applicant_count (via
            // trigger em ride_applications) num UPDATE nesta própria linha, e
            // aceite/"a caminho" também são UPDATE — um único canal cobre tudo.
            channel = supabase
                .channel(`motorista-section-${userId}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'ride_requests', filter: `requester_id=eq.${userId}` },
                    () => load()
                )
                .subscribe()
        }

        init()
        const poll = setInterval(load, 15000)
        return () => {
            active = false
            clearInterval(poll)
            if (channel) supabase.removeChannel(channel)
        }
    }, [contextUserId, profileLoading])

    // Distância/tempo em tempo real até o motorista chegar no ponto de
    // partida — lida de driver_pricing.live_lat/lng (preenchida globalmente
    // pelo DriverLiveLocationBroadcaster quando ele ativa "Sincronização
    // para motorista").
    useEffect(() => {
        const driverId = activeOrder?.status === 'accepted' ? activeOrder.driver_id : null
        const originLat = activeOrder?.origin_lat
        const originLng = activeOrder?.origin_lng
        if (!driverId || originLat == null || originLng == null) {
            setLiveEta(null)
            return
        }

        let active = true
        const loadEta = async () => {
            const { data } = await supabase
                .from('driver_pricing')
                .select('live_lat, live_lng')
                .eq('driver_id', driverId)
                .maybeSingle()
            if (!active || data?.live_lat == null || data?.live_lng == null) return

            const route = await fetchRoute([data.live_lng, data.live_lat], [originLng, originLat])
            if (active) setLiveEta({ distanceKm: route.distanceKm, durationMin: route.durationMin })
        }
        loadEta()

        const channel = supabase
            .channel(`motorista-section-live-${driverId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'driver_pricing', filter: `driver_id=eq.${driverId}` },
                () => loadEta()
            )
            .subscribe()

        const poll = setInterval(loadEta, 10000)
        return () => {
            active = false
            clearInterval(poll)
            supabase.removeChannel(channel)
        }
    }, [activeOrder?.status, activeOrder?.driver_id, activeOrder?.origin_lat, activeOrder?.origin_lng])

    // Urgente = passageiro precisa olhar: assim que existe um pedido ativo
    // (pending ou accepted) ele deve ser o primeiro componente da tela,
    // antes de Categorias — não só depois que aparece candidato/motorista.
    useEffect(() => {
        const urgent = !!activeOrder
        onUrgentChange?.(urgent)
        return () => { onUrgentChange?.(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeOrder])

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

    const specRows = activeOrder ? buildRideSpecRows(activeOrder) : []

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
                                Peça uma corrida particular e vá para onde precisar
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
                    <div
                        onClick={() => { startNavProgress(); router.push('/pedir-motorista') }}
                        className="w-full mt-4 p-3 rounded-xl text-left transition-all hover:scale-[1.01] cursor-pointer"
                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                    >
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <span
                                className="flex items-center gap-1.5 text-xs font-black"
                                style={{ color: activeOrder.status === 'accepted' ? '#22c55e' : '#f97316' }}
                            >
                                {activeOrder.status === 'accepted' ? <CheckCircle2 size={13} /> : <Search size={13} />}
                                {activeOrder.status === 'accepted'
                                    ? (activeOrder.driver_arrived_at ? 'Motorista chegou!' : activeOrder.driver_en_route ? 'Motorista a caminho!' : 'Motorista aceito, aguardando ele sair')
                                    : 'Buscando motorista...'}
                            </span>
                            {activeOrder.status === 'pending' ? (
                                <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                    {activeOrder.applicant_count > 0
                                        ? `${activeOrder.applicant_count} candidato${activeOrder.applicant_count > 1 ? 's' : ''}`
                                        : 'sem candidatos ainda'}
                                </span>
                            ) : proposedPrice != null && (
                                <span className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                    R$ {proposedPrice.toFixed(2)}
                                </span>
                            )}
                        </div>

                        {activeOrder.scheduled_for && (
                            <span className="flex items-center gap-1 text-[10px] font-bold mb-1" style={{ color: '#8b5cf6' }}>
                                <CalendarClock size={11} />
                                Agendada: {formatScheduledFor(activeOrder.scheduled_for)}
                            </span>
                        )}

                        <span className="text-xs block mb-2" style={{ color: colors.textPrimary }}>
                            {shortAddress(activeOrder.origin_address)} → {shortAddress(activeOrder.destination_address)}
                        </span>

                        {specRows.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                                {specRows.map((spec, i) => (
                                    <span
                                        key={i}
                                        className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                                        style={{ background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        title={`${spec.label}: ${spec.value}`}
                                    >
                                        {spec.label}: {spec.value}
                                    </span>
                                ))}
                            </div>
                        )}

                        {activeOrder.status === 'accepted' && driverInfo && (
                            <div className="flex items-center gap-2 p-2 rounded-lg mb-2" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                {driverInfo.avatarUrl ? (
                                    <img src={driverInfo.avatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                ) : (
                                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black" style={{ background: GRADIENT, color: '#fff' }}>
                                        {(driverInfo.name || driverInfo.profileSlug || '?').charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-black truncate" style={{ color: colors.textPrimary }}>
                                        {driverInfo.name || (driverInfo.profileSlug ? `@${driverInfo.profileSlug}` : 'Motorista')}
                                    </p>
                                    {liveEta ? (
                                        <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#22c55e' }} title="Localização em tempo real">
                                            <Navigation size={10} />
                                            {liveEta.distanceKm.toFixed(1)} km · {Math.max(1, Math.round(liveEta.durationMin))} min para chegar
                                        </span>
                                    ) : (
                                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                            Localização em tempo real indisponível
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeOrder.extra_task_fee != null && (
                            <div className="flex items-center gap-2 px-3 py-2 mt-2 rounded-xl text-xs" style={{ background: '#f9731615', color: colors.textPrimary }}>
                                <span>
                                    + Tarefa extra do motorista ({activeOrder.extra_task_minutes} min{activeOrder.extra_task_description ? ` — ${activeOrder.extra_task_description}` : ''}): <strong>R$ {activeOrder.extra_task_fee.toFixed(2)}</strong>
                                </span>
                            </div>
                        )}

                        {activeOrder.status === 'accepted' && (
                            <div onClick={(e) => e.stopPropagation()} className="mt-2">
                                <RideChat rideId={activeOrder.id} />
                            </div>
                        )}
                    </div>
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
