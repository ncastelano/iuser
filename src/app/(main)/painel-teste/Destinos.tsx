// src/app/(main)/painel-teste/Destinos.tsx
//
// Os DESTINOS dos atalhos de "Gerenciar a loja" do laboratório /painel-teste (só teste, dados de exemplo, nada grava).
// Critério proposto: FOLHA (dialog que sobe da barra) quando é um interruptor + poucas decisões; PÁGINA quando é uma lista
// que a loja edita item a item (cresce, precisa de busca e rolagem). Na versão real a folha abre por `?abrir=<chave>` (o voltar
// do navegador fecha) e a página é `/editar-loja/<slug>/<seção>`.
'use client'

import { ReactNode, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Clock, Heart, Package, Plus, Search, Star, Trash2, X } from 'lucide-react'
import { useTheme, type ThemeColors } from '@/app/contexts/theme'
import AgendaPagina from './AgendaLab'

export type Tipo = 'folha' | 'pagina'

// o que cada atalho abre, e onde isso mora no app de verdade (para a conversa de "ligar")
export const DESTINOS: Record<string, { tipo: Tipo; titulo: string; rota: string; comp: string }> = {
    cat: { tipo: 'pagina', titulo: 'Catálogo', rota: '/editar-loja/<slug>/catalogo', comp: 'StoreCatalog kind="product"' },
    srv: { tipo: 'pagina', titulo: 'Serviços', rota: '/editar-loja/<slug>/servicos', comp: 'StoreCatalog kind="service"' },
    pro: { tipo: 'pagina', titulo: 'Promoções', rota: '/editar-loja/<slug>/promocoes', comp: 'StorePromotions' },
    eqp: { tipo: 'pagina', titulo: 'Equipe', rota: '/editar-loja/<slug>/equipe', comp: 'Employee' },
    pub: { tipo: 'pagina', titulo: 'Publicações', rota: '/editar-loja/<slug>/publicacoes', comp: 'StorePublication' },
    inf: { tipo: 'folha', titulo: 'Dados da loja', rota: '?abrir=dados', comp: 'StoreDescription + StoreLinksEditor + StoreModelEditor' },
    ent: { tipo: 'folha', titulo: 'Entrega', rota: '?abrir=entrega', comp: 'StoreDeliverySettings' },
    pag: { tipo: 'folha', titulo: 'Pagamento', rota: '?abrir=pagamento', comp: 'StorePaymentMethods' },
    hor: { tipo: 'folha', titulo: 'Horários', rota: '?abrir=horarios', comp: 'StoreOperatingDays' },
    age: { tipo: 'pagina', titulo: 'Agenda', rota: '/compromissos/<slug>', comp: 'CompromissosView (aba da loja)' },
    agc: { tipo: 'folha', titulo: 'Regras da agenda', rota: '?abrir=agenda', comp: 'StoreDepositEditor + StoreModelEditor' },
    clu: { tipo: 'folha', titulo: 'Clube VIP', rota: '?abrir=clube', comp: 'StoreClubVip' },
    zap: { tipo: 'folha', titulo: 'WhatsApp', rota: '?abrir=whatsapp', comp: 'StoreWhatsAppBot' },
}

const ORANGE = '#f97316'

interface Props { k: string; cor: string; icone: ReactNode; nova: boolean; on: boolean; setOn: (v: boolean) => void; entregaOn: boolean; onClose: () => void }

export function Destino(p: Props) {
    const { colors } = useTheme()
    const d = DESTINOS[p.k]
    const body = conteudo(p, colors)
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    void card

    if (d.tipo === 'pagina') {
        return (
            <div className="fixed inset-x-0 top-0 z-[80] flex justify-center" style={{ background: colors.surface, bottom: 'var(--staging-banner-h, 0px)' }}>
                <div className="w-full max-w-md h-full flex flex-col" style={{ background: colors.background, boxShadow: '0 0 0 1px ' + colors.border }}>
                    <div className="flex items-center gap-2.5 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2.5" style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <button onClick={p.onClose} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90" style={{ border: `1px solid ${colors.border}` }}><ArrowLeft size={18} /></button>
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${p.cor}26`, color: p.cor }}>{p.icone}</span>
                        <div className="min-w-0"><p className="text-[16px] font-black leading-tight">{d.titulo}</p><p className="text-[11px]" style={{ color: colors.textSecondary }}>Pizzaria Forno de Ouro</p></div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28">{body}</div>
                </div>
            </div>
        )
    }
    return (
        <div className="fixed inset-x-0 top-0 z-[80] flex items-end justify-center" style={{ bottom: 'var(--staging-banner-h, 0px)' }}>
            <button aria-label="Fechar" onClick={p.onClose} className="absolute inset-0" style={{ background: 'rgba(0,0,0,.5)' }} />
            <div className="relative w-full max-w-md max-h-[88dvh] flex flex-col rounded-t-[28px]" style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: '0 -20px 50px rgba(0,0,0,.35)' }}>
                <div className="pt-2.5 flex justify-center"><span className="w-10 h-1.5 rounded-full" style={{ background: `${colors.border}` }} /></div>
                <div className="flex items-center gap-2.5 px-4 pt-2 pb-3">
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${p.cor}26`, color: p.cor }}>{p.icone}</span>
                    <div className="min-w-0 flex-1"><p className="text-[17px] font-black leading-tight">{d.titulo}</p></div>
                    <button onClick={p.onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}><X size={16} /></button>
                </div>
                <div className="overflow-y-auto px-4 pb-3">{body}</div>
                <div className="px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <button onClick={p.onClose} className="w-full h-12 rounded-full text-[14px] font-black text-white active:scale-95 transition" style={{ background: p.cor }}>Salvar</button>
                </div>
            </div>
        </div>
    )
}

type Colors = ThemeColors

function conteudo(p: Props, c: Colors): ReactNode {
    switch (p.k) {
        case 'inf': return <Dados {...p} c={c} />
        case 'ent': return <Entrega {...p} c={c} />
        case 'pag': return <Pagamento {...p} c={c} />
        case 'hor': return <Horarios {...p} c={c} />
        case 'age': return <AgendaPag {...p} c={c} />
        case 'agc': return <Agenda {...p} c={c} />
        case 'clu': return <Clube {...p} c={c} />
        case 'zap': return <Whats {...p} c={c} />
        case 'cat': return <Catalogo {...p} c={c} />
        case 'srv': return <Servicos {...p} c={c} />
        case 'pro': return <Promocoes {...p} c={c} />
        case 'eqp': return <Equipe {...p} c={c} />
        default: return <Publicacoes {...p} c={c} />
    }
}

// ===== peças =====
function Switch({ on, set, cor }: { on: boolean; set: (v: boolean) => void; cor: string }) {
    return (
        <button onClick={() => set(!on)} role="switch" aria-checked={on} className="relative w-14 h-8 rounded-full flex-shrink-0 transition active:scale-95" style={{ background: on ? cor : '#9ca3af66' }}>
            <span className="absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: on ? 28 : 4 }} />
        </button>
    )
}
/** linha "texto + interruptor" */
function Linha({ c, titulo, sub, on, set, cor }: { c: Colors; titulo: string; sub?: string; on: boolean; set: (v: boolean) => void; cor: string }) {
    return (
        <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="text-[14px] font-black leading-tight">{titulo}</p>{sub && <p className="text-[11.5px] leading-snug mt-0.5" style={{ color: c.textSecondary }}>{sub}</p>}</div>
            <Switch on={on} set={set} cor={cor} />
        </div>
    )
}
/** faixa de estado no alto da folha: "Ligado/Desligado" com o interruptor */
function Estado({ c, on, set, cor, ligado, desligado }: { c: Colors; on: boolean; set: (v: boolean) => void; cor: string; ligado: string; desligado: string }) {
    return (
        <div className="rounded-3xl p-3.5 flex items-center gap-3 mb-3" style={{ background: on ? `${cor}14` : `${c.border}30`, border: `1.5px solid ${on ? `${cor}66` : c.border}` }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: on ? '#16a34a' : '#9ca3af', boxShadow: on ? '0 0 0 3px #16a34a33' : undefined }} />
            <div className="min-w-0 flex-1"><p className="text-[14px] font-black leading-tight">{on ? ligado : desligado}</p></div>
            <Switch on={on} set={set} cor={cor} />
        </div>
    )
}
function Campo({ c, label, valor, dica, aviso }: { c: Colors; label: string; valor: string; dica?: string; aviso?: boolean }) {
    return (
        <label className="block mb-3">
            <span className="text-[11.5px] font-black" style={{ color: c.textSecondary }}>{label}</span>
            <span className="block h-12 rounded-2xl px-3.5 flex items-center text-[14px] font-semibold mt-1" style={{ background: c.surface, border: `1.5px solid ${aviso ? '#ef4444aa' : c.border}`, color: valor ? c.textPrimary : c.textSecondary }}>{valor || 'Toque para preencher'}</span>
            {dica && <span className="block text-[11px] mt-1 leading-snug" style={{ color: aviso ? '#ef4444' : c.textSecondary }}>{dica}</span>}
        </label>
    )
}
function Chips<T extends string>({ c, itens, valor, set, cor }: { c: Colors; itens: [T, string][]; valor: T; set: (v: T) => void; cor: string }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {itens.map(([k, l]) => (
                <button key={k} onClick={() => set(k)} className="h-9 px-3.5 rounded-full text-[12.5px] font-black active:scale-95" style={valor === k ? { background: cor, color: '#fff' } : { border: `1px solid ${c.border}` }}>{l}</button>
            ))}
        </div>
    )
}
function Aviso({ c, cor, children }: { c: Colors; cor: string; children: ReactNode }) {
    void c
    return <div className="rounded-2xl p-3 text-[12px] leading-snug font-semibold mb-3" style={{ background: `${cor}12`, border: `1px solid ${cor}55` }}>{children}</div>
}
function Titulo({ c, children }: { c: Colors; children: ReactNode }) { return <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-2" style={{ color: c.textSecondary }}>{children}</p> }

// ===== FOLHAS =====
function Entrega({ c, cor, on, setOn }: Props & { c: Colors }) {
    const [modo, setModo] = useState<'iuser' | 'propria'>('iuser')
    const [retira, setRetira] = useState(true)
    const [zap, setZap] = useState(false)
    return (
        <>
            <Estado c={c} on={on} set={setOn} cor={cor} ligado="Entrega em casa ligada" desligado="Sem entrega em casa — só retirada" />
            {on && (
                <>
                    <Titulo c={c}>Quem leva o pedido?</Titulo>
                    {([['iuser', 'Entregador do iUser', 'O iUser cuida do motorista e do frete. Você só recebe o pedido depois que um entregador aceitar.', 'Frete pela Tarifa iUser'], ['propria', 'Eu entrego', 'Sua equipe leva. Você define quanto cobra e até onde vai.', 'Frete definido por você']] as const).map(([k, t, s, f]) => (
                        <button key={k} onClick={() => setModo(k)} className="w-full text-left rounded-3xl p-3.5 mb-2 flex gap-3 active:scale-[.99]" style={{ background: modo === k ? `${cor}12` : c.surface, border: `2px solid ${modo === k ? cor : c.border}` }}>
                            <span className="w-5 h-5 rounded-full mt-0.5 flex items-center justify-center flex-shrink-0" style={modo === k ? { background: cor, color: '#fff' } : { border: `2px solid ${c.border}` }}>{modo === k && <Check size={12} />}</span>
                            <span><span className="block text-[14px] font-black">{t}</span><span className="block text-[12px] leading-snug mt-0.5" style={{ color: c.textSecondary }}>{s}</span><span className="inline-block text-[10.5px] font-black mt-1.5 px-2 py-0.5 rounded-full" style={{ background: `${cor}22`, color: cor }}>{f}</span></span>
                        </button>
                    ))}
                    {modo === 'propria' && <><Campo c={c} label="Quanto você cobra" valor="R$ 7,00" /><Campo c={c} label="Até quantos km" valor="8 km" /><Aviso c={c} cor={cor}>Quem entrega é a sua <b>equipe</b> (Gerenciar → Equipe).</Aviso></>}
                </>
            )}
            <Titulo c={c}>Outras formas</Titulo>
            <div style={{ borderTop: `1px solid ${c.border}` }}><Linha c={c} titulo="Retirada na loja" sub="O cliente busca e não paga frete." on={retira} set={setRetira} cor={cor} /></div>
            <div style={{ borderTop: `1px solid ${c.border}` }}><Linha c={c} titulo="Aviso pelo WhatsApp" sub="Abre o WhatsApp da loja quando o cliente pedir." on={zap} set={setZap} cor={cor} /></div>
            {!on && !retira && <Aviso c={c} cor="#ef4444">Sem entrega nem retirada, ninguém consegue comprar. Ligue pelo menos uma.</Aviso>}
        </>
    )
}

function Dados({ c, cor, nova }: Props & { c: Colors }) {
    const [modelo, setModelo] = useState<'products' | 'services' | 'mixed'>('mixed')
    return (
        <>
            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-3xl h-24 flex flex-col items-center justify-center gap-1 text-center" style={{ background: nova ? c.surface : '#b91c1c', color: nova ? c.textSecondary : '#fff', border: nova ? `1.5px dashed ${c.border}` : 'none' }}><Plus size={18} /><span className="text-[11px] font-black">{nova ? 'Logo' : 'Trocar logo'}</span></div>
                <div className="col-span-2 rounded-3xl h-24 flex flex-col items-center justify-center gap-1 text-center" style={{ background: c.surface, border: `1.5px dashed ${c.border}`, color: c.textSecondary }}><Plus size={18} /><span className="text-[11px] font-black">Foto de capa (opcional)</span></div>
            </div>
            <Campo c={c} label="Nome da loja" valor="Pizzaria Forno de Ouro" />
            <Campo c={c} label="Descrição" valor="Pizzas artesanais no forno a lenha, rodízio e ambiente VIP." dica="É o que aparece embaixo do nome na página da loja." />
            <Titulo c={c}>Links</Titulo>
            {[['Cardápio completo', 'fornodeouro.com.br/cardapio'], ['Instagram', 'instagram.com/fornodeouro']].map(([t, u]) => <div key={t} className="rounded-2xl px-3.5 py-2.5 mb-1.5 text-[12.5px]" style={{ background: c.surface, border: `1px solid ${c.border}` }}><b>{t}</b><span className="block text-[11px]" style={{ color: c.textSecondary }}>{u}</span></div>)}
            <Titulo c={c}>O que a loja vende</Titulo>
            <Chips c={c} itens={[['products', 'Produtos'], ['services', 'Serviços'], ['mixed', 'Produtos e serviços']]} valor={modelo} set={setModelo} cor={cor} />
            <p className="text-[11.5px] mt-2 leading-snug" style={{ color: c.textSecondary }}>Muda os botões da página da loja (Comprar, Agendar ou os dois). Nenhum preço nem pedido depende disso.</p>
            <button className="w-full mt-5 h-11 rounded-full text-[12.5px] font-black" style={{ border: `1px solid #ef444477`, color: '#ef4444' }}>Excluir a loja</button>
        </>
    )
}

function Pagamento({ c, cor, nova }: Props & { c: Colors }) {
    const [m, setM] = useState({ pix: true, cartao: true, dinheiro: !nova, combinar: false })
    const tog = (k: keyof typeof m) => setM((s) => ({ ...s, [k]: !s[k] }))
    return (
        <>
            <Campo c={c} label="Chave Pix da loja" valor={nova ? '' : 'pizzaria@fornodeouro.com.br'} aviso={nova} dica={nova ? 'Sem a chave a loja não recebe entrada, apoio nem repasse.' : 'O dinheiro vai direto para a sua conta. O iUser não toca nele.'} />
            <Titulo c={c}>O que a loja aceita</Titulo>
            {([['pix', 'Pix', 'O cliente paga na sua chave e avisa que pagou.'], ['cartao', 'Cartão na entrega', 'O entregador leva a maquininha da loja.'], ['dinheiro', 'Dinheiro', 'O entregador fica com o frete e repassa o resto.'], ['combinar', 'Combinar com o cliente', 'Para pedidos especiais, pelo chat.']] as const).map(([k, t, s], i) => (
                <div key={k} style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}><Linha c={c} titulo={t} sub={s} on={m[k]} set={() => tog(k)} cor={cor} /></div>
            ))}
        </>
    )
}

function Horarios({ c, cor }: Props & { c: Colors }) {
    const [dias, setDias] = useState([false, true, true, true, true, true, true])
    const [h24, setH24] = useState(false)
    const nomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    return (
        <>
            <div className="rounded-3xl px-3.5" style={{ background: c.surface, border: `1px solid ${c.border}` }}><Linha c={c} titulo="Aberta 24 horas" sub="Todos os dias, sem fechar." on={h24} set={setH24} cor={cor} /></div>
            {!h24 && (
                <div className="rounded-3xl overflow-hidden mt-3" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                    {nomes.map((n, i) => (
                        <div key={n} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${c.border}` : undefined, opacity: dias[i] ? 1 : 0.55 }}>
                            <Switch on={dias[i]} set={(v) => setDias((a) => a.map((x, j) => (j === i ? v : x)))} cor={cor} />
                            <p className="text-[13.5px] font-black w-20">{n}</p>
                            {dias[i] ? <span className="ml-auto flex items-center gap-1.5 text-[13px] font-bold"><Clock size={13} style={{ color: cor }} />18:00 – 00:00</span> : <span className="ml-auto text-[12px] font-semibold" style={{ color: c.textSecondary }}>Fechado</span>}
                        </div>
                    ))}
                </div>
            )}
            <button className="w-full mt-3 h-10 rounded-full text-[12.5px] font-black" style={{ background: `${c.border}40` }}>Repetir o primeiro horário em todos os dias</button>
        </>
    )
}

function Agenda({ c, cor, on, setOn }: Props & { c: Colors }) {
    const [ent, setEnt] = useState(true)
    const [modo, setModo] = useState<'pct' | 'fixo'>('pct')
    const [pct, setPct] = useState<'30' | '50' | '100'>('30')
    return (
        <>
            <Estado c={c} on={on} set={setOn} cor={cor} ligado="Clientes podem agendar serviços" desligado="Agenda fechada — ninguém agenda" />
            {on && (
                <>
                    <div className="rounded-3xl px-3.5" style={{ background: c.surface, border: `1px solid ${c.border}` }}><Linha c={c} titulo="Pedir entrada para confirmar" sub="O horário só fica seu depois do Pix da entrada." on={ent} set={setEnt} cor={cor} /></div>
                    {ent && (
                        <>
                            <Titulo c={c}>Quanto pedir</Titulo>
                            <Chips c={c} itens={[['pct', 'Porcentagem'], ['fixo', 'Valor fixo']]} valor={modo} set={setModo} cor={cor} />
                            <div className="mt-2.5">{modo === 'pct' ? <Chips c={c} itens={[['30', '30%'], ['50', '50%'], ['100', 'Valor total']]} valor={pct} set={setPct} cor={cor} /> : <Campo c={c} label="Valor da entrada" valor="R$ 40,00" />}</div>
                            <Titulo c={c}>Se o cliente cancelar</Titulo>
                            <Campo c={c} label="Sua política (o iUser só registra)" valor="Cancelamento até 24 h antes devolve a entrada." />
                            <Aviso c={c} cor={cor}>O cliente paga no <b>seu Pix</b> e toca “Já paguei”. Você confere e toca “Recebi”. O horário reservado expira em 30 min sem pagamento.</Aviso>
                        </>
                    )}
                </>
            )}
        </>
    )
}

function Clube({ c, cor, on, setOn }: Props & { c: Colors }) {
    const [preco, setPreco] = useState<'0' | '5' | '10' | '20'>('0')
    const [musica, setMusica] = useState(false)
    return (
        <>
            <Estado c={c} on={on} set={setOn} cor={cor} ligado="Clube VIP aberto para entrar" desligado="Clube VIP desligado" />
            {on && (
                <>
                    <div className="grid grid-cols-3 gap-2 mb-1 text-center">
                        {[['38', 'membros'], ['1', 'pagamento a conferir'], ['R$ 0', 'mensalidade']].map(([v, l]) => <div key={l} className="rounded-2xl py-2.5 px-1" style={{ background: c.surface, border: `1px solid ${c.border}` }}><p className="text-[17px] font-black leading-none" style={{ color: cor }}>{v}</p><p className="text-[10px] font-bold mt-1 leading-tight" style={{ color: c.textSecondary }}>{l}</p></div>)}
                    </div>
                    <Titulo c={c}>Mensalidade</Titulo>
                    <Chips c={c} itens={[['0', 'Grátis'], ['5', 'R$ 5'], ['10', 'R$ 10'], ['20', 'R$ 20']]} valor={preco} set={setPreco} cor={cor} />
                    <div className="mt-2" style={{ borderTop: `1px solid ${c.border}` }}><Linha c={c} titulo="Inclui ouvir todas as músicas" sub="Os membros abrem as músicas da loja sem comprar uma a uma." on={musica} set={setMusica} cor={cor} /></div>
                    {preco !== '0' && <Aviso c={c} cor={cor}>Pagamento por Pix na sua chave, conferido por você. Cada confirmação vale 30 dias.</Aviso>}
                </>
            )}
        </>
    )
}

function Whats({ c, cor, on, setOn }: Props & { c: Colors }) {
    return (
        <>
            <Estado c={c} on={on} set={setOn} cor={cor} ligado="Avisos pelo WhatsApp ligados" desligado="Avisos pelo WhatsApp desligados" />
            {on && <Campo c={c} label="Número da loja" valor="(69) 99999-0000" dica="Os pedidos continuam entrando pelo iUser; o WhatsApp só avisa." />}
            <Titulo c={c}>O que ele avisa</Titulo>
            {['Pedido novo (com o valor)', 'Pedido aceito pelo entregador', 'Cliente chegou para retirar'].map((t) => <p key={t} className="flex items-center gap-2 text-[13px] font-semibold py-1"><Check size={14} style={{ color: on ? '#16a34a' : c.textSecondary }} />{t}</p>)}
        </>
    )
}

// ===== PÁGINAS =====
/** a página da agenda; a engrenagem abre as regras (entrada, agenda ligada) como folha por cima */
function AgendaPag(p: Props & { c: Colors }) {
    const [cfg, setCfg] = useState(false)
    return (
        <>
            <AgendaPagina c={p.c} cor={p.cor} onConfig={() => setCfg(true)} />
            {cfg && <Destino {...p} k="agc" onClose={() => setCfg(false)} />}
        </>
    )
}

function Topo({ c, cor, buscar, novo }: { c: Colors; cor: string; buscar: string; novo: string }) {
    return (
        <div className="flex gap-2 mb-3">
            <div className="flex-1 h-11 rounded-full px-3.5 flex items-center gap-2 text-[13px]" style={{ background: c.surface, border: `1.5px solid ${c.border}`, color: c.textSecondary }}><Search size={15} />{buscar}</div>
            <button className="h-11 px-4 rounded-full text-[13px] font-black text-white flex items-center gap-1 active:scale-95" style={{ background: cor }}><Plus size={16} />{novo}</button>
        </div>
    )
}
function Item({ c, cor, titulo, sub, direita, ativo, set }: { c: Colors; cor: string; titulo: string; sub: string; direita: string; ativo: boolean; set: (v: boolean) => void }) {
    return (
        <div className="flex items-center gap-3 px-3 py-2.5" style={{ opacity: ativo ? 1 : 0.55 }}>
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${cor}1f`, color: cor }}><Package size={20} /></span>
            <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black leading-tight truncate">{titulo}</p><p className="text-[11.5px] leading-tight mt-0.5 truncate" style={{ color: c.textSecondary }}>{sub}</p><p className="text-[13px] font-black mt-0.5">{direita}</p></div>
            <Switch on={ativo} set={set} cor={cor} />
        </div>
    )
}
function Lista({ c, cor, dados }: { c: Colors; cor: string; dados: [string, string, string][] }) {
    const [ativos, setAtivos] = useState<boolean[]>(dados.map((_, i) => i !== 3))
    return (
        <div className="rounded-3xl overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
            {dados.map(([t, s, d], i) => <div key={t} style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}><Item c={c} cor={cor} titulo={t} sub={s} direita={d} ativo={ativos[i]} set={(v) => setAtivos((a) => a.map((x, j) => (j === i ? v : x)))} /></div>)}
        </div>
    )
}
function Vazia({ c, titulo, texto, botao }: { c: Colors; titulo: string; texto: string; botao: string }) {
    return (
        <div className="rounded-3xl p-6 text-center" style={{ border: `1.5px dashed ${c.border}` }}>
            <p className="text-[15px] font-black">{titulo}</p><p className="text-[12.5px] mt-1 leading-snug" style={{ color: c.textSecondary }}>{texto}</p>
            <button className="mt-4 h-11 px-5 rounded-full text-[13px] font-black text-white" style={{ background: ORANGE }}>{botao}</button>
        </div>
    )
}

function Catalogo({ c, cor, nova }: Props & { c: Colors }) {
    const [cat, setCat] = useState('Todos')
    if (nova) return <Vazia c={c} titulo="Seu catálogo está vazio" texto="Comece com 3 produtos: foto, nome e preço bastam. Você completa depois." botao="Adicionar o primeiro produto" />
    return (
        <>
            <Topo c={c} cor={cor} buscar="Buscar nos 33 produtos" novo="Novo" />
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
                {['Todos', 'Combos', 'Tradicionais', 'Especiais', 'Doces', 'Bebidas', 'Porções'].map((t) => <button key={t} onClick={() => setCat(t)} className="h-9 px-3.5 rounded-full text-[12.5px] font-black flex-shrink-0 active:scale-95" style={cat === t ? { background: cor, color: '#fff' } : { border: `1px solid ${c.border}` }}>{t}</button>)}
            </div>
            <Lista c={c} cor={cor} dados={[['Pizza Margherita (grande)', 'Tradicionais · 12 adicionais', 'R$ 59,90'], ['Pizza Portuguesa (grande)', 'Tradicionais · 12 adicionais', 'R$ 64,90'], ['Pizza Quatro Queijos (grande)', 'Especiais · 14 adicionais', 'R$ 69,90'], ['Pizza Banana com Canela (grande)', 'Doces · esgotada', 'R$ 54,90'], ['Refrigerante 2 L', 'Bebidas', 'R$ 12,00']]} />
            <p className="text-[11.5px] text-center mt-3" style={{ color: c.textSecondary }}>Desligar o interruptor tira o produto do ar sem apagar.</p>
        </>
    )
}
function Servicos({ c, cor, nova }: Props & { c: Colors }) {
    if (nova) return <Vazia c={c} titulo="Nenhum serviço ainda" texto="Rodízio, mesa, evento… o cliente escolhe o horário e você aceita." botao="Adicionar serviço" />
    return (
        <>
            <Topo c={c} cor={cor} buscar="Buscar nos 7 serviços" novo="Novo" />
            <Lista c={c} cor={cor} dados={[['Rodízio adulto', '2 h · agenda ligada', 'R$ 79,90'], ['Rodízio premium', '2 h · agenda ligada', 'R$ 109,90'], ['Mesa no mezanino', '3 h · com entrada', 'R$ 120,00'], ['Ambiente VIP (4 horas)', '4 h · com entrada', 'R$ 480,00']]} />
        </>
    )
}
function Promocoes({ c, cor }: Props & { c: Colors }) {
    return (
        <>
            <div className="rounded-3xl p-3.5 mb-4" style={{ background: `${cor}12`, border: `1.5px solid ${cor}55` }}>
                <p className="text-[13px] font-black mb-2">Montar um combo</p>
                {[['1× Pizza grande Calabresa', 'R$ 59,90'], ['2× Refrigerante lata', 'R$ 12,00']].map(([a, b]) => <div key={a} className="flex justify-between text-[12.5px] font-semibold py-1"><span>{a}</span><span>{b}</span></div>)}
                <div className="flex justify-between text-[12.5px] font-black pt-1.5 mt-1" style={{ borderTop: `1px solid ${c.border}` }}><span>Soma de tudo</span><span>R$ 71,90</span></div>
                <div className="flex items-center gap-2 mt-2.5"><span className="flex-1 h-11 rounded-2xl px-3.5 flex items-center text-[14px] font-black" style={{ background: c.background, border: `1.5px solid ${c.border}` }}>Você recebe R$ 59,90</span><span className="px-3 h-11 rounded-2xl flex items-center text-[13px] font-black text-white" style={{ background: '#16a34a' }}>−17%</span></div>
                <div className="flex gap-1.5 mt-2">{['−10%', '−15%', '−20%', '−30%'].map((t) => <span key={t} className="h-8 px-3 rounded-full text-[11.5px] font-black flex items-center" style={{ border: `1px solid ${c.border}` }}>{t}</span>)}</div>
                <button className="w-full mt-3 h-11 rounded-full text-[13px] font-black text-white" style={{ background: cor }}>Publicar combo</button>
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: c.textSecondary }}>No ar</p>
            <Lista c={c} cor={cor} dados={[['Combo Casal', '1 pizza grande + 2 latas', 'R$ 69,80'], ['Combo Doce e Salgada', '1 salgada + 1 doce', 'R$ 98,00'], ['Combo Família', '2 pizzas + refri 2 L', 'R$ 139,90'], ['Combo Rodízio Dupla', '2 rodízios', 'R$ 129,00']]} />
        </>
    )
}
function Equipe({ c, cor, nova }: Props & { c: Colors }) {
    if (nova) return <Vazia c={c} titulo="Só você por enquanto" texto="Adicione quem atende pedidos ou entrega para a loja. Cada um ganha o seu link." botao="Adicionar pessoa" />
    return (
        <>
            <Topo c={c} cor={cor} buscar="Buscar na equipe" novo="Pessoa" />
            <div className="rounded-3xl overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                {[['Marcos', 'Atendente · ativo', '—'], ['Luiza', 'Cozinha · ativa', '—']].map(([n, f], i) => (
                    <div key={n} className="flex items-center gap-3 px-3.5 py-3" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}>
                        <span className="w-11 h-11 rounded-full flex items-center justify-center font-black text-white" style={{ background: cor }}>{n[0]}</span>
                        <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black">{n}</p><p className="text-[11.5px]" style={{ color: c.textSecondary }}>{f}</p></div>
                        <ChevronRight size={16} style={{ color: c.textSecondary }} />
                    </div>
                ))}
            </div>
            <p className="text-[11.5px] mt-3 leading-snug" style={{ color: c.textSecondary }}>Entregadores do iUser não entram aqui: eles são escolhidos em <b>Entrega</b> e <b>Favoritos</b>.</p>
        </>
    )
}
function Publicacoes({ c, cor, nova }: Props & { c: Colors }) {
    if (nova) return <Vazia c={c} titulo="Nenhuma publicação" texto="Mostre uma promoção, um prato novo ou um aviso. Aparece no perfil da loja e no Social." botao="Fazer a primeira publicação" />
    return (
        <>
            <Topo c={c} cor={cor} buscar="Buscar nas publicações" novo="Nova" />
            <div className="space-y-2">
                {[['Noite do Rodízio: quinta tem sobremesa grátis', 128, 14, 'há 2 d'], ['Chegou a pizza de Carne Seca com Abóbora', 96, 9, 'há 6 d'], ['Horário especial no feriado', 41, 3, 'há 12 d']].map(([t, l, cm, h]) => (
                    <div key={String(t)} className="rounded-3xl p-3 flex gap-3" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                        <span className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${cor}22`, color: cor }}><Star size={22} /></span>
                        <div className="min-w-0"><p className="text-[13px] font-black leading-snug">{t as string}</p><p className="text-[11.5px] mt-1 flex items-center gap-2" style={{ color: c.textSecondary }}><span className="flex items-center gap-1"><Heart size={12} />{l as number}</span><span>{cm as number} comentários</span><span>{h as string}</span></p></div>
                    </div>
                ))}
            </div>
        </>
    )
}
