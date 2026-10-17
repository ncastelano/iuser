// src/lib/useCheckoutFlow.ts
//
// Pergunta ao SERVIDOR qual caminho de checkout usar em cada loja ('v1' | 'v2'). É só para escolher a tela: quem decide a versão
// do pedido (e valida tudo) é create_store_order. Qualquer falha cai em 'v1' (comportamento atual). Usado pelos três caminhos de
// pedido: página de produto (useStoreCheckout), catálogo e carrinho.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type CheckoutFlow = 'v1' | 'v2'

export function useCheckoutFlows(storeIds: Array<string | null | undefined>, userId: string | null): Record<string, CheckoutFlow> {
    const key = useMemo(() => Array.from(new Set(storeIds.filter((s): s is string => !!s))).sort().join(','), [storeIds])
    const [flows, setFlows] = useState<Record<string, CheckoutFlow>>({})

    useEffect(() => {
        if (!userId || !key) { setFlows({}); return }
        let active = true
        const ids = key.split(',')
        Promise.all(ids.map(async (id) => {
            const { data, error } = await supabase.rpc('get_checkout_flow', { p_store: id })
            return [id, !error && data === 'v2' ? 'v2' : 'v1'] as const
        })).then((entries) => { if (active) setFlows(Object.fromEntries(entries)) }).catch(() => { if (active) setFlows({}) })
        return () => { active = false }
    }, [key, userId])

    return flows
}

export function useCheckoutFlow(storeId: string | null | undefined, userId: string | null): CheckoutFlow {
    const ids = useMemo(() => [storeId], [storeId])
    const flows = useCheckoutFlows(ids, userId)
    return (storeId && flows[storeId]) || 'v1'
}
