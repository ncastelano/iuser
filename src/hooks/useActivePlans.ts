// hooks/useActivePlans.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

// Não entra no ProfileContext de propósito: esse já faz 1 query em toda
// troca de sessão e é usado em página que não tem nada a ver com pagamento
// (juntar aumentaria a latência de todo mundo à toa). Chamado nos pontos
// que checam plano pago (motorista/prestador/loja/recrutador), na tela de
// planos, e em StoreAccessGate (que trava tanto criar quanto manter a loja
// aberta pra vender atrás do mesmo hasStore).
export function useActivePlans(userId: string | null) {
    const [loading, setLoading] = useState(true)
    const [hasDriver, setHasDriver] = useState(false)
    const [hasProvider, setHasProvider] = useState(false)
    const [hasStore, setHasStore] = useState(false)
    const [hasRecruiter, setHasRecruiter] = useState(false)

    const reload = useCallback(async () => {
        if (!userId) {
            setLoading(false)
            setHasDriver(false)
            setHasProvider(false)
            setHasStore(false)
            setHasRecruiter(false)
            return
        }
        setLoading(true)
        // RPC em vez de query direta: get_active_plan_grants já cuida do
        // bypass do admin geral e de só contar assinatura dentro da
        // validade (current_period_end > now()) — inclusive concessões
        // manuais do admin por tempo limitado, sem duplicar essa lógica aqui.
        const { data } = await supabase
            .rpc('get_active_plan_grants', { p_user_id: userId })
            .maybeSingle() as { data: { has_driver: boolean; has_provider: boolean; has_store: boolean; has_recruiter: boolean } | null }

        setHasDriver(!!data?.has_driver)
        setHasProvider(!!data?.has_provider)
        setHasStore(!!data?.has_store)
        setHasRecruiter(!!data?.has_recruiter)
        setLoading(false)
    }, [userId])

    useEffect(() => {
        reload()
    }, [reload])

    return { loading, hasDriver, hasProvider, hasStore, hasRecruiter, reload }
}
