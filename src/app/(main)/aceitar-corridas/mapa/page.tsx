// app/(main)/aceitar-corridas/mapa/page.tsx
//
// Navegação em tela cheia do motorista — pra onde o app leva sozinho
// assim que uma corrida é aceita (ver o redirecionamento em
// ../page.tsx). Mostra sempre "de onde eu tô até o próximo ponto"
// (primeiro até a partida, depois até o destino/próxima parada), com
// modo centralizar/movimentar, e os botões de ação da corrida por cima
// do mapa. Os handlers de ação e o cálculo de fase de voz aqui são os
// mesmos de ../page.tsx (duplicados, não extraídos pra hook
// compartilhado, pra não mexer numa lógica já delicada e testada lá).
//
// Com ?ride=<id> vira uma PRÉVIA de uma corrida ainda disponível (não
// aceita): mostra o percurso da posição do motorista até a partida e dali
// até o destino final, sem botões de ação — pra decidir se candidatar.
//
// Layout igual ao /pedir-motorista: o mapa ocupa o espaço que sobra em
// cima e o card vive embaixo, na mesma tela, em vez de flutuar por cima
// e tampar o mapa.
'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ArrowLeft, MessageCircle, LocateFixed, Navigation, MapPin, Flag, Ban, Route } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { getCurrentPosition as getNativeCurrentPosition, watchPosition as watchNativePosition } from '@/lib/nativeGeolocation'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { fetchRoute, haversineKm } from '@/lib/mapboxRoute'
import { vehicleMarkerHtml } from '@/lib/vehicleMarkerIcon'
import { shortAddress } from '@/lib/serviceBoard'
import { notifyRideStatus } from '@/lib/notifyRideStatus'
import { useVoiceNavigation } from '@/lib/voiceNavigation'
import RideChat from '@/components/RideChat'
import { DRIVER_CHAT_QUICK_REPLIES } from '@/lib/rideChatQuickReplies'
import { kindForRideType, type VehicleType, type VehicleKind } from '@/lib/rideVehicle'
import { PLATFORM_DEFAULT_PRICING_BY_VEHICLE } from '@/lib/driverPricing'
import { computeRideTariffs } from '@/lib/rideTariffs'
import { submitRideApplication } from '@/lib/rideApplication'
import { getAvatarUrl } from '@/lib/avatar'
import { getProfileRideRatingsBatch } from '@/lib/rideReviews'
import { MAP_TRANSITION_KEY } from '../RideMiniMap'
import { VehicleRequiredDialog } from '@/components/VehicleRequiredDialog'
import { RideOfferCard, type OfferRide, type OfferRequester } from '@/components/AceitarCorridas/RideOfferCard'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const TO_TARGET_COLOR = '#3b82f6' // azul: de você até o próximo ponto
const TRIP_PREVIEW_COLOR = '#ef4444' // vermelho: percurso partida → chegada, antes de iniciar
const STOP_COLOR = '#eab308'
const FINISH_RADIUS_METERS = 100
const REFRESH_INTERVAL_MS = 15000

// Ícone do marcador "Você": o veículo cadastrado que serve essa corrida
// (mesma regra de ../page.tsx — moto/bicicleta são exclusivos, "qualquer"
// usa o que o motorista tem, na ordem carro > moto > bicicleta).
function vehicleIconForRide(rideVehicleType: VehicleType, myKinds: VehicleKind[]): VehicleKind {
    if (rideVehicleType === 'moto' || rideVehicleType === 'bicicleta') return rideVehicleType
    if (rideVehicleType === 'qualquer') {
        return (['carro', 'moto', 'bicicleta'] as const).find((k) => myKinds.includes(k)) || 'carro'
    }
    return 'carro'
}

function marker(color: string, label?: string): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
    el.innerHTML = `
        ${label ? `<div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${label}</div>` : ''}
        <div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
    `
    return el
}

function driverMarkerElement(kind: VehicleKind): HTMLDivElement {
    const el = document.createElement('div')
    el.innerHTML = vehicleMarkerHtml(kind, TO_TARGET_COLOR, 'Você')
    return el
}

// ===== BEARING (rotação do mapa na direção do movimento) =====
// GPS puro é barulhento: duas posições muito próximas dão um ângulo
// quase aleatório. MIN_BEARING_MOVEMENT_METERS ignora atualizações onde
// a pessoa andou de menos (parada num sinal, GPS "tremendo" no lugar), e
// BEARING_SMOOTHING_ALPHA suaviza o ângulo novo contra o anterior (média
// circular via vetores — soma direto não funciona perto da virada 360°→0°).
const MIN_BEARING_MOVEMENT_METERS = 8
const BEARING_SMOOTHING_ALPHA = 0.3

function toDeg(rad: number): number {
    return ((rad * 180) / Math.PI + 360) % 360
}

function computeBearing(from: [number, number], to: [number, number]): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const lat1 = toRad(from[1])
    const lat2 = toRad(to[1])
    const dLng = toRad(to[0] - from[0])
    const y = Math.sin(dLng) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
    return toDeg(Math.atan2(y, x))
}

function smoothBearing(prev: number | null, raw: number, alpha: number): number {
    if (prev == null) return raw
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const x = (1 - alpha) * Math.cos(toRad(prev)) + alpha * Math.cos(toRad(raw))
    const y = (1 - alpha) * Math.sin(toRad(prev)) + alpha * Math.sin(toRad(raw))
    return toDeg(Math.atan2(y, x))
}

// Mesmo cuidado de ../RideMapDialog.tsx: sem transition CSS fixa (o
// mapbox-gl já reprojeta o marcador sozinho ao arrastar o mapa) — o
// deslize suave só entra quando ESTE código chama setLngLat, numa
// posição de GPS nova de verdade.
function animateMarkerTo(m: mapboxgl.Marker, to: [number, number], duration = 700) {
    const from = m.getLngLat()
    if (from.lng === to[0] && from.lat === to[1]) return
    const start = performance.now()
    const startLng = from.lng
    const startLat = from.lat
    const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        m.setLngLat([startLng + (to[0] - startLng) * t, startLat + (to[1] - startLat) * t])
        if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
}

interface AcceptedRideMapDetail {
    id: string
    vehicle_type: VehicleType
    origin_address: string
    destination_address: string
    origin_lat: number | null
    origin_lng: number | null
    destination_lat: number | null
    destination_lng: number | null
    stop1_address: string | null
    stop1_lat: number | null
    stop1_lng: number | null
    stop1_reached_at: string | null
    stop2_address: string | null
    stop2_lat: number | null
    stop2_lng: number | null
    stop2_reached_at: string | null
    driver_en_route: boolean
    driver_arrived_at: string | null
    ride_started_at: string | null
    distance_km: number | null
    duration_min: number | null
}

const ACCEPTED_RIDE_SELECT = 'id, vehicle_type, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, stop1_address, stop1_lat, stop1_lng, stop1_reached_at, stop2_address, stop2_lat, stop2_lng, stop2_reached_at, driver_en_route, driver_arrived_at, ride_started_at, distance_km, duration_min'

// Mesmas colunas do card de /aceitar-corridas (quem pediu, o que leva, pagamento...).
const OFFER_SELECT = 'id, requester_id, ride_type, origin_address, destination_address, origin_complement, destination_complement, notes, passenger_count, vehicle_type, object_description, object_is_sensitive, pet_description, has_child, children_count, child_age, child_needs_car_seat, has_shopping, bag_count, has_extra_object, extra_object_description, has_pet, pet_weight_range, pet_has_carrier, has_special_needs, special_needs_description, special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog, delivery_location, payment_method, cash_change_for, card_is_contactless, origin_needs_access, origin_access_notes, destination_needs_access, destination_access_notes, grocery_bag_size, wants_air_conditioning, distance_km, duration_min, scheduled_for, created_at, stop1_address, stop2_address, offered_price, order_id, store_id'

interface OfferData {
    ride: OfferRide
    requester: OfferRequester
    storeName: string | null
    platformPrice: number
    customPrice: number | null
}

const SHEET_MIN_VH = 22
const SHEET_MAX_VH = 60
const SHEET_PADDING_PX = 36

export default function AceitarCorridasMapaPage() {
    return (
        <Suspense fallback={null}>
            <AceitarCorridasMapaContent />
        </Suspense>
    )
}

function AceitarCorridasMapaContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const previewRideId = searchParams.get('ride')
    const isPreview = !!previewRideId
    // Volta pro card da mesma corrida em /aceitar-corridas (rola até ele e destaca).
    const backUrl = previewRideId ? `/aceitar-corridas?ride=${previewRideId}` : '/aceitar-corridas'
    const { colors } = useTheme()
    const { userId, loading: profileLoading } = useProfile()

    const containerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const driverMarkerKindRef = useRef<VehicleKind | null>(null)
    const routeReqIdRef = useRef(0)
    const followingRef = useRef(true)
    const bearingRef = useRef<number | null>(null)
    const prevBearingCoordsRef = useRef<[number, number] | null>(null)
    const fitRef = useRef<{ bounds: mapboxgl.LngLatBounds; padding: { top: number; bottom: number; left: number; right: number } } | null>(null)
    const fitStageRef = useRef<0 | 1 | 2>(0)
    const fixedMarkersRef = useRef<mapboxgl.Marker[]>([])

    const [loading, setLoading] = useState(true)
    const [showChat, setShowChat] = useState(false)
    const [mapReady, setMapReady] = useState(false)
    const [acceptedRide, setAcceptedRide] = useState<AcceptedRideMapDetail | null>(null)
    const [myVehicleKinds, setMyVehicleKinds] = useState<VehicleKind[]>(['carro'])
    const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null)
    const [following, setFollowing] = useState(!isPreview)
    const [offer, setOffer] = useState<OfferData | null>(null)
    // Vindo de "Ver no mapa" na lista: a imagem do mini mapa (que acabou de crescer
    // até a tela cheia) fica de fundo até o mapa de verdade carregar, e o card sobe.
    const [splashUrl, setSplashUrl] = useState<string | null>(null)
    const [splashGone, setSplashGone] = useState(false)
    const [sheetShown, setSheetShown] = useState(false)
    const [applying, setApplying] = useState(false)
    const [showVehicleDialog, setShowVehicleDialog] = useState(false)
    const [tripKm, setTripKm] = useState<number | null>(null)
    const [tripMin, setTripMin] = useState<number | null>(null)
    const [routeKm, setRouteKm] = useState<number | null>(null)
    const [routeMin, setRouteMin] = useState<number | null>(null)

    const [departing, setDeparting] = useState(false)
    const [arriving, setArriving] = useState(false)
    const [starting, setStarting] = useState(false)
    const [arrivingStop, setArrivingStop] = useState(false)
    const [finishing, setFinishing] = useState(false)
    const [cancelling, setCancelling] = useState(false)

    useEffect(() => { followingRef.current = following }, [following])

    useEffect(() => {
        try {
            const url = sessionStorage.getItem(MAP_TRANSITION_KEY)
            if (url) {
                setSplashUrl(url)
                sessionStorage.removeItem(MAP_TRANSITION_KEY)
            }
        } catch { /* sem storage: sem efeito */ }
    }, [])
    useEffect(() => {
        if (!loading && acceptedRide) {
            const t = setTimeout(() => setSheetShown(true), 60)
            return () => clearTimeout(t)
        }
    }, [loading, acceptedRide])
    useEffect(() => {
        if (!splashUrl || !mapReady) return
        const t = setTimeout(() => setSplashGone(true), 700)
        return () => clearTimeout(t)
    }, [splashUrl, mapReady])

    // Altura do card acompanha o conteúdo (até 60vh) — mesma regra do
    // /pedir-motorista, pra o mapa sempre sobrar com pelo menos 40% da tela.
    const [contentHeightPx, setContentHeightPx] = useState(0)
    const sheetResizeObserverRef = useRef<ResizeObserver | null>(null)
    const setSheetContentRef = useCallback((node: HTMLDivElement | null) => {
        if (sheetResizeObserverRef.current) {
            sheetResizeObserverRef.current.disconnect()
            sheetResizeObserverRef.current = null
        }
        if (!node) return
        setContentHeightPx(node.scrollHeight)
        const ro = new ResizeObserver(() => setContentHeightPx(node.scrollHeight))
        ro.observe(node)
        sheetResizeObserverRef.current = ro
    }, [])
    const sheetHeightVh = contentHeightPx > 0
        ? Math.min(SHEET_MAX_VH, Math.max(SHEET_MIN_VH, ((contentHeightPx + SHEET_PADDING_PX) / window.innerHeight) * 100))
        : SHEET_MAX_VH

    // ===== CARREGA A CORRIDA ACEITA (e os veículos, pro ícone do marcador) =====
    const load = async () => {
        if (!userId) return
        const rideQuery = isPreview
            ? supabase.from('ride_requests').select(ACCEPTED_RIDE_SELECT).eq('id', previewRideId as string).maybeSingle()
            : supabase
                .from('ride_requests')
                .select(ACCEPTED_RIDE_SELECT)
                .eq('driver_id', userId)
                .eq('status', 'accepted')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
        const [{ data: vehicleRows }, { data: rideRow }] = await Promise.all([
            supabase.from('driver_vehicles').select('vehicle_kind').eq('driver_id', userId),
            rideQuery,
        ])
        if (vehicleRows && vehicleRows.length > 0) {
            setMyVehicleKinds(vehicleRows.map((v) => v.vehicle_kind as VehicleKind))
        }
        if (!rideRow) {
            router.replace('/aceitar-corridas')
            return
        }
        setAcceptedRide(rideRow as AcceptedRideMapDetail)
        setLoading(false)
    }

    useEffect(() => {
        if (profileLoading) return
        if (!userId) { router.replace('/aceitar-corridas'); return }
        load()
        const poll = setInterval(load, REFRESH_INTERVAL_MS)
        return () => clearInterval(poll)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileLoading, userId, previewRideId])

    // ===== PRÉVIA: dados do card (quem pediu, o que leva, tarifas) =====
    useEffect(() => {
        if (!isPreview || !userId || !previewRideId) return
        let cancelled = false
        ;(async () => {
            const { data: rideRow } = await supabase.from('ride_requests').select(OFFER_SELECT).eq('id', previewRideId).maybeSingle()
            if (!rideRow || cancelled) return
            const r = rideRow as unknown as OfferRide & { requester_id: string; store_id: string | null }
            const [{ data: profile }, ratings, { data: pricing }, storeRes] = await Promise.all([
                supabase.from('profiles').select('name, profileSlug, avatar_url').eq('id', r.requester_id).maybeSingle(),
                getProfileRideRatingsBatch(supabase, [r.requester_id]),
                supabase
                    .from('driver_pricing')
                    .select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado')
                    .eq('driver_id', userId)
                    .maybeSingle(),
                r.store_id ? supabase.from('stores').select('name').eq('id', r.store_id).maybeSingle() : Promise.resolve({ data: null }),
            ])
            if (cancelled) return
            const { platformPrice, customPrice } = computeRideTariffs(
                r as Parameters<typeof computeRideTariffs>[0],
                (pricing || { pricing_mode: 'platform', base_distance_km: null, base_fee: null, price_per_km_after_base: null }) as Parameters<typeof computeRideTariffs>[1]
            )
            setOffer({
                ride: r,
                requester: {
                    name: profile?.name || null,
                    slug: profile?.profileSlug || null,
                    avatarUrl: getAvatarUrl(supabase, profile?.avatar_url),
                    rating: ratings.get(r.requester_id) || { avg: 0, count: 0 },
                },
                storeName: (storeRes.data as { name: string } | null)?.name || null,
                platformPrice,
                customPrice,
            })
        })()
        return () => { cancelled = true }
    }, [isPreview, userId, previewRideId])

    // Tarifa iUser = tarifa da corrida + deslocamento do motorista até a partida
    // (km da rota "você → partida" × valor/km do veículo da corrida).
    const pickupFee: { state: 'ready'; km: number; amount: number } | { state: 'waiting' | 'missing' } = (() => {
        if (!offer || routeKm == null || !driverCoords) return { state: driverCoords ? 'waiting' : 'missing' }
        const perKm = PLATFORM_DEFAULT_PRICING_BY_VEHICLE[kindForRideType(offer.ride.vehicle_type)].pricePerKmAfterBase
        return { state: 'ready', km: routeKm, amount: Math.round(routeKm * perKm * 100) / 100 }
    })()

    const applyToOffer = async (price: number) => {
        if (!userId || !previewRideId) return
        if (!(price > 0)) {
            toast.error('Informe um valor válido')
            return
        }
        setApplying(true)
        try {
            // Sem veículo cadastrado não dá pra se candidatar: avisa e leva ao cadastro.
            const { count: vehicleCount } = await supabase.from('driver_vehicles').select('vehicle_kind', { count: 'exact', head: true }).eq('driver_id', userId)
            if (!vehicleCount) {
                setShowVehicleDialog(true)
                setApplying(false)
                return
            }
            await submitRideApplication(userId, previewRideId, price)
            toast.success('Candidatura enviada!')
            router.push('/painel-motorista?aba=candidaturas')
        } catch (err: any) {
            if (err?.code === '23505') toast.error('Você já se candidatou a essa corrida.')
            else if (err?.code === '42501' || err?.code === 'PGRST301') toast.error('Essa corrida já atingiu o limite de candidatos (ou você não tem o plano de motorista).')
            else toast.error('Erro ao se candidatar: ' + (err?.message || 'tente novamente'))
            setApplying(false)
        }
    }

    // ===== POSIÇÃO AO VIVO DO MOTORISTA =====
    useEffect(() => {
        const watch = watchNativePosition(
            (pos) => setDriverCoords([pos.coords.longitude, pos.coords.latitude]),
            () => toast.error('Não conseguimos acessar sua localização. Ative o GPS pra navegar.'),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        )
        return () => watch.clear()
    }, [])

    // ===== ORIENTAÇÃO POR VOZ (mesma lógica de ../page.tsx) =====
    const voiceNavPhase: 'pickup' | 'trip' | null = !acceptedRide || isPreview
        ? null
        : acceptedRide.ride_started_at
            ? 'trip'
            : acceptedRide.driver_en_route && !acceptedRide.driver_arrived_at
                ? 'pickup'
                : null

    interface TripLeg { kind: 'stop1' | 'stop2' | 'destination'; lat: number; lng: number }
    const tripLegs: TripLeg[] = []
    if (acceptedRide?.stop1_lat != null && acceptedRide?.stop1_lng != null && !acceptedRide.stop1_reached_at) {
        tripLegs.push({ kind: 'stop1', lat: acceptedRide.stop1_lat, lng: acceptedRide.stop1_lng })
    }
    if (acceptedRide?.stop2_lat != null && acceptedRide?.stop2_lng != null && !acceptedRide.stop2_reached_at) {
        tripLegs.push({ kind: 'stop2', lat: acceptedRide.stop2_lat, lng: acceptedRide.stop2_lng })
    }
    if (acceptedRide?.destination_lat != null && acceptedRide?.destination_lng != null) {
        tripLegs.push({ kind: 'destination', lat: acceptedRide.destination_lat, lng: acceptedRide.destination_lng })
    }
    const currentTripLeg = voiceNavPhase === 'trip' ? tripLegs[0] || null : null

    const voiceNavTarget: [number, number] | null =
        voiceNavPhase === 'pickup' && acceptedRide?.origin_lat != null && acceptedRide?.origin_lng != null
            ? [acceptedRide.origin_lng, acceptedRide.origin_lat]
            : currentTripLeg
                ? [currentTripLeg.lng, currentTripLeg.lat]
                : null

    useVoiceNavigation({
        enabled: true,
        active: !!voiceNavPhase && !!voiceNavTarget,
        driverCoords,
        targetCoords: voiceNavTarget,
        legKey: acceptedRide && voiceNavPhase ? `${acceptedRide.id}-${voiceNavPhase}-${currentTripLeg?.kind || 'none'}` : null,
        introMessage: undefined,
    })

    // Alvo atual da navegação: a partida (antes de iniciar) ou o próximo
    // ponto ainda não concluído (parada ou destino, depois de iniciar).
    const navTarget: { lat: number; lng: number; label: string } | null = (() => {
        if (!acceptedRide) return null
        if (!acceptedRide.ride_started_at) {
            if (acceptedRide.origin_lat == null || acceptedRide.origin_lng == null) return null
            return { lat: acceptedRide.origin_lat, lng: acceptedRide.origin_lng, label: 'Partida' }
        }
        if (currentTripLeg) {
            return {
                lat: currentTripLeg.lat,
                lng: currentTripLeg.lng,
                label: currentTripLeg.kind === 'destination' ? 'Chegada' : `Parada ${currentTripLeg.kind === 'stop1' ? 1 : 2}`,
            }
        }
        return null
    })()

    // ===== MAPA: cria uma vez, com o alvo inicial =====
    useEffect(() => {
        if (!containerRef.current || !navTarget || mapRef.current) return
        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: driverCoords || [navTarget.lng, navTarget.lat],
            zoom: 15,
            attributionControl: false,
        })
        // Bússola visível agora que o mapa gira com a direção do
        // movimento — dá pra tocar nela pra voltar ao norte pra cima.
        map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')

        // Gesto do usuário (arrastar/zoom/rotacionar) desliga o modo
        // centralizar — igual comportamento de qualquer app de navegação.
        map.on('dragstart', () => setFollowing(false))
        map.on('zoomstart', (e) => { if ((e as { originalEvent?: unknown }).originalEvent) setFollowing(false) })
        map.on('rotatestart', (e) => { if ((e as { originalEvent?: unknown }).originalEvent) setFollowing(false) })

        // addSource/addLayer só depois do estilo carregado — chamar antes
        // disso derruba a página com "Style is not done loading".
        map.on('load', () => {
            map.addSource('nav-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
            map.addLayer({
                id: 'nav-route-line',
                type: 'line',
                source: 'nav-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': TO_TARGET_COLOR, 'line-width': 5, 'line-opacity': 0.95 },
            })
            map.addSource('trip-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
            map.addLayer({
                id: 'trip-preview-line',
                type: 'line',
                source: 'trip-preview',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': TRIP_PREVIEW_COLOR, 'line-width': 5, 'line-opacity': 0.9 },
            }, 'nav-route-line') // por baixo da rota azul ao vivo, pra ela não sumir onde as duas se encontram
            setMapReady(true)
        })
        mapRef.current = map

        // O mapa divide a tela com o card, que muda de altura: o mapbox-gl só
        // reage a resize da JANELA, não do container — sem isso o canvas
        // fica com o tamanho antigo e o mapa aparece deslocado/cortado.
        const resizeObserver = new ResizeObserver(() => {
            map.resize()
            if (fitRef.current && !followingRef.current) {
                map.fitBounds(fitRef.current.bounds, { padding: fitRef.current.padding, duration: 0 })
            }
        })
        resizeObserver.observe(containerRef.current)

        return () => {
            resizeObserver.disconnect()
            driverMarkerRef.current?.remove()
            driverMarkerRef.current = null
            map.remove()
            mapRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!navTarget])

    // ===== MARCADORES FIXOS (partida/paradas/chegada) — redesenha se a corrida mudar =====
    useEffect(() => {
        const map = mapRef.current
        if (!map || !mapReady || !acceptedRide) return
        fixedMarkersRef.current.forEach((m) => m.remove())
        fixedMarkersRef.current = []
        const add = (color: string, label: string, lng: number | null, lat: number | null) => {
            if (lat == null || lng == null) return
            fixedMarkersRef.current.push(new mapboxgl.Marker({ element: marker(color, label) }).setLngLat([lng, lat]).addTo(map))
        }
        add('#22c55e', 'Partida', acceptedRide.origin_lng, acceptedRide.origin_lat)
        add(STOP_COLOR, 'Parada 1', acceptedRide.stop1_lng, acceptedRide.stop1_lat)
        add(STOP_COLOR, 'Parada 2', acceptedRide.stop2_lng, acceptedRide.stop2_lat)
        add('#ef4444', 'Chegada', acceptedRide.destination_lng, acceptedRide.destination_lat)

        // Prévia do percurso completo partida → (paradas) → chegada, só antes
        // de iniciar (depois a rota ao vivo já é o caminho real, a prévia fixa
        // só atrapalharia).
        const src = map.getSource('trip-preview') as mapboxgl.GeoJSONSource | undefined
        const points: [number, number][] = []
        if (acceptedRide.origin_lat != null && acceptedRide.origin_lng != null) points.push([acceptedRide.origin_lng, acceptedRide.origin_lat])
        if (acceptedRide.stop1_lat != null && acceptedRide.stop1_lng != null) points.push([acceptedRide.stop1_lng, acceptedRide.stop1_lat])
        if (acceptedRide.stop2_lat != null && acceptedRide.stop2_lng != null) points.push([acceptedRide.stop2_lng, acceptedRide.stop2_lat])
        if (acceptedRide.destination_lat != null && acceptedRide.destination_lng != null) points.push([acceptedRide.destination_lng, acceptedRide.destination_lat])
        if (!acceptedRide.ride_started_at && points.length >= 2) {
            Promise.all(points.slice(1).map((pt, i) => fetchRoute(points[i], pt))).then((legs) => {
                src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: legs.flatMap((l) => l.coords) } })
                setTripKm(legs.reduce((sum, l) => sum + l.distanceKm, 0))
                setTripMin(legs.reduce((sum, l) => sum + l.durationMin, 0))
            }).catch(() => {})
        } else {
            src?.setData({ type: 'FeatureCollection', features: [] })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, acceptedRide?.id, acceptedRide?.ride_started_at])

    // ===== PRÉVIA: enquadra posição do motorista + partida + paradas + destino =====
    useEffect(() => {
        const map = mapRef.current
        if (!isPreview || !map || !mapReady || !acceptedRide || fitStageRef.current === 2) return
        if (fitStageRef.current === 1 && !driverCoords) return
        const bounds = new mapboxgl.LngLatBounds()
        const extend = (lng: number | null, lat: number | null) => { if (lat != null && lng != null) bounds.extend([lng, lat]) }
        extend(acceptedRide.origin_lng, acceptedRide.origin_lat)
        extend(acceptedRide.stop1_lng, acceptedRide.stop1_lat)
        extend(acceptedRide.stop2_lng, acceptedRide.stop2_lat)
        extend(acceptedRide.destination_lng, acceptedRide.destination_lat)
        if (driverCoords) bounds.extend(driverCoords)
        if (bounds.isEmpty()) return
        const padding = { top: 90, bottom: 40, left: 40, right: 40 }
        fitRef.current = { bounds, padding }
        map.fitBounds(bounds, { padding, duration: 500, maxZoom: 16 })
        fitStageRef.current = driverCoords ? 2 : 1
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPreview, mapReady, acceptedRide?.id, driverCoords])

    // ===== POSIÇÃO AO VIVO: desliza o marcador, recalcula a rota até o
    // alvo atual, e centraliza se o modo "centralizar" estiver ligado =====
    useEffect(() => {
        const map = mapRef.current
        if (!map || !mapReady || !driverCoords || !navTarget) return
        const kind = vehicleIconForRide(acceptedRide!.vehicle_type, myVehicleKinds)

        if (!driverMarkerRef.current || driverMarkerKindRef.current !== kind) {
            driverMarkerRef.current?.remove()
            driverMarkerRef.current = new mapboxgl.Marker({ element: driverMarkerElement(kind) }).setLngLat(driverCoords).addTo(map)
            driverMarkerKindRef.current = kind
        } else {
            animateMarkerTo(driverMarkerRef.current, driverCoords)
        }

        // Só recalcula o bearing se andou o suficiente — perto do limite,
        // o GPS "tremendo" no mesmo lugar daria um ângulo quase aleatório.
        const prevCoords = prevBearingCoordsRef.current
        if (!prevCoords || haversineKm(prevCoords, driverCoords) * 1000 >= MIN_BEARING_MOVEMENT_METERS) {
            const raw = prevCoords ? computeBearing(prevCoords, driverCoords) : null
            if (raw != null) bearingRef.current = smoothBearing(bearingRef.current, raw, BEARING_SMOOTHING_ALPHA)
            prevBearingCoordsRef.current = driverCoords
        }

        if (followingRef.current) {
            map.easeTo({ center: driverCoords, bearing: bearingRef.current ?? map.getBearing(), duration: 600 })
        }

        const reqId = ++routeReqIdRef.current
        fetchRoute(driverCoords, [navTarget.lng, navTarget.lat])
            .then((leg) => {
                if (routeReqIdRef.current !== reqId) return
                const src = map.getSource('nav-route') as mapboxgl.GeoJSONSource | undefined
                src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: leg.coords } })
                setRouteKm(leg.distanceKm)
                setRouteMin(leg.durationMin)
            })
            .catch(() => {})
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, driverCoords, navTarget?.lat, navTarget?.lng])

    const recenter = () => {
        setFollowing(true)
        if (mapRef.current && driverCoords) {
            mapRef.current.easeTo({ center: driverCoords, bearing: bearingRef.current ?? mapRef.current.getBearing(), duration: 600 })
        }
    }

    // ===== AÇÕES DA CORRIDA (mesma lógica de ../page.tsx) =====
    const departToPickup = async () => {
        if (!acceptedRide) return
        setDeparting(true)
        try {
            const { error } = await supabase.from('ride_requests').update({ driver_en_route: true, driver_departed_at: new Date().toISOString() }).eq('id', acceptedRide.id)
            if (error) throw error
            notifyRideStatus(acceptedRide.id, 'en_route')
            setAcceptedRide((prev) => (prev ? { ...prev, driver_en_route: true } : prev))
        } catch (err: any) {
            toast.error('Erro ao confirmar saída: ' + (err.message || 'tente novamente'))
        } finally {
            setDeparting(false)
        }
    }

    const arriveAtPickup = async () => {
        if (!acceptedRide) return
        setArriving(true)
        try {
            const now = new Date().toISOString()
            const { error } = await supabase.from('ride_requests').update({ driver_arrived_at: now }).eq('id', acceptedRide.id)
            if (error) throw error
            notifyRideStatus(acceptedRide.id, 'arrived')
            setAcceptedRide((prev) => (prev ? { ...prev, driver_arrived_at: now } : prev))
        } catch (err: any) {
            toast.error('Erro ao confirmar chegada: ' + (err.message || 'tente novamente'))
        } finally {
            setArriving(false)
        }
    }

    const startRide = async () => {
        if (!acceptedRide) return
        setStarting(true)
        try {
            const now = new Date().toISOString()
            const { error } = await supabase.from('ride_requests').update({ ride_started_at: now }).eq('id', acceptedRide.id)
            if (error) throw error
            notifyRideStatus(acceptedRide.id, 'started')
            setAcceptedRide((prev) => (prev ? { ...prev, ride_started_at: now } : prev))
        } catch (err: any) {
            toast.error('Erro ao iniciar corrida: ' + (err.message || 'tente novamente'))
        } finally {
            setStarting(false)
        }
    }

    const arriveAtStop = (stopNumber: 1 | 2) => {
        if (!acceptedRide) return
        const lat = stopNumber === 1 ? acceptedRide.stop1_lat : acceptedRide.stop2_lat
        const lng = stopNumber === 1 ? acceptedRide.stop1_lng : acceptedRide.stop2_lng
        if (lat == null || lng == null) return
        setArrivingStop(true)
        getNativeCurrentPosition(
            async (pos) => {
                const distanceMeters = haversineKm([pos.coords.longitude, pos.coords.latitude], [lng, lat]) * 1000
                if (distanceMeters > FINISH_RADIUS_METERS) {
                    toast.error(`Você está a ${Math.round(distanceMeters)} m da parada. Chegue a até ${FINISH_RADIUS_METERS} m pra confirmar.`)
                    setArrivingStop(false)
                    return
                }
                try {
                    const now = new Date().toISOString()
                    const field = stopNumber === 1 ? 'stop1_reached_at' : 'stop2_reached_at'
                    const { error } = await supabase.from('ride_requests').update({ [field]: now }).eq('id', acceptedRide.id)
                    if (error) throw error
                    setAcceptedRide((prev) => (prev ? { ...prev, [field]: now } : prev))
                    toast.success('Parada confirmada!')
                } catch (err: any) {
                    toast.error('Erro ao confirmar a parada: ' + (err.message || 'tente novamente'))
                } finally {
                    setArrivingStop(false)
                }
            },
            () => {
                toast.error('Não conseguimos confirmar sua localização. Ative o GPS pra confirmar a parada.')
                setArrivingStop(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const finishRide = () => {
        if (!acceptedRide) return
        if (acceptedRide.stop1_lat != null && acceptedRide.stop1_lng != null && !acceptedRide.stop1_reached_at) {
            toast.error('Confirme a chegada na 1ª parada antes de concluir a corrida.')
            return
        }
        if (acceptedRide.stop2_lat != null && acceptedRide.stop2_lng != null && !acceptedRide.stop2_reached_at) {
            toast.error('Confirme a chegada na 2ª parada antes de concluir a corrida.')
            return
        }
        if (acceptedRide.destination_lat == null || acceptedRide.destination_lng == null) {
            toast.error('Não dá pra confirmar a chegada: esse pedido não tem coordenadas de destino.')
            return
        }
        setFinishing(true)
        getNativeCurrentPosition(
            async (pos) => {
                const distanceMeters = haversineKm(
                    [pos.coords.longitude, pos.coords.latitude],
                    [acceptedRide.destination_lng as number, acceptedRide.destination_lat as number]
                ) * 1000
                if (distanceMeters > FINISH_RADIUS_METERS) {
                    toast.error(`Você está a ${Math.round(distanceMeters)} m do destino. Chegue a até ${FINISH_RADIUS_METERS} m pra concluir.`)
                    setFinishing(false)
                    return
                }
                try {
                    const { error } = await supabase.from('ride_requests').update({ status: 'completed' }).eq('id', acceptedRide.id)
                    if (error) throw error
                    notifyRideStatus(acceptedRide.id, 'completed')
                    toast.success('Corrida concluída!')
                    router.replace('/aceitar-corridas')
                } catch (err: any) {
                    toast.error('Erro ao concluir corrida: ' + (err.message || 'tente novamente'))
                } finally {
                    setFinishing(false)
                }
            },
            () => {
                toast.error('Não conseguimos confirmar sua localização. Ative o GPS pra concluir a corrida.')
                setFinishing(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const cancelRide = async () => {
        if (!acceptedRide) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setCancelling(true)
        try {
            const { error } = await supabase.from('ride_requests').update({ status: 'cancelled', cancelled_by: 'driver' }).eq('id', acceptedRide.id).eq('driver_id', user.id)
            if (error) throw error
            notifyRideStatus(acceptedRide.id, 'cancelled')
            toast.success('Corrida cancelada.')
            router.replace('/aceitar-corridas')
        } catch (err: any) {
            toast.error('Erro ao cancelar: ' + (err.message || 'tente novamente'))
        } finally {
            setCancelling(false)
        }
    }

    const toggleChat = () => setShowChat((v) => !v)

    const splash = splashUrl && !splashGone ? (
        <div
            className="fixed inset-0 pointer-events-none"
            style={{
                zIndex: 40,
                backgroundImage: `url(${splashUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: mapReady ? 0 : 1,
                transition: 'opacity 600ms ease-out',
            }}
        />
    ) : null

    if (loading || !acceptedRide) {
        return (
            <>
                <div className="fixed inset-0 flex items-center justify-center" style={{ background: colors.background }}>
                    {!splashUrl && <Spinner size={24} color={colors.textSecondary} />}
                </div>
                {splash}
            </>
        )
    }

    const hasStop1 = acceptedRide.stop1_lat != null && acceptedRide.stop1_lng != null
    const stop1Done = !hasStop1 || !!acceptedRide.stop1_reached_at
    const hasStop2 = acceptedRide.stop2_lat != null && acceptedRide.stop2_lng != null
    const stop2Done = !hasStop2 || !!acceptedRide.stop2_reached_at

    const routeLine = `${shortAddress(acceptedRide.origin_address)} → ${acceptedRide.stop1_address ? `${shortAddress(acceptedRide.stop1_address)} → ` : ''}${acceptedRide.stop2_address ? `${shortAddress(acceptedRide.stop2_address)} → ` : ''}${shortAddress(acceptedRide.destination_address)}`
    const primaryBtn = 'w-full py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2'
    const primaryStyle = { background: GRADIENT, color: '#fff' }
    const secondaryBtn = 'flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-wider transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5'
    const secondaryStyle = { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
    const phaseTitle = isPreview
        ? 'Corrida disponível'
        : !acceptedRide.driver_en_route
            ? 'Corrida aceita'
            : !acceptedRide.driver_arrived_at
                ? 'Indo até o ponto de partida'
                : !acceptedRide.ride_started_at
                    ? 'Você chegou na partida'
                    : 'Corrida em andamento'
    const shownTripKm = acceptedRide.distance_km ?? tripKm
    const shownTripMin = acceptedRide.duration_min ?? tripMin

    return (
        <div className="fixed inset-0 flex flex-col" style={{ zIndex: 0, background: colors.background }}>
            {/* MAPA — ocupa sempre o espaço que sobra em cima, nunca é tampado
                pelo card (que vive embaixo, na mesma tela), igual ao /pedir-motorista */}
            <div className="relative flex-1 min-h-0">
                <div
                    ref={containerRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ background: '#111', transform: sheetShown ? 'scale(1)' : 'scale(1.12)', transition: 'transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
                />

                <div className="absolute top-6 left-4 right-4 z-10 flex items-center gap-3">
                    <button
                        onClick={() => router.push(backUrl)}
                        className="w-11 h-11 rounded-full flex items-center justify-center shadow-xl flex-shrink-0"
                        style={{ background: colors.surface, color: colors.textPrimary }}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 px-4 py-2.5 rounded-full shadow-xl text-center" style={{ background: colors.surface }}>
                        <span className="text-xs font-black" style={{ color: colors.textPrimary }}>
                            {navTarget ? `Indo para: ${navTarget.label}` : 'Navegação'}
                            {routeKm != null && ` · ${routeKm.toFixed(1)} km${routeMin != null ? ` · ${Math.round(routeMin)} min` : ''}`}
                        </span>
                    </div>
                </div>

                <button
                    onClick={recenter}
                    className="absolute z-10 w-11 h-11 rounded-full flex items-center justify-center shadow-xl"
                    style={{ right: 10, bottom: 120, background: following ? GRADIENT : colors.surface, color: following ? '#fff' : colors.textPrimary }}
                    title={following ? 'Centralizando automaticamente' : 'Centralizar no meu local'}
                >
                    <LocateFixed size={20} />
                </button>
            </div>

            {/* CARD — mesmo visual do /pedir-motorista */}
            <div
                className="relative flex-shrink-0 rounded-t-3xl px-4 pt-3 pb-6 overflow-y-auto"
                style={{
                    zIndex: 50,
                    background: colors.surface,
                    boxShadow: '0 -8px 30px rgba(0,0,0,0.35)',
                    height: `${sheetHeightVh}vh`,
                    transform: sheetShown ? 'translateY(0)' : 'translateY(100%)',
                    transition: 'height 0.25s ease-out, transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
            >
                <div ref={setSheetContentRef}>
                    {isPreview ? (
                        offer ? (
                            <RideOfferCard
                                ride={offer.ride}
                                requester={offer.requester}
                                storeName={offer.storeName}
                                platformPrice={offer.platformPrice + (pickupFee.state === 'ready' ? pickupFee.amount : 0)}
                                pickup={pickupFee}
                                customPrice={offer.customPrice}
                                toPickup={{ km: routeKm, min: routeMin, hasGps: !!driverCoords }}
                                trip={{ km: shownTripKm, min: shownTripMin }}
                                applying={applying}
                                onApply={applyToOffer}
                                onBack={() => router.push(backUrl)}
                            />
                        ) : (
                            <div className="flex justify-center py-8"><Spinner size={24} color={colors.textSecondary} /></div>
                        )
                    ) : (
                    <>
                    <h2 className="text-lg font-black mb-1" style={{ color: colors.textPrimary }}>{phaseTitle}</h2>
                    <div className="flex items-start gap-2 text-xs mb-2" style={{ color: colors.textSecondary }}>
                        <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                        <span>{routeLine}</span>
                    </div>

                    <div className="flex flex-col gap-2 mt-3">
                        {(
                            <>
                                {!acceptedRide.driver_en_route && (
                                    <button onClick={departToPickup} disabled={departing} className={primaryBtn} style={primaryStyle}>
                                        {departing ? <Spinner size={16} /> : <><Navigation size={16} /> Ir para o ponto de partida</>}
                                    </button>
                                )}
                                {acceptedRide.driver_en_route && !acceptedRide.driver_arrived_at && (
                                    <button onClick={arriveAtPickup} disabled={arriving} className={primaryBtn} style={primaryStyle}>
                                        {arriving ? <Spinner size={16} /> : <><MapPin size={16} /> Cheguei ao ponto de partida</>}
                                    </button>
                                )}
                                {acceptedRide.driver_arrived_at && !acceptedRide.ride_started_at && (
                                    <button onClick={startRide} disabled={starting} className={primaryBtn} style={primaryStyle}>
                                        {starting ? <Spinner size={16} /> : <><Navigation size={16} /> Iniciar corrida</>}
                                    </button>
                                )}
                                {acceptedRide.ride_started_at && hasStop1 && !stop1Done && (
                                    <button onClick={() => arriveAtStop(1)} disabled={arrivingStop} className={primaryBtn} style={primaryStyle}>
                                        {arrivingStop ? <Spinner size={16} /> : <><MapPin size={16} /> Cheguei na 1ª parada</>}
                                    </button>
                                )}
                                {acceptedRide.ride_started_at && stop1Done && hasStop2 && !stop2Done && (
                                    <button onClick={() => arriveAtStop(2)} disabled={arrivingStop} className={primaryBtn} style={primaryStyle}>
                                        {arrivingStop ? <Spinner size={16} /> : <><MapPin size={16} /> Cheguei na 2ª parada</>}
                                    </button>
                                )}
                                {acceptedRide.ride_started_at && stop1Done && stop2Done && (
                                    <button onClick={finishRide} disabled={finishing} className={primaryBtn} style={primaryStyle}>
                                        {finishing ? <Spinner size={16} /> : <><Flag size={16} /> Cheguei ao destino</>}
                                    </button>
                                )}

                                <div className="flex items-center gap-2">
                                    <button onClick={toggleChat} className={secondaryBtn} style={secondaryStyle}>
                                        <MessageCircle size={14} /> {showChat ? 'Fechar chat' : 'Abrir chat'}
                                    </button>
                                    <button onClick={cancelRide} disabled={cancelling} className={secondaryBtn} style={{ ...secondaryStyle, color: '#ef4444' }}>
                                        {cancelling ? <Spinner size={14} /> : <><Ban size={14} /> Cancelar</>}
                                    </button>
                                </div>

                                {showChat && (
                                    <RideChat rideId={acceptedRide.id} quickReplies={DRIVER_CHAT_QUICK_REPLIES} />
                                )}
                            </>
                        )}
                    </div>
                    </>
                    )}
                </div>
            </div>
            {splash}
            {showVehicleDialog && (
                <VehicleRequiredDialog
                    onClose={() => setShowVehicleDialog(false)}
                    onRegister={() => router.push('/painel-motorista?aba=veiculo&veiculo=carro')}
                />
            )}
        </div>
    )
}
