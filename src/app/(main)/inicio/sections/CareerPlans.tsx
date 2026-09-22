// src/app/(main)/inicio/sections/CareerPlans.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Wallet, ArrowRight } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { hexToRgb } from '@/lib/color'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface ActivePlan {
    code: string
    name: string
}

export default function CareerPlans() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId } = useProfile()
    const [loading, setLoading] = useState(true)
    const [activePlan, setActivePlan] = useState<ActivePlan | null>(null)

    // Só 2 produtos de verdade hoje (Pré-pago/Pós-pago) — busca direto qual
    // dos dois a pessoa tem, mesmo padrão de /planos/page.tsx, em vez de
    // mostrar os 4 badges antigos (motorista/prestador/loja/recrutador) que
    // eram de quando existiam 5+ planos separados.
    useEffect(() => {
        if (!userId) {
            setActivePlan(null)
            setLoading(false)
            return
        }
        let cancelled = false
        setLoading(true)
        supabase
            .from('subscriptions')
            .select('status, current_period_end, plans(code, name)')
            .eq('user_id', userId)
            .eq('status', 'active')
            .then(({ data }) => {
                if (cancelled) return
                const now = Date.now()
                const row = (data || []).find((s: any) => s.current_period_end && new Date(s.current_period_end).getTime() > now)
                const plan = (row as any)?.plans as ActivePlan | ActivePlan[] | undefined
                setActivePlan(Array.isArray(plan) ? plan[0] || null : plan || null)
                setLoading(false)
            })
        return () => { cancelled = true }
    }, [userId])

    const surfaceRgb = hexToRgb(colors.surface)
    const isPostpaid = activePlan?.code === 'pos_pago'

    const title = !userId
        ? 'Entre pra ver seu plano'
        : loading
            ? 'Carregando...'
            : activePlan
                ? activePlan.name
                : 'Nenhum plano ativo'

    const subtitle = !userId
        ? 'Entre pra ver qual plano você tem e o que ele libera.'
        : loading
            ? ''
            : activePlan
                ? isPostpaid
                    ? 'Sem mensalidade — você paga por serviço, veja seu extrato.'
                    : 'Mensalidade única — motorista, prestador, loja e recrutador liberados.'
                : 'Assine o Pré-pago ou ative o Pós-pago pra liberar motorista, prestador, loja e recrutador.'

    const buttonLabel = activePlan ? 'Ver detalhes' : 'Ver planos'
    const destination = isPostpaid ? '/planos/pos-pago' : '/planos'

    return (
        <section>
            <div
                className="rounded-2xl p-6"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: activePlan ? '#22c55e' : GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731640` }}
                        >
                            {isPostpaid ? <Wallet size={28} /> : <Sparkles size={28} />}
                        </div>

                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={() => router.push(destination)}
                        className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95 flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            border: 'none',
                            boxShadow: `0 4px 12px #f9731640`,
                        }}
                    >
                        {activePlan ? <ArrowRight size={16} /> : <Sparkles size={16} />}
                        {buttonLabel}
                    </button>
                </div>
            </div>
        </section>
    )
}
