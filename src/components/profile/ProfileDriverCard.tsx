// src/components/profile/ProfileDriverCard.tsx
//
// Perfil do tipo MOTORISTA (17/11/2026): o veículo da pessoa (foto, modelo e cor, online ou não) e o "a partir de" pela tarifa DELA
// (tarifa própria se usa, senão a Tarifa iUser do veículo), com o atalho para a página do veículo. `useDriverVehicle` também diz à página
// se há veículo (sem veículo o botão "Solicitar corrida" não aparece). Dados públicos: `driver_vehicles` e `driver_pricing` já são lidos
// assim pela página do veículo (/<vehicle_slug>); nada de placa nem posição aqui.
'use client'

import { useEffect, useState } from 'react'
import { Bike, Car, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { loadPlatformTariffs } from '@/lib/platformTariffs'
import { getEffectivePricing, type DriverPricingRow } from '@/lib/driverPricing'

export interface DriverVehicleInfo {
    slug: string
    kind: 'carro' | 'moto' | 'bicicleta'
    model: string | null
    color: string | null
    photo: string | null
    active: boolean
    /** o valor de partida da tarifa que vale para ele (R$) */
    fromPrice: number | null
    customTariff: boolean
}

const KIND_LABEL = { carro: 'Carro', moto: 'Moto', bicicleta: 'Bicicleta' } as const
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const photoUrl = (p: string | null) => (p ? (p.startsWith('http') ? p : supabase.storage.from('driver-car-photos').getPublicUrl(p).data.publicUrl) : null)

/** O veículo principal do motorista (o mexido por último, como no Radar) e a tarifa dele. undefined = carregando; null = sem veículo */
export function useDriverVehicle(driverId: string | null | undefined): DriverVehicleInfo | null | undefined {
    // a resposta é guardada junto com o motorista a que se refere: enquanto a busca do motorista ATUAL não volta, é "carregando"
    // (antes o "sem veículo" de antes valia por um quadro e a página desenhava o cabeçalho do perfil comum)
    const [state, setState] = useState<{ id: string | null; info: DriverVehicleInfo | null }>({ id: null, info: null })
    useEffect(() => {
        if (!driverId) return
        let alive = true
        void (async () => {
            const [{ data: v }, { data: pr }] = await Promise.all([
                supabase.from('driver_vehicles').select('vehicle_slug, vehicle_kind, car_model, car_color, car_photo_url').eq('driver_id', driverId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
                supabase.from('driver_pricing').select('pricing_mode, base_distance_km, base_fee, price_per_km_after_base, driver_mode_active, live_location_sync, live_updated_at').eq('driver_id', driverId).maybeSingle(),
                loadPlatformTariffs(supabase),   // a Tarifa iUser vem do banco: carregar antes de calcular
            ])
            if (!alive) return
            if (!v) { setState({ id: driverId, info: null }); return }
            const kind = ((v as any).vehicle_kind || 'carro') as DriverVehicleInfo['kind']
            const row = (pr as DriverPricingRow | null) || { pricing_mode: 'platform', base_distance_km: null, base_fee: null, price_per_km_after_base: null }
            const pricing = getEffectivePricing(row, kind)
            setState({ id: driverId, info: {
                slug: (v as any).vehicle_slug,
                kind,
                model: (v as any).car_model || null,
                color: (v as any).car_color || null,
                photo: photoUrl((v as any).car_photo_url || null),
                // "Dirigindo agora": modo ligado E posição recente (10 min), igual ao perfil do motorista
                active: !!(pr as any)?.driver_mode_active && !!(pr as any)?.live_location_sync && !!(pr as any)?.live_updated_at && Date.now() - new Date((pr as any).live_updated_at).getTime() < 10 * 60_000,
                fromPrice: pricing ? pricing.baseFee : null,
                customTariff: row.pricing_mode === 'custom',
            } })
        })()
        return () => { alive = false }
    }, [driverId])
    if (!driverId) return null
    return state.id === driverId ? state.info : undefined
}

export default function ProfileDriverCard({ info, colors, onOpen }: { info: DriverVehicleInfo; colors: any; onOpen: () => void }) {
    const Icon = info.kind === 'carro' ? Car : Bike
    const title = info.model || KIND_LABEL[info.kind]
    return (
        <button onClick={onOpen} className="w-full rounded-3xl p-2.5 flex items-center gap-3 text-left transition active:scale-[0.99]" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <span className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: '#16a34a1a', color: '#16a34a' }}>
                {info.photo ? <img src={info.photo} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Icon size={26} />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${info.active ? 'animate-pulse' : ''}`} style={{ background: info.active ? '#22c55e' : `${colors.textSecondary}80` }} />
                    <span className="text-[11px] font-black" style={{ color: info.active ? '#16a34a' : colors.textSecondary }}>{info.active ? 'Dirigindo agora' : 'Fora do ar agora'}</span>
                </span>
                <span className="block text-[14px] font-black leading-tight truncate mt-0.5" style={{ color: colors.textPrimary }}>{title}{info.color ? ` · ${info.color}` : ''}</span>
                <span className="block text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                    {info.fromPrice != null ? <>a partir de <b style={{ color: colors.textPrimary }}>{brl(info.fromPrice)}</b> · {info.customTariff ? 'tarifa própria' : 'Tarifa iUser'}</> : KIND_LABEL[info.kind]}
                </span>
            </span>
            <span className="flex items-center text-[11px] font-black flex-shrink-0" style={{ color: '#16a34a' }}>Veículo<ChevronRight size={14} /></span>
        </button>
    )
}
