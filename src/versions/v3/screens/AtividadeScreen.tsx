// src/versions/v3/screens/AtividadeScreen.tsx
//
// A página ATIVIDADE (aba da barra da 3.0), UMA só: /atividade?aba=conversas|pedidos|carrinho|biblioteca. Em cima o controle de subabas; embaixo a tela de sempre de cada uma
// (a sala de conversas e os pedidos/carrinho/biblioteca do carrinho). Nas conversas, a caixa (pessoa ou uma loja) acompanha o MODO ativo.
// As NOTIFICAÇÕES DO PERFIL não moram mais aqui (o painel do perfil já as tem): o endereço antigo ?aba=avisos e o sininho da barra levam para lá.
'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CarrinhoScreen from '@/versions/shared/screens/CarrinhoScreen'
import ConversasScreen from '@/versions/shared/screens/ConversasScreen'
import AtividadeTabs, { LAST_ABA_KEY } from './AtividadeTabs'
import { ATIVIDADE_ABAS, NOTIFICATIONS_PATH, abaOfLocation, carrinhoTabOf, isLegacyAvisos, pathOfAba, type AtividadeAba } from '../atividade'
import { useBarStore } from '../bar/kind'

function Inner() {
    const router = useRouter()
    const sp = useSearchParams()
    const param = sp.get('aba')
    const aba = abaOfLocation('/atividade', param)
    const store = useBarStore()
    const legacy = isLegacyAvisos(param)
    // o endereço antigo das notificações leva ao painel do perfil; sem `?aba=` abre a última subaba usada (ou Conversas)
    useEffect(() => {
        if (legacy) { router.replace(NOTIFICATIONS_PATH); return }
        if (!aba) {
            let last: string | null = null
            try { last = localStorage.getItem(LAST_ABA_KEY) } catch { /* sem armazenamento */ }
            router.replace(pathOfAba(ATIVIDADE_ABAS.some((a) => a.key === last) ? (last as AtividadeAba) : 'conversas'))
        }
    }, [legacy, aba, router])
    const open = aba === 'conversas' && !!sp.get('c')   // conversa aberta: ela ocupa a tela, sem a fileira de cima
    if (!aba) return null
    return (
        <div className="relative pb-8">
            {!open && <AtividadeTabs aba={aba} />}
            <div className={open ? '' : 'mt-3'}>
                {aba === 'conversas' ? <ConversasScreen ui="v3" embedded basePath="/atividade" defaultRoom={store} />
                    : <CarrinhoScreen ui="v3" hideTabs tab={carrinhoTabOf(aba, param)} />}
            </div>
        </div>
    )
}

export default function AtividadeScreen() {
    return <Suspense fallback={null}><Inner /></Suspense>
}
