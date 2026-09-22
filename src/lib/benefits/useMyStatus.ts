// src/lib/benefits/useMyStatus.ts
//
// Status hierárquico da pessoa logada (usuario/lider/supervisor/gestor/
// administrador/...), usado por toda tela que monta a barra de abas do
// Header pra decidir se mostra "Gestão de Benefícios" — e com QUE nome
// (o tipo de hierarquia concedido: "Gestor", "Supervisor" etc.), em vez de
// um rótulo genérico igual pra todo mundo.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { hasAnyGrantPermission, type MyStatus } from '@/lib/benefits/types'

export function useMyStatus(userId: string | null | undefined) {
    const [status, setStatus] = useState<MyStatus | null>(null)

    useEffect(() => {
        if (!userId) {
            setStatus(null)
            return
        }
        let cancelled = false
        supabase.rpc('get_my_status').then(({ data }) => {
            if (!cancelled) setStatus((data as MyStatus) || null)
        })
        return () => { cancelled = true }
    }, [userId])

    const canManageBenefits = hasAnyGrantPermission(status)
    // "usuario" é o status padrão de quem não recebeu nenhuma hierarquia —
    // nesse caso não faz sentido usar o nome dele como rótulo da aba.
    const hierarchyLabel = canManageBenefits && status && status.slug !== 'usuario' ? status.name : 'Gestão de Benefícios'

    return { status, canManageBenefits, hierarchyLabel }
}
