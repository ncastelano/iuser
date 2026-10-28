// src/components/SystemEventsListener.tsx
//
// Liga o sistema à ILHA: escuta as notificações novas da pessoa (profile_notifications, escritas por gatilhos do banco quando um pedido ou uma entrega muda de etapa) e mostra cada
// uma na hora — na ilha da 3.0 (que vira o mensageiro por um momento, com um botão que leva ao assunto) ou, sem ilha, na pílula do topo. Serve a cliente, loja e motorista: o banco
// decide QUEM recebe cada evento; aqui só se apresenta (`lib/islandEvents` traduz o tipo em texto, cor e destino).
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { islandEventFor } from '@/lib/islandEvents'

export function SystemEventsListener() {
    const { userId } = useProfile()
    const router = useRouter()
    const routerRef = useRef(router)
    routerRef.current = router
    const seen = useRef<Set<string>>(new Set())

    useEffect(() => {
        if (!userId) return
        const ch = supabase
            .channel(`island-events-${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profile_notifications', filter: `profile_id=eq.${userId}` }, (payload: any) => {
                const n = payload.new as { id: string; kind: string; meta: Record<string, any> | null; created_at?: string }
                if (!n || seen.current.has(n.id)) return
                seen.current.add(n.id)
                if (seen.current.size > 200) seen.current = new Set(Array.from(seen.current).slice(-100))
                const ev = islandEventFor(n)
                if (!ev) return
                const opts = { description: ev.title && ev.title !== ev.text ? ev.title : undefined, icon: ev.icon, duration: ev.duration, ...(ev.path ? { action: { label: ev.actionLabel, onClick: () => routerRef.current.push(ev.path as string) } } : {}) }
                if (ev.level === 'success') toast.success(ev.text, opts)
                else if (ev.level === 'error') toast.error(ev.text, opts)
                else if (ev.level === 'info') toast.info(ev.text, opts)
                else toast(ev.text, opts)
            })
            .subscribe()
        return () => { supabase.removeChannel(ch) }
    }, [userId])

    return null
}
