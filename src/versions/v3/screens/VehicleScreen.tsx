// src/versions/v3/screens/VehicleScreen.tsx
//
// Página de um veículo (iuser.com.br/<vehicleSlug>) na interface 3.0.
//  - Cliente: foto do veículo, o motorista (avaliação, corridas feitas, desde quando), quanto custa a corrida, o que
//    o carro oferece e a loja do motorista (se tiver).
//  - Dono: o mesmo cartão, com situação do motorista, números, edição do veículo na própria página e um botão "ver
//    como o cliente vê".
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Baby, Bike, Camera, Car, ChevronRight, Copy, Hash, Luggage, MapPin, Palette, Pencil, Route, Star, Store as StoreIcon,
    Users, X, Check, Gauge, Calendar, Clock, CheckCircle2, ArrowRight, Wallet, Share2, Radio, PhoneCall, Maximize2,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getAvatarUrl } from '@/lib/avatar'
import { Spinner } from '@/components/Spinner'
import ShareLinkDialog from '@/components/ShareLinkDialog'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { vehicleMarkerHtml } from '@/lib/vehicleMarkerIcon'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { DRIVER_SERVICE_OPTIONS, driverServiceLabel } from '@/lib/driverServices'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { computeSuggestedPrice, getEffectivePricing, type DriverPricingRow } from '@/lib/driverPricing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!
const ORANGE = '#ea580c'
const KIND_LABEL: Record<string, string> = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' }

interface Vehicle {
    id: string; driver_id: string; vehicle_kind: 'carro' | 'moto' | 'bicicleta'; vehicle_slug: string
    car_model: string | null; car_color: string | null; car_plate: string | null; car_photo_url: string | null
    services: string[] | null; passenger_capacity: number | null; has_baby_seat: boolean | null
    trunk_bags_pequena: number | null; trunk_bags_media: number | null; trunk_bags_grande: number | null
    trunk_suitcases_pequena: number | null; trunk_suitcases_media: number | null; trunk_suitcases_grande: number | null
}
interface Driver { id: string; slug: string; name: string | null; avatar: string | null }
interface Stats {
    rides: number; rating: number | null; ratingCount: number; since: string | null
    store: { name: string; slug: string; logo: string | null } | null
}

const SELECT = 'id, driver_id, vehicle_kind, vehicle_slug, car_model, car_color, car_plate, car_photo_url, services, passenger_capacity, has_baby_seat, trunk_bags_pequena, trunk_bags_media, trunk_bags_grande, trunk_suitcases_pequena, trunk_suitcases_media, trunk_suitcases_grande'

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
// Trajeto sem expor o endereço exato: só o bairro (tira rua, número e CEP)
const coarseAddress = (a: string | null): string => {
    if (!a) return 'um local'
    const parts = a.split(',').map((x) => x.trim()).filter((x) => x && !/^\d+([-\s]\d+)?$/.test(x))
    if (parts.length >= 3) return parts[1]
    return (parts[0] || '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || 'um local'
}
const photoUrl = (p: string | null) => (p ? (p.startsWith('http') ? p : supabase.storage.from('driver-car-photos').getPublicUrl(p).data.publicUrl) : null)

export default function VehicleScreen() {
    const router = useRouter()
    const params = useParams()
    const vehicleSlug = (Array.isArray(params.vehicleSlug) ? params.vehicleSlug[0] : params.vehicleSlug) || ''
    const { colors } = useTheme()
    const { userId, loading } = useProfile()

    const [vehicle, setVehicle] = useState<Vehicle | null | undefined>(undefined) // undefined = carregando, null = não existe
    const [driver, setDriver] = useState<Driver | null>(null)
    const [driverActive, setDriverActive] = useState<boolean | null>(null)
    const [pricingRow, setPricingRow] = useState<DriverPricingRow | null>(null)
    const [tariffsReady, setTariffsReady] = useState(false)
    const [stats, setStats] = useState<Stats | null>(null)
    // Dono: Veículo, Clientes (pedidos acontecendo), Histórico (corridas feitas) ou a prévia do que o cliente vê
    const [tab, setTabState] = useState<'veiculo' | 'clientes' | 'historico' | 'cliente'>('veiculo')
    const setTab = (t: typeof tab) => { touchedTab.current = true; setTabState(t) }
    const viewAsClient = tab === 'cliente'
    const [activeCount, setActiveCount] = useState(0)
    const [live, setLive] = useState<{ sync: boolean; lat: number | null; lng: number | null; at: string | null }>({ sync: false, lat: null, lng: null, at: null })
    const [recent, setRecent] = useState<{ at: string; km: number | null; from: string; to: string; rating: number | null; comment: string | null; who: string | null }[]>([])
    const [shareOpen, setShareOpen] = useState(false)
    const [zoom, setZoom] = useState(false)
    const [feeOpen, setFeeOpen] = useState(false)
    const touchedTab = useRef(false)
    const [editing, setEditing] = useState(false)

    const load = useCallback(async () => {
        const { data } = await supabase.from('driver_vehicles').select(SELECT).ilike('vehicle_slug', vehicleSlug).maybeSingle()
        if (!data) { setVehicle(null); return }
        const v = data as Vehicle
        setVehicle(v)
        const [{ data: prof }, { data: pricing }, { data: st }] = await Promise.all([
            supabase.from('profiles').select('id, profileSlug, name, avatar_url').eq('id', v.driver_id).maybeSingle(),
            supabase.from('driver_pricing').select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado, driver_mode_active, live_location_sync, live_lat, live_lng, live_updated_at').eq('driver_id', v.driver_id).maybeSingle(),
            supabase.rpc('get_driver_public_stats', { p_driver: v.driver_id }),
            loadPlatformTariffs(supabase), // a tarifa da plataforma vem do banco: sempre carregar antes de calcular preço
        ]).then((r) => { setTariffsReady(true); return r as any })
        if (prof) setDriver({ id: (prof as any).id, slug: (prof as any).profileSlug, name: (prof as any).name, avatar: getAvatarUrl(supabase, (prof as any).avatar_url) || null })
        setDriverActive(!!(pricing as any)?.driver_mode_active)
        const pr = pricing as any
        setLive({ sync: !!pr?.live_location_sync, lat: pr?.live_lat != null ? Number(pr.live_lat) : null, lng: pr?.live_lng != null ? Number(pr.live_lng) : null, at: pr?.live_updated_at || null })
        supabase.rpc('get_driver_recent_rides', { p_driver: v.driver_id, p_limit: 6 }).then(({ data: rr }) => {
            setRecent(((rr as any[]) || []).map((r) => ({
                at: r.rode_at,
                km: r.distance_km != null ? Number(r.distance_km) : null,
                from: coarseAddress(r.origin_address),
                to: coarseAddress(r.destination_address),
                rating: r.rating != null ? Number(r.rating) : null,
                comment: r.comment || null,
                who: r.reviewer_name || (r.reviewer_slug ? `@${r.reviewer_slug}` : null),
            })))
        })
        setPricingRow((pricing as DriverPricingRow) || { pricing_mode: 'platform', base_distance_km: null, base_fee: null, price_per_km_after_base: null })
        const row = Array.isArray(st) ? st[0] : st
        if (row) {
            setStats({
                rides: Number(row.rides_completed) || 0,
                rating: row.rating_avg != null ? Number(row.rating_avg) : null,
                ratingCount: Number(row.rating_count) || 0,
                since: row.member_since || null,
                store: row.store_slug ? {
                    name: row.store_name, slug: row.store_slug,
                    logo: row.store_logo ? (String(row.store_logo).startsWith('http') ? row.store_logo : supabase.storage.from('store-logos').getPublicUrl(row.store_logo).data.publicUrl) : null,
                } : null,
            })
        }
    }, [vehicleSlug])

    useEffect(() => { load() }, [load])

    // Chegou cliente pedindo corrida: abre direto em "Clientes" (a menos que o motorista já tenha escolhido outra aba)
    useEffect(() => {
        if (activeCount > 0 && !touchedTab.current) setTabState('clientes')
    }, [activeCount])

    // Quantos pedidos acontecendo agora (selo da aba Clientes), mesmo antes de abrir a aba
    useEffect(() => {
        if (!userId || !vehicle || vehicle.driver_id !== userId) return
        let cancelled = false
        ;(async () => {
            const [{ count: accepted }, { count: pending }] = await Promise.all([
                supabase.from('ride_requests').select('id', { count: 'exact', head: true }).eq('driver_id', userId).eq('status', 'accepted'),
                supabase.from('ride_applications').select('id', { count: 'exact', head: true }).eq('applicant_id', userId).eq('status', 'pending'),
            ])
            if (!cancelled) setActiveCount((accepted || 0) + (pending || 0))
        })()
        return () => { cancelled = true }
    }, [userId, vehicle])

    // Posição ao vivo: o cliente vê onde o motorista está (se ele deixa a localização ligada); atualiza sozinha
    useEffect(() => {
        if (!vehicle) return
        const id = setInterval(async () => {
            const { data } = await supabase.from('driver_pricing').select('driver_mode_active, live_location_sync, live_lat, live_lng, live_updated_at').eq('driver_id', vehicle.driver_id).maybeSingle()
            const pr = data as any
            if (!pr) return
            setDriverActive(!!pr.driver_mode_active)
            setLive({ sync: !!pr.live_location_sync, lat: pr.live_lat != null ? Number(pr.live_lat) : null, lng: pr.live_lng != null ? Number(pr.live_lng) : null, at: pr.live_updated_at || null })
        }, 12000)
        return () => clearInterval(id)
    }, [vehicle])

    const isOwner = !!userId && !!vehicle && vehicle.driver_id === userId
    const ownerView = isOwner && !viewAsClient
    const photo = photoUrl(vehicle?.car_photo_url || null)
    const KindIcon = vehicle?.vehicle_kind === 'carro' ? Car : Bike

    const pricing = useMemo(
        () => (vehicle && pricingRow && tariffsReady ? getEffectivePricing(pricingRow, vehicle.vehicle_kind) : null),
        [vehicle, pricingRow, tariffsReady],
    )
    const luggage = vehicle
        ? [
            (vehicle.trunk_bags_pequena || 0) + (vehicle.trunk_bags_media || 0) + (vehicle.trunk_bags_grande || 0),
            (vehicle.trunk_suitcases_pequena || 0) + (vehicle.trunk_suitcases_media || 0) + (vehicle.trunk_suitcases_grande || 0),
        ]
        : [0, 0]

    const shareLink = async () => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/${vehicleSlug}`)
            toast.success('Link do veículo copiado!')
        } catch { toast.error('Não foi possível copiar o link') }
    }

    const soft = { background: `${colors.border}30` }

    const Stat = ({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) => (
        <div className="rounded-2xl p-3 flex flex-col gap-1" style={soft}>
            <span style={{ color: ORANGE }}>{icon}</span>
            <span className="text-base font-black leading-tight" style={{ color: colors.textPrimary }}>{value}</span>
            <span className="text-[11px] leading-tight" style={{ color: colors.textSecondary }}>{label}</span>
        </div>
    )
    const Fact = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
        <div className="rounded-2xl p-3 flex items-center gap-3" style={soft}>
            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}>{icon}</span>
            <span className="min-w-0">
                <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{label}</span>
                <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{value}</span>
            </span>
        </div>
    )

    if (loading || vehicle === undefined) {
        return <div className="flex justify-center py-16"><Spinner size={28} color={colors.accent} /></div>
    }
    if (vehicle === null) {
        return (
            <div className="mt-6 rounded-3xl p-6 text-center" style={soft}>
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Veículo não encontrado.</p>
                <button onClick={() => router.push('/')} className="mt-3 px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Voltar</button>
            </div>
        )
    }

    const title = vehicle.car_model || KIND_LABEL[vehicle.vehicle_kind] || 'Veículo'
    const since = stats?.since
        ? `${new Date(stats.since).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(new Date(stats.since).getFullYear()).slice(2)}`
        : null
    const examples = pricing ? [3, 5, 10, 20].map((km) => ({ km, price: computeSuggestedPrice(km, pricing) })) : []

    return (
        <div className="pb-6">
            {/* Dono: o veículo, os clientes (pedidos acontecendo), o histórico e a prévia do que o cliente enxerga */}
            {isOwner && (
                <div className="flex gap-1.5 mb-3 -mx-4 px-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {(([
                        { id: 'veiculo', label: 'Meu veículo' },
                        { id: 'clientes', label: 'Clientes', count: activeCount },
                        { id: 'historico', label: 'Histórico' },
                        { id: 'cliente', label: 'Como o cliente vê' },
                    ] as { id: typeof tab; label: string; count?: number }[])
                        // com cliente pedindo corrida, "Clientes" vai para o começo da fila
                        .sort((a, b) => (activeCount > 0 ? Number(b.id === 'clientes') - Number(a.id === 'clientes') : 0))
                    ).map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className="flex-shrink-0 h-10 px-4 rounded-full text-xs font-black flex items-center gap-1.5 transition active:scale-95"
                            style={tab === t.id ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}
                        >
                            {t.label}
                            {!!t.count && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center" style={{ background: tab === t.id ? '#fff' : '#16a34a', color: tab === t.id ? '#dc2626' : '#fff' }}>{t.count}</span>}
                        </button>
                    ))}
                </div>
            )}

            {isOwner && (tab === 'clientes' || tab === 'historico') ? (
                <RidesPanel mode={tab} me={vehicle.driver_id} onCount={setActiveCount} />
            ) : (<>
            {/* Onde ele está agora: em cima de tudo (cliente) */}
            {!ownerView && (
                <div className={isOwner ? '' : '-mt-6'}>
                    <LiveMap live={live} kind={vehicle.vehicle_kind} colors={colors} soft={soft} />
                </div>
            )}

            {/* A tela dividida: o carro à esquerda; o motorista e o botão de chamar à direita */}
            <section className={`${!ownerView ? 'mt-5' : ''} grid grid-cols-[1.12fr_1fr] gap-2.5`}>
                <div className="relative rounded-3xl overflow-hidden min-h-[196px]" style={{ background: `${ORANGE}22` }}>
                    {photo
                        ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        : <span className="absolute inset-0 flex items-center justify-center" style={{ color: ORANGE }}><KindIcon size={56} /></span>}
                    <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.78) 100%)' }} />
                    <span className="absolute left-2.5 top-2.5 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full text-white" style={{ background: ORANGE }}>
                        {KIND_LABEL[vehicle.vehicle_kind] || 'Veículo'}
                    </span>
                    {photo && (
                        <button onClick={() => setZoom(true)} aria-label="Ampliar a foto do veículo" className="absolute right-2.5 top-2.5 w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(8px)' }}>
                            <Maximize2 size={16} />
                        </button>
                    )}
                    <div className="absolute left-3 right-3 bottom-2.5">
                        {driverActive != null && (
                            <span className="inline-flex items-center gap-1 mb-1.5 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: driverActive ? '#16a34a' : '#6b7280' }}>
                                {driverActive ? 'Disponível' : 'Indisponível'}
                            </span>
                        )}
                        <h1 className="text-xl font-black leading-tight text-white line-clamp-2">{title}</h1>
                        <p className="text-xs font-bold text-white/85 truncate">
                            {[vehicle.car_color, ownerView ? vehicle.car_plate : null].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                </div>

                <div className="rounded-3xl p-3 flex flex-col justify-center gap-2.5" style={soft}>
                    {driver && (
                        <button onClick={() => router.push(`/${driver.slug}`)} className="flex items-center gap-2.5 text-left min-w-0">
                            <PlanAvatarRing userId={driver.id} width={2}>
                                <span className="block w-11 h-11 rounded-full overflow-hidden" style={{ background: GRADIENT }}>
                                    {driver.avatar
                                        ? <img src={driver.avatar} alt="" className="w-full h-full object-cover" />
                                        : <span className="w-full h-full flex items-center justify-center text-white font-black">{driver.slug.charAt(0).toUpperCase()}</span>}
                                </span>
                            </PlanAvatarRing>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[10px] leading-none" style={{ color: colors.textSecondary }}>{isOwner ? 'Você' : 'Motorista'}</span>
                                <span className="block text-[13px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{driver.name || `@${driver.slug}`}</span>
                                <span className="block text-[11px] leading-tight truncate" style={{ color: colors.textSecondary }}>@{driver.slug}</span>
                            </span>
                        </button>
                    )}
                    {ownerView ? (
                        <button onClick={() => setEditing(true)} className="w-full h-12 rounded-2xl text-white flex flex-col items-center justify-center leading-tight transition active:scale-[0.98]" style={{ background: GRADIENT }}>
                            <span className="text-sm font-black flex items-center gap-1.5"><Pencil size={14} /> Editar</span>
                            <span className="text-[10px] opacity-90">dados e fotos</span>
                        </button>
                    ) : driver ? (
                        <button
                            onClick={() => router.push(`/pedir-motorista?motorista=${driver.id}`)}
                            className="w-full h-12 rounded-2xl text-white flex flex-col items-center justify-center leading-tight transition active:scale-[0.98]"
                            style={{ background: GRADIENT, boxShadow: '0 6px 16px #f9731640' }}
                        >
                            <span className="text-sm font-black flex items-center gap-1.5"><PhoneCall size={14} /> Chamar</span>
                            <span className="text-[10px] opacity-90">{pricing ? `a partir de ${brl(pricing.baseFee)}` : 'ele é avisado na hora'}</span>
                        </button>
                    ) : null}
                </div>
            </section>

            {/* Números e o botão de compartilhar, tudo na mesma linha */}
            <section className="mt-2.5 flex items-stretch gap-2">
                {[
                    { icon: <Star size={13} className="fill-current" />, value: stats && stats.rating != null ? stats.rating.toFixed(1) : 'Novo', label: stats && stats.ratingCount > 0 ? `${stats.ratingCount} ${stats.ratingCount === 1 ? 'avaliação' : 'avaliações'}` : 'sem avaliações' },
                    { icon: <Route size={13} />, value: String(stats?.rides ?? 0), label: (stats?.rides ?? 0) === 1 ? 'corrida' : 'corridas' },
                    { icon: <Calendar size={13} />, value: since || '—', label: 'no iUser' },
                ].map((x, i) => (
                    <div key={i} className="flex-1 min-w-0 rounded-2xl px-2.5 py-2 flex flex-col justify-center" style={soft}>
                        <span className="flex items-center gap-1 text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>
                            <span style={{ color: ORANGE }} className="flex-shrink-0">{x.icon}</span><span className="truncate">{x.value}</span>
                        </span>
                        <span className="block text-[9.5px] leading-tight mt-0.5 truncate" style={{ color: colors.textSecondary }}>{x.label}</span>
                    </div>
                ))}
                <button
                    onClick={() => setShareOpen(true)}
                    className="flex-shrink-0 w-[100px] rounded-2xl text-white flex flex-col items-center justify-center leading-tight transition active:scale-[0.97]"
                    style={{ background: GRADIENT, boxShadow: '0 6px 16px #f9731640' }}
                >
                    <span className="flex items-center gap-1 text-[11px] font-black whitespace-nowrap"><Share2 size={12} className="flex-shrink-0" /> Compartilhar</span>
                    <span className="text-[10px] opacity-90">página</span>
                </button>
            </section>

            {/* O carro tem + dados do veículo, num cartão só */}
            {(() => {
                const svcs = vehicle.services || []
                const facts: { icon: React.ReactNode; text: string }[] = []
                if (vehicle.passenger_capacity != null) facts.push({ icon: <Users size={13} />, text: `${vehicle.passenger_capacity} ${vehicle.passenger_capacity === 1 ? 'passageiro' : 'passageiros'}` })
                if (ownerView && vehicle.car_plate) facts.push({ icon: <Hash size={13} />, text: vehicle.car_plate })
                if (vehicle.vehicle_kind === 'carro' && vehicle.has_baby_seat) facts.push({ icon: <Baby size={13} />, text: 'Cadeirinha' })
                // porta-malas por tamanho (a soma engana: cada número é quantos cabem daquele tamanho)
                const sizes = (label: string, p: number | null, m: number | null, g: number | null) => {
                    const parts = [p ? `${p} P` : null, m ? `${m} M` : null, g ? `${g} G` : null].filter(Boolean)
                    return parts.length ? `${label} ${parts.join(' · ')}` : null
                }
                const bags = sizes('Bolsas', vehicle.trunk_bags_pequena, vehicle.trunk_bags_media, vehicle.trunk_bags_grande)
                const cases = sizes('Malas', vehicle.trunk_suitcases_pequena, vehicle.trunk_suitcases_media, vehicle.trunk_suitcases_grande)
                if (bags) facts.push({ icon: <Luggage size={13} />, text: bags })
                if (cases) facts.push({ icon: <Luggage size={13} />, text: cases })
                if (svcs.length === 0 && facts.length === 0) return null
                return (
                    <section className="mt-2.5 rounded-2xl p-3" style={soft}>
                        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>O carro tem</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {svcs.map((sv) => {
                                const Icon = DRIVER_SERVICE_OPTIONS.find((o) => o.id === sv)?.icon
                                return (
                                    <span key={sv} className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1" style={{ background: `${ORANGE}1a`, color: ORANGE }}>
                                        {Icon && <Icon size={12} className="flex-shrink-0" />}{driverServiceLabel(sv)}
                                    </span>
                                )
                            })}
                            {facts.map((f, i) => (
                                <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>
                                    <span className="flex-shrink-0" style={{ color: colors.textSecondary }}>{f.icon}</span>{f.text}
                                </span>
                            ))}
                        </div>
                    </section>
                )
            })()}

            {/* Dono: painel */}
            {ownerView && (
                <section className="mt-4 flex flex-col gap-2.5">
                    <div className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: driverActive ? '#16a34a1a' : `${colors.border}30` }}>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: driverActive ? '#16a34a' : '#9ca3af' }} />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{driverActive ? 'Você está disponível para corridas' : 'Você está indisponível'}</span>
                            <span className="block text-xs" style={{ color: colors.textSecondary }}>Ligue ou desligue no painel do motorista</span>
                        </span>
                        <button onClick={() => router.push('/painel-motorista')} className="h-9 px-4 rounded-full text-xs font-black flex-shrink-0" style={{ background: `${colors.border}60`, color: colors.textPrimary }}>Abrir</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        <button onClick={() => router.push('/aceitar-corridas')} className="h-12 rounded-2xl text-xs font-black flex items-center justify-center gap-2" style={{ ...soft, color: colors.textPrimary }}>
                            <Route size={16} style={{ color: ORANGE }} /> Aceitar corridas
                        </button>
                        <button onClick={() => router.push('/minhas-corridas')} className="h-12 rounded-2xl text-xs font-black flex items-center justify-center gap-2" style={{ ...soft, color: colors.textPrimary }}>
                            <Car size={16} style={{ color: ORANGE }} /> Minhas corridas
                        </button>
                    </div>
                </section>
            )}

            {/* Quanto custa: uma linha; o detalhe vem numa mensagem */}
            <button onClick={() => setFeeOpen(true)} className="mt-2.5 w-full rounded-2xl px-3.5 py-3 flex items-center gap-3 text-left transition active:scale-[0.99]" style={soft}>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#16a34a1f', color: '#16a34a' }}><Wallet size={17} /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black leading-tight" style={{ color: colors.textPrimary }}>Quanto custa a corrida</span>
                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{pricing ? `a partir de ${brl(pricing.baseFee)}` : 'ver a tarifa'}</span>
                </span>
                <span className="text-xs font-black flex-shrink-0 flex items-center gap-0.5" style={{ color: ORANGE }}>Ver como é cobrado <ChevronRight size={14} /></span>
            </button>

            {/* Corridas, cada uma com o que disseram dela: mostra se as pessoas estão falando ou não */}
            {(stats?.rides ?? 0) > 0 && (
                <section className="mt-4">
                    <h2 className="text-sm font-black" style={{ color: colors.textPrimary }}>Corridas ({stats?.rides ?? 0})</h2>
                    <div className="mt-2 flex flex-col gap-2">
                        {recent.map((r, i) => (
                            <div key={i} className="rounded-2xl px-3.5 py-2.5" style={soft}>
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-black min-w-0" style={{ color: colors.textPrimary }}>
                                        Corrida de {r.from} <span style={{ color: colors.textSecondary }}>para</span> {r.to}
                                    </p>
                                    <span className="text-[10px] flex-shrink-0" style={{ color: colors.textSecondary }}>
                                        {new Date(r.at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                                        {r.km != null ? ` · ${r.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : ''}
                                    </span>
                                </div>
                                {r.comment ? (
                                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                        <span className="font-black inline-flex items-center gap-0.5" style={{ color: '#ca8a04' }}><Star size={11} className="fill-current" />{r.rating}</span>
                                        {' '}“{r.comment}”{r.who ? <span className="font-bold"> — {r.who}</span> : null}
                                    </p>
                                ) : (
                                    <p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>
                                        {r.rating != null ? <><span className="font-black" style={{ color: '#ca8a04' }}>★ {r.rating}</span> · sem comentário</> : 'Ainda sem avaliação'}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Loja do motorista */}
            {stats?.store && (
                <button onClick={() => router.push(`/${stats.store!.slug}`)} className="mt-4 w-full rounded-2xl p-2.5 flex items-center gap-3 text-left transition active:scale-[0.99]" style={soft}>
                    <span className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 text-white" style={{ background: GRADIENT }}>
                        {stats.store.logo ? <img src={stats.store.logo} alt="" className="w-full h-full object-cover" /> : <StoreIcon size={22} />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[11px]" style={{ color: colors.textSecondary }}>Também tem uma loja</span>
                        <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{stats.store.name}</span>
                    </span>
                    <ChevronRight size={18} style={{ color: colors.textSecondary }} className="flex-shrink-0" />
                </button>
            )}

            {/* Cliente: pedir corrida */}
            {/* Dono: divulgar a página */}
            {ownerView && (
                <section className="mt-6 rounded-3xl p-4" style={{ background: `${ORANGE}14` }}>
                    <h2 className="text-base font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><Radio size={18} style={{ color: ORANGE }} /> Divulgue a sua página</h2>
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                        Cole o link onde seus clientes estão: quem abrir vê onde você está, o quanto custa e pode te chamar na hora.
                    </p>
                    <div className="mt-3 flex items-center gap-2 px-3.5 h-11 rounded-2xl" style={{ background: colors.background }}>
                        <span className="text-xs font-bold truncate flex-1" style={{ color: colors.textPrimary }}>iuser.com.br/{vehicleSlug}</span>
                    </div>
                    <button onClick={() => setShareOpen(true)} className="mt-3 w-full h-12 rounded-full text-sm font-black text-white flex items-center justify-center gap-2 transition active:scale-[0.98]" style={{ background: GRADIENT }}>
                        <Share2 size={17} /> Compartilhar minha página
                    </button>
                </section>
            )}
            <ShareLinkDialog
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                url={typeof window !== 'undefined' ? `${window.location.origin}/${vehicleSlug}` : `/${vehicleSlug}`}
                title="Compartilhar minha página de motorista"
                text={`Preciso de corrida? Me chame na hora pelo iUser: veja onde eu estou, o quanto custa e peça direto comigo.`}
            />

            </>)}

            {feeOpen && (
                <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label="Como é cobrado">
                    <button aria-label="Fechar" onClick={() => setFeeOpen(false)} className="absolute inset-0 bg-black/45" />
                    <div className="relative w-full md:max-w-md rounded-t-[28px] md:rounded-[28px] px-5 pt-5 pb-6" style={{ background: colors.background, boxShadow: '0 -12px 40px rgba(0,0,0,0.25)' }}>
                        <div className="flex items-center gap-2">
                            <h2 className="flex-1 text-lg font-black" style={{ color: colors.textPrimary }}>Como é cobrado</h2>
                            <button onClick={() => setFeeOpen(false)} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><X size={18} /></button>
                        </div>
                        {pricing ? (
                            <div className="mt-3 flex flex-col gap-3">
                                <p className="text-sm" style={{ color: colors.textPrimary }}>
                                    {pricingRow?.pricing_mode === 'custom' ? 'O motorista usa a própria tarifa.' : 'A corrida segue a Tarifa iUser.'}{' '}
                                    O valor é <b>{brl(pricing.baseFee)}</b> até <b>{pricing.baseDistanceKm} km</b>
                                    {pricing.pricePerKmAfterBase > 0 && <>, e depois <b>{brl(pricing.pricePerKmAfterBase)}</b> a cada km</>}.
                                </p>
                                <div className="grid grid-cols-4 gap-2">
                                    {examples.map((e) => (
                                        <div key={e.km} className="rounded-2xl py-2 text-center" style={soft}>
                                            <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{brl(Math.round(e.price * 100) / 100)}</span>
                                            <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{e.km} km</span>
                                        </div>
                                    ))}
                                </div>
                                {(pricing.extraFees.animal > 0 || pricing.extraFees.objeto > 0) && (
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        Extras: {[
                                            pricing.extraFees.animal > 0 ? `animal +${brl(pricing.extraFees.animal)}` : null,
                                            pricing.extraFees.objeto > 0 ? `objeto +${brl(pricing.extraFees.objeto)}` : null,
                                        ].filter(Boolean).join(' · ')}.
                                    </p>
                                )}
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    São valores de referência. O preço final é combinado no pedido: você vê as propostas e escolhe quem aceitar.
                                </p>
                            </div>
                        ) : (
                            <div className="flex justify-center py-6"><Spinner size={20} color={colors.accent} /></div>
                        )}
                    </div>
                </div>
            )}

            {zoom && photo && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Foto do veículo">
                    <button aria-label="Fechar" onClick={() => setZoom(false)} className="absolute inset-0 bg-black/90" />
                    <img src={photo} alt={title} className="relative max-w-full max-h-[88dvh] rounded-2xl object-contain shadow-2xl" />
                    <button onClick={() => setZoom(false)} aria-label="Fechar" className="absolute right-4 w-11 h-11 rounded-full flex items-center justify-center text-white" style={{ top: 'calc(16px + env(safe-area-inset-top))', background: 'rgba(255,255,255,0.18)' }}>
                        <X size={22} />
                    </button>
                    <p className="absolute left-0 right-0 bottom-5 text-center text-sm font-black text-white">{title}{vehicle.car_color ? ` · ${vehicle.car_color}` : ''}</p>
                </div>
            )}

            {editing && vehicle && (
                <EditSheet
                    vehicle={vehicle}
                    onClose={() => setEditing(false)}
                    onSaved={() => { setEditing(false); load() }}
                />
            )}
        </div>
    )
}

// ===== Edição do veículo (só o dono) =====
function EditSheet({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
    const { colors } = useTheme()
    const [model, setModel] = useState(vehicle.car_model || '')
    const [color, setColor] = useState(vehicle.car_color || '')
    const [plate, setPlate] = useState(vehicle.car_plate || '')
    const [passengers, setPassengers] = useState(vehicle.passenger_capacity != null ? String(vehicle.passenger_capacity) : '')
    const [babySeat, setBabySeat] = useState(!!vehicle.has_baby_seat)
    const [services, setServices] = useState<string[]>(vehicle.services || [])
    const [bags, setBags] = useState([vehicle.trunk_bags_pequena, vehicle.trunk_bags_media, vehicle.trunk_bags_grande].map((n) => (n != null ? String(n) : '')))
    const [suitcases, setSuitcases] = useState([vehicle.trunk_suitcases_pequena, vehicle.trunk_suitcases_media, vehicle.trunk_suitcases_grande].map((n) => (n != null ? String(n) : '')))
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(photoUrl(vehicle.car_photo_url))
    const [saving, setSaving] = useState(false)
    const isCar = vehicle.vehicle_kind === 'carro'

    const num = (s: string) => (s.trim() ? parseInt(s, 10) || 0 : null)
    const input = 'w-full px-4 py-3 rounded-2xl text-sm focus:outline-none'
    const inputStyle = { background: `${colors.border}40`, color: colors.textPrimary }

    const save = async () => {
        setSaving(true)
        try {
            let photoPath = vehicle.car_photo_url
            if (file) {
                const ext = file.name.split('.').pop() || 'jpg'
                const path = `${vehicle.driver_id}/${Date.now()}.${ext}`
                const { data, error: upErr } = await supabase.storage.from('driver-car-photos').upload(path, file)
                if (upErr) throw upErr
                photoPath = data?.path || photoPath
            }
            const { error } = await supabase.from('driver_vehicles').update({
                car_model: model.trim() || null,
                car_color: color.trim() || null,
                car_plate: plate.trim().toUpperCase() || null,
                car_photo_url: photoPath,
                services: isCar ? services : [],
                passenger_capacity: num(passengers),
                has_baby_seat: babySeat,
                trunk_bags_pequena: num(bags[0]), trunk_bags_media: num(bags[1]), trunk_bags_grande: num(bags[2]),
                trunk_suitcases_pequena: num(suitcases[0]), trunk_suitcases_media: num(suitcases[1]), trunk_suitcases_grande: num(suitcases[2]),
            }).eq('id', vehicle.id).eq('driver_id', vehicle.driver_id)
            if (error) throw error
            toast.success('Veículo atualizado')
            onSaved()
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível salvar')
        } finally {
            setSaving(false)
        }
    }

    const NumRow = ({ label, values, set }: { label: string; values: string[]; set: (v: string[]) => void }) => (
        <div>
            <p className="text-xs font-black mb-1.5" style={{ color: colors.textSecondary }}>{label}</p>
            <div className="grid grid-cols-3 gap-2">
                {['Pequena', 'Média', 'Grande'].map((n, i) => (
                    <label key={n} className="block">
                        <span className="block text-[10px] mb-0.5" style={{ color: colors.textSecondary }}>{n}</span>
                        <input
                            inputMode="numeric"
                            value={values[i]}
                            onChange={(e) => set(values.map((v, j) => (j === i ? e.target.value.replace(/\D/g, '').slice(0, 2) : v)))}
                            className={input}
                            style={inputStyle}
                            placeholder="0"
                        />
                    </label>
                ))}
            </div>
        </div>
    )

    return (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label="Editar veículo">
            <button aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/45" />
            <div className="relative w-full md:max-w-md flex flex-col rounded-t-[28px] md:rounded-[28px] px-4 pt-4 pb-5" style={{ background: colors.background, height: 'min(88dvh, 720px)', boxShadow: '0 -12px 40px rgba(0,0,0,0.25)' }}>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <h2 className="flex-1 text-lg font-black" style={{ color: colors.textPrimary }}>Editar veículo</h2>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><X size={18} /></button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto mt-3 flex flex-col gap-3.5 pr-0.5">
                    <label className="relative block h-40 rounded-3xl overflow-hidden cursor-pointer" style={{ background: `${ORANGE}22` }}>
                        {preview
                            ? <img src={preview} alt="" className="w-full h-full object-cover" />
                            : <span className="w-full h-full flex items-center justify-center" style={{ color: ORANGE }}><Car size={44} /></span>}
                        <span className="absolute right-3 bottom-3 h-9 px-3.5 rounded-full text-xs font-black text-white flex items-center gap-1.5" style={{ background: 'rgba(0,0,0,0.55)' }}>
                            <Camera size={14} /> Trocar foto
                        </span>
                        <input
                            type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)) } }}
                        />
                    </label>

                    <div className="grid grid-cols-2 gap-2.5">
                        <label className="block col-span-2">
                            <span className="block text-xs font-black mb-1" style={{ color: colors.textSecondary }}>Modelo</span>
                            <input value={model} onChange={(e) => setModel(e.target.value)} className={input} style={inputStyle} placeholder="Ex.: Tracker" />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-black mb-1" style={{ color: colors.textSecondary }}>Cor</span>
                            <input value={color} onChange={(e) => setColor(e.target.value)} className={input} style={inputStyle} placeholder="Branca" />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-black mb-1" style={{ color: colors.textSecondary }}>Placa</span>
                            <input value={plate} onChange={(e) => setPlate(e.target.value)} className={`${input} uppercase`} style={inputStyle} placeholder="ABC1D23" maxLength={8} />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-black mb-1" style={{ color: colors.textSecondary }}>Passageiros</span>
                            <input inputMode="numeric" value={passengers} onChange={(e) => setPassengers(e.target.value.replace(/\D/g, '').slice(0, 2))} className={input} style={inputStyle} placeholder="4" />
                        </label>
                        {isCar && (
                            <button
                                type="button"
                                onClick={() => setBabySeat((v) => !v)}
                                className="self-end h-[46px] rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition active:scale-[0.98]"
                                style={babySeat ? { background: `${ORANGE}22`, color: ORANGE } : { ...inputStyle }}
                            >
                                <Baby size={16} /> {babySeat ? 'Tem cadeirinha' : 'Sem cadeirinha'}
                            </button>
                        )}
                    </div>

                    {isCar && (
                        <>
                            <NumRow label="Bolsas que cabem no porta-malas" values={bags} set={setBags} />
                            <NumRow label="Malas que cabem no porta-malas" values={suitcases} set={setSuitcases} />
                            <div>
                                <p className="text-xs font-black mb-1.5" style={{ color: colors.textSecondary }}>Serviços que faz</p>
                                <div className="flex flex-wrap gap-2">
                                    {DRIVER_SERVICE_OPTIONS.map((opt) => {
                                        const on = services.includes(opt.id)
                                        const Icon = opt.icon
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setServices((cur) => (on ? cur.filter((x) => x !== opt.id) : [...cur, opt.id]))}
                                                className="h-9 pl-3 pr-3.5 rounded-full text-xs font-black flex items-center gap-1.5 transition active:scale-95"
                                                style={on ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}40`, color: colors.textPrimary }}
                                            >
                                                <Icon size={14} /> {opt.label} {on && <Check size={13} strokeWidth={3} />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                    <p className="text-[11px] flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                        <Gauge size={12} className="flex-shrink-0" /> O endereço da página (link) não muda quando você troca modelo ou placa.
                    </p>
                </div>

                <div className="flex-shrink-0 pt-3 flex gap-2">
                    <button onClick={onClose} className="h-12 px-5 rounded-full text-sm font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Cancelar</button>
                    <button onClick={save} disabled={saving} className="flex-1 h-12 rounded-full text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: GRADIENT }}>
                        {saving ? <Spinner size={18} color="#fff" /> : 'Salvar alterações'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ===== Clientes (pedidos acontecendo) e Histórico (corridas feitas) — só o dono =====
interface RideRow {
    id: string
    status: string
    created_at: string
    ride_started_at: string | null
    driver_arrived_at: string | null
    driver_en_route: boolean | null
    origin_address: string | null
    destination_address: string | null
    requester_id: string
    price: number | null
    kind: 'andamento' | 'aguardando' | 'feita'
}
interface Person { slug: string | null; name: string | null; avatar: string | null }

const shortAddress = (a: string | null) => (a ? a.split(',').slice(0, 2).join(',').trim() : '—')

function RidesPanel({ mode, me, onCount }: { mode: 'clientes' | 'historico'; me: string; onCount: (n: number) => void }) {
    const router = useRouter()
    const { colors } = useTheme()
    const [rows, setRows] = useState<RideRow[] | null>(null)
    const [people, setPeople] = useState<Record<string, Person>>({})

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const cols = 'id, requester_id, status, created_at, ride_started_at, driver_arrived_at, driver_en_route, origin_address, destination_address, offered_price'
            const [{ data: mine }, { data: apps }] = await Promise.all([
                supabase.from('ride_requests').select(cols).eq('driver_id', me).in('status', ['accepted', 'completed']).order('created_at', { ascending: false }).limit(80),
                supabase.from('ride_applications').select('ride_request_id, proposed_price, status').eq('applicant_id', me).limit(200),
            ])
            const priceByRide = new Map(((apps as any[]) || []).map((a) => [a.ride_request_id as string, a.proposed_price != null ? Number(a.proposed_price) : null]))
            const out: RideRow[] = ((mine as any[]) || []).map((r) => ({
                id: r.id, status: r.status, created_at: r.created_at, ride_started_at: r.ride_started_at,
                driver_arrived_at: r.driver_arrived_at, driver_en_route: r.driver_en_route,
                origin_address: r.origin_address, destination_address: r.destination_address, requester_id: r.requester_id,
                price: priceByRide.get(r.id) ?? (r.offered_price != null ? Number(r.offered_price) : null),
                kind: r.status === 'completed' ? 'feita' : 'andamento',
            }))
            // candidaturas que ainda esperam o cliente escolher
            const pendingIds = ((apps as any[]) || []).filter((a) => a.status === 'pending').map((a) => a.ride_request_id as string)
            if (pendingIds.length) {
                const { data: waiting } = await supabase.from('ride_requests').select(cols).in('id', pendingIds).eq('status', 'pending')
                for (const r of ((waiting as any[]) || [])) {
                    out.push({
                        id: r.id, status: r.status, created_at: r.created_at, ride_started_at: null, driver_arrived_at: null, driver_en_route: null,
                        origin_address: r.origin_address, destination_address: r.destination_address, requester_id: r.requester_id,
                        price: priceByRide.get(r.id) ?? null, kind: 'aguardando',
                    })
                }
            }
            const ids = Array.from(new Set(out.map((r) => r.requester_id)))
            const { data: profs } = ids.length ? await supabase.from('profiles').select('id, profileSlug, name, avatar_url').in('id', ids) : { data: [] as any[] }
            if (cancelled) return
            setPeople(Object.fromEntries(((profs as any[]) || []).map((p) => [p.id, { slug: p.profileSlug, name: p.name, avatar: getAvatarUrl(supabase, p.avatar_url) || null }])))
            setRows(out)
            onCount(out.filter((r) => r.kind !== 'feita').length)
        })().catch(() => { if (!cancelled) setRows([]) })
        return () => { cancelled = true }
    }, [me, onCount])

    const soft = { background: `${colors.border}30` }
    const statusOf = (r: RideRow) => {
        if (r.kind === 'aguardando') return { label: 'Aguardando o cliente escolher', color: '#6b7280' }
        if (r.ride_started_at) return { label: 'Em corrida', color: '#16a34a' }
        if (r.driver_arrived_at) return { label: 'Você chegou ao ponto', color: '#0891b2' }
        if (r.driver_en_route) return { label: 'A caminho do cliente', color: '#ea580c' }
        return { label: 'Corrida aceita', color: '#2563eb' }
    }

    if (rows === null) return <div className="flex justify-center py-12"><Spinner size={24} color={colors.accent} /></div>

    const card = (r: RideRow) => {
        const p = people[r.requester_id]
        const st = statusOf(r)
        return (
            <button
                key={`${r.kind}-${r.id}`}
                onClick={() => router.push(r.kind === 'feita' ? '/minhas-corridas' : r.kind === 'aguardando' ? '/aceitar-corridas' : '/minhas-corridas')}
                className="w-full rounded-2xl p-3 flex flex-col gap-2.5 text-left transition active:scale-[0.99]"
                style={soft}
            >
                <span className="flex items-center gap-2.5">
                    <span className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-black flex-shrink-0" style={{ background: GRADIENT }}>
                        {p?.avatar ? <img src={p.avatar} alt="" className="w-full h-full object-cover" /> : (p?.slug || p?.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{p?.name || (p?.slug ? `@${p.slug}` : 'Cliente')}</span>
                        <span className="block text-[11px]" style={{ color: colors.textSecondary }}>
                            {new Date(r.ride_started_at || r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                            {' · '}
                            {new Date(r.ride_started_at || r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </span>
                    {r.price != null && <span className="text-sm font-black flex-shrink-0" style={{ color: r.kind === 'feita' ? '#16a34a' : colors.textPrimary }}>{brl(r.price)}</span>}
                </span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: colors.textSecondary }}>
                    <span className="truncate min-w-0">{shortAddress(r.origin_address)}</span>
                    <ArrowRight size={12} className="flex-shrink-0" />
                    <span className="truncate min-w-0">{shortAddress(r.destination_address)}</span>
                </span>
                {r.kind !== 'feita' && (
                    <span className="self-start text-[11px] font-black px-2.5 py-1 rounded-full text-white" style={{ background: st.color }}>{st.label}</span>
                )}
            </button>
        )
    }

    if (mode === 'clientes') {
        const andamento = rows.filter((r) => r.kind === 'andamento')
        const aguardando = rows.filter((r) => r.kind === 'aguardando')
        if (andamento.length === 0 && aguardando.length === 0) {
            return (
                <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-2" style={soft}>
                    <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Users size={26} /></span>
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nenhum cliente agora</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Os pedidos de corrida que você aceitar ou em que se candidatar aparecem aqui.</p>
                    <button onClick={() => router.push('/aceitar-corridas')} className="mt-2 h-11 px-5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Ver pedidos abertos</button>
                </div>
            )
        }
        return (
            <div className="flex flex-col gap-4">
                {andamento.length > 0 && (
                    <section>
                        <h2 className="text-sm font-black mb-2 flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Clock size={15} style={{ color: ORANGE }} /> Acontecendo agora ({andamento.length})</h2>
                        <div className="flex flex-col gap-2.5">{andamento.map(card)}</div>
                    </section>
                )}
                {aguardando.length > 0 && (
                    <section>
                        <h2 className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>Candidaturas aguardando ({aguardando.length})</h2>
                        <div className="flex flex-col gap-2.5">{aguardando.map(card)}</div>
                    </section>
                )}
            </div>
        )
    }

    const feitas = rows.filter((r) => r.kind === 'feita')
    const total = feitas.reduce((a, r) => a + (r.price || 0), 0)
    if (feitas.length === 0) {
        return (
            <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-2" style={soft}>
                <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><CheckCircle2 size={26} /></span>
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Nenhuma corrida concluída ainda</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>As corridas que você terminar ficam guardadas aqui.</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl p-3" style={soft}>
                    <span style={{ color: ORANGE }}><Route size={18} /></span>
                    <span className="block text-base font-black mt-1" style={{ color: colors.textPrimary }}>{feitas.length}</span>
                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{feitas.length === 1 ? 'corrida feita' : 'corridas feitas'}</span>
                </div>
                <div className="rounded-2xl p-3" style={soft}>
                    <span style={{ color: '#16a34a' }}><Wallet size={18} /></span>
                    <span className="block text-base font-black mt-1" style={{ color: colors.textPrimary }}>{brl(Math.round(total * 100) / 100)}</span>
                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>combinado nas corridas</span>
                </div>
            </div>
            <div className="flex flex-col gap-2.5">{feitas.map(card)}</div>
        </div>
    )
}

// ===== Onde o motorista está agora =====
function LiveMap({ live, kind, colors, soft }: {
    live: { sync: boolean; lat: number | null; lng: number | null; at: string | null }
    kind: 'carro' | 'moto' | 'bicicleta'
    colors: any
    soft: { background: string }
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const markerRef = useRef<mapboxgl.Marker | null>(null)

    const has = live.sync && live.lat != null && live.lng != null
    const ageMin = live.at ? Math.max(0, Math.round((Date.now() - new Date(live.at).getTime()) / 60000)) : null
    const isLive = has && ageMin != null && ageMin <= 3

    useEffect(() => {
        if (!has || !containerRef.current) return
        if (!mapRef.current) {
            mapRef.current = new mapboxgl.Map({
                container: containerRef.current,
                style: 'mapbox://styles/mapbox/streets-v12',
                center: [live.lng!, live.lat!],
                zoom: 14,
                interactive: false,
                attributionControl: false,
            })
            // crédito dos dados do mapa (OpenStreetMap/Mapbox): o ícone "i" compacto, no canto de baixo à direita
            mapRef.current.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
            markerRef.current = new mapboxgl.Marker({ element: (() => { const el = document.createElement('div'); el.innerHTML = vehicleMarkerHtml(kind, '#ea580c'); return el })() })
                .setLngLat([live.lng!, live.lat!])
                .addTo(mapRef.current)
        } else {
            markerRef.current?.setLngLat([live.lng!, live.lat!])
            mapRef.current.easeTo({ center: [live.lng!, live.lat!], duration: 800 })
        }
    }, [has, live.lat, live.lng, kind])
    useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null }, [])

    return (
        <section className="mt-6">
            <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Onde está agora</h2>
            {has ? (
                <div className="relative mt-3 h-44 rounded-3xl overflow-hidden" style={soft}>
                    <div ref={containerRef} className="w-full h-full" />
                    {/* situação no canto inferior esquerdo do mapa, cobrindo a marca do Mapbox (decisão do produto) */}
                    <span
                        className="absolute left-1.5 bottom-1.5 z-10 min-w-[104px] h-[30px] text-[11px] font-black px-3 rounded-full flex items-center justify-center gap-1.5 shadow"
                        style={{ background: isLive ? '#16a34a' : '#374151', color: '#fff' }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        {isLive ? 'Ao vivo' : ageMin != null && ageMin < 60 ? `há ${ageMin} min` : 'Posição antiga'}
                    </span>
                </div>
            ) : (
                <div className="mt-3 rounded-2xl p-4 flex items-center gap-3" style={soft}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${ORANGE}1f`, color: ORANGE }}><MapPin size={18} /></span>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>O motorista não está compartilhando a localização agora. Chame mesmo assim: ele recebe o aviso na hora.</p>
                </div>
            )}
        </section>
    )
}
