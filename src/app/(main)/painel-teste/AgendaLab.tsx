// src/app/(main)/painel-teste/AgendaLab.tsx
//
// A PÁGINA "VER AGENDA" do laboratório /painel-teste (só teste, dados de exemplo, nada grava). Hoje a agenda da loja
// (`/compromissos/<slug>`) empilha todos os dias numa rolagem só (≈ 36.800 px no celular da pizzaria) e mostra uma lista de cartões iguais.
// A proposta: UM DIA POR VEZ, como linha do tempo (com os buracos livres à vista), três abas — Agenda · Pendentes · Horários — e as
// regras (entrada, agenda ligada) atrás da engrenagem, sem poluir.
'use client'

import { ReactNode, useState } from 'react'
import { Bell, CalendarClock, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, MessageCircle, Plus, Settings, X } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'

const C = { ok: '#16a34a', ambar: '#f59e0b', feito: '#3b82f6', agora: '#22c55e', serv: '#14b8a6', alerta: '#ef4444' }
type St = 'feito' | 'agora' | 'confirmado' | 'conferir'
interface Ag { id: string; ini: string; fim: string; servico: string; quem: string; entrada: string; st: St }

const POOL: Omit<Ag, 'ini' | 'fim' | 'st'>[] = [
    { id: 'a', servico: 'Rodízio de Pizza — Criança', quem: 'Mateus Carvalho', entrada: 'Entrada R$ 36,00 paga' },
    { id: 'b', servico: 'Mesa Exclusiva no Mezanino', quem: 'Camila Lima', entrada: 'Entrada R$ 36,00 paga' },
    { id: 'c', servico: 'Rodízio de Pizza — Criança', quem: 'Larissa Castro', entrada: 'Entrada R$ 36,00 informada' },
    { id: 'd', servico: 'Confraternização — Ambiente VIP (4 h)', quem: 'Carla Martins', entrada: 'Entrada R$ 144,00 paga' },
    { id: 'e', servico: 'Rodízio de Pizza — Adulto', quem: 'Natália Silva', entrada: 'Sem entrada' },
    { id: 'f', servico: 'Aluguel do Ambiente VIP (3 h)', quem: 'Hugo Silva', entrada: 'Entrada R$ 90,00 paga' },
]
const SLOTS: [string, string][] = [['12:00', '14:00'], ['15:30', '17:30'], ['17:30', '19:30'], ['20:30', '00:30']]
const DIAS = [['DOM', 8, 4], ['HOJE', 9, 4], ['TER', 10, 4], ['QUA', 11, 3], ['QUI', 12, 4], ['SEX', 13, 3], ['SÁB', 14, 3]] as const

function diaDe(i: number): Ag[] {
    const n = DIAS[i][2]
    return SLOTS.slice(0, n).map(([ini, fim], k) => {
        const base = POOL[(k + i) % POOL.length]
        const st: St = i === 1 ? (k === 0 ? 'feito' : k === 1 ? 'agora' : base.entrada.includes('informada') ? 'conferir' : 'confirmado') : i === 0 ? 'feito' : base.entrada.includes('informada') ? 'conferir' : 'confirmado'
        return { ...base, id: `${i}${k}`, ini, fim, st }
    })
}
const ST: Record<St, { l: string; c: string }> = { feito: { l: 'Feito', c: C.feito }, agora: { l: 'Agora', c: C.agora }, confirmado: { l: 'Confirmado', c: C.ok }, conferir: { l: 'Conferir entrada', c: C.ambar } }

export default function AgendaPagina({ c, cor, onConfig }: { c: ThemeColors; cor: string; onConfig: () => void }) {
    const [aba, setAba] = useState<'agenda' | 'pend' | 'hor'>('agenda')
    const [dia, setDia] = useState(1)
    const [aberto, setAberto] = useState<string | null>('b')
    const [pend, setPend] = useState(3)
    const lista = diaDe(dia)
    const card = { background: c.surface, border: `1px solid ${c.border}` }
    const pill = (on: boolean) => (on ? { background: cor, color: '#fff' } : { border: `1px solid ${c.border}`, color: c.textPrimary })

    // linha do tempo: cartões e, entre eles, o tempo livre
    const itens: ReactNode[] = []
    lista.forEach((a, i) => {
        const prev = lista[i - 1]
        if (prev && prev.fim < a.ini) itens.push(
            <div key={`l${a.id}`} className="flex items-center gap-3 pl-1">
                <span className="w-14 text-right text-[11px] font-bold flex-shrink-0" style={{ color: c.textSecondary }}>{prev.fim}</span>
                <button className="flex-1 h-10 rounded-2xl flex items-center justify-center gap-1.5 text-[11.5px] font-bold active:scale-[.98]" style={{ border: `1.5px dashed ${c.border}`, color: c.textSecondary }}><Plus size={13} />Livre até {a.ini} · agendar ou bloquear</button>
            </div>,
        )
        const s = ST[a.st]; const on = aberto === a.id
        itens.push(
            <div key={a.id} className="flex gap-3">
                <div className="w-14 text-right flex-shrink-0 pt-3 pl-1">
                    <p className="text-[15px] font-black leading-none">{a.ini}</p>
                    <p className="text-[10.5px] font-bold mt-1" style={{ color: c.textSecondary }}>{a.fim}</p>
                </div>
                <div className="flex-1 min-w-0 rounded-3xl overflow-hidden" style={{ ...card, borderLeft: `5px solid ${s.c}`, opacity: a.st === 'feito' ? 0.75 : 1 }}>
                    <button onClick={() => setAberto(on ? null : a.id)} className="w-full text-left px-3 py-2.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-black leading-tight truncate">{a.servico}</span>
                            <span className="block text-[12px] font-semibold leading-tight mt-0.5" style={{ color: c.textSecondary }}>{a.quem}</span>
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-black mt-1.5 px-2 py-0.5 rounded-full" style={{ background: `${s.c}22`, color: s.c }}>
                                {a.st === 'agora' && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: s.c }} />}{s.l}
                            </span>
                        </span>
                        <ChevronDown size={16} className={on ? 'rotate-180 transition' : 'transition'} style={{ color: c.textSecondary }} />
                    </button>
                    {on && (
                        <div className="px-3 pb-3 pt-1" style={{ borderTop: `1px solid ${c.border}` }}>
                            <p className="text-[12px] font-semibold mt-2 flex items-center gap-1.5"><Clock size={13} style={{ color: cor }} />{a.ini}–{a.fim} · {a.entrada}</p>
                            <p className="text-[11.5px] mt-1" style={{ color: c.textSecondary }}>3 visitas · nota 4,8 dada por outras lojas</p>
                            <div className="flex gap-1.5 mt-2.5">
                                {a.st === 'conferir' ? <button className="flex-1 h-10 rounded-full text-[12.5px] font-black text-white active:scale-95" style={{ background: C.ambar }}>Recebi a entrada</button>
                                    : a.st === 'feito' ? <button className="flex-1 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1" style={{ background: `${C.feito}22`, color: C.feito }}><Check size={14} />Avaliar o cliente</button>
                                        : <button className="flex-1 h-10 rounded-full text-[12.5px] font-black text-white active:scale-95" style={{ background: a.st === 'agora' ? C.ok : cor }}>{a.st === 'agora' ? 'Serviço feito' : 'Chegou'}</button>}
                                <button aria-label="Conversar" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}` }}><MessageCircle size={16} /></button>
                                <button aria-label="Cancelar" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}`, color: C.alerta }}><X size={16} /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>,
        )
    })

    return (
        <>
            {/* topo: abas + engrenagem */}
            <div className="flex items-center gap-1.5 mb-3">
                {([['agenda', 'Agenda', <CalendarDays key="a" size={14} />, 0], ['pend', 'Pendentes', <Bell key="b" size={14} />, pend], ['hor', 'Horários', <CalendarClock key="c" size={14} />, 0]] as const).map(([k, l, ic, n]) => (
                    <button key={k} onClick={() => setAba(k)} className="h-10 px-3.5 rounded-full text-[12.5px] font-black flex items-center gap-1.5 active:scale-95" style={pill(aba === k)}>
                        {ic}{l}{n > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] flex items-center justify-center text-white" style={{ background: aba === k ? 'rgba(255,255,255,.3)' : C.ambar }}>{k === 'pend' ? (pend >= 3 ? '40' : pend) : n}</span>}
                    </button>
                ))}
                <button onClick={onConfig} aria-label="Regras da agenda" className="ml-auto w-10 h-10 rounded-full flex items-center justify-center active:scale-90" style={{ border: `1px solid ${c.border}` }}><Settings size={17} /></button>
            </div>

            {aba === 'agenda' && (
                <>
                    <div className="flex items-center gap-2 mb-2">
                        <p className="text-[15px] font-black flex-1">Novembro 2026</p>
                        <button aria-label="Semana anterior" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}` }}><ChevronLeft size={15} /></button>
                        <button aria-label="Próxima semana" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}` }}><ChevronRight size={15} /></button>
                        <button className="h-8 px-3 rounded-full text-[11.5px] font-black" style={{ border: `1px solid ${c.border}` }}>Calendário</button>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 mb-3">
                        {DIAS.map(([n, d, q], i) => (
                            <button key={n} onClick={() => { setDia(i); setAberto(null) }} className="rounded-2xl py-2 text-center active:scale-95 transition" style={dia === i ? { background: cor, color: '#fff' } : { background: c.surface, border: `1px solid ${c.border}` }}>
                                <span className="block text-[9.5px] font-black" style={{ opacity: dia === i ? 0.9 : 0.6 }}>{n}</span>
                                <span className="block text-[17px] font-black leading-tight">{d}</span>
                                <span className="flex justify-center gap-0.5 mt-1">{Array.from({ length: q }).map((_, k) => <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: dia === i ? '#fff' : cor }} />)}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 mb-3 overflow-x-auto -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                        {[...(dia === 1 ? [['agora são 16:10', C.agora]] : []), [`${lista.length} agendamentos`, cor], [`${lista.length * 2 + 1} h ocupadas`, C.serv], [dia === 1 ? '1 entrada a conferir' : 'tudo conferido', dia === 1 ? C.ambar : C.ok]].map(([t, k]) => (
                            <span key={t} className="h-8 px-3 rounded-full text-[11.5px] font-black flex items-center flex-shrink-0" style={{ background: `${k}1f`, color: k }}>{t}</span>
                        ))}
                    </div>
                    <div className="space-y-2">
                        {itens}
                    </div>
                    <p className="text-[11.5px] mt-4 leading-snug" style={{ color: c.textSecondary }}>Cada horário tem um cliente só: a loja não marca dois serviços ao mesmo tempo.</p>
                </>
            )}

            {aba === 'pend' && (
                <>
                    <p className="text-[12px] leading-snug mb-3" style={{ color: c.textSecondary }}>Pedidos de horário esperando a sua resposta. Só o que você aceitar entra na agenda.</p>
                    <div className="space-y-2">
                        {[['@tatiane-moura', 'Confraternização — Ambiente VIP (4 h)', ['TER 29/12 · 20:30', 'QUA 30/12 · 20:30'], 'Entrada R$ 144,00 informada'], ['@larissa-castro', 'Rodízio Premium (2 h)', ['SEX 02/01 · 19:00'], 'Sem entrada'], ['@marta-moura', 'Mesa no mezanino (até 6 pessoas)', ['SÁB 03/01 · 21:00'], 'Entrada R$ 36,00 a pagar']].slice(0, pend).map(([q, s, hs, e]) => (
                            <div key={String(q)} className="rounded-3xl p-3" style={{ ...card, borderLeft: `5px solid ${C.serv}` }}>
                                <p className="text-[13.5px] font-black">{q as string}</p>
                                <p className="text-[12px] font-semibold" style={{ color: c.textSecondary }}>{s as string}</p>
                                <div className="flex flex-wrap gap-1.5 mt-2">{(hs as string[]).map((h) => <span key={h} className="h-7 px-2.5 rounded-full text-[11px] font-black flex items-center gap-1" style={{ background: `${C.serv}1f`, color: C.serv }}><Clock size={11} />{h}</span>)}</div>
                                <p className="text-[11.5px] font-bold mt-2" style={{ color: String(e).includes('a pagar') ? C.ambar : c.textSecondary }}>{e as string}</p>
                                <div className="flex gap-1.5 mt-2.5">
                                    <button onClick={() => setPend((n) => Math.max(0, n - 1))} className="flex-1 h-10 rounded-full text-[12.5px] font-black text-white active:scale-95" style={{ background: C.serv }}>Aceitar</button>
                                    <button onClick={() => setPend((n) => Math.max(0, n - 1))} className="h-10 px-4 rounded-full text-[12.5px] font-black active:scale-95" style={{ border: `1px solid ${c.border}`, color: C.alerta }}>Recusar</button>
                                </div>
                                <button className="mt-2 text-[11.5px] font-black flex items-center gap-1" style={{ color: cor }}>Histórico do cliente<ChevronRight size={12} /></button>
                            </div>
                        ))}
                        {pend === 0 && <p className="text-center text-[13px] font-black py-8">Nenhum pedido esperando ✓</p>}
                    </div>
                    {pend > 0 && <button className="w-full mt-3 h-11 rounded-full text-[12.5px] font-black" style={{ background: `${c.border}40` }}>Ver os outros 37 pedidos</button>}
                </>
            )}

            {aba === 'hor' && (
                <>
                    <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: c.textSecondary }}>Quando aceita agendamento</p>
                    <div className="rounded-3xl overflow-hidden" style={card}>
                        {[['Dom', '—'], ['Seg a Qui', '18:00 – 23:00'], ['Sex e Sáb', '12:00 – 00:00']].map(([d, h], i) => (
                            <div key={d} className="flex items-center px-3.5 py-3 text-[13px]" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}><span className="font-black w-24">{d}</span><span className="font-semibold" style={{ color: h === '—' ? c.textSecondary : cor }}>{h === '—' ? 'Não agenda' : h}</span><ChevronRight size={15} className="ml-auto" style={{ color: c.textSecondary }} /></div>
                        ))}
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-2" style={{ color: c.textSecondary }}>Intervalos</p>
                    <div className="rounded-3xl overflow-hidden" style={card}>
                        {[['Horários a cada', '30 min'], ['Antecedência mínima', '2 horas'], ['Até quantos dias à frente', '60 dias']].map(([a, b], i) => (
                            <div key={a} className="flex items-center px-3.5 py-3 text-[13px]" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}><span className="font-bold">{a}</span><span className="ml-auto font-black" style={{ color: cor }}>{b}</span></div>
                        ))}
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-2" style={{ color: c.textSecondary }}>Bloqueios</p>
                    <div className="rounded-3xl overflow-hidden" style={card}>
                        {[['25/12 · Natal', 'dia todo'], ['01/01 · Ano novo', 'dia todo']].map(([a, b], i) => (
                            <div key={a} className="flex items-center px-3.5 py-3 text-[13px]" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}><span className="font-bold">{a}</span><span className="ml-auto text-[12px] font-semibold" style={{ color: c.textSecondary }}>{b}</span></div>
                        ))}
                    </div>
                    <button className="w-full mt-3 h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5" style={{ border: `1.5px dashed ${c.border}` }}><Plus size={15} />Bloquear um dia ou horário</button>
                </>
            )}

            {/* botão fixo */}
            <div className="fixed inset-x-0 flex justify-center pointer-events-none" style={{ bottom: 'calc(var(--staging-banner-h, 0px) + 16px)' }}>
                <div className="w-full max-w-md px-4 flex justify-end">
                    <button className="pointer-events-auto h-12 px-5 rounded-full text-[13.5px] font-black text-white flex items-center gap-2 active:scale-95" style={{ background: cor, boxShadow: `0 10px 26px ${cor}66` }}><Plus size={18} />Agendar</button>
                </div>
            </div>
        </>
    )
}
