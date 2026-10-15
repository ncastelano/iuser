// src/versions/v3/screens/VehicleScreen.tsx
//
// Página de um veículo (iuser.com.br/<vehicleSlug>) na interface 3.0.
//  - Cliente: foto do veículo, o motorista (avaliação, corridas feitas, desde quando), quanto custa a corrida, o que
//    o carro oferece e a loja do motorista (se tiver).
//  - Dono: o mesmo cartão, com situação do motorista, números, edição do veículo na própria página e um botão "ver
//    como o cliente vê".
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Baby, Bike, Camera, Car, ChevronRight, Copy, Hash, Luggage, MapPin, Palette, Pencil, Route, Star, Store as StoreIcon,
    Users, X, Check, Gauge, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getAvatarUrl } from '@/lib/avatar'
import { Spinner } from '@/components/Spinner'
import PlanAvatarRing from '@/components/PlanAvatarRing'
import { DRIVER_SERVICE_OPTIONS, driverServiceLabel } from '@/lib/driverServices'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { computeSuggestedPrice, getEffectivePricing, type DriverPricingRow } from '@/lib/driverPricing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
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
    const [viewAsClient, setViewAsClient] = useState(false)
    const [editing, setEditing] = useState(false)

    const load = useCallback(async () => {
        const { data } = await supabase.from('driver_vehicles').select(SELECT).ilike('vehicle_slug', vehicleSlug).maybeSingle()
        if (!data) { setVehicle(null); return }
        const v = data as Vehicle
        setVehicle(v)
        const [{ data: prof }, { data: pricing }, { data: st }] = await Promise.all([
            supabase.from('profiles').select('id, profileSlug, name, avatar_url').eq('id', v.driver_id).maybeSingle(),
            supabase.from('driver_pricing').select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, extra_fee_pessoa, extra_fee_animal, extra_fee_objeto, extra_fee_condominio, extra_fee_compras, extra_fee_necessidade_especial, extra_fee_pet_sem_caixa, extra_fee_entrega_interna, extra_fee_ar_condicionado, driver_mode_active').eq('driver_id', v.driver_id).maybeSingle(),
            supabase.rpc('get_driver_public_stats', { p_driver: v.driver_id }),
            loadPlatformTariffs(supabase), // a tarifa da plataforma vem do banco: sempre carregar antes de calcular preço
        ]).then((r) => { setTariffsReady(true); return r as any })
        if (prof) setDriver({ id: (prof as any).id, slug: (prof as any).profileSlug, name: (prof as any).name, avatar: getAvatarUrl(supabase, (prof as any).avatar_url) || null })
        setDriverActive(!!(pricing as any)?.driver_mode_active)
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
        ? `${new Date(stats.since).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${new Date(stats.since).getFullYear()}`
        : null
    const examples = pricing ? [3, 5, 10, 20].map((km) => ({ km, price: computeSuggestedPrice(km, pricing) })) : []

    return (
        <div className="pb-6">
            {/* Dono: alterna entre o painel dele e o que o cliente enxerga */}
            {isOwner && (
                <div className="flex p-1 rounded-full mb-3" style={{ background: `${colors.border}40` }}>
                    {[{ id: false, label: 'Meu veículo' }, { id: true, label: 'Como o cliente vê' }].map((t) => (
                        <button
                            key={String(t.id)}
                            onClick={() => setViewAsClient(t.id)}
                            className="flex-1 h-9 rounded-full text-xs font-black transition"
                            style={viewAsClient === t.id ? { background: GRADIENT, color: '#fff' } : { color: colors.textPrimary }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Foto + nome */}
            <section className="relative rounded-3xl overflow-hidden" style={{ background: `${ORANGE}22` }}>
                <div className="relative h-60 w-full">
                    {photo
                        ? <img src={photo} alt="" className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center" style={{ color: ORANGE }}><KindIcon size={64} /></span>}
                    <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.75) 100%)' }} />
                    <span className="absolute left-3 top-3 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full text-white" style={{ background: ORANGE }}>
                        {KIND_LABEL[vehicle.vehicle_kind] || 'Veículo'}
                    </span>
                    {driverActive != null && (
                        <span className="absolute right-3 top-3 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full text-white" style={{ background: driverActive ? '#16a34a' : '#6b7280' }}>
                            {driverActive ? 'Disponível' : 'Indisponível'}
                        </span>
                    )}
                    <div className="absolute left-4 right-4 bottom-3 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="text-2xl font-black leading-tight text-white truncate">{title}</h1>
                            <p className="text-sm font-bold text-white/85 truncate">
                                {[vehicle.car_color, ownerView ? vehicle.car_plate : null].filter(Boolean).join(' · ')}
                            </p>
                        </div>
                        <button onClick={shareLink} aria-label="Copiar link do veículo" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-95" style={{ background: 'rgba(255,255,255,0.22)', color: '#fff', backdropFilter: 'blur(8px)' }}>
                            <Copy size={17} />
                        </button>
                    </div>
                </div>
            </section>

            {/* Motorista */}
            {driver && (
                <button onClick={() => router.push(`/${driver.slug}`)} className="mt-3 w-full rounded-2xl p-3 flex items-center gap-3 text-left transition active:scale-[0.99]" style={soft}>
                    <PlanAvatarRing userId={driver.id} width={2}>
                        <span className="block w-12 h-12 rounded-full overflow-hidden" style={{ background: GRADIENT }}>
                            {driver.avatar
                                ? <img src={driver.avatar} alt="" className="w-full h-full object-cover" />
                                : <span className="w-full h-full flex items-center justify-center text-white font-black">{driver.slug.charAt(0).toUpperCase()}</span>}
                        </span>
                    </PlanAvatarRing>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{isOwner ? 'Você' : 'Motorista'}</span>
                        <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{driver.name || `@${driver.slug}`}</span>
                        <span className="block text-xs truncate" style={{ color: colors.textSecondary }}>@{driver.slug}</span>
                    </span>
                    <ChevronRight size={18} style={{ color: colors.textSecondary }} className="flex-shrink-0" />
                </button>
            )}

            {/* Números do motorista */}
            <section className="mt-3 grid grid-cols-3 gap-2.5">
                <Stat
                    icon={<Star size={18} className="fill-current" />}
                    value={stats && stats.rating != null ? stats.rating.toFixed(1) : 'Novo'}
                    label={stats && stats.ratingCount > 0 ? `${stats.ratingCount} ${stats.ratingCount === 1 ? 'avaliação' : 'avaliações'}` : 'Sem avaliações'}
                />
                <Stat icon={<Route size={18} />} value={String(stats?.rides ?? 0)} label={(stats?.rides ?? 0) === 1 ? 'corrida feita' : 'corridas feitas'} />
                <Stat icon={<Calendar size={18} />} value={since || '—'} label="no iUser desde" />
            </section>

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
                    <button onClick={() => setEditing(true)} className="h-12 rounded-full text-sm font-black text-white flex items-center justify-center gap-2 transition active:scale-[0.98]" style={{ background: GRADIENT }}>
                        <Pencil size={17} /> Editar veículo
                    </button>
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

            {/* Quanto custa */}
            <section className="mt-6">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Quanto custa a corrida</h2>
                    <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>
                        {pricingRow?.pricing_mode === 'custom' ? 'Tarifa do motorista' : 'Tarifa iUser'}
                    </span>
                </div>
                {!pricing ? (
                    <div className="mt-3 flex justify-center py-6"><Spinner size={20} color={colors.accent} /></div>
                ) : (
                    <>
                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                            A partir de <b style={{ color: colors.textPrimary }}>{brl(pricing.baseFee)}</b> até {pricing.baseDistanceKm} km
                            {pricing.pricePerKmAfterBase > 0 && <>, depois <b style={{ color: colors.textPrimary }}>{brl(pricing.pricePerKmAfterBase)}</b> por km</>}.
                        </p>
                        <div className="mt-3 grid grid-cols-4 gap-2">
                            {examples.map((e) => (
                                <div key={e.km} className="rounded-2xl py-2.5 text-center" style={soft}>
                                    <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{brl(Math.round(e.price * 100) / 100)}</span>
                                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{e.km} km</span>
                                </div>
                            ))}
                        </div>
                        {(pricing.extraFees.animal > 0 || pricing.extraFees.objeto > 0) && (
                            <p className="text-xs mt-2.5" style={{ color: colors.textSecondary }}>
                                Extras: {[
                                    pricing.extraFees.animal > 0 ? `animal +${brl(pricing.extraFees.animal)}` : null,
                                    pricing.extraFees.objeto > 0 ? `objeto +${brl(pricing.extraFees.objeto)}` : null,
                                ].filter(Boolean).join(' · ')}. Valores de referência: o preço final é combinado no pedido.
                            </p>
                        )}
                    </>
                )}
            </section>

            {/* O veículo */}
            <section className="mt-6">
                <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>O veículo</h2>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {vehicle.car_color && <Fact icon={<Palette size={17} />} label="Cor" value={vehicle.car_color} />}
                    {ownerView && vehicle.car_plate && <Fact icon={<Hash size={17} />} label="Placa" value={vehicle.car_plate} />}
                    {vehicle.passenger_capacity != null && <Fact icon={<Users size={17} />} label="Passageiros" value={String(vehicle.passenger_capacity)} />}
                    {vehicle.vehicle_kind === 'carro' && <Fact icon={<Baby size={17} />} label="Cadeirinha" value={vehicle.has_baby_seat ? 'Tem' : 'Não tem'} />}
                    {(luggage[0] > 0 || luggage[1] > 0) && <Fact icon={<Luggage size={17} />} label="Porta-malas" value={`${luggage[0]} bolsas · ${luggage[1]} malas`} />}
                </div>
                {vehicle.services && vehicle.services.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {vehicle.services.map((sv) => (
                            <span key={sv} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: `${ORANGE}1a`, color: ORANGE }}>{driverServiceLabel(sv)}</span>
                        ))}
                    </div>
                )}
            </section>

            {/* Loja do motorista */}
            {stats?.store && (
                <button onClick={() => router.push(`/${stats.store!.slug}`)} className="mt-6 w-full rounded-2xl p-3 flex items-center gap-3 text-left transition active:scale-[0.99]" style={soft}>
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
            {!ownerView && (
                <button onClick={() => router.push('/pedir-motorista')} className="mt-6 w-full h-12 rounded-full text-sm font-black text-white flex items-center justify-center gap-2 transition active:scale-[0.98]" style={{ background: GRADIENT, boxShadow: '0 8px 20px #f9731640' }}>
                    <MapPin size={17} /> Pedir corrida
                </button>
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
