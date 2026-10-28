// src/modules/deliveries/board.ts — o lado da LOJA: quem está levando os pedidos dela, o código de retirada e quantos saem por período (RPCs do dono, ver migration 20261130000003).
import { supabase } from '@/lib/supabase/client'

export interface BoardDriver {
    driver_id: string; name: string; slug: string | null; avatar: string | null; vehicle: string | null
    rides: number; units: number; items: number; capacity: number | null; capacity_units: number | null
    phase: 'accepted' | 'to_store' | 'at_store' | 'delivering'; ready: number
}
export interface StoreBoard {
    minutes: number; drivers: BoardDriver[]; out_in_period: number; delivered_in_period: number; waiting_for_driver: number; drivers_nearby: number
    hourly: { from: string; out: number }[]
}
export interface PickupCode {
    driver_id: string; driver_name: string; driver_slug: string | null; driver_avatar: string | null; vehicle: string | null; plate: string | null
    code: string; expires_at: string; rides: number; ready: number; units: number; items: number; locked: boolean
}

export async function fetchStoreBoard(storeId: string, minutes = 60): Promise<StoreBoard | null> {
    const { data, error } = await supabase.rpc('get_store_delivery_board', { p_store: storeId, p_minutes: minutes })
    if (error) return null
    return data as StoreBoard
}
export async function fetchPickupCodes(storeId: string): Promise<PickupCode[]> {
    const { data, error } = await supabase.rpc('get_store_pickup_codes', { p_store: storeId })
    if (error) return []
    return (data || []) as PickupCode[]
}
