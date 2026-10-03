// src/lib/vehicleHeaderTabs.ts
//
// Abas de veículo da barra do Header — uma por veículo cadastrado (carro,
// moto, bicicleta; a foto do veículo vira a imagem da aba, igual o logo da
// loja) e, enquanto faltar algum tipo, uma "Cadastrar veículo". Por enquanto
// todas levam ao /painel-motorista (aba "Meu veículo", já no tipo certo).
'use client'

import { useEffect, useState } from 'react'
import { Car, Bike, Motorbike, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { VEHICLE_KIND_LABELS, type VehicleKind } from '@/lib/rideVehicle'
import type { Tab } from '@/components/Header'

const KINDS: VehicleKind[] = ['carro', 'moto', 'bicicleta']
const KIND_ICON = { carro: Car, moto: Motorbike, bicicleta: Bike } as const

export interface MyVehicle {
    kind: VehicleKind
    model: string | null
    photoUrl: string | null
}

export function useMyVehicles(userId: string | null | undefined): { vehicles: MyVehicle[]; loaded: boolean } {
    const [vehicles, setVehicles] = useState<MyVehicle[]>([])
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        if (!userId) {
            setVehicles([])
            setLoaded(true)
            return
        }
        let cancelled = false
        supabase
            .from('driver_vehicles')
            .select('vehicle_kind, car_model, car_photo_url')
            .eq('driver_id', userId)
            .then(({ data }) => {
                if (cancelled) return
                const rows = (data || []).map((v) => ({
                    kind: v.vehicle_kind as VehicleKind,
                    model: (v.car_model as string | null) || null,
                    photoUrl: v.car_photo_url ? supabase.storage.from('driver-car-photos').getPublicUrl(v.car_photo_url).data.publicUrl : null,
                }))
                rows.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind))
                setVehicles(rows)
                setLoaded(true)
            })
        return () => { cancelled = true }
    }, [userId])

    return { vehicles, loaded }
}

export function buildVehicleTabs(vehicles: MyVehicle[], navigate: (url: string) => void): Tab[] {
    const tabs: Tab[] = vehicles.map((v) => ({
        id: `veiculo-${v.kind}`,
        label: v.model || VEHICLE_KIND_LABELS[v.kind],
        icon: KIND_ICON[v.kind],
        imageUrl: v.photoUrl,
        onClick: () => navigate(`/painel-motorista?aba=veiculo&veiculo=${v.kind}`),
        isActive: false,
    }))

    const missing = KINDS.filter((k) => !vehicles.some((v) => v.kind === k))
    if (missing.length > 0) {
        tabs.push({
            id: 'cadastrar-veiculo',
            label: vehicles.length > 0 ? 'Novo veículo' : 'Cadastrar veículo',
            icon: vehicles.length > 0 ? Plus : Car,
            imageUrl: null,
            onClick: () => navigate(`/painel-motorista?aba=veiculo&veiculo=${missing[0]}`),
            isActive: false,
        })
    }
    return tabs
}
