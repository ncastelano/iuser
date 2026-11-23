// src/versions/v3/screens/ChamarMotoristaScreen.tsx
//
// CHAMAR UM MOTORISTA (/chamar/<@ do motorista>, 17/11/2026, decisão do dono): no lugar do /pedir-motorista genérico com "?motorista=",
// uma página LIMPA que deixa claro QUEM está sendo chamado. De cima para baixo:
//   1. o MOTORISTA em destaque (foto, nome, @, veículo, nota, se está dirigindo e em quanto tempo chega na partida);
//   2. o TRAJETO: partida (já preenchida quando vem do perfil) → chegada, com o mapa da rota e a posição APROXIMADA dele;
//   3. o VALOR em laranja (a cor do iUser), pela tarifa que ELE escolheu para o perfil (Tarifa iUser, por km ou por tempo), nunca abaixo do
//      mínimo da plataforma — vai como a OFERTA do passageiro, para ele só aceitar;
//   4. o PAGAMENTO e um recado opcional; embaixo, fixo, "Chamar Ana · R$ 23,40".
// O pedido é o mesmo do /pedir-motorista (ride_requests com preferred_driver_id, set_passenger_offer, notifyNewRide): o banco confere tudo.
// Depois de chamar, a pessoa vai para /pedir-motorista, que acompanha a corrida. Só corrida de PESSOA (1); objeto/animal → o pedido completo.
// Regras puras em modules/driver-call (npm run test:driver-call).
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ArrowLeft, Banknote, Bike, Building2, Car, ChevronRight, CreditCard, MapPin, Navigation, Package, QrCode, Search, Star, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { getAvatarUrl } from '@/lib/avatar'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { computeRideExtras, getEffectivePricing, type DriverPricingRow } from '@/lib/driverPricing'
import { addMapboxCredits } from '@/lib/mapCredits'
import { vehicleMarkerHtml } from '@/lib/vehicleMarkerIcon'
import { getCurrentPosition } from '@/lib/nativeGeolocation'
import { loadMyLocation } from '@/lib/myLocation'
import { notifyNewRide } from '@/lib/notifyRideStatus'
import { addRecentRideDestination, getRecentRideDestinations } from '@/lib/recentRideDestinations'
import { addRecentRideOrigin, getRecentRideOrigins } from '@/lib/recentRideOrigins'
import { addRecentClick } from '@/components/LastSearched'
import { useDefaultMinHourly } from '@/hooks/useDefaultMinHourly'
import { useRideMinimum } from '@/hooks/useRideMinimum'
import { platformFloor } from '@/modules/negotiation/domain'
import { setPassengerOffer } from '@/modules/negotiation'
import { etaFromViewer, parseQuote, quoteExamples, quoteModeClientLabel, quotePrice, type DriverQuote } from '@/modules/driver-profile'
import { brl, buildCallRide, callCta, firstName, placeFromParams, tripMinutes, type CallPayment, type CallPlace, type CallVehicleKind } from '@/modules/driver-call'
import PlaceSearchExtras from '@/components/ride/PlaceSearchExtras'
import { fetchPlaceSuggestions, newSearchSession, retrievePlace, type PlaceSuggestion } from '@/lib/placeSearch'
import CarAmenities from '@/components/ride/CarAmenities'
import { Spinner } from '@/components/Spinner'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const ORANGE = '#f97316'
const ORANGE_DARK = '#ea580c'
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const GREEN = '#16a34a'
const RED = '#ef4444'
const PORTO_VELHO: [number, number] = [-63.9039, -8.7612]
const KIND_LABEL: Record<CallVehicleKind, string> = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' }

interface Driver {
    id: string; name: string | null; slug: string; avatar: string | null
    kind: CallVehicleKind; model: string | null; color: string | null; services: string[]; seats: number | null; babySeat: boolean | null
    rating: number | null; ratingCount: number; rides: number
}
interface Route { coords: [number, number][]; distanceKm: number; durationMin: number }

async function reverse(c: [number, number]): Promise<string | null> {
    try {
        const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${c[0]},${c[1]}.json?access_token=${mapboxgl.accessToken}&language=pt&types=address,place,locality`)
        return ((await r.json()).features?.[0]?.place_name as string) || null
    } catch { return null }
}
async function fetchRoute(a: [number, number], b: [number, number]): Promise<Route | null> {
    try {
        const r = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${a[0]},${a[1]};${b[0]},${b[1]}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`)
        const route = (await r.json()).routes?.[0]
        if (!route) return null
        const km = route.distance / 1000
        return { coords: route.geometry.coordinates, distanceKm: km, durationMin: tripMinutes(km) }   // o mesmo tempo do /pedir-motorista
    } catch { return null }
}
/** o veículo principal do motorista (o mexido por último, como no Radar e no perfil) */
const fetchVehicle = (driverId: string) => supabase.from('driver_vehicles').select('vehicle_kind, car_model, car_color, services, passenger_capacity, has_baby_seat').eq('driver_id', driverId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
const short = (a: string) => a.split(',').slice(0, 2).join(',').trim()

// ===== o mapa da rota (sem interação: só mostra) =====
function RouteMap({ origin, destination, route, driverPos, kind }: { origin: CallPlace | null; destination: CallPlace | null; route: Route | null; driverPos: { lat: number; lng: number } | null; kind: CallVehicleKind }) {
    const box = useRef<HTMLDivElement | null>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const markers = useRef<mapboxgl.Marker[]>([])
    const [ready, setReady] = useState(false)
    useEffect(() => {
        if (!box.current || map.current) return
        const m = new mapboxgl.Map({ container: box.current, style: 'mapbox://styles/mapbox/streets-v12', center: origin?.coords || PORTO_VELHO, zoom: 13, interactive: false, attributionControl: false, logoPosition: 'top-right' })
        addMapboxCredits(mapboxgl, m, 'top-right')
        m.on('load', () => setReady(true))
        map.current = m
        return () => { m.remove(); map.current = null }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    useEffect(() => {
        const m = map.current
        if (!m || !ready) return
        markers.current.forEach((x) => x.remove()); markers.current = []
        const dot = (color: string) => { const el = document.createElement('div'); el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)`; return el }
        const pts: [number, number][] = []
        if (origin?.coords) { markers.current.push(new mapboxgl.Marker({ element: dot(GREEN) }).setLngLat(origin.coords).addTo(m)); pts.push(origin.coords) }
        if (destination?.coords) { markers.current.push(new mapboxgl.Marker({ element: dot(RED) }).setLngLat(destination.coords).addTo(m)); pts.push(destination.coords) }
        if (driverPos) {
            const el = document.createElement('div'); el.innerHTML = vehicleMarkerHtml(kind, GREEN)
            markers.current.push(new mapboxgl.Marker({ element: el }).setLngLat([driverPos.lng, driverPos.lat]).addTo(m)); pts.push([driverPos.lng, driverPos.lat])
        }
        const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route?.coords || [] } }
        const src = m.getSource('route') as mapboxgl.GeoJSONSource | undefined
        if (src) src.setData(data)
        else {
            m.addSource('route', { type: 'geojson', data })
            m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ORANGE, 'line-width': 5 } })
        }
        for (const c of route?.coords || []) pts.push(c)
        if (pts.length === 1) m.jumpTo({ center: pts[0], zoom: 14.5 })
        else if (pts.length > 1) {
            const b = new mapboxgl.LngLatBounds(pts[0], pts[0]); pts.forEach((p) => b.extend(p))
            m.fitBounds(b, { padding: { top: 40, bottom: 28, left: 36, right: 36 }, maxZoom: 15.5, duration: 400 })
        }
    }, [ready, origin, destination, route, driverPos, kind])
    return <div ref={box} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}

export default function ChamarMotoristaScreen({ driverSlug }: { driverSlug: string }) {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, loading: profileLoading } = useProfile()
    const hourly = useDefaultMinHourly()
    const minPerMinute = useRideMinimum()

    const [driver, setDriver] = useState<Driver | null | undefined>(undefined)
    const [quote, setQuote] = useState<DriverQuote | null>(null)
    const [tariffsReady, setTariffsReady] = useState(false)
    const [origin, setOrigin] = useState<CallPlace | null>(null)
    const [destination, setDestination] = useState<CallPlace | null>(null)
    const [route, setRoute] = useState<Route | null>(null)
    const [routing, setRouting] = useState(false)
    const [payment, setPayment] = useState<CallPayment | null>(null)
    const [cashChange, setCashChange] = useState('')
    const [contactless, setContactless] = useState<boolean | null>(true)
    const [complement, setComplement] = useState('')
    const [notes, setNotes] = useState('')
    const [missing, setMissing] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [activeRide, setActiveRide] = useState<string | null>(null)
    const [field, setField] = useState<'origin' | 'destination' | null>(null)
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
    const [locating, setLocating] = useState(false)
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    // ===== o motorista (só dados públicos) e a tarifa dele =====
    useEffect(() => {
        let alive = true
        void (async () => {
            const { data: pr } = await supabase.from('profiles').select('id, name, profileSlug, avatar_url').eq('profileSlug', driverSlug).maybeSingle()
            if (!alive) return
            if (!pr) { setDriver(null); return }
            const id = (pr as any).id as string
            const [{ data: v }, { data: st }, { data: q }] = await Promise.all([
                fetchVehicle(id),
                supabase.rpc('get_driver_public_stats', { p_driver: id }),
                supabase.rpc('get_driver_public_quote', { p_driver: id }),
                loadPlatformTariffs(supabase).then(() => { if (alive) setTariffsReady(true) }),
            ])
            if (!alive) return
            if (!v) { setDriver(null); return }
            const s = Array.isArray(st) ? st[0] : st
            const vv = v as any
            setQuote(parseQuote(q) || parseQuote({ mode: 'platform' }))
            setDriver({
                id, name: (pr as any).name, slug: (pr as any).profileSlug, avatar: getAvatarUrl(supabase, (pr as any).avatar_url) || null,
                kind: (vv.vehicle_kind || 'carro') as CallVehicleKind, model: vv.car_model, color: vv.car_color, services: vv.services || [], seats: vv.passenger_capacity, babySeat: vv.has_baby_seat,
                rating: s?.rating_avg != null ? Number(s.rating_avg) : null, ratingCount: Number(s?.rating_count) || 0, rides: Number(s?.rides_completed) || 0,
            })
        })()
        return () => { alive = false }
    }, [driverSlug])

    // ===== partida e chegada: da URL (o perfil manda a partida), senão o GPS/o local salvo =====
    const [paramsRead, setParamsRead] = useState(false)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const o = placeFromParams(params, 'origem'), d = placeFromParams(params, 'chegada')
        if (d) setDestination(d)
        if (o) setOrigin(o)
        setParamsRead(true)
    }, [])
    // sem partida na URL: o local salvo da pessoa
    useEffect(() => {
        if (profileLoading || !paramsRead || origin) return
        let alive = true
        void loadMyLocation(supabase, userId).then((saved) => { if (alive && saved) setOrigin((cur) => cur || { address: saved.address, coords: [saved.lng, saved.lat] }) }).catch(() => {})
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileLoading, userId, paramsRead])
    // "Minha localização" sem endereço (vindo do GPS do perfil): busca o nome da rua
    useEffect(() => {
        if (!origin?.coords || origin.address !== 'Minha localização') return
        let alive = true
        void reverse(origin.coords).then((a) => { if (alive && a) setOrigin((cur) => (cur && cur.address === 'Minha localização' ? { ...cur, address: a } : cur)) })
        return () => { alive = false }
    }, [origin])
    // a URL acompanha a escolha (voltar do login, recarregar ou compartilhar não perde o trajeto)
    useEffect(() => {
        if (!paramsRead) return   // antes de ler a URL, não reescreve (senão apagava a partida que veio do perfil)
        const qs = new URLSearchParams()
        const put = (k: string, p: CallPlace | null) => { if (!p) return; qs.set(k, p.address); if (p.coords) { qs.set(`${k}_lat`, String(p.coords[1])); qs.set(`${k}_lng`, String(p.coords[0])) } }
        put('origem', origin); put('chegada', destination)
        const url = `${window.location.pathname}${qs.toString() ? `?${qs}` : ''}`
        if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', url)
    }, [origin, destination, paramsRead])

    // ===== a rota =====
    useEffect(() => {
        if (!origin?.coords || !destination?.coords) { setRoute(null); return }
        let alive = true
        setRouting(true)
        void fetchRoute(origin.coords, destination.coords).then((r) => { if (alive) { setRoute(r); setRouting(false) } })
        return () => { alive = false }
    }, [origin?.coords?.[0], origin?.coords?.[1], destination?.coords?.[0], destination?.coords?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

    // ===== já tem corrida em andamento? =====
    useEffect(() => {
        if (!userId) { setActiveRide(null); return }
        let alive = true
        void supabase.from('ride_requests').select('id').eq('requester_id', userId).is('order_id', null).in('status', ['pending', 'accepted']).order('created_at', { ascending: false }).limit(1).maybeSingle()
            .then(({ data }) => { if (alive) setActiveRide((data as any)?.id || null) })
        return () => { alive = false }
    }, [userId])

    // ===== o VALOR pela tarifa dele =====
    const kind: CallVehicleKind = driver?.kind || 'carro'
    const shape = useMemo(() => (quote && tariffsReady ? getEffectivePricing(quote.row as unknown as DriverPricingRow, kind) : null), [quote, tariffsReady, kind])
    const price = useMemo(() => {
        if (!quote || !shape || !route) return null
        const extras = computeRideExtras('pessoa', {}, shape)
        const raw = quotePrice(quote, shape, { km: route.distanceKm, minutes: route.durationMin }, hourly, extras)
        return raw == null ? null : Math.max(raw, platformFloor(route.durationMin, minPerMinute))
    }, [quote, shape, route, hourly, minPerMinute])
    const fromPrice = useMemo(() => {
        if (!quote || !shape) return null
        const ex = quoteExamples(quote, shape, hourly)
        return ex.length ? Math.max(ex[0].price, platformFloor(null, minPerMinute)) : null
    }, [quote, shape, hourly, minPerMinute])
    const eta = etaFromViewer(origin?.coords ? { lat: origin.coords[1], lng: origin.coords[0] } : null, quote?.live ?? null)
    const fname = firstName(driver?.name)
    const isSelf = !!(userId && driver && userId === driver.id)
    const cta = callCta({ driverName: driver?.name ?? null, isSelf, hasOrigin: !!origin?.address, hasDestination: !!destination?.address, payment, price, submitting })

    // ===== a busca =====
    // a busca de LUGARES e endereços do app (Search Box do Mapbox: conhece hospitais, mercados, shoppings), perto da partida
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const session = useRef('')
    const searchSeq = useRef(0)
    const openSearch = (f: 'origin' | 'destination') => { setField(f); setQuery(''); setSuggestions([]); setMissing(null); session.current = newSearchSession() }
    useEffect(() => {
        if (!field) return
        if (searchTimer.current) clearTimeout(searchTimer.current)
        if (query.trim().length < 3) { setSuggestions([]); return }
        const seq = ++searchSeq.current
        const near = origin?.coords || PORTO_VELHO
        searchTimer.current = setTimeout(() => {
            void fetchPlaceSuggestions(query, { lat: near[1], lng: near[0] }, session.current).then((l) => { if (seq === searchSeq.current) setSuggestions(l) })
        }, 300)
    }, [query, field]) // eslint-disable-line react-hooks/exhaustive-deps
    const pickSuggestion = async (sg: PlaceSuggestion) => {
        const pos = sg.lat != null && sg.lng != null ? { lat: sg.lat, lng: sg.lng, label: sg.label } : await retrievePlace(sg, session.current)
        if (!pos) { toast.error('Não deu para achar esse lugar. Tente outro.'); return }
        session.current = newSearchSession()
        pick({ address: pos.label, coords: [pos.lng, pos.lat] })
    }
    const pick = useCallback((p: CallPlace) => {
        if (field === 'origin') { setOrigin(p); addRecentRideOrigin(p) } else { setDestination(p); addRecentRideDestination(p) }
        setField(null)
    }, [field])
    // Ao ENTRAR, sempre pergunta de onde a pessoa sai (23/11/2026, decisão do dono): localização do aparelho ou digitar
    const [askOrigin, setAskOrigin] = useState(true)
    const locateOrigin = () => {
        setLocating(true)
        getCurrentPosition(async (pos) => {
            const c: [number, number] = [pos.coords.longitude, pos.coords.latitude]
            const a = (await reverse(c)) || 'Minha localização'
            setLocating(false); setAskOrigin(false)
            const p = { address: a, coords: c }; setOrigin(p); addRecentRideOrigin(p)
        }, () => { setLocating(false); toast.error('Não deu para pegar a sua localização. Digite o endereço.') }, { timeout: 10000, maximumAge: 60000 })
    }
    const useMyLocation = () => {
        setLocating(true)
        getCurrentPosition(async (pos) => {
            const c: [number, number] = [pos.coords.longitude, pos.coords.latitude]
            const a = (await reverse(c)) || 'Minha localização'
            setLocating(false); pick({ address: a, coords: c })
        }, () => { setLocating(false); toast.error('Não deu para pegar a sua localização. Digite o endereço.') }, { timeout: 10000, maximumAge: 60000 })
    }

    // ===== chamar =====
    const submit = async () => {
        if (cta.disabled || !driver) return
        if (cta.missing) {
            setMissing(cta.missing)
            if (cta.missing === 'origin' || cta.missing === 'destination') openSearch(cta.missing)
            else document.getElementById('pagamento')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            return
        }
        if (!userId) { router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`); return }
        if (activeRide) { router.push('/pedir-motorista'); return }
        setSubmitting(true)
        try {
            const { data, error } = await supabase.from('ride_requests').insert(buildCallRide({
                requesterId: userId, driverId: driver.id, vehicleKind: driver.kind, origin: origin!, destination: destination!, originComplement: complement, notes,
                payment: payment!, cashChange, contactless, route: route ? { distanceKm: route.distanceKm, durationMin: route.durationMin } : null,
            })).select('id').single()
            if (error) throw error
            // o valor dele vai como a OFERTA do passageiro: o motorista só aceita
            if (price != null) {
                try { await setPassengerOffer((data as any).id, price) }
                catch { toast.info(`Pedido enviado, mas não deu para registrar o valor. ${fname} vai propor o valor.`) }
            }
            notifyNewRide((data as any).id)
            addRecentClick({ type: 'ride', id: (data as any).id, name: `${short(origin!.address)} → ${short(destination!.address)}`, imageUrl: null, url: '/pedir-motorista' })
            toast.success(`${fname} foi avisado`, { description: 'Acompanhe a corrida por aqui.' })
            router.replace('/pedir-motorista')
        } catch (err: any) {
            if (err?.code === '23505') { toast.error('Você já tem um pedido de corrida em andamento.'); router.push('/pedir-motorista') }
            else toast.error('Não deu para chamar agora: ' + (err?.message || 'tente de novo'))
            setSubmitting(false)
        }
    }

    const soft = `${colors.border}30`
    const Icon = kind === 'carro' ? Car : Bike
    const back = () => (window.history.length > 1 ? router.back() : router.push(`/${driverSlug}`))

    if (driver === undefined) return <ChamarSkeleton colors={colors} />
    if (driver === null) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6" style={{ paddingTop: 'var(--shell-top,0px)' }}>
                <Car size={34} style={{ color: colors.textSecondary }} />
                <p className="mt-3 text-[16px] font-black" style={{ color: colors.textPrimary }}>Este perfil não tem um veículo para corridas</p>
                <button onClick={() => router.push('/pedir-motorista')} className="mt-4 h-11 px-5 rounded-full text-[13px] font-black text-white" style={{ background: GRADIENT }}>Pedir outro motorista</button>
            </div>
        )
    }

    return (
        <div className="w-full md:max-w-xl md:mx-auto px-4 pb-40" style={{ paddingTop: 'calc(var(--shell-top,0px) + 4px)' }}>
            {/* topo */}
            <div className="flex items-center gap-2 h-12">
                <button onClick={back} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition" style={{ background: soft, color: colors.textPrimary }}><ArrowLeft size={19} /></button>
                <span className="text-[15px] font-black" style={{ color: colors.textPrimary }}>Chamar motorista</span>
            </div>

            {/* 1. O TRAJETO (primeiro: o pedido; 23/11/2026, decisão do dono) */}
            <section className="mt-2 rounded-[28px] overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <div className="relative h-[170px]" style={{ background: soft }}>
                    {mounted && <RouteMap origin={origin} destination={destination} route={route} driverPos={quote?.live ?? null} kind={kind} />}
                </div>
                <div className="p-3">
                    {([
                        { f: 'origin' as const, label: 'Partida', place: origin, empty: 'De onde você sai?', color: GREEN },
                        { f: 'destination' as const, label: 'Chegada', place: destination, empty: 'Para onde você vai?', color: RED },
                    ]).map((r, i) => (
                        <div key={r.f}>
                            {i === 1 && <div className="ml-[19px] h-3 border-l-2 border-dashed" style={{ borderColor: colors.border }} />}
                            <button onClick={() => openSearch(r.f)} className="w-full flex items-center gap-3 px-1 py-1.5 text-left rounded-2xl active:scale-[0.99] transition"
                                style={missing === r.f ? { boxShadow: `0 0 0 2px ${RED}` } : undefined}>
                                <span className="w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${r.color}1f` }}><span className="w-3 h-3 rounded-full" style={{ background: r.color, boxShadow: '0 0 0 3px #fff' }} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[10.5px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{r.label}</span>
                                    <span className="block text-[14.5px] font-black truncate" style={{ color: r.place ? colors.textPrimary : colors.textSecondary }}>{r.place ? short(r.place.address) : r.empty}</span>
                                </span>
                                <ChevronRight size={18} style={{ color: colors.textSecondary }} />
                            </button>
                        </div>
                    ))}
                    {origin && <input value={complement} onChange={(e) => setComplement(e.target.value.slice(0, 80))} placeholder="Complemento da partida (opcional)" className="mt-2 w-full h-10 px-3 rounded-2xl text-[13px] outline-none" style={{ background: soft, color: colors.textPrimary }} />}
                </div>
            </section>

            {/* 2. QUEM: o motorista que você está chamando, embaixo do pedido */}
            <section className="mt-3 rounded-[28px] p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}>
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: ORANGE }}>Você está chamando</p>
                <div className="mt-2 flex items-center gap-3.5">
                    <button onClick={() => router.push(`/${driver.slug}`)} className="relative flex-shrink-0" aria-label={`Ver o perfil de ${fname}`}>
                        <span className="block w-[72px] h-[72px] rounded-full p-[3px]" style={{ background: quote?.active ? GREEN : `${colors.textSecondary}55` }}>
                            <span className="block w-full h-full rounded-full overflow-hidden flex items-center justify-center text-white text-[24px] font-black" style={{ background: GRADIENT, boxShadow: `0 0 0 2px ${colors.surface}` }}>
                                {driver.avatar ? <img src={driver.avatar} alt="" className="w-full h-full object-cover" /> : (driver.name || '?').slice(0, 1).toUpperCase()}
                            </span>
                        </span>
                        <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: GREEN, boxShadow: `0 0 0 3px ${colors.surface}` }}><Icon size={14} /></span>
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[20px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{driver.name || `@${driver.slug}`}</p>
                        <p className="text-[12.5px] font-bold truncate" style={{ color: colors.textSecondary }}>@{driver.slug}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: colors.textSecondary }}>
                            {driver.rating != null
                                ? <><Star size={12} className="fill-amber-400 text-amber-400" /><span style={{ color: colors.textPrimary }}>{driver.rating.toFixed(1).replace('.', ',')}</span><span>({driver.ratingCount})</span></>
                                : <span>Novo no iUser</span>}
                            <span>·</span><span>{driver.rides} {driver.rides === 1 ? 'corrida' : 'corridas'}</span>
                        </p>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[12px] font-black" style={{ background: quote?.active ? '#22c55e1f' : soft, color: quote?.active ? GREEN : colors.textSecondary }}>
                        <span className={`w-2 h-2 rounded-full ${quote?.active ? 'animate-pulse' : ''}`} style={{ background: quote?.active ? '#22c55e' : `${colors.textSecondary}90` }} />
                        {quote?.active ? 'Dirigindo agora' : 'Fora do ar agora'}
                    </span>
                    <span className="h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[12px] font-black min-w-0" style={{ background: soft, color: colors.textPrimary }}>
                        <Icon size={13} /><span className="truncate">{[KIND_LABEL[kind], driver.model, driver.color].filter(Boolean).join(' · ')}</span>
                    </span>
                    {eta && <span className="h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[12px] font-black" style={{ background: `${ORANGE}1a`, color: ORANGE_DARK }}><Navigation size={13} />chega em ~{eta.minutes} min</span>}
                </div>
                {kind === 'carro' && <div className="mt-3"><CarAmenities services={driver.services} seats={driver.seats} babySeat={driver.babySeat} /></div>}
                {!quote?.active && <p className="mt-3 text-[12px] leading-snug" style={{ color: colors.textSecondary }}>{fname} não está dirigindo agora, mas recebe o aviso no celular. Outros motoristas por perto também veem o pedido.</p>}
            </section>

            {/* 3. O VALOR (laranja do iUser) */}
            <section className="mt-3 rounded-[28px] p-4" style={{ background: `linear-gradient(135deg, ${ORANGE}14, ${ORANGE}05)`, border: `1.5px solid ${ORANGE}55` }}>
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: ORANGE_DARK }}>Valor da corrida</p>
                {route && price != null ? (
                    <>
                        <p className="mt-1 text-[40px] leading-none font-black tracking-tight" style={{ color: ORANGE }}>{brl(price)}</p>
                        <p className="mt-2 text-[12.5px] font-bold" style={{ color: colors.textPrimary }}>
                            {route.distanceKm.toFixed(1).replace('.', ',')} km · ~{Math.max(1, Math.round(route.durationMin))} min · pela {quote?.mode === 'km' ? 'tarifa por km' : quote?.mode === 'time' ? 'tarifa por tempo' : 'Tarifa iUser'} de {fname}
                        </p>
                        <p className="mt-1 text-[12px] leading-snug" style={{ color: colors.textSecondary }}>O valor já vai como a sua oferta: {fname} só precisa aceitar.</p>
                    </>
                ) : routing ? (
                    <p className="mt-2 flex items-center gap-2 text-[13px] font-bold" style={{ color: colors.textSecondary }}><Spinner size={15} />Calculando a rota…</p>
                ) : (
                    <>
                        <p className="mt-1 text-[15px] font-black" style={{ color: colors.textPrimary }}>{destination ? 'Não deu para calcular a rota' : 'Escolha a chegada para ver o valor'}</p>
                        {fromPrice != null && <p className="mt-1 text-[13px] font-bold" style={{ color: colors.textSecondary }}>Corridas de {fname} a partir de <b style={{ color: ORANGE }}>{brl(fromPrice)}</b> · {quote ? quoteModeClientLabel(quote.mode) : 'Tarifa iUser'}</p>}
                    </>
                )}
            </section>

            {/* 4. O PAGAMENTO */}
            <section id="pagamento" className="mt-3 rounded-[28px] p-4" style={{ background: colors.surface, border: `1px solid ${missing === 'payment' ? RED : colors.border}` }}>
                <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Como você vai pagar?</p>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {([
                        { v: 'pix' as const, label: 'Pix', icon: QrCode },
                        { v: 'dinheiro' as const, label: 'Dinheiro', icon: Banknote },
                        { v: 'cartao' as const, label: 'Cartão', icon: CreditCard },
                    ]).map((o) => {
                        const on = payment === o.v
                        return (
                            <button key={o.v} onClick={() => { setPayment(o.v); setMissing(null) }} className="h-[58px] rounded-2xl flex flex-col items-center justify-center gap-1 text-[12.5px] font-black active:scale-95 transition"
                                style={on ? { background: `${ORANGE}1a`, color: ORANGE_DARK, boxShadow: `inset 0 0 0 2px ${ORANGE}` } : { background: soft, color: colors.textPrimary }}>
                                <o.icon size={18} />{o.label}
                            </button>
                        )
                    })}
                </div>
                {payment === 'dinheiro' && <input value={cashChange} onChange={(e) => setCashChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} inputMode="decimal" placeholder="Troco para quanto? (opcional)" className="mt-2.5 w-full h-10 px-3 rounded-2xl text-[13px] outline-none" style={{ background: soft, color: colors.textPrimary }} />}
                {payment === 'cartao' && (
                    <div className="mt-2.5 flex gap-2">
                        {[{ v: true, l: 'Com aproximação' }, { v: false, l: 'Sem aproximação' }].map((o) => (
                            <button key={String(o.v)} onClick={() => setContactless(o.v)} className="flex-1 h-9 rounded-full text-[12px] font-black" style={contactless === o.v ? { background: `${ORANGE}1a`, color: ORANGE_DARK } : { background: soft, color: colors.textSecondary }}>{o.l}</button>
                        ))}
                    </div>
                )}
                {payment === 'pix' && <p className="mt-2 text-[11.5px]" style={{ color: colors.textSecondary }}>Você paga direto para {fname}, no fim da corrida.</p>}
                <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))} rows={2} placeholder={`Recado para ${fname} (opcional): "estou no portão azul"`} className="mt-3 w-full px-3 py-2.5 rounded-2xl text-[13px] outline-none resize-none" style={{ background: soft, color: colors.textPrimary }} />
            </section>

            <button onClick={() => router.push(`/pedir-motorista?motorista=${driver.id}`)} className="mt-3 w-full flex items-center justify-center gap-1.5 text-[12px] font-bold py-2" style={{ color: colors.textSecondary }}>
                <Package size={14} />Levar um objeto ou animal? Use o pedido completo
            </button>

            {/* o botão fixo */}
            <div className="fixed left-0 right-0 bottom-0 z-40 px-4 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom) + var(--staging-banner-h,0px))', background: `linear-gradient(to top, ${colors.background} 70%, transparent)` }}>
                <div className="md:max-w-xl md:mx-auto">
                    {activeRide && !isSelf && (
                        <button onClick={() => router.push('/pedir-motorista')} className="mb-2 w-full h-10 rounded-full text-[12.5px] font-black" style={{ background: soft, color: colors.textPrimary }}>Você já tem uma corrida em andamento · Acompanhar</button>
                    )}
                    <button onClick={submit} disabled={cta.disabled} className="w-full h-[58px] rounded-[22px] flex items-center justify-center gap-2 text-[16px] font-black text-white transition active:scale-[0.99] disabled:opacity-60"
                        style={{ background: GRADIENT, boxShadow: `0 14px 30px -14px ${ORANGE}` }}>
                        {submitting ? <Spinner size={18} /> : <Icon size={19} />}{activeRide && !isSelf ? 'Acompanhar a corrida' : cta.label}
                    </button>
                </div>
            </div>

            {/* "De onde você sai?": aparece sempre ao entrar */}
            {mounted && askOrigin && !field && createPortal(
                <div className="fixed inset-0 z-[94] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setAskOrigin(false)}>
                    <div className="w-full max-w-xl rounded-t-[28px] p-5" style={{ background: colors.surface, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
                        <p className="text-[18px] font-black" style={{ color: colors.textPrimary }}>De onde você sai?</p>
                        <p className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>É o ponto de partida da corrida{driver ? ` com ${fname}` : ''}.</p>
                        <div className="mt-4 flex flex-col gap-2">
                            <button onClick={locateOrigin} disabled={locating} className="h-12 rounded-2xl text-[14px] font-black text-white flex items-center justify-center gap-2 disabled:opacity-70" style={{ background: GRADIENT }}>
                                {locating ? <Spinner size={16} /> : <Navigation size={16} />} Usar minha localização
                            </button>
                            <button onClick={() => { setAskOrigin(false); openSearch('origin') }} className="h-12 rounded-2xl text-[14px] font-black flex items-center justify-center gap-2" style={{ background: soft, color: colors.textPrimary }}>
                                <Search size={16} /> Digitar o endereço
                            </button>
                            {origin && (
                                <button onClick={() => setAskOrigin(false)} className="h-11 rounded-2xl text-[12.5px] font-bold truncate px-3" style={{ color: colors.textSecondary }}>
                                    Continuar com {short(origin.address)}
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* a busca (partida ou chegada), em tela cheia por cima */}
            {mounted && field && createPortal(
                <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: colors.background }}>
                    <div className="flex items-center gap-2 px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}>
                        <button onClick={() => setField(null)} aria-label="Fechar" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: soft, color: colors.textPrimary }}><X size={19} /></button>
                        <div className="flex-1 h-12 rounded-2xl flex items-center gap-2 px-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: field === 'origin' ? GREEN : RED }} />
                            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={field === 'origin' ? 'De onde você sai?' : 'Para onde você vai?'} className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-bold" style={{ color: colors.textPrimary }}
                                onKeyDown={(e) => { if (e.key === 'Enter' && suggestions[0]) void pickSuggestion(suggestions[0]) }} />
                            <Search size={17} style={{ color: colors.textSecondary }} />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {suggestions.length > 0 && (
                            <div className="px-3 pt-3">
                                {suggestions.map((s) => (
                                    <button key={s.id} onClick={() => void pickSuggestion(s)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-2xl text-left active:scale-[0.99]">
                                        {s.kind === 'poi' ? <Building2 size={18} style={{ color: '#2563eb' }} className="flex-shrink-0" /> : <MapPin size={18} style={{ color: ORANGE }} className="flex-shrink-0" />}
                                        <span className="min-w-0"><span className="block text-[14px] font-black truncate" style={{ color: colors.textPrimary }}>{s.title}</span><span className="block text-[12px] truncate" style={{ color: colors.textSecondary }}>{s.sub}</span></span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <PlaceSearchExtras
                            query={query}
                            refPoint={origin?.coords || PORTO_VELHO}
                            recents={(field === 'origin' ? [...getRecentRideOrigins(), ...getRecentRideDestinations()] : [...getRecentRideDestinations(), ...getRecentRideOrigins()])
                                .map((r) => ({ address: r.address, coords: r.coords }))
                                .filter((p, i, all) => all.findIndex((x) => x.address === p.address) === i)
                                .filter((p) => p.address !== (field === 'origin' ? destination?.address : origin?.address))}
                            locating={locating}
                            onUseMyLocation={useMyLocation}
                            onPick={(p) => pick({ address: p.address, coords: p.coords })}
                        />
                    </div>
                </div>,
                document.body,
            )}
        </div>
    )
}

function ChamarSkeleton({ colors }: { colors: any }) {
    const b = `${colors.border}55`
    return (
        <div className="w-full md:max-w-xl md:mx-auto px-4 animate-pulse" style={{ paddingTop: 'calc(var(--shell-top,0px) + 4px)' }}>
            <div className="flex items-center gap-2 h-12"><span className="w-10 h-10 rounded-full" style={{ background: b }} /><span className="h-4 w-36 rounded-full" style={{ background: b }} /></div>
            <div className="mt-2 rounded-[28px] p-4 h-[170px]" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <div className="flex items-center gap-3.5 mt-5"><span className="w-[72px] h-[72px] rounded-full" style={{ background: b }} /><span className="flex-1"><span className="block h-5 w-2/3 rounded-full" style={{ background: b }} /><span className="block mt-2 h-3 w-1/3 rounded-full" style={{ background: b }} /></span></div>
            </div>
            <div className="mt-3 rounded-[28px] h-[290px]" style={{ background: colors.surface, border: `1px solid ${colors.border}` }} />
            <div className="mt-3 rounded-[28px] h-[110px]" style={{ background: b }} />
        </div>
    )
}
