// src/lib/serviceBoard.ts
import { LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'
import { getAvatarUrl } from '@/lib/avatar'

export interface ServiceRequestRow {
    id: string
    requester_id: string
    service_type: string
    custom_service: string | null
    location_address: string
    location_needs_access: boolean
    location_access_notes: string | null
    description: string
    photo_urls: string[]
    created_at: string
    view_count: number
}

export interface BoardRequester {
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

export type BoardItem = { kind: 'service'; requester: BoardRequester | null } & ServiceRequestRow

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
// Total de pedidos em aberto (o quadro da home só carrega os primeiros).
export async function fetchOpenRequestCount(): Promise<number> {
    const { count } = await supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
    return count || 0
}

export async function fetchOpenBoardItems(limit?: number): Promise<BoardItem[]> {
    let query = supabase
        .from('service_requests')
        .select('id, requester_id, service_type, custom_service, location_address, location_needs_access, location_access_notes, description, photo_urls, created_at, view_count')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    if (limit) query = query.limit(limit)
    const { data: serviceRequests } = await query

    const rows = serviceRequests || []

    // Quem está pedindo — nome, link e avatar, pra aparecer no card em vez
    // de só o tipo de serviço (o candidato precisa saber com quem vai falar).
    const requesterIds = Array.from(new Set(rows.map((r) => r.requester_id)))
    let requestersById = new Map<string, BoardRequester>()
    if (requesterIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, profileSlug, avatar_url')
            .in('id', requesterIds)
        requestersById = new Map((profiles || []).map((p) => [
            p.id,
            { name: p.name, profileSlug: p.profileSlug, avatarUrl: getAvatarUrl(supabase, p.avatar_url) },
        ]))
    }

    const combined: BoardItem[] = rows.map((row) => ({
        kind: 'service' as const,
        ...row,
        requester: requestersById.get(row.requester_id) || null,
    }))

    return limit ? combined.slice(0, limit) : combined
}

// "pediu há 9 dias" — usado nos cards de pedido (home e diálogo de detalhes).
export function askedAgo(iso: string): string {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutes < 1) return 'pediu agora'
    if (minutes < 60) return `pediu há ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `pediu há ${hours}h`
    const days = Math.floor(hours / 24)
    return `pediu há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

// Os cards "Seus pedidos em aberto" e "Quem procura serviço" mostram os mesmos
// pedidos; quando um muda (editar, aceitar candidato, excluir), avisa o outro.
export const SERVICE_REQUESTS_CHANGED = 'iuser:service-requests-changed'
export function notifyServiceRequestsChanged() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SERVICE_REQUESTS_CHANGED))
}
