// app/(main)/administrador/page.tsx
//
// Página do Administrador: tudo que antes ficava na aba "Admin" de "Convidei
// para o iUser" (atividade, pagamentos, financeiro, planos, tarifas, hierarquia,
// WhatsApp bot, saques). Só o administrador geral vê o conteúdo — o
// AdminDashboard confirma no servidor (/api/admin/whoami) e mostra "Sem
// permissão" pra qualquer outra pessoa.
'use client'

import { useRouter } from 'next/navigation'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import AdminDashboard from '@/components/AdminDashboard/AdminDashboard'

export default function AdministradorPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading } = useProfile()

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Administrador"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${loading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={loading}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-3xl mx-auto">
                    {loading ? null : <AdminDashboard />}
                </section>
            </main>
        </div>
    )
}
