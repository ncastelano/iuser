// src/versions/v3/screens/AtividadeConversas.tsx
//
// /conversas na 3.0: as subabas da Atividade em cima e, embaixo, a sala de conversas de sempre. Com uma conversa aberta (?c=) a fileira some
// (a conversa ocupa a tela, como antes).
'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ConversasScreen from '@/versions/shared/screens/ConversasScreen'
import AtividadeTabs from './AtividadeTabs'

function Inner() {
    const sp = useSearchParams()
    const open = !!sp.get('c')
    return (
        <>
            {!open && <AtividadeTabs aba="conversas" />}
            <ConversasScreen ui="v3" embedded />
        </>
    )
}

export default function AtividadeConversas() {
    return <Suspense fallback={null}><Inner /></Suspense>
}
