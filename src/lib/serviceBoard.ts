// src/lib/serviceBoard.ts
import { LucideIcon, Car } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'

export interface ServiceRequestRow {
    id: string
    requester_id: string
    service_type: string
    custom_service: string | null
    location_address: string
    description: string
    created_at: string
}

export interface RideRequestRow {
    id: string
    requester_id: string
    ride_type: 'pessoa' | 'objeto'
    origin_address: string
    destination_address: string
    passenger_count: number
    notes: string | null
    object_description: string | null
    created_at: string
}

export type BoardItem =
    | ({ kind: 'service' } & ServiceRequestRow)
    | ({ kind: 'ride' } & RideRequestRow)

export function itemKey(item: BoardItem): string {
    return `${item.kind}:${item.id}`
}

export function getItemIcon(item: BoardItem): LucideIcon {
    return item.kind === 'ride' ? Car : getServiceIcon(item.service_type)
}

export function getItemLabel(item: BoardItem): string {
    if (item.kind === 'ride') {
        return item.ride_type === 'objeto' ? 'Motorista · Entrega de objeto' : 'Motorista particular'
    }
    return getServiceLabel(item.service_type, item.custom_service)
}

export function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 40 ? firstPart.substring(0, 38) + '...' : firstPart
}

export function getItemAddress(item: BoardItem): string {
    if (item.kind === 'ride') {
        return `${shortAddress(item.origin_address)} → ${shortAddress(item.destination_address)}`
    }
    return shortAddress(item.location_address)
}

export function getItemDetail(item: BoardItem): string | null {
    if (item.kind === 'ride') {
        if (item.ride_type === 'objeto') return item.object_description || item.notes
        if (item.notes) return item.notes
        return item.passenger_count > 1 ? `${item.passenger_count} passageiros` : null
    }
    return item.description || null
}

export function getItemSearchHaystack(item: BoardItem): string {
    const parts =
        item.kind === 'ride'
            ? [getItemLabel(item), item.origin_address, item.destination_address, item.notes, item.object_description]
            : [getItemLabel(item), item.description, item.location_address]
    return parts.filter(Boolean).join(' ').toLowerCase()
}

export function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes} min atrás`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h atrás`
    const days = Math.floor(hours / 24)
    return `${days}d atrás`
}

// ===== Busca os pedidos abertos (serviço + motorista), mesclados por data =====
export async function fetchOpenBoardItems(limit?: number): Promise<BoardItem[]> {
    const [{ data: serviceRequests }, { data: rideRequests }] = await Promise.all([
        supabase
            .from('service_requests')
            .select('id, requester_id, service_type, custom_service, location_address, description, created_at')
            .eq('status', 'pending'),
        supabase
            .from('ride_requests')
            .select('id, requester_id, ride_type, origin_address, destination_address, passenger_count, notes, object_description, created_at')
            .eq('status', 'pending'),
    ])

    const combined: BoardItem[] = [
        ...(serviceRequests || []).map((row) => ({ kind: 'service' as const, ...row })),
        ...(rideRequests || []).map((row) => ({ kind: 'ride' as const, ...row })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    return limit ? combined.slice(0, limit) : combined
}
