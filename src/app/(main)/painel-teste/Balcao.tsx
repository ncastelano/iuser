// src/app/(main)/painel-teste/Balcao.tsx — a VENDA NO BALCÃO do laboratório do painel (só teste, dados de exemplo, nada grava).
// Fluxo: escolher os itens (toque soma) → revisar (quantidade, cliente, desconto) → cobrar (Pix, cartão ou dinheiro com troco) → recibo.
// No app de verdade a venda nasce numa função do banco (`create_in_person_sale`): preço, total e itens saem de lá, nunca da tela.
'use client'

import { useMemo, useState } from 'react'
import { Check, CreditCard, Minus, Plus, QrCode, Receipt, Search, ShoppingBag, Store, Trash2, User, Banknote, Send } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { C, ORANGE, brl } from './dados'
import { FolhaCasca, PaginaCasca, useAviso } from './labui'

interface Item { id: number; nome: string; cat: string; preco: number }
const ITENS: Item[] = [
    { id: 1, nome: 'Combo Casal', cat: 'Combos', preco: 69.8 }, { id: 2, nome: 'Combo Família', cat: 'Combos', preco: 139.9 }, { id: 3, nome: 'Combo Doce e Salgada', cat: 'Combos', preco: 98 },
    { id: 4, nome: 'Pizza Margherita (grande)', cat: 'Pizzas', preco: 59.9 }, { id: 5, nome: 'Pizza Portuguesa (grande)', cat: 'Pizzas', preco: 64.9 }, { id: 6, nome: 'Pizza Quatro Queijos (grande)', cat: 'Pizzas', preco: 69.9 },
    { id: 7, nome: 'Pizza Calabresa (grande)', cat: 'Pizzas', preco: 58.9 }, { id: 8, nome: 'Pizza Brigadeiro (média)', cat: 'Doces', preco: 44.9 }, { id: 9, nome: 'Pizza Banana com Canela', cat: 'Doces', preco: 49.9 },
    { id: 10, nome: 'Refrigerante lata', cat: 'Bebidas', preco: 6 }, { id: 11, nome: 'Refrigerante 2 L', cat: 'Bebidas', preco: 12 }, { id: 12, nome: 'Suco natural', cat: 'Bebidas', preco: 9 },
    { id: 13, nome: 'Porção de batata', cat: 'Porções', preco: 24 }, { id: 14, nome: 'Borda recheada (adicional)', cat: 'Porções', preco: 8 },
]
const CATS = ['Todos', 'Combos', 'Pizzas', 'Doces', 'Bebidas', 'Porções']

export default function Balcao({ onClose }: { onClose: () => void }) {
    const { colors } = useTheme()
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const [cat, setCat] = useState('Todos')
    const [q, setQ] = useState('')
    const [carro, setCarro] = useState<Record<number, number>>({})
    const [rev, setRev] = useState(false)
    const [etapa, setEtapa] = useState<'itens' | 'pagar' | 'ok'>('itens')
    const [desc, setDesc] = useState<'0' | '5p' | '10p' | '5r'>('0')
    const [cliente, setCliente] = useState('')
    const [forma, setForma] = useState<'pix' | 'cartao' | 'dinheiro'>('pix')
    const [recebido, setRecebido] = useState<number | null>(null)
    const [pixPago, setPixPago] = useState(false)
    const [cartaoOk, setCartaoOk] = useState(false)
    const { mostrar, node } = useAviso()

    const lista = useMemo(() => ITENS.filter((i) => (cat === 'Todos' || i.cat === cat) && (!q.trim() || i.nome.toLowerCase().includes(q.trim().toLowerCase()))), [cat, q])
    const linhas = ITENS.filter((i) => carro[i.id])
    const qtd = linhas.reduce((t, i) => t + carro[i.id], 0)
    const sub = linhas.reduce((t, i) => t + i.preco * carro[i.id], 0)
    const descV = desc === '5p' ? sub * 0.05 : desc === '10p' ? sub * 0.1 : desc === '5r' ? Math.min(5, sub) : 0
    const total = Math.max(0, sub - descV)
    const troco = recebido != null ? Math.max(0, recebido - total) : 0
    const pode = forma === 'pix' ? pixPago : forma === 'cartao' ? cartaoOk : recebido != null && recebido >= total
    const mexer = (id: number, d: number) => setCarro((c) => { const n = Math.max(0, (c[id] || 0) + d); const x = { ...c }; if (n === 0) delete x[id]; else x[id] = n; return x })
    const nova = () => { setCarro({}); setDesc('0'); setCliente(''); setForma('pix'); setRecebido(null); setPixPago(false); setCartaoOk(false); setEtapa('itens'); setRev(false) }

    if (etapa === 'ok') {
        return (
            <PaginaCasca titulo="Venda registrada" sub="Pizzaria Forno de Ouro" cor={C.novo} icone={<Receipt size={18} />} onClose={onClose}
                rodape={<div className="flex gap-2"><button onClick={nova} className="flex-1 h-12 rounded-full text-[13.5px] font-black text-white active:scale-95" style={{ background: ORANGE }}>Nova venda</button><button onClick={onClose} className="h-12 px-5 rounded-full text-[13.5px] font-black" style={{ border: `1px solid ${colors.border}` }}>Fechar</button></div>}>
                {node}
                <div className="text-center pt-4"><span className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white" style={{ background: C.novo }}><Check size={30} /></span><p className="text-[20px] font-black mt-3">{brl(total)}</p><p className="text-[12.5px]" style={{ color: colors.textSecondary }}>Venda nº 1043 · {forma === 'pix' ? 'Pix' : forma === 'cartao' ? 'Cartão' : 'Dinheiro'} · agora</p></div>
                <div className="rounded-3xl overflow-hidden mt-5" style={card}>
                    {linhas.map((i, k) => <div key={i.id} className="flex items-center px-3.5 py-2.5 text-[12.5px]" style={{ borderTop: k ? `1px solid ${colors.border}` : undefined }}><span className="flex-1 min-w-0 truncate">{carro[i.id]}× {i.nome}</span><b>{brl(i.preco * carro[i.id])}</b></div>)}
                    {descV > 0 && <div className="flex px-3.5 py-2.5 text-[12.5px]" style={{ borderTop: `1px solid ${colors.border}`, color: C.novo }}><span className="flex-1">Desconto</span><b>− {brl(descV)}</b></div>}
                    {forma === 'dinheiro' && recebido != null && <div className="flex px-3.5 py-2.5 text-[12.5px]" style={{ borderTop: `1px solid ${colors.border}` }}><span className="flex-1">Recebido {brl(recebido)} · troco</span><b>{brl(troco)}</b></div>}
                </div>
                <div className="flex gap-2 mt-4">
                    <button onClick={() => mostrar('Recibo enviado' + (cliente ? ` para ${cliente}` : ' (sem cliente: copiado)'))} className="flex-1 h-11 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ border: `1px solid ${colors.border}` }}><Send size={14} />Enviar recibo</button>
                </div>
                <p className="text-[11px] mt-3 leading-snug" style={{ color: colors.textSecondary }}>A venda entra no Extrato (tipo “Balcão”), nas vendas de hoje e nos pontos da loja. Estoque dos itens é descontado.</p>
            </PaginaCasca>
        )
    }

    if (etapa === 'pagar') {
        return (
            <PaginaCasca titulo={`Cobrar ${brl(total)}`} sub={`${qtd} ${qtd === 1 ? 'item' : 'itens'}${cliente ? ' · ' + cliente : ''}`} cor={ORANGE} icone={<Banknote size={18} />} onClose={() => setEtapa('itens')}
                rodape={<button disabled={!pode} onClick={() => setEtapa('ok')} className="w-full h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: C.novo }}>Confirmar venda</button>}>
                <div className="grid grid-cols-3 gap-2">
                    {([['pix', 'Pix', <QrCode key="a" size={20} />], ['cartao', 'Cartão', <CreditCard key="b" size={20} />], ['dinheiro', 'Dinheiro', <Banknote key="c" size={20} />]] as const).map(([k, l, ic]) => (
                        <button key={k} onClick={() => setForma(k)} className="rounded-2xl py-3 flex flex-col items-center gap-1 text-[12.5px] font-black active:scale-95" style={forma === k ? { background: `${ORANGE}1a`, border: `2px solid ${ORANGE}`, color: ORANGE } : { ...card }}>{ic}{l}</button>
                    ))}
                </div>
                {forma === 'pix' && (
                    <div className="rounded-3xl p-4 mt-4 text-center" style={card}>
                        <div className="w-40 h-40 mx-auto rounded-2xl flex items-center justify-center" style={{ background: '#fff', border: `1px solid ${colors.border}`, color: '#111' }}><QrCode size={110} /></div>
                        <p className="text-[12px] font-bold mt-3">Chave: pizzaria@fornodeouro.com.br</p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Mostre o QR ao cliente. O dinheiro cai direto na sua conta.</p>
                        <button onClick={() => setPixPago(true)} className="mt-3 h-11 px-6 rounded-full text-[13px] font-black text-white" style={{ background: pixPago ? '#16a34a' : ORANGE }}>{pixPago ? '✓ Cliente pagou' : 'Cliente pagou'}</button>
                    </div>
                )}
                {forma === 'cartao' && (
                    <div className="rounded-3xl p-4 mt-4 text-center" style={card}>
                        <CreditCard size={38} className="mx-auto" style={{ color: C.caminho }} />
                        <p className="text-[13.5px] font-black mt-2">Passe {brl(total)} na maquininha da loja</p>
                        <p className="text-[11.5px]" style={{ color: colors.textSecondary }}>Quando aprovar, toque abaixo.</p>
                        <button onClick={() => setCartaoOk(true)} className="mt-3 h-11 px-6 rounded-full text-[13px] font-black text-white" style={{ background: cartaoOk ? '#16a34a' : C.caminho }}>{cartaoOk ? '✓ Pagamento aprovado' : 'Pagamento aprovado'}</button>
                    </div>
                )}
                {forma === 'dinheiro' && (
                    <div className="rounded-3xl p-4 mt-4" style={card}>
                        <p className="text-[12px] font-black mb-2">Quanto o cliente deu?</p>
                        <div className="flex flex-wrap gap-1.5">
                            {[total, 50, 100, 200].filter((v, i, a) => v >= total && a.indexOf(v) === i).map((v) => <button key={v} onClick={() => setRecebido(v)} className="h-10 px-4 rounded-full text-[12.5px] font-black active:scale-95" style={recebido === v ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}` }}>{v === total ? 'Valor exato' : brl(v)}</button>)}
                        </div>
                        {recebido != null && <p className="text-[14px] font-black mt-3" style={{ color: C.novo }}>Troco: {brl(troco)}</p>}
                    </div>
                )}
            </PaginaCasca>
        )
    }

    return (
        <PaginaCasca titulo="Venda no balcão" sub="Toque nos itens para montar a venda" cor={ORANGE} icone={<Store size={18} />} onClose={onClose}
            rodape={qtd > 0 ? (
                <button onClick={() => setRev(true)} className="w-full h-14 rounded-full px-5 flex items-center gap-3 text-white active:scale-[.99]" style={{ background: ORANGE, boxShadow: `0 10px 26px ${ORANGE}66` }}>
                    <span className="relative"><ShoppingBag size={22} /><span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[10px] font-black flex items-center justify-center" style={{ color: ORANGE }}>{qtd}</span></span>
                    <span className="flex-1 text-left text-[14px] font-black">Revisar e cobrar</span><span className="text-[15px] font-black">{brl(sub)}</span>
                </button>
            ) : <p className="text-center text-[12px] font-bold py-3" style={{ color: colors.textSecondary }}>Nenhum item ainda</p>}>
            {node}
            <div className="h-11 rounded-full px-3.5 flex items-center gap-2" style={{ background: colors.surface, border: `1.5px solid ${colors.border}` }}><Search size={15} style={{ color: colors.textSecondary }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item" className="flex-1 bg-transparent outline-none text-[13px]" style={{ color: colors.textPrimary }} /></div>
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 py-2" style={{ scrollbarWidth: 'none' }}>{CATS.map((c) => <button key={c} onClick={() => setCat(c)} className="h-9 px-3.5 rounded-full text-[12.5px] font-black flex-shrink-0 active:scale-95" style={cat === c ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}` }}>{c}</button>)}</div>
            <div className="grid grid-cols-2 gap-2 mt-1">
                {lista.map((i) => {
                    const n = carro[i.id] || 0
                    return (
                        <div key={i.id} className="rounded-2xl p-3 relative" style={n ? { background: `${ORANGE}12`, border: `2px solid ${ORANGE}` } : card}>
                            <button onClick={() => mexer(i.id, 1)} className="w-full text-left active:scale-[.98]"><p className="text-[12.5px] font-black leading-tight min-h-[32px]">{i.nome}</p><p className="text-[14px] font-black mt-1" style={{ color: ORANGE }}>{brl(i.preco)}</p></button>
                            {n > 0 && <div className="flex items-center justify-between mt-2"><button onClick={() => mexer(i.id, -1)} aria-label="Tirar um" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}>{n === 1 ? <Trash2 size={13} /> : <Minus size={14} />}</button><span className="text-[15px] font-black">{n}</span><button onClick={() => mexer(i.id, 1)} aria-label="Mais um" className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: ORANGE }}><Plus size={14} /></button></div>}
                        </div>
                    )
                })}
            </div>

            {rev && (
                <FolhaCasca titulo="Revisar a venda" sub={`${qtd} ${qtd === 1 ? 'item' : 'itens'}`} cor={ORANGE} icone={<ShoppingBag size={20} />} onClose={() => setRev(false)}
                    rodape={<button onClick={() => { setRev(false); setEtapa('pagar') }} className="w-full h-12 rounded-full text-[14px] font-black text-white active:scale-95" style={{ background: ORANGE }}>Cobrar {brl(total)}</button>}>
                    <div className="rounded-3xl overflow-hidden" style={card}>
                        {linhas.map((i, k) => (
                            <div key={i.id} className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderTop: k ? `1px solid ${colors.border}` : undefined }}>
                                <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-black truncate">{i.nome}</span><span className="block text-[11px]" style={{ color: colors.textSecondary }}>{brl(i.preco)} cada</span></span>
                                <button onClick={() => mexer(i.id, -1)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}><Minus size={13} /></button>
                                <span className="w-5 text-center text-[13px] font-black">{carro[i.id]}</span>
                                <button onClick={() => mexer(i.id, 1)} className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: ORANGE }}><Plus size={13} /></button>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-1.5" style={{ color: colors.textSecondary }}>Desconto</p>
                    <div className="flex flex-wrap gap-1.5">{([['0', 'Sem'], ['5p', '5%'], ['10p', '10%'], ['5r', 'R$ 5']] as const).map(([k, l]) => <button key={k} onClick={() => setDesc(k)} className="h-9 px-4 rounded-full text-[12.5px] font-black" style={desc === k ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}` }}>{l}</button>)}</div>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-1.5" style={{ color: colors.textSecondary }}>Cliente (opcional)</p>
                    <div className="h-11 rounded-2xl px-3.5 flex items-center gap-2" style={{ background: colors.surface, border: `1.5px solid ${colors.border}` }}><User size={15} style={{ color: colors.textSecondary }} /><input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="@ do cliente no iUser (para mandar o recibo)" className="flex-1 bg-transparent outline-none text-[13px]" style={{ color: colors.textPrimary }} /></div>
                    <div className="mt-4 space-y-1 text-[13px]"><div className="flex"><span className="flex-1">Subtotal</span><b>{brl(sub)}</b></div>{descV > 0 && <div className="flex" style={{ color: C.novo }}><span className="flex-1">Desconto</span><b>− {brl(descV)}</b></div>}<div className="flex text-[16px] pt-1"><span className="flex-1 font-black">Total</span><b>{brl(total)}</b></div></div>
                </FolhaCasca>
            )}
        </PaginaCasca>
    )
}
