// src/app/(main)/inicio/sections/AcceptARider.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Car, Settings2, CheckCircle2, Navigation, ChevronDown, ChevronUp, MapPin, Users, Package, PawPrint } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import { hexToRgb } from '@/lib/color'
import { getAvatarUrl } from '@/lib/avatar'
import { computeSuggestedPrice, getEffectivePricing } from '@/lib/driverPricing'
import RideChat from '@/components/RideChat'
import { DRIVER_CHAT_QUICK_REPLIES } from '@/lib/rideChatQuickReplies'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 24 ? firstPart.substring(0, 22) + '...' : firstPart
}

interface AcceptedRideStatus {
    id: string
    origin_address: string
    destination_address: string
    driver_en_route: boolean
    requesterName: string | null
    requesterSlug: string | null
    proposedPrice: number | null
}

interface OpenRidePreview {
    id: string
    ride_type: 'pessoa' | 'objeto' | 'animal'
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
    suggestedPrice: number
    origin_address: string
    destination_address: string
    distance_km: number | null
    passenger_count: number
    object_description: string | null
    pet_description: string | null
}

interface AcceptARiderProps {
    dragHandle?: ReactNode
    // Dispara quando o motorista está com uma corrida aceita em andamento —
    // a home usa isso pra subir esse componente na frente de Categorias
    // enquanto durar, do mesmo jeito que o Motorista Particular já faz.
    onUrgentChange?: (urgent: boolean) => void
}

export default function AcceptARider({ dragHandle, onUrgentChange }: AcceptARiderProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const [hasPricing, setHasPricing] = useState<boolean | null>(null)
    const [acceptedRide, setAcceptedRide] = useState<AcceptedRideStatus | null>(null)
    const [openRides, setOpenRides] = useState<OpenRidePreview[]>([])
    const [chatExpanded, setChatExpanded] = useState(false)
    const [messageCount, setMessageCount] = useState(0)
    const [myUserId, setMyUserId] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        let channel: ReturnType<typeof supabase.channel> | null = null
        let userId: string | null = null

        const loadRide = async () => {
            if (!userId) return

            const { data: order } = await supabase
                .from('ride_requests')
                .select('id, requester_id, origin_address, destination_address, driver_en_route')
                .eq('driver_id', userId)
                .eq('status', 'accepted')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (!active) return
            if (!order) {
                setAcceptedRide(null)
                return
            }

            const [{ data: requester }, { data: application }] = await Promise.all([
                supabase.from('profiles').select('name, profileSlug').eq('id', order.requester_id).maybeSingle(),
                supabase
                    .from('ride_applications')
                    .select('proposed_price')
                    .eq('ride_request_id', order.id)
                    .eq('applicant_id', userId)
                    .eq('status', 'accepted')
                    .maybeSingle(),
            ])
            if (!active) return

            setAcceptedRide({
                id: order.id,
                origin_address: order.origin_address,
                destination_address: order.destination_address,
                driver_en_route: order.driver_en_route,
                requesterName: requester?.name || null,
                requesterSlug: requester?.profileSlug || null,
                proposedPrice: application?.proposed_price ?? null,
            })
        }

        // Prévia das corridas abertas pra se candidatar — mesma lógica do
        // quadro de /aceitar-corridas (sem candidatura própria, sem lotadas),
        // só que resumida às 3 mais recentes pra caber na home.
        const loadOpenRides = async () => {
            if (!userId) return

            const { data: pricing } = await supabase
                .from('driver_pricing')
                .select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base')
                .eq('driver_id', userId)
                .maybeSingle()
            if (!active || !pricing) {
                setOpenRides([])
                return
            }

            const { data: myApplicationRows } = await supabase
                .from('ride_applications')
                .select('ride_request_id')
                .eq('applicant_id', userId)
                .eq('status', 'pending')
            const appliedIds = new Set((myApplicationRows || []).map((a) => a.ride_request_id))

            const { data: rows } = await supabase
                .from('ride_requests')
                .select('id, requester_id, ride_type, origin_address, destination_address, distance_km, passenger_count, object_description, pet_description, applicant_count')
                .eq('status', 'pending')
                .neq('requester_id', userId)
                .order('created_at', { ascending: false })
                .limit(10)
            if (!active) return

            const candidateRows = (rows || []).filter((r) => !appliedIds.has(r.id) && (r.applicant_count ?? 0) < 5)
            const top = candidateRows.slice(0, 3)

            const requesterIds = Array.from(new Set(top.map((r) => r.requester_id)))
            const { data: profiles } = requesterIds.length > 0
                ? await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', requesterIds)
                : { data: [] as { id: string; name: string | null; profileSlug: string | null; avatar_url: string | null }[] }
            if (!active) return
            const profilesById = new Map((profiles || []).map((p) => [p.id, p]))

            const pricingShape = getEffectivePricing(pricing)
            setOpenRides(
                top.map((r) => {
                    const p = profilesById.get(r.requester_id)
                    const suggestedPrice = r.distance_km != null
                        ? computeSuggestedPrice(r.distance_km, pricingShape)
                        : pricingShape.baseFee
                    return {
                        id: r.id,
                        ride_type: r.ride_type,
                        requesterName: p?.name || null,
                        requesterSlug: p?.profileSlug || null,
                        requesterAvatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                        suggestedPrice,
                        origin_address: r.origin_address,
                        destination_address: r.destination_address,
                        distance_km: r.distance_km,
                        passenger_count: r.passenger_count,
                        object_description: r.object_description,
                        pet_description: r.pet_description,
                    }
                })
            )
        }

        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!active) return
            if (!user) {
                setHasPricing(false)
                return
            }
            userId = user.id
            setMyUserId(user.id)

            const { data: pricing } = await supabase
                .from('driver_pricing')
                .select('id')
                .eq('driver_id', user.id)
                .maybeSingle()
            if (!active) return
            setHasPricing(!!pricing)

            await loadRide()
            await loadOpenRides()

            // Tempo real: aceite, "a caminho" e finalização/cancelamento são
            // todos UPDATE nesta própria linha — um canal cobre tudo.
            channel = supabase
                .channel(`canal-motorista-${user.id}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${user.id}` },
                    () => loadRide()
                )
                .subscribe()
        }

        init()
        const poll = setInterval(() => { loadRide(); loadOpenRides() }, 15000)
        return () => {
            active = false
            clearInterval(poll)
            if (channel) supabase.removeChannel(channel)
        }
    }, [])

    useEffect(() => {
        onUrgentChange?.(!!acceptedRide)
        return () => { onUrgentChange?.(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [acceptedRide])

    // Quantas mensagens o passageiro já mandou nessa corrida — vira o badge
    // "você tem uma mensagem!" no botão do chat.
    useEffect(() => {
        const rideId = acceptedRide?.id
        if (!rideId || !myUserId) {
            setMessageCount(0)
            return
        }

        let active = true
        const loadCount = async () => {
            const { count } = await supabase
                .from('ride_messages')
                .select('id', { count: 'exact', head: true })
                .eq('ride_request_id', rideId)
                .neq('sender_id', myUserId)
            if (active) setMessageCount(count || 0)
        }
        loadCount()

        const channel = supabase
            .channel(`chat-badge-${rideId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_request_id=eq.${rideId}` },
                () => loadCount()
            )
            .subscribe()

        return () => {
            active = false
            supabase.removeChannel(channel)
        }
    }, [acceptedRide?.id, myUserId])

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

    const goToPainel = () => { startNavProgress(); router.push('/painel-motorista') }
    const goToCorridas = () => { startNavProgress(); router.push('/aceitar-corridas') }

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
                                Canal do Motorista
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textPrimary }}>
                                Defina sua tarifa e aceite corridas disponíveis
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
                        <div className="flex flex-row flex-nowrap gap-2 justify-center sm:justify-end">
                            <button
                                onClick={goToPainel}
                                className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap hover:scale-105 active:scale-95 flex-1 sm:flex-none min-w-0"
                                style={buttonStyle}
                            >
                                <Settings2 size={16} className="flex-shrink-0" />
                                painel do motorista
                            </button>

                            {hasPricing && (
                                <button
                                    onClick={goToCorridas}
                                    className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 rounded-full font-bold text-xs sm:text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95 flex-1 sm:flex-none min-w-0"
                                    style={buttonStyle}
                                >
                                    <Car size={16} className="flex-shrink-0" />
                                    ver corridas
                                </button>
                            )}
                        </div>

                        {hasPricing === false && (
                            <button
                                onClick={goToPainel}
                                className="text-xs font-bold text-right"
                                style={{ color: '#f97316' }}
                            >
                                Habilite seu valor de corrida para ver corridas
                            </button>
                        )}
                    </div>
                </div>

                {acceptedRide && (
                    <div
                        onClick={goToCorridas}
                        className="w-full mt-4 p-3 rounded-xl text-left transition-all hover:scale-[1.01] cursor-pointer"
                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                    >
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <span
                                className="flex items-center gap-1.5 text-xs font-black"
                                style={{ color: acceptedRide.driver_en_route ? '#22c55e' : '#f97316' }}
                            >
                                {acceptedRide.driver_en_route ? <Navigation size={13} /> : <CheckCircle2 size={13} />}
                                {acceptedRide.driver_en_route ? 'A caminho do ponto de partida' : 'Corrida aceita — aguardando você sair'}
                            </span>
                            {acceptedRide.proposedPrice != null && (
                                <span className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                    R$ {acceptedRide.proposedPrice.toFixed(2)}
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] font-bold mb-1" style={{ color: colors.textSecondary }}>
                            {acceptedRide.requesterName || (acceptedRide.requesterSlug ? `@${acceptedRide.requesterSlug}` : 'Passageiro')}
                        </p>
                        <span className="text-xs block mb-2" style={{ color: colors.textPrimary }}>
                            {shortAddress(acceptedRide.origin_address)} → {shortAddress(acceptedRide.destination_address)}
                        </span>

                        <button
                            onClick={(e) => { e.stopPropagation(); setChatExpanded((v) => !v) }}
                            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95"
                            style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            {messageCount > 0 && (
                                <span
                                    className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black flex-shrink-0"
                                    style={{ background: '#ef4444', border: '1.5px solid #ffffff', color: '#ffffff' }}
                                >
                                    {messageCount}
                                </span>
                            )}
                            <span className="truncate">
                                {messageCount > 0
                                    ? `Você tem ${messageCount === 1 ? 'uma mensagem' : `${messageCount} mensagens`}!`
                                    : 'Abrir chat'}
                            </span>
                            {chatExpanded ? <ChevronUp size={14} className="flex-shrink-0" /> : <ChevronDown size={14} className="flex-shrink-0" />}
                        </button>

                        {chatExpanded && (
                            <div onClick={(e) => e.stopPropagation()} className="mt-2">
                                <RideChat rideId={acceptedRide.id} quickReplies={DRIVER_CHAT_QUICK_REPLIES} />
                            </div>
                        )}
                    </div>
                )}

                {hasPricing && openRides.length > 0 && (
                    <div className="flex flex-col gap-2 mt-4">
                        {openRides.map((ride) => (
                            <button
                                key={ride.id}
                                onClick={goToCorridas}
                                className="w-full p-3 rounded-xl text-left transition-all hover:scale-[1.01]"
                                style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    {ride.requesterAvatarUrl ? (
                                        <img src={ride.requesterAvatarUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                                    ) : (
                                        <span
                                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            {(ride.requesterName || ride.requesterSlug || '?').charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black truncate" style={{ color: colors.textPrimary }}>
                                            {ride.requesterName || (ride.requesterSlug ? `@${ride.requesterSlug}` : 'Passageiro')}
                                        </p>
                                        <span className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                            {ride.ride_type === 'objeto' ? (
                                                <><Package size={10} className="flex-shrink-0" /> {ride.object_description || 'Objeto'}</>
                                            ) : ride.ride_type === 'animal' ? (
                                                <><PawPrint size={10} className="flex-shrink-0" /> {ride.pet_description || 'Animal'}</>
                                            ) : (
                                                <><Users size={10} className="flex-shrink-0" /> {ride.passenger_count} passageiro{ride.passenger_count > 1 ? 's' : ''}</>
                                            )}
                                        </span>
                                    </div>
                                    <span className="text-xs font-black flex-shrink-0" style={{ color: '#f97316' }}>
                                        R$ {ride.suggestedPrice.toFixed(2)}
                                    </span>
                                </div>

                                <div className="flex items-start gap-1.5 text-[11px] mb-1" style={{ color: colors.textSecondary }}>
                                    <MapPin size={11} className="flex-shrink-0 mt-0.5" />
                                    <span>{shortAddress(ride.origin_address)} → {shortAddress(ride.destination_address)}</span>
                                </div>

                                {ride.distance_km != null && (
                                    <span className="text-[10px] font-bold" style={{ color: colors.textPrimary }}>
                                        {ride.distance_km.toFixed(1)} km total
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}
