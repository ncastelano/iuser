// src/modules/service-requests/mine.ts
//
// Os pedidos de serviço que a PESSOA fez (o lado de quem contrata): em que pé está cada um, quem se candidatou, quem
// foi escolhido e se ainda falta avaliar. Alimenta a tela "Contratar serviço".
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAvatarUrl } from '@/lib/avatar'
import { getRequestTitle, getServiceLabel } from '@/lib/serviceTypes'
import { stageOf, type RequestStage } from './domain'

export interface MyCandidate {
    applicationId: string
    applicantId: string
    status: 'pending' | 'accepted' | 'rejected'
    completedAt: string | null
    name: string | null
    slug: string | null
    avatarUrl: string | undefined
}

export interface MyRequest {
    id: string
    stage: RequestStage
    serviceType: string
    customIcon: string | null
    serviceLabel: string
    /** O que a pessoa escreveu (título do cartão) */
    title: string
    address: string
    createdAt: string
    viewCount: number
    photoUrl: string | null
    candidates: MyCandidate[]
    /** Concluído e ainda falta eu avaliar quem fez */
    needsReview: boolean
}

export async function loadMyRequests(client: SupabaseClient, userId: string): Promise<MyRequest[]> {
    const { data: requests } = await client
        .from('service_requests')
        .select('id, status, service_type, custom_service, custom_icon, description, location_address, created_at, view_count, photo_urls')
        .eq('requester_id', userId)
        .in('status', ['pending', 'accepted', 'completed'])
        .order('created_at', { ascending: false })
        .limit(100)
    if (!requests || requests.length === 0) return []

    const { data: apps } = await client
        .from('service_applications')
        .select('id, service_request_id, applicant_id, status, completed_at')
        .in('service_request_id', requests.map((r: any) => r.id))

    const applicantIds = Array.from(new Set((apps || []).map((a: any) => a.applicant_id)))
    const profileById = new Map<string, any>()
    if (applicantIds.length) {
        const { data: profiles } = await client.from('profiles').select('id, name, profileSlug, avatar_url').in('id', applicantIds)
        ;(profiles || []).forEach((p: any) => profileById.set(p.id, p))
    }

    const hiredIds = (apps || []).filter((a: any) => a.status === 'accepted').map((a: any) => a.id)
    const reviewed = new Set<string>()
    if (hiredIds.length) {
        const { data: mine } = await client.from('service_reviews').select('application_id').eq('reviewer_id', userId).in('application_id', hiredIds)
        ;(mine || []).forEach((r: any) => reviewed.add(r.application_id))
    }

    const out: MyRequest[] = []
    for (const r of requests as any[]) {
        const candidates: MyCandidate[] = (apps || [])
            .filter((a: any) => a.service_request_id === r.id)
            .map((a: any) => {
                const p = profileById.get(a.applicant_id)
                return {
                    applicationId: a.id, applicantId: a.applicant_id, status: a.status, completedAt: a.completed_at || null,
                    name: p?.name || null, slug: p?.profileSlug || null, avatarUrl: getAvatarUrl(client, p?.avatar_url),
                }
            })
        const stage = stageOf({ status: r.status, applications: candidates.map((c) => ({ status: c.status, completedAt: c.completedAt })) })
        if (!stage) continue
        out.push({
            id: r.id,
            stage,
            serviceType: r.service_type,
            customIcon: r.custom_icon || null,
            serviceLabel: getServiceLabel(r.service_type, r.custom_service),
            title: getRequestTitle(r.description, r.service_type, r.custom_service),
            address: r.location_address,
            createdAt: r.created_at,
            viewCount: r.view_count || 0,
            photoUrl: r.photo_urls?.[0] || null,
            candidates,
            needsReview: stage === 'concluido' && candidates.some((c) => c.status === 'accepted' && !reviewed.has(c.applicationId)),
        })
    }
    return out
}
