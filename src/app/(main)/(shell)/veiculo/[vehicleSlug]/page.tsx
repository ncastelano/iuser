// app/(main)/veiculo/[vehicleSlug]/page.tsx
//
// Página de um veículo. O endereço público é iuser.com.br/<vehicleSlug> (o proxy reescreve pra cá), igual às lojas:
// uma pessoa pode ter vários veículos, cada um com a sua página. Pra quem é dono: administração do veículo (situação do
// motorista, dados, atalhos). Pra quem visita: o cartão público do veículo e o motorista.
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Bike, Car, Copy, ExternalLink, Pencil, Route, Luggage, Baby, Users, Palette, Hash } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getAvatarUrl } from '@/lib/avatar'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const KIND_LABEL: Record<string, string> = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' }

interface Vehicle {
    id: string
    driver_id: string
    vehicle_kind: string
    vehicle_slug: string
    car_model: string | null
    car_color: string | null
    car_plate: string | null
    car_photo_url: string | null
    services: string[] | null
    passenger_capacity: number | null
    has_baby_seat: boolean | null
    trunk_bags_pequena: number | null
    trunk_bags_media: number | null
    trunk_bags_grande: number | null
    trunk_suitcases_pequena: number | null
    trunk_suitcases_media: number | null
    trunk_suitcases_grande: number | null
}

interface Driver { profileSlug: string; name: string | null; avatar: string | null }

const SELECT = 'id, driver_id, vehicle_kind, vehicle_slug, car_model, car_color, car_plate, car_photo_url, services, passenger_capacity, has_baby_seat, trunk_bags_pequena, trunk_bags_media, trunk_bags_grande, trunk_suitcases_pequena, trunk_suitcases_media, trunk_suitcases_grande'

export default function VeiculoPage() {
    const router = useRouter()
    const params = useParams()
    const vehicleSlug = (Array.isArray(params.vehicleSlug) ? params.vehicleSlug[0] : params.vehicleSlug) || ''
    const { colors } = useTheme()
    const { userId, loading } = useProfile()

    const [vehicle, setVehicle] = useState<Vehicle | null | undefined>(undefined) // undefined = carregando, null = não existe
    const [driver, setDriver] = useState<Driver | null>(null)
    const [driverActive, setDriverActive] = useState<boolean | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const { data } = await supabase.from('driver_vehicles').select(SELECT).ilike('vehicle_slug', vehicleSlug).maybeSingle()
            if (cancelled) return
            if (!data) { setVehicle(null); return }
            const v = data as Vehicle
            setVehicle(v)
            const [{ data: prof }, { data: pricing }] = await Promise.all([
                supabase.from('profiles').select('profileSlug, name, avatar_url').eq('id', v.driver_id).maybeSingle(),
                supabase.from('driver_pricing').select('driver_mode_active').eq('driver_id', v.driver_id).maybeSingle(),
            ])
            if (cancelled) return
            if (prof) setDriver({ profileSlug: (prof as any).profileSlug, name: (prof as any).name, avatar: getAvatarUrl(supabase, (prof as any).avatar_url) || null })
            setDriverActive(!!(pricing as any)?.driver_mode_active)
        })()
        return () => { cancelled = true }
    }, [vehicleSlug])

    const isOwner = !!userId && !!vehicle && vehicle.driver_id === userId
    const photo = vehicle?.car_photo_url
        ? (vehicle.car_photo_url.startsWith('http') ? vehicle.car_photo_url : supabase.storage.from('driver-car-photos').getPublicUrl(vehicle.car_photo_url).data.publicUrl)
        : null
    const KindIcon = vehicle?.vehicle_kind === 'carro' ? Car : Bike
    const shareLink = async () => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/${vehicleSlug}`)
            toast.success('Link do veículo copiado!')
        } catch { toast.error('Não foi possível copiar o link') }
    }

    const Fact = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
        <div className="rounded-2xl border p-3 flex items-center gap-3" style={{ background: colors.surface, borderColor: colors.border }}>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#ea580c1f', color: '#ea580c' }}>{icon}</span>
            <span className="min-w-0">
                <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{label}</span>
                <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{value}</span>
            </span>
        </div>
    )

    const luggage = vehicle
        ? [
            (vehicle.trunk_bags_pequena || 0) + (vehicle.trunk_bags_media || 0) + (vehicle.trunk_bags_grande || 0),
            (vehicle.trunk_suitcases_pequena || 0) + (vehicle.trunk_suitcases_media || 0) + (vehicle.trunk_suitcases_grande || 0),
        ]
        : [0, 0]

    return (
        <>
            {loading || vehicle === undefined ? (
                <div className="flex justify-center py-16"><Spinner size={28} color={colors.accent} /></div>
            ) : vehicle === null ? (
                <div className="mt-6 rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Veículo não encontrado.</p>
                    <button onClick={() => router.push('/modeloinicial')} className="mt-3 px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Voltar</button>
                </div>
            ) : (
                <>
                    {/* Foto + nome do veículo */}
                    <section className="mt-6 rounded-3xl overflow-hidden border" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
                        <div className="relative h-48 sm:h-60 w-full" style={{ background: '#ea580c22' }}>
                            {photo
                                ? <img src={photo} alt="" className="w-full h-full object-cover" />
                                : <span className="w-full h-full flex items-center justify-center" style={{ color: '#ea580c' }}><KindIcon size={56} /></span>}
                            <span className="absolute left-3 top-3 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full text-white" style={{ background: '#ea580c' }}>
                                {KIND_LABEL[vehicle.vehicle_kind] || 'Veículo'}
                            </span>
                            {driverActive != null && (
                                <span
                                    className="absolute right-3 top-3 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full text-white"
                                    style={{ background: driverActive ? '#16a34a' : '#6b7280' }}
                                >
                                    {driverActive ? 'Motorista ativado' : 'Motorista desligado'}
                                </span>
                            )}
                        </div>
                        <div className="p-4 flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <h1 className="text-xl font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{vehicle.car_model || KIND_LABEL[vehicle.vehicle_kind] || 'Veículo'}</h1>
                                {isOwner && vehicle.car_plate && <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>{vehicle.car_plate}</p>}
                            </div>
                            <button onClick={shareLink} aria-label="Copiar link do veículo" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition hover:scale-105" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>
                                <Copy size={17} />
                            </button>
                        </div>
                    </section>

                    {/* Dados do veículo */}
                    <section className="mt-4 grid grid-cols-2 gap-3">
                        {vehicle.car_color && <Fact icon={<Palette size={18} />} label="Cor" value={vehicle.car_color} />}
                        {isOwner && vehicle.car_plate && <Fact icon={<Hash size={18} />} label="Placa" value={vehicle.car_plate} />}
                        {vehicle.passenger_capacity != null && <Fact icon={<Users size={18} />} label="Passageiros" value={String(vehicle.passenger_capacity)} />}
                        <Fact icon={<Baby size={18} />} label="Cadeirinha" value={vehicle.has_baby_seat ? 'Tem' : 'Não tem'} />
                        {(luggage[0] > 0 || luggage[1] > 0) && (
                            <Fact icon={<Luggage size={18} />} label="Porta-malas" value={`${luggage[0]} bolsas · ${luggage[1]} malas`} />
                        )}
                    </section>

                    {vehicle.services && vehicle.services.length > 0 && (
                        <section className="mt-4">
                            <h2 className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>Serviços que faz</h2>
                            <div className="flex flex-wrap gap-2">
                                {vehicle.services.map((sv) => (
                                    <span key={sv} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: '#ea580c1a', color: '#ea580c' }}>{sv}</span>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Dono: administração. Visitante: o motorista e pedir corrida */}
                    {isOwner ? (
                        <section className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <button onClick={() => router.push(`/painel-motorista?veiculo=${encodeURIComponent(vehicle.vehicle_kind)}`)} className="rounded-2xl p-4 flex items-center gap-3 text-left text-white transition hover:scale-[1.02] active:scale-95" style={{ background: GRADIENT, boxShadow: '0 6px 16px #f9731640' }}>
                                <Pencil size={20} />
                                <span><span className="block text-sm font-black">Editar veículo</span><span className="block text-xs opacity-90">Dados, fotos e tarifa</span></span>
                            </button>
                            <button onClick={() => router.push('/aceitar-corridas')} className="rounded-2xl p-4 flex items-center gap-3 text-left border transition hover:-translate-y-0.5 active:scale-95" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}>
                                <Route size={20} style={{ color: '#ea580c' }} />
                                <span><span className="block text-sm font-black">Aceitar corridas</span><span className="block text-xs" style={{ color: colors.textSecondary }}>Veja pedidos abertos</span></span>
                            </button>
                            <button onClick={() => router.push('/minhas-corridas')} className="rounded-2xl p-4 flex items-center gap-3 text-left border transition hover:-translate-y-0.5 active:scale-95" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}>
                                <Car size={20} style={{ color: '#ea580c' }} />
                                <span><span className="block text-sm font-black">Minhas corridas</span><span className="block text-xs" style={{ color: colors.textSecondary }}>Histórico e andamento</span></span>
                            </button>
                        </section>
                    ) : (
                        <section className="mt-5 flex flex-col gap-3">
                            {driver && (
                                <button onClick={() => router.push(`/${driver.profileSlug}`)} className="rounded-2xl border p-3 flex items-center gap-3 text-left transition hover:-translate-y-0.5" style={{ background: colors.surface, borderColor: colors.border }}>
                                    <span className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white font-black flex-shrink-0" style={{ background: GRADIENT }}>
                                        {driver.avatar ? <img src={driver.avatar} alt="" className="w-full h-full object-cover" /> : driver.profileSlug.charAt(0).toUpperCase()}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[11px]" style={{ color: colors.textSecondary }}>Motorista</span>
                                        <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>@{driver.profileSlug}</span>
                                    </span>
                                    <ExternalLink size={16} style={{ color: colors.textSecondary }} />
                                </button>
                            )}
                            <button onClick={() => router.push('/pedir-motorista')} className="py-3 rounded-full text-sm font-black text-white transition hover:scale-[1.02] active:scale-95" style={{ background: GRADIENT }}>
                                Pedir motorista
                            </button>
                        </section>
                    )}
                </>
            )}
        </>
    )
}
