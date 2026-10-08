// hooks/usePersistedExpanded.ts
'use client'

import { useEffect, useState } from 'react'

// Lembra se a pessoa deixou um card do dashboard (perfil/loja) aberto ou
// fechado, pra não abrir tudo de novo a cada visita — alguns desses cards
// são grandes (Informações do Perfil, Descrição da
// loja) e não precisam ficar expandidos toda hora. É só preferência de
// interface por navegador, então localStorage já resolve — não precisa
// sincronizar entre dispositivos.
export function usePersistedExpanded(key: string, defaultValue: boolean): [boolean, (value: boolean) => void] {
    const storageKey = `iuser_dashboard_expanded_${key}`
    const [expanded, setExpandedState] = useState(defaultValue)

    useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey)
            if (stored !== null) setExpandedState(stored === 'true')
        } catch {
            // Sem localStorage disponível — mantém o padrão.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey])

    const setExpanded = (value: boolean) => {
        setExpandedState(value)
        try {
            localStorage.setItem(storageKey, String(value))
        } catch {
            // Ignora — não é crítico, só não lembra da próxima vez.
        }
    }

    return [expanded, setExpanded]
}
