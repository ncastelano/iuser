'use client'

// O gráfico das vendas do cartão "Como está o dia" do painel da loja (3.0), com os pedidos PAGOS de verdade:
// Hoje = uma barra por hora · Semana = uma por dia (domingo a sábado) · Mês = uma fininha por dia (os dias que ainda não chegaram são pontinhos).
// Tocar numa barra mostra o valor; sem tocar, aparece a melhor. As barras crescem ao trocar de período. Mesmo desenho do laboratório /painel-teste.
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/app/contexts/theme'

export type SalesPeriod = 'hoje' | 'semana' | 'mes'
export interface PaidOrder { amount: number; at: string }

const ORANGE = '#f97316'
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface Bar { rot: string; titulo: string; v: number | null; n: number }

/** as barras do período (puro, testável) */
export function salesBars(orders: PaidOrder[], period: SalesPeriod, now = new Date()): Bar[] {
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (period === 'hoje') {
        return Array.from({ length: 24 }, (_, h) => {
            const os = orders.filter((o) => { const d = new Date(o.at); return d >= day0 && d.getHours() === h })
            return { rot: `${h}h`, titulo: `${h}h às ${h + 1}h`, v: h > now.getHours() ? null : os.reduce((t, o) => t + o.amount, 0), n: os.length }
        })
    }
    if (period === 'semana') {
        // a semana começa no DOMINGO, igual ao total "Semana" do mesmo cartão (startOfCurrentWeek do painel)
        const monday = new Date(day0); monday.setDate(day0.getDate() - day0.getDay())
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday); d.setDate(monday.getDate() + i)
            const next = new Date(d); next.setDate(d.getDate() + 1)
            const os = orders.filter((o) => { const t = new Date(o.at); return t >= d && t < next })
            return { rot: SEM[d.getDay()].slice(0, 1).toUpperCase(), titulo: `${cap(SEM[d.getDay()])}, ${d.getDate()}/${d.getMonth() + 1}`, v: d > day0 ? null : os.reduce((t, o) => t + o.amount, 0), n: os.length }
        })
    }
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return Array.from({ length: days }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), i + 1)
        const next = new Date(d); next.setDate(d.getDate() + 1)
        const os = orders.filter((o) => { const t = new Date(o.at); return t >= d && t < next })
        return { rot: String(i + 1), titulo: `${cap(SEM[d.getDay()])}, ${i + 1}/${d.getMonth() + 1}`, v: d > day0 ? null : os.reduce((t, o) => t + o.amount, 0), n: os.length }
    })
}

export default function SalesChart({ orders, period }: { orders: PaidOrder[]; period: SalesPeriod }) {
    const { colors } = useTheme()
    const bars = useMemo(() => salesBars(orders, period), [orders, period])
    const max = Math.max(1, ...bars.map((b) => b.v || 0))
    const best = bars.reduce((m, b, i) => ((b.v || 0) > (bars[m].v || 0) ? i : m), 0)
    const [sel, setSel] = useState<number | null>(null)
    useEffect(() => setSel(null), [period])
    const i = sel ?? best
    const b = bars[i]
    const empty = bars.every((x) => !x.v)
    const rotulos = period === 'hoje' ? [0, 6, 12, 18, 23] : period === 'semana' ? [0, 1, 2, 3, 4, 5, 6] : [0, 14, bars.length - 1]
    return (
        <div className="min-w-0" style={{ width: 190 }}>
            <style>{`@keyframes painelCresce { from { transform: scaleY(0) } to { transform: scaleY(1) } } @media (prefers-reduced-motion: reduce) { .painel-barra { animation: none !important } }`}</style>
            <div key={period} className="flex items-end h-[64px]" style={{ gap: period === 'semana' ? 6 : 2 }}>
                {bars.map((x, j) => {
                    const futuro = x.v === null
                    return (
                        <button key={j} onClick={() => setSel(j)} aria-label={`${x.titulo}: ${futuro ? 'ainda não chegou' : brl(x.v || 0)}`} className="flex-1 h-full flex items-end min-w-0">
                            <span className="painel-barra block w-full rounded-t" style={{ height: futuro ? 3 : Math.max(3, ((x.v || 0) / max) * 62), background: futuro ? colors.border : j === i && !empty ? ORANGE : `${ORANGE}55`, transformOrigin: 'bottom', animation: `painelCresce .5s ${Math.min(j * 18, 500)}ms ease-out backwards`, opacity: futuro ? 0.7 : 1 }} />
                        </button>
                    )
                })}
            </div>
            <div className="relative h-3.5 mt-1">
                {rotulos.map((j) => <span key={j} className="absolute text-[9.5px] font-bold -translate-x-1/2" style={{ left: `${((j + 0.5) / bars.length) * 100}%`, color: j === i ? ORANGE : colors.textSecondary }}>{bars[j].rot}</span>)}
            </div>
            <p className="text-[11px] font-black mt-1.5 leading-tight text-right" style={{ color: colors.textPrimary }}>{empty ? 'sem vendas no período' : b.v === null ? 'ainda não chegou' : `${b.titulo} · ${brl(b.v)}`}</p>
            {!empty && b.v !== null && <p className="text-[10.5px] leading-tight text-right" style={{ color: colors.textSecondary }}>{b.n} {b.n === 1 ? 'venda' : 'vendas'}{i === best && sel === null ? ' · o melhor' : ''}</p>}
        </div>
    )
}
