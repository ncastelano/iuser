// app/(main)/painel-prestador/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '../LoginAndRegister'
import { toast } from 'sonner'
import { Briefcase } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function PainelPrestadorContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const nextUrl = searchParams.get('next')
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [serviceModeActive, setServiceModeActive] = useState(false)
    const [togglingMode, setTogglingMode] = useState(false)

    const load = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            setLoading(false)
            return
        }
        setShowLogin(false)

        const { data } = await supabase
            .from('profiles')
            .select('service_mode_active')
            .eq('id', user.id)
            .maybeSingle()

        setServiceModeActive(!!data?.service_mode_active)
        setLoading(false)
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleLoginSuccess = () => {
        setShowLogin(false)
        load()
    }

    const handleToggleServiceMode = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setShowLogin(true)
            return
        }

        setTogglingMode(true)
        const next = !serviceModeActive
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ service_mode_active: next })
                .eq('id', user.id)
            if (error) throw error

            setServiceModeActive(next)
            toast.success(next ? 'Modo prestador ativado!' : 'Modo prestador desativado.')
            if (next && nextUrl) {
                router.push(nextUrl)
            }
        } catch (err: any) {
            toast.error('Erro ao atualizar modo prestador: ' + (err.message || 'tente novamente'))
        } finally {
            setTogglingMode(false)
        }
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Painel do Prestador"
                    showBack={true}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <Spinner size={24} color={colors.textSecondary} />
                        </div>
                    )}

                    {!loading && showLogin && (
                        <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                    )}

                    {!loading && !showLogin && (
                        <div className="flex flex-col gap-5">
                            <button
                                onClick={handleToggleServiceMode}
                                disabled={togglingMode}
                                className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01] disabled:opacity-60"
                                style={{
                                    background: serviceModeActive ? '#22c55e20' : colors.surface,
                                    border: `1px solid ${serviceModeActive ? '#22c55e60' : colors.border}`,
                                }}
                            >
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: serviceModeActive ? '#22c55e' : GRADIENT, color: '#ffffff' }}
                                >
                                    {togglingMode ? <Spinner size={18} color="#ffffff" /> : <Briefcase size={24} />}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <span className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                        {serviceModeActive ? 'Desativar modo prestador' : 'Ativar modo prestador'}
                                    </span>
                                    <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                        {serviceModeActive
                                            ? 'Ativado — você aparece pronto pra se candidatar aos serviços'
                                            : 'Ative para aparecer disponível e se candidatar aos serviços'}
                                    </p>
                                </div>
                                <div
                                    className="flex-shrink-0 w-11 h-6 rounded-full relative transition-all"
                                    style={{ background: serviceModeActive ? '#22c55e' : colors.border }}
                                >
                                    <div
                                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                                        style={{ left: serviceModeActive ? 20 : 2 }}
                                    />
                                </div>
                            </button>

                            {serviceModeActive && (
                                <button
                                    onClick={() => router.push('/procurar-servico')}
                                    className="w-full py-3.5 rounded-full font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <Briefcase size={18} />
                                    Ver serviços disponíveis
                                </button>
                            )}
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}

export default function PainelPrestadorPage() {
    return (
        <Suspense fallback={null}>
            <PainelPrestadorContent />
        </Suspense>
    )
}
