// app/(main)/aceitar-corridas/RideMapDialog.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { X } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { Spinner } from '@/components/Spinner'
import { fetchRoute } from '@/lib/mapboxRoute'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const TO_PICKUP_COLOR = '#3b82f6'
const TRIP_COLOR = '#f97316'

function marker(color: string, label?: string): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
    el.innerHTML = `
        ${label ? `<div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${label}</div>` : ''}
        <div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
    `
    return el
}

interface RideMapDialogProps {
    originLat: number
    originLng: number
    destLat: number
    destLng: number
    driverLat: number | null
    driverLng: number | null
    onClose: () => void
}

export default function RideMapDialog({ originLat, originLng, destLat, destLng, driverLat, driverLng, onClose }: RideMapDialogProps) {
    const { colors } = useTheme()
    const containerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const [loading, setLoading] = useState(true)
    const [toPickupKm, setToPickupKm] = useState<number | null>(null)
    const [tripKm, setTripKm] = useState<number | null>(null)
    const hasDriver = driverLat != null && driverLng != null

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

            if (hasDriver) {
                const legToOrigin = await fetchRoute([driverLng as number, driverLat as number], [originLng, originLat])
                if (cancelled) return
                map.addSource('leg-to-pickup', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: legToOrigin.coords } } })
                map.addLayer({
                    id: 'leg-to-pickup-line',
                    type: 'line',
                    source: 'leg-to-pickup',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': TO_PICKUP_COLOR, 'line-width': 4, 'line-opacity': 0.9 },
                })
                legToOrigin.coords.forEach((c) => bounds.extend(c as [number, number]))
                new mapboxgl.Marker({ element: marker(TO_PICKUP_COLOR, 'Você') }).setLngLat([driverLng as number, driverLat as number]).addTo(map)
                setToPickupKm(legToOrigin.distanceKm)
            }

            const legTrip = await fetchRoute([originLng, originLat], [destLng, destLat])
            if (cancelled) return
            map.addSource('leg-trip', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: legTrip.coords } } })
            map.addLayer({
                id: 'leg-trip-line',
                type: 'line',
                source: 'leg-trip',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': TRIP_COLOR, 'line-width': 5, 'line-opacity': 0.95 },
            })
            legTrip.coords.forEach((c) => bounds.extend(c as [number, number]))
            setTripKm(legTrip.distanceKm)

            new mapboxgl.Marker({ element: marker('#22c55e', 'Partida') }).setLngLat([originLng, originLat]).addTo(map)
            new mapboxgl.Marker({ element: marker('#ef4444', 'Chegada') }).setLngLat([destLng, destLat]).addTo(map)

            map.fitBounds(bounds, { padding: 60, duration: 0 })
            if (!cancelled) setLoading(false)
        })

        return () => {
            cancelled = true
            map.remove()
            mapRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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
                                Até a partida: {toPickupKm.toFixed(1)} km
                            </span>
                        )}
                        {tripKm != null && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                <span className="w-3.5 h-1 rounded-full flex-shrink-0" style={{ background: TRIP_COLOR }} />
                                Partida → chegada: {tripKm.toFixed(1)} km
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
