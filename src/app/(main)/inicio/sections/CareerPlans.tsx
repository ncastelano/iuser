// src/app/(main)/inicio/sections/CareerPlans.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Check, Zap, Gift } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { HomeGlassCard, HomeSectionHeader, HOME_GRADIENT } from './HomeSectionKit'
import { useFreeTrialSettings, trialDaysLabel } from '@/hooks/useFreeTrial'

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
    const { settings: trial } = useFreeTrialSettings()
    const trialLabel = trialDaysLabel(trial.durationDays)

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
    // "Ver detalhes" do plano leva sempre pra /planos, onde estão todas as informações de planos
    const destination = '/planos'
    const priceLabel = isPostpaid ? 'R$ 0,50' : displayPlan ? `R$ ${displayPlan.price.toFixed(2)}` : ''
    const periodLabel = isPostpaid ? 'por uso' : displayPlan ? (CYCLE_LABEL[displayPlan.billing_cycle] || '/mês') : ''

    if (!userId) {
        // Visitante: o destaque é o brinde (teste grátis do Pré-pago, resgate único). Os planos
        // (pós-pago e pré-pago) ficam em /planos, a um toque em "Ver planos".
        return (
            <section>
                <HomeGlassCard className="p-5 sm:p-6">
                    <HomeSectionHeader
                        icon={Sparkles}
                        title="Melhor plano para você"
                        subtitle="50 centavos por serviço ou R$ 99 mensal sem taxa por serviço"
                        action={<span />}
                    />

                    <div className="relative rounded-3xl p-5 flex flex-col gap-3" style={{ background: GRADIENT, boxShadow: '0 10px 30px #f9731650' }}>
                        <span
                            className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full text-white flex items-center gap-1 whitespace-nowrap"
                            style={{ background: '#111827', border: '1px solid #ffffff' }}
                        >
                            <Zap size={10} />
                            Pra quem está chegando
                        </span>
                        <div className="flex items-center gap-3 pt-1">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.22)' }}>
                                <Gift size={24} color="#fff" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xl font-black text-white leading-tight">{trial.enabled ? `${trialLabel} grátis` : 'Plano Pré-pago'}</p>
                                <p className="text-xs text-white/80">
                                    {trial.enabled ? 'do plano Pré-pago, começando no dia em que você resgatar' : 'mensalidade única, sem taxa por serviço'}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            {[
                                trial.enabled ? `Sem taxa por serviço nos ${trialLabel}` : 'Sem taxa por serviço',
                                'Libera motorista, prestador, loja e recrutador',
                                'Vale também pra quem já está no pós-pago',
                            ].map((f) => (
                                <div key={f} className="flex items-start gap-1.5">
                                    <Check size={13} className="mt-0.5 flex-shrink-0 text-white" />
                                    <span className="text-[11px] leading-tight text-white/90">{f}</span>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => router.push('/planos')}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-sm font-black transition-transform hover:scale-[1.02] active:scale-95"
                            style={{ background: '#fff', color: '#dc2626' }}
                        >
                            <Sparkles size={16} />
                            Ver planos
                        </button>
                    </div>
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
