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
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ArrowLeft, MessageCircle, LocateFixed, Navigation, MapPin, Flag, Ban } from 'lucide-react'
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
import type { VehicleType, VehicleKind } from '@/lib/rideVehicle'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const TO_TARGET_COLOR = '#3b82f6' // azul: de você até o próximo ponto
const TRIP_PREVIEW_COLOR = '#f97316' // laranja: prévia partida → chegada, antes de iniciar
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
}

const ACCEPTED_RIDE_SELECT = 'id, vehicle_type, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, stop1_address, stop1_lat, stop1_lng, stop1_reached_at, stop2_address, stop2_lat, stop2_lng, stop2_reached_at, driver_en_route, driver_arrived_at, ride_started_at'

export default function AceitarCorridasMapaPage() {
    const router = useRouter()
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

    const [loading, setLoading] = useState(true)
    const [showChat, setShowChat] = useState(false)
    const [mapReady, setMapReady] = useState(false)
    const [acceptedRide, setAcceptedRide] = useState<AcceptedRideMapDetail | null>(null)
    const [myVehicleKinds, setMyVehicleKinds] = useState<VehicleKind[]>(['carro'])
    const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null)
    const [following, setFollowing] = useState(true)
    const [routeKm, setRouteKm] = useState<number | null>(null)
    const [routeMin, setRouteMin] = useState<number | null>(null)

    const [departing, setDeparting] = useState(false)
    const [arriving, setArriving] = useState(false)
    const [starting, setStarting] = useState(false)
    const [arrivingStop, setArrivingStop] = useState(false)
    const [finishing, setFinishing] = useState(false)
    const [cancelling, setCancelling] = useState(false)

    useEffect(() => { followingRef.current = following }, [following])

    // ===== CARREGA A CORRIDA ACEITA (e os veículos, pro ícone do marcador) =====
    const load = async () => {
        if (!userId) return
        const [{ data: vehicleRows }, { data: rideRow }] = await Promise.all([
            supabase.from('driver_vehicles').select('vehicle_kind').eq('driver_id', userId),
            supabase
                .from('ride_requests')
                .select(ACCEPTED_RIDE_SELECT)
                .eq('driver_id', userId)
                .eq('status', 'accepted')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
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
    }, [profileLoading, userId])

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
    const voiceNavPhase: 'pickup' | 'trip' | null = !acceptedRide
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
                paint: { 'line-color': TRIP_PREVIEW_COLOR, 'line-width': 3, 'line-opacity': 0.55 },
            })
            setMapReady(true)
        })
        mapRef.current = map

        return () => {
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
        if (acceptedRide.origin_lat != null && acceptedRide.origin_lng != null) {
            new mapboxgl.Marker({ element: marker('#22c55e', 'Partida') }).setLngLat([acceptedRide.origin_lng, acceptedRide.origin_lat]).addTo(map)
        }
        if (acceptedRide.stop1_lat != null && acceptedRide.stop1_lng != null) {
            new mapboxgl.Marker({ element: marker(STOP_COLOR, 'Parada 1') }).setLngLat([acceptedRide.stop1_lng, acceptedRide.stop1_lat]).addTo(map)
        }
        if (acceptedRide.stop2_lat != null && acceptedRide.stop2_lng != null) {
            new mapboxgl.Marker({ element: marker(STOP_COLOR, 'Parada 2') }).setLngLat([acceptedRide.stop2_lng, acceptedRide.stop2_lat]).addTo(map)
        }
        if (acceptedRide.destination_lat != null && acceptedRide.destination_lng != null) {
            new mapboxgl.Marker({ element: marker('#ef4444', 'Chegada') }).setLngLat([acceptedRide.destination_lng, acceptedRide.destination_lat]).addTo(map)
        }
        // Prévia partida → chegada, só antes de iniciar (depois a rota ao
        // vivo já é o caminho real, a prévia fixa só atrapalharia).
        if (!acceptedRide.ride_started_at && acceptedRide.origin_lat != null && acceptedRide.origin_lng != null && acceptedRide.destination_lat != null && acceptedRide.destination_lng != null) {
            fetchRoute([acceptedRide.origin_lng, acceptedRide.origin_lat], [acceptedRide.destination_lng, acceptedRide.destination_lat]).then((leg) => {
                const src = map.getSource('trip-preview') as mapboxgl.GeoJSONSource | undefined
                src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: leg.coords } })
            }).catch(() => {})
        } else {
            const src = map.getSource('trip-preview') as mapboxgl.GeoJSONSource | undefined
            src?.setData({ type: 'FeatureCollection', features: [] })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, acceptedRide?.id, acceptedRide?.ride_started_at])

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

    if (loading || !acceptedRide) {
        return (
            <div className="fixed inset-0 flex items-center justify-center" style={{ background: colors.background }}>
                <Spinner size={24} color={colors.textSecondary} />
            </div>
        )
    }

    const hasStop1 = acceptedRide.stop1_lat != null && acceptedRide.stop1_lng != null
    const stop1Done = !hasStop1 || !!acceptedRide.stop1_reached_at
    const hasStop2 = acceptedRide.stop2_lat != null && acceptedRide.stop2_lng != null
    const stop2Done = !hasStop2 || !!acceptedRide.stop2_reached_at

    return (
        <div className="fixed inset-0" style={{ zIndex: 0 }}>
            <div ref={containerRef} className="absolute inset-0 w-full h-full" style={{ background: '#111' }} />

            <div className="absolute top-6 left-4 right-4 z-10 flex items-center gap-3">
                <button
                    onClick={() => router.push('/aceitar-corridas')}
                    className="w-11 h-11 rounded-full flex items-center justify-center shadow-xl flex-shrink-0"
                    style={{ background: '#fff', color: '#111' }}
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 px-4 py-2.5 rounded-full shadow-xl text-center" style={{ background: '#fff' }}>
                    <span className="text-xs font-black" style={{ color: '#111' }}>
                        {navTarget ? `Indo para: ${navTarget.label}` : 'Navegação'}
                        {routeKm != null && ` · ${routeKm.toFixed(1)} km${routeMin != null ? ` · ${Math.round(routeMin)} min` : ''}`}
                    </span>
                </div>
            </div>

            <button
                onClick={recenter}
                className="absolute z-10 w-11 h-11 rounded-full flex items-center justify-center shadow-xl"
                style={{ right: 16, bottom: 220, background: following ? GRADIENT : '#fff', color: following ? '#fff' : '#111' }}
                title={following ? 'Centralizando automaticamente' : 'Centralizar no meu local'}
            >
                <LocateFixed size={20} />
            </button>

            <div className="absolute left-4 right-4 z-10 flex flex-col gap-2" style={{ bottom: 24 }}>
                <div className="rounded-2xl p-4 shadow-2xl flex flex-col gap-2 overflow-y-auto" style={{ background: GRADIENT, maxHeight: '75vh' }}>
                    <p className="text-xs font-bold text-white/90">
                        {shortAddress(acceptedRide.origin_address)} → {acceptedRide.stop1_address ? `${shortAddress(acceptedRide.stop1_address)} → ` : ''}{acceptedRide.stop2_address ? `${shortAddress(acceptedRide.stop2_address)} → ` : ''}{shortAddress(acceptedRide.destination_address)}
                    </p>

                    {!acceptedRide.driver_en_route && (
                        <button onClick={departToPickup} disabled={departing} className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: '#fff', color: '#dc2626' }}>
                            {departing ? <Spinner size={16} /> : <><Navigation size={16} /> Ir para o ponto de partida</>}
                        </button>
                    )}
                    {acceptedRide.driver_en_route && !acceptedRide.driver_arrived_at && (
                        <button onClick={arriveAtPickup} disabled={arriving} className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: '#fff', color: '#dc2626' }}>
                            {arriving ? <Spinner size={16} /> : <><MapPin size={16} /> Cheguei ao ponto de partida</>}
                        </button>
                    )}
                    {acceptedRide.driver_arrived_at && !acceptedRide.ride_started_at && (
                        <button onClick={startRide} disabled={starting} className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: '#fff', color: '#dc2626' }}>
                            {starting ? <Spinner size={16} /> : <><Navigation size={16} /> Iniciar corrida</>}
                        </button>
                    )}
                    {acceptedRide.ride_started_at && hasStop1 && !stop1Done && (
                        <button onClick={() => arriveAtStop(1)} disabled={arrivingStop} className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: '#fff', color: '#ca8a04' }}>
                            {arrivingStop ? <Spinner size={16} /> : <><MapPin size={16} /> Cheguei na 1ª parada</>}
                        </button>
                    )}
                    {acceptedRide.ride_started_at && stop1Done && hasStop2 && !stop2Done && (
                        <button onClick={() => arriveAtStop(2)} disabled={arrivingStop} className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: '#fff', color: '#ca8a04' }}>
                            {arrivingStop ? <Spinner size={16} /> : <><MapPin size={16} /> Cheguei na 2ª parada</>}
                        </button>
                    )}
                    {acceptedRide.ride_started_at && stop1Done && stop2Done && (
                        <button onClick={finishRide} disabled={finishing} className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-wider disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: '#fff', color: '#16a34a' }}>
                            {finishing ? <Spinner size={16} /> : <><Flag size={16} /> Cheguei ao destino</>}
                        </button>
                    )}

                    <div className="flex items-center gap-2">
                        <button onClick={toggleChat} className="flex-1 py-2.5 rounded-xl font-black uppercase text-[11px] tracking-wider flex items-center justify-center gap-1.5" style={{ background: 'rgba(255,255,255,0.25)', color: '#fff' }}>
                            <MessageCircle size={14} /> {showChat ? 'Fechar chat' : 'Abrir chat'}
                        </button>
                        <button onClick={cancelRide} disabled={cancelling} className="flex-1 py-2.5 rounded-xl font-black uppercase text-[11px] tracking-wider disabled:opacity-60 flex items-center justify-center gap-1.5" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                            {cancelling ? <Spinner size={14} /> : <><Ban size={14} /> Cancelar</>}
                        </button>
                    </div>

                    {showChat && (
                        <RideChat rideId={acceptedRide.id} quickReplies={DRIVER_CHAT_QUICK_REPLIES} />
                    )}
                </div>
            </div>
        </div>
    )
}
