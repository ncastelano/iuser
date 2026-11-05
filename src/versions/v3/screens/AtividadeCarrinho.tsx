// src/versions/v3/screens/AtividadeCarrinho.tsx
//
// /carrinho na 3.0: as subabas da Atividade em cima e, embaixo, a tela do carrinho de sempre (sem a fileira de abas dela, que agora é a de cima).
// A subaba vem do ?aba= (pedidos, avaliacoes e digital abrem direto); o endereço /carrinho continua sendo o mesmo.
'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CarrinhoScreen from '@/versions/shared/screens/CarrinhoScreen'
import AtividadeTabs from './AtividadeTabs'
import { abaOfLocation, carrinhoTabOf } from '../atividade'

function Inner() {
    const sp = useSearchParams()
    const param = sp.get('aba')
    const aba = abaOfLocation('/carrinho', param) || 'carrinho'
    return (
        <>
            <AtividadeTabs aba={aba} />
            <CarrinhoScreen ui="v3" hideTabs tab={carrinhoTabOf(aba, param)} />
        </>
    )
}

export default function AtividadeCarrinho() {
    return <Suspense fallback={null}><Inner /></Suspense>
}
