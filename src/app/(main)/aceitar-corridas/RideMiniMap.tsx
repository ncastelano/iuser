// app/(main)/aceitar-corridas/RideMiniMap.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/app/theme'
import { Expand } from 'lucide-react'

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

async function fetchRouteCoords(from: [number, number], to: [number, number]): Promise<[number, number][] | null> {
    try {
        const res = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=simplified&access_token=${MAPBOX_TOKEN}`
        )
        const data = await res.json()
        return data.routes?.[0]?.geometry?.coordinates || null
    } catch {
        return null
    }
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
    const hasDriver = driverLng != null && driverLat != null

    useEffect(() => {
        let cancelled = false
        setImgUrl(null)
        setFailed(false)

        const build = async () => {
            const overlays: string[] = []

            if (hasDriver) {
                const legToOrigin = await fetchRouteCoords([driverLng as number, driverLat as number], [originLng, originLat])
                const coords = legToOrigin && legToOrigin.length > 1 ? legToOrigin : [[driverLng, driverLat], [originLng, originLat]]
                overlays.push(`path-3+${TO_PICKUP_COLOR}-0.85(${encodeURIComponent(encodePolyline(coords as [number, number][]))})`)
            }

            const legTrip = await fetchRouteCoords([originLng, originLat], [destLng, destLat])
            const tripCoords = legTrip && legTrip.length > 1 ? legTrip : [[originLng, originLat], [destLng, destLat]]
            overlays.push(`path-4+${TRIP_COLOR}-0.9(${encodeURIComponent(encodePolyline(tripCoords as [number, number][]))})`)

            if (hasDriver) overlays.push(`pin-s+${TO_PICKUP_COLOR}(${driverLng},${driverLat})`)
            overlays.push(`pin-s+22c55e(${originLng},${originLat})`)
            overlays.push(`pin-s+ef4444(${destLng},${destLat})`)

            const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays.join(',')}/auto/500x220@2x?padding=40&access_token=${MAPBOX_TOKEN}`
            if (!cancelled) setImgUrl(url)
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
                        Você → partida
                    </span>
                )}
                <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `#${TRIP_COLOR}` }} />
                    Partida → chegada
                </span>
            </div>
        </div>
    )
}
