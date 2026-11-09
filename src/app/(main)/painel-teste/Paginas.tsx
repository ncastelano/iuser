// src/app/(main)/painel-teste/Paginas.tsx
//
// As PÁGINAS para onde levam os avisos de "Precisa de você agora" e os blocos do painel (laboratório /painel-teste, só teste, dados de exemplo,
// nada grava). Cada aviso do painel leva a UMA página que resolve aquilo: Pedidos, Repasses (caixa das entregas), Digital (liberar acessos),
// Apoios (gorjetas), Conversas e Avaliações. Os botões só mexem no estado local.
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
    Banknote, Check, Eye, ShoppingBag, Share2, Radio, UserPlus, Zap, ChevronRight, ClipboardList, Clock, CreditCard, GraduationCap, Heart, MessageCircle, Search, Send, Star, Store, Bike, Wallet, X, Gavel, ShieldCheck, Key,
} from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { C, FASES, ORANGE, PEDIDOS, brl, type Fase, type Pedido } from './dados'
import { PaginaCasca, Switch, Vazio, useAviso } from './labui'
import { AtivarFolha, CartaoAuto, ClienteVe, type AutoEstado } from './PixAuto'
import Conteudos, { CONTEUDOS, TIPOS, type EvBase, type Tipo } from './AgoraConteudos'

interface Props { k: string; onClose: () => void; onIr: (k: string) => void; auto: AutoEstado; setAuto: (a: AutoEstado) => void }

export default function Pagina({ k, onClose, onIr, auto, setAuto }: Props) {
    switch (k) {
        case 'pedidos': return <Pedidos onClose={onClose} onIr={onIr} />
        case 'repasses': return <Repasses onClose={onClose} />
        case 'digital': return <Digital onClose={onClose} onIr={onIr} auto={auto} setAuto={setAuto} />
        case 'apoios': return <Apoios onClose={onClose} />
        case 'conversas': return <Conversas onClose={onClose} />
        case 'agora': return <Agora onClose={onClose} onIr={onIr} />
        default: return <Avaliacoes onClose={onClose} />
    }
}

function useCard() {
    const { colors } = useTheme()
    return { colors, card: { background: colors.surface, border: `1px solid ${colors.border}` } }
}
function Titulo({ children, n }: { children: ReactNode; n?: number }) {
    const { colors } = useTheme()
    return <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2 flex items-center gap-2" style={{ color: colors.textSecondary }}>{children}{n != null && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] flex items-center justify-center text-white" style={{ background: C.ambar }}>{n}</span>}</p>
}

// ===== PEDIDOS =====
const FINALIZADOS: Pedido[] = [
    { id: 101, quem: '@lucas-ferreira', hora: '22:30', valor: 88.9, item: 'Pizza Calabresa (grande)', mais: 1, entrega: 'Entregue por Dani', fase: 'caminho' },
    { id: 102, quem: '@paula-nunes', hora: '22:12', valor: 54.0, item: 'Pizza Margherita (média)', mais: 0, entrega: 'Retirou na loja', fase: 'caminho' },
    { id: 103, quem: '@rui-castro', hora: '21:50', valor: 142.5, item: 'Combo Família', mais: 2, entrega: 'Entregue por Rafa', fase: 'caminho' },
    { id: 104, quem: '@sara-melo', hora: '21:20', valor: 63.7, item: 'Pizza Portuguesa (média)', mais: 1, entrega: 'Entregue por Léo', fase: 'caminho' },
]

function Pedidos({ onClose, onIr }: { onClose: () => void; onIr: (k: string) => void }) {
    const { colors, card } = useCard()
    const [lista, setLista] = useState<Pedido[]>(PEDIDOS)
    const [aba, setAba] = useState<Fase | 'fim'>('novo')
    const [aberto, setAberto] = useState<number | null>(null)
    const [q, setQ] = useState('')
    const { mostrar, node } = useAviso()
    const conta = (f: Fase) => lista.filter((p) => p.fase === f).length
    const avancar = (id: number) => { const o: Fase[] = ['novo', 'preparando', 'pronto', 'caminho']; setLista((l) => l.map((p) => (p.id === id ? { ...p, fase: o[Math.min(3, o.indexOf(p.fase) + 1)] } : p))); mostrar('Pedido atualizado') }
    const recusar = (id: number) => { setLista((l) => l.filter((p) => p.id !== id)); mostrar('Pedido recusado e o cliente avisado') }
    const base = aba === 'fim' ? FINALIZADOS : lista.filter((p) => p.fase === aba)
    const itens = q.trim() ? base.filter((p) => (p.quem + p.item).toLowerCase().includes(q.trim().toLowerCase())) : base
    const meta = FASES.find((f) => f.k === aba)

    return (
        <PaginaCasca titulo="Pedidos" sub="Pizzaria Forno de Ouro" cor={C.novo} icone={<ClipboardList size={18} />} onClose={onClose}>
            {node}
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
                {FASES.map((f) => (
                    <button key={f.k} onClick={() => setAba(f.k)} className="h-10 px-3.5 rounded-full text-[12.5px] font-black flex-shrink-0 flex items-center gap-1.5 active:scale-95" style={aba === f.k ? { background: f.cor, color: '#fff' } : { border: `1px solid ${colors.border}` }}>
                        {f.nome}<span className="text-[11px]" style={{ opacity: 0.85 }}>{conta(f.k)}</span>
                    </button>
                ))}
                <button onClick={() => setAba('fim')} className="h-10 px-3.5 rounded-full text-[12.5px] font-black flex-shrink-0 active:scale-95" style={aba === 'fim' ? { background: colors.textPrimary, color: colors.background } : { border: `1px solid ${colors.border}` }}>Finalizados</button>
            </div>
            <button onClick={() => onIr('age-pend')} className="w-full mt-1 mb-3 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 text-left active:scale-[.99]" style={{ background: `${C.servico}14`, border: `1px solid ${C.servico}55` }}>
                <span className="text-[12.5px] font-bold flex-1"><b style={{ color: C.servico }}>3 pedidos de serviço</b> esperam resposta — ficam na Agenda</span><ChevronRight size={15} style={{ color: C.servico }} />
            </button>
            <div className="h-11 rounded-full px-3.5 flex items-center gap-2 mb-3" style={{ background: colors.surface, border: `1.5px solid ${colors.border}` }}>
                <Search size={15} style={{ color: colors.textSecondary }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente ou item" className="flex-1 bg-transparent outline-none text-[13px]" style={{ color: colors.textPrimary }} />
            </div>

            {itens.length === 0 ? <Vazio titulo="Nada por aqui" texto="Nenhum pedido nesta etapa." /> : (
                <div className="space-y-2">
                    {itens.map((p) => {
                        const cor = aba === 'fim' ? C.caminho : meta?.cor ?? C.caminho
                        const on = aberto === p.id
                        return (
                            <div key={p.id} className="rounded-2xl overflow-hidden" style={{ ...card, borderLeft: `4px solid ${cor}` }}>
                                <button onClick={() => setAberto(on ? null : p.id)} className="w-full text-left px-3 py-2.5 flex items-center gap-2">
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-black leading-tight truncate">{p.quem} <span className="font-semibold" style={{ color: colors.textSecondary }}>· {p.hora}</span></span>
                                        <span className="block text-[12px] leading-tight truncate mt-0.5">{p.item}{p.mais ? ` +${p.mais}` : ''}</span>
                                        <span className="block text-[11px] font-bold leading-tight mt-0.5 truncate" style={{ color: p.entrega.startsWith('Cliente') || p.entrega.startsWith('Retirou') ? colors.textSecondary : C.caminho }}>{p.entrega}</span>
                                    </span>
                                    <span className="text-[13px] font-black">{brl(p.valor)}</span>
                                </button>
                                {on && (
                                    <div className="px-3 pb-3 pt-2 text-[12px]" style={{ borderTop: `1px solid ${colors.border}` }}>
                                        <p className="font-black mb-1">Itens</p>
                                        <p>1× {p.item}</p>{p.mais > 0 && <p>{p.mais}× Refrigerante lata</p>}
                                        <p className="mt-2"><b>Pagamento:</b> Pix · já informado</p>
                                        <p><b>Entrega:</b> Rua Jaci Paraná, bairro Centro</p>
                                        <button onClick={() => onIr('conversas')} className="mt-2.5 h-9 px-4 rounded-full text-[12px] font-black flex items-center gap-1.5" style={{ border: `1px solid ${colors.border}` }}><MessageCircle size={14} />Conversar com o cliente</button>
                                    </div>
                                )}
                                {aba !== 'fim' && aba !== 'caminho' && (
                                    <div className="flex gap-1.5 px-3 pb-3">
                                        {aba === 'novo' && <button onClick={() => recusar(p.id)} aria-label="Recusar" className="h-10 w-11 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}`, color: C.alerta }}><X size={16} /></button>}
                                        <button onClick={() => avancar(p.id)} className="flex-1 h-10 rounded-full text-[13px] font-black text-white active:scale-95" style={{ background: aba === 'preparando' ? '#ca8a04' : cor }}>{meta?.acao}</button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </PaginaCasca>
    )
}

// ===== REPASSES (caixa das entregas) =====
function Repasses({ onClose }: { onClose: () => void }) {
    const { colors, card } = useCard()
    const [feito, setFeito] = useState<Record<string, string>>({})
    const { mostrar, node } = useAviso()
    const marcar = (id: string, t: string, aviso: string) => { setFeito((f) => ({ ...f, [id]: t })); mostrar(aviso) }
    const Resolvido = ({ t }: { t: string }) => <p className="text-[12.5px] font-black mt-2 flex items-center gap-1.5" style={{ color: '#16a34a' }}><Check size={14} />{t}</p>
    return (
        <PaginaCasca titulo="Repasses das entregas" sub="Dinheiro da porta e maquininha" cor={C.ambar} icone={<Banknote size={18} />} onClose={onClose}>
            {node}
            <div className="rounded-2xl p-3 text-[12px] leading-snug font-semibold" style={{ background: `${C.ambar}12`, border: `1px solid ${C.ambar}55` }}>O iUser <b>não mexe nesse dinheiro</b>: o entregador diz o que repassou e você confirma que recebeu. Repasse vencido trava o entregador.</div>

            <Titulo n={feito.r1 ? 0 : 1}>Para conferir</Titulo>
            <div className="rounded-3xl p-3.5" style={{ ...card, borderLeft: `5px solid ${C.ambar}` }}>
                <p className="text-[14px] font-black">Rafa diz que repassou {brl(85)}</p>
                <p className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>3 entregas com dinheiro na porta · por Pix às 14:20</p>
                {feito.r1 ? <Resolvido t={feito.r1} /> : (
                    <div className="flex gap-1.5 mt-3">
                        <button onClick={() => marcar('r1', 'Recebido · Rafa foi avisado', 'Repasse confirmado')} className="flex-1 h-11 rounded-full text-[13px] font-black text-white active:scale-95" style={{ background: C.novo }}>Recebi</button>
                        <button onClick={() => marcar('r1', 'Marcado como “não recebi” · o iUser vai analisar', 'Repasse contestado')} className="h-11 px-4 rounded-full text-[13px] font-black active:scale-95" style={{ border: `1px solid ${colors.border}`, color: C.alerta }}>Não recebi</button>
                    </div>
                )}
            </div>

            <Titulo>Dinheiro com entregadores</Titulo>
            <div className="rounded-3xl overflow-hidden" style={card}>
                {[['Tito', '4 pedidos', 120, 'vence hoje às 22:00', true], ['Léo', '2 pedidos', 45, 'vence amanhã', false]].map(([n, q, v, d, urg], i) => (
                    <div key={String(n)} className="flex items-center gap-3 px-3.5 py-3" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                        <span className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white flex-shrink-0" style={{ background: C.caminho }}>{String(n)[0]}</span>
                        <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-black">{n as string} deve {brl(v as number)}</span><span className="block text-[11.5px]" style={{ color: urg ? C.ambar : colors.textSecondary }}>{q as string} · {d as string}</span></span>
                    </div>
                ))}
            </div>

            <Titulo>Maquininha na rua</Titulo>
            <div className="rounded-3xl p-3.5" style={card}>
                <p className="text-[13.5px] font-black flex items-center gap-2"><CreditCard size={16} style={{ color: C.caminho }} />Com Dani desde 19:10</p>
                <p className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>2 entregas no cartão · devolver até 22:10</p>
                {feito.m1 ? <Resolvido t={feito.m1} /> : <button onClick={() => marcar('m1', 'Devolução confirmada', 'Maquininha devolvida')} className="mt-3 h-10 px-5 rounded-full text-[12.5px] font-black text-white" style={{ background: C.caminho }}>Confirmar devolução</button>}
            </div>

            <Titulo n={feito.d1 ? 0 : 1}>Entrega contestada</Titulo>
            <div className="rounded-3xl p-3.5" style={{ ...card, borderLeft: `5px solid ${C.alerta}` }}>
                <p className="text-[13.5px] font-black flex items-center gap-2"><Gavel size={15} style={{ color: C.alerta }} />@bia-santos diz que não recebeu</p>
                <p className="text-[12px] mt-1 leading-snug" style={{ color: colors.textSecondary }}>Pizza Brigadeiro · R$ 76,00. <b>A prova do entregador:</b> código do cliente usado · 2 min na porta · a 12 m do endereço.</p>
                {feito.d1 ? <Resolvido t={feito.d1} /> : <button onClick={() => marcar('d1', 'Resposta enviada ao iUser', 'Resposta enviada')} className="mt-3 h-10 px-5 rounded-full text-[12.5px] font-black text-white" style={{ background: C.alerta }}>Responder à contestação</button>}
            </div>
        </PaginaCasca>
    )
}

// ===== DIGITAL (liberar acessos) =====
function Digital({ onClose, onIr, auto, setAuto }: { onClose: () => void; onIr: (k: string) => void; auto: AutoEstado; setAuto: (a: AutoEstado) => void }) {
    const { colors, card } = useCard()
    const [ativando, setAtivando] = useState(false)
    const [cliente, setCliente] = useState(false)
    const [feito, setFeito] = useState<Record<number, string>>({})
    const { mostrar, node } = useAviso()
    const pend = [{ id: 1, quem: '@ana-barbosa', prod: 'Curso Pizza Napolitana', v: 49.9, h: '10:32' }, { id: 2, quem: '@joao-martins', prod: 'Álbum “Noite no Forno”', v: 19.9, h: '10:48' }]
    const aguardando = pend.filter((p) => !feito[p.id]).length
    return (
        <PaginaCasca titulo="Digital" sub={auto === 'ativo' ? 'Vendas e acessos liberados sozinhos' : 'Liberar acessos e acompanhar'} cor={C.pronto} icone={<GraduationCap size={18} />} onClose={onClose}>
            {node}
            <div className="grid grid-cols-3 gap-2 text-center">
                {[['R$ 506', 'vendas'], ['10', 'produtos'], ['38', 'no Clube']].map(([v, l]) => <div key={l} className="rounded-2xl py-2.5" style={card}><p className="text-[16px] font-black leading-none" style={{ color: C.pronto }}>{v}</p><p className="text-[10px] font-bold mt-1" style={{ color: colors.textSecondary }}>{l}</p></div>)}
            </div>

            <div className="mt-3"><CartaoAuto c={colors} auto={auto} setAuto={setAuto} onAtivar={() => setAtivando(true)} onVer={() => setCliente(true)} /></div>
            {ativando && <AtivarFolha c={colors} onClose={() => setAtivando(false)} onEnviar={() => { setAtivando(false); setAuto('analise'); mostrar('Enviado para análise') }} />}
            {cliente && <ClienteVe c={colors} onClose={() => setCliente(false)} />}

            {auto === 'ativo' ? (<>
                <Titulo>Liberados sozinhos hoje</Titulo>
                <div className="rounded-3xl overflow-hidden" style={card}>
                    {[['@ana-barbosa', 'Curso Pizza Napolitana', '10:32', 'em 3 s'], ['@joao-martins', 'Álbum “Noite no Forno”', '10:48', 'em 2 s'], ['@carol-lima', 'Curso Pizza Napolitana', '09:12', 'em 4 s'], ['@heitor-martins', 'E-book “Massa perfeita”', '08:40', 'em 3 s'], ['@lucas-ferreira', 'Receitas de molho (PDF)', '02:17', 'de madrugada, em 3 s']].map(([q, pr, h, t], i) => (
                        <div key={q + h} className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}><Zap size={14} style={{ color: '#16a34a' }} /><span className="flex-1 min-w-0 truncate"><b>{q}</b> · {pr}<span className="block text-[11px]" style={{ color: colors.textSecondary }}>Pix confirmado {t}</span></span><span style={{ color: colors.textSecondary }}>{h}</span></div>
                    ))}
                </div>
                <Titulo>Precisa de um olhar</Titulo>
                <div className="rounded-3xl p-3.5" style={{ background: '#f59e0b14', border: '1.5px solid #f59e0b55' }}>
                    <p className="text-[13px] font-black">1 Pix devolvido pelo banco</p>
                    <p className="text-[12px] leading-snug mt-0.5">@rui-castro pediu o estorno de {brl(19.9)} e o acesso a “E-book Massa perfeita” foi retirado automaticamente. Nada a fazer.</p>
                </div>
            </>) : (<>
            <Titulo n={aguardando}>Para liberar</Titulo>
            <div className="space-y-2">
                {pend.map((p) => (
                    <div key={p.id} className="rounded-3xl p-3.5" style={{ ...card, borderLeft: `5px solid ${C.pronto}` }}>
                        <p className="text-[13.5px] font-black">{p.quem}</p>
                        <p className="text-[12.5px] font-semibold">{p.prod} · {brl(p.v)}</p>
                        <p className="text-[11.5px] mt-0.5 flex items-center gap-1" style={{ color: colors.textSecondary }}><Clock size={11} />Pix informado às {p.h} — confira na sua conta</p>
                        {feito[p.id] ? <p className="text-[12.5px] font-black mt-2 flex items-center gap-1.5" style={{ color: '#16a34a' }}><Check size={14} />{feito[p.id]}</p> : (
                            <div className="flex gap-1.5 mt-3">
                                <button onClick={() => { setFeito((f) => ({ ...f, [p.id]: 'Acesso liberado · o cliente foi avisado' })); mostrar('Acesso liberado!') }} className="flex-1 h-11 rounded-full text-[13px] font-black text-white active:scale-95 flex items-center justify-center gap-1.5" style={{ background: C.pronto }}><Key size={14} />Liberar acesso</button>
                                <button onClick={() => { setFeito((f) => ({ ...f, [p.id]: 'Marcado como “não recebi o Pix”' })); mostrar('Pedido marcado') }} className="h-11 px-4 rounded-full text-[13px] font-black" style={{ border: `1px solid ${colors.border}`, color: C.alerta }}>Não recebi</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <Titulo>Liberados hoje</Titulo>
            <div className="rounded-3xl overflow-hidden" style={card}>
                {[['@carol-lima', 'Curso Pizza Napolitana', '09:12'], ['@heitor-martins', 'E-book “Massa perfeita”', '08:40']].map(([q, pr, h], i) => (
                    <div key={q} className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}><Check size={14} style={{ color: '#16a34a' }} /><span className="flex-1 min-w-0 truncate"><b>{q}</b> · {pr}</span><span style={{ color: colors.textSecondary }}>{h}</span></div>
                ))}
            </div>
            </>)}
            <div className="flex gap-2 mt-4">
                <button onClick={() => onIr('cat-dig')} className="flex-1 h-11 rounded-full text-[12.5px] font-black" style={{ border: `1px solid ${colors.border}` }}>Produtos digitais</button>
                <button onClick={() => onIr('clu')} className="flex-1 h-11 rounded-full text-[12.5px] font-black" style={{ border: `1px solid ${colors.border}` }}>Clube e mensalidade</button>
            </div>
        </PaginaCasca>
    )
}

// ===== APOIOS (gorjetas) =====
function Apoios({ onClose }: { onClose: () => void }) {
    const { colors, card } = useCard()
    const [liga, setLiga] = useState(true)
    const [feito, setFeito] = useState<string | null>(null)
    const { mostrar, node } = useAviso()
    return (
        <PaginaCasca titulo="Apoios recebidos" sub="Gorjetas de quem curte o seu trabalho" cor="#8b5cf6" icone={<Heart size={18} />} onClose={onClose}>
            {node}
            <div className="rounded-3xl p-3.5 flex items-center gap-3" style={card}>
                <div className="flex-1"><p className="text-[14px] font-black">Receber apoios</p><p className="text-[11.5px] leading-snug" style={{ color: colors.textSecondary }}>O botão “Apoiar” aparece nos seus produtos digitais e na sala de música.</p></div>
                <Switch on={liga} set={setLiga} cor="#8b5cf6" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-2xl p-3" style={{ ...card, borderLeft: `4px solid ${C.novo}` }}><p className="text-[10.5px] font-bold" style={{ color: C.novo }}>Confirmado</p><p className="text-[19px] font-black">{brl(230 + (feito === 'ok' ? 10 : 0))}</p></div>
                <div className="rounded-2xl p-3" style={{ ...card, borderLeft: `4px solid ${C.ambar}` }}><p className="text-[10.5px] font-bold" style={{ color: C.ambar }}>A conferir</p><p className="text-[19px] font-black">{feito ? 'R$ 0,00' : 'R$ 10,00'}</p></div>
            </div>

            <Titulo n={feito ? 0 : 1}>Para conferir</Titulo>
            <div className="rounded-3xl p-3.5" style={{ ...card, borderLeft: '5px solid #8b5cf6' }}>
                <p className="text-[14px] font-black">{brl(10)} de @carol-lima</p>
                <p className="text-[12.5px] italic mt-0.5">“Adoro as suas pizzas!”</p>
                <p className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>Informou o Pix às 11:05 — confira na sua conta</p>
                {feito ? <p className="text-[12.5px] font-black mt-2 flex items-center gap-1.5" style={{ color: '#16a34a' }}><Check size={14} />{feito === 'ok' ? 'Apoio confirmado' : 'Marcado como “não recebi”'}</p> : (
                    <div className="flex gap-1.5 mt-3">
                        <button onClick={() => { setFeito('ok'); mostrar('Apoio confirmado!') }} className="flex-1 h-11 rounded-full text-[13px] font-black text-white active:scale-95" style={{ background: C.novo }}>Recebi</button>
                        <button onClick={() => { setFeito('nao'); mostrar('Apoio marcado') }} className="h-11 px-4 rounded-full text-[13px] font-black" style={{ border: `1px solid ${colors.border}`, color: C.alerta }}>Não recebi</button>
                    </div>
                )}
            </div>

            <Titulo>Recentes</Titulo>
            <div className="rounded-3xl overflow-hidden" style={card}>
                {[['@bia-santos', 50, 'Música linda no forno!', 'ontem'], ['@rui-castro', 20, '', 'há 3 d'], ['@sara-melo', 100, 'Continue assim 🍕', 'há 5 d']].map(([q, v, m, d], i) => (
                    <div key={String(q)} className="flex items-center gap-3 px-3.5 py-3" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                        <Heart size={15} style={{ color: '#8b5cf6' }} /><span className="min-w-0 flex-1"><span className="block text-[13px] font-black">{brl(v as number)} · {q as string}</span>{m && <span className="block text-[11.5px] truncate" style={{ color: colors.textSecondary }}>{m as string}</span>}</span><span className="text-[11px]" style={{ color: colors.textSecondary }}>{d as string}</span>
                    </div>
                ))}
            </div>
        </PaginaCasca>
    )
}

// ===== CONVERSAS =====
interface Conv { id: number; nome: string; quem: string; ultima: string; hora: string; naoLidas: number; msgs: { de: 'c' | 'l'; t: string }[] }
const CONVS: Conv[] = [
    { id: 1, nome: 'Carla Cavalcanti', quem: 'cliente', ultima: 'Vocês fazem sem cebola?', hora: '23:22', naoLidas: 1, msgs: [{ de: 'c', t: 'Oi! Fiz um pedido agora.' }, { de: 'c', t: 'Vocês fazem sem cebola?' }] },
    { id: 2, nome: 'João Martins', quem: 'cliente', ultima: 'Quanto tempo mais ou menos?', hora: '23:20', naoLidas: 2, msgs: [{ de: 'c', t: 'Boa noite!' }, { de: 'c', t: 'Quanto tempo mais ou menos?' }] },
    { id: 3, nome: 'Gabriela Carvalho', quem: 'cliente', ultima: 'Obrigada! Estava ótima 😍', hora: '22:40', naoLidas: 0, msgs: [{ de: 'l', t: 'Pedido entregue, bom apetite!' }, { de: 'c', t: 'Obrigada! Estava ótima 😍' }] },
    { id: 4, nome: 'Dani · entregadora', quem: 'entregador', ultima: 'Cheguei na loja', hora: '22:10', naoLidas: 0, msgs: [{ de: 'c', t: 'Cheguei na loja' }, { de: 'l', t: 'Já te passo o pedido!' }] },
]
const RAPIDAS = ['Já estamos preparando', 'Sai em uns 30 min', 'Pode retirar na loja', 'Fazemos sim, sem custo', 'Obrigado pela preferência!']

function Conversas({ onClose }: { onClose: () => void }) {
    const { colors, card } = useCard()
    const [convs, setConvs] = useState<Conv[]>(CONVS)
    const [filtro, setFiltro] = useState<'nao' | 'todas'>('nao')
    const [aberta, setAberta] = useState<number | null>(null)
    const [texto, setTexto] = useState('')
    const naoLidas = convs.reduce((t, c) => t + c.naoLidas, 0)
    const lista = filtro === 'nao' ? convs.filter((c) => c.naoLidas > 0) : convs
    const atual = convs.find((c) => c.id === aberta)
    const abrir = (id: number) => { setAberta(id); setConvs((l) => l.map((c) => (c.id === id ? { ...c, naoLidas: 0 } : c))) }
    const enviar = (t: string) => { if (!t.trim() || !atual) return; setConvs((l) => l.map((c) => (c.id === atual.id ? { ...c, ultima: t, msgs: [...c.msgs, { de: 'l', t }] } : c))); setTexto('') }

    if (atual) {
        return (
            <PaginaCasca titulo={atual.nome} sub={atual.quem === 'cliente' ? 'Cliente da loja' : 'Entregador iUser'} cor={C.novo} icone={<MessageCircle size={18} />} onClose={() => setAberta(null)}
                rodape={(
                    <div>
                        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>{RAPIDAS.map((r) => <button key={r} onClick={() => enviar(r)} className="h-8 px-3 rounded-full text-[11.5px] font-bold flex-shrink-0 active:scale-95" style={{ border: `1px solid ${colors.border}` }}>{r}</button>)}</div>
                        <div className="flex gap-2"><input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar(texto)} placeholder="Escreva uma mensagem" className="flex-1 h-11 rounded-full px-4 text-[13px] outline-none" style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }} />
                            <button onClick={() => enviar(texto)} aria-label="Enviar" className="w-11 h-11 rounded-full flex items-center justify-center text-white active:scale-90" style={{ background: C.novo }}><Send size={17} /></button></div>
                    </div>
                )}>
                {atual.quem === 'cliente' && <button className="w-full mb-3 rounded-2xl px-3.5 py-2.5 flex items-center gap-2 text-left" style={{ background: `${C.novo}14`, border: `1px solid ${C.novo}55` }}><ClipboardList size={15} style={{ color: C.novo }} /><span className="text-[12.5px] font-bold flex-1">Pedido de {brl(69.8)} · aguardando você</span><ChevronRight size={14} style={{ color: C.novo }} /></button>}
                <div className="space-y-2">
                    {atual.msgs.map((m, i) => (
                        <div key={i} className={`flex ${m.de === 'l' ? 'justify-end' : 'justify-start'}`}>
                            <span className="max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug" style={m.de === 'l' ? { background: C.novo, color: '#fff', borderBottomRightRadius: 6 } : { background: colors.surface, border: `1px solid ${colors.border}`, borderBottomLeftRadius: 6 }}>{m.t}</span>
                        </div>
                    ))}
                </div>
            </PaginaCasca>
        )
    }
    return (
        <PaginaCasca titulo="Conversas da loja" sub="Clientes e entregadores" cor={C.novo} icone={<MessageCircle size={18} />} onClose={onClose}>
            <div className="flex gap-1.5 mb-3">
                {([['nao', `Não lidas ${naoLidas}`], ['todas', `Todas ${convs.length}`]] as const).map(([k, l]) => <button key={k} onClick={() => setFiltro(k)} className="h-10 px-4 rounded-full text-[12.5px] font-black active:scale-95" style={filtro === k ? { background: C.novo, color: '#fff' } : { border: `1px solid ${colors.border}` }}>{l}</button>)}
            </div>
            {lista.length === 0 ? <Vazio titulo="Tudo respondido ✓" texto="Nenhuma conversa esperando você." /> : (
                <div className="rounded-3xl overflow-hidden" style={card}>
                    {lista.map((c, i) => (
                        <button key={c.id} onClick={() => abrir(c.id)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:opacity-70" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                            <span className="w-11 h-11 rounded-full flex items-center justify-center font-black text-white flex-shrink-0" style={{ background: c.quem === 'cliente' ? ORANGE : C.caminho }}>{c.nome[0]}</span>
                            <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-black leading-tight truncate">{c.nome}</span><span className="block text-[12px] truncate" style={{ color: c.naoLidas ? colors.textPrimary : colors.textSecondary, fontWeight: c.naoLidas ? 700 : 500 }}>{c.ultima}</span></span>
                            <span className="flex flex-col items-end gap-1"><span className="text-[10.5px]" style={{ color: colors.textSecondary }}>{c.hora}</span>{c.naoLidas > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black text-white flex items-center justify-center" style={{ background: C.novo }}>{c.naoLidas}</span>}</span>
                        </button>
                    ))}
                </div>
            )}
        </PaginaCasca>
    )
}

// ===== AVALIAÇÕES =====
const AVALS = [
    { q: 'Gabriela Carvalho', n: 5, p: 'Pizza Carne Seca com Abóbora', t: 'Adorei os ingredientes extras, ficou do jeito que pedi.', d: 'há 3 d', s: false },
    { q: 'Marta Moura', n: 5, p: 'Pizza Bacon com Cheddar', t: 'Pizza maravilhosa, massa leve e bem recheada!', d: 'há 3 d', s: false },
    { q: 'Heitor Martins', n: 4, p: 'Pizza Carne Seca com Abóbora', t: 'Atendimento excelente e entrega no tempo.', d: 'há 3 d', s: false },
    { q: 'Larissa Castro', n: 5, p: 'Festa de Aniversário no Ambiente VIP (4 horas)', t: 'O rodízio é muito bom, pizza saindo toda hora.', d: 'há 11 d', s: true },
    { q: 'Sérgio Rodrigues', n: 3, p: 'Pizza Napolitana (grande)', t: 'Boa, mas chegou um pouco morna.', d: 'há 12 d', s: false },
]
function Avaliacoes({ onClose }: { onClose: () => void }) {
    const { colors, card } = useCard()
    const [f, setF] = useState<'tudo' | 'prod' | 'serv' | 'baixas'>('tudo')
    const lista = useMemo(() => AVALS.filter((a) => (f === 'tudo' ? true : f === 'prod' ? !a.s : f === 'serv' ? a.s : a.n <= 3)), [f])
    return (
        <PaginaCasca titulo="Avaliações" sub="O que dizem da loja" cor="#eab308" icone={<Star size={18} />} onClose={onClose}>
            <div className="rounded-3xl p-3.5 flex items-center gap-4" style={card}>
                <div className="text-center"><p className="text-[34px] font-black leading-none">4,6</p><p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>120 avaliações</p></div>
                <div className="flex-1 space-y-1">{[[5, 83], [4, 26], [3, 7], [2, 4], [1, 0]].map(([n, q]) => <div key={n} className="flex items-center gap-2 text-[10.5px] font-bold"><span className="w-3">{n}</span><span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: `${colors.border}60` }}><span className="block h-full rounded-full" style={{ width: `${(q / 83) * 100}%`, background: '#eab308' }} /></span><span className="w-6 text-right" style={{ color: colors.textSecondary }}>{q}</span></div>)}</div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 mt-3 pb-1" style={{ scrollbarWidth: 'none' }}>
                {([['tudo', 'Tudo'], ['prod', 'Produtos'], ['serv', 'Serviços'], ['baixas', 'Até 3 estrelas']] as const).map(([k, l]) => <button key={k} onClick={() => setF(k)} className="h-9 px-3.5 rounded-full text-[12.5px] font-black flex-shrink-0 active:scale-95" style={f === k ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}` }}>{l}</button>)}
            </div>
            <div className="space-y-2 mt-3">
                {lista.length === 0 && <Vazio titulo="Nenhuma avaliação aqui" texto="Mude o filtro para ver as outras." />}
                {lista.map((a) => (
                    <div key={a.q + a.p} className="rounded-3xl p-3.5" style={card}>
                        <div className="flex items-center gap-2"><span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} fill={i <= a.n ? '#eab308' : 'none'} style={{ color: '#eab308' }} />)}</span><span className="text-[11px] ml-auto" style={{ color: colors.textSecondary }}>{a.d}</span></div>
                        <p className="text-[13px] font-semibold mt-1.5">{a.t}</p>
                        <p className="text-[11.5px] mt-1" style={{ color: colors.textSecondary }}><b style={{ color: colors.textPrimary }}>{a.q}</b> · {a.p}</p>
                    </div>
                ))}
            </div>
        </PaginaCasca>
    )
}


// ===== AGORA NA SUA LOJA (o "Online agora" do painel leva aqui) =====
type Ev = { id: number; ic: ReactNode; cor: string; quem: string; txt: string; t: number }
const POOL: EvBase[] = [
    { ic: <Eye size={14} />, cor: '#3b82f6', quem: '@ana-barbosa', txt: 'está vendo a Pizza Margherita (grande)' },
    { ic: <ShoppingBag size={14} />, cor: '#f97316', quem: 'Visitante', txt: 'colocou o Combo Casal na sacola' },
    { ic: <Eye size={14} />, cor: '#3b82f6', quem: 'Visitante', txt: 'abriu o catálogo vindo do Social' },
    { ic: <Check size={14} />, cor: '#22c55e', quem: '@joao-martins', txt: 'está finalizando um pedido de R$ 119,30' },
    { ic: <UserPlus size={14} />, cor: '#8b5cf6', quem: '@marta-moura', txt: 'começou a seguir a loja' },
    { ic: <Heart size={14} />, cor: '#ef4444', quem: '@breno-oliveira', txt: 'curtiu “Noite do Rodízio: quinta tem sobremesa grátis”' },
    { ic: <Share2 size={14} />, cor: '#16a34a', quem: '@bia-santos', txt: 'compartilhou a loja numa comunidade' },
    { ic: <Search size={14} />, cor: '#14b8a6', quem: 'Visitante', txt: 'achou a loja buscando “pizza perto”' },
]
function Agora({ onClose, onIr }: { onClose: () => void; onIr: (k: string) => void }) {
    const { colors, card } = useCard()
    const [tipo, setTipo] = useState<Tipo>('pizzaria')
    const pizza = tipo === 'pizzaria'
    const loja = TIPOS.find((x) => x.k === tipo)!
    const pool = useMemo(() => (pizza ? [CONTEUDOS.pizzaria.eventos[0], POOL[0], CONTEUDOS.pizzaria.eventos[1], POOL[1], POOL[3], CONTEUDOS.pizzaria.eventos[2], POOL[2], POOL[4], POOL[5], POOL[6], POOL[7]] : CONTEUDOS[tipo].eventos), [tipo, pizza])
    const [evs, setEvs] = useState<Ev[]>([])
    const [n, setN] = useState(9)
    const [j, setJ] = useState(0)
    useEffect(() => {
        setEvs(pool.slice(0, 5).map((e, i) => ({ ...e, id: i, t: 8 + i * 23 })))
        let i = 5
        const id = setInterval(() => {
            const e = pool[i % pool.length]; i++
            setEvs((l) => [{ ...e, id: Date.now(), t: 0 }, ...l.map((x) => ({ ...x, t: x.t + 4 }))].slice(0, 12))
            setN((v) => Math.max(6, Math.min(13, v + (i % 2 ? 1 : -1))))
            setJ((v) => ((i % 3) - 1) * 2 + (v > 3 ? -1 : 0))
        }, 4000)
        return () => clearInterval(id)
    }, [pool])
    const quando = (t: number) => (t < 5 ? 'agora' : `há ${t} s`)
    const totalConteudo = CONTEUDOS[tipo].itens.reduce((t, x) => t + x.n, 0) + j
    return (
        <PaginaCasca titulo="Agora na sua loja" sub={`${loja.loja} · o que as pessoas estão fazendo`} cor="#22c55e" icone={<Radio size={18} />} onClose={onClose}>
            {/* só no laboratório: ver a mesma página para outros tipos de loja */}
            <div className="mb-3">
                <p className="text-[10.5px] font-bold mb-1.5" style={{ color: colors.textSecondary }}>Ver como (exemplo do laboratório):</p>
                <div className="flex gap-1.5 flex-wrap">
                    {TIPOS.map((x) => <button key={x.k} onClick={() => setTipo(x.k)} className="h-8 px-3 rounded-full text-[12px] font-black active:scale-95" style={tipo === x.k ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}` }}>{x.nome}</button>)}
                </div>
            </div>

            <div className="rounded-3xl p-4 flex items-center gap-3" style={{ background: '#22c55e14', border: '1.5px solid #22c55e55' }}>
                <span className="relative flex w-3 h-3"><span className="absolute inline-flex w-full h-full rounded-full animate-ping" style={{ background: '#22c55e', opacity: 0.6 }} /><span className="relative inline-flex w-3 h-3 rounded-full" style={{ background: '#22c55e' }} /></span>
                <div><p className="text-[28px] font-black leading-none">{pizza ? n : totalConteudo + n}</p><p className="text-[12px] font-bold mt-0.5" style={{ color: colors.textSecondary }}>{pizza ? 'pessoas na loja agora' : `pessoas na sua página agora`}</p></div>
                <p className="ml-auto text-[11px] font-bold text-right" style={{ color: '#16a34a' }}>ao vivo</p>
            </div>
            {pizza && (
                <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                    {[['Vendo a loja', Math.round(n * 0.4), '#3b82f6'], ['No catálogo', Math.round(n * 0.3), '#8b5cf6'], ['Na sacola', Math.max(1, Math.round(n * 0.2)), '#f97316'], ['Pagando', 1, '#22c55e']].map(([l, v, cor]) => (
                        <div key={String(l)} className="rounded-2xl py-2 text-center" style={card}><p className="text-[18px] font-black leading-none" style={{ color: cor as string }}>{v as number}</p><p className="text-[9.5px] font-bold mt-1 leading-tight" style={{ color: colors.textSecondary }}>{l as string}</p></div>
                    ))}
                </div>
            )}

            <Conteudos tipo={tipo} c={colors} j={j} />

            <Titulo>O que está acontecendo</Titulo>
            <div className="rounded-3xl overflow-hidden" style={card}>
                {evs.map((e, i) => (
                    <div key={e.id} className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px]" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                        <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${e.cor}22`, color: e.cor }}>{e.ic}</span>
                        <span className="min-w-0 flex-1 leading-snug"><b>{e.quem}</b> {e.txt}</span>
                        <span className="text-[10.5px] font-bold flex-shrink-0" style={{ color: i === 0 && e.t < 5 ? '#16a34a' : colors.textSecondary }}>{quando(e.t)}</span>
                    </div>
                ))}
            </div>

            {pizza && (<>
                <Titulo>Produtos mais vistos agora</Titulo>
                <div className="rounded-3xl overflow-hidden" style={card}>
                    {[['Pizza Margherita (grande)', 4], ['Combo Casal', 3], ['Rodízio premium', 2]].map(([nome, v], i) => (
                        <div key={String(nome)} className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px]" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                            <span className="w-4 font-black" style={{ color: '#22c55e' }}>{i + 1}</span><span className="flex-1 font-bold truncate">{nome as string}</span>
                            <span className="flex items-center gap-1 font-black"><Eye size={13} style={{ color: colors.textSecondary }} />{v as number}</span>
                        </div>
                    ))}
                </div>
                <Titulo>De onde vieram</Titulo>
                <div className="rounded-3xl p-3.5 space-y-2.5" style={card}>
                    {[['Social e Flash', 40], ['Busca no iUser', 30], ['Link compartilhado', 20], ['Radar (perto de você)', 10]].map(([l, p]) => (
                        <div key={String(l)}><div className="flex justify-between text-[12px] font-bold mb-1"><span>{l as string}</span><span>{p as number}%</span></div><span className="block h-2 rounded-full overflow-hidden" style={{ background: `${colors.border}70` }}><span className="block h-full rounded-full" style={{ width: `${p as number}%`, background: '#22c55e' }} /></span></div>
                    ))}
                </div>
            </>)}
            <p className="text-[11.5px] leading-snug mt-3" style={{ color: colors.textSecondary }}>Quem não está logado aparece como “Visitante”. Só mostramos o @ de quem está logado, e a cidade é a do perfil público (nunca o endereço).</p>
            {pizza && <button onClick={() => onIr('pedidos')} className="w-full mt-3 h-11 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ background: `${colors.border}40` }}>Ver os pedidos<ChevronRight size={14} /></button>}
        </PaginaCasca>
    )
}
