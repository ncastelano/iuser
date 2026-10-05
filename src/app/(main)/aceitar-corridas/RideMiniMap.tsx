// app/(main)/aceitar-corridas/RideMiniMap.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/app/contexts/theme'
import { Expand } from 'lucide-react'
import { fetchRoute, offsetPolyline } from '@/lib/mapboxRoute'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!
const TO_PICKUP_COLOR = '3b82f6' // azul: de você até o ponto de partida
const TRIP_COLOR = 'ef4444' // vermelho: do ponto de partida até o destino (mesma cor do mapa aberto)
const STOP_COLOR = 'eab308' // amarelo: pin da parada, quando existe

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
    /** Até 2 paradas opcionais entre a partida e a chegada, em ordem. */
    stops?: { lng: number; lat: number }[]
    driverLng: number | null
    driverLat: number | null
    onExpand?: () => void
    /** Km/tempo de cada trecho, pra o card mostrar sem repetir a legenda embaixo do mapa. */
    onInfo?: (info: { toPickupKm: number | null; toPickupMin: number | null; tripKm: number; tripMin: number }) => void
    /** Esconde a legenda em texto (o card já mostra os números). */
    compact?: boolean
    /** Anima o mini mapa até a tela cheia antes de chamar onExpand (padrão: sim). */
    transition?: boolean
}

// Chave em sessionStorage: a imagem do mini mapa que "cresce" até a tela cheia;
// /aceitar-corridas/mapa a usa de fundo até o mapa de verdade carregar.
export const MAP_TRANSITION_KEY = 'iuser-map-transition'

export default function RideMiniMap({ originLng, originLat, destLng, destLat, stops = [], driverLng, driverLat, onExpand, onInfo, compact = false, transition = true }: RideMiniMapProps) {
    const { colors } = useTheme()
    const [imgUrl, setImgUrl] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)
    const [toPickupKm, setToPickupKm] = useState<number | null>(null)
    const [toPickupMin, setToPickupMin] = useState<number | null>(null)
    const [tripKm, setTripKm] = useState<number | null>(null)
    const [tripMin, setTripMin] = useState<number | null>(null)
    const hasDriver = driverLng != null && driverLat != null
    const wrapRef = useRef<HTMLDivElement>(null)
    const [flight, setFlight] = useState<{ rect: DOMRect; go: boolean } | null>(null)

    // "Ver no mapa": o mini mapa cresce até a tela cheia e só então navega — na
    // página do mapa o card sobe de baixo, parecendo que o mapa abriu pra trás.
    const handleExpand = () => {
        const el = wrapRef.current
        if (!el || !imgUrl || !onExpand || !transition) { onExpand?.(); return }
        try { sessionStorage.setItem(MAP_TRANSITION_KEY, imgUrl) } catch { /* sem storage: só perde o efeito */ }
        setFlight({ rect: el.getBoundingClientRect(), go: false })
        requestAnimationFrame(() => requestAnimationFrame(() => setFlight((f) => (f ? { ...f, go: true } : f))))
        setTimeout(onExpand, 360)
        setTimeout(() => setFlight(null), 2500)
    }
    const stopsKey = stops.map((s) => `${s.lng},${s.lat}`).join('|')

    useEffect(() => {
        let cancelled = false
        setFailed(false)

        const build = async () => {
            const overlays: string[] = []
            let nextToPickupKm: number | null = null
            let nextToPickupMin: number | null = null

            if (hasDriver) {
                const leg = await fetchRoute([driverLng as number, driverLat as number], [originLng, originLat])
                nextToPickupKm = leg.distanceKm
                nextToPickupMin = leg.durationMin
                // Desloca as duas pernas pra lados opostos: se o motorista tiver
                // que ir e voltar pelo mesmo trecho de rua, as duas cores ficam
                // lado a lado no mapa em vez de uma cobrir a outra.
                overlays.push(`path-3+${TO_PICKUP_COLOR}-0.85(${encodeURIComponent(encodePolyline(offsetPolyline(leg.coords, 5)))})`)
            }

            // Com paradas, soma cada perna (partida→parada1→parada2→chegada)
            // num trajeto só, igual ao que a pessoa viu ao pedir a corrida.
            const waypoints: [number, number][] = [[originLng, originLat], ...stops.map((s) => [s.lng, s.lat] as [number, number]), [destLng, destLat]]
            const legs = await Promise.all(waypoints.slice(0, -1).map((from, i) => fetchRoute(from, waypoints[i + 1])))
            const trip = {
                coords: legs.flatMap((leg) => leg.coords),
                distanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
                durationMin: legs.reduce((sum, leg) => sum + leg.durationMin, 0),
            }
            overlays.push(`path-4+${TRIP_COLOR}-0.9(${encodeURIComponent(encodePolyline(offsetPolyline(trip.coords, -5)))})`)

            if (hasDriver) overlays.push(`pin-s+${TO_PICKUP_COLOR}(${driverLng},${driverLat})`)
            overlays.push(`pin-s+22c55e(${originLng},${originLat})`)
            for (const s of stops) overlays.push(`pin-s+${STOP_COLOR}(${s.lng},${s.lat})`)
            overlays.push(`pin-s+ef4444(${destLng},${destLat})`)

            const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays.join(',')}/auto/500x220@2x?padding=40&access_token=${MAPBOX_TOKEN}`
            if (!cancelled) {
                setImgUrl(url)
                setToPickupKm(nextToPickupKm)
                setToPickupMin(nextToPickupMin)
                setTripKm(trip.distanceKm)
                setTripMin(trip.durationMin)
                onInfo?.({ toPickupKm: nextToPickupKm, toPickupMin: nextToPickupMin, tripKm: trip.distanceKm, tripMin: trip.durationMin })
            }
        }

        build().catch(() => { if (!cancelled) setFailed(true) })

        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [originLng, originLat, destLng, destLat, stopsKey, driverLng, driverLat, hasDriver])

    if (failed) return null

    return (
        <div className={compact ? '' : 'mb-2'}>
            {flight && imgUrl && typeof document !== 'undefined' && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        zIndex: 100,
                        left: flight.go ? 0 : flight.rect.left,
                        top: flight.go ? 0 : flight.rect.top,
                        width: flight.go ? '100vw' : flight.rect.width,
                        height: flight.go ? '100dvh' : flight.rect.height,
                        borderRadius: flight.go ? 0 : 12,
                        backgroundImage: `url(${imgUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        boxShadow: flight.go ? 'none' : '0 8px 24px rgba(0,0,0,0.25)',
                        transition: 'all 360ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                        pointerEvents: 'none',
                    }}
                />,
                document.body
            )}
            <div ref={wrapRef} className="w-full rounded-xl overflow-hidden relative" style={{ height: compact ? 104 : 120, background: `${colors.border}30` }}>
                {imgUrl ? (
                    <img src={imgUrl} alt="Trajeto da corrida" className="w-full h-full object-cover" onError={() => setFailed(true)} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[10px]" style={{ color: colors.textSecondary }}>Carregando mapa...</span>
                    </div>
                )}
                {onExpand && (
                    <button
                        onClick={handleExpand}
                        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold shadow-lg"
                        style={{ background: colors.surface, color: colors.textPrimary }}
                    >
                        <Expand size={11} />
                        Ver no mapa
                    </button>
                )}
            </div>
            {!compact && (<>
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
                        Até a partida: {toPickupKm.toFixed(1)} km{toPickupMin != null ? ` · ${Math.round(toPickupMin)} min` : ''}
                    </span>
                )}
                {tripKm != null && (
                    <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                        <span className="w-3 h-[3px] rounded-full flex-shrink-0" style={{ background: `#${TRIP_COLOR}` }} />
                        Partida → chegada: {tripKm.toFixed(1)} km{tripMin != null ? ` · ${Math.round(tripMin)} min` : ''}
                    </span>
                )}
                {hasDriver && toPickupKm != null && tripKm != null && (
                    <span className="text-[9px] font-black" style={{ color: colors.textPrimary }}>
                        Total: {(toPickupKm + tripKm).toFixed(1)} km
                        {toPickupMin != null && tripMin != null ? ` · ${Math.round(toPickupMin + tripMin)} min` : ''}
                    </span>
                )}
            </div>
            </>)}
        </div>
    )
}
