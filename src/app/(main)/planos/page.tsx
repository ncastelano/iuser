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
import { callAdminApi } from '@/lib/callAdminApi'
import { Car, Briefcase, Sparkles, Store, Check, Copy, X, ShieldCheck, Gift } from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Plan {
    id: string
    code: string
    name: string
    price: number
    is_active: boolean
    description: string | null
}

interface ActiveSub {
    plan_id: string
    status: string
    source: 'asaas' | 'admin_grant' | 'code'
    current_period_end: string | null
}

const SOURCE_LABEL: Record<ActiveSub['source'], string> = {
    asaas: 'Assinatura ativa',
    admin_grant: 'Concedido pelo admin',
    code: 'Resgatado por código',
}

interface PixData {
    subscriptionId: string
    pixQrCodeImage: string
    pixCopyPaste: string
}

const PLAN_ICON: Record<string, typeof Car> = {
    motorista: Car,
    prestador: Briefcase,
    loja: Store,
    combo: Sparkles,
}

function daysLeft(iso: string | null): number | null {
    if (!iso) return null
    const diff = new Date(iso).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
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
    const [isSuperAdmin, setIsSuperAdmin] = useState(false)
    const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null)
    const [pixData, setPixData] = useState<PixData | null>(null)
    const [confirmed, setConfirmed] = useState(false)
    const [cpfPromptPlan, setCpfPromptPlan] = useState<Plan | null>(null)
    const [cpfInput, setCpfInput] = useState('')
    const [promoCode, setPromoCode] = useState('')
    const [redeeming, setRedeeming] = useState(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const { data: plansData } = await supabase
            .from('plans')
            .select('id, code, name, price, is_active, description')
            .eq('is_active', true)
            .order('price', { ascending: true })
        setPlans(plansData || [])

        // Os planos (preço, nome) são públicos — mostra pra qualquer um, logado
        // ou não. Só pede login na hora de assinar de verdade (handleBuy).
        if (userId) {
            const [{ data: subsData }, whoami] = await Promise.all([
                supabase
                    .from('subscriptions')
                    .select('plan_id, status, source, current_period_end')
                    .eq('user_id', userId)
                    .in('status', ['active', 'past_due']),
                callAdminApi<{ isSuperAdmin: boolean }>('/api/admin/whoami').catch(() => ({ isSuperAdmin: false })),
            ])
            setActiveSubs((subsData as ActiveSub[]) || [])
            setIsSuperAdmin(!!whoami.isSuperAdmin)
        } else {
            setActiveSubs([])
            setIsSuperAdmin(false)
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

    const handleBuy = async (plan: Plan, cpfCnpj?: string) => {
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
                body: JSON.stringify({ planId: plan.id, cpfCnpj }),
            })
            const json = await res.json()
            if (!res.ok) {
                if (json.needsCpf) {
                    setCpfPromptPlan(plan)
                    return
                }
                throw new Error(json.error || 'Erro ao criar assinatura')
            }

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

    const handleRedeemCode = async () => {
        if (!promoCode.trim()) return
        setRedeeming(true)
        try {
            const { error } = await supabase.rpc('redeem_plan_code', { p_code: promoCode.trim() })
            if (error) throw new Error(error.message)
            toast.success('Código resgatado! Plano ativado.')
            setPromoCode('')
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Código inválido')
        } finally {
            setRedeeming(false)
        }
    }

    const handleConfirmCpf = () => {
        const clean = cpfInput.replace(/\D/g, '')
        if (clean.length !== 11 && clean.length !== 14) {
            toast.error('CPF (11 dígitos) ou CNPJ (14 dígitos) inválido')
            return
        }
        const plan = cpfPromptPlan
        setCpfPromptPlan(null)
        setCpfInput('')
        if (plan) handleBuy(plan, clean)
    }

    const handleLoginSuccess = () => {
        setShowLogin(false)
        load()
    }

    const getActiveSub = (planId: string) => activeSubs.find((s) => s.plan_id === planId && s.status === 'active')

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

                    {!loading && (
                        <div className="flex flex-col gap-4">
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                                Assine pra ativar modo motorista, modo prestador, manter a loja aberta pra vender, ou tudo junto no combo.
                            </p>

                            {isSuperAdmin && (
                                <div
                                    className="w-full flex items-center gap-3 p-4 rounded-2xl"
                                    style={{ background: '#22c55e20', border: '1px solid #22c55e60' }}
                                >
                                    <ShieldCheck size={22} color="#22c55e" />
                                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Você é admin — acesso total a tudo, sem precisar assinar.
                                    </p>
                                </div>
                            )}

                            {plans.map((plan) => {
                                const Icon = PLAN_ICON[plan.code] || Sparkles
                                const sub = getActiveSub(plan.id)
                                const active = isSuperAdmin || !!sub
                                const remaining = sub ? daysLeft(sub.current_period_end) : null
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
                                            {plan.description && (
                                                <p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>
                                                    {plan.description}
                                                </p>
                                            )}
                                            {sub && !isSuperAdmin && (
                                                <p className="text-[11px] mt-1 flex items-center gap-1 font-bold" style={{ color: '#22c55e' }}>
                                                    {sub.source === 'asaas' ? <Check size={12} /> : <Gift size={12} />}
                                                    {SOURCE_LABEL[sub.source]}
                                                    {remaining !== null && ` · faltam ${remaining} dia${remaining === 1 ? '' : 's'}`}
                                                </p>
                                            )}
                                        </div>
                                        {!active && (
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

                            {userId && !isSuperAdmin && (
                                <div className="rounded-2xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                    <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                                        Tenho um código promocional
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={promoCode}
                                            onChange={(e) => setPromoCode(e.target.value)}
                                            placeholder="Cole o código aqui"
                                            className="flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        />
                                        <button
                                            onClick={handleRedeemCode}
                                            disabled={redeeming || !promoCode.trim()}
                                            className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50 flex-shrink-0"
                                            style={{ background: colors.accent }}
                                        >
                                            {redeeming ? <Spinner size={14} color="#ffffff" /> : 'Resgatar'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {showLogin && (
                                <div className="mt-2">
                                    <p className="text-xs mb-3 text-center" style={{ color: colors.textSecondary }}>
                                        Entra ou cria sua conta pra assinar
                                    </p>
                                    <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </main>

            {cpfPromptPlan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6 relative" style={{ background: colors.surface }}>
                        <button onClick={() => { setCpfPromptPlan(null); setCpfInput('') }} className="absolute top-4 right-4" style={{ color: colors.textSecondary }}>
                            <X size={20} />
                        </button>
                        <p className="font-black text-sm mb-1" style={{ color: colors.textPrimary }}>Falta seu CPF ou CNPJ</p>
                        <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                            A operadora de pagamento exige isso pra emitir a cobrança. Só pede uma vez.
                        </p>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={cpfInput}
                            onChange={(e) => setCpfInput(e.target.value)}
                            placeholder="Só números"
                            className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none mb-3"
                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                        />
                        <button
                            onClick={handleConfirmCpf}
                            disabled={buyingPlanId === cpfPromptPlan.id}
                            className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
                            style={{ background: GRADIENT, color: '#fff' }}
                        >
                            {buyingPlanId === cpfPromptPlan.id ? <Spinner size={14} color="#ffffff" /> : 'Continuar'}
                        </button>
                    </div>
                </div>
            )}

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
