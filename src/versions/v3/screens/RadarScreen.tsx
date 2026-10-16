// src/versions/v3/screens/RadarScreen.tsx
//
// /radar na interface 3.0: o mapa do que tem ao redor — lojas, serviços, produtos e pessoas. Barra de busca e modos
// com contagem no topo, filtros em chips (meu local, aberto agora, raio, ordem), pins com coroas 1/2/3 e uma folha
// arrastável com a lista por distância e a ficha do que for tocado (foto, nota, distância, ver, seguir, rota).
// A regra (filtro, ordem, distância, coroas) e a carga de dados moram em modules/radar. A 2.0 segue com a página antiga.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { toast } from 'sonner'
import {
    ArrowLeft, Briefcase, Check, ChevronRight, Crosshair, Layers, MapPin, MessageCircle, Navigation, Search, ShoppingCart, Star,
    Store as StoreIcon, Target, UserCheck, UserPlus, Users, X, ArrowDownUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'
import { notifyNewFollower } from '@/lib/notifyRideStatus'
import { getWhatsAppLink } from '@/lib/whatsapp'
import LocationPicker from '@/components/LocationPicker'
import { Shimmer } from '@/components/Skeleton'
import {
    SORT_OPTIONS, RADIUS_OPTIONS, filterItems, sortItems, crownRanks, countByKind, formatDistance, loadRadar,
    type RadarItem, type RadarKind, type RadarSort, type WithDistance,
} from '@/modules/radar'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho
const PEEK_H = 196

const MODES: { id: RadarKind; label: string; singular: string; plural: string; icon: typeof StoreIcon }[] = [
    { id: 'loja', label: 'Lojas', singular: 'loja', plural: 'lojas', icon: StoreIcon },
    { id: 'servico', label: 'Serviços', singular: 'serviço', plural: 'serviços', icon: Briefcase },
    { id: 'produto', label: 'Produtos', singular: 'produto', plural: 'produtos', icon: ShoppingCart },
    { id: 'pessoa', label: 'Pessoas', singular: 'pessoa', plural: 'pessoas', icon: Users },
]

const RANK_COLORS: Record<number, { fill: string; stroke: string; text: string }> = {
    1: { fill: '#facc15', stroke: '#a16207', text: '#713f12' },
    2: { fill: '#e2e8f0', stroke: '#64748b', text: '#334155' },
    3: { fill: '#d97706', stroke: '#7c2d12', text: '#431407' },
}
const crownSvg = (rank: number, size: number) => {
    const c = RANK_COLORS[rank]
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M2.5 18.5h19l1.2-11.2-5.4 4.2L12 4 7.7 11.5 2.3 7.3z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4" stroke-linejoin="round"/><rect x="3" y="18.5" width="18" height="2.6" rx="1.1" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.2"/><text x="12" y="17" text-anchor="middle" font-size="8.5" font-weight="900" fill="${c.text}" font-family="system-ui,sans-serif">${rank}</text></svg>`
}
const PIN_FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>'

type Snap = 'peek' | 'half' | 'full'
type Item = WithDistance<RadarItem>
const coordKey = (it: RadarItem) => `${it.lng.toFixed(4)},${it.lat.toFixed(4)}`
const brl = (n: number | null) => (n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const shortText = (a: string | null, max = 26) => { const f = (a || '').split(',')[0].trim(); return f.length > max ? `${f.slice(0, max - 1)}…` : f }

interface ProfileLoc { lat: number; lng: number; address: string; addressNumber: string; addressComplement: string }
interface Details { followers: number; whatsapp: string | null; instagram: string | null; topProducts: { id: string; name: string; slug: string; price: number | null; image: string | null }[] }

function Thumb({ it, size }: { it: RadarItem; size: number }) {
    return (
        <span className={`flex-shrink-0 overflow-hidden flex items-center justify-center text-white font-black ${it.kind === 'pessoa' ? 'rounded-full' : 'rounded-xl'}`} style={{ width: size, height: size, background: GRADIENT }}>
            {it.imageUrl ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" /> : it.name.replace('@', '').charAt(0).toUpperCase()}
        </span>
    )
}

export default function RadarScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, loading: profileLoading } = useProfile()
    const soft = `${colors.border}40`

    // ----- dados e filtros -----
    const [items, setItems] = useState<RadarItem[] | null>(null)
    const [kind, setKind] = useState<RadarKind>('loja')
    const [query, setQuery] = useState('')
    const [onlyOpen, setOnlyOpen] = useState(false)
    const [radiusKm, setRadiusKm] = useState<number | null>(null)
    const [sort, setSort] = useState<RadarSort>('perto')
    const [sortOpen, setSortOpen] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [clusterKey, setClusterKey] = useState<string | null>(null)

    // ----- onde a pessoa está -----
    const [profileLoc, setProfileLoc] = useState<ProfileLoc | null>(null)
    const [deviceLoc, setDeviceLoc] = useState<{ lat: number; lng: number } | null>(null)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [savingLoc, setSavingLoc] = useState(false)
    const me = useMemo(() => (profileLoc ? { lat: profileLoc.lat, lng: profileLoc.lng } : deviceLoc), [profileLoc, deviceLoc])

    // ----- folha -----
    const rootRef = useRef<HTMLDivElement>(null)
    const [rootH, setRootH] = useState(640)
    const [snap, setSnap] = useState<Snap>('peek')
    const [dragH, setDragH] = useState<number | null>(null)
    const dragStart = useRef<{ y: number; h: number } | null>(null)
    const snapH: Record<Snap, number> = { peek: PEEK_H, half: Math.round(rootH * 0.5), full: Math.round(rootH * 0.88) }
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
    const [satellite, setSatellite] = useState(false)
    const pinsRef = useRef<mapboxgl.Marker[]>([])
    const pinInnerRef = useRef<Map<string, HTMLElement>>(new Map())
    const meMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const centeredRef = useRef(false)

    useEffect(() => {
        if (!mapBox.current) return
        const map = new mapboxgl.Map({ container: mapBox.current, style: 'mapbox://styles/mapbox/streets-v12', center: DEFAULT_CENTER, zoom: 13, attributionControl: false })
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
        map.on('load', () => setMapReady(true))
        map.on('dragstart', () => setSnap('peek'))
        mapRef.current = map
        return () => { map.remove(); mapRef.current = null }
    }, [])
    useEffect(() => {
        mapRef.current?.setStyle(satellite ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/streets-v12')
    }, [satellite])

    // dados
    useEffect(() => {
        loadRadar(supabase).then(setItems).catch(() => setItems([]))
    }, [])

    // local salvo no perfil; sem ele, o GPS do aparelho (em silêncio)
    useEffect(() => {
        if (profileLoading) return
        let cancelled = false
        const fromDevice = () => getNativeCurrentPosition(
            (pos) => { if (!cancelled) setDeviceLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }) },
            () => { /* sem permissão: o radar segue sem distâncias */ },
            { enableHighAccuracy: true, timeout: 10000 },
        )
        if (!userId) { fromDevice(); return () => { cancelled = true } }
        supabase.from('profiles').select('address, address_number, address_complement, store_lat, store_lng').eq('id', userId).maybeSingle().then(({ data }) => {
            if (cancelled) return
            const d = data as any
            if (d?.store_lat != null && d?.store_lng != null) {
                setProfileLoc({ lat: Number(d.store_lat), lng: Number(d.store_lng), address: d.address || '', addressNumber: d.address_number || '', addressComplement: d.address_complement || '' })
            } else {
                fromDevice()
            }
        })
        return () => { cancelled = true }
    }, [userId, profileLoading])

    const saveLocation = async (loc: { lat: number; lng: number; address: string; addressNumber?: string; addressComplement?: string }) => {
        setSavingLoc(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { toast.error('Entre na sua conta pra salvar o local.'); return }
            const { data, error } = await supabase.from('profiles').upsert({
                id: user.id, address: loc.address, address_number: loc.addressNumber || null, address_complement: loc.addressComplement || null, store_lat: loc.lat, store_lng: loc.lng,
            }, { onConflict: 'id', ignoreDuplicates: false }).select('address, address_number, address_complement, store_lat, store_lng').single()
            if (error) { toast.error('Erro ao salvar: ' + error.message); return }
            setProfileLoc({ lat: Number(data.store_lat), lng: Number(data.store_lng), address: data.address || '', addressNumber: data.address_number || '', addressComplement: data.address_complement || '' })
            mapRef.current?.flyTo({ center: [Number(data.store_lng), Number(data.store_lat)], zoom: 14, duration: 900, padding: { bottom: PEEK_H } })
            toast.success('Local salvo', { description: shortText(data.address) })
        } catch (e) {
            toast.error('Erro: ' + (e as Error).message)
        } finally {
            setSavingLoc(false)
            setPickerOpen(false)
        }
    }
    const clearLocation = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { error } = await supabase.from('profiles').update({ address: null, address_number: null, address_complement: null, store_lat: null, store_lng: null }).eq('id', user.id)
        if (error) { toast.error('Erro ao remover: ' + error.message); return }
        setProfileLoc(null)
        setPickerOpen(false)
        toast.success('Local removido.')
    }

    // primeira vez que sabemos onde a pessoa está: centraliza o mapa
    useEffect(() => {
        if (!mapReady || !me || centeredRef.current) return
        centeredRef.current = true
        mapRef.current?.flyTo({ center: [me.lng, me.lat], zoom: 14, duration: 900, padding: { bottom: PEEK_H } })
    }, [mapReady, me])

    // "você" no mapa
    useEffect(() => {
        const map = mapRef.current
        if (!mapReady || !map) return
        meMarkerRef.current?.remove()
        meMarkerRef.current = null
        if (!me) return
        const el = document.createElement('div')
        el.style.cssText = 'width:20px;height:20px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,0.25),0 2px 8px rgba(0,0,0,0.3);'
        meMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(map)
    }, [mapReady, me])

    // ----- derivados -----
    const filters = useMemo(() => ({ query, onlyOpen, radiusKm }), [query, onlyOpen, radiusKm])
    const counts = useMemo(() => countByKind(items || [], filters, me), [items, filters, me])
    const filtered: Item[] = useMemo(() => sortItems(filterItems(items || [], { ...filters, kind }, me), sort), [items, filters, kind, me, sort])
    const visible: Item[] = useMemo(() => (clusterKey ? filtered.filter((i) => coordKey(i) === clusterKey) : filtered), [filtered, clusterKey])
    const crowns = useMemo(() => crownRanks(filtered), [filtered])
    const selected: Item | null = useMemo(() => filtered.find((i) => i.id === selectedId) || null, [filtered, selectedId])
    const modeInfo = MODES.find((m) => m.id === kind)!

    // trocou o modo ou o filtro: o que estava selecionado/agrupado pode ter saído
    useEffect(() => { setClusterKey(null) }, [kind, query, onlyOpen, radiusKm])
    useEffect(() => { if (selectedId && !selected) setSelectedId(null) }, [selected, selectedId])

    // ----- pins -----
    const choose = useCallback((it: Item) => {
        setSelectedId(it.id)
        setSnap('peek')
        mapRef.current?.flyTo({ center: [it.lng, it.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 700, padding: { bottom: PEEK_H } })
    }, [])

    useEffect(() => {
        const map = mapRef.current
        if (!mapReady || !map) return
        pinsRef.current.forEach((m) => m.remove())
        pinsRef.current = []
        pinInnerRef.current.clear()

        const groups = new Map<string, Item[]>()
        filtered.forEach((it) => {
            const k = coordKey(it)
            if (!groups.has(k)) groups.set(k, [])
            groups.get(k)!.push(it)
        })

        groups.forEach((group, key) => {
            const ordered = [...group].sort((a, b) => (crowns.get(a.id) || 99) - (crowns.get(b.id) || 99))
            ordered.forEach((it, index) => {
                const rank = crowns.get(it.id)
                const size = rank ? 56 : 46
                const border = rank ? RANK_COLORS[rank].fill : it.kind === 'loja' ? (it.open ? '#22c55e' : '#ef4444') : '#f97316'
                const el = document.createElement('div')
                el.style.zIndex = rank ? String(600 - rank) : String(100 - index)
                const inner = document.createElement('div')
                inner.style.cssText = `width:${size}px;height:${size}px;border-radius:${it.kind === 'pessoa' ? '9999px' : '12px'};overflow:hidden;border:3px solid ${border};cursor:pointer;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,0.3);transition:transform .2s;`
                if (it.imageUrl) {
                    const img = document.createElement('img')
                    img.src = it.imageUrl
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
                    img.onerror = () => { inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${PIN_FALLBACK}</div>` }
                    inner.appendChild(img)
                } else {
                    inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${PIN_FALLBACK}</div>`
                }
                el.appendChild(inner)
                pinInnerRef.current.set(it.id, inner)

                if (rank) {
                    const crown = document.createElement('div')
                    crown.innerHTML = crownSvg(rank, 30)
                    crown.style.cssText = 'position:absolute;top:-24px;left:50%;transform:translateX(-50%);pointer-events:none;line-height:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));'
                    el.appendChild(crown)
                }
                if (it.kind === 'pessoa' && it.live) {
                    const live = document.createElement('div')
                    live.style.cssText = 'position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:9999px;background:#22c55e;border:2px solid #fff;'
                    el.appendChild(live)
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
                        map.flyTo({ center: [it.lng, it.lat], zoom: 17, duration: 600, padding: { bottom: PEEK_H } })
                    }
                    el.appendChild(badge)
                }
                el.onclick = () => choose(it)
                pinsRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([it.lng, it.lat]).addTo(map))
            })
        })
        return () => { pinsRef.current.forEach((m) => m.remove()); pinsRef.current = [] }
    }, [mapReady, filtered, crowns, choose])

    useEffect(() => {
        pinInnerRef.current.forEach((el, id) => {
            el.style.transform = id === selectedId ? 'scale(1.25)' : 'scale(1)'
            el.style.outline = id === selectedId ? '3px solid #fb923c' : 'none'
        })
    }, [selectedId, filtered])

    // ----- ficha: detalhes da loja e se já sigo -----
    const [details, setDetails] = useState<Details | null>(null)
    const [following, setFollowing] = useState(false)
    useEffect(() => {
        setDetails(null)
        setFollowing(false)
        if (!selected) return
        let cancelled = false
        ;(async () => {
            const canFollow = selected.kind === 'loja' || selected.kind === 'pessoa'
            const [followRes, extra] = await Promise.all([
                canFollow && userId ? supabase.from('follows').select('follower_id').eq('follower_id', userId).eq('following_id', selected.id).maybeSingle() : Promise.resolve({ data: null }),
                selected.kind === 'loja' ? loadStoreDetails(selected) : Promise.resolve(null),
            ])
            if (cancelled) return
            setFollowing(!!(followRes as any).data)
            setDetails(extra)
        })()
        return () => { cancelled = true }
    }, [selected?.id, userId])  // eslint-disable-line react-hooks/exhaustive-deps

    async function loadStoreDetails(it: Item): Promise<Details> {
        const [{ count }, { data: top }, { data: store }] = await Promise.all([
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', it.id),
            supabase.from('products').select('id, name, slug, price, image_url').eq('store_id', it.id).eq('listing_type', 'sale').order('view_count', { ascending: false, nullsFirst: false }).limit(4),
            supabase.from('stores').select('whatsapp, instagram, show_whatsapp, owner_id').eq('id', it.id).maybeSingle(),
        ])
        let whatsapp = (store as any)?.whatsapp || null
        let instagram = (store as any)?.instagram || null
        if ((!whatsapp || !instagram) && (store as any)?.owner_id) {
            const { data: owner } = await supabase.from('profiles').select('whatsapp, instagram').eq('id', (store as any).owner_id).maybeSingle()
            whatsapp = whatsapp || (owner as any)?.whatsapp || null
            instagram = instagram || (owner as any)?.instagram || null
        }
        return {
            followers: count || 0,
            whatsapp: (store as any)?.show_whatsapp === false ? null : whatsapp,
            instagram,
            topProducts: ((top as any[]) || []).map((p) => ({ id: p.id, name: p.name, slug: p.slug, price: p.price != null ? Number(p.price) : null, image: p.image_url ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null })),
        }
    }

    const toggleFollow = async () => {
        if (!selected) return
        if (!userId) { router.push(`/login?redirect=${encodeURIComponent('/radar')}`); return }
        const was = following
        setFollowing(!was)
        setDetails((d) => (d ? { ...d, followers: d.followers + (was ? -1 : 1) } : d))
        if (was) {
            await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', selected.id)
        } else {
            const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: selected.id })
            if (!error) notifyNewFollower(selected.id)
        }
    }
    const routeTo = (it: Item) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lng}`, '_blank')

    // ----- arrastar a folha -----
    const onDragStart = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); dragStart.current = { y: e.clientY, h: sheetH } }
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
        setSnap((['peek', 'half', 'full'] as Snap[]).reduce((a, b) => (Math.abs(snapH[b] - h) < Math.abs(snapH[a] - h) ? b : a)))
    }

    // ----- ações -----
    const back = () => (window.history.length > 1 ? router.back() : router.push('/'))
    const cycleRadius = () => {
        const i = RADIUS_OPTIONS.findIndex((o) => o.km === radiusKm)
        setRadiusKm(RADIUS_OPTIONS[(i + 1) % RADIUS_OPTIONS.length].km)
    }
    const radiusLabel = RADIUS_OPTIONS.find((o) => o.km === radiusKm)?.label || 'Tudo'
    const sortLabel = SORT_OPTIONS.find((s) => s.id === sort)?.label || ''
    const locLabel = profileLoc ? shortText(profileLoc.address || 'Local salvo', 22) : deviceLoc ? 'Perto de você' : 'Definir meu local'
    const loading = items === null
    const chipStyle = (active: boolean, color?: string) => (active
        ? { background: color || GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731655' }
        : { background: colors.surface, color: colors.textPrimary, boxShadow: '0 2px 8px rgba(0,0,0,0.18)' })

    const title = loading ? 'Procurando…' : clusterKey ? `${visible.length} neste local` : visible.length === 0 ? `Nenhum resultado em ${modeInfo.plural}` : `${visible.length} ${visible.length === 1 ? modeInfo.singular : modeInfo.plural}${me && radiusKm != null ? ' por perto' : ''}`

    const meta = (it: Item) => {
        const bits: string[] = []
        if (it.distanceKm != null) bits.push(formatDistance(it.distanceKm))
        if (it.kind === 'loja') bits.push(it.open ? 'Aberta' : 'Fechada')
        if (it.price != null) bits.push(brl(it.price))
        return bits.join(' · ')
    }

    return (
        <div ref={rootRef} className="fixed inset-x-0 bottom-0 radar-map" style={{ top: 'var(--shell-top, 0px)', background: colors.background, ['--sheet-h' as any]: `${sheetH}px` }}>
            <style>{`.radar-map .mapboxgl-ctrl-bottom-left,.radar-map .mapboxgl-ctrl-bottom-right{bottom:calc(var(--sheet-h,0px) + 4px)!important;transition:bottom .2s ease}`}</style>

            <div className="absolute inset-0" style={{ isolation: 'isolate', zIndex: 0 }}>
                <div ref={mapBox} className="w-full h-full" />
            </div>

            {/* Topo: voltar + busca, modos e filtros */}
            <div className="absolute top-3 inset-x-3 z-10 pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={back} aria-label="Voltar" className="flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-95" style={{ width: 46, height: 46, background: colors.surface, color: colors.textPrimary, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-full" style={{ height: 46, background: colors.surface, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
                        <Search size={17} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`Procurar ${modeInfo.plural}`}
                            className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                            style={{ color: colors.textPrimary }}
                        />
                        {query && <button onClick={() => setQuery('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={16} /></button>}
                    </div>
                </div>

                <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide pointer-events-auto -mx-3 px-3 pb-0.5" style={{ overflowAnchor: 'none' }}>
                    {MODES.map((m) => {
                        const Icon = m.icon
                        return (
                            <button key={m.id} onClick={() => { setKind(m.id); setSelectedId(null) }} className="flex-shrink-0 h-9 pl-3 pr-3.5 rounded-full flex items-center gap-1.5 text-xs font-black whitespace-nowrap transition active:scale-95" style={chipStyle(kind === m.id)}>
                                <Icon size={14} /> {m.label}{!loading ? ` · ${counts[m.id]}` : ''}
                            </button>
                        )
                    })}
                </div>

                <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide pointer-events-auto -mx-3 px-3 pb-1 relative" style={{ overflowAnchor: 'none' }}>
                    <button onClick={() => setPickerOpen(true)} className="flex-shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-black whitespace-nowrap transition active:scale-95" style={chipStyle(false)}>
                        <MapPin size={13} style={{ color: '#ef4444' }} /> {locLabel}
                    </button>
                    {kind === 'loja' && (
                        <button onClick={() => setOnlyOpen((v) => !v)} className="flex-shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-black whitespace-nowrap transition active:scale-95" style={chipStyle(onlyOpen, '#16a34a')}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: onlyOpen ? '#fff' : '#16a34a' }} /> Aberto agora
                        </button>
                    )}
                    {me && (
                        <button onClick={cycleRadius} className="flex-shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-black whitespace-nowrap transition active:scale-95" style={chipStyle(radiusKm != null)}>
                            <Target size={13} /> {radiusLabel}
                        </button>
                    )}
                    <button onClick={() => setSortOpen((v) => !v)} className="flex-shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-black whitespace-nowrap transition active:scale-95" style={chipStyle(false)}>
                        <ArrowDownUp size={13} /> {sortLabel}
                    </button>
                </div>

                {sortOpen && (
                    <div className="pointer-events-auto absolute right-0 mt-1 w-52 rounded-2xl py-1.5 z-20" style={{ background: colors.surface, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: `1px solid ${colors.border}` }}>
                        {SORT_OPTIONS.map((o) => (
                            <button key={o.id} onClick={() => { setSort(o.id); setSortOpen(false) }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-black text-left" style={{ color: sort === o.id ? colors.accent : colors.textPrimary }}>
                                {o.label} {sort === o.id && <Check size={15} />}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Botões do mapa: minha posição e satélite */}
            <div className="absolute right-3 z-10 flex flex-col gap-2" style={{ bottom: sheetH + 40, transition: dragH == null ? 'bottom .25s ease' : 'none' }}>
                <button onClick={() => setSatellite((v) => !v)} aria-label="Trocar camada do mapa" className="w-11 h-11 rounded-full flex items-center justify-center transition active:scale-95" style={{ background: satellite ? GRADIENT : colors.surface, color: satellite ? '#fff' : colors.textPrimary, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>
                    <Layers size={19} />
                </button>
                <button
                    onClick={() => {
                        if (me) mapRef.current?.flyTo({ center: [me.lng, me.lat], zoom: 15, duration: 800, padding: { bottom: PEEK_H } })
                        else setPickerOpen(true)
                    }}
                    aria-label="Minha posição"
                    className="w-11 h-11 rounded-full flex items-center justify-center transition active:scale-95"
                    style={{ background: colors.surface, color: me ? '#2563eb' : colors.textPrimary, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}
                >
                    <Crosshair size={19} />
                </button>
            </div>

            {/* Folha de baixo */}
            <div
                className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl max-w-2xl mx-auto"
                style={{ height: sheetH, background: colors.surface, boxShadow: '0 -8px 30px rgba(0,0,0,0.3)', transition: dragH == null ? 'height .25s ease-out' : 'none' }}
            >
                <div className="flex-shrink-0 w-full flex justify-center pt-2.5 pb-2 touch-none cursor-grab active:cursor-grabbing" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
                    <span className="w-10 h-1 rounded-full" style={{ background: colors.border }} />
                </div>

                <div className={`flex-1 min-h-0 px-4 pb-3 ${snap === 'peek' && dragH == null ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                    {selected && (
                        <div className="rounded-3xl p-3" style={{ background: soft }}>
                            <div className="flex items-center gap-3">
                                <Thumb it={selected} size={64} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{selected.name}</p>
                                    {selected.subtitle && <p className="text-xs font-bold truncate" style={{ color: colors.accent }}>{selected.subtitle}</p>}
                                    <p className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: colors.textSecondary }}>
                                        {selected.rating != null && <span className="flex items-center gap-0.5 font-black" style={{ color: colors.textPrimary }}><Star size={11} className="text-yellow-400 fill-yellow-400" />{selected.rating.toFixed(1)}</span>}
                                        {meta(selected)}
                                        {details && selected.kind === 'loja' && <span>· {details.followers} {details.followers === 1 ? 'seguidor' : 'seguidores'}</span>}
                                        {selected.kind === 'pessoa' && selected.points > 0 && <span>· {selected.points} pts</span>}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedId(null)} aria-label="Fechar" className="flex-shrink-0 self-start" style={{ color: colors.textSecondary }}><X size={18} /></button>
                            </div>
                            <div className="mt-2.5 flex gap-2">
                                <button onClick={() => router.push(selected.href)} className="flex-1 h-10 rounded-full text-xs font-black text-white flex items-center justify-center gap-1" style={{ background: GRADIENT }}>
                                    {selected.kind === 'loja' ? 'Ver loja' : selected.kind === 'pessoa' ? 'Ver perfil' : selected.kind === 'servico' ? 'Ver serviço' : 'Ver produto'} <ChevronRight size={14} />
                                </button>
                                {(selected.kind === 'loja' || selected.kind === 'pessoa') && (
                                    <button onClick={toggleFollow} className="h-10 px-4 rounded-full text-xs font-black flex items-center gap-1.5" style={following ? { background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` } : { background: colors.surface, color: colors.accent, border: `1.5px solid ${colors.accent}` }}>
                                        {following ? <><UserCheck size={14} /> Seguindo</> : <><UserPlus size={14} /> Seguir</>}
                                    </button>
                                )}
                                {selected.kind !== 'pessoa' && (
                                    <button onClick={() => routeTo(selected)} aria-label="Como chegar" className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }}>
                                        <Navigation size={15} />
                                    </button>
                                )}
                                {details?.whatsapp && (
                                    <a href={getWhatsAppLink(details.whatsapp, encodeURIComponent(`Olá! Vi ${selected.name} no iUser.`))} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="h-10 w-10 rounded-full flex items-center justify-center text-white" style={{ background: '#25D366' }}>
                                        <MessageCircle size={16} />
                                    </a>
                                )}
                            </div>
                            {selected.kind === 'loja' && details && details.topProducts.length > 0 && snap !== 'peek' && (
                                <div className="mt-3">
                                    <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Mais vistos da loja</p>
                                    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                                        {details.topProducts.map((p) => (
                                            <button key={p.id} onClick={() => router.push(`/${selected.href.replace(/^\//, '')}/${p.slug}`)} className="flex-shrink-0 w-28 rounded-2xl overflow-hidden text-left" style={{ background: colors.surface }}>
                                                <span className="block w-full h-16" style={{ background: p.image ? undefined : GRADIENT }}>{p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}</span>
                                                <span className="block p-1.5">
                                                    <span className="block text-[11px] font-black truncate" style={{ color: colors.textPrimary }}>{p.name}</span>
                                                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{brl(p.price)}</span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {(!selected || snap !== 'peek' || dragH != null) && (
                        <div className={selected ? 'mt-3' : ''}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <h2 className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{title}</h2>
                                {clusterKey && (
                                    <button onClick={() => setClusterKey(null)} className="text-[11px] font-black flex items-center gap-1 flex-shrink-0" style={{ color: colors.accent }}><X size={12} /> Ver todos</button>
                                )}
                            </div>

                            {loading ? (
                                snap === 'peek' ? (
                                    <div className="flex gap-2 overflow-hidden -mx-4 px-4">
                                        {[0, 1, 2].map((i) => <Shimmer key={i} className="flex-shrink-0 w-48 h-[60px] rounded-2xl" />)}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1.5">{[0, 1, 2, 3, 4].map((i) => <Shimmer key={i} className="h-[64px] rounded-2xl" />)}</div>
                                )
                            ) : visible.length === 0 ? (
                                <div className="rounded-3xl p-4 text-center" style={{ background: soft }}>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>{radiusKm != null ? `Nada num raio de ${radiusLabel}.` : 'Nada com esses filtros.'}</p>
                                    {radiusKm != null && <button onClick={cycleRadius} className="mt-1.5 text-xs font-black" style={{ color: colors.accent }}>Ampliar a busca</button>}
                                </div>
                            ) : snap === 'peek' && dragH == null ? (
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                                    {visible.slice(0, 24).map((it) => (
                                        <button key={it.id} onClick={() => choose(it)} className="flex-shrink-0 w-52 rounded-2xl p-2 flex items-center gap-2 text-left transition active:scale-95" style={{ background: soft }}>
                                            <Thumb it={it} size={44} />
                                            <span className="min-w-0">
                                                <span className="block text-xs font-black truncate" style={{ color: colors.textPrimary }}>{it.name}</span>
                                                <span className="block text-[10px] truncate" style={{ color: colors.textSecondary }}>{meta(it) || it.subtitle}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {visible.map((it) => (
                                        <button key={it.id} onClick={() => choose(it)} className="w-full rounded-2xl p-2 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: it.id === selectedId ? `${colors.accent}18` : soft }}>
                                            <Thumb it={it} size={48} />
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{it.name}</span>
                                                <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{it.subtitle || (it.price != null ? brl(it.price) : it.kind === 'pessoa' && it.points > 0 ? `${it.points} pts` : '')}</span>
                                            </span>
                                            <span className="flex-shrink-0 text-right">
                                                {it.distanceKm != null && <span className="block text-[11px] font-black" style={{ color: colors.textPrimary }}>{formatDistance(it.distanceKm)}</span>}
                                                {it.kind === 'loja' && <span className="block text-[10px] font-black" style={{ color: it.open ? '#16a34a' : '#dc2626' }}>{it.open ? 'Aberta' : 'Fechada'}</span>}
                                                {it.rating != null && <span className="block text-[10px] font-black" style={{ color: colors.textSecondary }}>★ {it.rating.toFixed(1)}</span>}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {pickerOpen && (
                <LocationPicker
                    initialLocation={profileLoc ? { lat: profileLoc.lat, lng: profileLoc.lng, address: profileLoc.address, addressNumber: profileLoc.addressNumber, addressComplement: profileLoc.addressComplement } : null}
                    onSave={saveLocation}
                    onClose={() => setPickerOpen(false)}
                    onClear={profileLoc ? clearLocation : undefined}
                />
            )}
            {savingLoc && <div className="absolute inset-0 z-50" aria-hidden />}
        </div>
    )
}
