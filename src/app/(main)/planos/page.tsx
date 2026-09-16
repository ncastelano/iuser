// app/(main)/planos/page.tsx
'use client'

import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '@/components/LoginAndRegister/LoginAndRegister'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { Car, Briefcase, Sparkles, Check, Copy, X } from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Plan {
    id: string
    code: string
    name: string
    price: number
    is_active: boolean
}

interface ActiveSub {
    plan_id: string
    status: string
}

interface PixData {
    subscriptionId: string
    pixQrCodeImage: string
    pixCopyPaste: string
}

const PLAN_ICON: Record<string, typeof Car> = {
    motorista: Car,
    prestador: Briefcase,
    combo: Sparkles,
}

function PlanosContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const highlightPlan = searchParams.get('plan')
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [plans, setPlans] = useState<Plan[]>([])
    const [activeSubs, setActiveSubs] = useState<ActiveSub[]>([])
    const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null)
    const [pixData, setPixData] = useState<PixData | null>(null)
    const [confirmed, setConfirmed] = useState(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const { data: plansData } = await supabase
            .from('plans')
            .select('id, code, name, price, is_active')
            .eq('is_active', true)
            .order('price', { ascending: true })
        setPlans(plansData || [])

        if (userId) {
            setShowLogin(false)
            const { data: subsData } = await supabase
                .from('subscriptions')
                .select('plan_id, status')
                .eq('user_id', userId)
                .in('status', ['active', 'past_due'])
            setActiveSubs(subsData || [])
        } else {
            setShowLogin(true)
        }
        setLoading(false)
    }, [userId])

    useEffect(() => {
        if (!profileLoading) load()
    }, [profileLoading, load])

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
    }

    useEffect(() => stopPolling, [])

    const handleBuy = async (plan: Plan) => {
        setBuyingPlanId(plan.id)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                setShowLogin(true)
                return
            }

            const res = await fetch('/api/subscriptions/purchase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ planId: plan.id }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Erro ao criar assinatura')

            setPixData(json)
            setConfirmed(false)

            pollRef.current = setInterval(async () => {
                const statusRes = await fetch(`/api/subscriptions/${json.subscriptionId}/status`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                })
                const statusJson = await statusRes.json()
                if (statusJson.status === 'active') {
                    stopPolling()
                    setConfirmed(true)
                    await load()
                }
            }, 3000)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao criar assinatura')
        } finally {
            setBuyingPlanId(null)
        }
    }

    const closePixModal = () => {
        stopPolling()
        setPixData(null)
        setConfirmed(false)
    }

    const handleLoginSuccess = () => {
        setShowLogin(false)
        load()
    }

    const isPlanActive = (planId: string) => activeSubs.some((s) => s.plan_id === planId && s.status === 'active')

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Planos"
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
                        <div className="flex flex-col gap-4">
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Assine pra ativar modo motorista, modo prestador, ou os dois juntos no combo.
                            </p>

                            {plans.map((plan) => {
                                const Icon = PLAN_ICON[plan.code] || Sparkles
                                const active = isPlanActive(plan.id)
                                const highlighted = highlightPlan === plan.code
                                return (
                                    <div
                                        key={plan.id}
                                        className="w-full flex items-center gap-3 p-4 rounded-2xl"
                                        style={{
                                            background: active ? '#22c55e20' : colors.surface,
                                            border: `1px solid ${active ? '#22c55e60' : highlighted ? colors.accent : colors.border}`,
                                        }}
                                    >
                                        <div
                                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{ background: active ? '#22c55e' : GRADIENT, color: '#ffffff' }}
                                        >
                                            <Icon size={22} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                                {plan.name}
                                            </span>
                                            <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                                R$ {plan.price.toFixed(2)}/mês
                                            </p>
                                        </div>
                                        {active ? (
                                            <span className="flex items-center gap-1 text-xs font-bold flex-shrink-0" style={{ color: '#22c55e' }}>
                                                <Check size={16} /> Ativo
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => handleBuy(plan)}
                                                disabled={buyingPlanId === plan.id}
                                                className="px-4 py-2 rounded-full font-black uppercase text-xs tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-60 flex-shrink-0"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                {buyingPlanId === plan.id ? <Spinner size={14} color="#ffffff" /> : 'Assinar'}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>
            </main>

            {pixData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6 relative" style={{ background: colors.surface }}>
                        <button onClick={closePixModal} className="absolute top-4 right-4" style={{ color: colors.textSecondary }}>
                            <X size={20} />
                        </button>

                        {confirmed ? (
                            <div className="flex flex-col items-center gap-3 py-6 text-center">
                                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#22c55e', color: '#fff' }}>
                                    <Check size={28} />
                                </div>
                                <p className="font-black text-lg" style={{ color: colors.textPrimary }}>Pagamento confirmado!</p>
                                <button
                                    onClick={closePixModal}
                                    className="mt-2 px-6 py-2.5 rounded-full font-bold text-sm"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    Fechar
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <p className="font-black text-sm" style={{ color: colors.textPrimary }}>Pague com PIX pra ativar</p>
                                <img src={`data:image/png;base64,${pixData.pixQrCodeImage}`} alt="QR Code PIX" className="w-48 h-48 rounded-xl" />
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(pixData.pixCopyPaste)
                                        toast.success('Código copiado!')
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
                                    style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                >
                                    <Copy size={14} /> Copiar código PIX
                                </button>
                                <div className="flex items-center gap-2 mt-1">
                                    <Spinner size={14} color={colors.textSecondary} />
                                    <span className="text-xs" style={{ color: colors.textSecondary }}>Aguardando confirmação...</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function PlanosPage() {
    return (
        <Suspense fallback={null}>
            <PlanosContent />
        </Suspense>
    )
}
