'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from 'sonner'

interface AcceptedRide {
    id: string
    requesterName: string
}

// Global, montado em providers.tsx: assim que o passageiro aceita a
// proposta do motorista, em QUALQUER página do app (não só
// /aceitar-corridas), leva ele direto pra /aceitar-corridas/mapa — é lá
// que mora o botão "Ir para o ponto de partida" e o resto do fluxo da
// corrida. sessionStorage garante que isso dispara só uma vez por
// corrida (senão ficaria brigando com "Abrir chat" ao voltar pra
// /aceitar-corridas, que faz essa página recarregar).
export function RideAcceptedDialog() {
    const router = useRouter()
    const { userId: contextUserId } = useProfile()
    const [pending, setPending] = useState<AcceptedRide[]>([])

    const userIdRef = useRef<string | null>(null)
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const checkAccepted = useCallback(async () => {
        const userId = userIdRef.current
        if (!userId) return

        const { data: rides } = await supabase
            .from('ride_requests')
            .select('id, requester_id')
            .eq('driver_id', userId)
            .eq('status', 'accepted')
            .eq('driver_en_route', false)

        if (!rides || rides.length === 0) {
            setPending([])
            return
        }

        const requesterIds = Array.from(new Set(rides.map((r) => r.requester_id)))
        const { data: profiles } = await supabase.from('profiles').select('id, name, profileSlug').in('id', requesterIds)
        const profilesById = new Map((profiles || []).map((p) => [p.id, p]))

        setPending(
            rides.map((r) => {
                const p = profilesById.get(r.requester_id)
                return { id: r.id, requesterName: p?.name || (p?.profileSlug ? `@${p.profileSlug}` : 'Passageiro') }
            })
        )
    }, [])

    const cleanup = useCallback(() => {
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
            channelRef.current = null
        }
        if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
    }, [])

    const connectChannel = useCallback((userId: string) => {
        if (channelRef.current) supabase.removeChannel(channelRef.current)
        const channel = supabase.channel(`ride-accepted-${userId}-${Date.now()}`)
        channel
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${userId}` },
                () => checkAccepted()
            )
            .subscribe()
        channelRef.current = channel
    }, [checkAccepted])

    useEffect(() => {
        if (!contextUserId) {
            userIdRef.current = null
            setPending([])
            cleanup()
            return
        }

        userIdRef.current = contextUserId
        connectChannel(contextUserId)
        checkAccepted()
        pollRef.current = setInterval(checkAccepted, 8000)

        return () => cleanup()
    }, [contextUserId, connectChannel, checkAccepted, cleanup])

    // Redireciona assim que acha uma corrida aceita ainda não avisada.
    useEffect(() => {
        const current = pending[0]
        if (!current) return

        const navKey = `ride_nav_shown_${current.id}`
        try {
            if (sessionStorage.getItem(navKey)) return
            sessionStorage.setItem(navKey, '1')
        } catch {
            // sem sessionStorage: segue e redireciona mesmo assim
        }

        toast.success(`${current.requesterName} aceitou sua proposta! Indo pra navegação...`)
        router.push('/aceitar-corridas/mapa')
    }, [pending, router])

    return null
}
