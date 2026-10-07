// src/app/(main)/inicio/sections/CareerPlans.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Check, Zap, Gift } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { HomeGlassCard, HomeSectionHeader, HOME_GRADIENT } from './HomeSectionKit'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = HOME_GRADIENT

interface PlanRow {
    id: string
    code: string
    name: string
    price: number
    description: string | null
    features: string[] | null
    billing_cycle: string
}

interface ActiveSub {
    plan_id: string
    current_period_end: string | null
}

const CYCLE_LABEL: Record<string, string> = {
    WEEKLY: '/semana',
    BIWEEKLY: '/quinzena',
    MONTHLY: '/mês',
    QUARTERLY: '/trimestre',
    SEMIANNUALLY: '/semestre',
    YEARLY: '/ano',
}

// Card com o mesmo visual do "Planos" do /modelodehomepage (tier-card com
// checklist e gradiente), mas mostrando só o plano que se aplica à pessoa
// agora — o ativo, ou o recomendado (pré-pago) se ela ainda não tem nenhum
// — em vez das 3 fictícias do modelo.
export default function CareerPlans() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId } = useProfile()

    const [plans, setPlans] = useState<PlanRow[]>([])
    const [plansLoading, setPlansLoading] = useState(true)
    const [activeSub, setActiveSub] = useState<ActiveSub | null>(null)
    const [subLoading, setSubLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        supabase
            .from('plans')
            .select('id, code, name, price, description, features, billing_cycle')
            .eq('is_active', true)
            .then(({ data }) => {
                if (cancelled) return
                setPlans(data || [])
                setPlansLoading(false)
            })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!userId) {
            setActiveSub(null)
            setSubLoading(false)
            return
        }
        let cancelled = false
        setSubLoading(true)
        supabase
            .from('subscriptions')
            .select('plan_id, status, current_period_end')
            .eq('user_id', userId)
            .eq('status', 'active')
            .then(({ data }) => {
                if (cancelled) return
                const now = Date.now()
                const row = (data || []).find((s: any) => s.current_period_end && new Date(s.current_period_end).getTime() > now)
                setActiveSub(row ? { plan_id: row.plan_id, current_period_end: row.current_period_end } : null)
                setSubLoading(false)
            })
        return () => { cancelled = true }
    }, [userId])

    const loading = plansLoading || subLoading
    const activePlan = activeSub ? plans.find((p) => p.id === activeSub.plan_id) || null : null
    const recommendedPlan = plans.find((p) => p.code === 'pre_pago') || plans[0] || null
    const displayPlan = activePlan || recommendedPlan
    const isActive = !!activePlan
    const isPostpaid = displayPlan?.code === 'pos_pago'
    const destination = isPostpaid ? '/planos/pos-pago' : '/planos'
    const priceLabel = isPostpaid ? 'R$ 0,50' : displayPlan ? `R$ ${displayPlan.price.toFixed(2)}` : ''
    const periodLabel = isPostpaid ? 'por uso' : displayPlan ? (CYCLE_LABEL[displayPlan.billing_cycle] || '/mês') : ''

    if (!userId) {
        // Visitante: mostra os dois planos lado a lado pra ele já escolher.
        const postpaid = plans.find((p) => p.code === 'pos_pago') || null
        const prepaid = plans.find((p) => p.code === 'pre_pago') || null
        const prepaidPrice = prepaid ? prepaid.price : 99
        const priceText = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
        const topFeatures = (plan: PlanRow | null, fallback: string[]) => (plan?.features && plan.features.length > 0 ? plan.features : fallback).slice(0, 3)

        const postFeatures = topFeatures(postpaid, [
            'Sem mensalidade: você paga somente quando usar',
            'R$ 0,50 por uso: corrida, venda, novo produto, publicação e mais',
        ])
        const preFeatures = topFeatures(prepaid, [
            'Tudo incluso: sem cobrança por serviço',
            '0% de taxa sobre suas corridas ou vendas',
        ])

        return (
            <section>
                <HomeGlassCard className="p-5 sm:p-6">
                    <HomeSectionHeader
                        icon={Sparkles}
                        title="Melhor plano para você"
                        subtitle="50 centavos por serviço ou R$ 99 mensal sem taxa por serviço"
                        action={<span />}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Pós-pago */}
                        <div
                            className="rounded-3xl p-5 flex flex-col"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                        >
                            <p className="text-sm font-black mb-1" style={{ color: colors.textPrimary }}>{postpaid?.name || 'Pós-pago'}</p>
                            <div className="flex items-end gap-1 mb-1">
                                <span className="text-2xl font-black" style={{ color: colors.textPrimary }}>R$ 0,50</span>
                                <span className="text-xs mb-0.5" style={{ color: colors.textSecondary }}>por serviço</span>
                            </div>
                            <p className="text-[11px] mb-3" style={{ color: colors.textSecondary }}>Sem mensalidade. Pague só quando usar.</p>
                            <div className="flex flex-col gap-2 flex-1 mb-4">
                                {postFeatures.map((f) => (
                                    <div key={f} className="flex items-start gap-1.5">
                                        <Check size={13} className="mt-0.5 flex-shrink-0" style={{ color: colors.accent }} />
                                        <span className="text-[11px] leading-tight" style={{ color: colors.textPrimary }}>{f}</span>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => router.push('/planos/pos-pago')}
                                className="w-full py-2.5 rounded-full text-xs font-black transition-transform hover:scale-105 active:scale-95"
                                style={{ background: `${colors.accent}15`, color: colors.accent, border: `1px solid ${colors.accent}` }}
                            >
                                Ativar
                            </button>
                        </div>

                        {/* Pré-pago (mensal) */}
                        <div
                            className="relative rounded-3xl p-5 flex flex-col"
                            style={{ background: GRADIENT, boxShadow: '0 10px 30px #f9731650' }}
                        >
                            <span
                                className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full text-white flex items-center gap-1 whitespace-nowrap"
                                style={{ background: '#111827' }}
                            >
                                <Zap size={10} />
                                Melhor oferta
                            </span>
                            <p className="text-sm font-black text-white mb-1">{prepaid?.name || 'Pré-pago'}</p>
                            <div className="flex items-end gap-1 mb-1">
                                <span className="text-2xl font-black text-white">{priceText(prepaidPrice)}</span>
                                <span className="text-xs opacity-70 mb-0.5 text-white">por mês</span>
                            </div>
                            <p className="text-[11px] mb-3 text-white/80">Sem taxa por serviço. Use à vontade.</p>
                            <div className="flex flex-col gap-2 flex-1 mb-4">
                                {preFeatures.map((f) => (
                                    <div key={f} className="flex items-start gap-1.5">
                                        <Check size={13} className="mt-0.5 flex-shrink-0 text-white" />
                                        <span className="text-[11px] leading-tight text-white/90">{f}</span>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => router.push('/planos?plan=pre_pago')}
                                className="w-full py-2.5 rounded-full text-xs font-black transition-transform hover:scale-105 active:scale-95"
                                style={{ background: '#fff', color: '#dc2626' }}
                            >
                                Assinar
                            </button>
                        </div>
                    </div>

                    {/* Leva pra /planos, onde também dá pra resgatar os 3 meses grátis do Pré-pago */}
                    <button
                        onClick={() => router.push('/planos')}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-[1.02] active:scale-95"
                        style={{ background: GRADIENT, color: '#ffffff', boxShadow: '0 4px 12px #f9731640' }}
                    >
                        <Sparkles size={16} />
                        Ver planos
                    </button>
                    <p className="mt-2 text-center text-[11px] flex items-center justify-center gap-1" style={{ color: colors.textSecondary }}>
                        <Gift size={12} style={{ color: colors.accent }} />
                        Resgate 3 meses grátis do Pré-pago lá em Planos
                    </p>
                </HomeGlassCard>
            </section>
        )
    }

    if (loading || !displayPlan) {
        return (
            <section>
                <div className="rounded-3xl animate-pulse" style={{ background: `${colors.border}30`, height: 230 }} />
            </section>
        )
    }

    return (
        <section>
            <div
                className="relative rounded-3xl p-5 flex flex-col"
                style={{ background: GRADIENT, boxShadow: '0 10px 30px #f9731650' }}
            >
                <span
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full text-white flex items-center gap-1 whitespace-nowrap"
                    style={{ background: '#111827' }}
                >
                    {isActive ? <Check size={10} /> : <Zap size={10} />}
                    {isActive ? 'Seu plano' : 'Recomendado'}
                </span>

                <p className="text-sm font-black text-white mb-1">{displayPlan.name}</p>
                <div className="flex items-end gap-1 mb-4">
                    <span className="text-2xl font-black text-white">{priceLabel}</span>
                    <span className="text-xs opacity-60 mb-0.5 text-white">{periodLabel}</span>
                </div>

                {displayPlan.features && displayPlan.features.length > 0 && (
                    <div className="flex flex-col gap-2 flex-1 mb-4">
                        {displayPlan.features.map((f) => (
                            <div key={f} className="flex items-start gap-1.5">
                                <Check size={13} className="mt-0.5 flex-shrink-0 text-white" />
                                <span className="text-[11px] leading-tight text-white/90">{f}</span>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    onClick={() => router.push(destination)}
                    className="w-full py-2.5 rounded-full text-xs font-black transition-transform hover:scale-105 active:scale-95"
                    style={{ background: '#fff', color: '#dc2626' }}
                >
                    {isActive ? 'Ver detalhes' : 'Assinar'}
                </button>
            </div>
        </section>
    )
}
