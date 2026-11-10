// src/app/(main)/inicio/sections/AcceptARider.tsx
'use client'

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { Car, Settings2, CheckCircle2, Navigation, MapPin, Users, Package, PawPrint, Clock, ArrowRight, LocateFixed, Plus } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { computeSuggestedPrice, computeConditionExtras, computeHourlyEarnings, computePickupFee, computeRideExtras, describeTripFare, getEffectivePricing, getCustomPricing, PLATFORM_DEFAULT_PRICING_BY_VEHICLE, type DriverPricing, type RideConditionFlags } from '@/lib/driverPricing'
import { perHour as perHourOfMinutes } from '@/modules/negotiation/domain'
import { rideQuote } from '@/lib/rideQuote'
import { useRideMinimum } from '@/hooks/useRideMinimum'
import { loadEarningGoal } from '@/modules/negotiation'
import { kindForRideType, rideAcceptsAnyVehicle, ridesAcceptableForVehicleKind, type VehicleKind } from '@/lib/rideVehicle'
import { fetchRoute, haversineKm } from '@/lib/mapboxRoute'
import { watchPosition } from '@/lib/nativeGeolocation'
import { Spinner } from '@/components/Spinner'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import RideChat from '@/components/RideChat'
import { DRIVER_CHAT_QUICK_REPLIES } from '@/lib/rideChatQuickReplies'
import { ViewServicesButton } from './ViewServicesButton'
import { useMyVehicles } from '@/lib/vehicleHeaderTabs'
import { RideOfferCard, type OfferRide, type OfferRequester } from '@/components/AceitarCorridas/RideOfferCard'
import { RideSummaryCard } from '@/components/AceitarCorridas/RideSummaryCard'
import { rideValuation, valuationRank } from '@/modules/negotiation/domain'
import RideMiniMap from '@/app/(main)/aceitar-corridas/RideMiniMap'
import LocationAskDialog, { isGeoPermissionGranted, rememberLocationAskDismissed, wasLocationAskDismissed } from '@/components/AceitarCorridas/LocationAskDialog'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import LocationPicker from '@/components/LocationPicker'
import { saveOwnProfile } from '@/lib/saveOwnProfile'
import { toast } from '@/lib/toast'
import Outdoor from '@/components/outdoor/Outdoor'

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
    /** Tarifa iUser e tarifa própria do motorista para o veículo desta corrida, e as condições dela: entram na MESMA conta de /aceitar-corridas (lib/rideQuote) */
    platformShape: DriverPricing
    customShape: DriverPricing | null
    useCustom: boolean
    flags: RideConditionFlags
    destination: [number, number] | null
    // Ponto de partida (pra medir a distância do motorista até ele) e se o valor
    // é a Tarifa iUser — só ela soma o deslocamento até o passageiro.
    origin: [number, number] | null
    usesPlatformTariff: boolean
}

interface CandidacyPreview {
    id: string
    ride_type: 'pessoa' | 'objeto' | 'animal'
    requesterId?: string
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
    /** As corridas disponíveis numa FILEIRA horizontal (rola para o lado) em vez de uma embaixo da outra: ocupa menos altura na home (usado na 3.0) */
    horizontal?: boolean
    /** dentro da página /canal-do-motorista: o título já está no cabeçalho da página */
    embedded?: boolean
}

export default function AcceptARider({ dragHandle, onUrgentChange, horizontal = false, embedded = false }: AcceptARiderProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { userId: contextUserId, loading: profileLoading } = useProfile()
    const { vehicles: myVehicles, loaded: vehiclesLoaded } = useMyVehicles(contextUserId)
    const hasVehicle = vehiclesLoaded && myVehicles.length > 0
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
    // Sem GPS liberado vale o local salvo em "Definir local": o deslocamento até a partida entra na conta mesmo assim
    const [savedPos, setSavedPos] = useState<[number, number] | null>(null)
    // "Digitar o local" (pelo diálogo): o mesmo "Definir local" de /aceitar-corridas, salvo no perfil
    const [typingLocation, setTypingLocation] = useState(false)
    const saveTypedLocation = async (l: { lat: number; lng: number; address: string; addressNumber?: string; addressComplement?: string }) => {
        if (!contextUserId) return
        const { error } = await saveOwnProfile(supabase, contextUserId, { address: l.address, address_number: l.addressNumber || null, address_complement: l.addressComplement || null, store_lat: l.lat, store_lng: l.lng })
        if (error) { toast.error('Não deu para salvar o local', { description: error.message }); return }
        setSavedPos([l.lng, l.lat])
        setTypingLocation(false)
        toast.success('Local salvo', { description: 'Os valores das corridas agora contam a partir dele. Troque quando sair de lá.' })
    }
    const [livePos, setLivePos] = useState<[number, number] | null>(null)
    const fallbackPos = livePos ?? savedPos
    const pos = gps ?? fallbackPos
    const [pickupById, setPickupById] = useState<Record<string, { km: number; min: number }>>({})
    // a corrida em si (partida → chegada) pela rota do mapa: o valor usa este km, igual a /aceitar-corridas
    const [tripById, setTripById] = useState<Record<string, { km: number; min: number }>>({})
    const [minHourly, setMinHourly] = useState<number | null>(null)
    const minPerMinute = useRideMinimum()
    useEffect(() => { if (contextUserId) void loadEarningGoal(contextUserId).then((g) => setMinHourly(g.minHourly)).catch(() => {}) }, [contextUserId])
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
            // Corridas abertas só para quem está logado (visitante não lê nada: ride_offers não é público)
            if (!userId) {
                setOpenRides([])
                setOpenRidesTotal(0)
                return
            }
            await loadPlatformTariffs(supabase)
            if (userId) {
                const { data: me } = await supabase.from('my_profile').select('store_lat, store_lng').eq('id', userId).maybeSingle()
                if (active) setSavedPos(me?.store_lat != null && me?.store_lng != null ? [Number(me.store_lng), Number(me.store_lat)] : null)
            }
            // Visitante (sem login) também vê as corridas abertas: assim ele sabe que
            // tem corrida pra pegar. Sem conta não tem driver_pricing nem candidatura
            // própria, então vale a tarifa iUser e nada é filtrado por "já me candidatei".
            let pricingRow: { pricing_mode: any; base_distance_km: any; base_fee: any; price_per_km_after_base: any; price_per_minute?: any } | null = null
            let appliedIds = new Set<string>()
            // Mesma regra do quadro de /aceitar-corridas: só as corridas do veículo que a pessoa tem cadastrado (carro não vê entrega de moto).
            // Sem veículo cadastrado, qualquer tipo.
            const { data: vehicleRows } = await supabase.from('driver_vehicles').select('vehicle_kind').eq('driver_id', userId)
            const myKinds = (vehicleRows || []).map((v) => v.vehicle_kind as VehicleKind)
            const acceptableTypes = new Set<string>(myKinds.length > 0 ? myKinds.flatMap((k) => ridesAcceptableForVehicleKind(k)) : ['carro', 'van', 'van-grande', 'moto', 'bicicleta', 'qualquer'])
            if (userId) {
                // As corridas aparecem mesmo sem o modo motorista ativado (e sem tarifa
                // cadastrada ainda): quem não tem driver_pricing vê o valor pela tarifa iUser.
                const { data } = await supabase
                    .from('driver_pricing')
                    .select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, price_per_minute, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado, driver_mode_active, live_lat, live_lng')
                    .eq('driver_id', userId)
                    .maybeSingle()
                pricingRow = data
                // Mesma regra da lista de corridas: com o Modo motorista ligado vale a última posição ao vivo; senão, o local salvo
                if (data?.driver_mode_active && data.live_lat != null && data.live_lng != null && active) setLivePos([Number(data.live_lng), Number(data.live_lat)])

                const { data: myApplicationRows } = await supabase
                    .from('ride_applications')
                    .select('ride_request_id')
                    .eq('applicant_id', userId)
                    .eq('status', 'pending')
                appliedIds = new Set((myApplicationRows || []).map((a) => a.ride_request_id))
            }
            if (!active) return
            const pricing = pricingRow || { pricing_mode: 'platform' as const, base_distance_km: null, base_fee: null, price_per_km_after_base: null }

            let openQuery = supabase
                .from('ride_offers')
                .select('id, requester_id, ride_type, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, origin_complement, destination_complement, notes, passenger_count, vehicle_type, object_description, object_is_sensitive, pet_description, has_child, children_count, child_age, child_needs_car_seat, has_shopping, bag_count, has_extra_object, extra_object_description, has_pet, pet_weight_range, pet_has_carrier, has_special_needs, special_needs_description, special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog, delivery_location, payment_method, cash_change_for, card_is_contactless, origin_needs_access, origin_access_notes, destination_needs_access, destination_access_notes, grocery_bag_size, wants_air_conditioning, distance_km, duration_min, scheduled_for, created_at, offered_price, passenger_offer, order_id, applicant_count, stop1_address, stop2_address, stop1_lat, stop1_lng, stop2_lat, stop2_lng')
                .eq('status', 'pending')
            const { data: rows } = await openQuery
                .order('created_at', { ascending: false })
                .limit(120)   // folga: o filtro do veículo descarta parte delas
            if (!active) return

            const candidateRows = (rows || []).filter((r) => !appliedIds.has(r.id) && (r.applicant_count ?? 0) < 5 && (rideAcceptsAnyVehicle(r.vehicle_type) || acceptableTypes.has(r.vehicle_type)))
            const top = candidateRows.slice(0, 3)
            setOpenRidesTotal(candidateRows.length)

            const requesterIds = Array.from(new Set(top.map((r) => r.requester_id).filter(Boolean))) as string[]
            const { data: profiles } = requesterIds.length > 0
                ? await supabase.from('profiles').select('id, name, profileSlug, avatar_url').in('id', requesterIds)
                : { data: [] as { id: string; name: string | null; profileSlug: string | null; avatar_url: string | null }[] }
            if (!active) return
            const profilesById = new Map((profiles || []).map((p) => [p.id, p]))

            setOpenRides(
                top.map((r) => {
                    const rideKind = kindForRideType(r.vehicle_type)
                    const pricingShape = getEffectivePricing(pricing, rideKind)
                    const customShape = getCustomPricing(pricing as any, rideKind)
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
                        ? computeSuggestedPrice(r.distance_km, pricingShape, r.ride_type, conditionFlags)
                        : pricingShape.baseFee
                            + pricingShape.extraFees[r.ride_type as 'pessoa' | 'animal' | 'objeto']
                            + computeConditionExtras(conditionFlags, pricingShape.conditionExtraFees)
                    return {
                        ride: r as unknown as OfferRide,
                        requester: {
                            id: r.requester_id as string,
                            name: p?.name || (r.requester_id ? null : 'Passageiro'),
                            slug: p?.profileSlug || null,
                            avatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                            rating: { avg: 0, count: 0 },
                        },
                        // Frete de loja já vem com valor fechado; o resto sai da tarifa
                        suggestedPrice: r.offered_price != null ? Number(r.offered_price) : computedPrice,
                        platformShape: PLATFORM_DEFAULT_PRICING_BY_VEHICLE[rideKind],
                        customShape,
                        useCustom: pricing.pricing_mode === 'custom',
                        flags: conditionFlags,
                        destination: r.destination_lat != null && r.destination_lng != null ? [r.destination_lng, r.destination_lat] as [number, number] : null,
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
                .from('ride_offers')
                .select('id, requester_id, ride_type, origin_address, destination_address, distance_km, duration_min, passenger_count, object_description, pet_description')
                .in('id', rideIds)
            if (!active) return
            const ridesById = new Map((rides || []).map((r) => [r.id, r]))

            const requesterIds = Array.from(new Set((rides || []).map((r) => r.requester_id).filter(Boolean))) as string[]
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
                    requesterId: r.requester_id as string,
                    requesterName: p?.name || 'Passageiro',
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
    // (o deslocamento até o passageiro também entra no ganho por hora, qualquer que seja a tarifa)
    const needsLocation = openRides.length > 0
    // Com permissão já dada busca em silêncio; sem ela, quem pergunta é o diálogo (LocationAskDialog)
    const [locAskDismissed, setLocAskDismissed] = useState(false)
    useEffect(() => {
        setLocAskDismissed(wasLocationAskDismissed())
        if (needsLocation && gpsStatus === 'idle') void isGeoPermissionGranted().then((ok) => { if (ok) requestGps() })
    }, [needsLocation, gpsStatus, requestGps])

    // A rota de cada corrida (partida → chegada), uma vez
    useEffect(() => {
        openRides.forEach(({ ride, origin, destination }) => {
            if (!origin || !destination || tripById[ride.id]) return
            fetchRoute(origin, destination).then((route) => setTripById((prev) => ({ ...prev, [ride.id]: { km: route.distanceKm, min: route.durationMin } }))).catch(() => {})
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openRides])

    // Km de estrada do motorista até a partida de cada corrida (recalcula se ele andou +300 m)
    useEffect(() => {
        if (!pos || openRides.length === 0) return
        const key = openRides.map((r) => r.ride.id).join(',')
        const last = lastRouteRef.current
        if (last && last.key === key && haversineKm(last.coords, pos) < 0.3) return
        lastRouteRef.current = { coords: pos, key }
        openRides.forEach(({ ride, origin }) => {
            if (!origin) return
            fetchRoute(pos, origin).then((route) => {
                setPickupById((prev) => ({ ...prev, [ride.id]: { km: route.distanceKm, min: route.durationMin } }))
            })
        })
    }, [pos, openRides])

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
            {/* Mesmo desenho de "Produtos em destaque" / Motorista Particular: título e frase, sem card em volta */}
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    {dragHandle}
                    {!embedded && <div className="min-w-0">
                        <h2 className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>Canal do Motorista</h2>
                        <p className="text-xs opacity-60" style={{ color: colors.textPrimary }}>Defina sua tarifa e aceite corridas disponíveis</p>
                    </div>}
                </div>
                {!driverModeActive && (
                    <ViewServicesButton label="Ativar modo motorista" onClick={goToPainel} />
                )}
            </div>

            {/* Outdoor Motoristas: os mais bem pontuados (corridas, entregas e notas); some se ninguém pontuou */}
            <Outdoor kind="motoristas" className="mb-4" />

            {driverModeActive && (
                <div className="flex gap-2 mb-4">
                    {/* Sem veículo cadastrado: convida a adicionar; com veículo: vai pro painel */}
                    <button
                        onClick={hasVehicle ? goToPainel : goToAddVehicle}
                        className="flex-1 flex items-center justify-center py-2 rounded-full font-black text-xs transition-all hover:scale-[1.02] active:scale-95 whitespace-nowrap"
                        style={{ background: 'transparent', color: colors.accent, border: `2px solid ${colors.accent}` }}
                    >
                        {hasVehicle ? 'painel do motorista' : 'adicionar veículo'}
                    </button>
                    <ViewServicesButton label="ver corridas" onClick={goToCorridas} />
                </div>
            )}

                {acceptedRide && (
                    <div
                        onClick={goToCorridas}
                        className="w-full mb-4 p-3 rounded-2xl text-left transition-all hover:scale-[1.01] cursor-pointer"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
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
                    <div className="flex flex-col gap-2 mb-4">
                        {myCandidacies.map((ride) => (
                            <button
                                key={ride.id}
                                onClick={() => goToRide(ride.id, 'candidatos')}
                                className="w-full p-3 rounded-2xl text-left transition-all hover:scale-[1.01]"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
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
                                    <PlanAvatarRing userId={ride.requesterId}>
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
                                    </PlanAvatarRing>
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

                <LocationAskDialog
                    open={needsLocation && gpsStatus !== 'granted' && !fallbackPos && !locAskDismissed}
                    status={gpsStatus === 'granted' ? 'idle' : gpsStatus}
                    onAllow={requestGps}
                    onLater={() => { rememberLocationAskDismissed(); setLocAskDismissed(true) }}
                    onType={contextUserId ? () => { rememberLocationAskDismissed(); setLocAskDismissed(true); setTypingLocation(true) } : undefined}
                />
                {/* em portal: um ancestral com desfoque prenderia o position:fixed do LocationPicker dentro da seção */}
                {typingLocation && typeof document !== 'undefined' && createPortal(<LocationPicker initialLocation={null} onSave={saveTypedLocation} onClose={() => setTypingLocation(false)} />, document.body)}

                {openRides.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {/* `horizontal`: os cartões numa fileira que rola para o lado (sangra até a borda: -mx-4 px-4) em vez de empilhar; `contents` mantém a coluna de sempre */}
                        <div className={horizontal ? 'flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 pb-1 items-start scroll-pl-4 scroll-pr-4' : 'contents'} style={horizontal ? { WebkitOverflowScrolling: 'touch' } : undefined}>
                        {openRides.map(({ ride, requester, platformShape, customShape, useCustom, flags }) => {
                            // O valor sai da MESMA conta de /aceitar-corridas (lib/rideQuote): rota do mapa, deslocamento, tarifa própria e piso por hora
                            const route = pos ? pickupById[ride.id] : undefined
                            const trip = tripById[ride.id]
                            const rideType = (ride as unknown as { ride_type: 'pessoa' | 'animal' | 'objeto' }).ride_type
                            const q = rideQuote<DriverPricing>({
                                offeredPrice: ride.offered_price != null ? Number(ride.offered_price) : null,
                                distanceKm: ride.distance_km, routeKm: trip?.km ?? null,
                                platformShape, customShape, useCustom,
                                pickupKm: route?.km ?? null, pickupMin: route?.min ?? null,
                                tripMin: trip?.min ?? ride.duration_min ?? (ride.distance_km != null ? (ride.distance_km / 40) * 60 : null),
                                minHourly: ride.offered_price != null ? null : minHourly,
                                minPerMinute,
                                tripFare: (shape, km) => km != null
                                    ? computeSuggestedPrice(km, shape, rideType, flags)
                                    : shape.baseFee + shape.extraFees[rideType] + computeConditionExtras(flags, shape.conditionExtraFees),
                                pickupFee: (shape, km) => computePickupFee(shape, km),
                            })
                            const usesPlatformTariff = q.shownKind === 'platform'
                            // Deslocamento até a partida: só a Tarifa iUser soma (igual a /aceitar-corridas)
                            const pickup: React.ComponentProps<typeof RideOfferCard>['pickup'] = usesPlatformTariff
                                ? (route ? { state: 'ready', km: route.km, amount: computePickupFee(platformShape, route.km), from: gps ? 'gps' : 'saved' } : { state: gpsStatus === 'asking' || gpsStatus === 'idle' ? 'waiting' : 'missing' })
                                : undefined
                            const tripFare = (shape: DriverPricing, km: number | null) => km != null
                                ? computeSuggestedPrice(km, shape, rideType, flags)
                                : shape.baseFee + shape.extraFees[rideType] + computeConditionExtras(flags, shape.conditionExtraFees)
                            const stops: { lat: number; lng: number }[] = []
                            const rr = ride as unknown as { stop1_lat: number | null; stop1_lng: number | null; stop2_lat: number | null; stop2_lng: number | null }
                            if (rr.stop1_lat != null && rr.stop1_lng != null) stops.push({ lat: rr.stop1_lat, lng: rr.stop1_lng })
                            if (rr.stop2_lat != null && rr.stop2_lng != null) stops.push({ lat: rr.stop2_lat, lng: rr.stop2_lng })
                            const rr2 = ride as unknown as { origin_lat: number | null; origin_lng: number | null; destination_lat: number | null; destination_lng: number | null }
                            const hasCoords = requester && rr2.origin_lat != null && rr2.destination_lat != null
                            const fromPassenger = ride.offered_price == null && ride.passenger_offer != null
                            const price = fromPassenger ? Number(ride.passenger_offer) : q.shown
                            const valuation = rideValuation(fromPassenger && !ride.order_id ? price : null, q.platform)
                            // O card completo (só leitura) vive no "Detalhes"; o botão de candidatar é o do card enxuto
                            const details = (
                                <RideOfferCard
                                    viewOnly
                                    ride={ride}
                                    requester={requester}
                                    storeName={null}
                                    platformPrice={q.platform}
                                    pickup={pickup}
                                    tripFareNote={usesPlatformTariff && !route && q.tripKm != null ? describeTripFare(q.tripKm, platformShape) : undefined}
                                    customPrice={customShape ? tripFare(customShape, q.tripKm) : null}
                                    customPickup={ride.offered_price == null && customShape && route ? computePickupFee(customShape, route.km) : 0}
                                    valueFromOwn={useCustom}
                                    timeRate={customShape?.pricePerMinute ?? null}
                                    timeExtras={computeRideExtras(rideType, flags, customShape ?? platformShape)}
                                    onApply={() => goToRide(ride.id)}
                                    minHourly={ride.offered_price != null ? null : minHourly}
                                    minPerMinute={ride.offered_price != null ? 0 : minPerMinute}
                                    onEditTariff={ride.offered_price != null ? undefined : (section) => { startNavProgress(); router.push(`/painel-motorista?aba=plano&veiculo=${kindForRideType(ride.vehicle_type)}&modo=personalizada&secao=${section ?? 'km'}`) }}
                                    toPickup={{ km: route?.km ?? null, min: route?.min ?? null, hasGps: pos != null }}
                                    trip={{ km: q.tripKm, min: trip?.min ?? ride.duration_min }}
                                    miniMap={hasCoords ? (
                                        <RideMiniMap
                                            compact
                                            transition={false}
                                            originLat={rr2.origin_lat as number}
                                            originLng={rr2.origin_lng as number}
                                            destLat={rr2.destination_lat as number}
                                            destLng={rr2.destination_lng as number}
                                            stops={stops}
                                            driverLat={pos ? pos[1] : null}
                                            driverLng={pos ? pos[0] : null}
                                            onExpand={() => { startNavProgress(); router.push(`/aceitar-corridas/mapa?ride=${ride.id}`) }}
                                        />
                                    ) : null}
                                />
                            )
                            return {
                                rank: valuationRank(valuation.tier),
                                node: (
                                    <RideSummaryCard
                                        key={ride.id}
                                        ride={ride}
                                        requester={requester}
                                        price={price}
                                        approx={!fromPassenger && q.shownKind === 'platform' && pickup?.state !== 'ready'}
                                        reference={q.platform}
                                        fromPassenger={fromPassenger}
                                        totalMin={q.minutes}
                                        toPickup={{ km: route?.km ?? null, min: route?.min ?? null, hasGps: pos != null }}
                                        trip={{ km: q.tripKm, min: trip?.min ?? ride.duration_min }}
                                        thumb={hasCoords ? (
                                            <RideMiniMap thumb originLat={rr2.origin_lat as number} originLng={rr2.origin_lng as number} destLat={rr2.destination_lat as number} destLng={rr2.destination_lng as number} stops={stops} driverLat={pos ? pos[1] : null} driverLng={pos ? pos[0] : null} />
                                        ) : undefined}
                                        onOpen={() => goToRide(ride.id)}
                                        details={details}
                                    />
                                ),
                            }
                        }).sort((a, b) => b.rank - a.rank).map((c) => horizontal
                            ? <div key={String(c.node.key)} className="flex-shrink-0 snap-start w-[min(86vw,340px)]">{c.node}</div>
                            : c.node)}
                        </div>

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
        </section>
    )
}
