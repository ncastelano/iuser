'use client'

// VENDA NO BALCÃO da 3.0 (o botão fixo do painel da loja), no desenho do laboratório /painel-teste, gravando de verdade:
//   1) ITENS — categorias e busca; tocar soma, −/+ ajusta;
//   2) REVISAR — quantidades, desconto (sem / 5% / 10% / R$ 5 / outro), código do Clube VIP (opcional) e o cliente (nome ou @, opcional);
//   3) COBRAR — Pix (QR e "copia e cola" da chave da loja, montados no aparelho) + "cliente pagou", Cartão (crédito/débito) +
//      "pagamento aprovado", Dinheiro com o valor recebido e o TROCO;
//   4) RECIBO — nº da venda, itens, desconto, troco, "Enviar recibo" (compartilhar) e "Nova venda".
// Quem calcula o preço e grava é o banco (`create_in_person_sale`, só o dono): itens pelo preço do catálogo, desconto do código e o desconto
// manual (migration 20261130000062). O iUser não confirma pagamento: a loja confere e toca o botão.
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Banknote, Check, ChevronLeft, Copy, CreditCard, Minus, Plus, QrCode, Receipt, Search, Share2, Store, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { copyText } from '@/components/ShareLinkDialog'
import { pixBrCode } from '@/lib/pixBrCode'
import { PaginaPainel } from './Casca'

const ORANGE = '#f97316'
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
type Etapa = 'itens' | 'revisar' | 'cobrar' | 'recibo'
type Forma = 'pix' | 'cartao' | 'dinheiro'
interface Prod { id: string; name: string; price: number; image_url: string | null; category: string | null }
interface Recibo { id: string; itens: { name: string; q: number; v: number }[]; subtotal: number; desconto: number; total: number; forma: string; recebido: number | null; troco: number; quando: Date; cliente: string }

export default function BalcaoV3({ storeId, storeName, pixKey, pixKeyType, onClose, onDone }: { storeId: string; storeName: string; pixKey: string | null; pixKeyType?: string | null; onClose: () => void; onDone: () => void }) {
    const { colors: c } = useTheme()
    const card = { background: c.surface, border: `1px solid ${c.border}` }
    const [prods, setProds] = useState<Prod[] | null>(null)
    const [cart, setCart] = useState<Record<string, number>>({})
    const [cat, setCat] = useState('Todos')
    const [q, setQ] = useState('')
    const [etapa, setEtapa] = useState<Etapa>('itens')
    const [desc, setDesc] = useState<{ tipo: 'nenhum' | 'pct' | 'valor'; v: number }>({ tipo: 'nenhum', v: 0 })
    const [outro, setOutro] = useState('')
    const [codigo, setCodigo] = useState('')
    const [cliente, setCliente] = useState('')
    const [forma, setForma] = useState<Forma>('pix')
    const [cartao, setCartao] = useState<'credito' | 'debito'>('credito')
    const [recebido, setRecebido] = useState('')
    const [qr, setQr] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [recibo, setRecibo] = useState<Recibo | null>(null)

    useEffect(() => {
        supabase.from('products').select('id, name, price, image_url, category, type').eq('store_id', storeId).eq('listing_type', 'sale').eq('is_active', true)
            .not('type', 'in', '(service,digital)').order('name').limit(500)
            .then(({ data }) => setProds(((data || []) as any[]).map((p) => ({ ...p, price: Number(p.price) || 0, image_url: p.image_url ? (p.image_url.startsWith('http') ? p.image_url : supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl) : null }))))
    }, [storeId])

    const cats = useMemo(() => ['Todos', ...[...new Set((prods || []).map((p) => p.category || 'Outros'))]], [prods])
    const lista = (prods || []).filter((p) => (cat === 'Todos' || (p.category || 'Outros') === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    const noCarrinho = (prods || []).filter((p) => cart[p.id])
    const qtd = Object.values(cart).reduce((t, n) => t + n, 0)
    const subtotal = noCarrinho.reduce((t, p) => t + p.price * cart[p.id], 0)
    const desconto = Math.min(subtotal, Math.round((desc.tipo === 'pct' ? subtotal * desc.v / 100 : desc.tipo === 'valor' ? desc.v : 0) * 100) / 100)
    const total = Math.max(0, Math.round((subtotal - desconto) * 100) / 100)
    const rec = Number(recebido.replace(',', '.')) || 0
    const troco = forma === 'dinheiro' ? Math.max(0, Math.round((rec - total) * 100) / 100) : 0
    const soma = (id: string, d: number) => setCart((m) => { const n = Math.max(0, (m[id] || 0) + d); const x = { ...m }; if (n) x[id] = n; else delete x[id]; return x })

    const brcode = useMemo(() => (pixKey ? pixBrCode({ key: pixKey, keyType: pixKeyType, name: storeName, city: 'BRASIL', amount: total }) : null), [pixKey, pixKeyType, storeName, total])
    useEffect(() => { if (etapa === 'cobrar' && forma === 'pix' && brcode) QRCode.toDataURL(brcode, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null)) }, [etapa, forma, brcode])

    const fechar = useCallback(async () => {
        if (salvando) return
        if (forma === 'dinheiro' && rec < total) { toast.error('O valor recebido é menor que o total'); return }
        setSalvando(true)
        const { data, error } = await supabase.rpc('create_in_person_sale', {
            p_store_id: storeId,
            p_items: noCarrinho.map((p) => ({ product_id: p.id, quantity: cart[p.id] })),
            p_buyer_name: cliente.trim() || null,
            p_payment_method: forma === 'pix' ? 'pix' : forma === 'dinheiro' ? 'dinheiro' : cartao,
            p_discount_code: codigo.trim() || null,
            p_manual_discount: desconto,
        })
        setSalvando(false)
        if (error) { toast.error('Não deu para registrar a venda', { description: error.message }); return }
        const r = data as any
        const t = Number(r?.total_amount ?? total)
        setRecibo({
            id: String(r?.order_id || '').slice(0, 8).toUpperCase(),
            itens: noCarrinho.map((p) => ({ name: p.name, q: cart[p.id], v: p.price * cart[p.id] })),
            subtotal: Number(r?.items_total ?? subtotal), desconto: Number(r?.discount || 0) + Number(r?.manual_discount || 0), total: t,
            forma: forma === 'pix' ? 'Pix' : forma === 'dinheiro' ? 'Dinheiro' : cartao === 'credito' ? 'Cartão de crédito' : 'Cartão de débito',
            recebido: forma === 'dinheiro' ? rec : null, troco: forma === 'dinheiro' ? Math.max(0, rec - t) : 0, quando: new Date(), cliente: cliente.trim(),
        })
        setEtapa('recibo')
        toast.success(`Venda de ${brl(t)} registrada`)
        onDone()
    }, [salvando, forma, rec, total, storeId, noCarrinho, cart, cliente, cartao, codigo, desconto, subtotal, onDone])

    const nova = () => { setCart({}); setDesc({ tipo: 'nenhum', v: 0 }); setOutro(''); setCodigo(''); setCliente(''); setRecebido(''); setForma('pix'); setRecibo(null); setEtapa('itens') }
    const voltar = etapa === 'revisar' ? () => setEtapa('itens') : etapa === 'cobrar' ? () => setEtapa('revisar') : null
    const reciboTexto = recibo ? [`${storeName} — recibo da venda nº ${recibo.id}`, recibo.quando.toLocaleString('pt-BR'), ...recibo.itens.map((i) => `${i.q}× ${i.name} — ${brl(i.v)}`), recibo.desconto ? `Desconto: −${brl(recibo.desconto)}` : '', `Total: ${brl(recibo.total)} (${recibo.forma})`, recibo.recebido !== null ? `Recebido: ${brl(recibo.recebido)} · troco ${brl(recibo.troco)}` : ''].filter(Boolean).join('\n') : ''

    const botao = (texto: string, onClick: () => void, disabled = false, cor = ORANGE) => (
        <button disabled={disabled} onClick={onClick} className="w-full h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95 transition" style={{ background: cor }}>{texto}</button>
    )
    const rodape = etapa === 'itens' ? botao(qtd ? `Revisar · ${qtd} ${qtd === 1 ? 'item' : 'itens'} · ${brl(subtotal)}` : 'Toque nos itens para somar', () => setEtapa('revisar'), !qtd)
        : etapa === 'revisar' ? botao(`Cobrar ${brl(total)}`, () => setEtapa('cobrar'), !qtd)
            : etapa === 'cobrar' ? botao(salvando ? 'Registrando…' : forma === 'pix' ? 'Cliente pagou' : forma === 'cartao' ? 'Pagamento aprovado' : `Recebi · troco ${brl(troco)}`, fechar, salvando || (forma === 'dinheiro' && rec < total), '#16a34a')
                : <div className="flex gap-2"><button onClick={() => { if (navigator.share) navigator.share({ title: 'Recibo', text: reciboTexto }).catch(() => {}); else copyText(reciboTexto).then(() => toast.success('Recibo copiado')) }} className="flex-1 h-12 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5" style={{ border: `1px solid ${c.border}` }}><Share2 size={15} />Enviar recibo</button><button onClick={nova} className="flex-1 h-12 rounded-full text-[13px] font-black text-white" style={{ background: ORANGE }}>Nova venda</button></div>

    const passos: Etapa[] = ['itens', 'revisar', 'cobrar', 'recibo']
    return (
        <PaginaPainel titulo="Venda no balcão" sub={storeName} cor={ORANGE} icone={<Store size={18} />} onClose={onClose} rodape={rodape}>
            <div className="flex items-center gap-2 mb-3">
                {voltar && <button onClick={voltar} aria-label="Voltar uma etapa" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}` }}><ChevronLeft size={16} /></button>}
                <div className="flex-1 grid grid-cols-4 gap-1">
                    {passos.map((p, i) => <span key={p} className="h-1.5 rounded-full" style={{ background: passos.indexOf(etapa) >= i ? ORANGE : `${c.border}` }} />)}
                </div>
                <span className="text-[11px] font-black" style={{ color: c.textSecondary }}>{['Itens', 'Revisar', 'Cobrar', 'Recibo'][passos.indexOf(etapa)]}</span>
            </div>

            {etapa === 'itens' && (
                <>
                    <label className="h-11 rounded-full px-3.5 flex items-center gap-2 mb-2.5" style={{ background: c.surface, border: `1.5px solid ${c.border}` }}>
                        <Search size={15} style={{ color: c.textSecondary }} />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item" className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: c.textPrimary }} />
                    </label>
                    <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-2.5" style={{ scrollbarWidth: 'none' }}>
                        {cats.map((t) => <button key={t} onClick={() => setCat(t)} className="h-9 px-3.5 rounded-full text-[12.5px] font-black flex-shrink-0" style={cat === t ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${c.border}` }}>{t}</button>)}
                    </div>
                    {prods === null ? <div className="rounded-3xl h-40 animate-pulse" style={{ background: `${c.border}30` }} /> : lista.length === 0 ? <p className="text-center text-[13px] py-8" style={{ color: c.textSecondary }}>Nenhum item encontrado.</p> : (
                        <div className="grid grid-cols-2 gap-2">
                            {lista.map((p) => {
                                const n = cart[p.id] || 0
                                return (
                                    <div key={p.id} className="rounded-2xl overflow-hidden flex flex-col" style={{ ...card, borderColor: n ? ORANGE : c.border, borderWidth: n ? 1.5 : 1 }}>
                                        <button onClick={() => soma(p.id, 1)} className="text-left active:opacity-70">
                                            <span className="block h-16 relative" style={{ background: `${ORANGE}18` }}>
                                                {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                                                {n > 0 && <span className="absolute top-1.5 right-1.5 min-w-6 h-6 px-1.5 rounded-full text-[12px] font-black text-white flex items-center justify-center" style={{ background: ORANGE }}>{n}</span>}
                                            </span>
                                            <span className="block px-2.5 pt-1.5 text-[12.5px] font-black leading-tight line-clamp-2">{p.name}</span>
                                            <span className="block px-2.5 text-[12.5px] font-black" style={{ color: ORANGE }}>{brl(p.price)}</span>
                                        </button>
                                        <div className="flex items-center justify-between px-2 pb-2 pt-1">
                                            <button disabled={!n} onClick={() => soma(p.id, -1)} aria-label={`Tirar ${p.name}`} className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${c.border}` }}><Minus size={14} /></button>
                                            <span className="text-[13px] font-black">{n}</span>
                                            <button onClick={() => soma(p.id, 1)} aria-label={`Somar ${p.name}`} className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: ORANGE }}><Plus size={14} /></button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </>
            )}

            {etapa === 'revisar' && (
                <>
                    <div className="rounded-3xl overflow-hidden" style={card}>
                        {noCarrinho.map((p, i) => (
                            <div key={p.id} className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}>
                                <span className="min-w-0 flex-1"><span className="block text-[13px] font-black truncate">{p.name}</span><span className="block text-[11.5px]" style={{ color: c.textSecondary }}>{brl(p.price)} cada</span></span>
                                <button onClick={() => soma(p.id, -1)} aria-label="Menos" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}` }}>{cart[p.id] === 1 ? <Trash2 size={13} /> : <Minus size={13} />}</button>
                                <span className="w-6 text-center text-[13px] font-black">{cart[p.id]}</span>
                                <button onClick={() => soma(p.id, 1)} aria-label="Mais" className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: ORANGE }}><Plus size={13} /></button>
                                <span className="w-20 text-right text-[13px] font-black">{brl(p.price * cart[p.id])}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-1.5" style={{ color: c.textSecondary }}>Desconto</p>
                    <div className="flex flex-wrap gap-1.5">
                        {([['Sem', { tipo: 'nenhum', v: 0 }], ['5%', { tipo: 'pct', v: 5 }], ['10%', { tipo: 'pct', v: 10 }], ['R$ 5', { tipo: 'valor', v: 5 }]] as const).map(([t, d]) => {
                            const on = desc.tipo === d.tipo && desc.v === d.v && !outro
                            return <button key={t} onClick={() => { setDesc({ ...d }); setOutro('') }} className="h-9 px-3.5 rounded-full text-[12.5px] font-black" style={on ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${c.border}` }}>{t}</button>
                        })}
                        <input value={outro} onChange={(e) => { const v = e.target.value.replace(/[^0-9,]/g, ''); setOutro(v); setDesc({ tipo: 'valor', v: Number(v.replace(',', '.')) || 0 }) }} inputMode="decimal" placeholder="Outro R$" className="h-9 w-24 px-3 rounded-full text-[12.5px] outline-none" style={{ border: `1px solid ${outro ? ORANGE : c.border}`, background: c.surface, color: c.textPrimary }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        <input value={cliente} onChange={(e) => setCliente(e.target.value.slice(0, 60))} placeholder="Cliente (nome ou @, opcional)" className="h-11 px-3.5 rounded-full text-[12.5px] outline-none min-w-0" style={{ border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary }} />
                        <input value={codigo} onChange={(e) => setCodigo(e.target.value.slice(0, 40))} placeholder="Código do clube (opcional)" className="h-11 px-3.5 rounded-full text-[12.5px] outline-none min-w-0" style={{ border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary }} />
                    </div>
                    <div className="rounded-3xl p-3.5 mt-3" style={card}>
                        <div className="flex justify-between text-[13px]"><span>Itens</span><span className="font-black">{brl(subtotal)}</span></div>
                        {desconto > 0 && <div className="flex justify-between text-[13px] mt-1" style={{ color: '#16a34a' }}><span>Desconto</span><span className="font-black">−{brl(desconto)}</span></div>}
                        {codigo.trim() && <p className="text-[11px] mt-1" style={{ color: c.textSecondary }}>O desconto do código do clube é conferido e aplicado na hora de registrar.</p>}
                        <div className="flex justify-between text-[17px] font-black mt-2 pt-2" style={{ borderTop: `1px solid ${c.border}` }}><span>Total</span><span>{brl(total)}</span></div>
                    </div>
                </>
            )}

            {etapa === 'cobrar' && (
                <>
                    <p className="text-center text-[12px] font-bold" style={{ color: c.textSecondary }}>Cobrar</p>
                    <p className="text-center text-[34px] font-black leading-tight">{brl(total)}</p>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                        {([['pix', 'Pix', <QrCode key="p" size={16} />], ['cartao', 'Cartão', <CreditCard key="c" size={16} />], ['dinheiro', 'Dinheiro', <Banknote key="d" size={16} />]] as const).map(([k, t, ic]) => (
                            <button key={k} onClick={() => setForma(k)} className="h-12 rounded-2xl text-[13px] font-black flex items-center justify-center gap-1.5" style={forma === k ? { background: ORANGE, color: '#fff' } : { border: `1.5px solid ${c.border}` }}>{ic}{t}</button>
                        ))}
                    </div>
                    {forma === 'pix' && (
                        <div className="rounded-3xl p-4 mt-3 flex flex-col items-center" style={card}>
                            {!pixKey ? <p className="text-[13px] text-center" style={{ color: '#dc2626' }}>A loja ainda não tem chave Pix. Cadastre em Editar loja → Pagamento.</p> : (
                                <>
                                    {qr ? <img src={qr} alt="QR Code do Pix" className="w-52 h-52 rounded-xl bg-white p-1" /> : <div className="w-52 h-52 rounded-xl animate-pulse" style={{ background: `${c.border}40` }} />}
                                    <p className="text-[12px] mt-2 text-center" style={{ color: c.textSecondary }}>O cliente lê o QR no app do banco. O dinheiro cai direto na conta da loja.</p>
                                    <button onClick={() => brcode && copyText(brcode).then(() => toast.success('Pix copia e cola copiado'))} className="mt-2 h-10 px-4 rounded-full text-[12.5px] font-black flex items-center gap-1.5" style={{ border: `1px solid ${c.border}` }}><Copy size={14} />Copiar Pix copia e cola</button>
                                    <p className="text-[11px] mt-2 text-center" style={{ color: c.textSecondary }}>Confira na sua conta e toque em “Cliente pagou”.</p>
                                </>
                            )}
                        </div>
                    )}
                    {forma === 'cartao' && (
                        <div className="rounded-3xl p-4 mt-3" style={card}>
                            <div className="grid grid-cols-2 gap-2">
                                {(['credito', 'debito'] as const).map((k) => <button key={k} onClick={() => setCartao(k)} className="h-11 rounded-full text-[13px] font-black" style={cartao === k ? { background: '#3b82f6', color: '#fff' } : { border: `1px solid ${c.border}` }}>{k === 'credito' ? 'Crédito' : 'Débito'}</button>)}
                            </div>
                            <p className="text-[12px] mt-3 text-center" style={{ color: c.textSecondary }}>Passe {brl(total)} na sua maquininha e toque em “Pagamento aprovado”.</p>
                        </div>
                    )}
                    {forma === 'dinheiro' && (
                        <div className="rounded-3xl p-4 mt-3" style={card}>
                            <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: c.textSecondary }}>Valor recebido</p>
                            <input value={recebido} onChange={(e) => setRecebido(e.target.value.replace(/[^0-9,]/g, ''))} inputMode="decimal" placeholder="0,00" className="w-full h-12 px-4 rounded-2xl text-[18px] font-black outline-none" style={{ border: `1.5px solid ${c.border}`, background: c.background, color: c.textPrimary }} />
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                                {[...new Set([Math.ceil(total), Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100])].filter((v) => v >= total).slice(0, 4).map((v) => (
                                    <button key={v} onClick={() => setRecebido(String(v).replace('.', ','))} className="h-9 px-3 rounded-full text-[12px] font-black" style={{ border: `1px solid ${c.border}` }}>{brl(v)}</button>
                                ))}
                            </div>
                            <div className="flex justify-between items-baseline mt-3"><span className="text-[13px] font-bold">Troco</span><span className="text-[24px] font-black" style={{ color: rec >= total ? '#16a34a' : c.textSecondary }}>{brl(troco)}</span></div>
                            {rec > 0 && rec < total && <p className="text-[11.5px] font-bold" style={{ color: '#dc2626' }}>Faltam {brl(total - rec)}.</p>}
                        </div>
                    )}
                </>
            )}

            {etapa === 'recibo' && recibo && (
                <div className="rounded-3xl p-4" style={card}>
                    <div className="flex flex-col items-center">
                        <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: '#16a34a' }}><Check size={24} /></span>
                        <p className="text-[16px] font-black mt-2">Venda registrada</p>
                        <p className="text-[11.5px]" style={{ color: c.textSecondary }}><Receipt size={12} className="inline mr-1" />nº {recibo.id} · {recibo.quando.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{recibo.cliente ? ` · ${recibo.cliente}` : ''}</p>
                    </div>
                    <div className="mt-3 pt-3 flex flex-col gap-1" style={{ borderTop: `1px dashed ${c.border}` }}>
                        {recibo.itens.map((i) => <div key={i.name} className="flex justify-between text-[12.5px]"><span>{i.q}× {i.name}</span><span className="font-black">{brl(i.v)}</span></div>)}
                        {recibo.desconto > 0 && <div className="flex justify-between text-[12.5px]" style={{ color: '#16a34a' }}><span>Desconto</span><span className="font-black">−{brl(recibo.desconto)}</span></div>}
                        <div className="flex justify-between text-[15px] font-black mt-1"><span>Total · {recibo.forma}</span><span>{brl(recibo.total)}</span></div>
                        {recibo.recebido !== null && <div className="flex justify-between text-[12.5px]" style={{ color: c.textSecondary }}><span>Recebido {brl(recibo.recebido)}</span><span>Troco {brl(recibo.troco)}</span></div>}
                    </div>
                </div>
            )}
        </PaginaPainel>
    )
}
