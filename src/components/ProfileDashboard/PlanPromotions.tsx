// src/components/ProfileDashboard/PlanPromotions.tsx
//
// "Meu plano": fica logo acima de "Conta" no ProfileDashboard. O brinde (Resgatar 90 dias de Plano Pré-pago) e os planos
// ativos da pessoa, cada um num cartão: Pré-pago com os dias que faltam (barra), Pós-pago com quanto já acumulou do
// limite (barra) e um botão pra gerenciar. Sem plano, convida a conhecer os planos. É o lugar de novas promoções.
// Desde 16/11/2026 também mostra O QUE O PLANO INCLUI (a lista de `plans.features`), que antes ficava no cartão de planos da home
// (`CareerPlans`, removido): a home não mostra mais planos.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, Crown, Sparkles, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import FreeTrialGift from '@/components/FreeTrialGift'
import { usePostpaidCap, usePostpaidLimit } from '@/lib/postpaid'

interface ActivePlanBadge {
    name: string
    code: string | null
    daysLeft: number | null
    features: string[]
}

// O texto do plano vem do banco; a frase do limite do Pós-pago foi escrita com o valor antigo (R$ 50). Mostra sempre o limite em vigor.
function featureText(f: string, limit: number): string {
    if (!/^Limite de saldo pendente/i.test(f)) return f
    return f.replace(/R\$\s?\d+(?:,\d{2})?/, brl(limit))
}

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

function daysLeft(iso: string | null): number | null {
    if (!iso) return null
    const diff = new Date(iso).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

export default function PlanPromotions({ profileId, className = '' }: { profileId: string; className?: string }) {
    const POSTPAID_LIMIT = usePostpaidLimit()
    const POSTPAID_CAP = usePostpaidCap()
    const router = useRouter()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const [activePlans, setActivePlans] = useState<ActivePlanBadge[]>([])
    const [loaded, setLoaded] = useState(false)
    const [postpaidDebt, setPostpaidDebt] = useState(0)
    // Quando o brinde é resgatado o plano ativo muda: recarrega a lista
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
        let cancelled = false
        const loadPlans = async () => {
            const { data } = await supabase
                .from('subscriptions')
                .select('current_period_end, plans(name, code, features)')
                .eq('user_id', profileId)
                .eq('status', 'active')
            if (cancelled) return
            const badges = (data || []).map((s: any) => {
                const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans
                return { name: plan?.name || 'Plano', code: plan?.code || null, daysLeft: daysLeft(s.current_period_end), features: Array.isArray(plan?.features) ? plan.features : [] }
            })
            setActivePlans(badges)
            setLoaded(true)

            // Pós-pago não tem "dias restantes" (a data é só de controle): o que importa
            // é quanto já acumulou e quanto falta pro limite.
            if (badges.some((b) => b.code === 'pos_pago')) {
                const { data: charges } = await supabase
                    .from('driver_postpaid_charges')
                    .select('amount')
                    .eq('driver_id', profileId)
                if (!cancelled) setPostpaidDebt((charges || []).reduce((sum, c: any) => sum + Number(c.amount), 0))
            }
        }
        loadPlans()
        return () => { cancelled = true }
    }, [profileId, reloadKey])

    const bar = (percent: number, color: string) => (
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: `${colors.border}55` }} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color, height: '100%', transition: 'width .4s' }} />
        </div>
    )

    // o que o plano inclui (de plans.features) + o caminho para todos os detalhes
    const includes = (p: ActivePlanBadge) => p.features.length === 0 ? null : (
        <div className="rounded-2xl px-3.5 py-3 flex flex-col gap-1.5" style={{ background: `${colors.border}22` }}>
            <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                {p.code === 'pos_pago' ? `R$ 0,50 por uso${POSTPAID_CAP ? ` · nunca mais que R$ ${POSTPAID_CAP.toFixed(0)} no mês` : ''} · o que está incluído` : 'O que está incluído'}
            </span>
            {p.features.map((f) => (
                <span key={f} className="flex items-start gap-1.5 text-[12px] leading-snug" style={{ color: colors.textPrimary }}>
                    <Check size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#16a34a' }} />{featureText(f, POSTPAID_LIMIT)}
                </span>
            ))}
            <button onClick={() => router.push('/planos')} className="self-start mt-1 text-[12px] font-black flex items-center gap-0.5" style={{ color: '#f97316' }}>
                Ver detalhes dos planos <ChevronRight size={14} />
            </button>
        </div>
    )

    return (
        <div className={`flex flex-col gap-3 ${className}`}>
            <FreeTrialGift hideWhenEnded onClaimed={() => setReloadKey((k) => k + 1)} />

            <div
                className="rounded-3xl p-4 flex flex-col gap-3"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}>
                        <Crown size={20} />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-base font-black leading-tight" style={{ color: colors.textPrimary }}>Meu plano</h3>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                            {activePlans.length > 0 ? 'O que está valendo na sua conta' : 'Você ainda não tem um plano ativo'}
                        </p>
                    </div>
                </div>

                {loaded && activePlans.length === 0 && (
                    <button
                        onClick={() => router.push('/planos')}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                        style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                    >
                        <Sparkles size={16} /> Conhecer os planos
                    </button>
                )}

                {activePlans.map((p, i) => {
                    if (p.code === 'pos_pago') {
                        const accumulated = Math.max(0, postpaidDebt)
                        const remaining = Math.max(0, POSTPAID_LIMIT - accumulated)
                        const blocked = accumulated >= POSTPAID_LIMIT
                        const pct = (accumulated / POSTPAID_LIMIT) * 100
                        return (
                            <div key={i} className="flex flex-col gap-2">
                            <button
                                onClick={() => router.push('/planos/pos-pago')}
                                className="w-full text-left rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all hover:-translate-y-0.5"
                                style={{ border: `1px solid ${blocked ? '#ef444455' : '#22c55e55'}`, background: blocked ? '#ef444410' : '#22c55e0f' }}
                            >
                                <span className="flex items-center gap-2">
                                    <Wallet size={16} style={{ color: blocked ? '#dc2626' : '#16a34a' }} />
                                    <span className="text-sm font-black flex-1" style={{ color: colors.textPrimary }}>{p.name}</span>
                                    <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                                </span>
                                {bar(pct, blocked ? '#ef4444' : 'linear-gradient(90deg, #22c55e, #f59e0b)')}
                                <span className="flex items-baseline justify-between gap-2 text-xs">
                                    <span style={{ color: colors.textSecondary }}><b style={{ color: colors.textPrimary }}>{brl(accumulated)}</b> acumulados de {brl(POSTPAID_LIMIT)}</span>
                                    <span className="font-bold" style={{ color: blocked ? '#dc2626' : '#16a34a' }}>
                                        {blocked ? 'Limite atingido — quite para continuar' : `Faltam ${brl(remaining)}`}
                                    </span>
                                </span>
                            </button>
                            {includes(p)}
                            </div>
                        )
                    }
                    const left = p.daysLeft
                    const pct = left != null ? (Math.min(left, 30) / 30) * 100 : 100
                    return (
                        <div key={i} className="flex flex-col gap-2">
                        <button
                            onClick={() => router.push('/planos')}
                            className="w-full text-left rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all hover:-translate-y-0.5"
                            style={{ border: '1px solid #22c55e55', background: '#22c55e0f' }}
                        >
                            <span className="flex items-center gap-2">
                                <Sparkles size={16} style={{ color: '#16a34a' }} />
                                <span className="text-sm font-black flex-1" style={{ color: colors.textPrimary }}>{p.name}</span>
                                <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                            </span>
                            {left != null && bar(pct, 'linear-gradient(90deg, #22c55e, #16a34a)')}
                            <span className="text-xs" style={{ color: colors.textSecondary }}>
                                {left != null
                                    ? <><b style={{ color: colors.textPrimary }}>{left} dia{left === 1 ? '' : 's'}</b> restante{left === 1 ? '' : 's'}</>
                                    : 'Plano ativo'}
                            </span>
                        </button>
                        {includes(p)}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
