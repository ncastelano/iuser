// src/hooks/usePopularCustomServices.ts
//
// Tipos "Outro" que mais gente pediu (mais de 2 pessoas diferentes, pedidos em aberto): entram na lista de
// tipos de profissional junto com os fixos. O ícone mostrado é o mais escolhido pra aquele nome.
// A conta é por PESSOA (não por pedido) pra uma única pessoa não conseguir "promover" um tipo repetindo.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { SERVICE_TYPES } from '@/lib/serviceTypes'

export interface PopularCustomService {
    label: string
    count: number
    icon: string | null
}

export function usePopularCustomServices(): PopularCustomService[] {
    const [popular, setPopular] = useState<PopularCustomService[]>([])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const { data } = await supabase
                .from('service_requests')
                .select('custom_service, custom_icon, requester_id')
                .eq('service_type', 'outro')
                .eq('status', 'pending')
                .not('custom_service', 'is', null)
            if (cancelled || !data) return

            const fixed = new Set(SERVICE_TYPES.map((t) => t.label.toLowerCase()))
            const groups = new Map<string, { requesters: Set<string>; labels: Map<string, number>; icons: Map<string, number> }>()
            for (const row of data as { custom_service: string | null; custom_icon: string | null; requester_id: string }[]) {
                const raw = (row.custom_service || '').trim()
                if (!raw || fixed.has(raw.toLowerCase())) continue
                const key = raw.toLowerCase()
                if (!groups.has(key)) groups.set(key, { requesters: new Set(), labels: new Map(), icons: new Map() })
                const g = groups.get(key)!
                g.requesters.add(row.requester_id)
                g.labels.set(raw, (g.labels.get(raw) || 0) + 1)
                if (row.custom_icon) g.icons.set(row.custom_icon, (g.icons.get(row.custom_icon) || 0) + 1)
            }
            const top = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
            const list = Array.from(groups.values())
                .filter((g) => g.requesters.size > 2)
                .map((g) => ({ label: top(g.labels) as string, count: g.requesters.size, icon: top(g.icons) }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 12)
            setPopular(list)
        })()
        return () => { cancelled = true }
    }, [])

    return popular
}
