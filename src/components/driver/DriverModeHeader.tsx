// components/driver/DriverModeHeader.tsx — no alto do Canal do Motorista (22/11/2026, decisão do dono): mostra que a pessoa está no MODO MOTORISTA
// (ligado/desligado, o veículo, o tipo do perfil) e separa as DUAS páginas: o PERFIL pessoal (que pode ser do tipo Motorista) e a PÁGINA DO VEÍCULO
// (iuser.com.br/<vehicle_slug>), que é o link de serviços do motorista para compartilhar.
'use client'

import { useEffect, useState } from 'react'
import { vehicleName } from '@/lib/vehicleName'
import { useRouter } from 'next/navigation'
import { Car, Share2, User, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { handleShareLink } from '@/lib/share'
import { onDriverMode } from '@/lib/driverMode'
import { VEHICLE_KIND_LABELS, type VehicleKind } from '@/lib/rideVehicle'

type V = { vehicle_slug: string | null; vehicle_kind: VehicleKind; car_brand: string | null; car_model: string | null; car_plate: string | null; car_color: string | null; car_photo_url: string | null }

export default function DriverModeHeader({ userId, profileSlug, avatarUrl, colors }: { userId: string; profileSlug: string | null; avatarUrl: string | null; colors: { textPrimary: string; textSecondary: string; border: string; surface: string } }) {
    const router = useRouter()
    const [on, setOn] = useState<boolean | null>(null)
    const [vehicle, setVehicle] = useState<V | null>(null)
    const [ptype, setPtype] = useState<string | null>(null)
    useEffect(() => {
        let alive = true
        Promise.all([
            supabase.from('driver_pricing').select('driver_mode_active').eq('driver_id', userId).maybeSingle(),
            supabase.from('driver_vehicles').select('vehicle_slug, vehicle_kind, car_brand, car_model, car_plate, car_color, car_photo_url, updated_at').eq('driver_id', userId).order('updated_at', { ascending: false }).limit(1),
            supabase.from('profiles').select('profile_type').eq('id', userId).maybeSingle(),
        ]).then(([p, v, pr]) => {
            if (!alive) return
            setOn(!!(p.data as any)?.driver_mode_active); setVehicle(((v.data as any[]) || [])[0] ?? null); setPtype((pr.data as any)?.profile_type ?? null)
        })
        const off = onDriverMode((a) => setOn(a))
        return () => { alive = false; off() }
    }, [userId])
    if (on === null || !vehicle) return null

    const link = vehicle.vehicle_slug ? `https://www.iuser.com.br/${vehicle.vehicle_slug}` : null
    const label = [VEHICLE_KIND_LABELS[vehicle.vehicle_kind] || 'Veículo', vehicleName(vehicle), vehicle.car_color].filter(Boolean).join(' · ')
    const share = () => link && handleShareLink({ title: 'Chame o meu ' + (VEHICLE_KIND_LABELS[vehicle.vehicle_kind] || 'veículo').toLowerCase() + ' pelo iUser', text: `Peça a sua corrida comigo pelo iUser: ${label}`, url: link, imageUrl: vehicle.car_photo_url })
    const btn = { background: `${colors.border}40`, color: colors.textPrimary }

    return (
        <div className="mb-4 rounded-3xl p-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="flex items-center gap-3">
                <span className="relative w-12 h-12 flex-shrink-0">
                    <span className="block w-12 h-12 rounded-full overflow-hidden" style={{ background: `${colors.border}60` }}>
                        {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <User className="m-3" size={24} style={{ color: colors.textSecondary }} />}
                    </span>
                    <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: on ? '#16a34a' : '#94a3b8', boxShadow: `0 0 0 2px ${colors.surface}` }}><Car size={11} /></span>
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{label}</p>
                    <p className="text-[12px] truncate" style={{ color: colors.textSecondary }}>{profileSlug ? `@${profileSlug} · ` : ''}seu link para chamarem você</p>
                    {ptype && ptype !== 'motorista' && (
                        <button onClick={() => router.push('/painel-perfil?secao=tipo')} className="text-[11.5px] font-bold underline" style={{ color: '#ea580c' }}>Seu perfil está como "{ptype === 'pessoal' ? 'Pessoal' : ptype === 'servicos' ? 'Serviços' : 'Agendamentos'}": mudar para Motorista</button>
                    )}
                </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                {vehicle.vehicle_slug && <button onClick={() => router.push(`/${vehicle.vehicle_slug}`)} className="h-10 rounded-full text-[11.5px] font-black flex items-center justify-center gap-1" style={btn}><ExternalLink size={13} /> Ver página</button>}
                {link && <button onClick={share} className="h-10 rounded-full text-[11.5px] font-black flex items-center justify-center gap-1 text-white" style={{ background: '#f97316' }}><Share2 size={13} /> Compartilhar</button>}
                {profileSlug && <button onClick={() => router.push(`/${profileSlug}`)} className="h-10 rounded-full text-[11.5px] font-black flex items-center justify-center gap-1" style={btn}><User size={13} /> Meu perfil</button>}
            </div>
        </div>
    )
}
