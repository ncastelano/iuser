// app/(main)/painel-perfil/page.tsx
//
// Painel do perfil (modo "Meu perfil"): tudo o que o ProfileDashboard mostra — informações, notificações, comentários,
// agenda, publicações, indicações, visitantes, configurações —, agora dentro da casca de modos (topo + menu lateral) e
// com um cabeçalho no desenho da home da 3.0. "Ver perfil" leva ao perfil público (/<profileSlug>).
// O administrador geral ganha uma segunda aba, "Administrador": tudo o que a aba Administrador do Header tinha
// (atividade, pagamentos, financeiro, planos, tarifas, graduação, "Interface 3.0" — onde libera a 3.0 por perfil...).
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, User } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import ProfileDashboard from '@/components/ProfileDashboard/ProfileDashboard'
import AdminDashboard from '@/components/AdminDashboard/AdminDashboard'
import PageTabs, { type Tab } from '@/components/PageTabs'
import { useIsSuperAdmin } from '@/lib/adminHeaderTab'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function PainelPerfilPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, profileSlug, avatarUrl, loading } = useProfile()
    const isSuperAdmin = useIsSuperAdmin(userId)
    const [tab, setTab] = useState<'perfil' | 'admin'>('perfil')

    // ?aba=admin abre direto na aba do administrador (e deixa a aba na URL, pra recarregar no mesmo lugar)
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('aba') === 'admin') setTab('admin')
    }, [])
    const pickTab = (next: 'perfil' | 'admin') => {
        setTab(next)
        const url = new URL(window.location.href)
        if (next === 'admin') url.searchParams.set('aba', 'admin')
        else url.searchParams.delete('aba')
        window.history.replaceState(null, '', url.toString())
    }
    const showAdmin = isSuperAdmin && tab === 'admin'

    const tabs: Tab[] = [
        { id: 'perfil', label: 'Informações do perfil', icon: User, onClick: () => pickTab('perfil'), isActive: !showAdmin },
        ...(isSuperAdmin ? [{ id: 'admin', label: 'Administrador', icon: Shield, onClick: () => pickTab('admin'), isActive: showAdmin } as Tab] : []),
    ]

    return (
        <>
            {loading ? (
                <div className="flex justify-center py-16"><Spinner size={28} color={colors.accent} /></div>
            ) : !userId ? (
                <div className="mt-6 rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                    <p className="text-sm font-bold mb-3" style={{ color: colors.textPrimary }}>Entre na sua conta para ver o painel do seu perfil.</p>
                    <button onClick={() => router.push('/login')} className="px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Entrar</button>
                </div>
            ) : (
                <>
                    {/* Só o administrador geral tem a segunda aba */}
                    {isSuperAdmin && <div className="mb-3"><PageTabs tabs={tabs} /></div>}

                    {showAdmin ? (
                        <AdminDashboard />
                    ) : (
                        /* Tudo do painel do perfil (informações, notificações, comentários, agenda, publicações, indicações,
                           visitantes e configurações). O -mx cancela o recuo duplicado do painel dentro da casca. */
                        <div className="-mx-4">
                            <ProfileDashboard profileSlug={profileSlug} avatarUrl={avatarUrl} hideVersionSwitch />
                        </div>
                    )}
                </>
            )}
        </>
    )
}
