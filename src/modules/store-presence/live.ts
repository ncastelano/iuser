'use client'
// Os ganchos do tempo real (ver domain.ts). O cliente AVISA onde está; o dono da loja OUVE. Sem nada de identidade.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { channelName, flatten, sanitizeState, type PresenceState, type Stage } from './domain'

const randomKey = () => Math.random().toString(36).slice(2, 12)

/** quem está numa tela da loja chama isto; `skip` = não avisa (ex.: a própria dona olhando) */
export function useReportStorePresence(storeId: string | null | undefined, stage: Stage, label?: string | null, skip = false) {
    const ch = useRef<ReturnType<typeof supabase.channel> | null>(null)
    const ready = useRef(false)
    const key = useRef(randomKey())
    useEffect(() => {
        if (!storeId || skip || typeof window === 'undefined') return
        ready.current = false
        const c = supabase.channel(channelName(storeId), { config: { presence: { key: key.current } } })
        ch.current = c
        c.subscribe((status) => {
            if (status !== 'SUBSCRIBED') return
            ready.current = true
            const st = sanitizeState({ stage, label: label ?? null, at: Date.now() })
            if (st) c.track(st)
        })
        return () => { ready.current = false; ch.current = null; supabase.removeChannel(c) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId, skip])
    useEffect(() => {
        if (!ready.current || !ch.current) return
        const st = sanitizeState({ stage, label: label ?? null, at: Date.now() })
        if (st) ch.current.track(st)
    }, [stage, label])
}

/** o painel da loja: a lista de quem está agora (uma linha por aparelho) e um feed do que acabou de acontecer */
export function useStorePresence(storeId: string | null | undefined, enabled = true) {
    const [rows, setRows] = useState<(PresenceState & { key: string })[] | null>(null)
    const [feed, setFeed] = useState<(PresenceState & { id: string; saiu?: boolean })[]>([])
    useEffect(() => {
        if (!storeId || !enabled) return
        const c = supabase.channel(channelName(storeId), { config: { presence: { key: `dona-${randomKey()}` } } })
        const sync = () => setRows(flatten(c.presenceState() as Record<string, unknown[]>))
        c.on('presence', { event: 'sync' }, sync)
            .on('presence', { event: 'join' }, ({ newPresences }) => {
                const novos = (newPresences || []).map(sanitizeState).filter(Boolean) as PresenceState[]
                if (novos.length) setFeed((f) => [...novos.map((n) => ({ ...n, id: randomKey() })), ...f].slice(0, 30))
            })
            .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                const foram = (leftPresences || []).map(sanitizeState).filter(Boolean) as PresenceState[]
                if (foram.length) setFeed((f) => [...foram.map((n) => ({ ...n, id: randomKey(), saiu: true, at: Date.now() })), ...f].slice(0, 30))
            })
            .subscribe((status) => { if (status === 'SUBSCRIBED') sync() })
        return () => { supabase.removeChannel(c) }
    }, [storeId, enabled])
    return { rows, feed }
}
