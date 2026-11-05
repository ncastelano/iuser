// src/app/(main)/paginateste/NavLab.tsx
//
// LABORATÓRIO DA NAVBAR (página de teste, não faz parte do app): compara a barra ATUAL (6 ícones iguais, sem nome) com uma PROPOSTA
// pensada pelas tarefas da pessoa — e que acompanha o MODO (pessoa, loja, motorista). Nada aqui grava dado nem navega de verdade:
// as abas são estado local, para ver como a barra se comporta. Se a proposta for aprovada, ela vira o BottomNavBar da 3.0.
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
    Bike, Car, ClipboardList, Compass, GraduationCap, LayoutDashboard, MessageCircle, MessagesSquare, Music, Pause, Play, Radar, Search, Settings,
    ShoppingCart, SkipBack, SkipForward, Sparkles, Store, User, Users, Wallet, X, Zap, ChevronDown, ChevronRight, Check,
} from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { BAR_BOTTOM } from '@/components/BottomNavBar'

type Mode = 'pessoa' | 'loja' | 'motorista'
type Variant = 'nova' | 'atual'

interface Tab { key: string; label: string; icon: ReactNode; badge?: number; badgeColor?: string; what: string[]; sub?: string[]; why: string }

const ORANGE = '#f97316'

// ===== As abas da PROPOSTA, por modo: Início sempre à esquerda (explorar e buscar é de todos) e Eu sempre à direita (quem sou, meus modos) =====
function tabsFor(mode: Mode, n: { orders: number; chats: number; cart: number; newOrders: number }): Tab[] {
    const home: Tab = {
        key: 'inicio', label: 'Explorar', icon: <Compass size={22} />,
        what: ['Busca no topo (a lupa deixou de ser um botão)', 'Preciso de… / Quero ganhar…', 'Promoções, lojas, serviços, imóveis', 'Cursos, músicas e programas (vitrine digital)', 'Outdoor por pontuação'],
        why: 'A vitrine do iUser, igual em todos os modos. O nome diz o que é: o "início do trabalho" de cada modo está nas outras abas. Tocar de novo volta ao topo.',
    }
    const eu = (label: string, icon: ReactNode): Tab => ({
        key: 'eu', label, icon,
        what: ['Trocar de modo (pessoa, loja, motorista)', 'Ver perfil · Painel do modo', 'Configurações, planos, ajuda', 'Versão da interface'],
        why: 'O que hoje é o botão "modo" vira uma aba com nome: tocar abre o menu de modos e, ao trocar, a barra inteira muda.',
    })
    if (mode === 'loja') return [
        home,
        { key: 'painel', label: 'Painel', icon: <LayoutDashboard size={22} />, what: ['Resumo do dia e vendas', 'Agenda da loja', 'Avaliações e comentários', 'Digital: conteúdo, vendas, apoios e Clube', 'Editar loja'], why: 'O feedback do que acontece na loja, no lugar de ficar atrás de um menu.' },
        { key: 'pedidos', label: 'Pedidos', icon: <ClipboardList size={22} />, badge: n.newOrders, badgeColor: '#22c55e', sub: ['Novos', 'Preparando', 'Prontos', 'Serviços'], what: ['Novos · Preparando · Prontos · Finalizados', 'Pedidos de serviço a aceitar', 'Entregas e motoristas'], why: 'Quem tem loja abre o app para atender pedido: é a aba que mais pesa, com o contador de novos.' },
        { key: 'conversas', label: 'Conversas', icon: <MessageCircle size={22} />, badge: n.chats, badgeColor: '#16a34a', what: ['Clientes da loja', 'Pedidos viram conversa'], why: 'Atendimento é falar com cliente; fica a um toque.' },
        eu('Pizzaria', <Store size={20} />),
    ]
    if (mode === 'motorista') return [
        home,
        { key: 'corridas', label: 'Corridas', icon: <Car size={22} />, what: ['Corridas de passageiro perto de você', 'Me candidatei · Corrida aceita', 'Negociar o valor'], why: 'O trabalho do motorista é achar corrida: lista e valores, sem rodeio.' },
        { key: 'entregas', label: 'Entregas', icon: <Bike size={22} />, badge: 2, badgeColor: '#22c55e', what: ['Entregas de loja abertas', 'Percurso com mapa', 'Caixa e repasses'], why: 'Entrega de loja tem fluxo próprio (mochila, retirada, prova), então tem aba própria.' },
        { key: 'ganhos', label: 'Ganhos', icon: <Wallet size={22} />, what: ['Hoje, semana, mês', 'Meu ganho mínimo por hora', 'Tarifa e veículo'], why: 'Quanto ganhei e como ganhar mais — o que hoje está escondido em abas do painel.' },
        eu('Motorista', <Car size={20} />),
    ]
    return [
        home,
        { key: 'perto', label: 'Perto', icon: <Radar size={22} />, what: ['Mapa: lojas, serviços, pessoas, imóveis', 'Motoristas disponíveis', 'Outdoor por tipo'], why: '"Ver ao redor" é a cara do iUser. Com nome e no lugar certo, deixa de ser um ícone de radar solto.' },
        { key: 'social', label: 'Social', icon: <Users size={22} />, sub: ['Agora', 'Quem eu sigo', 'Me seguem'], what: ['Flash em tela cheia', 'Publicações e pessoas', 'Comunidades'], why: 'Tudo que é "gente" junto: Flash, pessoas, comunidades.' },
        {
            key: 'atividade', label: 'Atividade', icon: <MessagesSquare size={22} />, badge: n.chats + n.orders, badgeColor: '#16a34a', sub: ['Conversas', 'Pedidos', 'Carrinho', 'Biblioteca', 'Avisos'],
            what: ['Conversas', 'Meus pedidos e entregas', 'Carrinho e agenda', 'Biblioteca: músicas, cursos, programas e o que o Clube libera', 'Avisos (a ilha guarda o histórico)'], why: 'Carrinho, conversas e pedidos eram três botões; para a pessoa é UMA pergunta: "o que está acontecendo comigo?".',
        },
        eu('Eu', <User size={20} />),
    ]
}

// ===== A barra ATUAL (para comparar): seis ícones iguais, sem nome =====
const CURRENT: Tab[] = [
    { key: 'cart', label: 'Carrinho', icon: <ShoppingCart size={21} />, badge: 4, badgeColor: '#ef4444', what: ['Carrinho', 'Pedidos (aba)', 'Digital (aba)'], why: 'Hoje: só ícone.' },
    { key: 'chat', label: 'Conversas', icon: <MessageCircle size={21} />, badge: 3, badgeColor: '#16a34a', what: ['Conversas e salas de loja'], why: 'Hoje: só ícone.' },
    { key: 'modo', label: 'Modo', icon: <User size={21} />, what: ['Abre o menu de modos'], why: 'Hoje: a foto do modo, sem dizer o que é.' },
    { key: 'radar', label: 'Radar', icon: <Radar size={21} />, what: ['Mapa ao redor'], why: 'Hoje: ícone de radar.' },
    { key: 'social', label: 'Social', icon: <Users size={21} />, what: ['Flash, pessoas, comunidades'], why: 'Hoje: só ícone.' },
    { key: 'lupa', label: 'Procurar', icon: <Search size={21} />, what: ['Leva à home (busca)'], why: 'Hoje: a lupa leva à home.' },
]

// ===== MINI-PLAYER: sempre mostra a ÚLTIMA coisa que a pessoa estava vendo/ouvindo (música, aula em vídeo ou flash); dá para fechar =====
type PlayerKind = 'musica' | 'aula' | 'flash'
interface Source { kind: PlayerKind; label: string; title: string; sub: string; len: number; bg: string; icon: ReactNode; wide: boolean }
const SOURCES: Record<PlayerKind, Source> = {
    musica: { kind: 'musica', label: 'Música', title: 'Noites de Porto Velho', sub: 'Banda do Forno · Música', len: 200, bg: 'linear-gradient(135deg,#a855f7,#6d28d9)', icon: <Music size={18} color="#fff" />, wide: false },
    aula: { kind: 'aula', label: 'Aula', title: 'Aula 3 · Massa que cresce', sub: 'Curso de Pizzaiolo · Aula', len: 600, bg: 'linear-gradient(135deg,#38bdf8,#2563eb)', icon: <GraduationCap size={18} color="#fff" />, wide: true },
    flash: { kind: 'flash', label: 'Flash', title: 'Entrega feita em 12 minutos', sub: 'Flash · @dani.moto', len: 0, bg: 'linear-gradient(135deg,#fb7185,#e11d48)', icon: <Zap size={18} color="#fff" />, wide: false },
}
interface Player { kind: PlayerKind; playing: boolean; pos: number }
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const MODES: { key: Mode; title: string; sub: string; icon: ReactNode; color: string }[] = [
    { key: 'pessoa', title: 'Pessoa', sub: '@nilton · comprar, contratar, publicar', icon: <User size={18} />, color: '#3b82f6' },
    { key: 'loja', title: 'Pizzaria Forno de Ouro', sub: 'Modo loja · 3 pedidos novos', icon: <Store size={18} />, color: '#f97316' },
    { key: 'motorista', title: 'Motorista', sub: 'Modo motorista · moto', icon: <Car size={18} />, color: '#16a34a' },
]

const MODE_AVATAR: Record<Mode, { bg: string; glyph: ReactNode }> = {
    pessoa: { bg: 'linear-gradient(135deg,#60a5fa,#2563eb)', glyph: <User size={15} color="#fff" strokeWidth={2.6} /> },
    loja: { bg: 'linear-gradient(135deg,#fb923c,#ea580c)', glyph: <Store size={15} color="#fff" strokeWidth={2.6} /> },
    motorista: { bg: 'linear-gradient(135deg,#4ade80,#16a34a)', glyph: <Car size={15} color="#fff" strokeWidth={2.6} /> },
}

function Badge({ n, color, ring }: { n: number; color: string; ring: string }) {
    if (n <= 0) return null
    return <span className="absolute -top-0.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: color, boxShadow: `0 0 0 2px ${ring}` }}>{n > 99 ? '99+' : n}</span>
}

export default function NavLab() {
    const { colors } = useTheme()
    const [variant, setVariant] = useState<Variant>('nova')
    const [mode, setMode] = useState<Mode>('pessoa')
    const [tab, setTab] = useState('inicio')
    const [hub, setHub] = useState(false)
    const [live, setLive] = useState<{ cart: boolean; ready: boolean; toast: boolean }>({ cart: false, ready: false, toast: false })
    const [seen, setSeen] = useState<Record<string, boolean>>({})
    const [subTab, setSubTab] = useState<Record<string, number>>({})
    const [bump, setBump] = useState(0)
    const [player, setPlayer] = useState<Player | null>(null)
    const [full, setFull] = useState(false)
    const src = player ? SOURCES[player.kind] : null

    const counts = { orders: seen.atividade ? 0 : 2, chats: seen.atividade ? 0 : 3, cart: 4, newOrders: seen.pedidos ? 0 : 3 }
    const tabs = useMemo(() => tabsFor(mode, counts), [mode, seen.atividade, seen.pedidos]) // eslint-disable-line react-hooks/exhaustive-deps
    const list = variant === 'nova' ? tabs : CURRENT
    const current = list.find((t) => t.key === tab) || list[0]

    useEffect(() => { if (!live.toast) return; const t = setTimeout(() => setLive((l) => ({ ...l, toast: false })), 4000); return () => clearTimeout(t) }, [live.toast])
    useEffect(() => { setTab(variant === 'nova' ? 'inicio' : 'modo') }, [variant])
    // o tempo anda enquanto toca (música e aula; o flash é um laço sem fim)
    useEffect(() => {
        if (!player?.playing || !src || src.len <= 0) return
        const t = setInterval(() => setPlayer((p) => {
            if (!p || !p.playing) return p
            const pos = p.pos + 0.25 / SOURCES[p.kind].len
            return pos >= 1 ? { ...p, pos: 0, playing: false } : { ...p, pos }
        }), 250)
        return () => clearInterval(t)
    }, [player?.playing, player?.kind]) // eslint-disable-line react-hooks/exhaustive-deps
    // só a MÚSICA continua tocando ao sair da tela dela; aula e flash pausam (e ficam à espera, prontos para retomar)
    const leaveScreen = () => setPlayer((p) => (p && p.kind !== 'musica' ? { ...p, playing: false } : p))
    const play = (kind: PlayerKind) => { setPlayer({ kind, playing: true, pos: player?.kind === kind ? player.pos : 0 }); setFull(false) }
    const toggle = () => setPlayer((p) => (p ? { ...p, playing: !p.playing } : p))

    const pick = (key: string) => {
        if (key !== tab) leaveScreen()
        if (variant === 'nova' && key === 'eu') { setFull(false); setHub(true); return }
        if (variant === 'atual' && key === 'modo') { setFull(false); setHub(true); return }
        if (key === tab) { setBump((b) => b + 1); return }   // tocar na aba atual volta ao topo
        setTab(key)
        if (key === 'atividade' || key === 'pedidos') setSeen((s) => ({ ...s, [key]: true }))
    }
    const changeMode = (m: Mode) => { setMode(m); setHub(false); setTab('inicio'); leaveScreen() }

    const stripItems: { text: string; color: string }[] = []
    if (live.cart && !(variant === 'nova' && tab === 'atividade')) stripItems.push({ text: '4 itens · R$ 121,60', color: ORANGE })
    if (live.ready) stripItems.push({ text: '1 pedido pronto', color: '#a855f7' })
    const stripOn = stripItems.length > 0 || live.toast

    const barBg = colors.background
    const ring = barBg
    const sub = current.sub
    const subIdx = subTab[current.key] ?? 0

    return (
        <div className="min-h-[100dvh] flex justify-center" style={{ background: colors.surface, color: colors.textPrimary }}>
            <div className="relative w-full max-w-md min-h-[100dvh] flex flex-col" style={{ background: colors.background, boxShadow: '0 0 0 1px ' + colors.border }}>
                {/* ===== controles do laboratório ===== */}
                <div className="px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={16} style={{ color: ORANGE }} />
                        <p className="text-[13px] font-black">Laboratório da navbar</p>
                        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${colors.border}60`, color: colors.textSecondary }}>só teste</span>
                    </div>
                    <div className="flex gap-2">
                        {(['nova', 'atual'] as Variant[]).map((v) => (
                            <button key={v} onClick={() => setVariant(v)} className="flex-1 h-9 rounded-full text-[12px] font-black active:scale-95 transition"
                                style={variant === v ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                {v === 'nova' ? 'Proposta' : 'Atual (hoje)'}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                        <span className="text-[10.5px] font-bold self-center mr-1" style={{ color: colors.textSecondary }}>Simular na faixa:</span>
                        {([['cart', 'Carrinho'], ['ready', 'Pedido pronto'], ['toast', 'Aviso']] as const).map(([k, l]) => (
                            <button key={k} onClick={() => setLive((s) => ({ ...s, [k]: k === 'toast' ? true : !s[k] }))} className="h-7 px-2.5 rounded-full text-[11px] font-bold active:scale-95"
                                style={{ border: `1px solid ${live[k] ? ORANGE : colors.border}`, color: live[k] ? ORANGE : colors.textPrimary }}>{l}</button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[10.5px] font-bold self-center mr-1" style={{ color: colors.textSecondary }}>Tocar / ver:</span>
                        {(['musica', 'aula', 'flash'] as PlayerKind[]).map((k) => (
                            <button key={k} onClick={() => play(k)} className="h-7 px-2.5 rounded-full text-[11px] font-bold active:scale-95"
                                style={{ border: `1px solid ${player?.kind === k ? ORANGE : colors.border}`, color: player?.kind === k ? ORANGE : colors.textPrimary }}>{SOURCES[k].label}</button>
                        ))}
                    </div>
                </div>

                {/* ===== o conteúdo da aba (mostra o que mora em cada uma) ===== */}
                <div key={`${variant}-${mode}-${current.key}-${bump}`} className="flex-1 px-4 pt-4 animate-[labIn_260ms_ease]" style={{ paddingBottom: `calc(${player ? 220 : 150}px + env(safe-area-inset-bottom))` }}>
                    <div className="flex items-center gap-2.5 mb-1">
                        <span className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: `${ORANGE}1f`, color: ORANGE }}>{current.icon}</span>
                        <div className="min-w-0">
                            <p className="text-[18px] font-black leading-tight">{variant === 'nova' && current.key === 'eu' ? 'Eu' : current.label}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{variant === 'nova' ? `Modo ${mode}` : 'Barra de hoje'}</p>
                        </div>
                    </div>

                    {sub && variant === 'nova' && (
                        <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
                            {sub.map((s, i) => (
                                <button key={s} onClick={() => setSubTab((m) => ({ ...m, [current.key]: i }))} className="h-8 px-3 rounded-full text-[12px] font-black whitespace-nowrap flex-shrink-0 active:scale-95"
                                    style={i === subIdx ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                    {s}{current.key === 'atividade' && s === 'Conversas' && counts.chats > 0 ? ` ${counts.chats}` : ''}{current.key === 'atividade' && s === 'Pedidos' && counts.orders > 0 ? ` ${counts.orders}` : ''}{current.key === 'atividade' && s === 'Carrinho' ? ' 4' : ''}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 rounded-3xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                        <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Aqui mora</p>
                        <ul className="space-y-1.5">
                            {current.what.map((w) => (
                                <li key={w} className="flex items-start gap-2 text-[13px] font-semibold"><Check size={14} className="mt-[3px] flex-shrink-0" style={{ color: '#16a34a' }} />{w}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="mt-3 rounded-3xl p-4" style={{ border: `1px solid ${ORANGE}55`, background: `${ORANGE}0d` }}>
                        <p className="text-[11px] font-black uppercase tracking-wider mb-1" style={{ color: ORANGE }}>Por quê</p>
                        <p className="text-[13px] leading-snug font-semibold">{current.why}</p>
                    </div>

                    {variant === 'nova' && (
                        <div className="mt-3 rounded-3xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Como o mini-player se comporta</p>
                            <ul className="space-y-1.5">
                                {['Mostra sempre a ÚLTIMA coisa: música, aula em vídeo ou flash', 'Música continua tocando em qualquer aba (e com a tela apagada)', 'Aula e flash pausam ao sair da tela e ficam à espera: tocar retoma', 'Tocar na faixa abre o player completo; o X fecha e esquece', 'Fica em cima da barra, abaixo do menu de modos; avisos e carrinho ficam logo abaixo'].map((w) => (
                                    <li key={w} className="flex items-start gap-2 text-[12.5px] font-semibold"><Check size={14} className="mt-[3px] flex-shrink-0" style={{ color: '#16a34a' }} />{w}</li>
                                ))}
                            </ul>
                            <p className="text-[11.5px] mt-2.5" style={{ color: colors.textSecondary }}>Use os botões "Tocar / ver" lá em cima e troque de aba para conferir.</p>
                        </div>
                    )}

                    {variant === 'nova' && mode === 'pessoa' && (
                        <div className="mt-5">
                            <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Para onde foi cada botão de hoje</p>
                            <div className="rounded-3xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                                {[
                                    ['Carrinho', 'Atividade ▸ Carrinho (e na faixa quando há itens)'],
                                    ['Conversas', 'Atividade ▸ Conversas'],
                                    ['Modo (foto)', 'Eu — a barra muda com o modo'],
                                    ['Radar', 'Perto'],
                                    ['Social', 'Social'],
                                    ['Lupa', 'Campo de busca no topo do Explorar'],
                                    ['Digital comprado', 'Atividade ▸ Biblioteca'],
                                    ['Player (novo)', 'Mini-player em cima da barra, em qualquer aba'],
                                ].map(([a, b], i) => (
                                    <div key={a} className="flex items-center gap-2 px-3.5 py-2.5 text-[12px]" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                                        <span className="font-black w-[88px] flex-shrink-0">{a}</span><ChevronRight size={13} style={{ color: colors.textSecondary }} /><span className="font-semibold">{b}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11.5px] mt-3 leading-snug" style={{ color: colors.textSecondary }}>
                                Dica: troque o modo tocando em <strong>Eu</strong> e veja a barra mudar. Tocar de novo na aba em que você já está volta ao topo dela.
                            </p>
                        </div>
                    )}
                </div>

                {/* ===== escurecimento do menu de modos ===== */}
                {(hub || full) && <button aria-label="Fechar" onClick={() => { setHub(false); setFull(false) }} className="fixed inset-0 z-[70] bg-black/45 animate-[labFade_200ms_ease]" />}

                {/* ===== A BARRA ===== */}
                <nav aria-label="Navegação" className="fixed left-0 right-0 pointer-events-none" style={{ bottom: BAR_BOTTOM, zIndex: hub || full ? 75 : 40 }}>
                    <div className="max-w-md w-full mx-auto px-3">
                        <div className="pointer-events-auto relative overflow-hidden" style={{ background: barBg, border: `1px solid ${colors.border}`, borderRadius: 28, boxShadow: hub || full ? '0 24px 60px rgba(0,0,0,0.45)' : '0 10px 28px rgba(0,0,0,0.14)' }}>
                            {/* menu de modos: cresce de dentro da barra */}
                            <div style={{ display: 'grid', gridTemplateRows: hub ? '1fr' : '0fr', transition: 'grid-template-rows 420ms cubic-bezier(0.22,1,0.36,1)' }}>
                                <div style={{ minHeight: 0, overflow: 'hidden' }}>
                                    <div className="p-3.5" style={{ opacity: hub ? 1 : 0, transition: 'opacity 250ms ease' }}>
                                        <div className="flex items-center gap-2 mb-2.5">
                                            <p className="text-[14px] font-black flex-1">Com qual modo você quer usar o iUser?</p>
                                            <button onClick={() => setHub(false)} aria-label="Fechar" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}><X size={15} /></button>
                                        </div>
                                        <div className="space-y-2">
                                            {MODES.map((m) => (
                                                <button key={m.key} onClick={() => changeMode(m.key)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left active:scale-[0.98] transition"
                                                    style={{ border: `1.5px solid ${mode === m.key ? ORANGE : colors.border}`, background: mode === m.key ? `${ORANGE}12` : 'transparent' }}>
                                                    <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: m.color }}>{m.icon}</span>
                                                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-black truncate">{m.title}</span><span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>{m.sub}</span></span>
                                                    {mode === m.key && <Check size={17} style={{ color: ORANGE }} />}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 mt-2.5">
                                            {[[<User key="a" size={15} />, 'Ver perfil'], [<LayoutDashboard key="b" size={15} />, 'Painel'], [<Settings key="c" size={15} />, 'Ajustes']].map(([i, l]) => (
                                                <button key={l as string} className="h-10 rounded-full flex items-center justify-center gap-1.5 text-[12px] font-black" style={{ border: `1px solid ${colors.border}` }}>{i}{l}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* PLAYER COMPLETO: cresce de dentro da barra, como o menu de modos */}
                            <div style={{ display: 'grid', gridTemplateRows: full && src ? '1fr' : '0fr', transition: 'grid-template-rows 420ms cubic-bezier(0.22,1,0.36,1)' }}>
                                <div style={{ minHeight: 0, overflow: 'hidden' }}>
                                    {src && player && (
                                        <div className="p-4" style={{ opacity: full ? 1 : 0, transition: 'opacity 250ms ease' }}>
                                            <div className="flex items-center mb-3">
                                                <button onClick={() => setFull(false)} aria-label="Minimizar" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}><ChevronDown size={17} /></button>
                                                <p className="flex-1 text-center text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{src.label}</p>
                                                <button onClick={() => { setPlayer(null); setFull(false) }} aria-label="Fechar player" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}` }}><X size={15} /></button>
                                            </div>
                                            <div className="mx-auto rounded-3xl flex items-center justify-center" style={{ background: src.bg, width: src.wide ? '100%' : 150, aspectRatio: src.wide ? '16 / 9' : src.kind === 'flash' ? '9 / 16' : '1 / 1', maxHeight: 220, boxShadow: '0 12px 30px rgba(0,0,0,0.25)' }}>
                                                <span style={{ transform: 'scale(2.2)' }}>{src.icon}</span>
                                            </div>
                                            <p className="text-[16px] font-black mt-3 leading-tight">{src.title}</p>
                                            <p className="text-[12px]" style={{ color: colors.textSecondary }}>{src.sub}</p>
                                            {src.len > 0 && (
                                                <div className="mt-3">
                                                    <input type="range" min={0} max={1000} value={Math.round(player.pos * 1000)} onChange={(e) => setPlayer({ ...player, pos: Number(e.target.value) / 1000 })} aria-label="Posição" className="w-full" style={{ accentColor: ORANGE }} />
                                                    <div className="flex justify-between text-[10.5px] font-bold" style={{ color: colors.textSecondary }}><span>{clock(player.pos * src.len)}</span><span>{clock(src.len)}</span></div>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-center gap-5 mt-2">
                                                <button onClick={() => setPlayer({ ...player, pos: Math.max(0, player.pos - 10 / Math.max(src.len, 1)) })} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90"><SkipBack size={20} /></button>
                                                <button onClick={toggle} aria-label={player.playing ? 'Pausar' : 'Tocar'} className="w-14 h-14 rounded-full flex items-center justify-center text-white active:scale-90" style={{ background: ORANGE }}>{player.playing ? <Pause size={24} fill="#fff" /> : <Play size={24} fill="#fff" />}</button>
                                                <button onClick={() => setPlayer({ ...player, pos: Math.min(0.999, player.pos + 10 / Math.max(src.len, 1)) })} aria-label="Avançar" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90"><SkipForward size={20} /></button>
                                            </div>
                                            <button className="w-full h-10 rounded-full text-[12px] font-black mt-3" style={{ border: `1px solid ${colors.border}` }}>{src.kind === 'flash' ? 'Abrir o feed do Flash' : src.kind === 'aula' ? 'Abrir a sala de aula' : 'Abrir a página da música'}</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* MINI-PLAYER: a última coisa que a pessoa estava fazendo; o X fecha */}
                            <div aria-hidden={!src || hub || full} className="relative flex items-center gap-2.5 px-3 overflow-hidden" style={{ height: src && !hub && !full ? 56 : 0, opacity: src && !hub && !full ? 1 : 0, borderBottom: src && !hub && !full ? `1px solid ${colors.border}` : '0 solid transparent', transition: 'height 300ms ease, opacity 250ms ease' }}>
                                {src && player && (
                                    <>
                                        <button onClick={() => setFull(true)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left active:opacity-70" aria-label={`Abrir o player: ${src.title}`}>
                                            <span className="rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: src.bg, width: src.wide ? 56 : src.kind === 'flash' ? 28 : 40, height: src.kind === 'flash' ? 40 : src.wide ? 32 : 40 }}>{src.kind === 'flash' ? <Zap size={14} color="#fff" /> : src.icon}</span>
                                            <span className="min-w-0">
                                                <span className="block text-[12.5px] font-black truncate leading-tight">{src.title}</span>
                                                <span className="block text-[11px] truncate leading-tight" style={{ color: colors.textSecondary }}>{src.sub}{!player.playing && player.kind !== 'musica' ? ' · pausado' : ''}</span>
                                            </span>
                                        </button>
                                        <button onClick={toggle} aria-label={player.playing ? 'Pausar' : 'Tocar'} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90" style={{ background: `${ORANGE}1f`, color: ORANGE }}>{player.playing ? <Pause size={17} fill={ORANGE} /> : <Play size={17} fill={ORANGE} />}</button>
                                        <button onClick={() => setPlayer(null)} aria-label="Fechar o player" className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90" style={{ color: colors.textSecondary }}><X size={16} /></button>
                                        {src.len > 0 && <span aria-hidden className="absolute left-0 bottom-0 h-[2.5px]" style={{ width: `${player.pos * 100}%`, background: ORANGE, transition: 'width 250ms linear' }} />}
                                    </>
                                )}
                            </div>

                            {/* faixa viva (a antiga ilha): avisos e o que está acontecendo */}
                            <div aria-hidden={!stripOn || hub} style={{ minHeight: stripOn && !hub && !full ? 36 : 0, height: stripOn && !hub && !full ? undefined : 0, opacity: stripOn && !hub && !full ? 1 : 0, overflow: 'hidden', background: live.toast ? '#16a34a14' : `${colors.border}30`, transition: 'min-height 300ms ease, opacity 250ms ease' }} className="px-3.5 flex items-center gap-3">
                                {live.toast ? (
                                    <span className="flex items-center gap-2 py-1.5 text-[12.5px] font-black"><span className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[12px]" style={{ background: '#16a34a' }}>✓</span>Pedido enviado para a pizzaria</span>
                                ) : stripItems.map((x) => (
                                    <span key={x.text} className="flex items-center gap-1.5 h-9 text-[12px] font-black"><span className="w-2 h-2 rounded-full" style={{ background: x.color }} />{x.text}<ChevronRight size={13} style={{ color: colors.textSecondary }} /></span>
                                ))}
                            </div>

                            {/* as abas */}
                            <div key={`${variant}-${mode}`} className="flex items-stretch px-1.5 animate-[labIn_300ms_ease]" style={{ height: variant === 'nova' ? 64 : 58, borderTop: hub || full ? `1px solid ${colors.border}` : '1px solid transparent' }}>
                                {list.map((t) => {
                                    const isEu = variant === 'nova' ? t.key === 'eu' : t.key === 'modo'
                                    const active = !hub && current.key === t.key && !isEu
                                    const showLabel = variant === 'nova'
                                    return (
                                        <button key={t.key} onClick={() => pick(t.key)} aria-label={t.label} aria-current={active ? 'page' : undefined} className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-[3px] active:scale-90 transition">
                                            <span className="relative flex items-center justify-center h-8 rounded-full transition-all duration-300"
                                                style={{ width: active && showLabel ? 52 : 36, background: active && showLabel ? `${ORANGE}24` : 'transparent', color: active ? ORANGE : colors.textPrimary }}>
                                                {isEu ? (
                                                    <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: MODE_AVATAR[mode].bg, boxShadow: `0 0 0 ${hub ? 2 : 1.5}px ${hub ? ORANGE : colors.border}` }}>{MODE_AVATAR[mode].glyph}</span>
                                                ) : (<span className={active && !showLabel ? '' : ''}>{t.icon}</span>)}
                                                {!isEu && t.badge ? <Badge n={t.badge} color={t.badgeColor || '#ef4444'} ring={ring} /> : null}
                                            </span>
                                            {showLabel && <span className="text-[10.5px] leading-none truncate max-w-full px-0.5" style={{ fontWeight: active || (isEu && hub) ? 900 : 700, color: active || (isEu && hub) ? ORANGE : colors.textSecondary }}>{t.label}</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </nav>
            </div>
            <style>{`@keyframes labIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes labFade{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`}</style>
        </div>
    )
}
