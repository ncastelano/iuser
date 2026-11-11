'use client'

// O EXTRATO COMPLETO da loja (3.0, "Abrir o extrato" do painel), no desenho do laboratório /painel-teste, com os dados reais:
// tudo o que ENTROU na loja no período — pedidos pagos (online), vendas no balcão, entradas de serviços confirmadas, vendas digitais e apoios
// confirmados —, com o total, a divisão por forma de pagamento, o filtro por tipo e os lançamentos agrupados por dia com o subtotal.
// "Planilha" baixa um CSV gerado aqui mesmo (nada sai do aparelho). O iUser só REGISTRA: o dinheiro cai direto na conta da loja.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Banknote, CalendarDays, ClipboardList, Download, GraduationCap, Heart, Printer, Store, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { fetchTipsPanel } from '@/modules/tips'
import { PaginaPainel } from './Casca'

type Tipo = 'pedido' | 'balcao' | 'servico' | 'digital' | 'apoio'
type Forma = 'Pix' | 'Cartão' | 'Dinheiro' | 'Outro'
export type ExtratoPeriodo = 'hoje' | 'ontem' | 'semana' | 'mes'
interface Lanc { at: Date; tipo: Tipo; desc: string; quem: string; forma: Forma; valor: number }

const ORANGE = '#f97316'
const TIPOS: Record<Tipo, { nome: string; cor: string; ic: ReactNode }> = {
    pedido: { nome: 'Pedidos', cor: '#22c55e', ic: <ClipboardList size={15} /> },
    balcao: { nome: 'Balcão', cor: ORANGE, ic: <Store size={15} /> },
    servico: { nome: 'Serviços', cor: '#14b8a6', ic: <CalendarDays size={15} /> },
    digital: { nome: 'Digital', cor: '#a855f7', ic: <GraduationCap size={15} /> },
    apoio: { nome: 'Apoios', cor: '#8b5cf6', ic: <Heart size={15} /> },
}
const FORMAS: Forma[] = ['Pix', 'Cartão', 'Dinheiro', 'Outro']
const FORMA_COR: Record<Forma, string> = { Pix: '#22c55e', Cartão: '#3b82f6', Dinheiro: '#eab308', Outro: '#9ca3af' }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formaDe = (m: string | null | undefined): Forma => {
    const s = (m || '').toLowerCase()
    if (s.includes('pix')) return 'Pix'
    if (s.includes('cart') || s.includes('card') || s.includes('créd') || s.includes('déb')) return 'Cartão'
    if (s.includes('dinheiro') || s.includes('cash')) return 'Dinheiro'
    return 'Outro'
}

/** [início, fim) do período (puro) */
export function intervalo(p: ExtratoPeriodo, now = new Date()): [Date, Date] {
    const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const amanha = new Date(d0); amanha.setDate(d0.getDate() + 1)
    if (p === 'hoje') return [d0, amanha]
    if (p === 'ontem') { const o = new Date(d0); o.setDate(d0.getDate() - 1); return [o, d0] }
    if (p === 'semana') { const s = new Date(d0); s.setDate(d0.getDate() - 6); return [s, amanha] }
    return [new Date(now.getFullYear(), now.getMonth(), 1), amanha]
}

const diaChave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
function diaNome(d: Date) {
    const hoje = new Date(); const ontem = new Date(); ontem.setDate(hoje.getDate() - 1)
    const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()]
    const rot = diaChave(d) === diaChave(hoje) ? 'Hoje' : diaChave(d) === diaChave(ontem) ? 'Ontem' : sem.charAt(0).toUpperCase() + sem.slice(1)
    return `${rot} · ${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}.`
}

export default function ExtratoCompleto({ storeId, storeName, inicial = 'semana', onClose }: { storeId: string; storeName: string; inicial?: ExtratoPeriodo; onClose: () => void }) {
    const { colors } = useTheme()
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const [periodo, setPeriodo] = useState<ExtratoPeriodo>(inicial)
    const [tipo, setTipo] = useState<Tipo | 'tudo'>('tudo')
    const [lancs, setLancs] = useState<Lanc[] | null>(null)

    const load = useCallback(async () => {
        setLancs(null)
        const [de, ate] = intervalo(periodo)
        const out: Lanc[] = []
        const [ord, apt, tips] = await Promise.all([
            supabase.from('orders')
                .select('id, total_amount, payment_method, buyer_name, buyer_profile_slug, buyer_id, delivery_option, created_at, order_items(product_id, product_name, quantity)')
                .eq('store_id', storeId).eq('status', 'paid').gte('created_at', de.toISOString()).lt('created_at', ate.toISOString())
                .order('created_at', { ascending: false }).limit(1000),
            supabase.from('appointments')
                .select('id, deposit_amount, deposit_paid_at, service_name, customer_slug')
                .eq('store_id', storeId).eq('deposit_status', 'paid').gte('deposit_paid_at', de.toISOString()).lt('deposit_paid_at', ate.toISOString()).limit(1000),
            fetchTipsPanel(storeId).catch(() => null),
        ])
        // order_items não tem vínculo declarado com products: os tipos vêm numa consulta só, pelos produtos da loja que são digitais
        const { data: dig } = await supabase.from('products').select('id').eq('store_id', storeId).eq('type', 'digital').limit(1000)
        const digitais = new Set((dig || []).map((p: any) => p.id))
        for (const o of (ord.data || []) as any[]) {
            const itens = (o.order_items || []) as any[]
            const digital = itens.length > 0 && itens.every((i) => digitais.has(i.product_id))
            const balcao = !o.buyer_id || o.delivery_option === 'pickup'
            const primeiro = itens[0] ? `${itens[0].quantity > 1 ? `${itens[0].quantity}× ` : ''}${itens[0].product_name}` : 'Pedido'
            out.push({
                at: new Date(o.created_at),
                tipo: digital ? 'digital' : balcao ? 'balcao' : 'pedido',
                desc: balcao && !digital ? `Venda no balcão · ${itens.reduce((t, i) => t + (i.quantity || 1), 0)} ${itens.length === 1 && itens[0].quantity === 1 ? 'item' : 'itens'}` : itens.length > 1 ? `${primeiro} +${itens.length - 1}` : primeiro,
                quem: o.buyer_profile_slug ? `@${o.buyer_profile_slug}` : (o.buyer_name || 'cliente do balcão'),
                forma: formaDe(o.payment_method),
                valor: Number(o.total_amount || 0),
            })
        }
        for (const a of (apt.data || []) as any[]) {
            out.push({ at: new Date(a.deposit_paid_at), tipo: 'servico', desc: `Entrada · ${a.service_name || 'serviço'}`, quem: a.customer_slug ? `@${a.customer_slug}` : 'cliente da agenda', forma: 'Pix', valor: Number(a.deposit_amount || 0) })
        }
        for (const t of tips?.rows || []) {
            const at = new Date(t.createdAt)
            if (t.status !== 'confirmed' || at < de || at >= ate) continue
            out.push({ at, tipo: 'apoio', desc: t.productName ? `Apoio · ${t.productName}` : 'Apoio à loja', quem: t.tipperSlug ? `@${t.tipperSlug}` : (t.tipperName || 'fã'), forma: 'Pix', valor: Number(t.amountCents || 0) / 100 })
        }
        setLancs(out.sort((a, b) => b.at.getTime() - a.at.getTime()))
    }, [storeId, periodo])
    useEffect(() => { load() }, [load])

    const todos = lancs || []
    const lista = tipo === 'tudo' ? todos : todos.filter((l) => l.tipo === tipo)
    const total = lista.reduce((t, l) => t + l.valor, 0)
    const porForma = FORMAS.map((f) => [f, lista.filter((l) => l.forma === f).reduce((t, l) => t + l.valor, 0)] as const).filter(([f, v]) => f !== 'Outro' || v > 0)
    const grupos = useMemo(() => {
        const m = new Map<string, { dia: Date; ls: Lanc[] }>()
        lista.forEach((l) => { const k = diaChave(l.at); if (!m.has(k)) m.set(k, { dia: l.at, ls: [] }); m.get(k)!.ls.push(l) })
        return [...m.values()]
    }, [lista])
    const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase())

    const planilha = () => {
        const linhas = [['Data', 'Hora', 'Tipo', 'Descrição', 'Cliente', 'Forma', 'Valor'], ...lista.map((l) => [l.at.toLocaleDateString('pt-BR'), l.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), TIPOS[l.tipo].nome, l.desc, l.quem, l.forma, l.valor.toFixed(2).replace('.', ',')])]
        const csv = '﻿' + linhas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
        a.download = `extrato-${storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${periodo}.csv`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }

    return (
        <PaginaPainel titulo="Extrato" sub={`${storeName} · tudo que entrou na loja`} cor="#22c55e" icone={<Wallet size={18} />} onClose={onClose}
            rodape={(
                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="flex-1 h-12 rounded-full text-[13px] font-black text-white flex items-center justify-center gap-1.5 active:scale-95" style={{ background: ORANGE }}><Printer size={16} />Imprimir / PDF</button>
                    <button onClick={planilha} disabled={!lista.length} className="flex-1 h-12 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}><Download size={16} />Planilha</button>
                </div>
            )}>
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                {([['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', '7 dias'], ['mes', mesNome]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setPeriodo(k)} className="h-10 px-4 rounded-full text-[12.5px] font-black flex-shrink-0 active:scale-95" style={periodo === k ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>{l}</button>
                ))}
            </div>

            <div className="rounded-3xl p-4 mt-3" style={card}>
                <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>Recebido no período</p>
                <p className="text-[30px] font-black leading-tight">{lancs ? brl(total) : '…'}</p>
                <p className="text-[12px]" style={{ color: colors.textSecondary }}>{lista.length} {lista.length === 1 ? 'lançamento' : 'lançamentos'} · média de {brl(lista.length ? total / lista.length : 0)}</p>
                <div className="flex h-2.5 rounded-full overflow-hidden mt-3" style={{ background: `${colors.border}60` }}>
                    {porForma.map(([f, v]) => <span key={f} style={{ width: `${total ? (v / total) * 100 : 0}%`, background: FORMA_COR[f] }} />)}
                </div>
                <div className="grid gap-2 mt-2.5" style={{ gridTemplateColumns: `repeat(${porForma.length}, minmax(0,1fr))` }}>
                    {porForma.map(([f, v]) => <div key={f} className="min-w-0"><p className="text-[10px] font-bold flex items-center gap-1" style={{ color: FORMA_COR[f] }}><span className="w-2 h-2 rounded-full" style={{ background: FORMA_COR[f] }} />{f}</p><p className="text-[13px] font-black truncate">{brl(v)}</p></div>)}
                </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 mt-3 pb-1" style={{ scrollbarWidth: 'none' }}>
                <button onClick={() => setTipo('tudo')} className="h-9 px-3.5 rounded-full text-[12px] font-black flex-shrink-0" style={tipo === 'tudo' ? { background: colors.textPrimary, color: colors.background } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>Tudo {todos.length}</button>
                {(Object.keys(TIPOS) as Tipo[]).map((t) => {
                    const n = todos.filter((l) => l.tipo === t).length
                    return <button key={t} onClick={() => setTipo(t)} className="h-9 px-3.5 rounded-full text-[12px] font-black flex-shrink-0 flex items-center gap-1.5" style={tipo === t ? { background: TIPOS[t].cor, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>{TIPOS[t].nome} {n}</button>
                })}
            </div>

            <div className="mt-2 space-y-4">
                {lancs === null && [0, 1].map((n) => <div key={n} className="rounded-3xl h-32 animate-pulse" style={{ background: `${colors.border}30` }} />)}
                {lancs !== null && grupos.length === 0 && <p className="text-center text-[13px] font-bold py-8" style={{ color: colors.textSecondary }}>Nada recebido neste período.</p>}
                {grupos.map(({ dia, ls }) => (
                    <div key={diaChave(dia)}>
                        <p className="text-[12px] font-black flex items-center mb-1.5"><span>{diaNome(dia)}</span><span className="ml-auto" style={{ color: colors.textSecondary }}>{brl(ls.reduce((t, l) => t + l.valor, 0))}</span></p>
                        <div className="rounded-3xl overflow-hidden" style={card}>
                            {ls.slice(0, 200).map((l, i) => (
                                <div key={i} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                                    <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${TIPOS[l.tipo].cor}22`, color: TIPOS[l.tipo].cor }}>{TIPOS[l.tipo].ic}</span>
                                    <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-black leading-tight truncate">{l.desc}</span><span className="block text-[11px] leading-tight truncate" style={{ color: colors.textSecondary }}>{l.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {l.quem}</span></span>
                                    <span className="text-right flex-shrink-0"><span className="block text-[13px] font-black">{brl(l.valor)}</span><span className="flex items-center justify-end gap-1 text-[10px] font-bold" style={{ color: FORMA_COR[l.forma] }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: FORMA_COR[l.forma] }} />{l.forma}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <p className="text-[11px] leading-snug mt-4" style={{ color: colors.textSecondary }}><Banknote size={12} className="inline mr-1" />O iUser registra a venda; o dinheiro cai direto na sua conta (Pix, cartão ou na porta). Entradas de serviço e apoios entram aqui depois de confirmados por você.</p>
        </PaginaPainel>
    )
}
