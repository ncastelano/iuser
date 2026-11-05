// src/versions/v3/screens/AtividadeScreen.tsx
//
// A página da subaba AVISOS da Atividade (/atividade): a lista de notificações do perfil (a mesma do painel). As outras subabas (conversas,
// pedidos, carrinho, biblioteca) são as telas de sempre, em /conversas e /carrinho, e ganham a mesma fileira de subabas no topo.
'use client'

import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import ProfileNotification from '@/components/ProfileDashboard/ProfileNotification'
import AtividadeTabs from './AtividadeTabs'

export default function AtividadeScreen() {
    const { colors } = useTheme()
    const { userId, loading } = useProfile()
    return (
        <div className="relative pb-8">
            <AtividadeTabs aba="avisos" />
            <section className="mt-3">
                {userId ? (
                    <ProfileNotification userId={userId} />
                ) : !loading ? (
                    <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                        <p className="text-base font-black" style={{ color: colors.textPrimary }}>Entre na sua conta para ver os avisos</p>
                        <p className="text-xs max-w-xs" style={{ color: colors.textSecondary }}>Pedidos, entregas, mensagens e novidades da sua conta ficam aqui.</p>
                        <Link href="/login" className="text-xs font-black underline" style={{ color: colors.accent }}>Entrar</Link>
                    </div>
                ) : null}
            </section>
        </div>
    )
}
