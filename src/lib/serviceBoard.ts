// src/lib/serviceBoard.ts
import { LucideIcon } from 'lucide-react'
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

export type BoardItem = { kind: 'service' } & ServiceRequestRow

export function itemKey(item: BoardItem): string {
    return `${item.kind}:${item.id}`
}

export function getItemIcon(item: BoardItem): LucideIcon {
    return getServiceIcon(item.service_type)
}

export function getItemLabel(item: BoardItem): string {
    return getServiceLabel(item.service_type, item.custom_service)
}

export function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 40 ? firstPart.substring(0, 38) + '...' : firstPart
}

export function getItemAddress(item: BoardItem): string {
    return shortAddress(item.location_address)
}

export function getItemDetail(item: BoardItem): string | null {
    return item.description || null
}

export function getItemSearchHaystack(item: BoardItem): string {
    const parts = [getItemLabel(item), item.description, item.location_address]
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

// ===== Busca os pedidos de serviço abertos =====
// Corridas não entram mais aqui — motoristas usam /aceitar-corridas.
export async function fetchOpenBoardItems(limit?: number): Promise<BoardItem[]> {
    const { data: serviceRequests } = await supabase
        .from('service_requests')
        .select('id, requester_id, service_type, custom_service, location_address, description, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

    const combined: BoardItem[] = (serviceRequests || []).map((row) => ({ kind: 'service' as const, ...row }))

    return limit ? combined.slice(0, limit) : combined
}
