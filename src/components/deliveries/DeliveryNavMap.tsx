// src/components/deliveries/DeliveryNavMap.tsx
//
// MAPA DE NAVEGAÇÃO da Central de entregas (/entregas): mapa de verdade (Mapbox) com a loja, as paradas numeradas, o motorista e a ROTA — a rota viva
// (você → próximo ponto, em azul, refeita conforme ele anda), o plano da saída inteira (loja → paradas, tracejado laranja) —, mais o GUIA: a próxima
// manobra ("Em 300 m: vire à direita na Rua X"), a distância e o tempo até o ponto, voz opcional e o modo centralizar/movimentar (arrastar o mapa solta a câmera).
// Só apresentação: quem decide o alvo é a tela; as rotas vêm da Directions API do Mapbox (mesmo token do resto do app).
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ArrowUp, CornerUpLeft, CornerUpRight, Flag, LocateFixed, Maximize2, Minimize2, MoveLeft, MoveRight, RotateCw, Store as StoreIcon } from 'lucide-react'
import { vehicleMarkerHtml } from '@/lib/vehicleMarkerIcon'
import { haversineKm } from '@/lib/mapboxRoute'
import { useVoiceNavigation } from '@/lib/voiceNavigation'
import { trackMapboxRequest } from '@/lib/mapboxTelemetry'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

export interface NavPoint { lat: number; lng: number }
export interface NavStop { id: string; n: number; to: NavPoint; label?: string }
export interface NavTarget extends NavPoint { id: string; kind: 'store' | 'stop'; label: string }

interface Maneuver { text: string; meters: number; type: string; modifier?: string }
interface Live { coords: [number, number][]; km: number; min: number; steps: Maneuver[] }

const BLUE = '#3b82f6'
const ORANGE = '#f97316'
const GREEN = '#16a34a'

async function directions(points: [number, number][], steps: boolean): Promise<{ coords: [number, number][]; km: number; min: number; steps: Maneuver[] } | null> {
    if (points.length < 2 || points.length > 12) return null
    try {
        trackMapboxRequest('directions')
        const path = points.map((p) => p.join(',')).join(';')
        const r = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${path}?geometries=geojson&overview=full&steps=${steps}&language=pt&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`)
        const d = await r.json()
        const route = d.routes?.[0]
        if (!route?.geometry?.coordinates?.length) return null
        const st: Maneuver[] = steps ? ((route.legs?.[0]?.steps || []) as any[]).map((s) => ({ text: String(s.maneuver?.instruction || ''), meters: Number(s.distance) || 0, type: String(s.maneuver?.type || ''), modifier: s.maneuver?.modifier })) : []
        return { coords: route.geometry.coordinates, km: route.distance / 1000, min: route.duration / 60, steps: st }
    } catch { return null }
}

const bearing = (a: [number, number], b: [number, number]) => {
    const f1 = (a[1] * Math.PI) / 180, f2 = (b[1] * Math.PI) / 180, dl = ((b[0] - a[0]) * Math.PI) / 180
    const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
const meters = (m: number) => (m >= 950 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`)

function ManeuverIcon({ type, modifier }: { type: string; modifier?: string }) {
    const s = 26
    if (type === 'arrive') return <Flag size={s} />
    if (modifier?.includes('uturn')) return <RotateCw size={s} />
    if (modifier === 'left' || modifier === 'sharp left') return <CornerUpLeft size={s} />
    if (modifier === 'right' || modifier === 'sharp right') return <CornerUpRight size={s} />
    if (modifier === 'slight left') return <MoveLeft size={s} />
    if (modifier === 'slight right') return <MoveRight size={s} />
    return <ArrowUp size={s} />
}

const dot = (bg: string, txt: string, size = 26, ring = false) => {
    const el = document.createElement('div')
    el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font:900 ${Math.round(size * 0.46)}px system-ui;${ring ? 'outline:3px solid ' + bg + '66;' : ''}`
    el.textContent = txt
    return el
}

export default function DeliveryNavMap({
    me, store, stops, target, height, full, onToggleFull, voice, colors,
}: {
    me: NavPoint | null; store: NavPoint | null; stops: NavStop[]; target: NavTarget | null
    height: number | string; full?: boolean; onToggleFull?: () => void; voice?: boolean; colors: any
}) {
    const box = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const [ready, setReady] = useState(false)
    const [follow, setFollow] = useState(true)
    const followRef = useRef(true)
    const [live, setLive] = useState<Live | null>(null)
    const marks = useRef<{ store?: mapboxgl.Marker; me?: mapboxgl.Marker; stops: Map<string, mapboxgl.Marker> }>({ stops: new Map() })
    const lastFetch = useRef<{ at: number; from: [number, number] | null; target: string | null }>({ at: 0, from: null, target: null })
    const fitted = useRef<string>('')

    useEffect(() => { followRef.current = follow }, [follow])

    // ---- mapa (uma vez)
    useEffect(() => {
        if (!box.current || map.current) return
        const c = me || store || (target ? { lat: target.lat, lng: target.lng } : { lat: -8.76, lng: -63.9 })
        const m = new mapboxgl.Map({ container: box.current, style: 'mapbox://styles/mapbox/streets-v12', center: [c.lng, c.lat], zoom: 14.5, attributionControl: false })
        map.current = m
        ;(window as any).__navMap = m   // depuração local
        m.on('error', (e) => console.warn('[DeliveryNavMap] mapbox:', (e as any)?.error?.message || e))
        m.on('dragstart', () => setFollow(false))
        m.on('zoomstart', (e) => { if ((e as { originalEvent?: unknown }).originalEvent) setFollow(false) })
        m.on('rotatestart', (e) => { if ((e as { originalEvent?: unknown }).originalEvent) setFollow(false) })
        m.on('load', () => {
            const empty = { type: 'FeatureCollection' as const, features: [] }
            m.addSource('plan', { type: 'geojson', data: empty })
            m.addLayer({ id: 'plan-casing', type: 'line', source: 'plan', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8, 'line-opacity': 0.8 } })
            m.addLayer({ id: 'plan', type: 'line', source: 'plan', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ORANGE, 'line-width': 4, 'line-dasharray': [1.4, 1.6], 'line-opacity': 0.9 } })
            m.addSource('live', { type: 'geojson', data: empty })
            m.addLayer({ id: 'live-casing', type: 'line', source: 'live', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 11 } })
            m.addLayer({ id: 'live', type: 'line', source: 'live', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': BLUE, 'line-width': 6.5 } })
            setReady(true)
        })
        const ro = new ResizeObserver(() => m.resize())
        ro.observe(box.current)
        return () => { ro.disconnect(); m.remove(); map.current = null; setReady(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const setLine = useCallback((id: 'plan' | 'live', coords: [number, number][]) => {
        const src = map.current?.getSource(id) as mapboxgl.GeoJSONSource | undefined
        src?.setData({ type: 'FeatureCollection', features: coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [] })
    }, [])

    // ---- marcadores: loja, paradas (a atual maior), você
    const stopsKey = stops.map((s) => `${s.id}:${s.n}`).join(',')
    useEffect(() => {
        const m = map.current
        if (!m || !ready) return
        if (store) {
            if (!marks.current.store) marks.current.store = new mapboxgl.Marker({ element: dot(GREEN, 'L', 30) }).setLngLat([store.lng, store.lat]).addTo(m)
            else marks.current.store.setLngLat([store.lng, store.lat])
        }
        const keep = new Set(stops.map((s) => s.id))
        marks.current.stops.forEach((mk, id) => { if (!keep.has(id)) { mk.remove(); marks.current.stops.delete(id) } })
        stops.forEach((s) => {
            marks.current.stops.get(s.id)?.remove()
            const cur = target?.kind === 'stop' && target.id === s.id
            marks.current.stops.set(s.id, new mapboxgl.Marker({ element: dot(cur ? ORANGE : '#c2410c', String(s.n), cur ? 34 : 26, cur) }).setLngLat([s.to.lng, s.to.lat]).addTo(m))
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, stopsKey, target?.id, store?.lat, store?.lng])

    useEffect(() => {
        const m = map.current
        if (!m || !ready || !me) return
        if (!marks.current.me) {
            const el = document.createElement('div')
            el.innerHTML = vehicleMarkerHtml('moto', BLUE, 'Você')
            marks.current.me = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([me.lng, me.lat]).addTo(m)
        } else marks.current.me.setLngLat([me.lng, me.lat])
    }, [ready, me?.lat, me?.lng])

    // ---- plano da saída (loja → paradas)
    useEffect(() => {
        if (!ready) return
        const pts: [number, number][] = [...(store ? [[store.lng, store.lat] as [number, number]] : []), ...stops.map((s) => [s.to.lng, s.to.lat] as [number, number])]
        if (pts.length < 2) { setLine('plan', []); return }
        let off = false
        directions(pts, false).then((r) => { if (!off) setLine('plan', r?.coords || pts) })
        return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, stopsKey, store?.lat, store?.lng])

    // ---- rota viva (você → alvo), refeita a cada ~4 s se andou ≥ 40 m ou se o alvo mudou
    useEffect(() => {
        if (!ready) return
        if (!me || !target) { setLive(null); setLine('live', []); return }
        const from: [number, number] = [me.lng, me.lat]
        const lf = lastFetch.current
        const moved = lf.from ? haversineKm(lf.from, from) * 1000 : Infinity
        const changed = lf.target !== target.id
        if (!changed && (Date.now() - lf.at < 4000 || moved < 40)) return
        lastFetch.current = { at: Date.now(), from, target: target.id }
        let off = false
        directions([from, [target.lng, target.lat]], true).then((r) => {
            if (off) return
            if (!r) { const km = haversineKm(from, [target.lng, target.lat]); setLive({ coords: [from, [target.lng, target.lat]], km, min: (km / 28) * 60, steps: [] }); setLine('live', [from, [target.lng, target.lat]]); return }
            setLive({ coords: r.coords, km: r.km, min: r.min, steps: r.steps }); setLine('live', r.coords)
        })
        return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, me?.lat, me?.lng, target?.id])

    // ---- câmera: segue o motorista (de frente para a rota); solta quando ele mexe no mapa
    useEffect(() => {
        const m = map.current
        if (!m || !ready) return
        if (follow && me) {
            const ahead = live?.coords.find((c) => haversineKm([me.lng, me.lat], c) * 1000 > 35)
            m.easeTo({ center: [me.lng, me.lat], zoom: 16, bearing: ahead ? bearing([me.lng, me.lat], ahead) : m.getBearing(), pitch: 38, duration: 900 })
        }
    }, [ready, follow, me?.lat, me?.lng, live?.coords.length])
    // enquadra tudo ao abrir / quando a saída muda (e não está seguindo)
    useEffect(() => {
        const m = map.current
        if (!m || !ready || follow) return
        const key = `${stopsKey}|${target?.id}`
        if (fitted.current === key) return
        fitted.current = key
        const b = new mapboxgl.LngLatBounds()
        if (me) b.extend([me.lng, me.lat]); if (store) b.extend([store.lng, store.lat]); stops.forEach((s) => b.extend([s.to.lng, s.to.lat]))
        if (!b.isEmpty()) m.fitBounds(b, { padding: 60, maxZoom: 16, duration: 800, pitch: 0, bearing: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, follow, stopsKey, target?.id])
    useEffect(() => { map.current?.resize() }, [full])

    // ---- voz curva a curva (preferência do motorista)
    useVoiceNavigation({
        enabled: !!voice, active: !!target && !!me, driverCoords: me ? [me.lng, me.lat] : null, targetCoords: target ? [target.lng, target.lat] : null,
        legKey: target ? `${target.kind}-${target.id}` : null, introMessage: target ? (target.kind === 'store' ? 'Indo para a loja.' : 'Indo para a entrega.') : undefined,
    })

    // ---- guia: a próxima manobra
    const next = live?.steps && live.steps.length > 1 ? { dist: live.steps[0].meters, m: live.steps[1] } : null
    const arrived = !!live && live.km * 1000 < 40

    return (
        <div className="relative w-full overflow-hidden" style={{ height, borderRadius: full ? 0 : 20, border: full ? 'none' : `1px solid ${colors.border}` }}>
            <div ref={box} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />   {/* inline: o CSS do mapbox-gl põe `position: relative` na classe .mapboxgl-map e zeraria a altura */}
            {/* Guia no topo */}
            {target && (
                <div className="absolute left-2 right-2 top-2 rounded-2xl text-white flex items-center gap-3 px-3 py-2.5 shadow-lg" style={{ background: arrived ? GREEN : '#0f172a' }}>
                    <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.14)' }}>
                        {arrived ? <Flag size={26} /> : next ? <ManeuverIcon type={next.m.type} modifier={next.m.modifier} /> : <ArrowUp size={26} />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-black leading-tight">{arrived ? 'Você chegou' : next ? `Em ${meters(next.dist)}` : live ? `Siga por ${meters(live.km * 1000)}` : 'Calculando a rota…'}</span>
                        <span className="block text-[12px] opacity-90 leading-snug line-clamp-2">{arrived ? target.label : next ? next.m.text : target.label}</span>
                    </span>
                    {live && !arrived && (
                        <span className="text-right flex-shrink-0">
                            <span className="block text-[15px] font-black leading-tight">{Math.max(1, Math.round(live.min))} min</span>
                            <span className="block text-[11px] opacity-80">{meters(live.km * 1000)}</span>
                        </span>
                    )}
                </div>
            )}
            {/* Controles */}
            <div className="absolute right-2 bottom-2 flex flex-col gap-2">
                {onToggleFull && (
                    <button onClick={onToggleFull} aria-label={full ? 'Reduzir o mapa' : 'Ampliar o mapa'} className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg bg-white text-slate-800 active:scale-95 transition">
                        {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                )}
                <button onClick={() => setFollow(true)} aria-label="Centralizar em mim" className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition" style={{ background: follow ? BLUE : '#fff', color: follow ? '#fff' : '#1e293b' }}>
                    <LocateFixed size={18} />
                </button>
            </div>
            <span className="absolute left-2 bottom-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 text-slate-700 flex items-center gap-1">
                {target?.kind === 'store' ? <StoreIcon size={10} /> : null}{follow ? 'Seguindo você' : 'Mapa solto'}
            </span>
            {!ready && <div className="absolute inset-0 flex items-center justify-center text-xs font-bold animate-pulse" style={{ background: `${colors.border}30`, color: colors.textSecondary }}>Abrindo o mapa…</div>}
        </div>
    )
}
