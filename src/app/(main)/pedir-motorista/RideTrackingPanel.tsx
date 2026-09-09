// app/(main)/pedir-motorista/RideTrackingPanel.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { supabase } from '@/lib/supabase/client'
import { useTheme, type ThemeColors } from '@/app/theme'
import { toast } from 'sonner'
import { shortAddress } from '@/lib/serviceBoard'
import { getAvatarUrl } from '@/lib/avatar'
import { Spinner } from '@/components/Spinner'
import { Check, X, MapPin, Search, CheckCircle2, XCircle, Car, CalendarClock, Clock, Store, MessageSquare, Share2 } from 'lucide-react'
import { fetchRoute } from '@/lib/mapboxRoute'
import { DRIVER_SERVICE_OPTIONS } from '@/lib/driverServices'
import RideChat from '@/components/RideChat'
import { notifyRideStatus } from '@/lib/notifyRideStatus'
import { handleShareLink } from '@/lib/share'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const TRIP_ROUTE_COLOR = '#ef4444'
// Alto contraste entre si, e nenhuma perto do vermelho/rosa/roxo (o
// vermelho já é do trajeto partida → chegada, e rosa/roxo confundem com ele).
const CANDIDATE_COLORS = ['#eab308', '#3b82f6', '#06b6d4', '#14b8a6', '#84cc16']

type RideStatus = 'pending' | 'accepted' | 'completed' | 'cancelled'

function formatScheduledFor(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatClockTime(date: Date): string {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface RideRow {
    id: string
    origin_address: string
    destination_address: string
    origin_complement: string | null
    destination_complement: string | null
    status: RideStatus
    driver_id: string | null
    created_at: string
    scheduled_for: string | null
    origin_lat: number | null
    origin_lng: number | null
    destination_lat: number | null
    destination_lng: number | null
    duration_min: number | null
    driver_en_route: boolean
    driver_arrived_at: string | null
}

interface CandidateStore {
    name: string
    logoUrl: string | undefined
    slug: string | null
    products: { id: string; name: string; imageUrl: string | undefined; price: number | null }[]
}

interface Candidate {
    applicationId: string
    applicantId: string
    status: 'pending' | 'accepted' | 'rejected'
    proposedPrice: number | null
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
    lat: number | null
    lng: number | null
    etaMin: number | null
    etaDistanceKm: number | null
    routeCoords: [number, number][] | null
    carModel: string | null
    carColor: string | null
    carPhotoUrl: string | undefined
    services: string[]
    ratingAvg: number | null
    ratingCount: number
    lastComment: string | null
    store: CandidateStore | null
}

interface DriverInfo {
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

interface RideTrackingPanelProps {
    rideId: string
    onExit: () => void
    map?: mapboxgl.Map | null
    mapReady?: boolean
}

export default function RideTrackingPanel({ rideId, onExit, map, mapReady }: RideTrackingPanelProps) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(true)
    const [ride, setRide] = useState<RideRow | null>(null)
    const [candidates, setCandidates] = useState<Candidate[]>([])
    const [tripRouteCoords, setTripRouteCoords] = useState<[number, number][] | null>(null)
    const [driver, setDriver] = useState<DriverInfo | null>(null)
    const [decidingId, setDecidingId] = useState<string | null>(null)
    const [cancelling, setCancelling] = useState(false)
    const [driverLiveCoords, setDriverLiveCoords] = useState<[number, number] | null>(null)
    const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const knownCandidateIds = useRef<Set<string>>(new Set())
    const firstLoad = useRef(true)

    const load = useCallback(async () => {
        const { data: rideRow } = await supabase
            .from('ride_requests')
            .select('id, origin_address, destination_address, origin_complement, destination_complement, status, driver_id, created_at, scheduled_for, origin_lat, origin_lng, destination_lat, destination_lng, duration_min, driver_en_route, driver_arrived_at')
            .eq('id', rideId)
            .single()

        if (!rideRow) {
            setLoading(false)
            return
        }
        setRide(rideRow)

        // Trajeto partida → chegada, calculado uma única vez (não muda por
        // candidato) e reaproveitado tanto pra desenhar o percurso da
        // corrida sozinho quanto emendado na rota completa de cada um.
        if (rideRow.origin_lat != null && rideRow.origin_lng != null && rideRow.destination_lat != null && rideRow.destination_lng != null) {
            fetchRoute([rideRow.origin_lng, rideRow.origin_lat], [rideRow.destination_lng, rideRow.destination_lat])
                .then((route) => setTripRouteCoords(route.coords))
        }

        const { data: applications } = await supabase
            .from('ride_applications')
            .select('id, applicant_id, status, proposed_price')
            .eq('ride_request_id', rideId)
            .order('created_at', { ascending: true })

        const applicantIds = Array.from(new Set((applications || []).map((a) => a.applicant_id)))
        const idsToFetch = Array.from(new Set([...applicantIds, ...(rideRow.driver_id ? [rideRow.driver_id] : [])]))

        let profilesById = new Map<string, { name: string | null; profileSlug: string | null; avatar_url: string | null; store_lat: number | null; store_lng: number | null }>()
        if (idsToFetch.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name, profileSlug, avatar_url, store_lat, store_lng')
                .in('id', idsToFetch)
            profilesById = new Map((profiles || []).map((p) => [p.id, p]))
        }

        // Ficha do carro (modelo, cor, foto, serviços) — pública, pro
        // passageiro comparar os candidatos além do preço.
        let vehiclesById = new Map<string, { car_model: string | null; car_color: string | null; car_photo_url: string | null; services: string[] }>()
        if (idsToFetch.length > 0) {
            const { data: vehicles } = await supabase
                .from('driver_vehicles')
                .select('driver_id, car_model, car_color, car_photo_url, services')
                .in('driver_id', idsToFetch)
            vehiclesById = new Map((vehicles || []).map((v) => [v.driver_id, v]))
        }

        // Avaliações recebidas — média, quantidade e o comentário mais recente.
        let ratingsById = new Map<string, { avg: number; count: number; lastComment: string | null }>()
        if (idsToFetch.length > 0) {
            const { data: reviewRows } = await supabase
                .from('ride_reviews')
                .select('reviewee_id, rating, comment, created_at')
                .in('reviewee_id', idsToFetch)
                .order('created_at', { ascending: false })
            const grouped = new Map<string, { rating: number; comment: string | null }[]>()
            for (const r of reviewRows || []) {
                const arr = grouped.get(r.reviewee_id) || []
                arr.push({ rating: r.rating, comment: r.comment })
                grouped.set(r.reviewee_id, arr)
            }
            for (const [id, arr] of grouped) {
                ratingsById.set(id, {
                    avg: arr.reduce((s, x) => s + x.rating, 0) / arr.length,
                    count: arr.length,
                    lastComment: arr.find((x) => x.comment)?.comment || null,
                })
            }
        }

        // "Loja embutida" — se o candidato tem uma loja, mostra a logo e os
        // 3 produtos mais recentes dela no card.
        let storesByOwnerId = new Map<string, { id: string; name: string; logo_url: string | null; storeSlug: string | null }>()
        if (idsToFetch.length > 0) {
            const { data: stores } = await supabase
                .from('stores')
                .select('id, owner_id, name, logo_url, storeSlug')
                .in('owner_id', idsToFetch)
                .order('created_at', { ascending: true })
            // Se o candidato tiver mais de uma loja, fica sempre com a mais antiga.
            for (const s of stores || []) {
                if (!storesByOwnerId.has(s.owner_id)) storesByOwnerId.set(s.owner_id, s)
            }
        }
        const storeIds = Array.from(storesByOwnerId.values()).map((s) => s.id)
        const productsByStoreId = new Map<string, { id: string; name: string; image_url: string | null; price: number | null }[]>()
        if (storeIds.length > 0) {
            const { data: products } = await supabase
                .from('products')
                .select('id, store_id, name, image_url, price')
                .in('store_id', storeIds)
                .order('created_at', { ascending: false })
            for (const prod of products || []) {
                const arr = productsByStoreId.get(prod.store_id) || []
                if (arr.length < 3) arr.push(prod)
                productsByStoreId.set(prod.store_id, arr)
            }
        }

        const nextCandidates: Candidate[] = await Promise.all((applications || []).map(async (a) => {
            const p = profilesById.get(a.applicant_id)
            const vehicle = vehiclesById.get(a.applicant_id)
            const rating = ratingsById.get(a.applicant_id)
            const store = storesByOwnerId.get(a.applicant_id)

            // Aproximação: tempo/distância da localização salva do motorista
            // (Definir local) até o ponto de partida — ajuda a comparar
            // candidatos além do preço, mas não é uma posição ao vivo.
            let etaMin: number | null = null
            let etaDistanceKm: number | null = null
            let routeCoords: [number, number][] | null = null
            if (p?.store_lat != null && p?.store_lng != null && rideRow.origin_lat != null && rideRow.origin_lng != null) {
                const route = await fetchRoute([p.store_lng, p.store_lat], [rideRow.origin_lng, rideRow.origin_lat])
                etaMin = route.durationMin
                etaDistanceKm = route.distanceKm
                routeCoords = route.coords
            }

            const storeProducts = store ? (productsByStoreId.get(store.id) || []) : []

            return {
                applicationId: a.id,
                applicantId: a.applicant_id,
                status: a.status,
                proposedPrice: a.proposed_price,
                name: p?.name || null,
                profileSlug: p?.profileSlug || null,
                avatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                lat: p?.store_lat ?? null,
                lng: p?.store_lng ?? null,
                etaMin,
                etaDistanceKm,
                routeCoords,
                carModel: vehicle?.car_model || null,
                carColor: vehicle?.car_color || null,
                carPhotoUrl: vehicle?.car_photo_url ? supabase.storage.from('driver-car-photos').getPublicUrl(vehicle.car_photo_url).data.publicUrl : undefined,
                services: vehicle?.services || [],
                ratingAvg: rating?.avg ?? null,
                ratingCount: rating?.count ?? 0,
                lastComment: rating?.lastComment ?? null,
                store: store ? {
                    name: store.name,
                    logoUrl: store.logo_url ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl : undefined,
                    slug: store.storeSlug,
                    products: storeProducts.map((prod) => ({
                        id: prod.id,
                        name: prod.name,
                        imageUrl: prod.image_url ? supabase.storage.from('product-images').getPublicUrl(prod.image_url).data.publicUrl : undefined,
                        price: prod.price,
                    })),
                } : null,
            }
        }))

        // Notifica sobre candidaturas novas desde a última carga (não na primeira).
        if (!firstLoad.current) {
            for (const c of nextCandidates) {
                if (!knownCandidateIds.current.has(c.applicationId)) {
                    toast.info(`${c.name || 'Um motorista'} se candidatou ao seu pedido!`, {
                        description: c.proposedPrice != null ? `Proposta: R$ ${c.proposedPrice.toFixed(2)}` : undefined,
                    })
                }
            }
        }
        knownCandidateIds.current = new Set(nextCandidates.map((c) => c.applicationId))
        firstLoad.current = false

        setCandidates(nextCandidates)

        if (rideRow.driver_id) {
            const p = profilesById.get(rideRow.driver_id)
            setDriver({ name: p?.name || null, profileSlug: p?.profileSlug || null, avatarUrl: getAvatarUrl(supabase, p?.avatar_url) })
        } else {
            setDriver(null)
        }

        setLoading(false)
    }, [rideId])

    useEffect(() => {
        load()
    }, [load])

    // ===== TEMPO REAL: candidaturas novas/alteradas e mudança de status do pedido =====
    useEffect(() => {
        const channel = supabase
            .channel(`ride-tracking-${rideId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'ride_applications', filter: `ride_request_id=eq.${rideId}` },
                () => load()
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'ride_requests', filter: `id=eq.${rideId}` },
                (payload) => {
                    const prevStatus = (payload.old as { status?: RideStatus } | null)?.status
                    const newStatus = (payload.new as { status?: RideStatus } | null)?.status
                    if (newStatus && newStatus !== prevStatus) {
                        if (newStatus === 'accepted') toast.success('Motorista escolhido! Ele está a caminho.')
                        if (newStatus === 'completed') toast.success('Corrida concluída!')
                        if (newStatus === 'cancelled') toast.info('Pedido cancelado.')
                    }
                    load()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [rideId, load])

    // ===== MAPA: uma única rota partida → chegada (vermelha), mais a conexão
    // de cada candidato até a partida, cada uma na sua própria cor =====
    const candidateMarkersRef = useRef<mapboxgl.Marker[]>([])
    const candidateLayerIdsRef = useRef<string[]>([])

    useEffect(() => {
        if (!map || !mapReady || !ride) return

        // Limpeza defensiva: some pelo ESTILO do mapa, não só pelo que o ref
        // acha que adicionou — se uma execução anterior travou no meio (ex.:
        // addSource com id duplicado lançando erro e abortando o forEach),
        // camadas/rotas de candidatos antigos ficariam presas no mapa pra
        // sempre. Isso garante começar de uma folha realmente limpa sempre.
        const staleIds = (map.getStyle()?.layers || [])
            .map((l) => l.id)
            .filter((id) => id === 'my-trip-route' || id.startsWith('candidate-route-'))
        staleIds.forEach((id) => {
            if (map.getLayer(id)) map.removeLayer(id)
            if (map.getSource(id)) map.removeSource(id)
        })
        candidateMarkersRef.current.forEach((m) => m.remove())
        candidateMarkersRef.current = []
        candidateLayerIdsRef.current = []

        const bounds = new mapboxgl.LngLatBounds()
        if (ride.origin_lat != null && ride.origin_lng != null) bounds.extend([ride.origin_lng, ride.origin_lat])
        if (ride.destination_lat != null && ride.destination_lng != null) bounds.extend([ride.destination_lng, ride.destination_lat])

        // Meu trajeto (partida → chegada) — uma rota só, sempre visível
        // enquanto existir. Sem alternativas, sem repetir por candidato.
        if (tripRouteCoords) {
            map.addSource('my-trip-route', {
                type: 'geojson',
                data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: tripRouteCoords } },
            })
            map.addLayer({
                id: 'my-trip-route',
                type: 'line',
                source: 'my-trip-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': TRIP_ROUTE_COLOR, 'line-width': 5, 'line-opacity': 0.9 },
            })
            candidateLayerIdsRef.current.push('my-trip-route')
            tripRouteCoords.forEach((coord) => bounds.extend(coord as [number, number]))
        }

        // Conexão de cada candidato até a partida — só a perna dele, sem
        // repetir o trajeto partida → chegada (que já está desenhado acima).
        if (ride.status === 'pending') {
            const visible = candidates.filter(
                (c) => c.status === 'pending' && c.lat != null && c.lng != null && c.routeCoords
            )

            visible.forEach((c, i) => {
                const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]
                const layerId = `candidate-route-${c.applicationId}`

                map.addSource(layerId, {
                    type: 'geojson',
                    data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c.routeCoords! } },
                })
                map.addLayer({
                    id: layerId,
                    type: 'line',
                    source: layerId,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.9, 'line-dasharray': [2, 1.5] },
                })
                candidateLayerIdsRef.current.push(layerId)

                const firstName = (c.name || 'Candidato').split(' ')[0]
                const priceText = c.proposedPrice != null ? `R$ ${c.proposedPrice.toFixed(2)}` : '—'
                const etaText = c.etaMin != null ? `${Math.max(1, Math.round(c.etaMin))} min` : ''

                const el = document.createElement('div')
                el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
                el.innerHTML = `
                    <div style="background:${color};color:#fff;font-size:9px;font-weight:800;padding:3px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);text-align:center;line-height:1.3;">
                        <div>${firstName}</div>
                        <div style="font-weight:600;opacity:0.9;">${priceText}${etaText ? ' · ' + etaText : ''}</div>
                    </div>
                    ${c.avatarUrl
                        ? `<img src="${c.avatarUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:3px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,0.4);" />`
                        : `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`
                    }
                `
                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([c.lng!, c.lat!]).addTo(map)
                candidateMarkersRef.current.push(marker)

                bounds.extend([c.lng!, c.lat!])
            })
        }

        if (!bounds.isEmpty()) {
            // A folha "Seu pedido" cobre até 75% da tela por baixo — sem isso
            // o fitBounds centraliza tudo numa área escondida atrás dela.
            map.fitBounds(bounds, {
                padding: { top: 60, bottom: Math.round(window.innerHeight * 0.68), left: 40, right: 40 },
                duration: 500,
            })
        }

        return () => {
            candidateMarkersRef.current.forEach((m) => m.remove())
            candidateMarkersRef.current = []
            candidateLayerIdsRef.current.forEach((id) => {
                if (map.getLayer(id)) map.removeLayer(id)
                if (map.getSource(id)) map.removeSource(id)
            })
            candidateLayerIdsRef.current = []
        }
    }, [map, mapReady, candidates, ride, tripRouteCoords])

    // ===== LOCALIZAÇÃO AO VIVO DO MOTORISTA ACEITO =====
    // Lida de driver_pricing (preenchida por /aceitar-corridas quando o
    // motorista ativa "Sincronização para motorista"). Realtime com
    // fallback de polling, mesmo padrão usado no resto do app.
    const rideStatus = ride?.status
    const rideDriverId = ride?.driver_id
    useEffect(() => {
        if (rideStatus !== 'accepted' || !rideDriverId) {
            setDriverLiveCoords(null)
            return
        }

        const fetchLive = async () => {
            const { data } = await supabase
                .from('driver_pricing')
                .select('live_lat, live_lng')
                .eq('driver_id', rideDriverId)
                .maybeSingle()
            if (data?.live_lat != null && data?.live_lng != null) {
                setDriverLiveCoords([data.live_lng, data.live_lat])
            }
        }
        fetchLive()

        const channel = supabase
            .channel(`driver-live-${rideDriverId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'driver_pricing', filter: `driver_id=eq.${rideDriverId}` },
                (payload) => {
                    const row = payload.new as { live_lat?: number | null; live_lng?: number | null }
                    if (row.live_lat != null && row.live_lng != null) setDriverLiveCoords([row.live_lng, row.live_lat])
                }
            )
            .subscribe()

        const poll = setInterval(fetchLive, 8000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(poll)
        }
    }, [rideStatus, rideDriverId])

    // Marcador do motorista no mapa — separado do efeito principal acima pra
    // não reconstruir rotas/candidatos a cada atualização de posição.
    useEffect(() => {
        if (!map || !mapReady) return

        if (!driverLiveCoords) {
            driverMarkerRef.current?.remove()
            driverMarkerRef.current = null
            return
        }

        if (driverMarkerRef.current) {
            driverMarkerRef.current.setLngLat(driverLiveCoords)
        } else {
            const el = document.createElement('div')
            el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
            el.innerHTML = `
                <div style="background:#3b82f6;color:#fff;font-size:9px;font-weight:800;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">Motorista</div>
                <div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
            `
            driverMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(driverLiveCoords).addTo(map)
        }
    }, [map, mapReady, driverLiveCoords])

    // Some com o marcador quando o mapa some/troca, ou quando este painel desmonta.
    useEffect(() => {
        return () => {
            driverMarkerRef.current?.remove()
            driverMarkerRef.current = null
        }
    }, [map])

    const acceptCandidate = async (applicationId: string, applicantId: string) => {
        setDecidingId(applicationId)
        try {
            const { data: updatedRide, error: rideError } = await supabase
                .from('ride_requests')
                .update({ status: 'accepted', driver_id: applicantId })
                .eq('id', rideId)
                .eq('status', 'pending')
                .select('id')

            if (rideError) throw rideError
            if (!updatedRide || updatedRide.length === 0) {
                toast.error('Este pedido já foi decidido.')
                load()
                return
            }

            await supabase.from('ride_applications').update({ status: 'accepted' }).eq('id', applicationId)
            await supabase
                .from('ride_applications')
                .update({ status: 'rejected' })
                .eq('ride_request_id', rideId)
                .eq('status', 'pending')
                .neq('id', applicationId)

            toast.success('Motorista escolhido!')
            load()

            // Best-effort: avisa o motorista aceito via push, independente de
            // onde ele esteja no app. Não bloqueia o fluxo se falhar.
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (!session) return
                fetch('/api/push/send-ride-accepted', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ rideRequestId: rideId }),
                }).catch(() => { /* silencioso: notificação é best-effort */ })
            })
        } catch (err: any) {
            toast.error('Erro ao decidir candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    const rejectCandidate = async (applicationId: string) => {
        setDecidingId(applicationId)
        try {
            const { error } = await supabase.from('ride_applications').update({ status: 'rejected' }).eq('id', applicationId)
            if (error) throw error
            toast.success('Candidato recusado.')
            load()
        } catch (err: any) {
            toast.error('Erro ao recusar candidatura: ' + (err.message || 'tente novamente'))
        } finally {
            setDecidingId(null)
        }
    }

    const cancelRide = async () => {
        setCancelling(true)
        try {
            const { error } = await supabase
                .from('ride_requests')
                .update({ status: 'cancelled', cancelled_by: 'requester' })
                .eq('id', rideId)
                .in('status', ['pending', 'accepted'])
            if (error) throw error
            toast.success('Corrida cancelada.')
            notifyRideStatus(rideId, 'cancelled')
            onExit()
        } catch (err: any) {
            toast.error('Erro ao cancelar: ' + (err.message || 'tente novamente'))
        } finally {
            setCancelling(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Spinner size={22} color={colors.textSecondary} />
                <span className="text-xs" style={{ color: colors.textSecondary }}>Carregando seu pedido...</span>
            </div>
        )
    }

    if (!ride) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <span className="text-sm" style={{ color: colors.textSecondary }}>Não encontramos esse pedido.</span>
                <button onClick={onExit} className="px-4 py-2 rounded-full text-xs font-bold" style={{ background: GRADIENT, color: '#fff' }}>
                    Fazer novo pedido
                </button>
            </div>
        )
    }

    const steps: { key: RideStatus; label: string; icon: typeof Search }[] = [
        { key: 'pending', label: 'Buscando motorista', icon: Search },
        { key: 'accepted', label: 'Motorista a caminho', icon: Car },
        { key: 'completed', label: 'Concluída', icon: CheckCircle2 },
    ]
    const currentStepIndex = ride.status === 'cancelled' ? -1 : steps.findIndex((s) => s.key === ride.status)

    return (
        <div className="flex flex-col gap-4">
            <div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Seu pedido</h2>
                        {ride.scheduled_for && (
                            <span
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase"
                                style={{ background: `${colors.accent}15`, color: colors.accent }}
                            >
                                <CalendarClock size={11} />
                                Agendada: {formatScheduledFor(ride.scheduled_for)}
                            </span>
                        )}
                    </div>
                    {ride.status !== 'cancelled' && (
                        <button
                            onClick={() => handleShareLink({
                                title: 'Acompanhe minha corrida no iUser',
                                text: 'Acompanhe o status da minha corrida em tempo real.',
                                url: `${window.location.origin}/acompanhar-corrida/${ride.id}`,
                            })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold flex-shrink-0"
                            style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            <Share2 size={12} />
                            Compartilhar
                        </button>
                    )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                    {shortAddress(ride.origin_address)} → {shortAddress(ride.destination_address)}
                </p>
                {(ride.origin_complement || ride.destination_complement) && (
                    <div className="flex flex-col gap-0.5 mt-1 text-[10px]" style={{ color: colors.textSecondary }}>
                        {ride.origin_complement && <span>📍 Origem: {ride.origin_complement}</span>}
                        {ride.destination_complement && <span>📍 Destino: {ride.destination_complement}</span>}
                    </div>
                )}
            </div>

            {/* Barra de progresso */}
            {ride.status === 'cancelled' ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#ef444415', color: '#ef4444' }}>
                    <XCircle size={16} />
                    <span className="text-sm font-bold">Pedido cancelado</span>
                </div>
            ) : (
                <div className="flex items-center">
                    {steps.map((s, i) => {
                        const Icon = s.icon
                        const active = i <= currentStepIndex
                        return (
                            <div key={s.key} className="flex items-center flex-1 last:flex-none">
                                <div className="flex flex-col items-center gap-1">
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={active ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary }}
                                    >
                                        <Icon size={14} />
                                    </div>
                                    <span className="text-[10px] font-bold text-center leading-tight w-16" style={{ color: active ? colors.textPrimary : colors.textSecondary }}>
                                        {s.label}
                                    </span>
                                </div>
                                {i < steps.length - 1 && (
                                    <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: i < currentStepIndex ? GRADIENT : colors.border }} />
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Motorista aceito */}
            {ride.status === 'accepted' && driver && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                    {driver.avatarUrl ? (
                        <img src={driver.avatarUrl} className="w-11 h-11 rounded-full object-cover flex-shrink-0" alt="" />
                    ) : (
                        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                            <Car size={18} />
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>
                            {driver.name || (driver.profileSlug ? `@${driver.profileSlug}` : 'Motorista')}
                        </p>
                        <p className="text-[11px] font-bold" style={{ color: (ride.driver_en_route || ride.driver_arrived_at) ? '#22c55e' : colors.textSecondary }}>
                            {ride.driver_arrived_at ? 'Chegou ao local de partida' : ride.driver_en_route ? 'A caminho do ponto de partida' : 'Aguardando ele sair para buscar você'}
                        </p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Confira a placa e a cor do carro antes de entrar.</p>
                    </div>
                </div>
            )}

            {/* Chat com o motorista, enquanto a corrida está aceita */}
            {ride.status === 'accepted' && driver && (
                <RideChat rideId={ride.id} />
            )}

            {/* Candidatos, enquanto pendente */}
            {ride.status === 'pending' && (
                <div>
                    <h3 className="text-xs font-black mb-2" style={{ color: colors.textPrimary }}>
                        {candidates.length === 0 ? 'Aguardando candidatos...' : `${candidates.length} motorista${candidates.length > 1 ? 's' : ''} se candidataram`}
                    </h3>
                    {candidates.length === 0 ? (
                        <div className="flex items-center gap-2 px-3 py-3 rounded-xl" style={{ background: `${colors.border}30` }}>
                            <Spinner size={14} color={colors.textSecondary} />
                            <span className="text-xs" style={{ color: colors.textSecondary }}>Assim que um motorista se candidatar, ele aparece aqui.</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {candidates.map((c, i) => {
                                const pickupEtaMin = c.etaMin != null ? Math.max(1, Math.round(c.etaMin)) : null
                                const destArrival = pickupEtaMin != null
                                    ? formatClockTime(new Date(Date.now() + (pickupEtaMin + (ride.duration_min ?? 0)) * 60000))
                                    : null
                                const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]
                                const roundedRating = Math.round(c.ratingAvg || 0)

                                return (
                                <div key={c.applicationId} className="flex flex-col items-center text-center gap-1.5 rounded-2xl px-2.5 py-3 min-w-0" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                    {c.avatarUrl ? (
                                        <img src={c.avatarUrl} className="w-11 h-11 rounded-full object-cover" style={{ border: `2px solid ${color}` }} alt="" />
                                    ) : (
                                        <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: color }}>
                                            <MapPin size={16} color="#fff" />
                                        </span>
                                    )}

                                    <div className="w-full min-w-0">
                                        <span className="text-[11px] font-bold block truncate" style={{ color: colors.textPrimary }}>
                                            {c.name || (c.profileSlug ? `@${c.profileSlug}` : 'Candidato')}
                                        </span>
                                        <span className="text-[11px] font-black block mt-0.5 truncate" style={{ color: '#f97316' }}>
                                            {c.proposedPrice != null ? `R$ ${c.proposedPrice.toFixed(2)}` : 'Sem valor'}
                                        </span>
                                    </div>

                                    {(pickupEtaMin != null || destArrival) && (
                                        <span
                                            className="flex items-center gap-1 text-[9px] font-bold leading-tight"
                                            style={{ color: colors.textSecondary }}
                                            title="Estimativa a partir da localização salva do motorista, não é uma posição ao vivo"
                                        >
                                            <Clock size={9} className="flex-shrink-0" />
                                            {pickupEtaMin != null ? `${pickupEtaMin} min` : ''}
                                            {pickupEtaMin != null && destArrival && ' · '}
                                            {destArrival && `chega às ${destArrival}`}
                                        </span>
                                    )}

                                    {(c.carModel || c.carColor || c.carPhotoUrl) && (
                                        <div className="flex items-center gap-1.5 w-full min-w-0 justify-center">
                                            {c.carPhotoUrl ? (
                                                <img src={c.carPhotoUrl} className="w-6 h-6 rounded-md object-cover flex-shrink-0" alt="" />
                                            ) : (
                                                <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}30` }}>
                                                    <Car size={11} style={{ color: colors.textSecondary }} />
                                                </span>
                                            )}
                                            <span className="text-[10px] font-bold truncate" style={{ color: colors.textPrimary }}>
                                                {[c.carModel, c.carColor].filter(Boolean).join(' · ') || 'Não informado'}
                                            </span>
                                        </div>
                                    )}

                                    {c.services.length > 0 && (
                                        <div className="flex gap-1 flex-wrap justify-center">
                                            {c.services.map((sid) => {
                                                const opt = DRIVER_SERVICE_OPTIONS.find((o) => o.id === sid)
                                                if (!opt) return null
                                                const Icon = opt.icon
                                                return (
                                                    <span
                                                        key={sid}
                                                        className="flex items-center justify-center w-5 h-5 rounded-full"
                                                        style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                                        title={opt.label}
                                                    >
                                                        <Icon size={10} />
                                                    </span>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {c.ratingCount > 0 && (
                                        <span className="text-[10px] font-black" style={{ color: '#f97316' }}>
                                            {'★'.repeat(roundedRating)}{'☆'.repeat(5 - roundedRating)} {(c.ratingAvg || 0).toFixed(1)}
                                        </span>
                                    )}

                                    {c.store && (
                                        <a
                                            href={c.store.slug ? `/${c.store.slug}` : undefined}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex flex-col items-center gap-1 p-1.5 rounded-lg w-full min-w-0"
                                            style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                                        >
                                            <div className="flex items-center gap-1 w-full min-w-0 justify-center">
                                                {c.store.logoUrl ? (
                                                    <img src={c.store.logoUrl} className="w-4 h-4 rounded-full object-cover flex-shrink-0" alt="" />
                                                ) : (
                                                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}30` }}>
                                                        <Store size={9} style={{ color: colors.textSecondary }} />
                                                    </span>
                                                )}
                                                <span className="text-[9px] font-black truncate" style={{ color: colors.textPrimary }}>{c.store.name}</span>
                                            </div>

                                            {c.store.products.length > 0 && (
                                                <div className="flex -space-x-1.5">
                                                    {c.store.products.map((prod) => (
                                                        <div
                                                            key={prod.id}
                                                            className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0"
                                                            style={{ background: `${colors.border}30`, border: `1px solid ${colors.surface}` }}
                                                            title={prod.name}
                                                        >
                                                            {prod.imageUrl && (
                                                                <img src={prod.imageUrl} className="w-full h-full object-cover" alt="" />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </a>
                                    )}

                                    {c.status === 'pending' ? (
                                        decidingId === c.applicationId ? (
                                            <Spinner size={14} color={colors.textSecondary} />
                                        ) : (
                                            <div className="flex items-center gap-1.5 mt-0.5 w-full">
                                                <button
                                                    onClick={() => acceptCandidate(c.applicationId, c.applicantId)}
                                                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-full text-[10px] font-bold"
                                                    style={{ background: '#22c55e', color: '#fff' }}
                                                >
                                                    <Check size={11} />
                                                    Aceitar
                                                </button>
                                                <button
                                                    onClick={() => rejectCandidate(c.applicationId)}
                                                    className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full"
                                                    style={{ background: '#ef4444', color: '#fff' }}
                                                    aria-label="Recusar"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        )
                                    ) : (
                                        <span className="text-[9px] font-black uppercase" style={{ color: c.status === 'accepted' ? '#22c55e' : colors.textSecondary }}>
                                            {c.status === 'accepted' ? 'Aceito' : 'Recusado'}
                                        </span>
                                    )}
                                </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {(ride.status === 'pending' || ride.status === 'accepted') && (
                <button
                    onClick={cancelRide}
                    disabled={cancelling}
                    className="w-full py-3 rounded-full font-bold text-xs disabled:opacity-50"
                    style={{ color: '#ef4444', border: `1px solid #ef444440` }}
                >
                    {cancelling ? <Spinner size={14} /> : 'Cancelar corrida'}
                </button>
            )}

            {(ride.status === 'completed' || ride.status === 'cancelled') && (
                <button
                    onClick={onExit}
                    className="w-full py-3 rounded-full font-black text-sm"
                    style={{ background: GRADIENT, color: '#fff' }}
                >
                    Fazer novo pedido
                </button>
            )}
        </div>
    )
}
