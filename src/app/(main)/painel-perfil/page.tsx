// app/(main)/painel-perfil/page.tsx
//
// Painel do perfil (modo "Meu perfil"): tudo o que o ProfileDashboard mostra — informações, notificações, comentários,
// agenda, publicações, indicações, visitantes, configurações —, agora dentro da casca de modos (topo + menu lateral) e
// com um cabeçalho no desenho do /modeloinicial. "Ver perfil" leva ao perfil público (/<profileSlug>).
'use client'

import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import ModeShell from '@/components/ModeShell'
import { Spinner } from '@/components/Spinner'
import ProfileDashboard from '@/components/ProfileDashboard/ProfileDashboard'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function PainelPerfilPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, profileSlug, avatarUrl, loading } = useProfile()

    return (
        <ModeShell>
            {loading ? (
                <div className="flex justify-center py-16"><Spinner size={28} color={colors.accent} /></div>
            ) : !userId ? (
                <div className="mt-6 rounded-3xl border p-6 text-center" style={{ background: colors.surface, borderColor: colors.border }}>
                    <p className="text-sm font-bold mb-3" style={{ color: colors.textPrimary }}>Entre na sua conta para ver o painel do seu perfil.</p>
                    <button onClick={() => router.push('/login')} className="px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Entrar</button>
                </div>
            ) : (
                <>
                    {/* Cabeçalho do painel: quem sou eu + "Ver perfil" */}
                    <section className="mt-6 rounded-3xl border p-4 flex items-center gap-3" style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}>
                        <span className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-white text-xl font-black" style={{ background: GRADIENT }}>
                            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (profileSlug || '?').charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs" style={{ color: colors.textSecondary }}>Painel do perfil</p>
                            <h1 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>@{profileSlug}</h1>
                        </div>
                        <button
                            onClick={() => router.push(`/${profileSlug}`)}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-black text-white flex-shrink-0 transition hover:scale-105 active:scale-95"
                            style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                        >
                            <ExternalLink size={15} /> Ver perfil
                        </button>
                    </section>

                    {/* Tudo do painel do perfil (informações, notificações, comentários, agenda, publicações, indicações,
                        visitantes e configurações). O -mx cancela o recuo duplicado do painel dentro da casca. */}
                    <div className="-mx-4 mt-2">
                        <ProfileDashboard profileSlug={profileSlug} avatarUrl={avatarUrl} />
                    </div>
                </>
            )}
        </ModeShell>
    )
}
