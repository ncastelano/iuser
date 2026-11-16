// src/components/deliveries/CashTrustCard.tsx
//
// "Dinheiro e maquininha" na Central de entregas: a LIBERAÇÃO POR ETAPAS (migration ...69). Quem está começando leva só pedidos
// pagos por Pix; depois dos requisitos, até R$ 60 por entrega e R$ 80 com ele; depois de 30 entregas, sem limite próprio.
// Quem decide é o banco (get_my_cash_trust, a lista e a candidatura); aqui só se mostra a etapa e o que falta.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banknote, Lock, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { cashTrustView, type CashTrust } from '@/modules/deliveries'
import DriverPayoutPix from '@/components/DeliveryPayment/DriverPayoutPix'

const TONE = { locked: '#f59e0b', starter: '#3b82f6', free: '#22c55e' } as const

export default function CashTrustCard() {
    const { colors } = useTheme()
    const [trust, setTrust] = useState<CashTrust | null>(null)

    useEffect(() => {
        let alive = true
        const load = async () => {
            if (document.hidden) return
            const { data, error } = await supabase.rpc('get_my_cash_trust')
            if (alive && !error && data) setTrust(data as CashTrust)
        }
        load()
        const t = setInterval(load, 60_000)
        return () => { alive = false; clearInterval(t) }
    }, [])

    if (!trust) return null
    const v = cashTrustView(trust)
    if (v.tone === 'free') return null   // liberado: nada a dizer (o Caixa cuida do que está com ele)
    const color = TONE[v.tone]
    const Icon = v.tone === 'locked' ? Lock : Banknote

    return (
        <section className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1.5px solid ${color}66` }}>
            <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: color }}><Icon size={18} /></span>
                <div className="min-w-0">
                    <p className="text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>{v.title}</p>
                    <p className="text-[12px] font-bold mt-1 leading-snug" style={{ color: colors.textSecondary }}>{v.text}</p>
                </div>
            </div>
            {v.progress != null && (
                <div className="h-2 rounded-full overflow-hidden" style={{ background: `${color}22` }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(v.progress * 100)}%`, background: color }} />
                </div>
            )}
            {v.steps.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                    {v.steps.map((s) => (
                        <li key={s} className="flex items-start gap-2 text-[12px] font-bold" style={{ color: colors.textPrimary }}>
                            <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" style={{ color }} />{s}
                        </li>
                    ))}
                </ul>
            )}
            {trust.missing.includes('selfie') && (
                <Link href="/painel-motorista?aba=veiculo" className="h-10 rounded-full flex items-center justify-center text-[13px] font-black text-white" style={{ background: color }}>
                    Pôr a minha foto no cadastro
                </Link>
            )}
            {trust.missing.includes('pix') && <DriverPayoutPix />}
        </section>
    )
}
