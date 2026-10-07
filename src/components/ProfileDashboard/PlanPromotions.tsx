// src/components/ProfileDashboard/PlanPromotions.tsx
//
// Faixa de promoções e planos no topo do ProfileDashboard: o brinde (Resgatar 90 dias
// de Plano Pré-pago) e, logo abaixo, os planos ativos da pessoa (ex: "Pós-pago · R$ 2,00
// acumulados · faltam R$ 48,00"). É o lugar pra novas promoções com planos e afins.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import FreeTrialGift from '@/components/FreeTrialGift'

interface ActivePlanBadge {
    name: string
    code: string | null
    daysLeft: number | null
}

const POSTPAID_LIMIT = 50
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

function daysLeft(iso: string | null): number | null {
    if (!iso) return null
    const diff = new Date(iso).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

export default function PlanPromotions({ profileId, className = '' }: { profileId: string; className?: string }) {
    const router = useRouter()
    const [activePlans, setActivePlans] = useState<ActivePlanBadge[]>([])
    const [postpaidDebt, setPostpaidDebt] = useState(0)
    // Quando o brinde é resgatado o plano ativo muda: recarrega a lista
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
        let cancelled = false
        const loadPlans = async () => {
            const { data } = await supabase
                .from('subscriptions')
                .select('current_period_end, plans(name, code)')
                .eq('user_id', profileId)
                .eq('status', 'active')
            if (cancelled) return
            const badges = (data || []).map((s: any) => {
                const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans
                return {
                    name: plan?.name || 'Plano',
                    code: plan?.code || null,
                    daysLeft: daysLeft(s.current_period_end),
                }
            })
            setActivePlans(badges)

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

    return (
        <div className={`flex flex-col gap-3 ${className}`}>
            <FreeTrialGift hideWhenEnded onClaimed={() => setReloadKey((k) => k + 1)} />

            {/* Plano(s) ativo(s) + dias restantes */}
            {activePlans.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                    {activePlans.map((p, i) => {
                        if (p.code === 'pos_pago') {
                            const accumulated = Math.max(0, postpaidDebt)
                            const remaining = Math.max(0, POSTPAID_LIMIT - accumulated)
                            const blocked = accumulated >= POSTPAID_LIMIT
                            return (
                                <button
                                    key={i}
                                    onClick={() => router.push('/planos/pos-pago')}
                                    className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full text-left"
                                    style={blocked
                                        ? { background: '#ef444418', color: '#dc2626', border: '1px solid #ef444440' }
                                        : { background: '#22c55e18', color: '#16a34a', border: '1px solid #22c55e40' }}
                                >
                                    <Sparkles size={11} />
                                    {p.name} · {brl(accumulated)} acumulados · {blocked ? 'limite atingido, quite para continuar' : `faltam ${brl(remaining)}`}
                                </button>
                            )
                        }
                        return (
                            <span
                                key={i}
                                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full"
                                style={{ background: '#22c55e18', color: '#16a34a', border: '1px solid #22c55e40' }}
                            >
                                <Sparkles size={11} />
                                {p.name}
                                {p.daysLeft != null && ` · ${p.daysLeft} dia${p.daysLeft === 1 ? '' : 's'} restante${p.daysLeft === 1 ? '' : 's'}`}
                            </span>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
