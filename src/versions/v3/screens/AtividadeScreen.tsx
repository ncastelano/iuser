// src/versions/v3/screens/AtividadeScreen.tsx
//
// A página ATIVIDADE (aba da barra da 3.0), UMA só: /atividade?aba=pedidos|carrinho|biblioteca. Em cima o controle de subabas; embaixo a tela de sempre
// (os pedidos/carrinho/biblioteca do carrinho). As CONVERSAS saíram daqui (17/11/2026): são a aba Conversas da barra e a página /conversas; o endereço antigo
// ?aba=conversas leva para lá sem perder a sala nem a conversa aberta. As NOTIFICAÇÕES DO PERFIL moram no painel do perfil (?aba=avisos leva para lá).
'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CarrinhoScreen from '@/versions/shared/screens/CarrinhoScreen'
import ItensScreen from './ItensScreen'
import AtividadeTabs, { LAST_ABA_KEY } from './AtividadeTabs'
import { ATIVIDADE_ABAS, NOTIFICATIONS_PATH, abaOfLocation, carrinhoTabOf, conversasTarget, isLegacyAvisos, pathOfAba, type AtividadeAba } from '../atividade'

function Inner() {
    const router = useRouter()
    const sp = useSearchParams()
    const param = sp.get('aba')
    const aba = abaOfLocation('/atividade', param)
    const legacy = isLegacyAvisos(param)
    const toChat = conversasTarget('/atividade', sp.toString())
    // endereços antigos: as notificações levam ao painel do perfil e as conversas à página delas; sem `?aba=` abre a última subaba usada (ou Pedidos)
    useEffect(() => {
        if (legacy) { router.replace(NOTIFICATIONS_PATH); return }
        if (toChat) { router.replace(toChat); return }
        if (!aba) {
            let last: string | null = null
            try { last = localStorage.getItem(LAST_ABA_KEY) } catch { /* sem armazenamento */ }
            router.replace(pathOfAba(ATIVIDADE_ABAS.some((a) => a.key === last) ? (last as AtividadeAba) : 'itens'))
        }
    }, [legacy, toChat, aba, router])
    if (!aba) return null
    return (
        <div className="relative pb-8">
            <AtividadeTabs aba={aba} />
            <div className="mt-3">
                {aba === 'itens' ? <ItensScreen abaParam={param} /> : <CarrinhoScreen hideTabs tab={carrinhoTabOf(aba, param)} />}
            </div>
        </div>
    )
}

export default function AtividadeScreen() {
    return <Suspense fallback={null}><Inner /></Suspense>
}
