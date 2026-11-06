// src/versions/v3/screens/AtividadeScreen.tsx
//
// A página ATIVIDADE (aba da barra da 3.0), UMA só: /atividade?aba=conversas|pedidos|carrinho|biblioteca|avisos. Em cima o controle de subabas; embaixo a tela de sempre de cada uma
// (a sala de conversas, os pedidos/carrinho/biblioteca do carrinho e a lista de avisos). Nas conversas, a caixa (pessoa ou uma loja) acompanha o MODO ativo.
'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import ProfileNotification from '@/components/ProfileDashboard/ProfileNotification'
import CarrinhoScreen from '@/versions/shared/screens/CarrinhoScreen'
import ConversasScreen from '@/versions/shared/screens/ConversasScreen'
import AtividadeTabs from './AtividadeTabs'
import { abaOfLocation, carrinhoTabOf } from '../atividade'
import { useBarStore } from '../bar/kind'

function Avisos() {
    const { colors } = useTheme()
    const { userId, loading } = useProfile()
    if (userId) return <ProfileNotification userId={userId} />
    if (loading) return null
    return (
        <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <p className="text-base font-black" style={{ color: colors.textPrimary }}>Entre na sua conta para ver os avisos</p>
            <p className="text-xs max-w-xs" style={{ color: colors.textSecondary }}>Pedidos, entregas, mensagens e novidades da sua conta ficam aqui.</p>
            <Link href="/login" className="text-xs font-black underline" style={{ color: colors.accent }}>Entrar</Link>
        </div>
    )
}

function Inner() {
    const sp = useSearchParams()
    const param = sp.get('aba')
    const aba = abaOfLocation('/atividade', param) || 'avisos'
    const store = useBarStore()
    const open = aba === 'conversas' && !!sp.get('c')   // conversa aberta: ela ocupa a tela, sem a fileira de cima
    return (
        <div className="relative pb-8">
            {!open && <AtividadeTabs aba={aba} />}
            <div className={open ? '' : 'mt-3'}>
                {aba === 'conversas' ? <ConversasScreen ui="v3" embedded basePath="/atividade" defaultRoom={store} />
                    : aba === 'avisos' ? <Avisos />
                    : <CarrinhoScreen ui="v3" hideTabs tab={carrinhoTabOf(aba, param)} />}
            </div>
        </div>
    )
}

export default function AtividadeScreen() {
    return <Suspense fallback={null}><Inner /></Suspense>
}
