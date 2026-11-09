// src/app/(main)/painel-teste/PainelLab.tsx
//
// LABORATÓRIO DO NOVO PAINEL DA LOJA (3.0) — página de teste, não faz parte do app. Mostra, com dados de EXEMPLO, como o painel de
// /painel-loja/<loja> ficaria se fosse pensado como um COMANDO DO DIA: o que precisa de você agora → atender os pedidos → como está o dia
// → o dinheiro → reputação → gerenciar a loja. Nada aqui lê nem grava dado de verdade (os botões só mexem em estado local).
// Aprovado o desenho, ele vira o `StoreDashboard view="painel"` da 3.0 (e esta página pode ser apagada).
'use client'

import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
    Bike, CalendarDays, Check, ChevronRight, ClipboardList, CreditCard, Crown, Gift, GraduationCap, HandCoins, Heart, Info, MessageCircle, Megaphone,
    Package, Flame, Trophy, Share2, ShoppingBag, Sparkles, Star, Store, Tag, Timer, Truck, Users, Wallet, X, Clock, Eye, Settings, Plus, Zap, Banknote,
} from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { DESTINOS, Destino } from './Destinos'
import Pagina from './Paginas'
import Desempenho, { type Foco } from './Desempenho'
import Extrato, { resumo, diaNome } from './Extrato'
import Balcao from './Balcao'
import Editar from './Editar'
import Compartilhar from './Compartilhar'
import LogoFolha, { LogoBtn } from './LogoFolha'

import { ORANGE, C, brl, PEDIDOS, FASES, type Estado, type Modelo, type Fase, type Pedido } from './dados'

const NOTAS: Record<string, { porque: string; era: string }> = {
    cabecalho: { porque: 'Quem tem loja abre o painel para saber “estou aberta? o que preciso fazer?”. Abrir/fechar a loja vira um toque, aqui em cima.', era: 'Estava em Editar loja → Horários; o painel só mostrava os 3 atalhos.' },
    agora: { porque: 'UMA lista do que depende de VOCÊ, na ordem de urgência, cada linha leva direto ao lugar. Hoje os avisos moram espalhados em 6 blocos (pedidos, caixa, digital, apoios, agenda, conversas).', era: 'Não existia: era preciso rolar ~4.000 px e abrir cada bloco para descobrir que havia algo esperando.' },
    pedidos: { porque: 'Aceitar → preparar → entregar é o trabalho do dia. O funil vira 4 seções empilhadas na ordem do fluxo (Novos → Em preparo → Prontos → A caminho), todas à vista, até 2 pedidos em cada com a ação da etapa; no alto, 4 contadores que levam à seção. Ao aceitar, a linha desliza, o número cai e o da etapa nova dá um pulo.', era: '“Pedidos na loja” (funil de 4 seções empilhadas + aba Serviços escondendo os pedidos de serviço).' },
    hoje: { porque: 'Cinco números que respondem “como está o dia?” numa linha só, deslizando de lado. Vendas por período e visitantes abrem DENTRO do próprio cartão.', era: 'Blocos “Vendas” e “Visitantes”: cada um com seu cartão grande e gráfico sempre aberto.' },
    agenda: { porque: 'Só o que vem a seguir (2 compromissos), com a hora em destaque. Aparece só quando a loja agenda serviço.', era: '“Agenda da loja” com 3 contadores e a lista.' },
    caixa: { porque: 'Dinheiro das entregas e vendas, num cartão só: o que está para conferir e quanto entrou. O que precisa de ação sobe para “Precisa de você”.', era: '“Caixa das entregas” + “Vendas” + “Apoios recebidos”, separados.' },
    digital: { porque: 'Quatro números e a linha do Clube. Sem nada de digital, vira um convite pequeno em vez de um cartão vazio.', era: 'Cartão “Digital” grande (com Apoios dentro).' },
    reputacao: { porque: 'A nota e o último comentário. A distribuição por estrelas e os 120 comentários ficam um toque adiante.', era: '“Avaliações e comentários”: a lista inteira aberta no painel (era ~900 px).' },
    desempenho: { porque: 'Cada loja tem um FOCO e cada foco responde a uma pergunta: produtos → o que está vendendo e acabando; digitais → o que as pessoas estão vendo e onde param; serviços → como está a agenda e que serviços oferecer (o que as pessoas pedem perto e a loja ainda não atende). Começa com 3 indicadores de qualidade com semáforo e meta. Loja mista troca entre os focos.', era: 'Não existia: o painel mostrava o que aconteceu, não o que fazer para melhorar.' },
    liberar: { porque: 'Numa loja só de digitais não há preparo nem entrega: o trabalho do dia é conferir o Pix e liberar o acesso. Esta lista substitui o funil de pedidos.', era: 'Pedidos na loja (funil de entrega) servindo a quem não entrega nada.' },
    missoes: { porque: 'O que a loja precisa fazer vira um jogo curto e sempre à vista: o cadastro que falta (cada passo vale pontos, uma vez) e as missões do dia (reiniciam toda manhã). Os pontos sobem a loja no Outdoor. Ligado de verdade: o banco confere cada missão e os pontos entram no Outdoor de lojas (cada ponto de missão vale 0,5; o peso se edita em Admin → Pontuação).', era: 'Só havia a lista “Comece por aqui”, e apenas na loja nova: depois de completa, ninguém via o que faltava.' },
    gerenciar: { porque: 'Tudo que é configuração vira uma grade de atalhos com o estado de cada um (“Pix ✓”, “iUser ligado”). Quem chega aqui para atender não precisa passar por isso.', era: 'Editar loja: ~15 blocos longos um embaixo do outro.' },
    balcao: { porque: 'Venda no balcão é uma ação, não um bloco: fica como botão fixo embaixo, sempre à mão e sem ocupar lugar na página.', era: 'Cartão “Venda presencial” no meio da página.' },
}

const MAPA: [string, string][] = [
    ['Ver loja · Compartilhar · Editar', 'Cabeçalho (pílulas)'],
    ['Pedidos na loja', 'Pedidos (funil em abas) + “Precisa de você”'],
    ['Pedidos de serviço (aba Serviços)', 'Pedidos · Serviços (e linha em “Precisa de você”)'],
    ['Caixa das entregas', 'Dinheiro (+ “Precisa de você”)'],
    ['Digital + Apoios recebidos', 'Digital e Clube'],
    ['Agenda da loja', 'Agenda (próximos compromissos)'],
    ['“Comece por aqui” (só na loja nova)', 'Missões da loja (cadastro + missões do dia)'],
    ['Venda presencial', 'Botão fixo “Venda no balcão”'],
    ['Vendas', 'Como está o dia (Hoje/Semana/Mês)'],
    ['Avaliações e comentários', 'Reputação (último comentário) → ver todas'],
    ['Visitantes', 'Como está o dia (visitantes online)'],
    ['Editar loja (15 blocos)', 'Gerenciar (grade de atalhos com estado)'],
]

export default function PainelLab() {
    const { colors } = useTheme()
    const [estado, setEstado] = useState<Estado>('movimentado')
    const [modelo, setModelo] = useState<Modelo>('mixed')
    const [notas, setNotas] = useState(true)
    const [versao, setVersao] = useState<'nova' | 'atual'>('nova')
    const [aberta, setAberta] = useState(true)
    const FLIP_MS = 1500                                                            // quanto dura a descida do cartão
    const cores = useRef<{ id: number; de: string; para: string } | null>(null)    // cor da etapa que o pedido deixa e da que ele recebe (a cor se transforma durante a descida)
    const flip = useRef<Map<string, DOMRect> | null>(null)                          // posições ANTES da mudança (FLIP: o que mudou de lugar desliza do antigo ao novo)
    const [chegou, setChegou] = useState<{ id: number; k: number } | null>(null)     // pedido que acabou de chegar na etapa nova
    const [bump, setBump] = useState<{ fase: Fase; k: number } | null>(null)         // contador que deve dar o pulo
    const [pedidos, setPedidos] = useState<Pedido[]>(PEDIDOS)
    const [periodo, setPeriodo] = useState<'hoje' | 'semana' | 'mes'>('hoje')
    const [aba, setAba] = useState<'produtos' | 'servicos'>('produtos')
    const [servicos, setServicos] = useState(3)
    const [verEstrelas, setVerEstrelas] = useState(false)
    const [extrato, setExtrato] = useState(false)
    const [miss, setMiss] = useState<Record<string, boolean>>({})
    const [ger, setGer] = useState<Record<string, boolean>>({})
    const [aberto, setAberto] = useState<string | null>(null)
    const [pagina, setPagina] = useState<string | null>(null)          // pedidos, repasses, digital, apoios, conversas, avaliacoes
    const [extratoAb, setExtratoAb] = useState(false)
    const [balcaoAb, setBalcaoAb] = useState(false)
    const [liberados, setLiberados] = useState<number[]>([])                     // acessos digitais já liberados (foco digital)
    const [editarAb, setEditarAb] = useState(false)
    const [shareAb, setShareAb] = useState(false)
    const [logoAb, setLogoAb] = useState(false)
    const [logoCor, setLogoCor] = useState('#b91c1c')
    const [logoImg, setLogoImg] = useState<string | null>(null)
    const [catAba, setCatAba] = useState<'produtos' | 'digitais' | 'servicos'>('produtos')
    const [agendaAba, setAgendaAba] = useState<'agenda' | 'pend' | 'hor'>('agenda')
    /** TODO destino do painel passa por aqui: página, folha, extrato, balcão, editar, compartilhar ou um atalho do Gerenciar */
    const ir = (k: string) => {
        if (k === 'age-pend') { setAgendaAba('pend'); setAberto('age'); return }
        if (k === 'age') { setAgendaAba('agenda'); setAberto('age'); return }
        if (k === 'srv') { setCatAba('servicos'); setAberto('cat'); return }
        if (k === 'cat-dig') { setCatAba('digitais'); setAberto('cat'); return }
        if (k === 'cat' || k === 'pro') { setCatAba('produtos'); setAberto('cat'); return }
        if (['pedidos', 'repasses', 'digital', 'apoios', 'conversas', 'avaliacoes'].includes(k)) { setPagina(k); return }
        if (k === 'extrato') { setExtratoAb(true); return }
        if (k === 'balcao') { setBalcaoAb(true); return }
        if (k === 'editar') { setEditarAb(true); return }
        if (k === 'compartilhar') { setShareAb(true); return }
        setAberto(k)
    }

    const temProdutos = modelo === 'mixed' || modelo === 'products'
    const temServicos = modelo === 'mixed' || modelo === 'services'
    const temDigital = modelo !== 'services'
    const focos = ([temProdutos && 'produtos', temDigital && 'digitais', temServicos && 'servicos'].filter(Boolean)) as Foco[]
    const nova = estado === 'nova'
    const calmo = estado === 'tranquilo'
    const nivelLoja = nova ? 0 : calmo ? 2 : 4
    const pontosLoja = nova ? 12 : calmo ? 640 : 4120
    const nomeNivel = ['Iniciante', 'Ativa', 'Destaque', 'Estrela', 'Lenda'][nivelLoja]

    // pedidos exibidos conforme o estado
    const lista = useMemo(() => {
        if (nova) return []
        if (calmo) return pedidos.filter((p) => p.id === 8 || p.id === 11)
        return pedidos
    }, [pedidos, nova, calmo])
    const conta = (f: Fase) => lista.filter((p) => p.fase === f).length
    const novosProd = temProdutos ? conta('novo') : 0
    const svcNovos = temServicos && !nova ? (calmo ? 0 : servicos) : 0

    // o que precisa de você
    const atencao = useMemo(() => {
        const a: { cor: string; icone: ReactNode; titulo: string; sub: string; n?: number; ir: string; rotulo: string }[] = []
        if (novosProd > 0) a.push({ cor: C.novo, icone: <ClipboardList size={17} />, n: novosProd, titulo: `${novosProd} ${novosProd === 1 ? 'pedido novo' : 'pedidos novos'}`, sub: 'Aceite para a loja começar a preparar', ir: 'pedidos', rotulo: 'Ver pedidos' })
        if (svcNovos > 0) a.push({ cor: C.servico, icone: <CalendarDays size={17} />, n: svcNovos, titulo: `${svcNovos} ${svcNovos === 1 ? 'pedido de serviço' : 'pedidos de serviço'}`, sub: 'Clientes esperando horário confirmado', ir: 'age-pend', rotulo: 'Ver pendentes' })
        if (!calmo && !nova && temProdutos) a.push({ cor: C.ambar, icone: <Banknote size={17} />, n: 1, titulo: '1 repasse para conferir', sub: 'Rafa diz que repassou R$ 85,00 do dinheiro da porta', ir: 'repasses', rotulo: 'Conferir' })
        if (!calmo && !nova) a.push({ cor: C.pronto, icone: <GraduationCap size={17} />, n: 2, titulo: '2 acessos digitais para liberar', sub: 'Pix informado — confira e libere o curso', ir: 'digital', rotulo: 'Liberar' })
        if (!calmo && !nova) a.push({ cor: '#8b5cf6', icone: <Heart size={17} />, n: 1, titulo: '1 apoio para conferir', sub: 'Alguém mandou R$ 10,00 para a loja', ir: 'apoios', rotulo: 'Conferir' })
        if (!nova) a.push({ cor: '#16a34a', icone: <MessageCircle size={17} />, n: calmo ? 1 : 3, titulo: calmo ? '1 conversa não lida' : '3 conversas não lidas', sub: 'Clientes da loja', ir: 'conversas', rotulo: 'Responder' })
        if (nova) a.push({ cor: C.alerta, icone: <CreditCard size={17} />, titulo: 'Cadastre sua chave Pix', sub: 'Sem ela a loja não recebe entrada, apoio nem repasse', ir: 'pag', rotulo: 'Cadastrar' })
        return a
    }, [novosProd, svcNovos, calmo, nova, temProdutos])

    /** a CÂMERA: enquanto o cartão voa, a página rola junto para ele ficar sempre no mesmo ponto da tela (o dedo/roda do mouse interrompe) */
    function seguir(el: HTMLElement, topoInicial: number) {
        let sp: HTMLElement | null = el.parentElement
        while (sp && !(/(auto|scroll)/.test(getComputedStyle(sp).overflowY) && sp.scrollHeight > sp.clientHeight)) sp = sp.parentElement
        const alvo = Math.min(Math.max(topoInicial, 150), window.innerHeight - 280)
        let parou = false
        const para = () => { parou = true }
        window.addEventListener('wheel', para, { once: true, passive: true })
        window.addEventListener('touchstart', para, { once: true, passive: true })
        const t0 = performance.now()
        const passo = () => {
            if (parou || performance.now() - t0 > FLIP_MS + 150) return
            const k = Math.min(1, (performance.now() - t0) / 600)                      // a câmera ENTRA suave: do ponto onde o cartão estava até o ponto de seguir
            const d = el.getBoundingClientRect().top - (topoInicial + (alvo - topoInicial) * k)
            if (Math.abs(d) > 0.5) { if (sp) sp.scrollTop += d; else window.scrollBy(0, d) }
            requestAnimationFrame(passo)
        }
        requestAnimationFrame(passo)
    }
    /** fotografa a posição de tudo que pode mudar de lugar; depois da mudança, `useLayoutEffect` anima do antigo ao novo */
    function medir() {
        const m = new Map<string, DOMRect>()
        document.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => m.set(el.dataset.flip!, el.getBoundingClientRect()))
        flip.current = m
    }
    function avancar(id: number) {
        const ordem: Fase[] = ['novo', 'preparando', 'pronto', 'caminho']
        const p0 = pedidos.find((x) => x.id === id)
        if (!p0) return
        const prox = ordem[ordem.indexOf(p0.fase) + 1]
        if (!prox) return
        const corDe = (k: Fase) => { const c = FASES.find((x) => x.k === k)!.cor; return c === C.preparando ? '#ca8a04' : c }
        cores.current = { id, de: corDe(p0.fase), para: corDe(prox) }
        medir()
        setPedidos((ps) => { const mv = ps.find((x) => x.id === id); return mv ? [{ ...mv, fase: prox }, ...ps.filter((x) => x.id !== id)] : ps })   // vai para o TOPO da etapa nova
        setChegou({ id, k: Date.now() })
        setTimeout(() => setBump({ fase: prox, k: Date.now() }), 1500)      // o número da etapa nova dá o pulo quando o cartão chega
        setTimeout(() => setChegou((c) => (c && c.id === id ? null : c)), 3300)
    }
    function recusar(id: number) { medir(); setPedidos((ps) => ps.filter((p) => p.id !== id)) }
    useLayoutEffect(() => {
        const antes = flip.current
        if (!antes) return
        flip.current = null
        const movido = chegou?.id
        document.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
            const o = antes.get(el.dataset.flip!)
            if (!o) return
            const n = el.getBoundingClientRect()
            const dx = o.left - n.left, dy = o.top - n.top
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
            const voando = el.dataset.flip === `p${movido}`
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
            el.animate(voando
                ? [{ transform: `translate(${dx}px,${dy}px) scale(1.04)`, boxShadow: '0 16px 36px rgba(0,0,0,.3)', zIndex: 30 }, { transform: 'translate(0,0) scale(1.04)', boxShadow: '0 16px 36px rgba(0,0,0,.3)', zIndex: 30, offset: 0.85 }, { transform: 'none', boxShadow: '0 0 0 rgba(0,0,0,0)', zIndex: 30 }]
                : [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
            { duration: voando ? FLIP_MS : 1200, easing: 'cubic-bezier(.45,0,.2,1)' })
            if (voando) {
                seguir(el, o.top)
                const cc = cores.current
                if (cc && cc.id === movido) {
                    const opt = { duration: FLIP_MS, easing: 'ease-in-out' as const }
                    // a COR vem POR TRÁS: o cartão cobre a lateral colorida durante a descida e, no fim, ENCOLHE para a esquerda e deixa a cor aparecer; um anel colorido acompanha e some
                    el.animate([{ backgroundColor: cc.de, outline: `3px solid ${cc.de}`, outlineOffset: '2px' }, { backgroundColor: cc.para, outline: `3px solid ${cc.para}`, outlineOffset: '2px', offset: 0.82 }, { backgroundColor: cc.para, outline: `3px solid ${cc.para}00`, outlineOffset: '2px' }], opt)
                    el.querySelector<HTMLElement>('[data-card]')?.animate([{ marginLeft: '0px' }, { marginLeft: '0px', offset: 0.78 }, { marginLeft: '4px' }], opt)
                    el.querySelector<HTMLElement>('[data-acao]')?.animate([{ backgroundColor: cc.de }, { backgroundColor: cc.para }], opt)                                                          // o botão também
                    el.querySelectorAll<HTMLElement>('[data-troca]').forEach((t) => t.animate([{ opacity: 0.15 }, { opacity: 0.15, offset: 0.5 }, { opacity: 1 }], opt))                         // o texto novo aparece no meio
                }
            }
        })
    }, [pedidos]) // eslint-disable-line react-hooks/exhaustive-deps

    // no dia MOVIMENTADO os números vêm do mesmo extrato da página "Abrir o extrato completo" (nada se contradiz); nos outros dias, exemplos próprios
    const mov = !nova && !calmo
    const rs = resumo(periodo)
    const vendas = mov ? [rs.total, rs.vendas] : { hoje: [calmo ? 212 : 0, calmo ? 3 : 0], semana: [calmo ? 1890 : 0, calmo ? 21 : 0], mes: [calmo ? 2480 : 0, calmo ? 27 : 0] }[periodo]
    const FORMAS: [string, number, string][] = [['Pix', 0.5, '#22c55e'], ['Cartão', 0.33, '#3b82f6'], ['Dinheiro', 0.17, '#eab308']]
    const formaVal = (n: string, p: number) => (mov ? rs.porForma[n as 'Pix' | 'Cartão' | 'Dinheiro'] : vendas[0] * p)
    const hojeLinhas: [string, string, string, number][] = nova ? [] : calmo
        ? [['21:40', '@marta-moura', 'Pix', 98.9], ['20:15', '@pedro-lima', 'Dinheiro', 64.9], ['19:30', '@bia-santos', 'Cartão', 48.2]]
        : resumo('hoje').lancs.slice(0, 6).map((l) => [l.hora, l.quem, l.forma, l.valor] as [string, string, string, number])
    const parte = (nomes: string[], ps: number[]): [string, string, string, number][] => nomes.map((n, i) => [n, `${Math.max(0, Math.round(vendas[1] * ps[i]))} pedidos`, '', Math.round(vendas[0] * ps[i] * 100) / 100])
    const grupos3 = (): [string, string, string, number][] => [[6, 8, 'Dias 7 a 9'], [3, 5, 'Dias 4 a 6'], [0, 2, 'Dias 1 a 3']].map(([a, b, nome]) => { const x = rs.porDia.filter((d) => d.dia >= (a as number) && d.dia <= (b as number)); return [nome as string, `${x.reduce((t, d) => t + d.n, 0)} lançamentos`, '', x.reduce((t, d) => t + d.total, 0)] })
    const linhasExtrato: [string, string, string, number][] = nova ? [] : periodo === 'hoje'
        ? [...hojeLinhas, ['antes', `${Math.max(0, (mov ? rs.lancs.length : vendas[1]) - hojeLinhas.length)} lançamentos`, '', Math.round((vendas[0] - hojeLinhas.reduce((t, l) => t + l[3], 0)) * 100) / 100]]
        : mov ? (periodo === 'semana' ? rs.porDia.map((d) => [diaNome(d.dia), `${d.n} lançamentos`, '', d.total] as [string, string, string, number]) : grupos3())
            : periodo === 'semana' ? parte(['Seg 09 (hoje)', 'Dom 08', 'Sáb 07', 'Sex 06', 'Qui 05', 'Qua 04', 'Ter 03'], [0.18, 0.12, 0.2, 0.17, 0.11, 0.1, 0.12])
                : parte(['Dias 7 a 9', 'Dias 4 a 6', 'Dias 1 a 3'], [0.36, 0.34, 0.3])
    const ticket = vendas[1] ? vendas[0] / vendas[1] : 0

    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const sec = (key: string, titulo: string, direita?: ReactNode) => (
        <div className="mb-2 mt-6">
            <div className="flex items-center gap-2">
                <p className="text-[13px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{titulo}</p>
                <div className="ml-auto">{direita}</div>
            </div>
            {notas && NOTAS[key] && (
                <div className="mt-1.5 rounded-2xl p-3 text-[11.5px] leading-snug" style={{ background: `${ORANGE}0d`, border: `1px solid ${ORANGE}40` }}>
                    <p><b style={{ color: ORANGE }}>Por quê: </b>{NOTAS[key].porque}</p>
                    <p className="mt-1" style={{ color: colors.textSecondary }}><b>Hoje: </b>{NOTAS[key].era}</p>
                </div>
            )}
        </div>
    )
    const pill = (ativo: boolean, cor = ORANGE) => ativo ? { background: cor, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }

    // ===== blocos =====
    const cabecalho = (
        <div className="rounded-[28px] p-3.5" style={card}>
            <div className="flex items-center gap-3">
                <LogoBtn nivel={nivelLoja} cor={logoCor} img={logoImg} size={48} onClick={() => setLogoAb(true)} />
                <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-black leading-tight truncate">Pizzaria Forno de Ouro</p>
                    {nivelLoja > 0 && <button onClick={() => setLogoAb(true)} className="inline-flex items-center gap-1 text-[10.5px] font-black px-2 py-0.5 rounded-full my-0.5" style={{ background: '#fbbf2433', color: '#92400e' }}><Crown size={10} />Nível {nivelLoja} · {nomeNivel}</button>}
                    <p className="text-[11.5px] font-semibold" style={{ color: aberta ? '#16a34a' : colors.textSecondary }}>
                        {aberta ? 'Aberta agora · fecha às 00:00' : 'Fechada · não recebe pedidos novos'}
                    </p>
                </div>
                <button onClick={() => setAberta((v) => !v)} role="switch" aria-checked={aberta} aria-label="Abrir ou fechar a loja"
                    className="relative w-14 h-8 rounded-full flex-shrink-0 transition active:scale-95" style={{ background: aberta ? '#22c55e' : `${colors.border}` }}>
                    <span className="absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: aberta ? 28 : 4 }} />
                </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                {[['Ver loja', <Eye key="a" size={14} />], ['Compartilhar', <Share2 key="b" size={14} />], ['Editar', <Settings key="c" size={14} />]].map(([t, ic], i) => (
                    <button key={String(t)} onClick={() => (i === 1 ? ir('compartilhar') : i === 2 ? ir('editar') : undefined)} className="h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition"
                        style={i === 2 ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}50`, color: colors.textPrimary }}>{ic as ReactNode}{t as string}</button>
                ))}
            </div>
        </div>
    )

    const precisa = atencao.length === 0 ? (
        <div className="rounded-3xl p-4 flex items-center gap-3" style={{ ...card, borderColor: `${C.novo}66` }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${C.novo}22`, color: C.novo }}><Check size={18} /></span>
            <div><p className="text-[14px] font-black">Tudo em dia</p><p className="text-[12px]" style={{ color: colors.textSecondary }}>Nada esperando por você agora.</p></div>
        </div>
    ) : (
        <div className="rounded-3xl overflow-hidden" style={card}>
            {atencao.map((a, i) => (
                <button key={a.titulo} onClick={() => ir(a.ir)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:opacity-70 transition" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                    <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${a.cor}22`, color: a.cor }}>{a.icone}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-black leading-tight">{a.titulo}</span>
                        <span className="block text-[11.5px] leading-snug" style={{ color: colors.textSecondary }}>{a.sub}</span>
                    </span>
                    <span className="text-[11.5px] font-black flex items-center gap-0.5 flex-shrink-0" style={{ color: a.cor }}>{a.rotulo}<ChevronRight size={14} /></span>
                </button>
            ))}
        </div>
    )

    const fasesAtivas = temProdutos ? FASES : []
    const pedidosBloco = (
        <div className="rounded-3xl p-3" style={card}>
            {temProdutos && temServicos && (
                <div className="flex gap-1.5 mb-3 p-1 rounded-full" style={{ background: `${colors.border}40` }}>
                    {([['produtos', 'Produtos'], ['servicos', 'Serviços']] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setAba(k)} className="flex-1 h-8 rounded-full text-[12.5px] font-black transition"
                            style={aba === k ? { background: colors.background, boxShadow: '0 1px 4px rgba(0,0,0,.12)' } : { color: colors.textSecondary }}>
                            {l}{k === 'servicos' && svcNovos > 0 ? ` · ${svcNovos}` : k === 'produtos' && novosProd > 0 ? ` · ${novosProd}` : ''}
                        </button>
                    ))}
                </div>
            )}

            {(aba === 'produtos' && temProdutos) || !temServicos ? (
                nova ? <Vazio titulo="Os pedidos aparecem aqui" texto="Quando o primeiro cliente comprar, você aceita, prepara e acompanha a entrega neste cartão." cor={colors.textSecondary} />
                : (
                    <>
                        <style>{`
                            @keyframes labPulo { 0% { transform: scale(1) } 35% { transform: scale(1.45) } 100% { transform: scale(1) } }
                            @keyframes labBrilho { 0% { box-shadow: 0 0 0 0 var(--lab-cor) } 40% { box-shadow: 0 0 0 5px var(--lab-cor) } 100% { box-shadow: 0 0 0 0 transparent } }
                            @media (prefers-reduced-motion: reduce) { .lab-anim { animation: none !important } }
                        `}</style>
                        {/* resumo do funil: tocar leva à seção */}
                        <div className="flex items-center justify-between gap-0.5 mb-3">
                            {fasesAtivas.map((f, i) => {
                                const n = conta(f.k)
                                return (
                                    <span key={f.k} className="flex items-center gap-0.5 flex-1 min-w-0">
                                        <button onClick={() => document.getElementById(`ped-sec-${f.k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="flex-1 min-w-0 rounded-2xl py-1.5 text-center active:scale-95 transition" style={{ background: n ? `${f.cor}22` : `${colors.border}30` }}>
                                            <span key={bump?.fase === f.k ? bump.k : 0} className="lab-anim block text-[19px] font-black leading-none" style={{ color: n ? (f.cor === C.preparando ? '#ca8a04' : f.cor) : colors.textSecondary, animation: bump?.fase === f.k ? 'labPulo .55s ease-out' : undefined }}>{n}</span>
                                            <span className="block text-[9.5px] font-bold mt-0.5 leading-tight truncate" style={{ color: colors.textSecondary }}>{f.nome}</span>
                                        </button>
                                        {i < fasesAtivas.length - 1 && <ChevronRight size={12} style={{ color: colors.textSecondary }} className="flex-shrink-0" />}
                                    </span>
                                )
                            })}
                        </div>
                        {/* seções empilhadas, na ordem do fluxo: tudo à vista, nada atrás de aba */}
                        <div className="space-y-3">
                            {fasesAtivas.map((f) => {
                                const todos = lista.filter((p) => p.fase === f.k)
                                const n = todos.length
                                const cor = f.cor === C.preparando ? '#ca8a04' : f.cor
                                return (
                                    <div key={f.k} id={`ped-sec-${f.k}`}>
                                        <div data-flip={`h${f.k}`} className="relative flex items-center gap-2 mb-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: cor }} />
                                            <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: cor }}>{f.nome}</p>
                                            <span key={bump?.fase === f.k ? bump.k : 0} className="lab-anim min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black text-white flex items-center justify-center" style={{ background: n ? cor : `${colors.border}`, animation: bump?.fase === f.k ? 'labPulo .55s ease-out' : undefined }}>{n}</span>
                                            {n === 0 && <span className="text-[11.5px] font-semibold" style={{ color: colors.textSecondary }}>nenhum agora</span>}
                                        </div>
                                        {todos.length > 0 && (
                                            <div className="space-y-2">
                                                {todos.slice(0, 2).map((p) => (
                                                    <div key={p.id} data-flip={`p${p.id}`} className="lab-anim relative rounded-2xl overflow-hidden" style={{ background: cor, ['--lab-cor' as string]: `${cor}66`, animation: chegou?.id === p.id ? 'labBrilho 1.5s ease-out 1.5s backwards' : undefined }}>
                                                    <div data-card className="rounded-2xl pl-3 pr-2 py-2.5 flex items-center gap-2" style={{ background: colors.background, border: `1px solid ${colors.border}`, marginLeft: 4 }}>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[13px] font-black leading-tight truncate">{p.quem} <span className="font-semibold" style={{ color: colors.textSecondary }}>· {p.hora}</span></p>
                                                            <p className="text-[12px] leading-tight truncate mt-0.5">{p.item}{p.mais ? ` +${p.mais}` : ''}</p>
                                                            <p className="text-[11px] font-bold leading-tight mt-0.5 flex items-center gap-1" style={{ color: p.entrega.startsWith('Cliente') ? colors.textSecondary : C.caminho }}>
                                                                {p.entrega.startsWith('Cliente') ? <Store size={11} /> : <Bike size={11} />}{p.entrega}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                            <span className="text-[13px] font-black">{brl(p.valor)}</span>
                                                            <div className="flex gap-1">
                                                                {f.k === 'novo' && <button onClick={() => recusar(p.id)} aria-label="Recusar" className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90" style={{ border: `1px solid ${colors.border}`, color: C.alerta }}><X size={14} /></button>}
                                                                {f.acao && <button data-acao onClick={() => avancar(p.id)} className="h-8 px-3.5 rounded-full text-[12px] font-black text-white active:scale-95" style={{ background: cor }}><span data-troca className="inline-block">{f.acao}</span></button>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    </div>
                                                ))}
                                                {todos.length > 2 && <button data-flip={`m${f.k}`} onClick={() => ir('pedidos')} className="relative text-[12px] font-black flex items-center gap-1 pl-1" style={{ color: cor }}>Ver mais {todos.length - 2}<ChevronRight size={13} /></button>}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        <button onClick={() => ir('pedidos')} className="w-full mt-3 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ background: `${colors.border}40` }}>
                            Ver todos os pedidos e o histórico<ChevronRight size={14} />
                        </button>
                    </>
                )
            ) : (
                svcNovos === 0 ? <Vazio titulo="Nenhum pedido de serviço esperando" texto="Quando alguém pedir um horário, você aceita ou recusa aqui." cor={colors.textSecondary} />
                : (
                    <div className="space-y-2">
                        {[['@tatiane-moura', 'Confraternização — Ambiente VIP (4 h)', 'TER 29/12 · 20:30', 'entrada paga'], ['@larissa-castro', 'Rodízio Premium (2 h)', 'SEX 02/01 · 19:00', 'entrada a informar'], ['@marta-moura', 'Mesa no mezanino', 'SÁB 03/01 · 21:00', 'sem entrada']].slice(0, Math.min(3, servicos)).map(([q, s, h, e]) => (
                            <div key={q} className="rounded-2xl pl-3 pr-2 py-2.5 flex items-center gap-2" style={{ background: colors.background, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${C.servico}` }}>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-black leading-tight truncate">{q}</p>
                                    <p className="text-[12px] leading-tight truncate mt-0.5">{s}</p>
                                    <p className="text-[11px] font-bold mt-0.5 flex items-center gap-1" style={{ color: C.servico }}><Clock size={11} />{h} · {e}</p>
                                </div>
                                <button onClick={() => setServicos((n) => Math.max(0, n - 1))} aria-label="Recusar" className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90" style={{ border: `1px solid ${colors.border}`, color: C.alerta }}><X size={14} /></button>
                                <button onClick={() => setServicos((n) => Math.max(0, n - 1))} className="h-8 px-3.5 rounded-full text-[12px] font-black text-white active:scale-95" style={{ background: C.servico }}>Aceitar</button>
                            </div>
                        ))}
                        <button onClick={() => ir('age-pend')} className="w-full mt-1 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ background: `${colors.border}40` }}>
                            Ver todos os {svcNovos} pedidos de serviço<ChevronRight size={14} />
                        </button>
                    </div>
                )
            )}
        </div>
    )

    const rh = resumo('hoje')
    const kpisProdutos = [
        { l: 'Vendas hoje', v: calmo ? 'R$ 212' : nova ? 'R$ 0' : brl(rh.total).replace(',00', ''), c: C.novo, ic: <Wallet size={13} /> },
        { l: 'Pedidos', v: calmo ? '3' : nova ? '0' : String(rh.vendas), c: C.caminho, ic: <ClipboardList size={13} /> },
        { l: 'Ticket', v: calmo ? 'R$ 71' : nova ? '—' : brl(rh.total / Math.max(1, rh.vendas)).replace(',00', ''), c: C.pronto, ic: <Tag size={13} /> },
        { l: 'Nota', v: nova ? '—' : '4,6 ★', c: C.preparando, ic: <Star size={13} /> },
        { l: 'Online agora', v: calmo ? '2' : nova ? '0' : '9', c: C.servico, ic: <Users size={13} /> },
    ]
    const z = (v: string, v0 = '0') => (nova ? v0 : v)
    const kpisDigital = [
        { l: 'Visualizações hoje', v: z(calmo ? '310' : '1.240'), c: C.pronto, ic: <Eye size={13} /> },
        { l: 'Vendas hoje', v: z(calmo ? 'R$ 49' : 'R$ 506', 'R$ 0'), c: C.novo, ic: <Wallet size={13} /> },
        { l: 'Pegaram grátis', v: z(calmo ? '6' : '27'), c: C.caminho, ic: <Gift size={13} /> },
        { l: 'Clube', v: z(calmo ? '36' : '38'), c: C.ambar, ic: <Crown size={13} /> },
        { l: 'Nota', v: nova ? '—' : '4,7 ★', c: C.preparando, ic: <Star size={13} /> },
    ]
    const kpisServico = [
        { l: 'Agendados hoje', v: z(calmo ? '2' : '7'), c: C.servico, ic: <CalendarDays size={13} /> },
        { l: 'Agenda cheia', v: z(calmo ? '31%' : '68%', '—'), c: C.pronto, ic: <Clock size={13} /> },
        { l: 'Receita hoje', v: z(calmo ? 'R$ 240' : 'R$ 1.180', 'R$ 0'), c: C.novo, ic: <Wallet size={13} /> },
        { l: 'Faltas', v: z(calmo ? '0%' : '4%', '—'), c: C.alerta, ic: <X size={13} /> },
        { l: 'Nota', v: nova ? '—' : '4,8 ★', c: C.preparando, ic: <Star size={13} /> },
    ]
    const kpis = modelo === 'digital' ? kpisDigital : modelo === 'services' ? kpisServico : kpisProdutos
    const hojeBloco = (
        <>
            <div className="flex flex-wrap gap-2">
                {kpis.map((k) => (
                    <div key={k.l} className="rounded-2xl px-3.5 py-2.5 flex-[1_1_30%] min-w-[96px]" style={card}>
                        <p className="text-[10.5px] font-bold flex items-center gap-1" style={{ color: k.c }}>{k.ic}{k.l}</p>
                        <p className="text-[19px] font-black leading-tight mt-0.5">{k.v}</p>
                    </div>
                ))}
            </div>
            <div className="rounded-3xl p-3 mt-2" style={card}>
                <div className="flex gap-1.5 mb-2.5">
                    {([['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Novembro']] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setPeriodo(k)} className="h-8 px-3.5 rounded-full text-[12px] font-black active:scale-95" style={pill(periodo === k)}>{l}</button>
                    ))}
                </div>
                <div className="flex items-end justify-between">
                    <div><p className="text-[24px] font-black leading-none">{brl(vendas[0])}</p><p className="text-[11.5px] mt-1" style={{ color: colors.textSecondary }}>{vendas[1]} pedidos · ticket {ticket ? brl(ticket) : '—'}</p></div>
                    <div className="flex items-end gap-1 h-10">
                        {[30, 45, 38, 60, 52, 80, 100].map((h, i) => <span key={i} className="w-2.5 rounded-t" style={{ height: `${nova ? 6 : h * (calmo ? 0.5 : 1) * 0.4}px`, background: i === 6 ? ORANGE : `${ORANGE}55` }} />)}
                    </div>
                </div>
                <button onClick={() => setExtrato((v) => !v)} className="w-full mt-3 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ background: `${colors.border}40` }}>
                    {extrato ? 'Fechar o extrato' : 'Ver extrato'}<ChevronRight size={14} className={extrato ? '-rotate-90 transition' : 'rotate-90 transition'} />
                </button>
                {extrato && (
                    <div className="mt-3">
                        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                            {FORMAS.map(([n, p, k]) => (
                                <div key={n} className="rounded-2xl px-2.5 py-2" style={{ background: colors.background, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${k}` }}>
                                    <p className="text-[10px] font-bold" style={{ color: k }}>{n}</p><p className="text-[13.5px] font-black leading-tight">{brl(formaVal(n, p))}</p>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                            {linhasExtrato.length === 0 && <p className="text-[12.5px] font-semibold text-center py-4" style={{ color: colors.textSecondary }}>Nenhuma venda neste período.</p>}
                            {linhasExtrato.map(([a, b, c2, v], i) => (
                                <div key={a + i} className="flex items-center gap-2.5 px-3 py-2 text-[12px]" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                                    <span className="font-black w-[74px] flex-shrink-0">{a}</span>
                                    <span className="min-w-0 flex-1 truncate font-semibold flex items-center gap-1.5" style={{ color: colors.textSecondary }}>{c2 && <span className="w-2 h-2 rounded-full flex-shrink-0" title={c2} style={{ background: FORMAS.find((f) => f[0] === c2)?.[2] }} />}<span className="truncate">{b}</span></span>
                                    <span className="font-black">{brl(v)}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] mt-2 leading-snug" style={{ color: colors.textSecondary }}>O iUser registra a venda; o dinheiro cai direto na sua conta (Pix, cartão ou na entrega).</p>
                        <button onClick={() => ir('extrato')} className="w-full mt-2 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ border: `1px solid ${colors.border}` }}>Abrir o extrato completo<ChevronRight size={14} /></button>
                    </div>
                )}
            </div>
        </>
    )

    const agendaBloco = nova ? (
        <Vazio titulo="Sem compromissos ainda" texto="Quando um cliente agendar um serviço e você aceitar, ele entra aqui." cor={colors.textSecondary} caixa={card} />
    ) : (
        <div className="rounded-3xl overflow-hidden" style={card}>
            {[['20:30', 'TER 29/12', '@tatiane-moura', 'Confraternização — Ambiente VIP (4 h)'], ['19:00', 'SEX 02/01', '@larissa-castro', 'Rodízio Premium (2 h)']].map(([h, d, q, s], i) => (
                <div key={q} className="flex items-center gap-3 px-3.5 py-3" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                    <div className="w-14 text-center flex-shrink-0"><p className="text-[17px] font-black leading-none" style={{ color: C.servico }}>{h}</p><p className="text-[10px] font-bold mt-1" style={{ color: colors.textSecondary }}>{d}</p></div>
                    <div className="min-w-0"><p className="text-[13px] font-black truncate">{q}</p><p className="text-[12px] truncate" style={{ color: colors.textSecondary }}>{s}</p></div>
                </div>
            ))}
            <button onClick={() => ir('age')} className="w-full h-10 text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ borderTop: `1px solid ${colors.border}`, color: ORANGE }}>Ver agenda · 1 na agenda · 220 feitos<ChevronRight size={14} /></button>
        </div>
    )

    const caixaBloco = (
        <div className="rounded-3xl p-3.5" style={card}>
            <div className="grid grid-cols-2 gap-2">
                <Mini cor={C.ambar} titulo="A conferir" valor={calmo || nova ? 'R$ 0' : 'R$ 85,00'} sub={calmo || nova ? 'nenhum repasse' : '1 repasse do dinheiro da porta'} colors={colors} onClick={() => ir('repasses')} />
                <Mini cor={C.novo} titulo="Recebido hoje" valor={calmo ? 'R$ 212' : nova ? 'R$ 0' : brl(rh.total).replace(',00', '')} sub="pedidos e entradas" colors={colors} onClick={() => ir('extrato')} />
                {temProdutos && <Mini cor={C.caminho} titulo="Maquininha" valor={calmo || nova ? '—' : 'com Léo'} sub={calmo || nova ? 'nenhuma na rua' : 'devolver até 22h'} colors={colors} onClick={() => ir('repasses')} />}
                <Mini cor="#8b5cf6" titulo="Apoios" valor={nova ? 'R$ 0' : 'R$ 10'} sub={nova ? 'nenhum ainda' : '1 a conferir'} colors={colors} onClick={() => ir('apoios')} />
            </div>
        </div>
    )

    const liberarBloco = (
        <div className="rounded-3xl overflow-hidden" style={card}>
            {[[1, '@carol-lima', 'Curso Pizza Napolitana', 49.9, '09:12'], [2, '@heitor-martins', 'E-book “Massa perfeita”', 19.9, '08:40']].map(([id, q, pr, v, h], i) => {
                const ok = liberados.includes(id as number)
                return (
                    <div key={id as number} className="flex items-center gap-2.5 px-3.5 py-3" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: ok ? `${C.novo}22` : `${C.pronto}22`, color: ok ? C.novo : C.pronto }}>{ok ? <Check size={16} /> : <GraduationCap size={16} />}</span>
                        <span className="min-w-0 flex-1"><span className="block text-[13px] font-black leading-tight truncate">{q as string}</span><span className="block text-[11.5px] truncate" style={{ color: colors.textSecondary }}>{pr as string} · {brl(v as number)} · Pix informado {h as string}</span></span>
                        {ok ? <span className="text-[11.5px] font-black" style={{ color: C.novo }}>Liberado</span> : <button onClick={() => setLiberados((l) => [...l, id as number])} className="h-9 px-3.5 rounded-full text-[12px] font-black text-white active:scale-95" style={{ background: C.pronto }}>Liberar</button>}
                    </div>
                )
            })}
            <button onClick={() => ir('digital')} className="w-full h-11 text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ borderTop: `1px solid ${colors.border}`, background: `${colors.border}30` }}>Ver todas as vendas e o histórico<ChevronRight size={14} /></button>
        </div>
    )

    const digitalBloco = nova ? (
        <div role="button" onClick={() => ir('cat')} className="rounded-3xl p-3.5 flex items-center gap-3 cursor-pointer" style={{ border: `1.5px dashed ${colors.border}` }}>
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${C.pronto}22`, color: C.pronto }}><GraduationCap size={20} /></span>
            <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black">Venda cursos, músicas e programas</p><p className="text-[11.5px]" style={{ color: colors.textSecondary }}>Sem entrega nem estoque. Comece por um produto grátis.</p></div>
            <ChevronRight size={16} style={{ color: colors.textSecondary }} />
        </div>
    ) : (
        <div role="button" onClick={() => ir('digital')} className="rounded-3xl p-3.5 cursor-pointer" style={card}>
            <div className="grid grid-cols-4 gap-1.5 text-center">
                {[['Produtos', '10', C.pronto], ['Vendas', 'R$ 506', C.novo], ['Grátis', '0', C.caminho], ['Baixados', '0', C.servico]].map(([l, v, c]) => (
                    <div key={l}><p className="text-[16px] font-black leading-none" style={{ color: c }}>{v}</p><p className="text-[10px] font-bold mt-1" style={{ color: colors.textSecondary }}>{l}</p></div>
                ))}
            </div>
            <div className="mt-3 pt-3 flex items-center gap-2 text-[12px] font-bold" style={{ borderTop: `1px solid ${colors.border}` }}>
                <Crown size={14} style={{ color: ORANGE }} />Clube sem mensalidade<span className="ml-auto flex items-center gap-1" style={{ color: ORANGE }}>Gerenciar<ChevronRight size={13} /></span>
            </div>
        </div>
    )

    const reputacaoBloco = nova ? (
        <Vazio titulo="Ainda sem avaliações" texto="Depois das primeiras compras e serviços, a nota da loja aparece aqui." cor={colors.textSecondary} caixa={card} />
    ) : (
        <div className="rounded-3xl p-3.5" style={card}>
            <button className="w-full flex items-center gap-3 text-left" onClick={() => setVerEstrelas((v) => !v)}>
                <span className="text-[34px] font-black leading-none">4,6</span>
                <span className="flex-1"><span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={15} fill={i <= 4 ? '#eab308' : 'none'} style={{ color: '#eab308' }} />)}</span><span className="text-[11.5px]" style={{ color: colors.textSecondary }}>120 avaliações · 119 de produtos</span></span>
                <ChevronRight size={16} className={verEstrelas ? 'rotate-90 transition' : 'transition'} style={{ color: colors.textSecondary }} />
            </button>
            {verEstrelas && (
                <div className="mt-3 space-y-1.5">
                    {[[5, 83], [4, 26], [3, 7], [2, 4], [1, 0]].map(([n, q]) => (
                        <div key={n} className="flex items-center gap-2 text-[11px] font-bold"><span className="w-3">{n}</span><span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: `${colors.border}60` }}><span className="block h-full rounded-full" style={{ width: `${(q / 83) * 100}%`, background: '#eab308' }} /></span><span className="w-6 text-right" style={{ color: colors.textSecondary }}>{q}</span></div>
                    ))}
                </div>
            )}
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
                <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>Gabriela Carvalho · há 3 d · Pizza Carne Seca com Abóbora</p>
                <p className="text-[13px] font-semibold mt-0.5">“Adorei os ingredientes extras, ficou do jeito que pedi.”</p>
                <button onClick={() => ir('avaliacoes')} className="text-[12px] font-black mt-2 flex items-center gap-1" style={{ color: ORANGE }}>Ver todas as avaliações<ChevronRight size={13} /></button>
            </div>
        </div>
    )

    // cada atalho tem a SUA cor (identidade); o estado vem do selo: ligado (verde), desligado (cinza, tile apagado) ou falta algo (vermelho)
    type Est = 'on' | 'off' | 'warn'
    // a EQUIPE só trabalha quando a loja entrega por conta própria; com o Entregador do iUser ligado ela fica desligada (abre, mas só explica)
    const entregaIuser = temProdutos && (ger.ent !== undefined ? ger.ent : !nova)
    const base: { k: string; t: string; ic: ReactNode; cor: string; mostrar: boolean; liga?: boolean; texto: (e: Est) => string; est: Est }[] = [
        { k: 'inf', t: 'Dados da loja', ic: <Store size={19} />, cor: '#6366f1', mostrar: true, texto: () => (nova ? 'falta a descrição' : 'logo, links, modelo'), est: nova ? 'warn' : 'on' },
        { k: 'cat', t: 'Catálogo', ic: <Package size={19} />, cor: '#3b82f6', mostrar: true, texto: () => (nova ? 'nada cadastrado' : [temProdutos && '33 produtos', temDigital && !nova && '3 digitais', temServicos && '7 serviços', temProdutos && '3 combos'].filter(Boolean).join(' · ')), est: nova ? 'warn' : 'on' },
        { k: 'ent', t: 'Entrega', ic: <Truck size={19} />, cor: '#22c55e', mostrar: temProdutos, liga: true, texto: (e) => (e === 'on' ? 'iUser ligado' : 'só retirada'), est: nova ? 'off' : 'on' },
        { k: 'pag', t: 'Pagamento', ic: <CreditCard size={19} />, cor: '#16a34a', mostrar: true, texto: () => (nova ? 'falta o Pix' : 'Pix ✓ · cartão'), est: nova ? 'warn' : 'on' },
        { k: 'hor', t: 'Horários', ic: <Timer size={19} />, cor: '#eab308', mostrar: true, texto: () => '18h–00h', est: 'on' },
        { k: 'age', t: 'Agenda', ic: <HandCoins size={19} />, cor: '#8b5cf6', mostrar: temServicos, liga: true, texto: (e) => (e === 'on' ? 'entrada 30%' : 'agenda fechada'), est: 'on' },
        { k: 'eqp', t: 'Equipe', ic: <Users size={19} />, cor: '#06b6d4', mostrar: true, texto: () => (entregaIuser ? 'desligada · entrega iUser' : nova ? 'só você' : '2 pessoas'), est: entregaIuser ? 'off' : nova ? 'off' : 'on' },
        { k: 'pub', t: 'Publicações', ic: <Megaphone size={19} />, cor: '#f97316', mostrar: true, liga: true, texto: (e) => (e === 'on' ? '4 posts' : 'nenhum post'), est: nova ? 'off' : 'on' },
        { k: 'clu', t: 'Clube VIP', ic: <Crown size={19} />, cor: '#d97706', mostrar: true, liga: true, texto: (e) => (e === 'on' ? 'grátis · 38 membros' : 'desligado'), est: nova ? 'off' : 'on' },
        { k: 'zap', t: 'WhatsApp', ic: <Zap size={19} />, cor: '#10b981', mostrar: true, liga: true, texto: (e) => (e === 'on' ? 'avisos ligados' : 'desligado'), est: 'off' },
    ]
    const estDe = (g: (typeof base)[number]): Est => (g.liga && ger[g.k] !== undefined ? (ger[g.k] ? 'on' : 'off') : g.est)
    // ===== MISSÕES DA LOJA: o cadastro que falta (vale pontos uma vez) + as missões do dia (reiniciam toda manhã) =====
    const feitoBase: Record<string, boolean> = nova
        ? { foto: true, desc: false, hor: true, age: false, prim: false, pix: false, ent: false, pedido: false, conversa: false, publicacao: false, novidade: false, repasse: false }
        : calmo
            ? { foto: true, desc: true, hor: true, age: true, prim: true, pix: true, ent: true, pedido: true, conversa: true, publicacao: true, novidade: false, repasse: true }
            : { foto: true, desc: true, hor: true, age: true, prim: true, pix: true, ent: true, pedido: novosProd === 0, conversa: false, publicacao: false, novidade: true, repasse: false }
    const feita = (k: string) => (miss[k] !== undefined ? miss[k] : feitoBase[k])
    type Ms = { k: string; t: string; pts: number; ir?: string }
    const cadastro = [
        { k: 'foto', t: 'Logo da loja', pts: 10, ir: 'inf' }, { k: 'desc', t: 'Descrição da loja', pts: 5, ir: 'inf' }, { k: 'hor', t: 'Horário de funcionamento', pts: 10, ir: 'hor' },
        temServicos ? { k: 'age', t: 'Agenda de horários', pts: 10, ir: 'age' } : null,
        { k: 'prim', t: 'Primeiro produto ou serviço', pts: 15, ir: temProdutos || !temServicos ? 'cat' : 'srv' },
        { k: 'pix', t: 'Chave Pix', pts: 10, ir: 'pag' }, temProdutos ? { k: 'ent', t: 'Como a entrega funciona', pts: 10, ir: 'ent' } : null,
    ].filter(Boolean) as Ms[]
    // as missões do dia são as REAIS (migration 20261130000055): cada uma o banco confere sozinho
    const diarias = [
        temProdutos ? { k: 'pedido', t: 'Responder um pedido', pts: 5 } : null, { k: 'conversa', t: 'Responder uma conversa', pts: 3 }, { k: 'publicacao', t: 'Fazer uma publicação', pts: 5, ir: 'pub' },
        { k: 'novidade', t: 'Cadastrar uma novidade', pts: 3, ir: 'cat' }, temProdutos ? { k: 'repasse', t: 'Conferir um repasse', pts: 2 } : null,
    ].filter(Boolean) as Ms[]
    const ptsHoje = diarias.filter((m) => feita(m.k)).reduce((t, m) => t + m.pts, 0)
    const ptsTotal = diarias.reduce((t, m) => t + m.pts, 0)
    const semana = (nova ? 0 : calmo ? 31 : 44) + ptsHoje
    const outdoorPts = Math.round((nova ? 35 : 60) * 0.5 + ptsHoje * 0.5)      // peso 0,5 por ponto de missão (editável no Admin)
    const faltaCad = cadastro.filter((m) => !feita(m.k))
    const SELO: Record<Est, { l: string; c: string }> = { on: { l: 'Ligado', c: '#16a34a' }, off: { l: 'Desligado', c: '#9ca3af' }, warn: { l: 'Falta', c: C.alerta } }
    const gerenciarBloco = (
        <>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px] font-bold" style={{ color: colors.textSecondary }}>
                {(['on', 'off', 'warn'] as Est[]).map((e) => <span key={e} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: SELO[e].c }} />{e === 'warn' ? 'Precisa de atenção' : SELO[e].l}</span>)}
                <span className="flex items-center gap-1"><ChevronRight size={12} />abre página</span>
                <span className="ml-auto">sem seta: abre folha</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {base.filter((g) => g.mostrar).map((g) => {
                    const e: Est = estDe(g)
                    const off = e === 'off'; const warn = e === 'warn'
                    const cor = off ? '#9ca3af' : warn ? C.alerta : g.cor
                    return (
                        <button key={g.k + estado} onClick={() => ir(g.k)}
                            className="relative rounded-2xl p-2.5 pt-3 text-left active:scale-95 transition overflow-hidden"
                            style={{ background: off ? `${colors.border}22` : `${cor}14`, border: `1.5px solid ${off ? colors.border : `${cor}${warn ? 'aa' : '66'}`}`, opacity: off ? 0.8 : 1 }}>
                            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full" style={{ background: SELO[e].c, boxShadow: e === 'on' ? `0 0 0 3px ${SELO[e].c}33` : undefined }} />
                            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: off ? `${colors.border}80` : `${cor}26`, color: cor }}>{g.ic}</span>
                            <span className="block text-[12.5px] font-black mt-1.5 leading-tight" style={{ color: off ? colors.textSecondary : colors.textPrimary }}>{g.t}</span>
                            <span className="block text-[10.5px] font-bold leading-tight mt-0.5" style={{ color: off ? colors.textSecondary : cor }}>{g.texto(e)}</span>
                            {DESTINOS[g.k].tipo === 'pagina' && <ChevronRight size={14} className="absolute bottom-2 right-2" style={{ color: off ? colors.textSecondary : cor }} />}
                        </button>
                    )
                })}
            </div>
        </>
    )

    const missoesBloco = (
        <div className="rounded-3xl p-3.5" style={card}>
            <div className="flex items-end justify-between">
                <p className="text-[26px] font-black leading-none">{ptsHoje}<span className="text-[14px] font-bold" style={{ color: colors.textSecondary }}> de {ptsTotal} pts hoje</span></p>
                <Trophy size={22} style={{ color: ORANGE }} />
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mt-2.5" style={{ background: `${colors.border}60` }}><span className="block h-full rounded-full transition-all" style={{ width: `${(ptsHoje / ptsTotal) * 100}%`, background: ptsHoje === ptsTotal ? '#22c55e' : ORANGE }} /></div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
                <span className="h-7 px-2.5 rounded-full text-[11px] font-black flex items-center" style={{ background: `${ORANGE}1f`, color: ORANGE }}>{semana} pts na semana</span>
                <span className="h-7 px-2.5 rounded-full text-[11px] font-black flex items-center gap-1" style={{ background: `${C.preparando}26`, color: '#a16207' }}><Flame size={12} />{nova ? 'sem sequência ainda' : '4 dias seguidos'}</span>
                <span className="h-7 px-2.5 rounded-full text-[11px] font-black flex items-center" style={{ background: `${colors.border}50` }}>Missões somam {outdoorPts} pts no Outdoor</span>
            </div>

            <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-1.5" style={{ color: colors.textSecondary }}>Missões de hoje</p>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                {diarias.map((m, i) => {
                    const ok = feita(m.k)
                    return (
                        <button key={m.k} onClick={() => setMiss((x) => ({ ...x, [m.k]: !ok }))} className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:opacity-70" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined, background: ok ? `${C.novo}0f` : colors.background }}>
                            <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={ok ? { background: C.novo, color: '#fff' } : { border: `2px solid ${colors.border}` }}>{ok && <Check size={13} />}</span>
                            <span className="flex-1 text-[13px] font-bold" style={{ textDecoration: ok ? 'line-through' : undefined, color: ok ? colors.textSecondary : undefined }}>{m.t}</span>
                            <span className="text-[11.5px] font-black px-2 py-0.5 rounded-full" style={{ background: ok ? `${C.novo}22` : `${ORANGE}1f`, color: ok ? '#16a34a' : ORANGE }}>+{m.pts}</span>
                        </button>
                    )
                })}
            </div>
            <p className="text-[10.5px] mt-1.5" style={{ color: colors.textSecondary }}>No laboratório, toque numa missão para simular que ela foi cumprida.</p>

            {faltaCad.length === 0 ? (
                <p className="text-[12px] font-bold mt-4 flex items-center gap-1.5" style={{ color: '#16a34a' }}><Check size={14} />Cadastro da loja completo · {cadastro.length} de {cadastro.length}</p>
            ) : (
                <>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-4 mb-1.5 flex items-center gap-2" style={{ color: colors.textSecondary }}>Falta no cadastro<span className="normal-case tracking-normal font-bold">{cadastro.length - faltaCad.length} de {cadastro.length} feitos</span></p>
                    <div className="flex flex-wrap gap-1.5">
                        {faltaCad.map((m) => (
                            <button key={m.k} onClick={() => m.ir && ir(m.ir)} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center gap-1.5 active:scale-95" style={{ background: `${C.ambar}1f`, border: `1.5px solid ${C.ambar}`, color: '#b45309' }}>{m.t}<span className="text-[10.5px] px-1.5 rounded-full text-white" style={{ background: C.ambar }}>+{m.pts}</span><ChevronRight size={13} /></button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )

    // ===== "Atual": a ordem dos blocos de hoje (medida no celular: 4.056 px de rolagem) =====
    const atual = (
        <div className="rounded-3xl overflow-hidden" style={card}>
            {['Ver loja · Compartilhar · Editar loja', 'Pedidos na loja (funil: Novos, Em preparo, Prontos, A caminho + aba Serviços com 40)', 'Caixa das entregas', 'Digital (+ Apoios recebidos)', 'Agenda da loja', 'Venda presencial', 'Vendas (Hoje · Semana · Mês)', 'Avaliações e comentários (120, lista aberta)', 'Visitantes (gráfico por dia)'].map((b, i) => (
                <div key={b} className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] font-semibold" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                    <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}80` }}>{i + 1}</span>{b}
                </div>
            ))}
            <p className="px-3.5 py-3 text-[12px] leading-snug" style={{ borderTop: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                No celular da pizzaria isso dá <b style={{ color: colors.textPrimary }}>4.056 px de rolagem</b> (medido). Para saber se algo espera por você é preciso abrir/rolar 6 blocos. As configurações ficam em outra página (Editar loja).
            </p>
        </div>
    )

    return (
        <div className="min-h-[100dvh] flex justify-center" style={{ background: colors.surface, color: colors.textPrimary }}>
            <div className="relative w-full max-w-md min-h-[100dvh]" style={{ background: colors.background, boxShadow: '0 0 0 1px ' + colors.border }}>
                {/* ===== controles do laboratório ===== */}
                <div className="px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={16} style={{ color: ORANGE }} />
                        <p className="text-[13px] font-black">Laboratório do painel da loja (3.0)</p>
                        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${colors.border}60`, color: colors.textSecondary }}>só teste</span>
                    </div>
                    <div className="flex gap-2">
                        {(['nova', 'atual'] as const).map((v) => (
                            <button key={v} onClick={() => setVersao(v)} className="flex-1 h-9 rounded-full text-[12px] font-black active:scale-95 transition" style={pill(versao === v)}>{v === 'nova' ? 'Proposta' : 'Atual (hoje)'}</button>
                        ))}
                    </div>
                    {versao === 'nova' && (
                        <>
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                                <span className="text-[10.5px] font-bold self-center mr-1" style={{ color: colors.textSecondary }}>Dia da loja:</span>
                                {([['movimentado', 'Movimentado'], ['tranquilo', 'Tranquilo'], ['nova', 'Loja nova']] as const).map(([k, l]) => (
                                    <button key={k} onClick={() => { setEstado(k); setGer({}); setMiss({}) }} className="h-7 px-2.5 rounded-full text-[11px] font-bold active:scale-95" style={pill(estado === k)}>{l}</button>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <span className="text-[10.5px] font-bold self-center mr-1" style={{ color: colors.textSecondary }}>Modelo:</span>
                                {([['mixed', 'Produtos e serviços'], ['products', 'Só produtos'], ['services', 'Só serviços'], ['digital', 'Só digitais']] as const).map(([k, l]) => (
                                    <button key={k} onClick={() => setModelo(k)} className="h-7 px-2.5 rounded-full text-[11px] font-bold active:scale-95" style={pill(modelo === k)}>{l}</button>
                                ))}
                                <button onClick={() => setNotas((v) => !v)} className="h-7 px-2.5 rounded-full text-[11px] font-bold active:scale-95 flex items-center gap-1" style={pill(notas, '#16a34a')}><Info size={12} />Notas</button>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-4 pt-4 pb-40">
                    {versao === 'atual' ? atual : (
                        <>
                            {notas && <div className="mb-3 rounded-2xl p-3 text-[11.5px] leading-snug" style={{ background: `${ORANGE}0d`, border: `1px solid ${ORANGE}40` }}><b style={{ color: ORANGE }}>Ideia: </b>o painel deixa de ser uma lista de relatórios e vira o <b>comando do dia</b>: primeiro o que depende de você, depois atender, depois como está indo, e a configuração fica a um toque (sem atrapalhar).</div>}
                            {sec('cabecalho', 'Sua loja')}
                            {cabecalho}
                            {nova && <>{sec('missoes', 'Missões da loja')}{missoesBloco}</>}
                            {sec('agora', 'Precisa de você agora', !nova && atencao.length > 0 ? <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: C.novo }}>{atencao.length}</span> : undefined)}
                            {precisa}
                            {temProdutos && <>{sec('pedidos', 'Pedidos')}{pedidosBloco}</>}
                            {!temProdutos && temDigital && !nova && <>{sec('liberar', 'Vendas digitais')}{liberarBloco}</>}
                            {temServicos && !temProdutos && <>{sec('pedidos', 'Pedidos de serviço')}{pedidosBloco}</>}
                            {sec('hoje', 'Como está o dia')}
                            {hojeBloco}
                            {!nova && <>{sec('desempenho', 'Desempenho e qualidade')}<Desempenho c={colors} focos={focos} calmo={calmo} onIr={ir} /></>}
                            {!nova && <>{sec('missoes', 'Missões da loja')}{missoesBloco}</>}
                            {temServicos && <>{sec('agenda', 'Próximos compromissos')}{agendaBloco}</>}
                            {sec('caixa', 'Dinheiro')}
                            {caixaBloco}
                            {sec('digital', 'Digital e Clube')}
                            {digitalBloco}
                            {sec('reputacao', 'O que dizem da loja')}
                            {reputacaoBloco}
                            {sec('gerenciar', 'Gerenciar a loja')}
                            {gerenciarBloco}
                            {notas && <>{sec('balcao', 'Venda no balcão')}<p className="text-[11.5px] -mt-1 mb-2" style={{ color: colors.textSecondary }}>É o botão laranja fixo no canto (acima da barra do app).</p></>}

                            <div className="mt-8">
                                <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Para onde foi cada bloco de hoje</p>
                                <div className="rounded-3xl overflow-hidden" style={card}>
                                    {MAPA.map(([a, b], i) => (
                                        <div key={a} className="px-3.5 py-2.5 text-[12px]" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                                            <span className="font-black">{a}</span><span className="flex items-start gap-1 font-semibold mt-0.5" style={{ color: colors.textSecondary }}><ChevronRight size={13} className="mt-[1px] flex-shrink-0" />{b}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] font-black uppercase tracking-wider mt-6 mb-2" style={{ color: colors.textSecondary }}>O que cada atalho abre (as ligações)</p>
                                <div className="rounded-3xl overflow-hidden" style={card}>
                                    {Object.entries(DESTINOS).map(([k, d], i) => (
                                        <div key={k} className="px-3.5 py-2.5 text-[12px]" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                                            <p className="flex items-center gap-2"><span className="font-black">{d.titulo}</span><span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={d.tipo === 'pagina' ? { background: `${C.caminho}22`, color: C.caminho } : { background: `${C.pronto}22`, color: C.pronto }}>{d.tipo === 'pagina' ? 'página' : 'folha'}</span></p>
                                            <p className="font-mono text-[10.5px] mt-0.5" style={{ color: colors.textSecondary }}>{d.rota}</p>
                                            <p className="text-[10.5px]" style={{ color: colors.textSecondary }}>já existe como <b>{d.comp}</b></p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11.5px] mt-3 leading-snug" style={{ color: colors.textSecondary }}>
                                    Dica: troque o <b>dia da loja</b> e o <b>modelo</b> lá em cima — os blocos que não fazem sentido (agenda numa loja só de produtos, caixa de entrega numa loja só de serviços) somem, e a loja nova ganha um passo a passo no lugar do vazio. Toque em <b>Aceitar</b> para ver o pedido passar de etapa.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {pagina && <Pagina k={pagina} onClose={() => setPagina(null)} onIr={ir} />}
                {extratoAb && <Extrato onClose={() => setExtratoAb(false)} />}
                {balcaoAb && <Balcao onClose={() => setBalcaoAb(false)} />}
                {editarAb && (
                    <Editar nivel={nivelLoja} nomeNivel={nomeNivel} logoCor={logoCor} logoImg={logoImg} onLogo={() => setLogoAb(true)} onClose={() => setEditarAb(false)} onAbrir={ir} onCompartilhar={() => setShareAb(true)}
                        itens={base.filter((g) => g.mostrar).map((g) => ({ k: g.k, t: g.t, ic: g.ic, cor: g.cor, texto: g.texto(estDe(g)), estado: estDe(g) }))} />
                )}
                {aberto && (() => {
                    const g = base.find((x) => x.k === aberto)!
                    return <Destino key={aberto} k={aberto} cor={g.cor} icone={g.ic} nova={nova} on={estDe(g) === 'on'} setOn={(v) => setGer((m) => ({ ...m, [aberto]: v }))} entregaOn={estDe(base.find((x) => x.k === 'ent')!) === 'on'} onClose={() => setAberto(null)} agendaAba={agendaAba} tem={{ prod: temProdutos, serv: temServicos, dig: temDigital }} catAba={catAba} onIr={ir} />
                })()}
                {shareAb && <Compartilhar onClose={() => setShareAb(false)} />}
                {logoAb && <LogoFolha nivel={nivelLoja} pontos={pontosLoja} cor={logoCor} setCor={setLogoCor} img={logoImg} setImg={setLogoImg} onClose={() => setLogoAb(false)} />}
                {/* botão fixo: venda no balcão (acima da barra do app) */}
                {versao === 'nova' && !nova && temProdutos && (
                    <div className="fixed inset-x-0 bottom-0 flex justify-center pointer-events-none" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
                        <div className="w-full max-w-md px-4 flex justify-end">
                            <button onClick={() => ir('balcao')} className="pointer-events-auto h-12 px-5 rounded-full text-[13.5px] font-black text-white flex items-center gap-2 shadow-xl active:scale-95 transition" style={{ background: ORANGE, boxShadow: '0 10px 26px rgba(249,115,22,.45)' }}>
                                <Plus size={18} /><ShoppingBag size={16} />Venda no balcão
                            </button>
                        </div>
                    </div>
                )}
                {/* a barra do modo loja (só para dar a medida do espaço) */}
                <div className="fixed inset-x-0 bottom-0 flex justify-center pointer-events-none" style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
                    <div className="w-full max-w-md px-3">
                        <div className="pointer-events-auto rounded-[28px] flex items-center justify-around h-[68px] text-[10.5px] font-bold" style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: '0 10px 28px rgba(0,0,0,.14)' }}>
                            {[['Explorar', <Eye key="a" size={20} />, false], ['Painel', <Store key="b" size={20} />, true], ['Pedidos', <ClipboardList key="c" size={20} />, false], ['Conversas', <MessageCircle key="d" size={20} />, false], ['Pizzaria', <Gift key="e" size={20} />, false]].map(([l, ic, on]) => (
                                <button key={String(l)} onClick={() => (l === 'Pedidos' ? ir('pedidos') : l === 'Conversas' ? ir('conversas') : undefined)} className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-2xl" style={on ? { background: `${ORANGE}1f`, color: ORANGE } : { color: colors.textSecondary }}>{ic as ReactNode}{l as string}</button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Vazio({ titulo, texto, cor, caixa }: { titulo: string; texto: string; cor: string; caixa?: { background: string; border: string } }) {
    return (
        <div className={caixa ? 'rounded-3xl p-4 text-center' : 'py-5 text-center'} style={caixa}>
            <p className="text-[13.5px] font-black">{titulo}</p>
            <p className="text-[12px] mt-1 leading-snug" style={{ color: cor }}>{texto}</p>
        </div>
    )
}

function Mini({ cor, titulo, valor, sub, colors, onClick }: { cor: string; titulo: string; valor: string; sub: string; colors: { border: string; textSecondary: string; background: string }; onClick?: () => void }) {
    return (
        <div role={onClick ? 'button' : undefined} onClick={onClick} className="rounded-2xl p-3 text-left active:scale-[.98] transition" style={{ cursor: onClick ? 'pointer' : undefined, background: colors.background, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${cor}` }}>
            <p className="text-[10.5px] font-bold" style={{ color: cor }}>{titulo}</p>
            <p className="text-[17px] font-black leading-tight mt-0.5">{valor}</p>
            <p className="text-[10.5px] leading-tight mt-0.5" style={{ color: colors.textSecondary }}>{sub}</p>
        </div>
    )
}
