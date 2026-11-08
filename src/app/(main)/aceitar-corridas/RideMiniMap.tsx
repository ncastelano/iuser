// app/(main)/aceitar-corridas/RideMiniMap.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

/** diagonal (graus) da caixa que contém os pontos: serve só para comparar tamanhos */
function bboxDiag(pts: [number, number][]): number {
    if (pts.length === 0) return 0
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
    return Math.hypot(maxX - minX, maxY - minY)
}
/** o trecho do motorista só entra na imagem se não "afastar" o mapa a ponto de a corrida virar um risco */
const DRIVER_FRAME_MAX_RATIO = 2.2

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
    /** Miniatura: preenche o espaço do pai (que dá o tamanho), sem legenda nem botão, com a imagem na proporção de um quadradinho. */
    thumb?: boolean
}

// Chave em sessionStorage: a imagem do mini mapa que "cresce" até a tela cheia;
// /aceitar-corridas/mapa a usa de fundo até o mapa de verdade carregar.
export const MAP_TRANSITION_KEY = 'iuser-map-transition'

export default function RideMiniMap({ originLng, originLat, destLng, destLat, stops = [], driverLng, driverLat, onExpand, onInfo, compact = false, transition = true, thumb = false }: RideMiniMapProps) {
    const { colors } = useTheme()
    const [overlayStr, setOverlayStr] = useState<string | null>(null)
    const [driverShown, setDriverShown] = useState(false)
    // tamanho real do quadro: a imagem é pedida NA MESMA proporção, senão o object-cover corta o trajeto
    const [box, setBox] = useState<{ w: number; h: number } | null>(null)
    const [failed, setFailed] = useState(false)
    const [toPickupKm, setToPickupKm] = useState<number | null>(null)
    const [toPickupMin, setToPickupMin] = useState<number | null>(null)
    const [tripKm, setTripKm] = useState<number | null>(null)
    const [tripMin, setTripMin] = useState<number | null>(null)
    const hasDriver = driverLng != null && driverLat != null
    const wrapRef = useRef<HTMLDivElement>(null)
    const [flight, setFlight] = useState<{ rect: DOMRect; go: boolean } | null>(null)

    useEffect(() => {
        const el = wrapRef.current
        if (!el) return
        const measure = () => {
            // arredonda de 20 em 20 px: redimensionar um pouco não refaz a imagem à toa
            const w = Math.round(el.clientWidth / 20) * 20
            const h = Math.round(el.clientHeight / 20) * 20
            if (w < 40 || h < 40) return
            setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }))
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [thumb])

    const imgUrl = useMemo(() => {
        if (!overlayStr || !box) return null
        const w = Math.min(640, Math.max(40, box.w))
        const h = Math.min(640, Math.max(40, box.h))
        // folga em cima maior (o pino é alto) e laterais proporcionais ao quadro: o trajeto inteiro cabe sempre.
        // Na miniatura não há pinos: a folga é igual dos quatro lados e pequena, para a rota ocupar o quadro.
        const top = thumb ? Math.round(Math.min(14, h * 0.14)) : Math.round(Math.min(46, h * 0.3))
        const bottom = thumb ? Math.round(Math.min(14, h * 0.14)) : Math.round(Math.min(26, h * 0.16))
        const side = thumb ? Math.round(Math.min(16, w * 0.1)) : Math.round(Math.min(40, w * 0.1))
        return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlayStr}/auto/${w}x${h}@2x?padding=${top},${side},${bottom},${side}&access_token=${MAPBOX_TOKEN}`
    }, [overlayStr, box, thumb])

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
            let driverOverlay: string | null = null
            let driverCoords: [number, number][] = []

            if (hasDriver) {
                const leg = await fetchRoute([driverLng as number, driverLat as number], [originLng, originLat])
                nextToPickupKm = leg.distanceKm
                nextToPickupMin = leg.durationMin
                driverCoords = leg.coords
                // Desloca as duas pernas pra lados opostos: se o motorista tiver
                // que ir e voltar pelo mesmo trecho de rua, as duas cores ficam
                // lado a lado no mapa em vez de uma cobrir a outra.
                driverOverlay = `path-3+${TO_PICKUP_COLOR}-0.85(${encodeURIComponent(encodePolyline(offsetPolyline(leg.coords, 5)))})`
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

            // ENQUADRAMENTO: o foco é a corrida. Motorista longe (ex.: 12 km até buscar numa corrida de 2 km) afastaria o mapa
            // até a corrida virar um risco; nesse caso o trecho dele fica fora da imagem (os km/min dele seguem no card).
            const tripDiag = bboxDiag([...trip.coords, [originLng, originLat], [destLng, destLat]])
            const withDriverDiag = bboxDiag([...trip.coords, ...driverCoords, [originLng, originLat], [destLng, destLat], [driverLng as number, driverLat as number]])
            const showDriver = hasDriver && driverOverlay !== null && tripDiag > 0 && withDriverDiag <= tripDiag * DRIVER_FRAME_MAX_RATIO

            if (showDriver && driverOverlay) overlays.push(driverOverlay)
            overlays.push(`path-4+${TRIP_COLOR}-0.9(${encodeURIComponent(encodePolyline(offsetPolyline(trip.coords, -5)))})`)

            // A MINIATURA (thumb) é pequena: os pinos cobriam a rota, então nela fica só a linha do trajeto; o mapa maior mantém os pinos
            if (!thumb) {
                if (showDriver) overlays.push(`pin-s+${TO_PICKUP_COLOR}(${driverLng},${driverLat})`)
                overlays.push(`pin-s+22c55e(${originLng},${originLat})`)
                for (const s of stops) overlays.push(`pin-s+${STOP_COLOR}(${s.lng},${s.lat})`)
                overlays.push(`pin-s+ef4444(${destLng},${destLat})`)
            }

            if (!cancelled) {
                setOverlayStr(overlays.join(','))
                setDriverShown(showDriver)
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
    }, [originLng, originLat, destLng, destLat, stopsKey, driverLng, driverLat, hasDriver, thumb])

    if (failed) return null

    if (thumb) {
        return (
            <div ref={wrapRef} className="w-full h-full relative overflow-hidden" style={{ background: `${colors.border}30` }}>
                {imgUrl && <img src={imgUrl} alt="Trajeto da corrida" className="w-full h-full object-cover" onError={() => setFailed(true)} />}
            </div>
        )
    }

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
            <div ref={wrapRef} className="w-full rounded-xl overflow-hidden relative" style={{ height: compact ? 132 : 150, background: `${colors.border}30` }}>
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
                {driverShown && (
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
