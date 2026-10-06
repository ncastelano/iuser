// src/app/(main)/inicio/sections/AcceptARider.tsx
'use client'

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Car, Bike, Motorbike, Settings2, CheckCircle2, Navigation, MapPin, Users, Package, PawPrint, Clock, ArrowRight, LocateFixed, Plus } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { computeSuggestedPrice, computeConditionExtras, computePickupFee, fetchPricePerMinuteMap, getEffectivePricing, PLATFORM_DEFAULT_PRICING_BY_VEHICLE, type RideConditionFlags } from '@/lib/driverPricing'
import { kindForRideType } from '@/lib/rideVehicle'
import { fetchRoute, haversineKm } from '@/lib/mapboxRoute'
import { watchPosition } from '@/lib/nativeGeolocation'
import { Spinner } from '@/components/Spinner'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import RideChat from '@/components/RideChat'
import { DRIVER_CHAT_QUICK_REPLIES } from '@/lib/rideChatQuickReplies'
import { HomeGlassCard } from './HomeSectionKit'
import { RideOfferCard, type OfferRide, type OfferRequester } from '@/components/AceitarCorridas/RideOfferCard'

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

// Corrida aberta na prévia da home: mesmos dados e mesmo card de /aceitar-corridas
interface OpenRidePreview {
    ride: OfferRide
    requester: OfferRequester
    suggestedPrice: number
    // Ponto de partida (pra medir a distância do motorista até ele) e se o valor
    // é a Tarifa iUser — só ela soma o deslocamento até o passageiro.
    origin: [number, number] | null
    usesPlatformTariff: boolean
}

interface CandidacyPreview {
    id: string
    ride_type: 'pessoa' | 'objeto' | 'animal'
    requesterName: string | null
    requesterSlug: string | null
    requesterAvatarUrl: string | undefined
    proposedPrice: number | null
    origin_address: string
    destination_address: string
    distance_km: number | null
    duration_min: number | null
    passenger_count: number
    object_description: string | null
    pet_description: string | null
}

interface AcceptARiderProps {
    dragHandle?: ReactNode
    // Dispara quando o motorista está com uma corrida aceita em andamento,
    // aguardando decisão de uma candidatura, ou com o modo motorista ligado
    // e corridas abertas aparecendo pra se candidatar — a home usa isso pra
    // subir esse componente na frente de Categorias enquanto durar, do
    // mesmo jeito que o Motorista Particular já faz.
    onUrgentChange?: (urgent: boolean) => void
}

export default function AcceptARider({ dragHandle, onUrgentChange }: AcceptARiderProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { userId: contextUserId, loading: profileLoading } = useProfile()
    const [hasPricing, setHasPricing] = useState<boolean | null>(null)
    const [driverModeActive, setDriverModeActive] = useState(false)
    const [acceptedRide, setAcceptedRide] = useState<AcceptedRideStatus | null>(null)
    const [openRides, setOpenRides] = useState<OpenRidePreview[]>([])
    const [openRidesTotal, setOpenRidesTotal] = useState(0)
    const [myCandidacies, setMyCandidacies] = useState<CandidacyPreview[]>([])

    // ===== SUA LOCALIZAÇÃO: a Tarifa iUser soma o deslocamento até o passageiro =====
    const [gps, setGps] = useState<[number, number] | null>(null)
    const [gpsStatus, setGpsStatus] = useState<'idle' | 'asking' | 'granted' | 'denied' | 'unavailable'>('idle')
    const gpsWatchRef = useRef<{ clear: () => void } | null>(null)
    const gpsFixRef = useRef(false)
    const [pickupById, setPickupById] = useState<Record<string, { km: number; min: number }>>({})
    const lastRouteRef = useRef<{ coords: [number, number]; key: string } | null>(null)

    const requestGps = useCallback(() => {
        gpsWatchRef.current?.clear()
        setGpsStatus(gpsFixRef.current ? 'granted' : 'asking')
        gpsWatchRef.current = watchPosition(
            (pos) => {
                gpsFixRef.current = true
                setGpsStatus('granted')
                setGps([pos.coords.longitude, pos.coords.latitude])
            },
            (err) => {
                if (gpsFixRef.current) return
                setGpsStatus(err.code === 1 ? 'denied' : 'unavailable')
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        )
    }, [])
    useEffect(() => () => gpsWatchRef.current?.clear(), [])

    useEffect(() => {
        if (profileLoading) return
        let active = true
        let channel: ReturnType<typeof supabase.channel> | null = null
        const userId: string | null = contextUserId

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
            await loadPlatformTariffs(supabase)
            // Visitante (sem login) também vê as corridas abertas: assim ele sabe que
            // tem corrida pra pegar. Sem conta não tem driver_pricing nem candidatura
            // própria, então vale a tarifa iUser e nada é filtrado por "já me candidatei".
            let pricingRow: { pricing_mode: any; base_distance_km: any; base_fee: any; price_per_km_after_base: any } | null = null
            let appliedIds = new Set<string>()
            if (userId) {
                // As corridas aparecem mesmo sem o modo motorista ativado (e sem tarifa
                // cadastrada ainda): quem não tem driver_pricing vê o valor pela tarifa iUser.
                const { data } = await supabase
                    .from('driver_pricing')
                    .select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base')
                    .eq('driver_id', userId)
                    .maybeSingle()
                pricingRow = data

                const { data: myApplicationRows } = await supabase
                    .from('ride_applications')
                    .select('ride_request_id')
                    .eq('applicant_id', userId)
                    .eq('status', 'pending')
                appliedIds = new Set((myApplicationRows || []).map((a) => a.ride_request_id))
            }
            if (!active) return
            const pricePerMinute = userId ? (await fetchPricePerMinuteMap(supabase, [userId])).get(userId) ?? null : null
            const pricing = pricingRow
                ? { ...pricingRow, price_per_minute: pricePerMinute }
                : { pricing_mode: 'platform' as const, base_distance_km: null, base_fee: null, price_per_km_after_base: null, price_per_minute: null }

            let openQuery = supabase
                .from('ride_requests')
                .select('id, requester_id, ride_type, origin_address, destination_address, origin_lat, origin_lng, origin_complement, destination_complement, notes, passenger_count, vehicle_type, object_description, object_is_sensitive, pet_description, has_child, children_count, child_age, child_needs_car_seat, has_shopping, bag_count, has_extra_object, extra_object_description, has_pet, pet_weight_range, pet_has_carrier, has_special_needs, special_needs_description, special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog, delivery_location, payment_method, cash_change_for, card_is_contactless, origin_needs_access, origin_access_notes, destination_needs_access, destination_access_notes, grocery_bag_size, wants_air_conditioning, distance_km, duration_min, scheduled_for, created_at, offered_price, order_id, applicant_count, stop1_address, stop2_address')
                .eq('status', 'pending')
            if (userId) openQuery = openQuery.neq('requester_id', userId)
            const { data: rows } = await openQuery
                .order('created_at', { ascending: false })
                .limit(15)
            if (!active) return

            const candidateRows = (rows || []).filter((r) => !appliedIds.has(r.id) && (r.applicant_count ?? 0) < 5)
            const top = candidateRows.slice(0, 3)
            setOpenRidesTotal(candidateRows.length)

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
                    const conditionFlags: RideConditionFlags = {
                        origin_needs_access: r.origin_needs_access,
                        destination_needs_access: r.destination_needs_access,
                        is_grocery_shopping: r.has_shopping,
                        has_special_needs: r.has_special_needs,
                        special_needs_wheelchair: r.special_needs_wheelchair,
                        special_needs_visual_impairment: r.special_needs_visual_impairment,
                        has_guide_dog: r.has_guide_dog,
                        pet_has_carrier: r.pet_has_carrier,
                        delivery_location: r.delivery_location,
                        wants_air_conditioning: r.wants_air_conditioning,
                    }
                    const computedPrice = r.distance_km != null
                        ? computeSuggestedPrice(r.distance_km, pricingShape, r.ride_type, conditionFlags, r.duration_min)
                        : pricingShape.baseFee
                            + pricingShape.extraFees[r.ride_type as 'pessoa' | 'animal' | 'objeto']
                            + computeConditionExtras(conditionFlags, pricingShape.conditionExtraFees)
                    return {
                        ride: r as unknown as OfferRide,
                        requester: {
                            name: p?.name || null,
                            slug: p?.profileSlug || null,
                            avatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                            rating: { avg: 0, count: 0 },
                        },
                        // Frete de loja já vem com valor fechado; o resto sai da tarifa
                        suggestedPrice: r.offered_price != null ? Number(r.offered_price) : computedPrice,
                        origin: r.origin_lat != null && r.origin_lng != null ? [r.origin_lng, r.origin_lat] as [number, number] : null,
                        usesPlatformTariff: r.offered_price == null && pricing.pricing_mode === 'platform',
                    }
                })
            )
        }

        // Corridas em que já me candidatei e ainda aguardam decisão — mesmo
        // card visual das corridas abertas, só que com "Aguardando decisão"
        // e a proposta que eu mandei, no lugar do botão de candidatar.
        const loadCandidacies = async () => {
            if (!userId) return

            const { data: applications } = await supabase
                .from('ride_applications')
                .select('ride_request_id, proposed_price')
                .eq('applicant_id', userId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
            if (!active) return
            if (!applications || applications.length === 0) {
                setMyCandidacies([])
                return
            }

            const rideIds = applications.map((a) => a.ride_request_id)
            const { data: rides } = await supabase
                .from('ride_requests')
                .select('id, requester_id, ride_type, origin_address, destination_address, distance_km, duration_min, passenger_count, object_description, pet_description')
                .in('id', rideIds)
            if (!active) return
            const ridesById = new Map((rides || []).map((r) => [r.id, r]))

            const requesterIds = Array.from(new Set((rides || []).map((r) => r.requester_id)))
            const { data: profiles } = requesterIds.length > 0
                ? await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', requesterIds)
                : { data: [] as { id: string; name: string | null; profileSlug: string | null; avatar_url: string | null }[] }
            if (!active) return
            const profilesById = new Map((profiles || []).map((p) => [p.id, p]))

            const list: CandidacyPreview[] = []
            for (const a of applications) {
                const r = ridesById.get(a.ride_request_id)
                if (!r) continue
                const p = profilesById.get(r.requester_id)
                list.push({
                    id: r.id,
                    ride_type: r.ride_type,
                    requesterName: p?.name || null,
                    requesterSlug: p?.profileSlug || null,
                    requesterAvatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                    proposedPrice: a.proposed_price,
                    origin_address: r.origin_address,
                    destination_address: r.destination_address,
                    distance_km: r.distance_km,
                    duration_min: r.duration_min,
                    passenger_count: r.passenger_count,
                    object_description: r.object_description,
                    pet_description: r.pet_description,
                })
            }
            setMyCandidacies(list)
        }

        const init = async () => {
            if (!active) return
            if (!userId) {
                setHasPricing(false)
                await loadOpenRides()
                return
            }

            const { data: pricing } = await supabase
                .from('driver_pricing')
                .select('id, driver_mode_active')
                .eq('driver_id', userId)
                .maybeSingle()
            if (!active) return
            setHasPricing(!!pricing)
            setDriverModeActive(!!pricing?.driver_mode_active)

            await loadRide()
            await loadOpenRides()
            await loadCandidacies()

            // Tempo real: aceite, "a caminho" e finalização/cancelamento são
            // todos UPDATE nesta própria linha — um canal cobre tudo.
            //
            // Nome com Date.now(): supabase.channel(topic) reaproveita um
            // canal existente com o mesmo topic em vez de criar um novo (só
            // cria de fato se não achar nenhum) — e removeChannel() é
            // assíncrono (espera um unsubscribe() de rede antes de tirar da
            // lista). Ao navegar rápido pra fora da home e voltar (ex: abrir
            // o dashboard da loja e voltar), esse efeito desmonta e remonta
            // antes do removeChannel() da vez anterior terminar, e
            // `.channel()` devolve o canal antigo — que já tinha dado
            // subscribe() — daí o erro "cannot add postgres_changes
            // callbacks ... after subscribe()". Sufixo com timestamp
            // garante que cada montagem pega um canal genuinamente novo.
            channel = supabase
                .channel(`canal-motorista-${userId}-${Date.now()}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${userId}` },
                    () => loadRide()
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'ride_applications', filter: `applicant_id=eq.${userId}` },
                    () => { loadCandidacies(); loadOpenRides() }
                )
                .subscribe()
        }

        init()
        const poll = setInterval(() => { loadRide(); loadOpenRides(); loadCandidacies() }, 15000)
        return () => {
            active = false
            clearInterval(poll)
            if (channel) supabase.removeChannel(channel)
        }
    }, [contextUserId, profileLoading])

    useEffect(() => {
        onUrgentChange?.(!!acceptedRide || myCandidacies.length > 0 || (driverModeActive && openRides.length > 0))
        return () => { onUrgentChange?.(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [acceptedRide, myCandidacies.length, driverModeActive, openRides.length])

    // Pede a localização sozinho assim que existe corrida na Tarifa iUser pra mostrar.
    const needsLocation = openRides.some((r) => r.usesPlatformTariff)
    useEffect(() => {
        if (needsLocation && gpsStatus === 'idle') requestGps()
    }, [needsLocation, gpsStatus, requestGps])

    // Km de estrada do motorista até a partida de cada corrida (recalcula se ele andou +300 m)
    useEffect(() => {
        if (!gps || openRides.length === 0) return
        const key = openRides.map((r) => r.ride.id).join(',')
        const last = lastRouteRef.current
        if (last && last.key === key && haversineKm(last.coords, gps) < 0.3) return
        lastRouteRef.current = { coords: gps, key }
        openRides.forEach(({ ride, origin, usesPlatformTariff }) => {
            if (!origin || !usesPlatformTariff) return
            fetchRoute(gps, origin).then((route) => {
                setPickupById((prev) => ({ ...prev, [ride.id]: { km: route.distanceKm, min: route.durationMin } }))
            })
        })
    }, [gps, openRides])

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
    // Abre direto a aba "Meu veículo" do painel do motorista
    const goToAddVehicle = () => { startNavProgress(); router.push('/painel-motorista?aba=veiculo') }
    // Só entra direto na corrida com o modo motorista ativado — senão manda
    // pro painel pra ativar primeiro (mesmo card, mesmo destino do botão).
    // Clicou numa corrida específica: vai pra /aceitar-corridas e cai no card dela.
    const goToRide = (rideId: string, tab?: 'candidatos') => {
        startNavProgress()
        router.push(`/aceitar-corridas?ride=${rideId}${tab ? `&tab=${tab}` : ''}`)
    }
    const goToCorridas = () => {
        startNavProgress()
        router.push(driverModeActive ? '/aceitar-corridas' : '/painel-motorista')
    }

    return (
        <section>
            <HomeGlassCard className="p-6 relative">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {dragHandle && <div>{dragHandle}</div>}

                        {/* Carro, moto e bicicleta: qualquer um pode ser motorista */}
                        <div className="flex -space-x-2.5 flex-shrink-0">
                            {[Car, Motorbike, Bike].map((VehicleIcon, i) => (
                                <div
                                    key={i}
                                    className="w-11 h-11 rounded-full flex items-center justify-center"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 12px #f9731640`,
                                        border: `2px solid ${colors.surface}`,
                                    }}
                                >
                                    <VehicleIcon size={20} />
                                </div>
                            ))}
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
                            {driverModeActive ? (
                                <>
                                    <button
                                        onClick={goToAddVehicle}
                                        className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap hover:scale-105 active:scale-95 flex-1 sm:flex-none min-w-0"
                                        style={buttonStyle}
                                    >
                                        <Plus size={16} className="flex-shrink-0" />
                                        adicionar veículo
                                    </button>

                                    <button
                                        onClick={goToCorridas}
                                        className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 rounded-full font-bold text-xs sm:text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95 flex-1 sm:flex-none min-w-0"
                                        style={buttonStyle}
                                    >
                                        <Car size={16} className="flex-shrink-0" />
                                        ver corridas
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={goToPainel}
                                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95"
                                    style={buttonStyle}
                                >
                                    <Settings2 size={16} />
                                    Ativar modo motorista
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {acceptedRide && (
                    <div
                        onClick={goToCorridas}
                        className="w-full mt-4 p-3 rounded-2xl text-left transition-all hover:scale-[1.01] cursor-pointer"
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

                        <div onClick={(e) => e.stopPropagation()} className="mt-2">
                            <RideChat rideId={acceptedRide.id} quickReplies={DRIVER_CHAT_QUICK_REPLIES} />
                        </div>
                    </div>
                )}

                {myCandidacies.length > 0 && (
                    <div className="flex flex-col gap-2 mt-4">
                        {myCandidacies.map((ride) => (
                            <button
                                key={ride.id}
                                onClick={() => goToRide(ride.id, 'candidatos')}
                                className="w-full p-3 rounded-2xl text-left transition-all hover:scale-[1.01]"
                                style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                            >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <span
                                        className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                                        style={{ background: '#eab30815', color: '#eab308' }}
                                    >
                                        Aguardando decisão
                                    </span>
                                    {ride.proposedPrice != null && (
                                        <span className="text-xs font-black flex-shrink-0" style={{ color: '#f97316' }}>
                                            R$ {ride.proposedPrice.toFixed(2)}
                                        </span>
                                    )}
                                </div>

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
                                </div>

                                <div className="flex items-start gap-1.5 text-[11px] mb-1" style={{ color: colors.textSecondary }}>
                                    <MapPin size={11} className="flex-shrink-0 mt-0.5" />
                                    <span>{shortAddress(ride.origin_address)} → {shortAddress(ride.destination_address)}</span>
                                </div>

                                {ride.duration_min != null && (
                                    <div className="flex items-center gap-1 opacity-50">
                                        <Clock size={10} style={{ color: colors.textPrimary }} />
                                        <span className="text-[10px]" style={{ color: colors.textPrimary }}>
                                            chegada em {Math.round(ride.duration_min)} min
                                            {ride.distance_km != null && ` · ${ride.distance_km.toFixed(1)} km`}
                                        </span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {openRides.length > 0 && (
                    <div className="flex items-center justify-between gap-2 mt-4 mb-2">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: driverModeActive ? '#22c55e' : colors.textSecondary }} />
                            <span className="text-xs font-black" style={{ color: colors.textPrimary }}>
                                {driverModeActive ? 'Modo motorista ativo' : 'Corridas disponíveis'}
                            </span>
                        </div>
                        <span
                            className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full text-white whitespace-nowrap"
                            style={{ background: GRADIENT }}
                        >
                            {openRidesTotal} {openRidesTotal === 1 ? 'corrida' : 'corridas'}
                        </span>
                    </div>
                )}

                {/* Por que pedimos a localização: a Tarifa iUser soma o deslocamento até a partida */}
                {needsLocation && gpsStatus !== 'granted' && (
                    <div className="rounded-2xl p-3 flex items-start gap-3 mb-3" style={{ background: '#f9731612', border: '1px solid #f9731640' }}>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                            {gpsStatus === 'asking' || gpsStatus === 'idle' ? <Spinner size={16} color="#fff" /> : <LocateFixed size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-black" style={{ color: colors.textPrimary }}>
                                {gpsStatus === 'asking' || gpsStatus === 'idle' ? 'Localizando você...' : 'Precisamos da sua localização'}
                            </p>
                            <p className="text-[11px] mt-0.5 leading-snug" style={{ color: colors.textSecondary }}>
                                Para mostrar quanto você pode ganhar: somamos à Tarifa iUser a distância até o ponto de partida, pra você não perder dinheiro rodando até o passageiro.
                            </p>
                            {gpsStatus !== 'asking' && gpsStatus !== 'idle' && (
                                <button onClick={requestGps} className="mt-2 px-3.5 py-1.5 rounded-full text-[11px] font-black" style={{ background: GRADIENT, color: '#fff' }}>
                                    Permitir localização
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {openRides.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {openRides.map(({ ride, requester, suggestedPrice, usesPlatformTariff }) => {
                            const platformShape = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[kindForRideType(ride.vehicle_type)]
                            const pickup = usesPlatformTariff && gpsStatus === 'granted' ? pickupById[ride.id] : undefined
                            const pickupKm = pickup?.km
                            const pickupAmount = pickup ? computePickupFee(platformShape, pickup.km, pickup.min) : 0
                            const total = suggestedPrice + pickupAmount
                            const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
                            return (
                            <div
                                key={ride.id}
                                className="rounded-2xl p-3.5"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                            >
                                <RideOfferCard
                                    compact
                                    ride={ride}
                                    requester={requester}
                                    storeName={null}
                                    toPickup={{ km: null, min: null, hasGps: true }}
                                    trip={{ km: ride.distance_km, min: ride.duration_min }}
                                    footer={
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-end justify-between gap-3 rounded-xl px-3 py-2" style={{ background: '#22c55e14', border: '1px solid #22c55e40' }}>
                                                <div>
                                                    <span className="block text-[10px] font-semibold" style={{ color: colors.textSecondary }}>Você pode ganhar</span>
                                                    <span className="block text-xl font-black leading-tight" style={{ color: '#16a34a' }}>{brl(total)}</span>
                                                </div>
                                                {usesPlatformTariff && (
                                                    <span className="text-[10px] leading-tight text-right font-semibold" style={{ color: pickupKm != null ? '#16a34a' : '#d97706' }}>
                                                        {pickupKm != null
                                                            ? `inclui ${brl(pickupAmount)} · ${pickupKm.toFixed(1).replace('.', ',')} km até a partida`
                                                            : gpsStatus === 'asking' || gpsStatus === 'idle'
                                                                ? 'Localizando... falta somar a distância até a partida'
                                                                : 'falta somar a distância até a partida'}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => goToRide(ride.id)}
                                                className="w-full py-3 rounded-full text-sm font-black flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
                                                style={{ background: GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
                                            >
                                                Ver corrida
                                                <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    }
                                />
                            </div>
                            )
                        })}

                        {openRidesTotal > openRides.length && (
                            <button
                                onClick={() => { startNavProgress(); router.push('/aceitar-corridas') }}
                                className="w-full py-2.5 rounded-full text-xs font-black transition-all hover:scale-[1.02] active:scale-95"
                                style={{ background: `${colors.accent}15`, color: colors.accent, border: `1px solid ${colors.border}` }}
                            >
                                Ver todas as {openRidesTotal} corridas
                            </button>
                        )}
                    </div>
                )}
            </HomeGlassCard>
        </section>
    )
}
