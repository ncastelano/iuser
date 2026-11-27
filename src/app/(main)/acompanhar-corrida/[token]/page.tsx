// app/(main)/acompanhar-corrida/[token]/page.tsx
//
// Página pública (sem login) do link "compartilhar corrida": quem recebeu o link (porteiro, familiar) acompanha no MAPA, em tempo real:
//   · buscando motorista  → trajeto VERMELHO da partida ao destino
//   · motorista aceito    → trajeto AZUL (avisa que a corrida foi aceita e já há notificações)
//   · em andamento        → trajeto AZUL só do que falta: do carro até o destino, encolhendo conforme ele anda
// O carro é a posição ao vivo do motorista; o link é o segredo (não mostra telefone nem exige conta).
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { MapPin, Car, CheckCircle2, Clock, XCircle, Navigation, ShieldCheck } from 'lucide-react'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { fetchRoute, haversineKm } from '@/lib/mapboxRoute'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const RED = '#ef4444'
const BLUE = '#2563eb'
const POLL_MS = 5000

interface RideShareData {
    status: 'pending' | 'accepted' | 'completed' | 'cancelled'
    rideType: 'pessoa' | 'objeto' | 'animal'
    requesterFirstName: string
    originAddress: string
    destinationAddress: string
    originComplement: string | null
    destinationComplement: string | null
    originLat: number | null
    originLng: number | null
    destinationLat: number | null
    destinationLng: number | null
    driverPosition: { lat: number; lng: number; updatedAt: string | null } | null
    distanceKm: number | null
    durationMin: number | null
    driverEnRoute: boolean
    driverArrivedAt: string | null
    rideStartedAt: string | null
    createdAt: string
    driver: {
        id?: string
        name: string | null
        avatarUrl: string | null
        carModel: string | null
        carColor: string | null
        carPhotoUrl: string | null
    } | null
}

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 40 ? firstPart.substring(0, 38) + '...' : firstPart
}

function clockOf(min: number): string {
    return new Date(Date.now() + min * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function AcompanharCorridaPage() {
    const { colors } = useTheme()
    const params = useParams()
    const id = Array.isArray(params.token) ? params.token[0] : params.token  // token do link (não é o id da corrida)

    const [data, setData] = useState<RideShareData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [etaMin, setEtaMin] = useState<number | null>(null)

    const mapBox = useRef<HTMLDivElement>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const mapReadyRef = useRef(false)
    const carRef = useRef<mapboxgl.Marker | null>(null)
    const routeKeyRef = useRef<string>('')
    const routeFromRef = useRef<[number, number] | null>(null)
    const routeAtRef = useRef(0)
    const fittedRef = useRef(false)

    const load = useCallback(async () => {
        if (!id) return
        try {
            const res = await fetch(`/api/ride-share/${id}`, { cache: 'no-store' })
            if (!res.ok) {
                setError('Corrida não encontrada.')
                return
            }
            setData(await res.json())
            setError(null)
        } catch {
            setError('Não foi possível carregar a corrida.')
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        load()
        const poll = setInterval(load, POLL_MS)
        return () => clearInterval(poll)
    }, [load])

    // mapa: criado uma vez, com a partida e o destino
    useEffect(() => {
        if (!data || !mapBox.current || mapRef.current) return
        const o = data.originLat != null && data.originLng != null ? [data.originLng, data.originLat] as [number, number] : null
        if (!o) return
        const map = new mapboxgl.Map({
            container: mapBox.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: o,
            zoom: 13,
            attributionControl: false,
        })
        mapRef.current = map
        // o contêiner pode ganhar altura depois de criado: redimensiona ao carregar e quando a janela muda
        const fit = () => map.resize()
        window.addEventListener('resize', fit)
        setTimeout(fit, 60)
        map.on('load', () => {
            fit()
            mapReadyRef.current = true
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [o, o] } } })
            map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10 } })
            map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': RED, 'line-width': 6 } })
            routeKeyRef.current = ''
        })
        const pin = (color: string, label: string) => {
            const el = document.createElement('div')
            el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;"><div style="background:${color};color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:9999px;margin-bottom:3px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);">${label}</div><div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div></div>`
            return el
        }
        new mapboxgl.Marker({ element: pin('#22c55e', 'Partida'), anchor: 'bottom' }).setLngLat(o).addTo(map)
        if (data.destinationLat != null && data.destinationLng != null) {
            new mapboxgl.Marker({ element: pin(RED, 'Destino'), anchor: 'bottom' }).setLngLat([data.destinationLng, data.destinationLat]).addTo(map)
        }
    }, [data])

    // trajeto: vermelho enquanto procura; azul quando aceita; azul encolhendo (do carro até o destino) quando a corrida começa
    useEffect(() => {
        if (!data || !mapRef.current) return
        const map = mapRef.current
        const o = data.originLat != null && data.originLng != null ? [data.originLng, data.originLat] as [number, number] : null
        const d = data.destinationLat != null && data.destinationLng != null ? [data.destinationLng, data.destinationLat] as [number, number] : null
        const car = data.driverPosition ? [data.driverPosition.lng, data.driverPosition.lat] as [number, number] : null
        const finished = data.status === 'completed' || data.status === 'cancelled'
        const started = !!data.rideStartedAt

        // o carro aparece sempre que o motorista está com a corrida
        if (car && data.status === 'accepted') {
            if (carRef.current) carRef.current.setLngLat(car)
            else {
                const el = document.createElement('div')
                el.innerHTML = `<div style="width:30px;height:30px;border-radius:50%;background:${BLUE};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"><span style="color:#fff;font-size:14px;">🚗</span></div>`
                carRef.current = new mapboxgl.Marker({ element: el }).setLngLat(car).addTo(map)
            }
        } else if (carRef.current) {
            carRef.current.remove()
            carRef.current = null
        }

        if (finished || !o || !d) {
            if (mapReadyRef.current && map.getSource('route')) (map.getSource('route') as mapboxgl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } })
            return
        }

        // o que desenhar agora
        const fromCar = data.status === 'accepted' && started && car !== null
        const from = fromCar ? car! : o
        const color = data.status === 'pending' ? RED : BLUE
        const key = `${data.status}|${started ? 'run' : 'pre'}`

        // refaz a rota quando muda a fase, ou quando o carro andou (a cada 60 m ou 20 s): é isso que faz o trajeto ENCOLHER
        const movedM = routeFromRef.current ? haversineKm(routeFromRef.current, from) * 1000 : Infinity
        const due = key !== routeKeyRef.current || (fromCar && (movedM > 60 || Date.now() - routeAtRef.current > 20000))
        if (!due) return
        routeKeyRef.current = key
        routeFromRef.current = from
        routeAtRef.current = Date.now()

        fetchRoute(from, d).then((r) => {
            if (!r || !mapRef.current || !mapReadyRef.current) return
            const m = mapRef.current
            ;(m.getSource('route') as mapboxgl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.coords } })
            m.setPaintProperty('route', 'line-color', color)
            setEtaMin(r.durationMin)
            if (!fittedRef.current || !fromCar) {
                const b = new mapboxgl.LngLatBounds()
                r.coords.forEach((c) => b.extend(c as [number, number]))
                if (car) b.extend(car)
                m.fitBounds(b, { padding: { top: 60, bottom: 60, left: 40, right: 40 }, maxZoom: 16, duration: 600 })
                fittedRef.current = true
            }
        }).catch(() => {})
    }, [data])

    useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; mapReadyRef.current = false }, [])

    if (loading) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <Spinner size={40} color={colors.accent} />
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: colors.background }}>
                <XCircle size={40} style={{ color: '#ef4444' }} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{error || 'Corrida não encontrada.'}</p>
            </div>
        )
    }

    const statusInfo = (() => {
        if (data.status === 'cancelled') return { label: 'Corrida cancelada', color: '#6b7280', icon: XCircle }
        if (data.status === 'completed') return { label: 'Corrida concluída', color: '#22c55e', icon: CheckCircle2 }
        if (data.status === 'pending') return { label: 'Buscando motorista', color: RED, icon: Clock }
        if (data.rideStartedAt) return { label: 'Corrida em andamento', color: BLUE, icon: Car }
        if (data.driverArrivedAt) return { label: 'Motorista chegou ao local de partida', color: BLUE, icon: MapPin }
        if (data.driverEnRoute) return { label: 'Motorista a caminho', color: BLUE, icon: Navigation }
        return { label: 'Corrida aceita · motorista a caminho', color: BLUE, icon: CheckCircle2 }
    })()
    const StatusIcon = statusInfo.icon
    const chegaTexto = etaMin != null && data.status === 'accepted'
        ? (data.rideStartedAt ? `chega ao destino às ${clockOf(etaMin)}` : `chega ao local às ${clockOf(etaMin)}`)
        : null

    return (
        <div className="min-h-dvh pb-8" style={{ background: colors.background }}>
            <div className="max-w-md mx-auto flex flex-col gap-3">
                {/* EM CIMA: o estado da corrida, em cor (vermelho procurando, azul aceita e em andamento) */}
                <div className="px-4 pt-5">
                    <div className="flex items-center gap-2 justify-center mb-2">
                        <ShieldCheck size={14} style={{ color: colors.textSecondary }} />
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Acompanhamento de corrida · iUser</span>
                    </div>
                    <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: `${statusInfo.color}18`, border: `1.5px solid ${statusInfo.color}` }}>
                        <StatusIcon size={18} style={{ color: statusInfo.color }} />
                        <div className="min-w-0">
                            <p className="text-sm font-black leading-tight" style={{ color: statusInfo.color }}>{statusInfo.label}</p>
                            {chegaTexto && <p className="text-[12px] font-bold" style={{ color: colors.textPrimary }}>{chegaTexto}</p>}
                        </div>
                    </div>
                </div>

                {/* O MAPA: a partida, o destino e o carro, com o trajeto que muda conforme a corrida anda */}
                <div className="relative mx-4 rounded-2xl overflow-hidden" style={{ height: '52vh', border: `1px solid ${colors.border}` }}>
                    <div ref={mapBox} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
                    {!data.driverPosition && data.status === 'accepted' && (
                        <div className="absolute left-2 bottom-2 px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: '#111827cc', color: '#fff' }}>Aguardando a posição do motorista</div>
                    )}
                </div>

                <div className="mx-4 rounded-2xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}>
                    <p className="text-xs font-bold mb-2" style={{ color: colors.textSecondary }}>Passageiro: {data.requesterFirstName}</p>
                    <div className="flex items-start gap-2 text-xs" style={{ color: colors.textPrimary }}>
                        <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#22c55e' }} />
                        <div>
                            <span>{shortAddress(data.originAddress)}</span>
                            {data.originComplement && <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>📍 {data.originComplement}</p>}
                        </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs mt-2" style={{ color: colors.textPrimary }}>
                        <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: RED }} />
                        <div>
                            <span>{shortAddress(data.destinationAddress)}</span>
                            {data.destinationComplement && <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>📍 {data.destinationComplement}</p>}
                        </div>
                    </div>
                    {data.distanceKm != null && (
                        <p className="text-[11px] mt-2" style={{ color: colors.textSecondary }}>{data.distanceKm.toFixed(1)} km · {Math.round(data.durationMin || 0)} min</p>
                    )}
                </div>

                {data.driver && (data.status === 'accepted' || data.status === 'completed') && (
                    <div className="mx-4 rounded-2xl p-4 flex items-center gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}>
                        <PlanAvatarRing userId={data.driver.id}>
                        {data.driver.avatarUrl ? (
                            <img src={data.driver.avatarUrl} className="w-12 h-12 rounded-full object-cover flex-shrink-0" alt="" />
                        ) : (
                            <span className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-black" style={{ background: GRADIENT, color: '#fff' }}>
                                {(data.driver.name || '?').charAt(0).toUpperCase()}
                            </span>
                        )}
                        </PlanAvatarRing>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{data.driver.name || 'Motorista'}</p>
                            {(data.driver.carModel || data.driver.carColor) && (
                                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: colors.textSecondary }}>
                                    <Car size={12} />
                                    {[data.driver.carModel, data.driver.carColor].filter(Boolean).join(' · ')}
                                </p>
                            )}
                        </div>
                        {data.driver.carPhotoUrl && <img src={data.driver.carPhotoUrl} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" alt="" />}
                    </div>
                )}

                <p className="text-[10px] text-center px-4" style={{ color: colors.textSecondary }}>Acompanhamento ao vivo: atualiza sozinho a cada 5 segundos.</p>
            </div>
        </div>
    )
}
