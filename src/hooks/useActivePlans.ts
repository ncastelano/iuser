// hooks/useActivePlans.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

// Não entra no ProfileContext de propósito: esse já faz 1 query em toda
// troca de sessão e é usado em página que não tem nada a ver com pagamento
// (juntar aumentaria a latência de todo mundo à toa). Chamado só nos pontos
// que realmente checam plano pago (motorista/prestador) e na tela de planos.
//
// "Loja" não entra aqui — continua gated pelo paywall já existente
// (store_access_grants / create_store_with_access), não por assinatura.
export function useActivePlans(userId: string | null) {
    const [loading, setLoading] = useState(true)
    const [hasDriver, setHasDriver] = useState(false)
    const [hasProvider, setHasProvider] = useState(false)

    const reload = useCallback(async () => {
        if (!userId) {
            setLoading(false)
            setHasDriver(false)
            setHasProvider(false)
            return
        }
        setLoading(true)
        const { data } = await supabase
            .from('subscriptions')
            .select('plans(grants_driver, grants_provider)')
            .eq('user_id', userId)
            .eq('status', 'active')

        let driver = false
        let provider = false
        for (const row of data || []) {
            const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans
            if (plan?.grants_driver) driver = true
            if (plan?.grants_provider) provider = true
        }
        setHasDriver(driver)
        setHasProvider(provider)
        setLoading(false)
    }, [userId])

    useEffect(() => {
        reload()
    }, [reload])

    return { loading, hasDriver, hasProvider, reload }
}
