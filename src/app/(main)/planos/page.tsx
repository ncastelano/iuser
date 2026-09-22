// app/(main)/planos/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header, { type Tab } from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '@/components/LoginAndRegister/LoginAndRegister'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { callAdminApi } from '@/lib/callAdminApi'
import { getDeviceId } from '@/lib/deviceId'
import { useMyStatus } from '@/lib/benefits/useMyStatus'
import { Car, Briefcase, Sparkles, Store, Check, Copy, X, ShieldCheck, Gift, Users, CreditCard, User, Shield, LayoutDashboard, Wallet } from 'lucide-react'

export const dynamic = 'force-dynamic'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Plan {
    id: string
    code: string
    name: string
    price: number
    is_active: boolean
    description: string | null
    features: string[] | null
    billing_cycle: string
    max_active_subscriptions: number | null
    promo_price: number | null
    promo_starts_at: string | null
    promo_ends_at: string | null
}

function activePromoPrice(plan: Plan): number | null {
    if (!plan.promo_price || !plan.promo_starts_at || !plan.promo_ends_at) return null
    const now = Date.now()
    if (now < new Date(plan.promo_starts_at).getTime() || now > new Date(plan.promo_ends_at).getTime()) return null
    return Number(plan.promo_price)
}

interface ActiveSub {
    plan_id: string
    status: string
    source: 'asaas' | 'admin_grant' | 'code' | 'leader_grant' | 'postpaid'
    current_period_end: string | null
}

const SOURCE_LABEL: Record<ActiveSub['source'], string> = {
    asaas: 'Assinatura ativa',
    admin_grant: 'Concedido pelo admin',
    code: 'Resgatado por código',
    leader_grant: 'Concedido por líder',
    postpaid: 'Pós-pago ativo',
}

interface PixData {
    subscriptionId: string
    pixQrCodeImage: string
    pixCopyPaste: string
    invoiceUrl: string
}

const PLAN_ICON: Record<string, typeof Car> = {
    motorista: Car,
    prestador: Briefcase,
    loja: Store,
    recrutador: Users,
    combo: Sparkles,
    beta: Gift,
    pre_pago: Sparkles,
    pos_pago: Wallet,
}

const CYCLE_LABEL: Record<string, string> = {
    WEEKLY: '/semana',
    BIWEEKLY: '/quinzena',
    MONTHLY: '/mês',
    QUARTERLY: '/trimestre',
    SEMIANNUALLY: '/semestre',
    YEARLY: '/ano',
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
    const { canManageBenefits, hierarchyLabel } = useMyStatus(userId)
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
    const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({})
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [{ data: plansData }, { data: countsData }] = await Promise.all([
            supabase
                .from('plans')
                .select('id, code, name, price, is_active, description, features, billing_cycle, max_active_subscriptions, promo_price, promo_starts_at, promo_ends_at')
                .eq('is_active', true)
                .order('price', { ascending: true }),
            supabase.rpc('get_plan_subscriber_counts'),
        ])
        setSubscriberCounts(
            Object.fromEntries((countsData || []).map((c: { plan_id: string; active_count: number }) => [c.plan_id, Number(c.active_count)]))
        )
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

    // ===== ABAS DO HEADER — mesmo padrão da home (perfil, Admin, lojas) =====
    // /planos é uma rota isolada (sem view-switching como a home), então os
    // cliques navegam em vez de trocar de view.
    const [ownedStores, setOwnedStores] = useState<{ id: string; slug: string; name: string; logoUrl: string | null }[]>([])
    const [loadingOwnedStores, setLoadingOwnedStores] = useState(true)

    useEffect(() => {
        let cancelled = false
        const loadOwnedStores = async () => {
            setLoadingOwnedStores(true)
            if (!userId) {
                if (!cancelled) { setOwnedStores([]); setLoadingOwnedStores(false) }
                return
            }
            const { data } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')
                .eq('owner_id', userId)
                .order('created_at', { ascending: true })
            if (cancelled) return
            setOwnedStores((data || []).map((s: any) => ({
                id: s.id,
                slug: s.storeSlug,
                name: s.name,
                logoUrl: s.logo_url ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl : null,
            })))
            setLoadingOwnedStores(false)
        }
        loadOwnedStores()
        return () => { cancelled = true }
    }, [userId])

    const headerTabs: Tab[] = useMemo(() => {
        const isLoggedIn = !!profileSlug && !profileLoading
        const allTabs: Tab[] = [
            {
                id: 'perfil',
                label: isLoggedIn ? `@${profileSlug}` : 'Entrar',
                icon: User,
                imageUrl: isLoggedIn ? avatarUrl : null,
                onClick: () => { isLoggedIn ? router.push(`/${profileSlug}`) : setShowLogin(true) },
                isActive: !isLoggedIn && showLogin,
            },
        ]

        if (isSuperAdmin) {
            allTabs.push({
                id: 'admin',
                label: 'Admin',
                icon: Shield,
                imageUrl: null,
                onClick: () => router.push('/'),
                isActive: false,
            })
        }

        if (canManageBenefits) {
            allTabs.push({
                id: 'gestao-beneficios',
                label: hierarchyLabel,
                icon: Gift,
                imageUrl: null,
                onClick: () => router.push('/'),
                isActive: false,
            })
        }

        if (loadingOwnedStores) return allTabs

        if (ownedStores.length > 0) {
            ownedStores.forEach((s) => {
                allTabs.push({
                    id: `loja-${s.slug}`,
                    label: s.name,
                    icon: LayoutDashboard,
                    imageUrl: s.logoUrl,
                    onClick: () => router.push(`/${s.slug}`),
                    isActive: false,
                })
            })
        } else {
            allTabs.push({
                id: 'criar-loja',
                label: 'Cadastrar loja?',
                icon: Store,
                imageUrl: null,
                onClick: () => (isLoggedIn ? router.push('/criar-loja') : setShowLogin(true)),
                isActive: false,
            })
        }

        return allTabs
    }, [profileSlug, profileLoading, avatarUrl, showLogin, isSuperAdmin, canManageBenefits, hierarchyLabel, ownedStores, loadingOwnedStores, router])

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
                body: JSON.stringify({ planId: plan.id, cpfCnpj, deviceId: getDeviceId() }),
            })
            const json = await res.json()
            if (!res.ok) {
                if (json.needsCpf) {
                    setCpfPromptPlan(plan)
                    return
                }
                throw new Error(json.error || 'Erro ao criar assinatura')
            }

            if (json.activated) {
                toast.success('Plano pós-pago ativado!')
                await load()
                return
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
                    tabs={headerTabs}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-5xl mx-auto">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <Spinner size={24} color={colors.textSecondary} />
                        </div>
                    )}

                    {!loading && (
                        <div className="flex flex-col gap-6">
                            <div className="text-center max-w-xl mx-auto">
                                <h1 className="text-2xl md:text-3xl font-black" style={{ color: colors.textPrimary }}>
                                    Escolha seu plano
                                </h1>
                                <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                                    Pré-pago: mensalidade única, sem cobrança por uso. Pós-pago: sem mensalidade, mas cada serviço tem um custo — pague só quando usar.
                                </p>
                            </div>

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

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                                {plans.map((plan) => {
                                    const Icon = PLAN_ICON[plan.code] || Sparkles
                                    const sub = getActiveSub(plan.id)
                                    const active = isSuperAdmin || !!sub
                                    // Pós-pago não tem validade de verdade (grava um vencimento
                                    // sintético lá no fim de 2099 só pra reaproveitar o mesmo campo)
                                    // — "faltam N dias" não faz sentido pra ele.
                                    const remaining = sub && sub.source !== 'postpaid' ? daysLeft(sub.current_period_end) : null
                                    const highlighted = highlightPlan === plan.code
                                    const isCombo = plan.code === 'pre_pago'
                                    const remainingSlots = plan.max_active_subscriptions != null
                                        ? Math.max(0, plan.max_active_subscriptions - (subscriberCounts[plan.id] || 0))
                                        : null
                                    const soldOut = remainingSlots === 0 && !active
                                    const promoPrice = activePromoPrice(plan)

                                    return (
                                        <div
                                            key={plan.id}
                                            className="relative flex flex-col gap-3 p-5 rounded-3xl h-full"
                                            style={{
                                                background: active ? '#22c55e18' : isCombo ? `${colors.surface}` : colors.surface,
                                                border: `2px solid ${active ? '#22c55e60' : isCombo ? '#f97316' : highlighted ? colors.accent : colors.border}`,
                                                boxShadow: isCombo && !active ? '0 8px 30px rgba(249,115,22,0.25)' : undefined,
                                                transform: isCombo ? 'scale(1.02)' : undefined,
                                            }}
                                        >
                                            {isCombo && !active && (
                                                <span
                                                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white whitespace-nowrap"
                                                    style={{ background: GRADIENT }}
                                                >
                                                    Melhor oferta
                                                </span>
                                            )}

                                            <div
                                                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ background: active ? '#22c55e' : GRADIENT, color: '#ffffff' }}
                                            >
                                                <Icon size={20} />
                                            </div>

                                            <span className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                                {plan.name}
                                            </span>

                                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                                {promoPrice != null && (
                                                    <span className="text-sm font-bold line-through" style={{ color: colors.textSecondary }}>
                                                        R$ {plan.price.toFixed(2)}
                                                    </span>
                                                )}
                                                <span
                                                    className={isCombo ? 'text-3xl font-black' : 'text-2xl font-black'}
                                                    style={{ color: promoPrice != null ? '#22c55e' : isCombo ? '#f97316' : colors.textPrimary }}
                                                >
                                                    {plan.code === 'pos_pago' ? 'R$ 0,50' : `R$ ${(promoPrice ?? plan.price).toFixed(2)}`}
                                                </span>
                                                <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                                    {plan.code === 'pos_pago' ? 'por serviço' : (CYCLE_LABEL[plan.billing_cycle] || '/mês')}
                                                </span>
                                            </div>

                                            {promoPrice != null && (
                                                <span
                                                    className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full w-fit"
                                                    style={{ background: '#22c55e20', color: '#22c55e' }}
                                                >
                                                    Promoção por tempo limitado
                                                </span>
                                            )}

                                            {remainingSlots !== null && !active && (
                                                <span
                                                    className="text-[11px] font-bold"
                                                    style={{ color: soldOut ? '#ef4444' : '#f97316' }}
                                                >
                                                    {soldOut ? 'Vagas esgotadas' : `${remainingSlots} de ${plan.max_active_subscriptions} vagas restantes`}
                                                </span>
                                            )}

                                            <div className="flex-1 flex flex-col gap-2">
                                                {plan.description && (
                                                    <p className="text-[11px] font-semibold" style={{ color: colors.textSecondary }}>
                                                        {plan.description}
                                                    </p>
                                                )}

                                                {plan.features && plan.features.length > 0 && (
                                                    <ul className="flex flex-col gap-1.5">
                                                        {plan.features.map((feature, i) => (
                                                            <li key={i} className="flex items-start gap-1.5 text-[11px]" style={{ color: colors.textPrimary }}>
                                                                <Check size={12} className="mt-0.5 flex-shrink-0" color="#22c55e" />
                                                                <span>{feature}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>

                                            {sub && !isSuperAdmin && (
                                                <p className="text-[11px] flex items-center gap-1 font-bold" style={{ color: '#22c55e' }}>
                                                    {sub.source === 'asaas' ? <Check size={12} /> : <Gift size={12} />}
                                                    {SOURCE_LABEL[sub.source]}
                                                    {remaining !== null && ` · faltam ${remaining} dia${remaining === 1 ? '' : 's'}`}
                                                </p>
                                            )}

                                            {!active && (
                                                <button
                                                    onClick={() => handleBuy(plan)}
                                                    disabled={buyingPlanId === plan.id || soldOut}
                                                    className="w-full mt-1 px-4 py-2.5 rounded-full font-black uppercase text-xs tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-60"
                                                    style={{ background: isCombo ? GRADIENT : `${colors.textPrimary}15`, color: isCombo ? '#ffffff' : colors.textPrimary }}
                                                >
                                                    {buyingPlanId === plan.id ? <Spinner size={14} color="#ffffff" /> : soldOut ? 'Esgotado' : plan.code === 'pos_pago' ? 'Ativar' : 'Assinar'}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {userId && !isSuperAdmin && (
                                <div className="rounded-2xl p-4 max-w-xl w-full mx-auto" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
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
                                <div className="mt-2 max-w-xl w-full mx-auto">
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

                                <div className="flex items-center gap-2 w-full my-1">
                                    <div className="flex-1 h-px" style={{ background: colors.border }} />
                                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>ou</span>
                                    <div className="flex-1 h-px" style={{ background: colors.border }} />
                                </div>

                                <a
                                    href={pixData.invoiceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
                                    style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                >
                                    <CreditCard size={14} /> Pagar com cartão
                                </a>

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
