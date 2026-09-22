// app/(main)/aceitar-corridas/RideMapDialog.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { fetchRoute } from '@/lib/mapboxRoute'
import { vehicleMarkerHtml } from '@/lib/vehicleMarkerIcon'
import type { VehicleKind } from '@/lib/rideVehicle'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const TO_PICKUP_COLOR = '#3b82f6'
const TRIP_COLOR = '#f97316'
const STOP_COLOR = '#eab308'

function marker(color: string, label?: string): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
    el.innerHTML = `
        ${label ? `<div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${label}</div>` : ''}
        <div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
    `
    return el
}

// Marcador do motorista ("Você"): ícone do veículo (carro/moto/bicicleta) que
// desliza suavemente até a posição nova em vez de pular — a transição CSS no
// próprio elemento funciona porque o mapbox-gl só mexe no `transform` dele.
function driverMarkerElement(kind: VehicleKind): HTMLDivElement {
    const el = document.createElement('div')
    el.innerHTML = vehicleMarkerHtml(kind, TO_PICKUP_COLOR, 'Você')
    el.style.transition = 'transform 1s linear'
    return el
}

interface RideMapDialogProps {
    originLat: number
    originLng: number
    destLat: number
    destLng: number
    /** Parada opcional entre a partida e a chegada. */
    stopLat?: number | null
    stopLng?: number | null
    driverLat: number | null
    driverLng: number | null
    /** Veículo do motorista nessa corrida (carro/moto/bicicleta) — define o ícone do marcador "Você". */
    vehicleKind?: VehicleKind
    onClose: () => void
}

export default function RideMapDialog({ originLat, originLng, destLat, destLng, stopLat = null, stopLng = null, driverLat, driverLng, vehicleKind = 'carro', onClose }: RideMapDialogProps) {
    const { colors } = useTheme()
    const containerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const driverMarkerKindRef = useRef<VehicleKind | null>(null)
    const toPickupReqIdRef = useRef(0)
    const [loading, setLoading] = useState(true)
    const [mapReady, setMapReady] = useState(false)
    const [toPickupKm, setToPickupKm] = useState<number | null>(null)
    const [toPickupMin, setToPickupMin] = useState<number | null>(null)
    const [tripKm, setTripKm] = useState<number | null>(null)
    const [tripMin, setTripMin] = useState<number | null>(null)
    const hasDriver = driverLat != null && driverLng != null
    const hasStop = stopLat != null && stopLng != null

    // Mapa + trajeto fixo (partida → chegada): desenhado uma vez, na abertura.
    useEffect(() => {
        if (!containerRef.current) return

        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [originLng, originLat],
            zoom: 13,
            attributionControl: false,
        })
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
        mapRef.current = map

        let cancelled = false

        map.on('load', async () => {
            const bounds = new mapboxgl.LngLatBounds([originLng, originLat], [originLng, originLat])
            bounds.extend([destLng, destLat])

            // Com parada, soma as duas pernas (partida→parada, parada→chegada) num
            // trajeto só — mesmo trecho laranja, sem distinguir visualmente as pernas.
            const legTrip = hasStop
                ? await Promise.all([
                    fetchRoute([originLng, originLat], [stopLng as number, stopLat as number]),
                    fetchRoute([stopLng as number, stopLat as number], [destLng, destLat]),
                ]).then(([l1, l2]) => ({
                    coords: [...l1.coords, ...l2.coords],
                    distanceKm: l1.distanceKm + l2.distanceKm,
                    durationMin: l1.durationMin + l2.durationMin,
                }))
                : await fetchRoute([originLng, originLat], [destLng, destLat])
            if (cancelled) return
            map.addSource('leg-trip', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: legTrip.coords } } })
            map.addLayer({
                id: 'leg-trip-line',
                type: 'line',
                source: 'leg-trip',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': TRIP_COLOR, 'line-width': 5, 'line-opacity': 0.95, 'line-offset': 2.5 },
            })
            legTrip.coords.forEach((c) => bounds.extend(c as [number, number]))
            setTripKm(legTrip.distanceKm)
            setTripMin(legTrip.durationMin)

            if (hasStop) {
                new mapboxgl.Marker({ element: marker(STOP_COLOR, 'Parada') }).setLngLat([stopLng as number, stopLat as number]).addTo(map)
                bounds.extend([stopLng as number, stopLat as number])
            }

            // O trecho "até a partida" (você → partida) é montado à parte,
            // pelo efeito abaixo, porque precisa se atualizar ao vivo.
            map.addSource('leg-to-pickup', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
            map.addLayer({
                id: 'leg-to-pickup-line',
                type: 'line',
                source: 'leg-to-pickup',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': TO_PICKUP_COLOR, 'line-width': 4, 'line-opacity': 0.9, 'line-offset': -2.5 },
            })

            new mapboxgl.Marker({ element: marker('#22c55e', 'Partida') }).setLngLat([originLng, originLat]).addTo(map)
            new mapboxgl.Marker({ element: marker('#ef4444', 'Chegada') }).setLngLat([destLng, destLat]).addTo(map)

            map.fitBounds(bounds, { padding: 60, duration: 0 })
            if (!cancelled) {
                setLoading(false)
                setMapReady(true)
            }
        })

        return () => {
            cancelled = true
            driverMarkerRef.current?.remove()
            driverMarkerRef.current = null
            map.remove()
            mapRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Posição do motorista ao vivo: desliza o marcador (sem redesenhar o mapa
    // inteiro) e reconstrói só a linha "até a partida" a cada atualização de GPS.
    useEffect(() => {
        const map = mapRef.current
        if (!map || !mapReady) return

        if (!hasDriver) {
            driverMarkerRef.current?.remove()
            driverMarkerRef.current = null
            driverMarkerKindRef.current = null
            const src = map.getSource('leg-to-pickup') as mapboxgl.GeoJSONSource | undefined
            src?.setData({ type: 'FeatureCollection', features: [] })
            setToPickupKm(null)
            setToPickupMin(null)
            return
        }

        if (!driverMarkerRef.current || driverMarkerKindRef.current !== vehicleKind) {
            driverMarkerRef.current?.remove()
            driverMarkerRef.current = new mapboxgl.Marker({ element: driverMarkerElement(vehicleKind) })
                .setLngLat([driverLng as number, driverLat as number])
                .addTo(map)
            driverMarkerKindRef.current = vehicleKind
        } else {
            driverMarkerRef.current.setLngLat([driverLng as number, driverLat as number])
        }

        const reqId = ++toPickupReqIdRef.current
        fetchRoute([driverLng as number, driverLat as number], [originLng, originLat])
            .then((leg) => {
                if (toPickupReqIdRef.current !== reqId) return // resposta antiga, já saiu outra atualização
                const src = map.getSource('leg-to-pickup') as mapboxgl.GeoJSONSource | undefined
                src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: leg.coords } })
                setToPickupKm(leg.distanceKm)
                setToPickupMin(leg.durationMin)
            })
            .catch(() => { /* melhor esforço: a linha até a partida só não atualiza dessa vez */ })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, hasDriver, driverLat, driverLng, vehicleKind])

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div
                className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden relative"
                style={{ background: colors.surface, boxShadow: colors.shadow, height: '70vh' }}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center shadow-lg"
                    style={{ background: colors.surface, color: colors.textPrimary }}
                >
                    <X size={18} />
                </button>

                {loading && (
                    <div className="absolute inset-0 z-[5] flex items-center justify-center" style={{ background: colors.surface }}>
                        <Spinner size={24} color={colors.textSecondary} />
                    </div>
                )}

                <div ref={containerRef} className="w-full h-full" style={{ background: '#111' }} />

                <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5 px-3 py-2 rounded-xl" style={{ background: `${colors.surface}e6`, boxShadow: colors.shadow }}>
                    <div className="flex items-center gap-3 flex-wrap">
                        {hasDriver && (
                            <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: colors.textPrimary }}>
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TO_PICKUP_COLOR }} />
                                Você
                            </span>
                        )}
                        <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: colors.textPrimary }}>
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#22c55e' }} />
                            Partida
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: colors.textPrimary }}>
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#ef4444' }} />
                            Chegada
                        </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {hasDriver && toPickupKm != null && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                <span className="w-3.5 h-1 rounded-full flex-shrink-0" style={{ background: TO_PICKUP_COLOR }} />
                                Até a partida: {toPickupKm.toFixed(1)} km{toPickupMin != null ? ` · ${Math.round(toPickupMin)} min` : ''}
                            </span>
                        )}
                        {tripKm != null && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                <span className="w-3.5 h-1 rounded-full flex-shrink-0" style={{ background: TRIP_COLOR }} />
                                Partida → chegada: {tripKm.toFixed(1)} km{tripMin != null ? ` · ${Math.round(tripMin)} min` : ''}
                            </span>
                        )}
                        {hasDriver && toPickupKm != null && tripKm != null && (
                            <span className="text-[10px] font-black" style={{ color: colors.textPrimary }}>
                                Total: {(toPickupKm + tripKm).toFixed(1)} km
                                {toPickupMin != null && tripMin != null ? ` · ${Math.round(toPickupMin + tripMin)} min` : ''}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
