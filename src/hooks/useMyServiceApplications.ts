// src/hooks/useMyServiceApplications.ts
//
// Os serviços em que a pessoa se inscreveu (service_applications onde ela é o
// profissional), já com os dados do pedido. Alimenta "Quais serviços me
// inscrevi" e marca "Quero fazer esse serviço" como já feito em "Quem procura
// serviço". Recarrega quando algum pedido muda e quando a aba volta ao foco
// (a inscrição costuma ser feita em /procurar-servico, noutra página).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getAvatarUrl } from '@/lib/avatar'
import { getServiceLabel } from '@/lib/serviceTypes'
import { SERVICE_REQUESTS_CHANGED } from '@/lib/serviceBoard'

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected'

export interface MyApplication {
    applicationId: string
    requestId: string
    status: ApplicationStatus
    appliedAt: string
    serviceType: string
    serviceLabel: string
    locationAddress: string
    description: string
    photoUrl: string | null
    requesterName: string | null
    requesterAvatarUrl: string | undefined
}

export function useMyServiceApplications() {
    const { userId, loading: profileLoading } = useProfile()
    const [items, setItems] = useState<MyApplication[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        if (!userId) {
            setItems([])
            setLoading(false)
            return
        }
        const { data: apps } = await supabase
            .from('service_applications')
            .select('id, service_request_id, status, created_at')
            .eq('applicant_id', userId)
            .order('created_at', { ascending: false })
            .limit(20)

        if (!apps || apps.length === 0) {
            setItems([])
            setLoading(false)
            return
        }

        const { data: requests } = await supabase
            .from('service_requests')
            .select('id, requester_id, service_type, custom_service, location_address, description, photo_urls')
            .in('id', apps.map((a) => a.service_request_id))
        const requestById = new Map((requests || []).map((r) => [r.id, r]))

        const requesterIds = Array.from(new Set((requests || []).map((r) => r.requester_id)))
        const { data: profiles } = requesterIds.length
            ? await supabase.from('profiles').select('id, name, avatar_url').in('id', requesterIds)
            : { data: [] as any[] }
        const profileById = new Map((profiles || []).map((p: any) => [p.id, p]))

        const result: MyApplication[] = []
        for (const a of apps) {
            const r = requestById.get(a.service_request_id)
            if (!r) continue // pedido apagado ou fechado: some da lista
            const p: any = profileById.get(r.requester_id)
            result.push({
                applicationId: a.id,
                requestId: r.id,
                status: a.status,
                appliedAt: a.created_at,
                serviceType: r.service_type,
                serviceLabel: getServiceLabel(r.service_type, r.custom_service),
                locationAddress: r.location_address,
                description: r.description || '',
                photoUrl: r.photo_urls?.[0] || null,
                requesterName: p?.name || null,
                requesterAvatarUrl: getAvatarUrl(supabase, p?.avatar_url),
            })
        }
        setItems(result)
        setLoading(false)
    }, [userId])

    useEffect(() => {
        if (profileLoading) return
        load()
        const onVisible = () => { if (document.visibilityState === 'visible') load() }
        window.addEventListener(SERVICE_REQUESTS_CHANGED, load)
        window.addEventListener('focus', load)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            window.removeEventListener(SERVICE_REQUESTS_CHANGED, load)
            window.removeEventListener('focus', load)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [profileLoading, load])

    return { items, loading, reload: load }
}
