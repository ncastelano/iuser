// hooks/useActivePlans.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

// Não entra no ProfileContext de propósito: esse já faz 1 query em toda
// troca de sessão e é usado em página que não tem nada a ver com pagamento
// (juntar aumentaria a latência de todo mundo à toa). Chamado só nos pontos
// que realmente checam plano pago (motorista/prestador/loja) e na tela de
// planos.
//
// "hasStore" aqui é diferente do paywall de CRIAR a loja
// (store_access_grants / create_store_with_access, que continua intocado) —
// é sobre MANTER a loja aberta pra vender depois de criada: sem assinatura
// ativa (Loja ou Combo), a loja existe mas fica fechada pra adicionar
// produto/aparecer pros compradores.
export function useActivePlans(userId: string | null) {
    const [loading, setLoading] = useState(true)
    const [hasDriver, setHasDriver] = useState(false)
    const [hasProvider, setHasProvider] = useState(false)
    const [hasStore, setHasStore] = useState(false)

    const reload = useCallback(async () => {
        if (!userId) {
            setLoading(false)
            setHasDriver(false)
            setHasProvider(false)
            setHasStore(false)
            return
        }
        setLoading(true)
        // RPC em vez de query direta: get_active_plan_grants já cuida do
        // bypass do admin geral e de só contar assinatura dentro da
        // validade (current_period_end > now()) — inclusive concessões
        // manuais do admin por tempo limitado, sem duplicar essa lógica aqui.
        const { data } = await supabase
            .rpc('get_active_plan_grants', { p_user_id: userId })
            .maybeSingle() as { data: { has_driver: boolean; has_provider: boolean; has_store: boolean } | null }

        setHasDriver(!!data?.has_driver)
        setHasProvider(!!data?.has_provider)
        setHasStore(!!data?.has_store)
        setLoading(false)
    }, [userId])

    useEffect(() => {
        reload()
    }, [reload])

    return { loading, hasDriver, hasProvider, hasStore, reload }
}
