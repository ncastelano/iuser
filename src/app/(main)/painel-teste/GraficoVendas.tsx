// src/app/(main)/painel-teste/GraficoVendas.tsx — o gráfico das vendas do cartão "Como está o dia" (laboratório /painel-teste, dados de EXEMPLO).
// Hoje = uma barrinha por HORA do dia · Semana = uma por DIA (qual vendeu mais) · Mês = uma por dia do mês, bem fininhas (os dias que ainda
// não chegaram ficam como pontinhos), mantendo o mesmo tamanho do cartão. Tocar numa barra mostra o valor; por padrão aparece a melhor.
// Os números vêm do MESMO extrato da página "Abrir o extrato completo" (`resumo`), então nada se contradiz.
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ThemeColors } from '@/app/contexts/theme'
import { ORANGE, brl } from './dados'
import { resumo, type PeriodoRes } from './Extrato'

interface Barra { rot: string; titulo: string; v: number | null; n: number; marca?: boolean }

function serie(periodo: PeriodoRes): Barra[] {
    const r = resumo(periodo)
    const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
    if (periodo === 'hoje') {
        return Array.from({ length: 12 }, (_, i) => {
            const h = 11 + i
            const l = r.lancs.filter((x) => parseInt(x.hora.slice(0, 2), 10) === h)
            return { rot: `${h}h`, titulo: `${h}h às ${h + 1}h`, v: l.reduce((t, x) => t + x.valor, 0), n: l.length }
        })
    }
    if (periodo === 'semana') {
        return [6, 5, 4, 3, 2, 1, 0].map((d) => {
            const dt = new Date(2026, 10, 9 - d)
            const p = r.porDia.find((x) => x.dia === d)!
            return { rot: sem[dt.getDay()].slice(0, 1).toUpperCase(), titulo: `${sem[dt.getDay()].charAt(0).toUpperCase() + sem[dt.getDay()].slice(1)}, ${dt.getDate()} de nov.`, v: p.total, n: p.n, marca: d === 0 }
        })
    }
    return Array.from({ length: 30 }, (_, i) => {
        const dia = i + 1, d = 9 - dia
        const p = d >= 0 ? r.porDia.find((x) => x.dia === d) : undefined
        const dt = new Date(2026, 10, dia)
        return { rot: String(dia), titulo: `${sem[dt.getDay()].charAt(0).toUpperCase() + sem[dt.getDay()].slice(1)}, ${dia} de nov.`, v: p ? p.total : null, n: p ? p.n : 0, marca: d === 0 }
    })
}

export default function GraficoVendas({ periodo, alvo, nova, c }: { periodo: PeriodoRes; alvo: number; nova: boolean; c: ThemeColors }) {
    const base = useMemo(() => serie(periodo), [periodo])
    const soma = base.reduce((t, b) => t + (b.v || 0), 0)
    const k = nova ? 0 : soma > 0 ? alvo / soma : 1            // dia tranquilo/loja nova: as barras mantêm o formato e fecham com o total do cartão
    const barras = base.map((b) => ({ ...b, v: b.v === null ? null : b.v * k }))
    const max = Math.max(1, ...barras.map((b) => b.v || 0))
    const melhor = barras.reduce((m, b, i) => ((b.v || 0) > (barras[m].v || 0) ? i : m), 0)
    const [sel, setSel] = useState<number | null>(null)
    useEffect(() => setSel(null), [periodo])
    const i = sel ?? melhor
    const b = barras[i]
    const fino = periodo === 'mes'
    const rotulos = periodo === 'hoje' ? [0, 4, 8, 11] : periodo === 'semana' ? [0, 1, 2, 3, 4, 5, 6] : [0, 14, 29]
    return (
        <div className="min-w-0" style={{ width: fino ? 190 : 170 }}>
            <style>{`@keyframes labCresce { from { transform: scaleY(0) } to { transform: scaleY(1) } } @media (prefers-reduced-motion: reduce) { .lab-barra { animation: none !important } }`}</style>
            <div key={periodo} className="flex items-end h-[64px]" style={{ gap: fino ? 2 : periodo === 'hoje' ? 3 : 6 }}>
                {barras.map((x, j) => {
                    const futuro = x.v === null
                    const ativo = j === i
                    return (
                        <button key={j} onClick={() => setSel(j)} aria-label={`${x.titulo}: ${futuro ? 'ainda não chegou' : brl(x.v || 0)}`} className="flex-1 h-full flex items-end min-w-0">
                            <span className="lab-barra block w-full rounded-t" style={{ height: futuro ? 3 : Math.max(4, ((x.v || 0) / max) * 62), background: futuro ? `${c.border}` : ativo ? ORANGE : x.marca ? `${ORANGE}aa` : `${ORANGE}55`, transformOrigin: 'bottom', animation: `labCresce .5s ${Math.min(j * 22, 500)}ms ease-out backwards`, opacity: futuro ? 0.7 : 1 }} />
                        </button>
                    )
                })}
            </div>
            <div className="relative h-3.5 mt-1">
                {rotulos.map((j) => <span key={j} className="absolute text-[9.5px] font-bold -translate-x-1/2" style={{ left: `${((j + 0.5) / barras.length) * 100}%`, color: j === i ? ORANGE : c.textSecondary }}>{barras[j].rot}</span>)}
            </div>
            <p className="text-[11px] font-black mt-1.5 leading-tight text-right" style={{ color: c.textPrimary }}>{b.v === null ? 'ainda não chegou' : nova ? 'sem vendas ainda' : `${b.titulo} · ${brl(b.v)}`}</p>
            <p className="text-[10.5px] leading-tight text-right" style={{ color: c.textSecondary }}>{b.v === null || nova ? '' : `${b.n} ${b.n === 1 ? 'venda' : 'vendas'}${i === melhor && sel === null ? ' · o melhor' : ''}`}</p>
        </div>
    )
}
