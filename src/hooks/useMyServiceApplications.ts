// src/hooks/useMyServiceApplications.ts
//
// Os serviços em que a pessoa se inscreveu (service_applications onde ela é o
// profissional), já com os dados do pedido. Alimenta "Quais serviços me
// inscrevi" e marca "Quero fazer esse serviço" como já feito em "Quem procura
// serviço". Recarrega quando algum pedido muda e quando a aba volta ao foco
// (a inscrição costuma ser feita em /procurar-servico, noutra página).
//
// O estado é compartilhado (um store no módulo): vários componentes da home usam
// este hook ao mesmo tempo e, mesmo assim, só uma busca roda por vez — sem isso
// cada card repetia as mesmas 3 consultas ao Supabase.
'use client'

import { useEffect, useSyncExternalStore } from 'react'
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

interface Snapshot {
    userId: string | null | undefined // undefined = ainda não buscou pra ninguém
    items: MyApplication[]
    loading: boolean
}

// Não rebusca no mount se os dados são mais novos que isso (outro card acabou de buscar).
const FRESH_MS = 3000

let snapshot: Snapshot = { userId: undefined, items: [], loading: true }
let fetchedAt = 0
let inflight: Promise<void> | null = null
let inflightUser: string | null = null
const listeners = new Set<() => void>()

function emit(next: Snapshot) {
    snapshot = next
    listeners.forEach((l) => l())
}

async function fetchApplications(userId: string): Promise<MyApplication[]> {
        const { data: apps } = await supabase
            .from('service_applications')
            .select('id, service_request_id, status, created_at')
            .eq('applicant_id', userId)
            .order('created_at', { ascending: false })
            .limit(20)

        if (!apps || apps.length === 0) return []

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
    return result
}

function refresh(userId: string | null): Promise<void> {
    if (!userId) {
        emit({ userId: null, items: [], loading: false })
        return Promise.resolve()
    }
    // Já tem uma busca desse usuário em andamento: todo mundo espera a mesma.
    if (inflight && inflightUser === userId) return inflight
    inflightUser = userId
    const run = fetchApplications(userId)
        .then((items) => {
            if (inflightUser === userId) emit({ userId, items, loading: false })
            fetchedAt = Date.now()
        })
        .catch(() => {
            if (inflightUser === userId) emit({ userId, items: snapshot.userId === userId ? snapshot.items : [], loading: false })
        })
        .finally(() => { if (inflight === run) inflight = null })
    inflight = run
    return run
}

// Gatilhos de recarga: ligados só enquanto houver alguém usando o hook.
let activeUserId: string | null = null
const onTrigger = () => { refresh(activeUserId) }
const onVisible = () => { if (document.visibilityState === 'visible') refresh(activeUserId) }

function subscribe(listener: () => void) {
    if (listeners.size === 0) {
        window.addEventListener(SERVICE_REQUESTS_CHANGED, onTrigger)
        window.addEventListener('focus', onTrigger)
        document.addEventListener('visibilitychange', onVisible)
    }
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
            window.removeEventListener(SERVICE_REQUESTS_CHANGED, onTrigger)
            window.removeEventListener('focus', onTrigger)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }
}

const getSnapshot = () => snapshot
const SERVER_SNAPSHOT: Snapshot = { userId: undefined, items: [], loading: true }

export function useMyServiceApplications() {
    const { userId, loading: profileLoading } = useProfile()
    const state = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT)

    useEffect(() => {
        if (profileLoading) return
        activeUserId = userId ?? null
        const sameUser = snapshot.userId === activeUserId
        if (!sameUser) {
            // Trocou de conta (ou primeira vez): limpa o que era de outra pessoa.
            emit({ userId: activeUserId, items: [], loading: !!activeUserId })
            refresh(activeUserId)
        } else if (Date.now() - fetchedAt > FRESH_MS) {
            refresh(activeUserId)
        }
    }, [profileLoading, userId])

    // loading continua true enquanto o perfil carrega ou o store é de outro usuário
    const loading = profileLoading || state.loading || state.userId !== (userId ?? null)
    return { items: state.userId === (userId ?? null) ? state.items : [], loading, reload: () => refresh(userId ?? null) }
}
