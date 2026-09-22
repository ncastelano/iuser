// src/lib/benefits/useMyStatus.ts
//
// Status hierárquico da pessoa logada (usuario/lider/supervisor/gestor/
// administrador/...), usado por toda tela que monta a barra de abas do
// Header pra decidir COM QUE NOME mostrar a aba de rede/benefícios — o tipo
// de hierarquia concedido ("Gestor", "Supervisor" etc.) pra quem tem, ou
// "Minha Rede" pra quem não tem nenhuma permissão de concessão (a aba em si
// é mostrada pra qualquer usuário logado — todo mundo pode ver sua própria
// rede, só quem tem permissão também concede benefício).
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
    // nesse caso não faz sentido usar o nome dele como rótulo da aba, e como
    // ele só vê a própria rede (não concede nada), o rótulo vira "Minha Rede".
    const hierarchyLabel = canManageBenefits && status && status.slug !== 'usuario' ? status.name : 'Minha Rede'

    return { status, canManageBenefits, hierarchyLabel }
}
