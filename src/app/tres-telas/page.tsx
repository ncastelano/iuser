// /tres-telas — TEATRO EM 6 TELAS (só no ambiente LOCAL de desenvolvimento; o endereço ficou o mesmo, o nome "tres-telas" é histórico). Seis celulares lado a lado, cada um uma PESSOA com um PAPEL
// usando o app de verdade, sozinha, com cursor, rolagem, digitação e uma "câmera" (zoom que acompanha a ação):
//   1. DONA DA PIZZARIA (admin-teste, com o perfil dela): atende os pedidos, as conversas e tudo o que a loja chama.
//   2. MOTORISTA FIXO da pizzaria (Dani, favorita da loja): as entregas da loja dela, com preferência.
//   3 e 4. ENTREGADORES do iUser (Léo e Tito): fazem entregas de qualquer loja, sem vínculo.
//   5. HELENA (Helena Prado): usa o perfil dela e a Clínica Mente Viva para atender agendamentos e serviços.
//   6. MOTORISTA DE CORRIDAS: aceita pedidos de motorista de qualquer tipo (passageiro, objeto, animal).
// O simulador (simulate-pizzaria.py --theater) e o alimentador (simulate-teatro.py) fazem chegar o movimento; cada tela só atende. Embaixo, o log.
// Cada tela abre num endereço próprio (<nome>.tela.localhost) para ter a SUA sessão (todos sob `tela.localhost`, o MESMO "site": em sites diferentes o navegador bloquearia o cookie de login
// dentro do quadro). A página se abre sozinha em painel.tela.localhost. Em qualquer outro ambiente esta página só mostra um aviso.
// EXPANDIR: o botão ⛶ de cada tela a leva para TELA CHEIA (tamanho real) SEM recarregar o quadro (o Teatro o conduz por postMessage: se ele remontasse, a cena quebraria) — só muda o estilo do
// mesmo elemento. Em cima fica uma barra: ← Voltar (ou Esc / voltar do navegador), as seis abas (teclas 1 a 6) e Celular × Tela cheia. O endereço guarda a tela aberta (?ver=owner|fixed|...).
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isLocalDevOnly } from '@/lib/devOnly'
import { Stage, WHO, type Who } from './stage'
import { runTheater } from './scenes'

const W = 390, H = 800
interface Driver { id: string; key: string; name: string; capacity: number; stops: number; deliveredLastHour: number }
interface Observer { store: string; drivers: Driver[]; openOffers?: number; readyWaiting: number; log: string[] }

const BAR = 54
type Mode = 'phone' | 'full'
interface Cam { x: number; y: number; z: number }

// quem é cada tela: nome, cor, subdomínio (a sessão própria), conta e a página onde ela começa
const SCREENS: Record<Who, { name: string; color: string; sub: string; as: string; to: string; role: string }> = {
    owner: { name: 'Dona da pizzaria', color: '#22c55e', sub: 'dona', as: 'owner', to: '/painel-loja/pizzaria-forno-de-ouro', role: 'atende pedidos e conversas' },
    fixed: { name: 'Motorista fixo', color: '#f97316', sub: 'fixo', as: 'driver-dani', to: '/entregas', role: 'entregas da pizzaria' },
    courier1: { name: 'Entregador 1', color: '#eab308', sub: 'leo', as: 'driver-leo', to: '/entregas', role: 'entregas de qualquer loja' },
    courier2: { name: 'Entregador 2', color: '#a855f7', sub: 'tito', as: 'driver-tito', to: '/entregas', role: 'entregas de qualquer loja' },
    helena: { name: 'Helena', color: '#ec4899', sub: 'helena', as: 'profile-helena-prado', to: '/painel-loja/clinica-mente-viva', role: 'perfil e Clínica Mente Viva' },
    ride: { name: 'Motorista de corridas', color: '#3b82f6', sub: 'corrida', as: 'profile-rede-eva-administradora', to: '/aceitar-corridas', role: 'corridas de qualquer tipo' },
}
const DRIVER_KEY: Partial<Record<Who, string>> = { fixed: 'dani', courier1: 'leo', courier2: 'tito' }

/** A MESMA árvore de elementos nos dois estados (miniatura × expandido): só o estilo muda, então o <iframe> filho nunca remonta nem recarrega. A "câmera" é um zoom (transform) em volta do quadro. */
function Phone({ who, title, subtitle, scale, big, mode, cam, onExpand, children }: { who: Who; title: string; subtitle: string; scale: number; big: Who | null; mode: Mode; cam: Cam | null; onExpand: () => void; children: React.ReactNode }) {
    const color = SCREENS[who].color
    const open = big === who
    const boxRef = useRef<HTMLDivElement>(null)
    const [sz, setSz] = useState({ w: W, h: H })
    useEffect(() => {
        const el = boxRef.current
        if (!el) return
        const ro = new ResizeObserver(() => setSz({ w: el.clientWidth || W, h: el.clientHeight || H }))
        ro.observe(el); setSz({ w: el.clientWidth || W, h: el.clientHeight || H })
        return () => ro.disconnect()
    }, [open, mode])
    // o ponto da ação vai para perto do centro (um pouco acima: embaixo fica a barra do app); nunca mostra além das bordas
    const z = cam?.z ?? 1
    const tx = cam ? Math.min(0, Math.max(sz.w - z * sz.w, sz.w / 2 - z * cam.x)) : 0
    const ty = cam ? Math.min(0, Math.max(sz.h - z * sz.h, sz.h * 0.42 - z * cam.y)) : 0
    return (
        <div style={open ? { position: 'fixed', inset: 0, zIndex: 1000, background: '#0b1220', display: 'flex', flexDirection: 'column', paddingTop: BAR, paddingBottom: 26 } : { width: W * scale, flexShrink: 0 }}>
            <div style={{ display: open ? 'none' : 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: '#e2e8f0' }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
                <b style={{ fontSize: 13, flexShrink: 0 }}>{title}</b>
                <button onClick={onExpand} title="Ver em tela cheia (tamanho real)" aria-label={`Expandir ${title}`} style={{ marginLeft: 'auto', flexShrink: 0, height: 22, padding: '0 8px', borderRadius: 99, border: `1px solid ${color}66`, background: `${color}22`, color: '#e2e8f0', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>⛶</button>
            </div>
            <div style={{ display: open ? 'none' : 'block', fontSize: 11, opacity: 0.65, marginBottom: 6, height: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e2e8f0' }}>{subtitle}</div>
            <div style={open ? { flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', overflow: 'hidden', background: mode === 'phone' ? '#050a14' : '#fff' } : { width: W * scale, height: H * scale, borderRadius: 28 * scale, overflow: 'hidden', border: `2px solid ${color}55`, background: '#fff', boxShadow: `0 10px 40px ${color}22` }}>
                <div style={open ? { width: mode === 'phone' ? W : '100%', height: '100%', background: '#fff', boxShadow: mode === 'phone' ? `0 0 0 2px ${color}55, 0 0 60px ${color}33` : 'none', overflow: 'hidden' } : { width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', overflow: 'hidden' }}>
                    <div ref={boxRef} style={{ width: '100%', height: '100%', transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})`, transition: 'transform 1000ms cubic-bezier(.3,.1,.2,1)' }}>{children}</div>
                </div>
            </div>
        </div>
    )
}

export default function TresTelasPage() {
    const [ok, setOk] = useState<boolean | null>(null)
    const [origin, setOrigin] = useState<{ proto: string; port: string } | null>(null)
    const [obs, setObs] = useState<Observer | null>(null)
    const [tick, setTick] = useState(0)                           // recarrega as telas de tempos em tempos
    const [scale, setScale] = useState(0.5)
    const [cols, setCols] = useState(6)
    const [showLog, setShowLog] = useState(false)
    const [big, setBig] = useState<Who | null>(null)               // tela aberta em tela cheia (null = as seis lado a lado)
    const [mode, setMode] = useState<Mode>('phone')                // 'phone' = 390 px de largura (tamanho real do celular); 'full' = a janela toda
    const [cameraOn, setCameraOn] = useState(true)
    const [cams, setCams] = useState<Partial<Record<Who, Cam>>>({})
    const camTimers = useRef<Partial<Record<Who, ReturnType<typeof setTimeout>>>>({})
    const pushed = useRef(false)
    const logRef = useRef<HTMLDivElement>(null)
    const stage = useMemo(() => new Stage(), [])
    const [theater, setTheater] = useState(false)
    const [says, setSays] = useState<Record<Who, string>>({ owner: '', fixed: '', courier1: '', courier2: '', helena: '', ride: '' })
    const obsRef = useRef<Observer | null>(null)
    const cameraRef = useRef(true)
    useEffect(() => { cameraRef.current = cameraOn; if (!cameraOn) setCams({}) }, [cameraOn])
    const frameRefs = useMemo(() => Object.fromEntries(WHO.map((w) => [w, { current: null as HTMLIFrameElement | null }])) as Record<Who, { current: HTMLIFrameElement | null }>, [])

    useEffect(() => {
        if (!ok) return
        stage.start()
        ;(window as any).__stageLog = []
        stage.onLog = (who, msg) => { const l = (window as any).__stageLog; l.push(`${new Date().toLocaleTimeString()} ${who} ${msg}`); if (l.length > 300) l.shift() }
        // a câmera: leva o zoom até a ação e, parada a ação, volta ao quadro inteiro
        stage.onCam = (who, x, y, z) => {
            if (!cameraRef.current) return
            setCams((p) => ({ ...p, [who]: { x, y, z } }))
            clearTimeout(camTimers.current[who])
            camTimers.current[who] = setTimeout(() => setCams((p) => { const n = { ...p }; delete n[who]; return n }), 4200)
        }
        ;(window as any).__stage = stage   // para depurar no console: await __stage.text('helena')
        const sync = setInterval(() => { WHO.forEach((w) => { stage.frames[w] = frameRefs[w].current }) }, 400)
        return () => { clearInterval(sync); stage.stop() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ok, stage])

    useEffect(() => {
        const local = isLocalDevOnly()
        setOk(local)
        if (!local) return
        // Mesmo "site" (tela.localhost) para a página e os quadros: senão o cookie de login é bloqueado dentro do quadro
        if (!window.location.hostname.endsWith('.tela.localhost')) { window.location.replace(`${window.location.protocol}//painel.tela.localhost:${window.location.port}/tres-telas`); return }
        setOrigin({ proto: window.location.protocol, port: window.location.port })
    }, [])

    // Expandir / trocar / fechar: o endereço guarda a tela (?ver=), o voltar do navegador fecha, Esc fecha e 1…6 trocam
    const openBig = useCallback((w: Who) => {
        const u = new URL(window.location.href); u.searchParams.set('ver', w)
        if (pushed.current) window.history.replaceState({ ver: w }, '', u)
        else { window.history.pushState({ ver: w }, '', u); pushed.current = true }
        setBig(w)
    }, [])
    const closeBig = useCallback(() => {
        if (pushed.current) { pushed.current = false; window.history.back() }   // o popstate abaixo fecha
        else { const u = new URL(window.location.href); u.searchParams.delete('ver'); window.history.replaceState(null, '', u); setBig(null) }
    }, [])
    useEffect(() => {
        const fromUrl = () => { const v = new URL(window.location.href).searchParams.get('ver'); setBig(WHO.includes(v as Who) ? (v as Who) : null) }
        fromUrl()
        window.addEventListener('popstate', fromUrl)
        return () => window.removeEventListener('popstate', fromUrl)
    }, [])
    useEffect(() => {
        if (!big) return
        const key = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
            if (e.key === 'Escape') closeBig()
            else if (/^[1-6]$/.test(e.key)) openBig(WHO[Number(e.key) - 1])
            else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') openBig(WHO[(WHO.indexOf(big) + (e.key === 'ArrowRight' ? 1 : WHO.length - 1)) % WHO.length])
        }
        window.addEventListener('keydown', key)
        return () => window.removeEventListener('keydown', key)
    }, [big, openBig, closeBig])

    // 🎬 Teatro liga/desliga o MODO TEATRO dos simuladores (a pizzaria deixa a dona e os três motoristas para as telas; o alimentador traz a Helena e as corridas)
    const firstTheater = useRef(true)
    const [simNote, setSimNote] = useState('')
    useEffect(() => {
        if (!ok) return
        if (firstTheater.current) { firstTheater.current = false; return }
        fetch('/api/dev/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theater }) })
            .then((r) => r.json()).then((d) => setSimNote(d.ok ? (d.changed ? (theater ? 'Simuladores no modo Teatro (reiniciando a pizzaria e ligando o alimentador, uns segundos)…' : 'Simuladores no modo normal…') : '') : (d.hint || 'Não consegui avisar os simuladores.')))
            .catch(() => setSimNote('Não consegui avisar os simuladores.'))
        const t = setTimeout(() => setSimNote(''), 9000)
        return () => clearTimeout(t)
    }, [theater, ok])
    useEffect(() => {   // abriu a página com os simuladores já em modo Teatro (ex.: reaberta): liga o botão
        if (!ok) return
        fetch('/api/dev/sim').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.theater) setTheater(true) }).catch(() => {})
    }, [ok])

    useEffect(() => { obsRef.current = obs }, [obs])
    useEffect(() => {
        if (!ok) return
        if (!theater) { stage.stopped = true; return }
        stage.stopped = false
        runTheater(stage, () => obsRef.current as any, (who, msg) => setSays((p) => ({ ...p, [who]: msg })))
    }, [ok, theater, stage])

    const poll = useCallback(async () => {
        try { const r = await fetch('/api/dev/observer'); if (r.ok) { const d = await r.json(); setObs({ ...d, drivers: d.drivers ?? [], log: d.log ?? [] }) } } catch { /* sem rede */ }
    }, [])
    useEffect(() => { if (!ok) return; poll(); const t = setInterval(poll, 2500); return () => clearInterval(t) }, [ok, poll])

    // O tamanho de cada tela: a disposição (6 numa fileira, 3×2 ou 2×3) que deixa os celulares maiores
    useEffect(() => {
        const fit = () => {
            const aw = window.innerWidth - 40, ah = window.innerHeight - (showLog ? 300 : 110)
            let best = { s: 0.3, c: 6 }
            for (const c of [6, 3, 2]) {
                const rows = Math.ceil(WHO.length / c)
                const s = Math.min(aw / (c * W + (c - 1) * 16), ah / (rows * (H + 58) + (rows - 1) * 10), 1)
                if (s > best.s + 0.04) best = { s, c }
            }
            setScale(Math.max(0.3, best.s)); setCols(best.c)
        }
        fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit)
    }, [showLog])
    useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [obs?.log])

    const nameOf = (w: Who) => { const k = DRIVER_KEY[w]; const d = k ? obs?.drivers?.find((x) => x.key === k) : null; return d ? d.name.split(' ')[0] : null }
    const base = (sub: string) => (origin ? `${origin.proto}//${sub}.tela.localhost:${origin.port}` : '')
    const urls = useMemo(() => Object.fromEntries(WHO.map((w) => [w, `${base(SCREENS[w].sub)}/dev-login?as=${SCREENS[w].as}&to=${encodeURIComponent(SCREENS[w].to)}`])) as Record<Who, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [origin])

    if (ok === false) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Esta ferramenta só existe no ambiente local de desenvolvimento.</div>
    if (ok === null || !origin) return null

    const chip = (active: boolean): React.CSSProperties => ({ height: 28, padding: '0 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, background: active ? '#f97316' : '#1e293b', color: active ? '#fff' : '#cbd5e1' })
    const subtitleOf = (w: Who) => says[w] || (() => {
        const d = DRIVER_KEY[w] ? obs?.drivers?.find((x) => x.key === DRIVER_KEY[w]) : null
        return d ? `${d.name.split(' ')[0]} · ${d.stops}/${d.capacity} na mochila · ${d.deliveredLastHour} na última hora` : SCREENS[w].role
    })()
    const titleOf = (w: Who) => { const n = nameOf(w); return n && (w === 'fixed' || w === 'courier1' || w === 'courier2') ? `${SCREENS[w].name} · ${n}` : SCREENS[w].name }
    return (
        <div style={{ minHeight: '100dvh', background: '#0b1220', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: '12px 20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <b style={{ fontSize: 17 }}>⚡ Teatro em 6 telas</b>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{obs ? `${obs.store} · ${obs.readyWaiting} entrega(s) pronta(s) esperando motorista` : 'conectando…'}</span>
                <span style={{ flex: 1 }} />
                <button style={chip(cameraOn)} onClick={() => setCameraOn((v) => !v)} title="A câmera dá zoom onde está a ação e volta sozinha">🎥 Câmera {cameraOn ? 'ligada' : 'desligada'}</button>
                <button style={chip(theater)} onClick={() => setTheater((v) => !v)} title="As seis pessoas usando o app sozinhas (liga o modo Teatro dos simuladores)">{theater ? '🎬 Teatro ligado' : '🎬 Teatro'}</button>
                <button style={chip(false)} onClick={() => setTick((n) => n + 1)}>Recarregar</button>
                <button style={chip(showLog)} onClick={() => setShowLog((v) => !v)}>Log</button>
            </div>
            {simNote && <div style={{ fontSize: 12, color: '#fdba74', marginBottom: 8 }}>{simNote}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${W * scale}px)`, gap: '10px 16px', justifyContent: 'center', alignItems: 'start' }}>
                {WHO.map((w) => (
                    <Phone key={w} who={w} title={titleOf(w)} subtitle={subtitleOf(w)} scale={scale} big={big} mode={mode} cam={cams[w] ?? null} onExpand={() => openBig(w)}>
                        <iframe ref={(el) => { frameRefs[w].current = el }} key={`${w}-${tick}`} title={SCREENS[w].name} src={urls[w]} style={{ width: '100%', height: '100%', border: 0 }} />
                    </Phone>
                ))}
            </div>

            {big && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: BAR, zIndex: 1001, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: '#0f172a', borderBottom: `2px solid ${SCREENS[big].color}`, color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
                    <button onClick={closeBig} style={{ height: 34, padding: '0 14px', borderRadius: 99, border: 'none', background: '#f97316', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0 }} title="Voltar às 6 telas (Esc)">← Voltar</button>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        {WHO.map((w, i) => (
                            <button key={w} onClick={() => openBig(w)} title={`${SCREENS[w].name} (tecla ${i + 1})`} style={{ height: 34, padding: '0 10px', borderRadius: 99, border: `1.5px solid ${SCREENS[w].color}${big === w ? '' : '55'}`, background: big === w ? SCREENS[w].color : '#1e293b', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ opacity: 0.7, fontSize: 10 }}>{i + 1}</span>{SCREENS[w].name.split(' ').slice(0, 2).join(' ')}
                            </button>
                        ))}
                    </div>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitleOf(big)}</span>
                    <button style={chip(mode === 'phone')} onClick={() => setMode('phone')} title="390 px de largura: o tamanho real de um celular">Celular</button>
                    <button style={chip(mode === 'full')} onClick={() => setMode('full')} title="Ocupa a janela inteira">Tela cheia</button>
                    <button style={chip(cameraOn)} onClick={() => setCameraOn((v) => !v)}>🎥</button>
                    <button style={chip(theater)} onClick={() => setTheater((v) => !v)}>{theater ? '🎬 Teatro ligado' : '🎬 Teatro'}</button>
                </div>
            )}

            {showLog && (
                <div ref={logRef} style={{ marginTop: 14, height: 170, overflowY: 'auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '10px 14px', fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.65 }}>
                    {obs?.log.length ? obs.log.map((l, i) => <div key={i} style={{ color: /🛵|📦/.test(l) ? '#fdba74' : /🏪/.test(l) ? '#86efac' : /✗/.test(l) ? '#fca5a5' : /⭐/.test(l) ? '#fde68a' : '#94a3b8' }}>{l}</div>) : <span style={{ opacity: 0.5 }}>Os simuladores não estão rodando: npm run sim</span>}
                </div>
            )}
        </div>
    )
}
