// src/versions/v3/screens/GanhosScreen.tsx
//
// GANHOS (aba da barra do modo motorista, 3.0): quanto o motorista fez hoje, na semana e no mês — corridas e entregas de loja separadas —, as
// últimas concluídas e os atalhos para o ganho mínimo por hora e a tarifa. Só leitura do que ele já enxerga (modules/earnings).
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bike, Car, ChevronRight, Clock, TrendingUp, Wallet } from 'lucide-react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import { brlFromCents, loadMonthEarnings, recentCompleted, rideCents, rideMoment, summarize, type EarningPeriod, type EarningRow } from '@/modules/earnings'
import { Shimmer } from '@/components/Skeleton'
import Header from '@/components/Header'

const PERIODS: { key: EarningPeriod; label: string; title: string }[] = [
    { key: 'day', label: 'Hoje', title: 'Ganhos de hoje' },
    { key: 'week', label: 'Semana', title: 'Ganhos da semana' },
    { key: 'month', label: 'Mês', title: 'Ganhos do mês' },
]

export default function GanhosScreen() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId, loading } = useProfile()
    const [rows, setRows] = useState<EarningRow[] | null>(null)
    const [failed, setFailed] = useState(false)
    const [period, setPeriod] = useState<EarningPeriod>('day')

    useEffect(() => {
        if (!userId) { setRows(null); return }
        let alive = true
        loadMonthEarnings(userId).then((r) => { if (alive) setRows(r) }).catch(() => { if (alive) { setFailed(true); setRows([]) } })
        return () => { alive = false }
    }, [userId])

    const summary = useMemo(() => (rows ? summarize(rows) : null), [rows])
    const recent = useMemo(() => (rows ? recentCompleted(rows, 10) : []), [rows])
    const cur = PERIODS.find((p) => p.key === period)!
    const bucket = summary?.[period]
    // Voltar: de onde a pessoa veio (o atalho do painel, a barra do motorista...); sem histórico, o painel do motorista
    const goBack = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/painel-motorista') }
    const card = { background: colors.background, border: `1px solid ${colors.border}`, boxShadow: '0 4px 14px rgba(0,0,0,0.07)' } as const

    if (!loading && !userId) {
        return (
            <div className="space-y-3">
            <Header title="Ganhos" showBack onBack={goBack} />
            <div className="rounded-3xl p-8 text-center flex flex-col items-center gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <Wallet size={34} style={{ color: '#f97316' }} />
                <p className="text-base font-black">Entre na sua conta para ver seus ganhos</p>
                <Link href="/login" className="text-xs font-black underline" style={{ color: colors.accent }}>Entrar</Link>
            </div>
            </div>
        )
    }

    return (
        <div className="pb-8 space-y-3">
            <Header title="Ganhos" showBack onBack={goBack} />
            <div className="flex gap-2 pt-2">
                {PERIODS.map((p) => (
                    <button key={p.key} onClick={() => setPeriod(p.key)} className="flex-1 h-10 rounded-full text-xs font-black active:scale-95 transition"
                        style={p.key === period ? { background: '#f97316', color: '#fff' } : { ...card, color: colors.textPrimary }}>{p.label}</button>
                ))}
            </div>

            <div className="rounded-3xl p-5" style={card}>
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{cur.title}</p>
                {rows === null ? <Shimmer className="h-10 w-40 rounded-xl mt-2" /> : (
                    <p className="text-[34px] font-black leading-tight mt-1" style={{ color: '#16a34a' }}>{brlFromCents(bucket?.cents || 0)}</p>
                )}
                <div className="flex gap-2 mt-3">
                    <span className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-black" style={{ border: `1px solid ${colors.border}` }}><Car size={14} style={{ color: '#f97316' }} />{bucket?.rides || 0} {bucket?.rides === 1 ? 'corrida' : 'corridas'}</span>
                    <span className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-black" style={{ border: `1px solid ${colors.border}` }}><Bike size={14} style={{ color: '#f97316' }} />{bucket?.deliveries || 0} {bucket?.deliveries === 1 ? 'entrega' : 'entregas'}</span>
                </div>
                {failed && <p className="text-xs font-semibold mt-3" style={{ color: '#dc2626' }}>Não foi possível carregar agora. Tente de novo em instantes.</p>}
                {rows !== null && !failed && (bucket?.count || 0) === 0 && (
                    <p className="text-xs mt-3" style={{ color: colors.textSecondary }}>Nada concluído {period === 'day' ? 'hoje' : period === 'week' ? 'nesta semana' : 'neste mês'} ainda. Veja as corridas e entregas abertas na barra de baixo.</p>
                )}
            </div>

            <div className="rounded-3xl p-4" style={card}>
                <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Últimas concluídas</p>
                {rows === null ? (
                    <div className="space-y-2">{[0, 1, 2].map((i) => <Shimmer key={i} className="h-11 rounded-2xl" />)}</div>
                ) : recent.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Quando você concluir uma corrida ou entrega, ela aparece aqui.</p>
                ) : (
                    <div>
                        {recent.map((r, i) => {
                            const when = rideMoment(r)!
                            const isDelivery = !!r.order_id
                            return (
                                <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                                    <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#f9731620', color: '#f97316' }}>{isDelivery ? <Bike size={16} /> : <Car size={16} />}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[13px] font-black">{isDelivery ? 'Entrega de loja' : 'Corrida'}</span>
                                        <span className="flex items-center gap-1 text-[11px]" style={{ color: colors.textSecondary }}><Clock size={11} />{when.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </span>
                                    <span className="text-[13px] font-black" style={{ color: '#16a34a' }}>{brlFromCents(rideCents(r))}</span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="rounded-3xl overflow-hidden" style={card}>
                {[
                    { icon: <TrendingUp size={16} />, title: 'Meu ganho mínimo por hora', desc: 'Defina quanto vale o seu tempo e receba o aviso', to: '/painel-motorista?aba=plano' },
                    { icon: <Car size={16} />, title: 'Veículo e tarifa', desc: 'Sua tarifa própria e os dados do veículo', to: '/painel-motorista?aba=veiculo' },
                ].map((l, i) => (
                    <button key={l.to} onClick={() => router.push(l.to)} className="w-full flex items-center gap-3 p-3.5 text-left active:opacity-70" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#f9731620', color: '#f97316' }}>{l.icon}</span>
                        <span className="flex-1 min-w-0"><span className="block text-[13px] font-black">{l.title}</span><span className="block text-[11px]" style={{ color: colors.textSecondary }}>{l.desc}</span></span>
                        <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                    </button>
                ))}
            </div>
        </div>
    )
}
