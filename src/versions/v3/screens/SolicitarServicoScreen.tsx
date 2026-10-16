// src/versions/v3/screens/SolicitarServicoScreen.tsx
//
// /solicitar-servico na interface 3.0: o MAPA dos serviços do iUser ao redor de quem está olhando. Os pins são os
// serviços (de pessoas e de lojas); tocar num pin ou num card abre a ficha na folha de baixo. Quem não acha o que
// procura (inclusive um serviço que não está na lista) pede um serviço pela folha "Peça um serviço" — o pedido vai
// pro quadro e os profissionais da região mandam propostas. A regra (distância, raio, pedido, rascunho) mora em
// modules/service-requests. A 2.0 segue com a página antiga (app/(main)/solicitar-servico).
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { toast } from 'sonner'
import { ArrowLeft, ChevronRight, LocateFixed, MapPin, PlusCircle, Search, Store as StoreIcon, Target, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'
import { SERVICE_TYPES, getServiceIcon, getServiceLabel, type ServiceType } from '@/lib/serviceTypes'
import {
    RADIUS_OPTIONS, DEFAULT_RADIUS_KM, aroundMe, countBy, formatDistance, reverseGeocode, loadDraft, loadPublishedServices,
    type PublishedService,
} from '@/modules/service-requests'
import RequestSheet, { type Place } from './solicitar-servico/RequestSheet'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho
const PEEK_H = 188

// Coroas dos 3 mais vistos (mesmo padrão do /radar)
const RANK_COLORS: Record<number, { fill: string; stroke: string; text: string }> = {
    1: { fill: '#fbbf24', stroke: '#92400e', text: '#451a03' },
    2: { fill: '#e2e8f0', stroke: '#64748b', text: '#334155' },
    3: { fill: '#d97706', stroke: '#7c2d12', text: '#431407' },
}
const crownSvg = (rank: number, size: number) => {
    const c = RANK_COLORS[rank]
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M2.5 18.5h19l1.2-11.2-5.4 4.2L12 4 7.7 11.5 2.3 7.3z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4" stroke-linejoin="round"/><rect x="3" y="18.5" width="18" height="2.6" rx="1.1" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.2"/><text x="12" y="17" text-anchor="middle" font-size="8.5" font-weight="900" fill="${c.text}" font-family="system-ui,sans-serif">${rank}</text></svg>`
}
const PIN_FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'

type Snap = 'peek' | 'half' | 'full'
const typeKeyOf = (s: PublishedService) => (s.kind === 'store' ? 'loja' : s.serviceType || 'outro')
const typeLabelOf = (key: string) => (key === 'loja' ? 'Lojas' : getServiceLabel(key))
const coordKey = (s: PublishedService) => (s.lat != null && s.lng != null ? `${s.lng.toFixed(4)},${s.lat.toFixed(4)}` : null)

export default function SolicitarServicoScreen() {
    const router = useRouter()
    const { colors } = useTheme()

    // ----- dados -----
    const [services, setServices] = useState<PublishedService[] | null>(null)
    const [userCoords, setUserCoords] = useState<[number, number] | null>(null)
    const [userAddress, setUserAddress] = useState('')
    const [locating, setLocating] = useState(false)
    const [query, setQuery] = useState('')
    const [typeFilter, setTypeFilter] = useState<string>('todos')
    const [radiusKm, setRadiusKm] = useState<number | null>(DEFAULT_RADIUS_KM)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [clusterKey, setClusterKey] = useState<string | null>(null)

    // ----- pedido -----
    const [composerOpen, setComposerOpen] = useState(false)
    const [composerType, setComposerType] = useState<ServiceType | null>(null)
    const [urlPlace, setUrlPlace] = useState<Place | null>(null)

    // ----- folha -----
    const rootRef = useRef<HTMLDivElement>(null)
    const [rootH, setRootH] = useState(640)
    const [snap, setSnap] = useState<Snap>('peek')
    const [dragH, setDragH] = useState<number | null>(null)
    const dragStart = useRef<{ y: number; h: number } | null>(null)
    const snapH: Record<Snap, number> = { peek: PEEK_H, half: Math.round(rootH * 0.52), full: Math.round(rootH * 0.9) }
    const sheetH = dragH ?? snapH[snap]

    useEffect(() => {
        const measure = () => rootRef.current && setRootH(rootRef.current.clientHeight)
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])

    // ----- mapa -----
    const mapBox = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const [mapReady, setMapReady] = useState(false)
    const pinsRef = useRef<mapboxgl.Marker[]>([])
    const pinInnerRef = useRef<Map<string, HTMLElement>>(new Map())
    const meMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const fitDoneRef = useRef(false)

    useEffect(() => {
        if (!mapBox.current) return
        const map = new mapboxgl.Map({ container: mapBox.current, style: 'mapbox://styles/mapbox/streets-v12', center: DEFAULT_CENTER, zoom: 12, attributionControl: false })
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
        map.on('load', () => setMapReady(true))
        // arrastar o mapa recolhe a folha (ver mais mapa)
        map.on('dragstart', () => setSnap('peek'))
        mapRef.current = map
        return () => { map.remove(); mapRef.current = null }
    }, [])

    // ----- localização -----
    const locate = useCallback((silent = false) => {
        setLocating(true)
        getNativeCurrentPosition(
            async (pos) => {
                const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude]
                setUserCoords(coords)
                setLocating(false)
                fitDoneRef.current = true
                mapRef.current?.flyTo({ center: coords, zoom: 13.5, duration: 900, padding: { bottom: PEEK_H } })
                const address = await reverseGeocode(coords[0], coords[1])
                setUserAddress(address || `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`)
            },
            () => {
                setLocating(false)
                if (!silent) toast.error('Não conseguimos acessar sua localização', { description: 'Autorize a localização do navegador pra ver os serviços perto de você.', duration: 5000 })
            },
            { enableHighAccuracy: true, timeout: 10000 },
        )
    }, [])

    useEffect(() => {
        loadPublishedServices(supabase).then(setServices).catch(() => setServices([]))

        // atalhos: ?tipo= / ?local= abrem direto o pedido; rascunho (volta do login) também
        const params = new URLSearchParams(window.location.search)
        const tipo = params.get('tipo')
        const local = params.get('local')
        const lat = params.get('lat')
        const lng = params.get('lng')
        let open = false
        if (SERVICE_TYPES.some((t) => t.id === tipo)) { setComposerType(tipo as ServiceType); open = true }
        if (local) { setUrlPlace({ address: local, coords: lat && lng ? [parseFloat(lng), parseFloat(lat)] : null }); open = true }
        if (loadDraft()) open = true
        if (open) setComposerOpen(true)
    }, [])

    useEffect(() => {
        if (mapReady) locate(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady])

    // "você": bolinha azul no mapa
    useEffect(() => {
        const map = mapRef.current
        if (!mapReady || !map) return
        meMarkerRef.current?.remove()
        meMarkerRef.current = null
        if (!userCoords) return
        const el = document.createElement('div')
        el.style.cssText = 'width:20px;height:20px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,0.25),0 2px 8px rgba(0,0,0,0.3);'
        meMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(userCoords).addTo(map)
    }, [mapReady, userCoords])

    // ----- derivados -----
    const me = useMemo(() => (userCoords ? { lat: userCoords[1], lng: userCoords[0] } : null), [userCoords])
    const around = useMemo(() => aroundMe(services || [], me, radiusKm), [services, me, radiusKm])
    const searched = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return around
        return around.filter((s) => s.name.toLowerCase().includes(q) || (s.ownerName || '').toLowerCase().includes(q) || typeLabelOf(typeKeyOf(s)).toLowerCase().includes(q))
    }, [around, query])
    const typeChips = useMemo(() => countBy(searched, typeKeyOf), [searched])
    const visible = useMemo(() => {
        let list = typeFilter === 'todos' ? searched : searched.filter((s) => typeKeyOf(s) === typeFilter)
        if (clusterKey) list = list.filter((s) => coordKey(s) === clusterKey)
        return list
    }, [searched, typeFilter, clusterKey])
    const selected = useMemo(() => (services || []).find((s) => s.id === selectedId) || null, [services, selectedId])
    const selectedDistance = selected ? around.find((s) => s.id === selected.id)?.distanceKm ?? null : null

    // o filtro de tipo some se o tipo deixou de existir no raio
    useEffect(() => {
        if (typeFilter !== 'todos' && !typeChips.some((c) => c.key === typeFilter)) setTypeFilter('todos')
    }, [typeChips, typeFilter])

    // ----- pins -----
    const choose = useCallback((s: PublishedService, fly = true) => {
        setSelectedId(s.id)
        setSnap('peek')
        if (fly && s.lat != null && s.lng != null && mapRef.current) {
            mapRef.current.flyTo({ center: [s.lng, s.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 800, padding: { bottom: PEEK_H } })
        }
    }, [])

    useEffect(() => {
        const map = mapRef.current
        if (!mapReady || !map) return
        pinsRef.current.forEach((m) => m.remove())
        pinsRef.current = []
        pinInnerRef.current.clear()

        // ajusta o mapa aos pins uma vez, se a localização não veio
        if (!fitDoneRef.current && !userCoords) {
            const withCoords = visible.filter((s) => s.lat != null && s.lng != null)
            if (withCoords.length) {
                fitDoneRef.current = true
                const b = new mapboxgl.LngLatBounds()
                withCoords.forEach((s) => b.extend([s.lng!, s.lat!]))
                map.fitBounds(b, { padding: { top: 150, bottom: PEEK_H + 40, left: 40, right: 40 }, maxZoom: 15, duration: 700 })
            }
        }

        const rankOf = new Map<string, number>([...visible].sort((a, b) => b.viewCount - a.viewCount).slice(0, 3).map((s, i) => [s.id, i + 1]))
        const groups = new Map<string, PublishedService[]>()
        visible.forEach((s) => {
            const k = coordKey(s)
            if (!k) return
            if (!groups.has(k)) groups.set(k, [])
            groups.get(k)!.push(s)
        })

        groups.forEach((group, key) => {
            // o mais bem colocado no ranking fica por cima do monte
            const ordered = [...group].sort((a, b) => (rankOf.get(a.id) || 99) - (rankOf.get(b.id) || 99))
            ordered.forEach((s, index) => {
                const rank = rankOf.get(s.id)
                const size = rank ? 56 : 46
                const el = document.createElement('div')
                el.style.zIndex = rank ? String(600 - rank) : String(100 - index)
                const inner = document.createElement('div')
                inner.style.cssText = `width:${size}px;height:${size}px;border-radius:${s.kind === 'store' ? '12px' : '9999px'};overflow:hidden;border:3px solid ${rank ? RANK_COLORS[rank].fill : '#f97316'};cursor:pointer;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,0.3);transition:transform .2s;`
                if (s.imageUrl || s.avatarUrl) {
                    const img = document.createElement('img')
                    img.src = (s.imageUrl || s.avatarUrl)!
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
                    img.onerror = () => { inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${PIN_FALLBACK}</div>` }
                    inner.appendChild(img)
                } else {
                    inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${PIN_FALLBACK}</div>`
                }
                el.appendChild(inner)
                pinInnerRef.current.set(s.id, inner)

                if (rank) {
                    const crown = document.createElement('div')
                    crown.innerHTML = crownSvg(rank, 30)
                    crown.style.cssText = 'position:absolute;top:-24px;left:50%;transform:translateX(-50%);pointer-events:none;line-height:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));'
                    el.appendChild(crown)
                }
                if (index === 0 && ordered.length > 1) {
                    const badge = document.createElement('div')
                    badge.textContent = String(ordered.length)
                    badge.style.cssText = 'position:absolute;bottom:-8px;right:-8px;background:linear-gradient(135deg,#f97316,#ef4444);color:#fff;font-size:10px;font-weight:900;padding:3px 8px;border-radius:20px;border:2px solid #fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);'
                    badge.onclick = (e) => {
                        e.stopPropagation()
                        setClusterKey(key)
                        setSelectedId(null)
                        setSnap('half')
                        map.flyTo({ center: [s.lng!, s.lat!], zoom: 17, duration: 600, padding: { bottom: PEEK_H } })
                    }
                    el.appendChild(badge)
                }
                el.onclick = () => choose(s)
                pinsRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([s.lng!, s.lat!]).addTo(map))
            })
        })

        return () => { pinsRef.current.forEach((m) => m.remove()); pinsRef.current = [] }
    }, [mapReady, visible, choose, userCoords])

    // pin escolhido: destaca (sem refazer todos os pins)
    useEffect(() => {
        pinInnerRef.current.forEach((el, id) => {
            el.style.transform = id === selectedId ? 'scale(1.25)' : 'scale(1)'
            el.style.outline = id === selectedId ? '3px solid #fb923c' : 'none'
        })
    }, [selectedId, visible])

    // ----- arrastar a folha -----
    const onDragStart = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragStart.current = { y: e.clientY, h: sheetH }
    }
    const onDragMove = (e: React.PointerEvent) => {
        const d = dragStart.current
        if (!d) return
        setDragH(Math.min(snapH.full, Math.max(snapH.peek, d.h + (d.y - e.clientY))))
    }
    const onDragEnd = () => {
        if (!dragStart.current) return
        dragStart.current = null
        const h = dragH ?? snapH[snap]
        setDragH(null)
        const best = (['peek', 'half', 'full'] as Snap[]).reduce((a, b) => (Math.abs(snapH[b] - h) < Math.abs(snapH[a] - h) ? b : a))
        setSnap(best)
    }

    // ----- ações -----
    const openComposer = () => {
        setComposerType(typeFilter !== 'todos' && typeFilter !== 'loja' && SERVICE_TYPES.some((t) => t.id === typeFilter) ? (typeFilter as ServiceType) : null)
        setComposerOpen(true)
    }
    const cycleRadius = () => {
        const i = RADIUS_OPTIONS.findIndex((o) => o.km === radiusKm)
        setRadiusKm(RADIUS_OPTIONS[(i + 1) % RADIUS_OPTIONS.length].km)
    }
    const back = () => (window.history.length > 1 ? router.back() : router.push('/'))
    const radiusLabel = RADIUS_OPTIONS.find((o) => o.km === radiusKm)?.label || 'Tudo'
    const radiusActive = !!me && radiusKm != null
    const soft = `${colors.border}40`

    const composerPlace: Place | null = urlPlace || (userCoords && userAddress ? { address: userAddress, coords: userCoords } : null)

    const title = (() => {
        if (services === null) return 'Procurando serviços...'
        const n = visible.length
        const what = typeFilter === 'todos' ? (n === 1 ? 'serviço' : 'serviços') : typeLabelOf(typeFilter).toLowerCase()
        if (clusterKey) return `${n} ${n === 1 ? 'serviço' : 'serviços'} neste local`
        if (n === 0) return 'Nenhum serviço por aqui'
        return `${n} ${what}${radiusActive ? ' perto de você' : ''}`
    })()

    const labelOf = (s: PublishedService) => (s.kind === 'store' ? 'Serviço da loja' : getServiceLabel(s.serviceType || 'outro'))
    const Thumb = ({ s, size }: { s: PublishedService; size: number }) => {
        const src = s.imageUrl || s.avatarUrl
        return (
            <span className={`flex-shrink-0 overflow-hidden flex items-center justify-center text-white font-black ${s.kind === 'store' ? 'rounded-xl' : 'rounded-full'}`} style={{ width: size, height: size, background: GRADIENT }}>
                {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : s.name.charAt(0)}
            </span>
        )
    }
    const distanceOf = (s: PublishedService) => formatDistance(around.find((a) => a.id === s.id)?.distanceKm ?? null)

    const chipStyle = (active: boolean) => (active
        ? { background: GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731655' }
        : { background: colors.surface, color: colors.textPrimary, boxShadow: '0 2px 8px rgba(0,0,0,0.18)' })

    return (
        <div ref={rootRef} className="fixed inset-x-0 bottom-0 svc-map" style={{ top: 'var(--shell-top, 0px)', background: colors.background, ['--sheet-h' as any]: `${sheetH}px` }}>
            {/* a logo e a atribuição do Mapbox ficam sempre acima da folha */}
            <style>{`.svc-map .mapboxgl-ctrl-bottom-left,.svc-map .mapboxgl-ctrl-bottom-right{bottom:calc(var(--sheet-h,0px) + 4px)!important;transition:bottom .2s ease}`}</style>

            <div className="absolute inset-0" style={{ isolation: 'isolate', zIndex: 0 }}>
                <div ref={mapBox} className="w-full h-full" />
            </div>

            {/* Topo: voltar + busca + filtros */}
            <div className="absolute top-3 inset-x-3 z-10 pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={back} aria-label="Voltar" className="flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-95" style={{ width: 46, height: 46, background: colors.surface, color: colors.textPrimary, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-full" style={{ height: 46, background: colors.surface, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
                        <Search size={17} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                        <input
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setClusterKey(null) }}
                            placeholder="Buscar serviço ou profissional"
                            className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                            style={{ color: colors.textPrimary }}
                        />
                        {query && <button onClick={() => setQuery('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={16} /></button>}
                    </div>
                </div>

                <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide pointer-events-auto -mx-3 px-3 pb-1">
                    <button onClick={cycleRadius} className="flex-shrink-0 h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-black transition active:scale-95" style={chipStyle(false)}>
                        <Target size={14} style={{ color: '#f97316' }} /> {me ? radiusLabel : 'Tudo'}
                    </button>
                    <button onClick={() => { setTypeFilter('todos'); setClusterKey(null) }} className="flex-shrink-0 h-9 px-3.5 rounded-full text-xs font-black whitespace-nowrap transition active:scale-95" style={chipStyle(typeFilter === 'todos')}>
                        Todos · {searched.length}
                    </button>
                    {typeChips.map((c) => {
                        const Icon = c.key === 'loja' ? StoreIcon : getServiceIcon(c.key)
                        return (
                            <button key={c.key} onClick={() => { setTypeFilter(c.key); setClusterKey(null) }} className="flex-shrink-0 h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-black whitespace-nowrap transition active:scale-95" style={chipStyle(typeFilter === c.key)}>
                                <Icon size={14} /> {typeLabelOf(c.key)} · {c.count}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Minha localização */}
            <button
                onClick={() => locate(false)}
                aria-label="Minha localização"
                className="absolute right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center active:scale-95"
                style={{ bottom: sheetH + 40, background: colors.surface, color: userCoords ? '#2563eb' : colors.textPrimary, boxShadow: '0 2px 10px rgba(0,0,0,0.25)', transition: dragH == null ? 'bottom .25s ease' : 'none' }}
            >
                <LocateFixed size={19} className={locating ? 'animate-pulse' : ''} />
            </button>

            {/* Folha de baixo */}
            <div
                className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl max-w-2xl mx-auto"
                style={{ height: sheetH, background: colors.surface, boxShadow: '0 -8px 30px rgba(0,0,0,0.3)', transition: dragH == null ? 'height .25s ease-out' : 'none' }}
            >
                <div
                    className="flex-shrink-0 w-full flex justify-center pt-2.5 pb-2 touch-none cursor-grab active:cursor-grabbing"
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                >
                    <span className="w-10 h-1 rounded-full" style={{ background: colors.border }} />
                </div>

                <div className={`flex-1 min-h-0 px-4 ${snap === 'peek' && dragH == null ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                    {selected && (
                        <div className="rounded-3xl p-3 flex items-center gap-3" style={{ background: soft }}>
                            <Thumb s={selected} size={64} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{selected.name}</p>
                                <p className="text-xs font-bold truncate" style={{ color: colors.accent }}>{labelOf(selected)}</p>
                                <p className="text-[11px] truncate flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                    {selected.kind === 'store' && <StoreIcon size={10} className="flex-shrink-0" />}
                                    <span className="truncate">{selected.ownerName}{selectedDistance != null ? ` · ${formatDistance(selectedDistance)}` : ''}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => selected.targetSlug && router.push(`/${selected.targetSlug}`)}
                                disabled={!selected.targetSlug}
                                className="flex-shrink-0 h-10 px-4 rounded-full text-xs font-black text-white flex items-center gap-1 disabled:opacity-50"
                                style={{ background: GRADIENT }}
                            >
                                {selected.kind === 'store' ? 'Ver loja' : 'Ver perfil'} <ChevronRight size={14} />
                            </button>
                            <button onClick={() => setSelectedId(null)} aria-label="Fechar" className="flex-shrink-0 -ml-1" style={{ color: colors.textSecondary }}><X size={18} /></button>
                        </div>
                    )}
                    {(!selected || snap !== 'peek' || dragH != null) && (
                        <div className={selected ? 'mt-3' : ''}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <h2 className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{title}</h2>
                                {clusterKey && (
                                    <button onClick={() => setClusterKey(null)} className="text-[11px] font-black flex items-center gap-1 flex-shrink-0" style={{ color: colors.accent }}>
                                        <X size={12} /> Ver todos
                                    </button>
                                )}
                            </div>

                            {services !== null && visible.length === 0 ? (
                                <div className="rounded-3xl p-4 text-center" style={{ background: soft }}>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        {radiusActive ? `Não há serviços num raio de ${radiusLabel}.` : 'Nada com esse filtro.'}
                                    </p>
                                    {radiusActive && (
                                        <button onClick={cycleRadius} className="mt-1.5 text-xs font-black" style={{ color: colors.accent }}>Ampliar a busca</button>
                                    )}
                                </div>
                            ) : snap === 'peek' && dragH == null ? (
                                // mini: carrossel
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                                    {visible.slice(0, 20).map((s) => (
                                        <button key={s.id} onClick={() => choose(s)} className="flex-shrink-0 w-48 rounded-2xl p-2 flex items-center gap-2 text-left transition active:scale-95" style={{ background: soft }}>
                                            <Thumb s={s} size={44} />
                                            <span className="min-w-0">
                                                <span className="block text-xs font-black truncate" style={{ color: colors.textPrimary }}>{s.name}</span>
                                                <span className="block text-[10px] truncate" style={{ color: colors.textSecondary }}>{labelOf(s)}{distanceOf(s) ? ` · ${distanceOf(s)}` : ''}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                // meio/cheia: lista
                                <div className="flex flex-col gap-1.5 pb-4">
                                    {visible.map((s) => (
                                        <button key={s.id} onClick={() => choose(s)} className="w-full rounded-2xl p-2 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: soft }}>
                                            <Thumb s={s} size={48} />
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{s.name}</span>
                                                <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{labelOf(s)} · {s.ownerName}</span>
                                            </span>
                                            {distanceOf(s) && <span className="text-[11px] font-black flex-shrink-0 flex items-center gap-0.5" style={{ color: colors.textPrimary }}><MapPin size={11} />{distanceOf(s)}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Não achou? Sempre à mão */}
                <div className="flex-shrink-0 px-4 pb-3 pt-2" style={{ background: colors.surface }}>
                    <button onClick={openComposer} className="w-full h-12 rounded-full font-black text-sm text-white flex items-center justify-center gap-2 transition active:scale-[0.98]" style={{ background: GRADIENT, boxShadow: '0 6px 18px #f9731655' }}>
                        <PlusCircle size={18} /> Não achou? Peça um serviço
                    </button>
                </div>
            </div>

            {composerOpen && (
                <RequestSheet
                    initialType={composerType}
                    initialPlace={composerPlace}
                    locating={locating}
                    onLocate={() => locate(false)}
                    onClose={() => setComposerOpen(false)}
                />
            )}
        </div>
    )
}
