// src/app/(main)/painel-teste/CatalogoLab.tsx
//
// O CATÁLOGO DA LOJA no laboratório /painel-teste (só teste, dados de exemplo, nada grava): UMA página para tudo o que a loja vende,
// com o MESMO esquema do catálogo que o cliente vê (/<loja>/catalogo): ambientes Produtos · Digitais · Serviços (cada um na sua cor),
// a fileira horizontal de Promoções (combos) no alto de Produtos e os chips de categoria. A diferença é o que cada linha faz: em vez de
// "+ sacola", o lojista tem o interruptor no ar/fora do ar, o selo de estoque e o toque para editar (e ordena as categorias).
// Na versão real isto REAPROVEITA `StoreCatalog` (produto e serviço), `StorePromotions` (combos) e `DigitalContentManager`.
'use client'

import { ReactNode, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronUp, Eye, GraduationCap, ListOrdered, Minus, Package, Plus, Search, Tag, Trash2 } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import { ORANGE, brl } from './dados'
import { FolhaCasca, Switch, useAviso } from './labui'

export type CatAba = 'produtos' | 'digitais' | 'servicos'

const COR: Record<CatAba, string> = { produtos: ORANGE, digitais: '#8b5cf6', servicos: '#14b8a6' }
const NOME: Record<CatAba, string> = { produtos: 'Produtos', digitais: 'Digitais', servicos: 'Serviços' }
const FRASE: Record<CatAba, string> = {
    produtos: 'O que o cliente compra e recebe (entrega ou retirada).',
    digitais: 'Curso, e-book, música e arquivos: o acesso é liberado depois que você confirma o Pix.',
    servicos: 'O cliente escolhe um horário na agenda e você aceita. Não vai para a sacola.',
}
const ICONE: Record<CatAba, ReactNode> = { produtos: <Package size={15} />, digitais: <GraduationCap size={15} />, servicos: <CalendarDays size={15} /> }

interface It { id: number; nome: string; cat: string; preco: number; sub: string; ativo: boolean; estoque?: number; adicionais?: number; volume?: string }
interface Combo { id: number; nome: string; itens: string; preco: number; de: number; ativo: boolean }

// ===== dados de exemplo (33 produtos, 3 digitais, 7 serviços, 4 combos: os mesmos números do painel) =====
function gerarProdutos(): It[] {
    const grupos: [string, string[], number, number][] = [
        ['Tradicionais', ['Margherita', 'Calabresa', 'Portuguesa', 'Mussarela', 'Frango com Catupiry', 'Napolitana', 'Toscana', 'Lombo Canadense'], 59.9, 12],
        ['Especiais', ['Quatro Queijos', 'Carne Seca com Abóbora', 'Camarão', 'Strogonoff', 'Bacon Crocante', 'Funghi', 'Rúcula com Tomate Seco', 'Pepperoni'], 69.9, 14],
        ['Doces', ['Banana com Canela', 'Chocolate com Morango', 'Romeu e Julieta', 'Prestígio', 'Brigadeiro'], 54.9, 6],
        ['Bebidas', ['Refrigerante 2 L', 'Refrigerante lata', 'Suco natural', 'Água com gás', 'Cerveja long neck', 'Guaraná 1 L'], 8, 0],
        ['Porções', ['Batata frita', 'Mandioca frita', 'Onion rings', 'Calabresa acebolada', 'Pão de alho', 'Bolinho de queijo'], 24, 0],
    ]
    const out: It[] = []
    let id = 1
    for (const [cat, nomes, base, ad] of grupos) {
        nomes.forEach((n, i) => {
            const pizza = cat === 'Tradicionais' || cat === 'Especiais' || cat === 'Doces'
            const estoque = n === 'Banana com Canela' ? 0 : n === 'Camarão' ? 3 : undefined
            out.push({ id: id++, nome: pizza ? `Pizza ${n} (grande)` : n, cat, preco: Math.round((base + (pizza ? i * 2 : i * 1.5)) * 10) / 10, sub: '', ativo: n !== 'Rúcula com Tomate Seco', estoque, adicionais: ad || undefined, volume: pizza ? 'Grande' : cat === 'Bebidas' ? 'Médio' : 'Pequeno' })
        })
    }
    return out
}
const DIGITAIS: It[] = [
    { id: 101, nome: 'Curso Pizza Napolitana', cat: 'Curso', preco: 49.9, sub: '12 aulas · 2 h 10 min · 1 aula grátis', ativo: true },
    { id: 102, nome: 'E-book “Massa perfeita”', cat: 'E-book', preco: 19.9, sub: '1 arquivo · 48 páginas', ativo: true },
    { id: 103, nome: 'Receitas de molho (PDF)', cat: 'Arquivo', preco: 0, sub: 'Grátis · 214 pegaram', ativo: true },
]
const SERVICOS: It[] = [
    { id: 201, nome: 'Rodízio adulto', cat: 'Rodízios', preco: 79.9, sub: '2 h · agenda ligada', ativo: true },
    { id: 202, nome: 'Rodízio criança', cat: 'Rodízios', preco: 39.9, sub: '2 h · agenda ligada', ativo: true },
    { id: 203, nome: 'Rodízio premium', cat: 'Rodízios', preco: 109.9, sub: '2 h · agenda ligada', ativo: true },
    { id: 204, nome: 'Mesa no mezanino', cat: 'Mesas', preco: 120, sub: '3 h · com entrada de 30%', ativo: true },
    { id: 205, nome: 'Mesa externa', cat: 'Mesas', preco: 90, sub: '3 h · com entrada de 30%', ativo: false },
    { id: 206, nome: 'Ambiente VIP (3 horas)', cat: 'Ambientes', preco: 360, sub: '3 h · com entrada de 30%', ativo: true },
    { id: 207, nome: 'Ambiente VIP (4 horas)', cat: 'Ambientes', preco: 480, sub: '4 h · com entrada de 30%', ativo: true },
]
const COMBOS: Combo[] = [
    { id: 1, nome: 'Combo Casal', itens: '1 pizza grande + 2 latas', preco: 69.8, de: 83.9, ativo: true },
    { id: 2, nome: 'Combo Doce e Salgada', itens: '1 salgada + 1 doce', preco: 98, de: 114.8, ativo: true },
    { id: 3, nome: 'Combo Família', itens: '2 pizzas + refri 2 L', preco: 139.9, de: 171.8, ativo: true },
    { id: 4, nome: 'Combo Rodízio Dupla', itens: '2 rodízios', preco: 129, de: 159.8, ativo: false },
]
const CATS: Record<CatAba, string[]> = {
    produtos: ['Tradicionais', 'Especiais', 'Doces', 'Bebidas', 'Porções'],
    digitais: ['Curso', 'E-book', 'Arquivo'],
    servicos: ['Rodízios', 'Mesas', 'Ambientes'],
}

export default function CatalogoLab({ c, nova, prod, serv, abaInicial }: { c: ThemeColors; nova: boolean; prod: boolean; serv: boolean; abaInicial?: CatAba }) {
    const abas = useMemo(() => ([prod && 'produtos', prod && !nova && 'digitais', serv && 'servicos'].filter(Boolean) as CatAba[]), [prod, serv, nova])
    const [aba, setAba] = useState<CatAba>(abaInicial && abas.includes(abaInicial) ? abaInicial : abas[0])
    const [cat, setCat] = useState('Todos')
    const [q, setQ] = useState('')
    const [itens, setItens] = useState<Record<CatAba, It[]>>(() => ({ produtos: nova ? [] : gerarProdutos(), digitais: nova ? [] : DIGITAIS, servicos: nova ? [] : SERVICOS }))
    const [combos, setCombos] = useState<Combo[]>(nova ? [] : COMBOS)
    const [cats, setCats] = useState(CATS)
    const [ed, setEd] = useState<It | null>(null)
    const [comboAb, setComboAb] = useState<Combo | 'novo' | null>(null)
    const [catsAb, setCatsAb] = useState(false)
    const { mostrar, node } = useAviso()
    const cor = COR[aba]
    const lista = itens[aba]
    const mudaAba = (a: CatAba) => { setAba(a); setCat('Todos'); setQ('') }
    const filtrados = lista.filter((i) => (cat === 'Todos' || i.cat === cat) && (!q || i.nome.toLowerCase().includes(q.toLowerCase())))
    const contaCat = (k: string) => lista.filter((i) => i.cat === k).length
    const salvar = (i: It) => {
        setItens((m) => ({ ...m, [aba]: i.id ? m[aba].map((x) => (x.id === i.id ? i : x)) : [{ ...i, id: Date.now() }, ...m[aba]] }))
        setEd(null); mostrar(i.id ? 'Salvo' : `${NOME[aba].replace(/s$/, '')} adicionado`)
    }
    const apagar = (id: number) => { setItens((m) => ({ ...m, [aba]: m[aba].filter((x) => x.id !== id) })); setEd(null); mostrar('Apagado') }
    const liga = (id: number, v: boolean) => setItens((m) => ({ ...m, [aba]: m[aba].map((x) => (x.id === id ? { ...x, ativo: v } : x)) }))
    const noAr = lista.filter((i) => i.ativo).length

    return (
        <>
            {/* abas = ambientes, como no catálogo do cliente (só aparecem os tipos que a loja vende) */}
            <div className="flex gap-1.5 mb-2">
                {abas.map((a) => (
                    <button key={a} onClick={() => mudaAba(a)} className="flex-1 h-12 rounded-2xl text-[12.5px] font-black flex flex-col items-center justify-center leading-none gap-0.5 active:scale-95 transition"
                        style={aba === a ? { background: COR[a], color: '#fff' } : { border: `1.5px solid ${c.border}`, color: c.textPrimary }}>
                        <span className="flex items-center gap-1">{ICONE[a]}{NOME[a]}</span>
                        <span className="text-[10.5px] font-bold" style={{ opacity: 0.85 }}>{itens[a].length}{a === 'produtos' && combos.length > 0 ? ` · ${combos.filter((x) => x.ativo).length} combos` : ''}</span>
                    </button>
                ))}
            </div>
            <p className="text-[11.5px] leading-snug mb-3 px-1" style={{ color: c.textSecondary }}>{FRASE[aba]}</p>

            <div className="flex gap-2 mb-3">
                <label className="flex-1 h-11 rounded-full px-3.5 flex items-center gap-2 text-[13px]" style={{ background: c.surface, border: `1.5px solid ${c.border}` }}>
                    <Search size={15} style={{ color: c.textSecondary }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar em ${NOME[aba].toLowerCase()}`} className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: c.textPrimary }} />
                </label>
                <button onClick={() => setEd({ id: 0, nome: '', cat: cats[aba][0], preco: 0, sub: '', ativo: true })} className="h-11 px-4 rounded-full text-[13px] font-black text-white flex items-center gap-1 active:scale-95" style={{ background: cor }}><Plus size={16} />Novo</button>
            </div>
            <div className="flex gap-2 mb-3">
                <button onClick={() => mostrar('Abriria a loja como o cliente vê: /pizzaria-forno-de-ouro/catalogo')} className="flex-1 h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${c.border}` }}><Eye size={14} />Ver como cliente</button>
                <button onClick={() => setCatsAb(true)} className="flex-1 h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${c.border}` }}><ListOrdered size={14} />Ordenar categorias</button>
            </div>

            {/* PROMOÇÕES: a fileira horizontal de combos, no alto de Produtos (igual ao catálogo do cliente) */}
            {aba === 'produtos' && !nova && !q && cat === 'Todos' && (
                <div className="mb-4">
                    <p className="text-[11px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#ef4444' }}><Tag size={13} />Promoções · {combos.filter((x) => x.ativo).length} no ar</p>
                    <div className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                        <button onClick={() => setComboAb('novo')} className="w-[128px] flex-shrink-0 rounded-3xl flex flex-col items-center justify-center gap-1.5 text-[12px] font-black active:scale-95" style={{ border: `1.5px dashed #ef4444`, color: '#ef4444', minHeight: 150 }}><Plus size={20} />Montar combo</button>
                        {combos.map((b) => (
                            <div key={b.id} className="w-[150px] flex-shrink-0 rounded-3xl overflow-hidden flex flex-col" style={{ background: c.surface, border: `1px solid ${c.border}`, opacity: b.ativo ? 1 : 0.6 }}>
                                <button onClick={() => setComboAb(b)} className="text-left active:opacity-80">
                                    <div className="h-14 relative" style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                                        <span className="absolute top-2 left-2 px-2 h-5 rounded-full text-[10px] font-black text-white flex items-center" style={{ background: 'rgba(0,0,0,.35)' }}>COMBO</span>
                                        <span className="absolute top-2 right-2 px-2 h-5 rounded-full text-[10px] font-black text-white flex items-center" style={{ background: '#16a34a' }}>−{Math.round((1 - b.preco / b.de) * 100)}%</span>
                                    </div>
                                    <div className="p-2.5 pb-1.5"><p className="text-[12.5px] font-black leading-tight truncate">{b.nome}</p><p className="text-[10.5px] leading-tight truncate mt-0.5" style={{ color: c.textSecondary }}>{b.itens}</p>
                                        <p className="text-[13px] font-black mt-1">{brl(b.preco)} <span className="text-[10.5px] font-semibold line-through" style={{ color: c.textSecondary }}>{brl(b.de)}</span></p></div>
                                </button>
                                <button onClick={() => setCombos((m) => m.map((x) => (x.id === b.id ? { ...x, ativo: !x.ativo } : x)))} className="mx-2.5 mb-2.5 h-7 rounded-full text-[11px] font-black active:scale-95" style={b.ativo ? { background: '#16a34a22', color: '#16a34a' } : { background: `${c.border}55`, color: c.textSecondary }}>{b.ativo ? '● No ar' : 'Pausado'}</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* chips de categoria (os do cliente), com a contagem */}
            {lista.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
                    {['Todos', ...cats[aba]].map((t) => (
                        <button key={t} onClick={() => setCat(t)} className="h-9 px-3.5 rounded-full text-[12.5px] font-black flex-shrink-0 active:scale-95" style={cat === t ? { background: cor, color: '#fff' } : { border: `1px solid ${c.border}` }}>
                            {t}<span className="ml-1.5 text-[11px] font-bold" style={{ opacity: 0.75 }}>{t === 'Todos' ? lista.length : contaCat(t)}</span>
                        </button>
                    ))}
                </div>
            )}

            {lista.length === 0 ? (
                <div className="rounded-3xl p-6 text-center" style={{ border: `1.5px dashed ${c.border}` }}>
                    <p className="text-[15px] font-black">{aba === 'servicos' ? 'Nenhum serviço ainda' : 'Seu catálogo está vazio'}</p>
                    <p className="text-[12.5px] mt-1 leading-snug" style={{ color: c.textSecondary }}>{aba === 'servicos' ? 'Rodízio, mesa, evento… o cliente escolhe o horário e você aceita.' : 'Comece com 3 produtos: foto, nome e preço bastam. Você completa depois.'}</p>
                    <button onClick={() => setEd({ id: 0, nome: '', cat: cats[aba][0], preco: 0, sub: '', ativo: true })} className="mt-4 h-11 px-5 rounded-full text-[13px] font-black text-white" style={{ background: cor }}>{aba === 'servicos' ? 'Adicionar serviço' : 'Adicionar o primeiro produto'}</button>
                </div>
            ) : (
                <>
                    <div className="rounded-3xl overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                        {filtrados.length === 0 && <p className="text-[12.5px] text-center py-6" style={{ color: c.textSecondary }}>Nada encontrado.</p>}
                        {filtrados.map((i, n) => {
                            const esg = i.estoque === 0
                            return (
                                <div key={i.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: n ? `1px solid ${c.border}` : undefined, opacity: i.ativo ? 1 : 0.55 }}>
                                    <button onClick={() => setEd(i)} className="flex items-center gap-3 min-w-0 flex-1 text-left active:opacity-70">
                                        <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${cor}1f`, color: cor }}>{ICONE[aba]}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[13.5px] font-black leading-tight truncate">{i.nome}</span>
                                            <span className="block text-[11.5px] leading-tight mt-0.5 truncate" style={{ color: c.textSecondary }}>{i.sub || [i.cat, i.adicionais ? `${i.adicionais} adicionais` : null].filter(Boolean).join(' · ')}</span>
                                            <span className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[13px] font-black">{i.preco === 0 ? 'Grátis' : brl(i.preco)}</span>
                                                {esg && <span className="px-1.5 h-4 rounded-full text-[9.5px] font-black text-white flex items-center" style={{ background: '#ef4444' }}>ESGOTADO</span>}
                                                {i.estoque !== undefined && i.estoque > 0 && i.estoque <= 5 && <span className="px-1.5 h-4 rounded-full text-[9.5px] font-black flex items-center" style={{ background: '#eab30833', color: '#a16207' }}>restam {i.estoque}</span>}
                                            </span>
                                        </span>
                                    </button>
                                    <Switch on={i.ativo} set={(v) => liga(i.id, v)} cor={cor} />
                                </div>
                            )
                        })}
                    </div>
                    <p className="text-[11.5px] text-center mt-3" style={{ color: c.textSecondary }}>{noAr} de {lista.length} no ar · desligar o interruptor tira do ar sem apagar.</p>
                </>
            )}

            {aba === 'digitais' && (
                <div className="rounded-3xl p-3.5 mt-3 flex items-center gap-3" style={{ background: `${COR.digitais}12`, border: `1.5px solid ${COR.digitais}44` }}>
                    <GraduationCap size={20} style={{ color: COR.digitais }} />
                    <p className="text-[12px] font-semibold leading-snug flex-1">2 acessos esperam você liberar o Pix. Eles ficam em <b>Digital</b>, no painel.</p>
                </div>
            )}

            {ed && <Edicao it={ed} aba={aba} cats={cats[aba]} c={c} cor={cor} onSalvar={salvar} onApagar={() => apagar(ed.id)} onClose={() => setEd(null)} />}
            {comboAb && <MontarCombo c={c} combo={comboAb === 'novo' ? null : comboAb} onClose={() => setComboAb(null)} onSalvar={(b) => { setCombos((m) => (b.id ? m.map((x) => (x.id === b.id ? b : x)) : [{ ...b, id: Date.now() }, ...m])); setComboAb(null); mostrar('Combo no ar') }} onApagar={(id) => { setCombos((m) => m.filter((x) => x.id !== id)); setComboAb(null); mostrar('Combo apagado') }} />}
            {catsAb && (
                <FolhaCasca titulo="Ordenar categorias" sub={`Ordem em que aparecem para o cliente (${NOME[aba]})`} cor={cor} onClose={() => setCatsAb(false)} z={95}
                    rodape={<button onClick={() => { setCatsAb(false); mostrar('Ordem salva') }} className="w-full h-12 rounded-full text-[14px] font-black text-white" style={{ background: cor }}>Salvar ordem</button>}>
                    <div className="rounded-3xl overflow-hidden mb-3" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                        {cats[aba].map((k, n) => (
                            <div key={k} className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderTop: n ? `1px solid ${c.border}` : undefined }}>
                                <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black">{k}</p><p className="text-[11px]" style={{ color: c.textSecondary }}>{contaCat(k)} {contaCat(k) === 1 ? 'item' : 'itens'}</p></div>
                                <button disabled={n === 0} onClick={() => setCats((m) => { const a = [...m[aba]]; [a[n - 1], a[n]] = [a[n], a[n - 1]]; return { ...m, [aba]: a } })} aria-label="Subir" className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${c.border}` }}><ChevronUp size={16} /></button>
                                <button disabled={n === cats[aba].length - 1} onClick={() => setCats((m) => { const a = [...m[aba]]; [a[n + 1], a[n]] = [a[n], a[n + 1]]; return { ...m, [aba]: a } })} aria-label="Descer" className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${c.border}` }}><ChevronDown size={16} /></button>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11.5px] leading-snug" style={{ color: c.textSecondary }}>Para renomear ou mudar um item de categoria, abra o item. Categoria sem itens some sozinha.</p>
                </FolhaCasca>
            )}
            {node}
        </>
    )
}

// ===== editar / criar um item =====
function Edicao({ it, aba, cats, c, cor, onSalvar, onApagar, onClose }: { it: It; aba: CatAba; cats: string[]; c: ThemeColors; cor: string; onSalvar: (i: It) => void; onApagar: () => void; onClose: () => void }) {
    const [f, setF] = useState<It>(it)
    const [preco, setPreco] = useState(it.preco ? String(it.preco).replace('.', ',') : '')
    const [conf, setConf] = useState(false)
    const campo = { background: c.surface, border: `1.5px solid ${c.border}`, color: c.textPrimary }
    const rot = (t: string) => <p className="text-[11px] font-black uppercase tracking-wider mb-1.5 mt-3.5" style={{ color: c.textSecondary }}>{t}</p>
    const ok = f.nome.trim().length > 1
    return (
        <FolhaCasca titulo={it.id ? `Editar ${NOME[aba].toLowerCase().replace(/s$/, '')}` : `Novo ${NOME[aba].toLowerCase().replace(/s$/, '')}`} sub={it.id ? it.nome : undefined} cor={cor} onClose={onClose} z={95}
            rodape={<div className="flex gap-2">
                {it.id ? <button onClick={() => (conf ? onApagar() : setConf(true))} className="h-12 px-4 rounded-full text-[13px] font-black flex items-center gap-1.5" style={{ border: `1px solid #ef444466`, color: '#ef4444' }}><Trash2 size={15} />{conf ? 'Confirmar' : 'Apagar'}</button> : null}
                <button disabled={!ok} onClick={() => onSalvar({ ...f, preco: Number(preco.replace(',', '.')) || 0 })} className="flex-1 h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: cor }}>Salvar</button>
            </div>}>
            {rot('Nome')}
            <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Como o cliente vê" className="w-full h-12 rounded-2xl px-3.5 text-[14px] font-semibold outline-none" style={campo} />
            {rot(aba === 'servicos' ? 'Valor (opcional)' : 'Preço')}
            <input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder={aba === 'servicos' ? 'Vazio = valor a combinar' : 'R$ 0,00'} className="w-full h-12 rounded-2xl px-3.5 text-[14px] font-semibold outline-none" style={campo} />
            {rot('Categoria')}
            <div className="flex flex-wrap gap-1.5">{cats.map((k) => <button key={k} onClick={() => setF({ ...f, cat: k })} className="h-9 px-3.5 rounded-full text-[12.5px] font-black" style={f.cat === k ? { background: cor, color: '#fff' } : { border: `1px solid ${c.border}` }}>{k}</button>)}</div>
            {aba === 'produtos' && (<>
                {rot('Estoque')}
                <div className="flex gap-1.5">{[['Sem controle', undefined], ['Esgotado', 0], ['Restam 3', 3], ['Restam 20', 20]].map(([t, v]) => <button key={String(t)} onClick={() => setF({ ...f, estoque: v as number | undefined })} className="h-9 px-3 rounded-full text-[12px] font-black" style={f.estoque === v ? { background: cor, color: '#fff' } : { border: `1px solid ${c.border}` }}>{t as string}</button>)}</div>
                {rot('Quanto ocupa na mochila do entregador')}
                <div className="flex gap-1.5">{['Pequeno', 'Médio', 'Grande', 'Extra grande'].map((v) => <button key={v} onClick={() => setF({ ...f, volume: v })} className="h-9 px-3 rounded-full text-[12px] font-black" style={(f.volume || 'Médio') === v ? { background: cor, color: '#fff' } : { border: `1px solid ${c.border}` }}>{v}</button>)}</div>
                <div className="rounded-2xl p-3 mt-3.5 flex items-center gap-3" style={{ border: `1px solid ${c.border}` }}><div className="flex-1"><p className="text-[13px] font-black">Adicionais e bordas</p><p className="text-[11.5px]" style={{ color: c.textSecondary }}>{f.adicionais ? `${f.adicionais} cadastrados` : 'Nenhum ainda'}</p></div><span className="text-[12px] font-black" style={{ color: cor }}>Gerenciar</span></div>
            </>)}
            {aba === 'digitais' && (
                <div className="rounded-2xl p-3 mt-3.5" style={{ border: `1px solid ${c.border}` }}><p className="text-[13px] font-black">Conteúdo</p><p className="text-[11.5px] mt-0.5" style={{ color: c.textSecondary }}>Aulas, arquivos e a prévia da vitrine ficam aqui. Preço R$ 0 = grátis para quem pegar.</p><p className="text-[12px] font-black mt-1.5" style={{ color: cor }}>Gerenciar conteúdo digital</p></div>
            )}
            {aba === 'servicos' && (
                <div className="rounded-2xl p-3 mt-3.5" style={{ border: `1px solid ${c.border}` }}><p className="text-[13px] font-black">Duração e agenda</p><p className="text-[11.5px] mt-0.5" style={{ color: c.textSecondary }}>{f.sub || 'Defina quanto tempo dura. Os horários livres vêm da Agenda da loja.'}</p></div>
            )}
            <div className="flex items-center gap-3 mt-3.5 py-1"><div className="flex-1"><p className="text-[14px] font-black">No ar</p><p className="text-[11.5px]" style={{ color: c.textSecondary }}>Desligado, o cliente não vê.</p></div><Switch on={f.ativo} set={(v) => setF({ ...f, ativo: v })} cor={cor} /></div>
        </FolhaCasca>
    )
}

// ===== montar / editar um combo (some os itens, o lojista diz quanto quer receber e o desconto aparece na hora) =====
const BASE_COMBO: [string, number][] = [['Pizza grande Calabresa', 59.9], ['Refrigerante lata', 6], ['Sobremesa', 18]]
function MontarCombo({ c, combo, onClose, onSalvar, onApagar }: { c: ThemeColors; combo: Combo | null; onClose: () => void; onSalvar: (b: Combo) => void; onApagar: (id: number) => void }) {
    const [qtd, setQtd] = useState<number[]>(combo ? [1, 2, 0] : [1, 2, 0])
    const [nome, setNome] = useState(combo?.nome || '')
    const soma = BASE_COMBO.reduce((s, [, p], i) => s + p * qtd[i], 0)
    const [valor, setValor] = useState(combo ? combo.preco : 59.9)
    const alvo = Math.min(valor, soma)
    const pct = soma > 0 ? Math.round((1 - alvo / soma) * 100) : 0
    const itensTxt = BASE_COMBO.map(([n], i) => (qtd[i] ? `${qtd[i]}× ${n.split(' ')[0]}` : null)).filter(Boolean).join(' + ')
    const ok = nome.trim().length > 1 && soma > 0 && alvo <= soma
    return (
        <FolhaCasca titulo={combo ? 'Editar combo' : 'Montar um combo'} sub="Junte itens que você já vende por um preço menor" cor="#ef4444" onClose={onClose} z={95}
            rodape={<div className="flex gap-2">
                {combo && <button onClick={() => onApagar(combo.id)} className="h-12 px-4 rounded-full text-[13px] font-black flex items-center gap-1.5" style={{ border: '1px solid #ef444466', color: '#ef4444' }}><Trash2 size={15} />Apagar</button>}
                <button disabled={!ok} onClick={() => onSalvar({ id: combo?.id || 0, nome, itens: itensTxt, preco: alvo, de: soma, ativo: true })} className="flex-1 h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: '#ef4444' }}>Publicar combo</button>
            </div>}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do combo (ex.: Combo Casal)" className="w-full h-12 rounded-2xl px-3.5 text-[14px] font-semibold outline-none mb-3" style={{ background: c.surface, border: `1.5px solid ${c.border}`, color: c.textPrimary }} />
            <div className="rounded-3xl overflow-hidden mb-3" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                {BASE_COMBO.map(([n, p], i) => (
                    <div key={n} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}>
                        <div className="min-w-0 flex-1"><p className="text-[13px] font-black truncate">{n}</p><p className="text-[11.5px]" style={{ color: c.textSecondary }}>{brl(p)} cada</p></div>
                        <button onClick={() => setQtd((q) => q.map((x, j) => (j === i ? Math.max(0, x - 1) : x)))} aria-label="Menos" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}` }}><Minus size={14} /></button>
                        <span className="w-5 text-center text-[14px] font-black">{qtd[i]}</span>
                        <button onClick={() => setQtd((q) => q.map((x, j) => (j === i ? Math.min(20, x + 1) : x)))} aria-label="Mais" className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: '#ef4444' }}><Plus size={14} /></button>
                    </div>
                ))}
                <div className="flex justify-between px-3.5 py-2.5 text-[13px] font-black" style={{ borderTop: `1px solid ${c.border}` }}><span>Soma de tudo</span><span>{brl(soma)}</span></div>
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: c.textSecondary }}>Quanto você quer receber pelo combo</p>
            <div className="flex items-center gap-2">
                <span className="flex-1 h-12 rounded-2xl px-3.5 flex items-center text-[15px] font-black" style={{ background: c.surface, border: `1.5px solid ${c.border}` }}>{brl(alvo)}</span>
                <span className="px-3.5 h-12 rounded-2xl flex items-center text-[14px] font-black text-white" style={{ background: pct > 0 ? '#16a34a' : '#9ca3af' }}>−{pct}%</span>
            </div>
            <div className="flex gap-1.5 mt-2">{[10, 15, 20, 30].map((p) => <button key={p} onClick={() => setValor(Math.round(soma * (1 - p / 100) * 10) / 10)} className="h-8 px-3 rounded-full text-[11.5px] font-black active:scale-95" style={{ border: `1px solid ${c.border}` }}>−{p}%</button>)}</div>
            <p className="text-[11.5px] mt-3 leading-snug" style={{ color: c.textSecondary }}>Cliente economiza {brl(soma - alvo)}. O combo nunca pode custar mais que a soma dos itens.</p>
            {ok && <p className="text-[11.5px] mt-1 flex items-center gap-1" style={{ color: '#16a34a' }}><Check size={13} />Entra na fileira Promoções do catálogo e na vitrine da home.</p>}
        </FolhaCasca>
    )
}
