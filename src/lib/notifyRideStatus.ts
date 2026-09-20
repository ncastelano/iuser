// src/lib/notifyRideStatus.ts
import { supabase } from '@/lib/supabase/client'

// Best-effort: avisa a outra ponta da corrida via push quando o motorista sai
// pra buscar, conclui, ou quando alguém cancela — não bloqueia o fluxo se
// falhar (usuário sem push habilitado, offline, etc).
export function notifyRideStatus(rideRequestId: string, status: 'en_route' | 'arrived' | 'started' | 'completed' | 'cancelled') {
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return
        fetch('/api/push/send-ride-status-update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ rideRequestId, status }),
        }).catch(() => { /* silencioso */ })
    })
}

// Best-effort: avisa os motoristas com o modo ligado que tem corrida nova.
export function notifyNewRide(rideRequestId: string) {
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return
        fetch('/api/rides/notify-drivers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ rideRequestId }),
        }).catch(() => { /* silencioso */ })
    })
}
