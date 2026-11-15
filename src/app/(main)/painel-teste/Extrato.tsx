// src/app/(main)/painel-teste/Extrato.tsx — a página "Abrir o extrato completo" do laboratório do painel (só teste, dados de exemplo).
// Todo o dinheiro que entrou na loja, por período, com filtro por tipo (pedidos, balcão, serviços, digital, apoios), total, forma de pagamento
// e exportação. O iUser REGISTRA o que a loja recebeu; o dinheiro cai direto na conta dela (Pix, cartão ou na porta).
'use client'

import { ReactNode, useMemo, useState } from 'react'
import { Banknote, CalendarDays, ClipboardList, Download, FileText, GraduationCap, Heart, Store, Wallet } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { C, ORANGE, brl } from './dados'
import { PaginaCasca, useAviso } from './labui'

type Tipo = 'pedido' | 'balcao' | 'servico' | 'digital' | 'apoio'
type Forma = 'Pix' | 'Cartão' | 'Dinheiro'
interface Lanc { dia: number; hora: string; tipo: Tipo; desc: string; quem: string; forma: Forma; valor: number }

const TIPOS: Record<Tipo, { nome: string; cor: string; ic: ReactNode }> = {
    pedido: { nome: 'Pedidos', cor: C.novo, ic: <ClipboardList size={15} /> },
    balcao: { nome: 'Balcão', cor: ORANGE, ic: <Store size={15} /> },
    servico: { nome: 'Serviços', cor: C.servico, ic: <CalendarDays size={15} /> },
    digital: { nome: 'Digital', cor: C.pronto, ic: <GraduationCap size={15} /> },
    apoio: { nome: 'Apoios', cor: '#8b5cf6', ic: <Heart size={15} /> },
}
const FORMAS: Forma[] = ['Pix', 'Cartão', 'Dinheiro']
const FORMA_COR: Record<Forma, string> = { Pix: '#22c55e', Cartão: '#3b82f6', Dinheiro: '#eab308' }

// dados de exemplo gerados sem sorteio (sempre os mesmos): 9 dias, com a mistura de tipos de uma pizzaria
function gerar(): Lanc[] {
    const nomes = ['carla-cavalcanti', 'ana-barbosa', 'joao-martins', 'breno-oliveira', 'mateus-pinto', 'marta-moura', 'heitor-martins', 'larissa-castro', 'pedro-lima', 'bia-santos']
    const pizzas = ['Pizza Portuguesa (grande)', 'Combo Casal', 'Pizza Margherita (grande)', 'Pizza Quatro Queijos', 'Pizza Calabresa + Borda', 'Combo Família']
    const out: Lanc[] = []
    let s = 7
    const r = (n: number) => { s = (s * 9301 + 49297) % 233280; return Math.floor((s / 233280) * n) }
    for (let d = 0; d < 9; d++) {
        const n = 7 + r(4)
        for (let i = 0; i < n; i++) {
            const t = r(100)
            const tipo: Tipo = t < 55 ? 'pedido' : t < 75 ? 'balcao' : t < 87 ? 'servico' : t < 95 ? 'digital' : 'apoio'
            const h = String(11 + r(12)).padStart(2, '0'), m = String(r(60)).padStart(2, '0')
            const quem = '@' + nomes[r(nomes.length)]
            const forma: Forma = tipo === 'balcao' ? FORMAS[r(3)] : tipo === 'apoio' || tipo === 'digital' ? 'Pix' : FORMAS[r(10) < 5 ? 0 : r(10) < 8 ? 1 : 2]
            const valor = tipo === 'pedido' ? 55 + r(150) + 0.9 : tipo === 'balcao' ? 28 + r(90) + 0.5 : tipo === 'servico' ? [36, 90, 144][r(3)] : tipo === 'digital' ? [19.9, 49.9][r(2)] : [5, 10, 20, 50][r(4)]
            const desc = tipo === 'pedido' ? pizzas[r(pizzas.length)] : tipo === 'balcao' ? `Venda no balcão · ${1 + r(3)} itens` : tipo === 'servico' ? ['Entrada · Ambiente VIP', 'Entrada · Rodízio', 'Entrada · Mesa mezanino'][r(3)] : tipo === 'digital' ? ['Curso Pizza Napolitana', 'E-book Massa perfeita'][r(2)] : 'Apoio ao artista'
            out.push({ dia: d, hora: `${h}:${m}`, tipo, desc, quem: tipo === 'balcao' ? 'cliente do balcão' : quem, forma, valor })
        }
    }
    return out.sort((a, b) => a.dia - b.dia || b.hora.localeCompare(a.hora))
}
const TODOS = gerar()

export type PeriodoRes = 'hoje' | 'semana' | 'mes'
const DIAS_DO: Record<PeriodoRes, number[]> = { hoje: [0], semana: [0, 1, 2, 3, 4, 5, 6], mes: [0, 1, 2, 3, 4, 5, 6, 7, 8] }
/** Os números do período (os MESMOS que a página do extrato lista): o painel usa isto para não contradizer o extrato. */
export function resumo(p: PeriodoRes) {
    const lancs = TODOS.filter((l) => DIAS_DO[p].includes(l.dia))
    const total = lancs.reduce((t, l) => t + l.valor, 0)
    const vendas = lancs.filter((l) => l.tipo === 'pedido' || l.tipo === 'balcao').length
    const porForma = Object.fromEntries(FORMAS.map((f) => [f, lancs.filter((l) => l.forma === f).reduce((t, l) => t + l.valor, 0)])) as Record<Forma, number>
    const porDia = DIAS_DO[p].map((d) => ({ dia: d, n: lancs.filter((l) => l.dia === d).length, total: lancs.filter((l) => l.dia === d).reduce((t, l) => t + l.valor, 0) }))
    return { lancs, total, vendas, porForma, porDia }
}
export const diaNome = (d: number) => {
    const dt = new Date(2026, 10, 9 - d)
    const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dt.getDay()]
    return `${d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : sem.charAt(0).toUpperCase() + sem.slice(1)} · ${dt.getDate()} de nov.`
}

export default function Extrato({ onClose }: { onClose: () => void }) {
    const { colors, } = useTheme()
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const [periodo, setPeriodo] = useState<'hoje' | 'ontem' | 'semana' | 'mes'>('semana')
    const [tipo, setTipo] = useState<Tipo | 'tudo'>('tudo')
    const { mostrar, node } = useAviso()
    const dias = periodo === 'hoje' ? [0] : periodo === 'ontem' ? [1] : periodo === 'semana' ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6, 7, 8]
    const doPeriodo = useMemo(() => TODOS.filter((l) => dias.includes(l.dia)), [periodo]) // eslint-disable-line react-hooks/exhaustive-deps
    const lista = tipo === 'tudo' ? doPeriodo : doPeriodo.filter((l) => l.tipo === tipo)
    const total = lista.reduce((t, l) => t + l.valor, 0)
    const porForma = FORMAS.map((f) => [f, lista.filter((l) => l.forma === f).reduce((t, l) => t + l.valor, 0)] as const)
    const grupos = dias.filter((d) => lista.some((l) => l.dia === d))

    return (
        <PaginaCasca titulo="Extrato" sub="Tudo que entrou na loja" cor={C.novo} icone={<Wallet size={18} />} onClose={onClose}
            rodape={(
                <div className="flex gap-2">
                    <button onClick={() => mostrar('PDF do extrato gerado (exemplo)')} className="flex-1 h-12 rounded-full text-[13px] font-black text-white flex items-center justify-center gap-1.5 active:scale-95" style={{ background: ORANGE }}><FileText size={16} />Baixar PDF</button>
                    <button onClick={() => mostrar('Planilha CSV gerada (exemplo)')} className="flex-1 h-12 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${colors.border}` }}><Download size={16} />Planilha</button>
                </div>
            )}>
            {node}
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                {([['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', '7 dias'], ['mes', 'Novembro']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setPeriodo(k)} className="h-10 px-4 rounded-full text-[12.5px] font-black flex-shrink-0 active:scale-95" style={periodo === k ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}` }}>{l}</button>
                ))}
                <button onClick={() => mostrar('Escolher datas (exemplo)')} className="h-10 px-4 rounded-full text-[12.5px] font-black flex-shrink-0 flex items-center gap-1.5" style={{ border: `1px dashed ${colors.border}` }}><CalendarDays size={14} />Datas</button>
            </div>

            <div className="rounded-3xl p-4 mt-3" style={card}>
                <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>Recebido no período</p>
                <p className="text-[30px] font-black leading-tight">{brl(total)}</p>
                <p className="text-[12px]" style={{ color: colors.textSecondary }}>{lista.length} lançamentos · média de {brl(lista.length ? total / lista.length : 0)}</p>
                <div className="flex h-2.5 rounded-full overflow-hidden mt-3" style={{ background: `${colors.border}60` }}>
                    {porForma.map(([f, v]) => <span key={f} style={{ width: `${total ? (v / total) * 100 : 0}%`, background: FORMA_COR[f] }} />)}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2.5">
                    {porForma.map(([f, v]) => <div key={f}><p className="text-[10px] font-bold flex items-center gap-1" style={{ color: FORMA_COR[f] }}><span className="w-2 h-2 rounded-full" style={{ background: FORMA_COR[f] }} />{f}</p><p className="text-[13.5px] font-black">{brl(v)}</p></div>)}
                </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 mt-3 pb-1" style={{ scrollbarWidth: 'none' }}>
                <button onClick={() => setTipo('tudo')} className="h-9 px-3.5 rounded-full text-[12px] font-black flex-shrink-0" style={tipo === 'tudo' ? { background: colors.textPrimary, color: colors.background } : { border: `1px solid ${colors.border}` }}>Tudo {doPeriodo.length}</button>
                {(Object.keys(TIPOS) as Tipo[]).map((t) => {
                    const n = doPeriodo.filter((l) => l.tipo === t).length
                    return <button key={t} onClick={() => setTipo(t)} className="h-9 px-3.5 rounded-full text-[12px] font-black flex-shrink-0 flex items-center gap-1.5" style={tipo === t ? { background: TIPOS[t].cor, color: '#fff' } : { border: `1px solid ${colors.border}` }}>{TIPOS[t].nome} {n}</button>
                })}
            </div>

            <div className="mt-2 space-y-4">
                {grupos.length === 0 && <p className="text-center text-[13px] font-bold py-8" style={{ color: colors.textSecondary }}>Nada recebido neste período.</p>}
                {grupos.map((d) => {
                    const dia = lista.filter((l) => l.dia === d)
                    return (
                        <div key={d}>
                            <p className="text-[12px] font-black flex items-center mb-1.5"><span>{diaNome(d)}</span><span className="ml-auto" style={{ color: colors.textSecondary }}>{brl(dia.reduce((t, l) => t + l.valor, 0))}</span></p>
                            <div className="rounded-3xl overflow-hidden" style={card}>
                                {dia.map((l, i) => (
                                    <div key={i} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                                        <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${TIPOS[l.tipo].cor}22`, color: TIPOS[l.tipo].cor }}>{TIPOS[l.tipo].ic}</span>
                                        <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-black leading-tight truncate">{l.desc}</span><span className="block text-[11px] leading-tight truncate" style={{ color: colors.textSecondary }}>{l.hora} · {l.quem}</span></span>
                                        <span className="text-right"><span className="block text-[13px] font-black">{brl(l.valor)}</span><span className="flex items-center justify-end gap-1 text-[10px] font-bold" style={{ color: FORMA_COR[l.forma] }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: FORMA_COR[l.forma] }} />{l.forma}</span></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
            <p className="text-[11px] leading-snug mt-4" style={{ color: colors.textSecondary }}><Banknote size={12} className="inline mr-1" />O iUser registra a venda; o dinheiro cai direto na sua conta (Pix, cartão ou na porta). Repasses e apoios entram aqui depois de confirmados por você.</p>
        </PaginaCasca>
    )
}
