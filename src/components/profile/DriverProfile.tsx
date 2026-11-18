// src/components/profile/DriverProfile.tsx
//
// A PÁGINA DO PERFIL DO TIPO MOTORISTA (17/11/2026, decisão do dono: "uma página para o motorista, com os comentários das pessoas que pediram, o
// mapa onde ela está se quiser mostrar e UM botão de solicitar corrida no valor que ele escolheu"). Ordem:
//   1. Cartão do motorista: em CIMA o mapa de onde ele está (posição APROXIMADA, ~330 m, a do Radar; só para quem está logado e se ele deixou o
//      local visível) ou, sem isso, a foto do veículo; a foto da pessoa, nome, situação, nota, corridas, desde quando, seguir e conversar
//   2. UM botão só: "Solicitar corrida" (o dono vê "Editar a minha tarifa")
//   3. Onde está agora: a situação em uma linha (o mapa fica no topo)
//   4. O veículo: modelo, cor, lugares e o que tem (ar, Wi-Fi, carregador, som, pet — `CarAmenities`)
//   5. Quanto custa: TODOS os jeitos que ele cobra (por km e/ou por tempo, ou só a Tarifa iUser), o do botão marcado, cada um com a regra e três exemplos
//   6. O que dizem os passageiros: a nota grande e as avaliações (as com comentário primeiro)
// Os dados vêm de funções públicas do banco (get_driver_public_quote, get_driver_public_stats, get_driver_reviews) — a tabela da tarifa é
// privada; o valor é calculado em modules/driver-profile. Só apresentação: nenhuma regra de corrida mora aqui.
'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ArrowLeft, Bike, Eye, Calendar, CalendarCheck, Car, ChevronRight, Lock, MapPin, Info, MessageCircle, MessageSquareQuote, Move, Navigation, Pencil, Route, Star, Users, Wrench } from 'lucide-react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { getEffectivePricing, type DriverPricingRow } from '@/lib/driverPricing'
import { addMapboxCredits } from '@/lib/mapCredits'
import { vehicleMarkerHtml } from '@/lib/vehicleMarkerIcon'
import { useDefaultMinHourly } from '@/hooks/useDefaultMinHourly'
import { useRideMinimum } from '@/hooks/useRideMinimum'
import { platformFloor } from '@/modules/negotiation'
import { etaFromViewer, etaText, parseQuote, quoteModeClientLabel, quoteExamples, quoteModeLabel, quoteRule, type DriverQuote, type QuoteMode } from '@/modules/driver-profile'
import { loadMyLocation } from '@/lib/myLocation'
import { getCurrentPosition } from '@/lib/nativeGeolocation'
import { isGeoPermissionGranted } from '@/components/AceitarCorridas/LocationAskDialog'
import ChatContactButton from '@/components/ChatContactButton'
import CarAmenities from '@/components/ride/CarAmenities'
import DriverSkeleton from '@/components/v3/DriverSkeleton'

const GREEN = '#16a34a'
const GREEN_DARK = '#15803d'
const ORANGE = '#f97316'
const ORANGE_DARK = '#ea580c'
const KIND_LABEL = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' } as const
type Kind = keyof typeof KIND_LABEL

interface Vehicle { slug: string; kind: Kind; model: string | null; color: string | null; photo: string | null; services: string[]; seats: number | null; babySeat: boolean | null; posX: number; posY: number }
interface Stats { rides: number; rating: number | null; ratingCount: number; since: string | null }
interface Review { rating: number | null; comment: string | null; at: string; from: string; to: string; name: string | null; slug: string | null; avatar: string | null }

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
const carPhoto = (p: string | null) => (p ? (p.startsWith('http') ? p : supabase.storage.from('driver-car-photos').getPublicUrl(p).data.publicUrl) : null)
const monthYear = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', '/') : null)
const ago = (iso: string) => {
    const d = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000))
    return d === 0 ? 'hoje' : d === 1 ? 'ontem' : d < 30 ? `há ${d} dias` : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}


function Stars({ value, size = 13 }: { value: number; size?: number }) {
    return (
        <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrelas`}>
            {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />)}
        </span>
    )
}

// ===== o mapa: posição aproximada (círculo de ~330 m) com o ícone do veículo; sem interação, para não brigar com a rolagem =====
function ApproxMap({ lat, lng, kind }: { lat: number; lng: number; kind: Kind }) {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!ref.current || !process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return
        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        // logo à direita: à esquerda a foto da pessoa entra por cima do mapa
        // logo e créditos em cima à direita (embaixo entram a foto e o nome); o centro do mapa sobe para o carro ficar à vista acima do degradê
        const map = new mapboxgl.Map({ container: ref.current, style: 'mapbox://styles/mapbox/streets-v12', center: [lng, lat], zoom: 14.2, interactive: false, attributionControl: false, logoPosition: 'top-right' })
        map.setPadding({ top: 0, bottom: 150, left: 0, right: 0 })
        addMapboxCredits(mapboxgl, map, 'top-right')
        const el = document.createElement('div')
        el.innerHTML = vehicleMarkerHtml(kind, GREEN)
        const marker = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
        map.on('load', () => {
            map.addSource('approx', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } } })
            // raio em pixels que corresponde a ~330 m nesse zoom e latitude
            const px = 330 / (78271.517 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, 14.2))
            map.addLayer({ id: 'approx', type: 'circle', source: 'approx', paint: { 'circle-radius': px, 'circle-color': GREEN, 'circle-opacity': 0.14, 'circle-stroke-color': GREEN, 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.5 } })
        })
        return () => { marker.remove(); map.remove() }
    }, [lat, lng, kind])
    // posição e tamanho INLINE: o CSS do mapbox-gl põe `position: relative` em .mapboxgl-map e, só com classe, a altura vira zero
    return <div ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}

export interface DriverProfileProps {
    driverId: string
    name: string
    slug: string
    avatarSlot: ReactNode
    levelSlot?: ReactNode
    colors: any
    isOwner: boolean
    loggedIn: boolean
    /** Seguir / conversar (o perfil monta: as regras são as de sempre) */
    socialSlot?: ReactNode
    ownerTypeSlot?: ReactNode
    /** "Denunciar perfil" (quem não é o dono) */
    reportSlot?: ReactNode
    onEdit: () => void
    /** o voltar mora dentro da imagem, em cima à esquerda (a página não mostra o voltar do cabeçalho no perfil de motorista) */
    onBack?: () => void
    /** quem vê a página (para o "a quantos minutos de você") */
    viewerId: string | null
    /** o motorista recebe conversas pelo iUser (profiles.chat_enabled) */
    chatEnabled: boolean
    /** os serviços que ele publicou (perfil de motorista que também atende com hora marcada) e se a agenda está ligada */
    services: { id: string; name: string; description: string | null; image_url: string | null; service_type: string | null }[]
    allowScheduling: boolean
    onSchedule: (serviceTitle: string | null) => void
}

export default function DriverProfile(p: DriverProfileProps) {
    const router = useRouter()
    const { colors } = p
    const hourly = useDefaultMinHourly()
    const minPerMinute = useRideMinimum()
    const [quote, setQuote] = useState<DriverQuote | null>(null)
    const [vehicle, setVehicle] = useState<Vehicle | null | undefined>(undefined)
    const [stats, setStats] = useState<Stats | null>(null)
    const [reviews, setReviews] = useState<Review[] | null>(null)
    const [tariffsReady, setTariffsReady] = useState(false)
    const [showAll, setShowAll] = useState(false)
    // a aba aberta embaixo do botão: as avaliações primeiro
    const [tab, setTab] = useState<'avaliacoes' | 'servicos' | 'info'>('avaliacoes')
    // ENQUADRAR A FOTO (só o dono): arrastar a foto do veículo até o ângulo certo; guarda o ponto que fica no centro (0 a 100, o object-position)
    const [framing, setFraming] = useState(false)
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
    const [savingPos, setSavingPos] = useState(false)
    const drag = useRef<{ px: number; py: number; x: number; y: number; w: number; h: number } | null>(null)
    // onde está quem vê a página: o GPS (só se o navegador já deixou, sem perguntar) ou o local salvo; sem nenhum, não mostra o tempo
    const [viewerPos, setViewerPos] = useState<{ lat: number; lng: number } | null>(null)
    // VER PERFIL (17/11/2026, decisão do dono): o dono vê a própria página como o CLIENTE vê (sem os botões de dono); "Voltar" sai do modo
    const [asClient, setAsClient] = useState(false)
    const owner = p.isOwner && !asClient

    useEffect(() => {
        let alive = true
        void (async () => {
            const [{ data: q }, { data: v }, { data: st }, { data: rv }] = await Promise.all([
                supabase.rpc('get_driver_public_quote', { p_driver: p.driverId }),
                supabase.from('driver_vehicles').select('vehicle_slug, vehicle_kind, car_model, car_color, car_photo_url, services, passenger_capacity, has_baby_seat, car_photo_pos_x, car_photo_pos_y').eq('driver_id', p.driverId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
                supabase.rpc('get_driver_public_stats', { p_driver: p.driverId }),
                supabase.rpc('get_driver_reviews', { p_driver: p.driverId, p_limit: 20 }),
                loadPlatformTariffs(supabase).then(() => { if (alive) setTariffsReady(true) }),
            ])
            if (!alive) return
            setQuote(parseQuote(q) || parseQuote({ mode: 'platform' }))
            const vv = v as any
            setVehicle(vv ? { slug: vv.vehicle_slug, kind: (vv.vehicle_kind || 'carro') as Kind, model: vv.car_model, color: vv.car_color, photo: carPhoto(vv.car_photo_url), services: vv.services || [], seats: vv.passenger_capacity, babySeat: vv.has_baby_seat, posX: vv.car_photo_pos_x ?? 50, posY: vv.car_photo_pos_y ?? 50 } : null)
            const s = Array.isArray(st) ? st[0] : st
            setStats(s ? { rides: Number(s.rides_completed) || 0, rating: s.rating_avg != null ? Number(s.rating_avg) : null, ratingCount: Number(s.rating_count) || 0, since: s.member_since || null } : { rides: 0, rating: null, ratingCount: 0, since: null })
            setReviews(((rv as any[]) || []).map((r) => ({ rating: r.rating, comment: r.comment, at: r.rode_at, from: r.origin, to: r.destination, name: r.reviewer_name, slug: r.reviewer_slug, avatar: r.reviewer_avatar ? getAvatarUrl(supabase, r.reviewer_avatar) || null : null })))
        })()
        return () => { alive = false }
    }, [p.driverId])

    // ONDE ESTÁ QUEM VÊ (17/11/2026, decisão do dono): a página do motorista pede a localização ao abrir, para o botão já dizer em quanto tempo
    // ele chega e o pedido já sair daqui (partida preenchida). GPS sem perguntar se o navegador já deixou; senão o local salvo e a folha que pergunta
    // (uma vez por visita; "Agora não" vale até fechar a aba). Nada disso é gravado: só serve para a conta na tela e para preencher o pedido.
    const [viewerSource, setViewerSource] = useState<'gps' | 'saved' | null>(null)
    const [savedPlace, setSavedPlace] = useState<{ lat: number; lng: number; address: string } | null>(null)
    const [askLoc, setAskLoc] = useState(false)
    const [locStatus, setLocStatus] = useState<'idle' | 'asking' | 'denied'>('idle')
    const askKey = 'iuser_driver_page_loc_ask'
    const locateMe = (onFail?: () => void) => {
        setLocStatus('asking')
        getCurrentPosition((pos) => {
            setViewerPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setViewerSource('gps'); setLocStatus('idle'); setAskLoc(false)
        }, () => { setLocStatus('denied'); onFail?.() }, { timeout: 10000, maximumAge: 120000 })
    }
    useEffect(() => {
        if (owner || quote === null) return
        let alive = true
        void (async () => {
            const saved = await loadMyLocation(supabase, p.viewerId).catch(() => null)
            if (!alive) return
            if (saved) { setSavedPlace({ lat: saved.lat, lng: saved.lng, address: saved.address }); setViewerPos({ lat: saved.lat, lng: saved.lng }); setViewerSource('saved') }
            if (await isGeoPermissionGranted()) { if (alive) locateMe(); return }
            let dismissed = false
            try { dismissed = sessionStorage.getItem(askKey) === '1' } catch { /* sem armazenamento */ }
            if (alive && !dismissed) setAskLoc(true)
        })()
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quote === null, owner, p.viewerId])
    const dismissAsk = () => { setAskLoc(false); setLocStatus('idle'); try { sessionStorage.setItem(askKey, '1') } catch { /* só esta vez */ } }

    const kind: Kind = vehicle?.kind || 'carro'
    const shape = useMemo(() => (quote && tariffsReady ? getEffectivePricing(quote.row as unknown as DriverPricingRow, kind) : null), [quote, tariffsReady, kind])
    const floor = platformFloor(null, minPerMinute)   // o mínimo de uma corrida (R$ 8): nenhum exemplo abaixo dele
    const examples = quote && shape ? quoteExamples(quote, shape, hourly).map((e) => ({ ...e, price: Math.max(e.price, floor) })) : []
    const fromPrice = examples.length ? examples[0].price : null
    // QUANTO CUSTA: todos os jeitos que ESTE motorista cobra — a tarifa por km (se ele tem tarifa própria), a por tempo (se definiu um valor por
    // minuto) — ou só a Tarifa iUser; o do botão vai marcado. Cada um com a regra e três exemplos (nunca abaixo do mínimo de uma corrida).
    const priceModes: { mode: QuoteMode; rule: string; examples: { label: string; price: number }[] }[] = (() => {
        if (!quote || !tariffsReady) return []
        const modes: QuoteMode[] = []
        if (quote.pricing_mode === 'custom') modes.push('km')
        if (quote.price_per_minute != null) modes.push('time')
        if (!modes.length || quote.mode === 'platform') modes.unshift('platform')
        if (!modes.includes(quote.mode)) modes.unshift(quote.mode)
        return modes.map((m) => {
            const q2: DriverQuote = { ...quote, mode: m, row: { ...quote.row, pricing_mode: m === 'km' ? 'custom' : 'platform' } }
            const sh = getEffectivePricing(q2.row as unknown as DriverPricingRow, kind)
            return { mode: m, rule: quoteRule(q2, sh, hourly), examples: quoteExamples(q2, sh, hourly).map((e) => ({ ...e, price: Math.max(e.price, floor) })) }
        }).sort((x, y) => Number(y.mode === quote.mode) - Number(x.mode === quote.mode))
    })()
    const soft = `${colors.border}30`
    const Icon = kind === 'carro' ? Car : Bike
    const active = !!quote?.active
    const withComment = (reviews || []).filter((r) => r.comment)
    const noChat = () => toast.message('Este motorista ainda não recebe mensagens pelo iUser. Peça a corrida: ele é avisado na hora.')
    const eta = etaFromViewer(viewerPos, quote?.live ?? null)
    const list = showAll ? reviews || [] : (withComment.length ? withComment : reviews || []).slice(0, 4)

    const saveFraming = async () => {
        if (!vehicle || !pos) return
        setSavingPos(true)
        const { error } = await supabase.from('driver_vehicles').update({ car_photo_pos_x: pos.x, car_photo_pos_y: pos.y }).eq('driver_id', p.driverId).eq('vehicle_slug', vehicle.slug)
        setSavingPos(false)
        if (error) { toast.error('Não deu para salvar o enquadramento: ' + error.message); return }
        setVehicle({ ...vehicle, posX: pos.x, posY: pos.y })
        setFraming(false); setPos(null)
        toast.success('Foto enquadrada')
    }

    const cta = owner
        ? { label: 'Editar a minha tarifa', sub: quote ? `O botão do seu perfil usa: ${quoteModeLabel(quote.mode)}` : 'Escolha como o seu perfil cobra', price: fromPrice, onClick: () => router.push('/canal-do-motorista?aba=plano') }
        : vehicle
            ? {
                label: 'Solicitar corrida',
                sub: [eta ? `chega em ~${eta.minutes} min` : null, quote ? quoteModeClientLabel(quote.mode) : null].filter(Boolean).join(' · ') || 'O aviso chega na hora',
                price: fromPrice,
                onClick: () => {
                    // a página de CHAMAR ESTE motorista (/chamar/<@>): com a posição de quem pede, a PARTIDA já vai preenchida e falta só a chegada
                    const qs = new URLSearchParams()
                    if (viewerPos) {
                        qs.set('origem', viewerSource === 'saved' && savedPlace?.address ? savedPlace.address : 'Minha localização')
                        qs.set('origem_lat', String(viewerPos.lat)); qs.set('origem_lng', String(viewerPos.lng))
                    }
                    router.push(`/chamar/${encodeURIComponent(p.slug)}${qs.toString() ? `?${qs}` : ''}`)
                },
            }
            : null

    if (quote === null || vehicle === undefined || stats === null) return <DriverSkeleton />

    return (
        <div className={`pb-10 ${asClient ? '[&_[data-owner-only]]:hidden' : ''}`}>
            {/* VER PERFIL: o aviso de que é a visão do cliente, com a volta */}
            {asClient && typeof document !== 'undefined' && createPortal(
                <div className="fixed left-0 right-0 z-[60] flex justify-center px-4" style={{ bottom: 'calc(14px + env(safe-area-inset-bottom, 0px) + var(--shell-bottom, 0px) + var(--staging-banner-h, 0px))' }}>
                    <div className="w-full max-w-md rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-2 text-white" style={{ background: '#111827', boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6)' }}>
                        <Eye size={16} className="flex-shrink-0" style={{ color: ORANGE }} />
                        <span className="min-w-0 flex-1 text-[12.5px] font-bold leading-tight">Você está vendo como o <b>cliente</b> vê</span>
                        <button onClick={() => setAsClient(false)} className="h-9 px-4 rounded-full text-[12.5px] font-black flex-shrink-0" style={{ background: ORANGE }}>Voltar</button>
                    </div>
                </div>,
                document.body,
            )}
            {askLoc && !owner && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[96] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={dismissAsk}>
                    <div className="w-full max-w-md rounded-t-[28px] p-5 pb-7 flex flex-col gap-3" style={{ background: colors.background, paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))' }} onClick={(e) => e.stopPropagation()}>
                        <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: GREEN }}>{locStatus === 'asking' ? <Navigation size={22} className="animate-pulse" /> : <MapPin size={22} />}</span>
                        <div>
                            <h2 className="text-[18px] font-black leading-tight" style={{ color: colors.textPrimary }}>{locStatus === 'asking' ? 'Localizando você…' : `Onde você está?`}</h2>
                            <p className="text-[13px] mt-1 leading-snug" style={{ color: colors.textSecondary }}>Com a sua localização mostramos em quanto tempo {p.name.split(' ')[0]} chega e o pedido já sai daí, com o valor na hora. Ela não fica salva.</p>
                            {locStatus === 'denied' && <p className="text-[12px] font-bold mt-2" style={{ color: '#ca8a04' }}>A localização está bloqueada ou não respondeu. Libere nas configurações do navegador e tente de novo{savedPlace ? ', ou use o seu endereço salvo' : ''}.</p>}
                        </div>
                        <button onClick={() => locateMe()} disabled={locStatus === 'asking'} className="h-12 rounded-full text-[14px] font-black text-white flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: GREEN }}><Navigation size={17} /> {locStatus === 'denied' ? 'Tentar de novo' : 'Usar minha localização'}</button>
                        {savedPlace && (
                            <button onClick={() => { setViewerPos({ lat: savedPlace.lat, lng: savedPlace.lng }); setViewerSource('saved'); dismissAsk() }} className="h-12 rounded-full text-[13px] font-black flex items-center justify-center gap-2 px-4" style={{ background: soft, color: colors.textPrimary }}>
                                <MapPin size={16} className="flex-shrink-0" /><span className="truncate">Usar {savedPlace.address}</span>
                            </button>
                        )}
                        <button onClick={dismissAsk} className="h-10 text-[13px] font-bold" style={{ color: colors.textSecondary }}>Agora não</button>
                    </div>
                </div>,
                document.body,
            )}
            {/* ===== 1. o motorista: a IMAGEM ocupa 2/3 do cartão (o MAPA de onde ele está, se ele deixa o local visível, ou a foto do veículo) e entra no
                fundo do cartão por um degradê; em cima o voltar e a situação; embaixo, sobre o degradê, a foto à esquerda e o nome, o @, o nível e o veículo à
                direita. O 1/3 de baixo é compacto: o que o carro tem, os números numa linha e os botões ===== */}
            <section className="rounded-[28px] overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}>
                <div className="relative h-[300px]" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})` }}>
                    {quote?.live ? (
                        <>
                            {/* o logo e os créditos do Mapbox ficam VISÍVEIS (termos): em cima, à direita, abaixo da situação (embaixo entram a foto e o nome) */}
                            <style>{`.driver-hero-map .mapboxgl-ctrl-top-right { top: 44px !important; }`}</style>
                            <div className="driver-hero-map absolute inset-0"><ApproxMap lat={quote.live.lat} lng={quote.live.lng} kind={kind} /></div>
                        </>
                    ) : (
                        <>
                            {vehicle?.photo && <img src={vehicle.photo} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover select-none" style={{ objectPosition: `${(pos ?? { x: vehicle.posX, y: vehicle.posY }).x}% ${(pos ?? { x: vehicle.posX, y: vehicle.posY }).y}%` }} />}
                            {!vehicle?.photo && <span className="absolute inset-x-0 top-6 bottom-28 flex items-center justify-center text-white/30"><Icon size={84} /></span>}
                        </>
                    )}
                    {/* o degradê que leva a imagem para dentro do cartão (some enquanto o dono enquadra a foto) */}
                    {!framing && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[58%] pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent 0%, ${colors.surface}cc 55%, ${colors.surface} 100%)` }} />}
                    {!framing && <span aria-hidden className="absolute inset-x-0 top-0 h-16 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35), transparent)' }} />}

                    {/* em cima: o voltar e a situação */}
                    {p.onBack && (
                        <button onClick={p.onBack} aria-label="Voltar" className="absolute left-3 top-3 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white shadow transition active:scale-90" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}>
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <span className="absolute right-3 top-3 z-10 h-8 px-3 rounded-full text-[11.5px] font-black text-white flex items-center gap-1.5 shadow" style={{ background: active ? GREEN : 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
                        <span className={`w-1.5 h-1.5 rounded-full bg-white ${active ? 'animate-pulse' : 'opacity-60'}`} />{active ? 'Dirigindo agora' : 'Fora do ar agora'}
                    </span>
                    {/* o dono enquadra a foto: o ícone de mover, logo abaixo da situação */}
                    {owner && !quote?.live && vehicle?.photo && !framing && (
                        <button onClick={() => { setPos({ x: vehicle.posX, y: vehicle.posY }); setFraming(true) }} aria-label="Enquadrar a foto do veículo" className="absolute right-3 top-14 z-10 w-9 h-9 rounded-full flex items-center justify-center text-white shadow transition active:scale-90" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
                            <Move size={17} />
                        </button>
                    )}

                    {/* embaixo, sobre o degradê: a foto à esquerda; nome, @, nível e o veículo à direita */}
                    {!framing && (
                        <div className="absolute left-4 right-4 bottom-3 z-10 flex items-end gap-3">
                            <div className="rounded-full p-1 flex-shrink-0" style={{ background: colors.surface, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>{p.avatarSlot}</div>
                            <div className="min-w-0 flex-1 pb-1">
                                <h1 className="text-[22px] font-black leading-tight line-clamp-2" style={{ color: colors.textPrimary }}>{p.name}</h1>
                                <div className="flex items-center gap-2 mt-0.5 min-w-0">
                                    <span className="text-[12.5px] truncate" style={{ color: colors.textSecondary }}>@{p.slug}</span>
                                    {p.levelSlot}
                                </div>
                                {vehicle && (
                                    <span className="mt-1.5 inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-black max-w-full" style={{ background: `${GREEN}1f`, color: GREEN }}>
                                        <Icon size={13} className="flex-shrink-0" /><span className="truncate">{KIND_LABEL[kind]}{vehicle.model ? ` · ${vehicle.model}` : ''}{vehicle.color ? ` ${vehicle.color}` : ''}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {framing && vehicle && (
                        <div className="absolute inset-0 z-20 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none', boxShadow: `inset 0 0 0 3px ${GREEN}` }}
                            onPointerDown={(e) => {
                                const r = e.currentTarget.getBoundingClientRect(); const cur = pos ?? { x: vehicle.posX, y: vehicle.posY }
                                drag.current = { px: e.clientX, py: e.clientY, x: cur.x, y: cur.y, w: r.width, h: r.height }
                                e.currentTarget.setPointerCapture(e.pointerId)
                            }}
                            onPointerMove={(e) => {
                                const d = drag.current; if (!d) return
                                // arrastar para a direita mostra mais da esquerda da foto (o ponto do centro anda ao contrário do dedo)
                                const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
                                setPos({ x: clamp(d.x - ((e.clientX - d.px) / d.w) * 110), y: clamp(d.y - ((e.clientY - d.py) / d.h) * 110) })
                            }}
                            onPointerUp={() => { drag.current = null }}
                            onPointerCancel={() => { drag.current = null }}
                        >
                            <span className="absolute left-1/2 -translate-x-1/2 top-3 h-8 px-3 rounded-full text-[11.5px] font-black text-white flex items-center gap-1.5 shadow pointer-events-none whitespace-nowrap" style={{ background: 'rgba(0,0,0,0.6)' }}><Move size={13} /> Arraste a foto para enquadrar</span>
                            <div className="absolute right-3 bottom-3 flex gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
                                <button onClick={() => { setFraming(false); setPos(null) }} className="h-10 px-4 rounded-full text-[12.5px] font-black text-white shadow" style={{ background: 'rgba(0,0,0,0.6)' }}>Cancelar</button>
                                <button onClick={saveFraming} disabled={savingPos} className="h-10 px-4 rounded-full text-[12.5px] font-black text-white shadow disabled:opacity-60" style={{ background: GREEN }}>{savingPos ? 'Salvando…' : 'Salvar'}</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* o 1/3 de baixo, compacto */}
                <div className="px-4 pb-4 pt-1 flex flex-col gap-2.5">
                    {/* o que o CARRO tem (moto e bicicleta não têm ar, Wi-Fi, carregador...: os ícones ficariam todos riscados) */}
                    {vehicle && kind === 'carro' && <CarAmenities services={vehicle.services} seats={vehicle.seats} babySeat={vehicle.babySeat} compact />}
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[12.5px]" style={{ color: colors.textSecondary }}>
                        <span className="flex items-center gap-1"><Star size={14} className="fill-amber-400 text-amber-400" /><b style={{ color: colors.textPrimary }}>{stats?.rating != null ? stats.rating.toFixed(1).replace('.', ',') : 'Novo'}</b>{stats && stats.ratingCount > 0 ? <span>({stats.ratingCount})</span> : null}</span>
                        <span className="flex items-center gap-1"><Route size={14} style={{ color: GREEN }} /><b style={{ color: colors.textPrimary }}>{stats?.rides ?? 0}</b> {(stats?.rides ?? 0) === 1 ? 'corrida' : 'corridas'}</span>
                        {monthYear(stats?.since ?? null) && <span className="flex items-center gap-1"><Calendar size={14} style={{ color: GREEN }} />desde <b style={{ color: colors.textPrimary }}>{monthYear(stats?.since ?? null)}</b></span>}
                    </div>
                    {owner ? (
                        <div className="flex items-center gap-2">
                            <button onClick={p.onEdit} className="flex-1 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ background: soft, color: colors.textPrimary }}><Pencil size={14} /> Editar perfil</button>
                            <button onClick={() => { setAsClient(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex-1 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ background: `${ORANGE}1a`, color: ORANGE_DARK }}><Eye size={14} /> Ver perfil</button>
                        </div>
                    ) : asClient ? (
                        <div className="flex items-center gap-2">
                            {['Seguir', 'Conversar'].map((l) => (
                                <button key={l} onClick={() => toast.message('É assim que o cliente vê este botão. Você não pode usar no próprio perfil.')} className="flex-1 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={l === 'Seguir' ? { background: GREEN, color: '#fff' } : { background: soft, color: colors.textPrimary }}>
                                    {l === 'Conversar' && <MessageCircle size={14} />}{l}
                                </button>
                            ))}
                        </div>
                    ) : p.socialSlot}
                    {owner && p.ownerTypeSlot}
                    {!owner && p.reportSlot && <div className="mt-2 flex justify-end">{p.reportSlot}</div>}
                </div>
            </section>

            {/* ===== 2. UM botão só: Solicitar corrida (o dono: Editar a minha tarifa) ===== */}
            {cta && (
                <button onClick={cta.onClick} className="mt-4 w-full min-h-[66px] rounded-[22px] pl-4 pr-2.5 py-2.5 flex items-center gap-3 text-left text-white transition active:scale-[0.99]" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`, boxShadow: `0 12px 28px -12px ${GREEN}` }}>
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>{owner ? <Pencil size={18} /> : <Icon size={20} />}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-black leading-tight">{cta.label}</span>
                        <span className="block text-[12px] font-bold leading-tight opacity-90 truncate">{cta.sub}</span>
                    </span>
                    {/* o VALOR em destaque, no laranja do iUser (decisão do dono, 17/11/2026) */}
                    {cta.price != null ? (
                        <span className="flex-shrink-0 rounded-2xl px-3 py-1.5 flex flex-col items-end leading-none" style={{ background: '#fff', boxShadow: `0 6px 16px -8px ${ORANGE_DARK}` }}>
                            <span className="text-[9.5px] font-black uppercase tracking-wide" style={{ color: ORANGE_DARK }}>a partir de</span>
                            <span className="mt-0.5 text-[19px] font-black tracking-tight" style={{ color: ORANGE }}>{brl(cta.price)}</span>
                        </span>
                    ) : <ChevronRight size={20} className="flex-shrink-0" />}
                </button>
            )}

            {/* ===== 3. as ABAS: Avaliações (primeiro) · Serviços · Informações (onde está, o veículo, quanto custa) ===== */}
            <div role="tablist" aria-label="Sobre o motorista" className="mt-5 p-1 rounded-[20px] flex gap-1" style={{ background: `${colors.border}45` }}>
                {([
                    { id: 'avaliacoes', label: 'Avaliações', icon: <Star size={15} />, n: stats?.ratingCount || 0 },
                    { id: 'servicos', label: 'Serviços', icon: <Wrench size={15} />, n: p.services.length },
                    { id: 'info', label: 'Informações', icon: <Info size={15} />, n: 0 },
                ] as const).map((t) => {
                    const on = tab === t.id
                    return (
                        <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)} className="flex-1 min-w-0 h-11 rounded-2xl flex items-center justify-center gap-1.5 text-[12.5px] transition active:scale-95"
                            style={on ? { background: colors.background, color: GREEN, fontWeight: 900, boxShadow: '0 2px 10px rgba(0,0,0,0.12)' } : { color: colors.textSecondary, fontWeight: 700 }}>
                            {t.icon}<span className="truncate">{t.label}</span>{t.n > 0 && <span className="text-[10px] opacity-70">({t.n})</span>}
                        </button>
                    )
                })}
            </div>

            <div className="mt-4">
                {tab === 'avaliacoes' && (
            <section>
                {reviews === null ? (
                    <div className="mt-2.5 h-24 rounded-3xl animate-pulse" style={{ background: soft }} />
                ) : reviews.length === 0 ? (
                    <div className="mt-2.5 rounded-3xl p-4 text-[12.5px]" style={{ background: soft, color: colors.textSecondary }}>Ainda sem avaliações. Depois de cada corrida o passageiro pode avaliar.</div>
                ) : (
                    <>
                        {stats?.rating != null && (
                            <div className="mt-2.5 rounded-3xl p-4 flex items-center gap-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                <span className="text-[40px] font-black leading-none" style={{ color: colors.textPrimary }}>{stats.rating.toFixed(1).replace('.', ',')}</span>
                                <span className="flex flex-col gap-1">
                                    <Stars value={stats.rating} size={16} />
                                    <span className="text-[12px]" style={{ color: colors.textSecondary }}>{stats.ratingCount} {stats.ratingCount === 1 ? 'avaliação' : 'avaliações'} · {stats.rides} {stats.rides === 1 ? 'corrida' : 'corridas'}</span>
                                </span>
                            </div>
                        )}
                        <div className="mt-2.5 flex flex-col gap-2.5">
                            {list.map((r, i) => (
                                <article key={i} className="rounded-3xl p-3.5" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                    <div className="flex items-center gap-2.5">
                                        <button onClick={() => r.slug && router.push(`/${r.slug}`)} disabled={!r.slug} className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-white text-[13px] font-black" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)' }}>
                                            {r.avatar ? <img src={r.avatar} alt="" className="w-full h-full object-cover" /> : (r.name || '?').charAt(0).toUpperCase()}
                                        </button>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{r.name || 'Passageiro'}</span>
                                            <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{r.from} → {r.to} · {ago(r.at)}</span>
                                        </span>
                                        {r.rating != null && <Stars value={r.rating} size={12} />}
                                    </div>
                                    {r.comment && <p className="mt-2 text-[13px] leading-snug" style={{ color: colors.textPrimary }}>“{r.comment}”</p>}
                                </article>
                            ))}
                        </div>
                        {(reviews.length > list.length || showAll) && reviews.length > 4 && (
                            <button onClick={() => setShowAll((v) => !v)} className="mt-2.5 w-full h-11 rounded-full text-[13px] font-black" style={{ background: soft, color: colors.textPrimary }}>
                                {showAll ? 'Ver menos' : `Ver todas as ${reviews.length} avaliações`}
                            </button>
                        )}
                    </>
                )}
            </section>

                )}

                {tab === 'servicos' && (
                    p.services.length > 0 || (p.allowScheduling && !owner) ? (
<section>
                    <p className="text-[12px]" style={{ color: colors.textSecondary }}>{p.allowScheduling ? 'Converse sobre o serviço ou marque um horário: o agendamento entra na agenda dele e na sua.' : 'Converse sobre o serviço para combinar.'}</p>
                    <div className="mt-2.5 flex flex-col gap-2.5">
                        {p.services.map((sv) => (
                            <article key={sv.id} className="rounded-3xl p-3 flex flex-col gap-2.5" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                <div className="flex items-center gap-3">
                                    <span className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: `${GREEN}1a`, color: GREEN }}>
                                        {sv.image_url ? <img src={sv.image_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Wrench size={22} />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        {sv.service_type && <span className="block text-[10px] font-black uppercase tracking-wide truncate" style={{ color: GREEN }}>{sv.service_type}</span>}
                                        <span className="block text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>{sv.name}</span>
                                        {sv.description && <span className="block text-[11.5px] leading-snug line-clamp-2 mt-0.5" style={{ color: colors.textSecondary }}>{sv.description}</span>}
                                    </span>
                                </div>
                                {!owner && (
                                    <div className="flex gap-2">
                                        {p.chatEnabled
                                            ? <div className="flex-1 min-w-0 flex"><ChatContactButton productId={sv.id} colors={colors} variant="v3quiet" label="Conversar" /></div>
                                            : <button onClick={noChat} className="flex-1 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ background: soft, color: colors.textSecondary }}><MessageCircle size={15} /> Conversar</button>}
                                        {p.allowScheduling && (
                                            <button onClick={() => p.onSchedule(sv.name)} className="flex-1 h-10 rounded-full text-[12.5px] font-black text-white flex items-center justify-center gap-1.5 transition active:scale-95" style={{ background: GREEN }}><CalendarCheck size={15} /> Agendar</button>
                                        )}
                                    </div>
                                )}
                            </article>
                        ))}
                        {p.allowScheduling && !owner && p.services.length === 0 && (
                            <button onClick={() => p.onSchedule(null)} className="h-11 rounded-full text-[13px] font-black text-white flex items-center justify-center gap-1.5" style={{ background: GREEN }}><CalendarCheck size={16} /> Marcar um horário</button>
                        )}
                    </div>
                </section>
                    ) : (
                        <div className="rounded-3xl p-5 text-center" style={{ background: soft }}>
                            <Wrench size={22} className="mx-auto" style={{ color: GREEN }} />
                            <p className="mt-2 text-[13px] font-black" style={{ color: colors.textPrimary }}>{owner ? 'Você ainda não publicou serviços' : 'Sem serviços publicados'}</p>
                            <p className="mt-0.5 text-[12px]" style={{ color: colors.textSecondary }}>{owner ? 'Transfer, motorista por hora, frete... publique e ligue a agenda para marcarem horário com você.' : 'Por enquanto, peça a corrida pelo botão acima.'}</p>
                            {owner && <button onClick={() => router.push('/meus-servicos')} className="mt-3 h-10 px-5 rounded-full text-[12.5px] font-black text-white" style={{ background: GREEN }}>Publicar serviço</button>}
                        </div>
                    )
                )}

                {tab === 'info' && (
                    <div className="flex flex-col gap-5">
            {/* ===== 3. onde está agora: a situação (o mapa, quando há, fica no topo) ===== */}
            <section>
                <h2 className="text-[16px] font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><MapPin size={16} style={{ color: GREEN }} /> Onde está agora</h2>
                <div className="mt-2.5 rounded-3xl p-4 flex items-center gap-3" style={{ background: quote?.live ? `${GREEN}12` : soft }}>
                    <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${GREEN}1f`, color: GREEN }}>{quote?.live || p.loggedIn || !active ? <MapPin size={19} /> : <Lock size={18} />}</span>
                    <p className="text-[12.5px] leading-snug flex flex-col" style={{ color: quote?.live ? colors.textPrimary : colors.textSecondary }}>
                        {quote?.live ? (eta ? <span className="flex items-center gap-1 text-[14px] font-black" style={{ color: GREEN }}><Navigation size={14} />{etaText(eta)}</span> : <span>Dirigindo agora, por perto. Use a sua localização para ver em quanto tempo ele chega.</span>)
                            : !active ? 'Fora do ar agora. Peça mesmo assim: o aviso chega no celular na hora.'
                                : !p.loggedIn ? 'Entre na sua conta para ver por onde o motorista está agora.'
                                    : 'Dirigindo, mas sem mostrar a localização. Peça mesmo assim: o aviso chega na hora.'}
                    </p>
                </div>
            </section>

            {/* ===== 4. o veículo ===== */}
            {vehicle && (
                <section>
                    <h2 className="text-[16px] font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Icon size={16} style={{ color: GREEN }} /> O veículo</h2>
                    {/* o veículo e o que ele TEM (ar, Wi-Fi, carregador, som, pet, lugares, cadeirinha): é a ficha do serviço do motorista; não abre outra página */}
                    <div className="mt-2.5 w-full rounded-3xl p-3 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                        <div className="flex items-center gap-3">
                            <span className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: `${GREEN}1a`, color: GREEN }}>
                                {vehicle.photo ? <img src={vehicle.photo} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Icon size={30} />}
                            </span>
                            <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                                <span className="text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{vehicle.model || KIND_LABEL[kind]}</span>
                                {vehicle.color && <span className="text-[12px] font-bold" style={{ color: colors.textSecondary }}>{vehicle.color}</span>}
                                <span className="text-[11.5px] flex items-center gap-1" style={{ color: colors.textSecondary }}>{kind === 'carro' ? KIND_LABEL[kind] : <><Users size={12} /> leva 1 pessoa ou 1 objeto</>}</span>
                            </span>
                        </div>
                        {kind === 'carro' && <CarAmenities services={vehicle.services} seats={vehicle.seats} babySeat={vehicle.babySeat} />}
                    </div>
                </section>
            )}

            {/* ===== 5. quanto custa: todos os jeitos que ele cobra, o do botão primeiro e marcado ===== */}
            {priceModes.length > 0 && (
                <section>
                    <h2 className="text-[16px] font-black" style={{ color: colors.textPrimary }}>Quanto custa</h2>
                    <div className="mt-2.5 flex flex-col gap-2.5">
                        {priceModes.map((pm) => {
                            const main = quote ? pm.mode === quote.mode : false
                            return (
                                <div key={pm.mode} className="rounded-3xl p-4" style={main ? { background: `linear-gradient(150deg, ${GREEN}14, ${GREEN}05)`, border: `1.5px solid ${GREEN}66` } : { background: colors.surface, border: `1px solid ${colors.border}` }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <span className="block text-[14px] font-black" style={{ color: colors.textPrimary }}>{quoteModeLabel(pm.mode)}</span>
                                            <span className="block text-[12px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>{pm.rule}</span>
                                        </div>
                                        {main && <span className="flex-shrink-0 h-6 px-2.5 rounded-full text-[10.5px] font-black flex items-center text-white" style={{ background: GREEN }}>valor do botão</span>}
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        {pm.examples.map((e) => (
                                            <div key={e.label} className="rounded-2xl py-2 text-center" style={{ background: main ? colors.surface : soft }}>
                                                <span className="block text-[11px] font-bold" style={{ color: colors.textSecondary }}>{e.label}</span>
                                                <span className="block text-[15px] font-black" style={{ color: main ? GREEN : colors.textPrimary }}>{brl(e.price)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <p className="text-[10.5px] mt-2.5 leading-snug" style={{ color: colors.textSecondary }}>Ao pedir, a corrida vai pelo valor do botão e já como a sua oferta. Extras (pet, compras, condomínio) somam quando você marca.</p>
                </section>
            )}

                    </div>
                )}
            </div>
        </div>
    )
}
