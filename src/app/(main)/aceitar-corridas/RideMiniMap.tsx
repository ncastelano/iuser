// app/(main)/aceitar-corridas/RideMiniMap.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/app/theme'
import { Expand } from 'lucide-react'
import { fetchRoute } from '@/lib/mapboxRoute'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!
const TO_PICKUP_COLOR = '3b82f6' // azul: de você até o ponto de partida
const TRIP_COLOR = 'f97316' // laranja: do ponto de partida até o destino

// ===== POLYLINE ENCODING (algoritmo do Google, precisão 5 — mesma usada pela Static Images API) =====
function encodeNumber(num: number): string {
    let output = ''
    let n = num
    while (n >= 0x20) {
        output += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
        n >>= 5
    }
    output += String.fromCharCode(n + 63)
    return output
}

function encodeSignedNumber(num: number): string {
    let sgnNum = num << 1
    if (num < 0) sgnNum = ~sgnNum
    return encodeNumber(sgnNum)
}

function encodePolyline(coords: [number, number][]): string {
    const factor = 1e5
    let output = ''
    let prevLat = 0
    let prevLng = 0
    for (const [lng, lat] of coords) {
        const lat5 = Math.round(lat * factor)
        const lng5 = Math.round(lng * factor)
        output += encodeSignedNumber(lat5 - prevLat)
        output += encodeSignedNumber(lng5 - prevLng)
        prevLat = lat5
        prevLng = lng5
    }
    return output
}

interface RideMiniMapProps {
    originLng: number
    originLat: number
    destLng: number
    destLat: number
    driverLng: number | null
    driverLat: number | null
    onExpand?: () => void
}

export default function RideMiniMap({ originLng, originLat, destLng, destLat, driverLng, driverLat, onExpand }: RideMiniMapProps) {
    const { colors } = useTheme()
    const [imgUrl, setImgUrl] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)
    const [toPickupKm, setToPickupKm] = useState<number | null>(null)
    const [tripKm, setTripKm] = useState<number | null>(null)
    const hasDriver = driverLng != null && driverLat != null

    useEffect(() => {
        let cancelled = false
        setImgUrl(null)
        setFailed(false)

        const build = async () => {
            const overlays: string[] = []
            let nextToPickupKm: number | null = null

            if (hasDriver) {
                const leg = await fetchRoute([driverLng as number, driverLat as number], [originLng, originLat])
                nextToPickupKm = leg.distanceKm
                overlays.push(`path-3+${TO_PICKUP_COLOR}-0.85(${encodeURIComponent(encodePolyline(leg.coords))})`)
            }

            const trip = await fetchRoute([originLng, originLat], [destLng, destLat])
            overlays.push(`path-4+${TRIP_COLOR}-0.9(${encodeURIComponent(encodePolyline(trip.coords))})`)

            if (hasDriver) overlays.push(`pin-s+${TO_PICKUP_COLOR}(${driverLng},${driverLat})`)
            overlays.push(`pin-s+22c55e(${originLng},${originLat})`)
            overlays.push(`pin-s+ef4444(${destLng},${destLat})`)

            const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays.join(',')}/auto/500x220@2x?padding=40&access_token=${MAPBOX_TOKEN}`
            if (!cancelled) {
                setImgUrl(url)
                setToPickupKm(nextToPickupKm)
                setTripKm(trip.distanceKm)
            }
        }

        build().catch(() => { if (!cancelled) setFailed(true) })

        return () => { cancelled = true }
    }, [originLng, originLat, destLng, destLat, driverLng, driverLat, hasDriver])

    if (failed) return null

    return (
        <div className="mb-2">
            <div className="w-full rounded-xl overflow-hidden relative" style={{ height: 120, background: `${colors.border}30` }}>
                {imgUrl ? (
                    <img src={imgUrl} alt="Trajeto da corrida" className="w-full h-full object-cover" onError={() => setFailed(true)} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>Carregando mapa...</span>
                    </div>
                )}
                {onExpand && (
                    <button
                        onClick={onExpand}
                        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold shadow-lg"
                        style={{ background: colors.surface, color: colors.textPrimary }}
                    >
                        <Expand size={11} />
                        Ver no mapa
                    </button>
                )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {hasDriver && (
                    <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `#${TO_PICKUP_COLOR}` }} />
                        Você
                    </span>
                )}
                <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#22c55e' }} />
                    Partida
                </span>
                <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#ef4444' }} />
                    Chegada
                </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
                {hasDriver && toPickupKm != null && (
                    <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                        <span className="w-3 h-[3px] rounded-full flex-shrink-0" style={{ background: `#${TO_PICKUP_COLOR}` }} />
                        Até a partida: {toPickupKm.toFixed(1)} km
                    </span>
                )}
                {tripKm != null && (
                    <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                        <span className="w-3 h-[3px] rounded-full flex-shrink-0" style={{ background: `#${TRIP_COLOR}` }} />
                        Partida → chegada: {tripKm.toFixed(1)} km
                    </span>
                )}
            </div>
        </div>
    )
}
