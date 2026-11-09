// src/app/(main)/painel-teste/Desempenho.tsx — o bloco "Desempenho" do laboratório /painel-teste (só teste, dados de EXEMPLO, nada lê nem grava).
// A loja tem um FOCO — produtos, conteúdos digitais ou serviços — e cada foco responde a uma pergunta diferente:
//   · produtos  → o que está VENDENDO (e o que está acabando);
//   · digitais  → o que as pessoas ESTÃO VENDO (visualizações, conclusão, onde param);
//   · serviços  → como está a AGENDA e QUAIS SERVIÇOS eu poderia oferecer (o que as pessoas pedem perto e a loja ainda não atende).
// Cada um começa com três INDICADORES DE QUALIDADE com semáforo (ok / atenção) e a meta ao lado. Loja de foco misto troca entre os três.
'use client'

import { ReactNode, useState } from 'react'
import { AlertTriangle, CalendarDays, ChevronRight, Eye, GraduationCap, Lightbulb, Package, Search, TrendingUp } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'

export type Foco = 'produtos' | 'digitais' | 'servicos'
const COR: Record<Foco, string> = { produtos: '#f97316', digitais: '#8b5cf6', servicos: '#14b8a6' }
const NOME: Record<Foco, string> = { produtos: 'Produtos', digitais: 'Digitais', servicos: 'Serviços' }
const ICO: Record<Foco, ReactNode> = { produtos: <Package size={14} />, digitais: <GraduationCap size={14} />, servicos: <CalendarDays size={14} /> }
type St = 'ok' | 'atencao'
const SEMAFORO: Record<St, string> = { ok: '#16a34a', atencao: '#f59e0b' }

const PERGUNTA: Record<Foco, string> = {
    produtos: 'O que está vendendo e o que está acabando',
    digitais: 'O que as pessoas estão vendo e onde param',
    servicos: 'Como está a agenda e que serviços oferecer',
}

interface Q { l: string; v: string; meta: string; st: St }
const QUALIDADE: Record<Foco, Q[]> = {
    produtos: [{ l: 'Nota', v: '4,6 ★', meta: 'meta 4,5', st: 'ok' }, { l: 'Preparo', v: '22 min', meta: 'meta até 30', st: 'ok' }, { l: 'Cancelados', v: '2%', meta: 'meta até 3%', st: 'ok' }],
    digitais: [{ l: 'Nota', v: '4,7 ★', meta: 'meta 4,5', st: 'ok' }, { l: 'Conclusão', v: '64%', meta: 'meta 60%', st: 'ok' }, { l: 'Pix não visto', v: '2', meta: 'liberar em 1 dia', st: 'atencao' }],
    servicos: [{ l: 'Nota', v: '4,8 ★', meta: 'meta 4,5', st: 'ok' }, { l: 'Agenda cheia', v: '68%', meta: 'meta 70%', st: 'atencao' }, { l: 'Faltas', v: '4%', meta: 'meta até 3%', st: 'atencao' }],
}

export default function Desempenho({ c, focos, calmo, onIr }: { c: ThemeColors; focos: Foco[]; calmo: boolean; onIr: (k: string) => void }) {
    const [aba, setAba] = useState<Foco>(focos[0])
    const f = focos.includes(aba) ? aba : focos[0]
    const cor = COR[f]
    const k = calmo ? 0.4 : 1
    const n = (v: number) => Math.round(v * k).toLocaleString('pt-BR')
    const card = { background: c.surface, border: `1px solid ${c.border}` }
    const titulo = (t: string, ic?: ReactNode) => <p className="text-[11px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: c.textSecondary }}>{ic}{t}</p>
    const barra = (pct: number, cc: string) => <span className="block h-2 rounded-full overflow-hidden" style={{ background: `${c.border}70` }}><span className="block h-full rounded-full" style={{ width: `${Math.max(4, pct)}%`, background: cc }} /></span>
    const insight = (ic: ReactNode, tom: string, t: string, txt: string, cta: string, ir: string) => (
        <button onClick={() => onIr(ir)} className="w-full text-left rounded-3xl p-3.5 flex gap-3 active:scale-[.99] transition" style={{ background: `${tom}14`, border: `1.5px solid ${tom}55` }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${tom}30`, color: tom }}>{ic}</span>
            <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-black leading-tight">{t}</span><span className="block text-[12px] leading-snug mt-0.5">{txt}</span><span className="text-[12px] font-black mt-1.5 flex items-center gap-0.5" style={{ color: tom }}>{cta}<ChevronRight size={13} /></span></span>
        </button>
    )
    const rank = (lista: [string, string, number][], cc: string) => (
        <div className="space-y-2.5">{lista.map(([nm, vl, pct], i) => (
            <div key={nm}><div className="flex items-baseline gap-2 text-[12.5px]"><span className="w-4 font-black" style={{ color: cc }}>{i + 1}</span><span className="flex-1 min-w-0 truncate font-bold">{nm}</span><span className="font-black">{vl}</span></div><div className="pl-6 mt-1">{barra(pct, cc)}</div></div>
        ))}</div>
    )

    return (
        <div>
            {focos.length > 1 && (
                <div className="flex gap-1.5 mb-3 p-1 rounded-full" style={{ background: `${c.border}40` }}>
                    {focos.map((x) => (
                        <button key={x} onClick={() => setAba(x)} className="flex-1 h-9 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 transition active:scale-95" style={f === x ? { background: COR[x], color: '#fff' } : { color: c.textSecondary }}>{ICO[x]}{NOME[x]}</button>
                    ))}
                </div>
            )}
            <p className="text-[12px] font-semibold mb-2.5 px-0.5" style={{ color: c.textSecondary }}>{PERGUNTA[f]}</p>

            {/* indicadores de qualidade: semáforo + a meta ao lado */}
            <div className="grid grid-cols-3 gap-2 mb-3">
                {QUALIDADE[f].map((q) => (
                    <div key={q.l} className="rounded-2xl px-3 py-2.5" style={{ ...card, borderTop: `3px solid ${SEMAFORO[q.st]}` }}>
                        <p className="text-[10.5px] font-bold flex items-center gap-1" style={{ color: c.textSecondary }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: SEMAFORO[q.st] }} />{q.l}</p>
                        <p className="text-[18px] font-black leading-tight mt-0.5">{q.v}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: q.st === 'ok' ? c.textSecondary : '#b45309' }}>{q.meta}</p>
                    </div>
                ))}
            </div>

            {f === 'produtos' && (
                <div className="space-y-3">
                    <div className="rounded-3xl p-3.5" style={card}>
                        {titulo('Mais vendidos da semana', <TrendingUp size={13} />)}
                        {rank([['Pizza Margherita (grande)', `${n(48)} un · R$ ${n(2875).replace('.', '')}`, 100], ['Combo Casal', `${n(31)} un · R$ ${n(2164)}`, 66], ['Pizza Quatro Queijos (grande)', `${n(27)} un · R$ ${n(1890)}`, 56]], cor)}
                    </div>
                    <div className="rounded-3xl p-3.5" style={card}>
                        {titulo('Horário de pico')}
                        <div className="flex items-end gap-1.5 h-14">{[['18h', 25], ['19h', 55], ['20h', 100], ['21h', 90], ['22h', 60], ['23h', 30]].map(([h, v]) => <div key={String(h)} className="flex-1 flex flex-col items-center gap-1"><span className="w-full rounded-t" style={{ height: `${(v as number) * 0.4 * (calmo ? 0.5 : 1)}px`, background: v === 100 ? cor : `${cor}55` }} /><span className="text-[9.5px] font-bold" style={{ color: c.textSecondary }}>{h as string}</span></div>)}</div>
                        <p className="text-[11.5px] mt-2" style={{ color: c.textSecondary }}>Sextas, das 20h às 22h, concentram metade dos pedidos.</p>
                    </div>
                    {insight(<AlertTriangle size={17} />, '#f59e0b', 'Estoque pedindo atenção', 'Pizza Camarão tem só 3 e a Banana com Canela está esgotada — pedidos perdidos nos dois.', 'Repor no catálogo', 'cat')}
                </div>
            )}

            {f === 'digitais' && (
                <div className="space-y-3">
                    <div className="rounded-3xl p-3.5" style={card}>
                        {titulo('Visualizações · 7 dias', <Eye size={13} />)}
                        <div className="flex items-end justify-between">
                            <div><p className="text-[28px] font-black leading-none">{n(8420)}</p><p className="text-[12px] font-bold mt-1" style={{ color: '#16a34a' }}>▲ 18% sobre a semana anterior</p></div>
                            <div className="flex items-end gap-1 h-12">{[40, 52, 48, 70, 66, 90, 100].map((h, i) => <span key={i} className="w-2.5 rounded-t" style={{ height: `${h * 0.46 * (calmo ? 0.5 : 1)}px`, background: i === 6 ? cor : `${cor}55` }} />)}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 text-center" style={{ borderTop: `1px solid ${c.border}` }}>
                            {[['Aulas', n(5980)], ['Músicas', n(1920)], ['Downloads', n(520)]].map(([l, v]) => <div key={l}><p className="text-[15px] font-black leading-none">{v}</p><p className="text-[10px] font-bold mt-1" style={{ color: c.textSecondary }}>{l}</p></div>)}
                        </div>
                    </div>
                    <div className="rounded-3xl p-3.5" style={card}>
                        {titulo('O que mais prende', <TrendingUp size={13} />)}
                        {rank([['Curso Pizza Napolitana', `${n(4210)} · 64% concluem`, 100], ['Receitas de molho (PDF grátis)', `${n(2110)} baixados`, 50], ['E-book “Massa perfeita”', `${n(2100)} abertos`, 50]], cor)}
                    </div>
                    <div className="rounded-3xl p-3.5" style={card}>
                        {titulo('Do olhar à compra')}
                        {[['Viram a página', n(3120), 100], ['Pegaram ou compraram', n(214), 7], ['Voltaram depois', n(103), 3]].map(([l, v, p]) => <div key={String(l)} className="mb-2 last:mb-0"><div className="flex justify-between text-[12px] font-bold mb-1"><span>{l as string}</span><span>{v as string}</span></div>{barra(p as number, cor)}</div>)}
                        <p className="text-[11.5px] mt-2" style={{ color: c.textSecondary }}>6,9% de quem vê, pega ou compra.</p>
                    </div>
                    {insight(<Lightbulb size={17} />, cor, 'A aula 5 perde 38% de quem assiste', 'É onde as pessoas mais abandonam o curso. Um vídeo mais curto ali costuma segurar mais gente.', 'Ver as aulas', 'cat-dig')}
                </div>
            )}

            {f === 'servicos' && (
                <div className="space-y-3">
                    <div className="rounded-3xl p-3.5" style={card}>
                        {titulo('Mais agendados · 30 dias', <TrendingUp size={13} />)}
                        {rank([['Rodízio adulto', `${n(34)} · R$ ${n(2717)}`, 100], ['Mesa no mezanino', `${n(12)} · R$ ${n(1440)}`, 35], ['Ambiente VIP (4 horas)', `${n(3)} · R$ ${n(1440)}`, 9]], cor)}
                    </div>
                    {insight(<CalendarDays size={17} />, '#f59e0b', 'Quartas à noite estão vazias', 'Só 20% dos horários de quarta são agendados. Uma promoção nesse dia enche a agenda.', 'Criar uma promoção', 'pro')}
                    <div className="rounded-3xl p-3.5" style={{ background: `${cor}10`, border: `1.5px solid ${cor}44` }}>
                        {titulo('Serviços que você poderia oferecer', <Search size={13} />)}
                        <p className="text-[12px] leading-snug mb-2.5">Pedidos de pessoas <b>perto da loja</b>, nos últimos 30 dias, que nenhum dos seus serviços atende:</p>
                        <div className="space-y-2">
                            {[['Pizza para eventos e festas', '14 pedidos', 100], ['Rodízio em domicílio', '9 pedidos', 64], ['Aula de pizza (workshop)', '6 pedidos', 43]].map(([nm, p, pc]) => (
                                <div key={String(nm)} className="rounded-2xl p-2.5 flex items-center gap-2.5" style={{ background: c.background, border: `1px solid ${c.border}` }}>
                                    <div className="min-w-0 flex-1"><p className="text-[13px] font-black leading-tight">{nm as string}</p><div className="flex items-center gap-2 mt-1.5">{barra(pc as number, cor)}<span className="text-[11px] font-bold flex-shrink-0" style={{ color: c.textSecondary }}>{p as string}</span></div></div>
                                    <button onClick={() => onIr('srv')} className="h-9 px-3 rounded-full text-[11.5px] font-black text-white flex-shrink-0 active:scale-95" style={{ background: cor }}>Oferecer</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
