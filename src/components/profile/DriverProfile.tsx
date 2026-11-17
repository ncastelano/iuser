// src/components/profile/DriverProfile.tsx
//
// A PÁGINA DO PERFIL DO TIPO MOTORISTA (17/11/2026, decisão do dono: "uma página para o motorista, com os comentários das pessoas que pediram, o
// mapa onde ela está se quiser mostrar e UM botão de solicitar corrida no valor que ele escolheu"). Ordem:
//   1. Cartão do motorista: em CIMA o mapa de onde ele está (posição APROXIMADA, ~330 m, a do Radar; só para quem está logado e se ele deixou o
//      local visível) ou, sem isso, a foto do veículo; a foto da pessoa, nome, situação, nota, corridas, desde quando, seguir e conversar
//   2. UM botão só: "Solicitar corrida" (o dono vê "Editar a minha tarifa")
//   3. Onde está agora: a situação em uma linha (o mapa fica no topo)
//   4. O veículo: modelo, cor, lugares e o que tem (ar, Wi-Fi, carregador, som, pet — `CarAmenities`)
//   5. Quanto custa: o modo que o motorista escolheu (Tarifa iUser, por km ou por tempo), a regra e três exemplos
//   6. O que dizem os passageiros: a nota grande e as avaliações (as com comentário primeiro)
// Os dados vêm de funções públicas do banco (get_driver_public_quote, get_driver_public_stats, get_driver_reviews) — a tabela da tarifa é
// privada; o valor é calculado em modules/driver-profile. Só apresentação: nenhuma regra de corrida mora aqui.
'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Bike, Calendar, CalendarCheck, Car, ChevronRight, Lock, MapPin, Info, MessageCircle, MessageSquareQuote, Navigation, Pencil, Route, Star, Users, Wrench } from 'lucide-react'
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
import { etaFromViewer, etaText, parseQuote, quoteExamples, quoteModeLabel, quoteRule, type DriverQuote } from '@/modules/driver-profile'
import { loadMyLocation } from '@/lib/myLocation'
import { getCurrentPosition } from '@/lib/nativeGeolocation'
import { isGeoPermissionGranted } from '@/components/AceitarCorridas/LocationAskDialog'
import ChatContactButton from '@/components/ChatContactButton'
import CarAmenities from '@/components/ride/CarAmenities'

const GREEN = '#16a34a'
const GREEN_DARK = '#15803d'
const KIND_LABEL = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' } as const
type Kind = keyof typeof KIND_LABEL

interface Vehicle { slug: string; kind: Kind; model: string | null; color: string | null; photo: string | null; services: string[]; seats: number | null; babySeat: boolean | null }
interface Stats { rides: number; rating: number | null; ratingCount: number; since: string | null }
interface Review { rating: number | null; comment: string | null; at: string; from: string; to: string; name: string | null; slug: string | null; avatar: string | null }

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
const carPhoto = (p: string | null) => (p ? (p.startsWith('http') ? p : supabase.storage.from('driver-car-photos').getPublicUrl(p).data.publicUrl) : null)
const monthYear = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', '/') : null)
const ago = (iso: string) => {
    const d = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000))
    return d === 0 ? 'hoje' : d === 1 ? 'ontem' : d < 30 ? `há ${d} dias` : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

const ago2 = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m <= 1 ? 'agora há pouco' : `há ${m} min` }

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
        const map = new mapboxgl.Map({ container: ref.current, style: 'mapbox://styles/mapbox/streets-v12', center: [lng, lat], zoom: 14.2, interactive: false, attributionControl: false, logoPosition: 'bottom-right' })
        addMapboxCredits(mapboxgl, map)
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
    onEdit: () => void
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
    // onde está quem vê a página: o GPS (só se o navegador já deixou, sem perguntar) ou o local salvo; sem nenhum, não mostra o tempo
    const [viewerPos, setViewerPos] = useState<{ lat: number; lng: number } | null>(null)

    useEffect(() => {
        let alive = true
        void (async () => {
            const [{ data: q }, { data: v }, { data: st }, { data: rv }] = await Promise.all([
                supabase.rpc('get_driver_public_quote', { p_driver: p.driverId }),
                supabase.from('driver_vehicles').select('vehicle_slug, vehicle_kind, car_model, car_color, car_photo_url, services, passenger_capacity, has_baby_seat').eq('driver_id', p.driverId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
                supabase.rpc('get_driver_public_stats', { p_driver: p.driverId }),
                supabase.rpc('get_driver_reviews', { p_driver: p.driverId, p_limit: 20 }),
                loadPlatformTariffs(supabase).then(() => { if (alive) setTariffsReady(true) }),
            ])
            if (!alive) return
            setQuote(parseQuote(q) || parseQuote({ mode: 'platform' }))
            const vv = v as any
            setVehicle(vv ? { slug: vv.vehicle_slug, kind: (vv.vehicle_kind || 'carro') as Kind, model: vv.car_model, color: vv.car_color, photo: carPhoto(vv.car_photo_url), services: vv.services || [], seats: vv.passenger_capacity, babySeat: vv.has_baby_seat } : null)
            const s = Array.isArray(st) ? st[0] : st
            setStats(s ? { rides: Number(s.rides_completed) || 0, rating: s.rating_avg != null ? Number(s.rating_avg) : null, ratingCount: Number(s.rating_count) || 0, since: s.member_since || null } : { rides: 0, rating: null, ratingCount: 0, since: null })
            setReviews(((rv as any[]) || []).map((r) => ({ rating: r.rating, comment: r.comment, at: r.rode_at, from: r.origin, to: r.destination, name: r.reviewer_name, slug: r.reviewer_slug, avatar: r.reviewer_avatar ? getAvatarUrl(supabase, r.reviewer_avatar) || null : null })))
        })()
        return () => { alive = false }
    }, [p.driverId])

    useEffect(() => {
        if (!quote?.live || p.isOwner) return
        let alive = true
        void (async () => {
            if (await isGeoPermissionGranted()) {
                getCurrentPosition((pos) => { if (alive) setViewerPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }) }, async () => {
                    const l = await loadMyLocation(supabase, p.viewerId)
                    if (alive && l) setViewerPos({ lat: l.lat, lng: l.lng })
                }, { timeout: 8000, maximumAge: 120000 })
                return
            }
            const l = await loadMyLocation(supabase, p.viewerId)
            if (alive && l) setViewerPos({ lat: l.lat, lng: l.lng })
        })()
        return () => { alive = false }
    }, [quote?.live, p.isOwner, p.viewerId])

    const kind: Kind = vehicle?.kind || 'carro'
    const shape = useMemo(() => (quote && tariffsReady ? getEffectivePricing(quote.row as unknown as DriverPricingRow, kind) : null), [quote, tariffsReady, kind])
    const floor = platformFloor(null, minPerMinute)   // o mínimo de uma corrida (R$ 8): nenhum exemplo abaixo dele
    const examples = quote && shape ? quoteExamples(quote, shape, hourly).map((e) => ({ ...e, price: Math.max(e.price, floor) })) : []
    const fromPrice = examples.length ? examples[0].price : null
    const soft = `${colors.border}30`
    const Icon = kind === 'carro' ? Car : Bike
    const active = !!quote?.active
    const withComment = (reviews || []).filter((r) => r.comment)
    const noChat = () => toast.message('Este motorista ainda não recebe mensagens pelo iUser. Peça a corrida: ele é avisado na hora.')
    const eta = etaFromViewer(viewerPos, quote?.live ?? null)
    const list = showAll ? reviews || [] : (withComment.length ? withComment : reviews || []).slice(0, 4)

    const cta = p.isOwner
        ? { label: 'Editar a minha tarifa', sub: quote ? `O botão do seu perfil usa: ${quoteModeLabel(quote.mode)}` : 'Escolha como o seu perfil cobra', onClick: () => router.push('/canal-do-motorista?aba=plano') }
        : vehicle
            ? { label: 'Solicitar corrida', sub: quote ? `${quoteModeLabel(quote.mode)}${fromPrice != null ? ` · a partir de ${brl(fromPrice)}` : ''}` : 'O aviso chega na hora', onClick: () => router.push(`/pedir-motorista?motorista=${p.driverId}`) }
            : null

    return (
        <div className="pb-10">
            {/* ===== 1. o motorista: em cima, o MAPA de onde ele está (se ele deixa o local visível) ou a foto do veículo ===== */}
            <section className="rounded-[28px] overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}>
                <div className={`relative ${quote?.live ? 'h-52' : 'h-40'}`} style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})` }}>
                    {quote?.live ? (
                        <>
                            {/* o logo e os créditos do Mapbox ficam VISÍVEIS (termos): acima da faixa em que a foto e o degradê entram no mapa */}
                            <style>{`.driver-hero-map .mapboxgl-ctrl-bottom-right, .driver-hero-map .mapboxgl-ctrl-bottom-left { bottom: 50px !important; }`}</style>
                            <div className="driver-hero-map absolute inset-0"><ApproxMap lat={quote.live.lat} lng={quote.live.lng} kind={kind} /></div>
                            <span aria-hidden className="absolute inset-x-0 bottom-0 h-12 pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent, ${colors.surface})` }} />
                        </>
                    ) : (
                        <>
                            {vehicle?.photo && <img src={vehicle.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                            <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.55))' }} />
                            {!vehicle?.photo && <span className="absolute inset-0 flex items-center justify-center text-white/30"><Icon size={72} /></span>}
                        </>
                    )}
                    <span className="absolute right-3 top-3 z-10 h-7 px-2.5 rounded-full text-[11px] font-black text-white flex items-center gap-1.5 shadow" style={{ background: active ? GREEN : 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
                        <span className={`w-1.5 h-1.5 rounded-full bg-white ${active ? 'animate-pulse' : 'opacity-60'}`} />{active ? 'Dirigindo agora' : 'Fora do ar agora'}
                    </span>
                    {vehicle && (
                        <span className="absolute left-3 top-3 z-10 h-7 px-2.5 rounded-full text-[11px] font-black text-white flex items-center gap-1 shadow" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
                            <Icon size={13} />{KIND_LABEL[kind]}
                        </span>
                    )}
                </div>
                <div className="px-4 pb-4 -mt-11 relative">
                    {/* a foto da pessoa no centro, em cima do nome (entra um pouco no mapa / na foto do veículo) */}
                    <div className="flex flex-col items-center text-center">
                        <div className="rounded-full p-1" style={{ background: colors.surface }}>{p.avatarSlot}</div>
                        <h1 className="mt-1 text-[21px] font-black leading-tight" style={{ color: colors.textPrimary }}>{p.name}</h1>
                        <div className="flex items-center justify-center gap-2 mt-0.5">
                            <span className="text-[12px]" style={{ color: colors.textSecondary }}>@{p.slug}</span>
                            {p.levelSlot}
                        </div>
                        {p.isOwner && (
                            <button onClick={p.onEdit} className="mt-2 h-9 px-3.5 rounded-full text-[12px] font-black flex items-center gap-1.5" style={{ background: soft, color: colors.textPrimary }}><Pencil size={13} /> Editar perfil</button>
                        )}
                    </div>
                    {/* o que o veículo tem, em ícones, no centro, em cima dos números */}
                    {vehicle && <div className="mt-3 flex justify-center"><CarAmenities services={vehicle.services} seats={kind === 'carro' ? vehicle.seats : null} babySeat={kind === 'carro' ? vehicle.babySeat : null} compact /></div>}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                            { icon: <Star size={14} className="fill-amber-400 text-amber-400" />, value: stats?.rating != null ? stats.rating.toFixed(1).replace('.', ',') : 'Novo', label: stats && stats.ratingCount > 0 ? `${stats.ratingCount} ${stats.ratingCount === 1 ? 'avaliação' : 'avaliações'}` : 'sem avaliações' },
                            { icon: <Route size={14} style={{ color: GREEN }} />, value: String(stats?.rides ?? 0), label: (stats?.rides ?? 0) === 1 ? 'corrida' : 'corridas' },
                            { icon: <Calendar size={14} style={{ color: GREEN }} />, value: monthYear(stats?.since ?? null) || '—', label: 'no iUser' },
                        ].map((x, i) => (
                            <div key={i} className="rounded-2xl px-2.5 py-2" style={{ background: soft }}>
                                <span className="flex items-center gap-1 text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>{x.icon}<span className="truncate">{x.value}</span></span>
                                <span className="block text-[10.5px] leading-tight mt-0.5 truncate" style={{ color: colors.textSecondary }}>{x.label}</span>
                            </div>
                        ))}
                    </div>
                    {p.socialSlot && <div className="mt-3">{p.socialSlot}</div>}
                    {p.ownerTypeSlot && <div className="mt-3">{p.ownerTypeSlot}</div>}
                </div>
            </section>

            {/* ===== 2. UM botão só: Solicitar corrida (o dono: Editar a minha tarifa) ===== */}
            {cta && (
                <button onClick={cta.onClick} className="mt-4 w-full h-[62px] rounded-[22px] px-4 flex items-center gap-3 text-left text-white transition active:scale-[0.99]" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`, boxShadow: `0 12px 28px -12px ${GREEN}` }}>
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>{p.isOwner ? <Pencil size={18} /> : <Icon size={20} />}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-black leading-tight">{cta.label}</span>
                        <span className="block text-[12px] font-bold leading-tight opacity-90 truncate">{cta.sub}</span>
                    </span>
                    <ChevronRight size={20} className="flex-shrink-0" />
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
                    p.services.length > 0 || (p.allowScheduling && !p.isOwner) ? (
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
                                {!p.isOwner && (
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
                        {p.allowScheduling && !p.isOwner && p.services.length === 0 && (
                            <button onClick={() => p.onSchedule(null)} className="h-11 rounded-full text-[13px] font-black text-white flex items-center justify-center gap-1.5" style={{ background: GREEN }}><CalendarCheck size={16} /> Marcar um horário</button>
                        )}
                    </div>
                </section>
                    ) : (
                        <div className="rounded-3xl p-5 text-center" style={{ background: soft }}>
                            <Wrench size={22} className="mx-auto" style={{ color: GREEN }} />
                            <p className="mt-2 text-[13px] font-black" style={{ color: colors.textPrimary }}>{p.isOwner ? 'Você ainda não publicou serviços' : 'Sem serviços publicados'}</p>
                            <p className="mt-0.5 text-[12px]" style={{ color: colors.textSecondary }}>{p.isOwner ? 'Transfer, motorista por hora, frete... publique e ligue a agenda para marcarem horário com você.' : 'Por enquanto, peça a corrida pelo botão acima.'}</p>
                            {p.isOwner && <button onClick={() => router.push('/meus-servicos')} className="mt-3 h-10 px-5 rounded-full text-[12.5px] font-black text-white" style={{ background: GREEN }}>Publicar serviço</button>}
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
                        {quote?.live ? <>{eta && <span className="flex items-center gap-1 text-[14px] font-black mb-0.5" style={{ color: GREEN }}><Navigation size={14} />{etaText(eta)}</span>}<span>No mapa lá em cima: <b>posição aproximada</b> (um círculo de uns 300 m), atualizada {ago2(quote.live.at)}.</span></>
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
                        <CarAmenities services={vehicle.services} seats={kind === 'carro' ? vehicle.seats : null} babySeat={kind === 'carro' ? vehicle.babySeat : null} />
                    </div>
                </section>
            )}

            {/* ===== 5. quanto custa ===== */}
            {quote && shape && (
                <section className="rounded-3xl p-4" style={{ background: `linear-gradient(150deg, ${GREEN}14, ${GREEN}05)`, border: `1px solid ${GREEN}40` }}>
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h2 className="text-[16px] font-black" style={{ color: colors.textPrimary }}>Quanto custa</h2>
                            <p className="text-[12px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>{quoteRule(quote, shape, hourly)}</p>
                        </div>
                        <span className="flex-shrink-0 h-7 px-2.5 rounded-full text-[11px] font-black flex items-center text-white" style={{ background: GREEN }}>{quoteModeLabel(quote.mode)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        {examples.map((e) => (
                            <div key={e.label} className="rounded-2xl py-2.5 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                <span className="block text-[11px] font-bold" style={{ color: colors.textSecondary }}>{e.label}</span>
                                <span className="block text-[16px] font-black" style={{ color: GREEN }}>{brl(e.price)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10.5px] mt-2.5 leading-snug" style={{ color: colors.textSecondary }}>O valor da sua corrida aparece antes de confirmar e já vai como a sua oferta. Extras (pet, compras, condomínio) somam quando você marca.</p>
                </section>
            )}

                    </div>
                )}
            </div>
        </div>
    )
}
