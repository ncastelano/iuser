// app/(main)/painel-perfil/page.tsx
//
// Painel do perfil (modo "Meu perfil"): tudo o que o ProfileDashboard mostra — informações, notificações, comentários,
// agenda, publicações, indicações, visitantes, configurações —, agora dentro da casca de modos (topo + menu lateral) e
// com um cabeçalho no desenho do /modeloinicial. "Ver perfil" leva ao perfil público (/<profileSlug>).
'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import ProfileDashboard from '@/components/ProfileDashboard/ProfileDashboard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function PainelPerfilPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, profileSlug, avatarUrl, loading } = useProfile()

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
                    {/* Tudo do painel do perfil (informações, notificações, comentários, agenda, publicações, indicações,
                        visitantes e configurações). O -mx cancela o recuo duplicado do painel dentro da casca. */}
                    <div className="-mx-4">
                        <ProfileDashboard profileSlug={profileSlug} avatarUrl={avatarUrl} hideVersionSwitch />
                    </div>
                </>
            )}
        </>
    )
}
