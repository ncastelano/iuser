// /tres-telas — OBSERVAÇÃO EM 3 TELAS (só no ambiente LOCAL de desenvolvimento). Três celulares lado a lado, cada um com uma pessoa diferente usando o app
// enquanto o simulador da pizzaria (scripts/local/simulate-pizzaria.py) faz tudo sozinho: o DONO da loja (painel da pizzaria), o MOTOBOY (a página
// "Central de entregas" do motorista iUser, com a rota guiada) e o CLIENTE (acompanhando os pedidos dele). Embaixo, o que está acontecendo (o log do simulador). Serve para ver onde
// melhorar, adicionar ou tirar coisas sem precisar clicar. Cada tela abre num endereço próprio (owner.localhost / client.localhost / driver.localhost)
// para ter a SUA sessão (todos sob `tela.localhost`, o MESMO "site": se fossem sites diferentes o navegador bloquearia o cookie de login dentro do quadro).
// A página se abre sozinha em painel.tela.localhost. Em qualquer outro ambiente esta página só mostra um aviso.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isLocalDevOnly } from '@/lib/devOnly'
import { Stage, type Who } from './stage'
import { runTheater } from './scenes'

const W = 390, H = 800
interface Courier { id: string; name: string; token: string; stops: number; deliveredLastHour: number }
interface Driver { id: string; key: string; name: string; capacity: number; stops: number; deliveredLastHour: number }
interface Observer { store: string; couriers: Courier[]; drivers: Driver[]; readyWaiting: number; log: string[] }

function Phone({ title, subtitle, color, scale, children }: { title: string; subtitle: string; color: string; scale: number; children: React.ReactNode }) {
    return (
        <div style={{ width: W * scale, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: '#e2e8f0' }}>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: color, boxShadow: `0 0 8px ${color}` }} />
                <b style={{ fontSize: 14 }}>{title}</b><span style={{ fontSize: 12, opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
            </div>
            <div style={{ width: W * scale, height: H * scale, borderRadius: 28 * scale, overflow: 'hidden', border: `2px solid ${color}55`, background: '#fff', boxShadow: `0 10px 40px ${color}22` }}>
                <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
            </div>
        </div>
    )
}

export default function TresTelasPage() {
    const [ok, setOk] = useState<boolean | null>(null)
    const [origin, setOrigin] = useState<{ proto: string; port: string } | null>(null)
    const [obs, setObs] = useState<Observer | null>(null)
    const [follow, setFollow] = useState<string>('dani')          // a Dani é a entregadora em destaque; 'auto' = quem está com mais entregas na mochila
    const [shown, setShown] = useState<string | null>('dani')      // motorista exibido agora (chave: dani, leo, rafa, tito)
    const [tick, setTick] = useState(0)                           // recarrega a tela do motoboy de tempos em tempos
    const [scale, setScale] = useState(0.6)
    const [showLog, setShowLog] = useState(true)
    const logRef = useRef<HTMLDivElement>(null)
    const stage = useMemo(() => new Stage(), [])
    const [theater, setTheater] = useState(false)
    const [says, setSays] = useState<Record<Who, string>>({ owner: '', client: '', driver: '' })
    const obsRef = useRef<Observer | null>(null)
    const frameRefs = { owner: useRef<HTMLIFrameElement>(null), client: useRef<HTMLIFrameElement>(null), driver: useRef<HTMLIFrameElement>(null) }
    useEffect(() => {
        if (!ok) return
        stage.start()
        ;(window as any).__stageLog = []
        stage.onLog = (who, msg) => { const l = (window as any).__stageLog; l.push(`${new Date().toLocaleTimeString()} ${who} ${msg}`); if (l.length > 300) l.shift() }
        ;(window as any).__stage = stage   // para depurar no console: await __stage.text('client')
        const sync = setInterval(() => { (['owner', 'client', 'driver'] as Who[]).forEach((w) => { stage.frames[w] = frameRefs[w].current }) }, 400)
        return () => { clearInterval(sync); stage.stop() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ok, stage])

    useEffect(() => {
        const local = isLocalDevOnly()
        setOk(local)
        if (!local) return
        // Mesmo "site" (tela.localhost) para a página e os 3 quadros: senão o cookie de login é bloqueado dentro do quadro
        if (!window.location.hostname.endsWith('.tela.localhost')) { window.location.replace(`${window.location.protocol}//painel.tela.localhost:${window.location.port}/tres-telas`); return }
        setOrigin({ proto: window.location.protocol, port: window.location.port })
    }, [])

    useEffect(() => { obsRef.current = obs }, [obs])
    useEffect(() => {
        if (!ok) return
        if (!theater) { stage.stopped = true; return }
        stage.stopped = false
        runTheater(stage, () => obsRef.current as any, (who, msg) => setSays((p) => ({ ...p, [who]: msg })))
    }, [ok, theater, stage])

    const poll = useCallback(async () => {
        try { const r = await fetch('/api/dev/observer'); if (r.ok) { const d = await r.json(); setObs({ ...d, drivers: d.drivers ?? [], couriers: d.couriers ?? [], log: d.log ?? [] }) } } catch { /* sem rede */ }
    }, [])
    useEffect(() => { if (!ok) return; poll(); const t = setInterval(poll, 2500); return () => clearInterval(t) }, [ok, poll])
    useEffect(() => { if (!ok) return; const t = setInterval(() => setTick((n) => n + 1), 9000); return () => clearInterval(t) }, [ok])

    // Quem o motoboy da tela é: o escolhido, ou (auto) o que está com mais entregas agora — sem trocar enquanto o atual ainda tem entrega
    useEffect(() => {
        if (!obs) return
        if (follow !== 'auto') { setShown(follow); return }
        setShown((cur) => {
            const curD = obs.drivers.find((d) => d.key === cur)
            if (curD && curD.stops > 0) return cur
            const busiest = [...obs.drivers].sort((a, b) => b.stops - a.stops)[0]
            return busiest && busiest.stops > 0 ? busiest.key : (curD ? cur : obs.drivers[0]?.key ?? null)
        })
    }, [obs, follow])

    useEffect(() => {
        const fit = () => setScale(Math.max(0.35, Math.min((window.innerWidth - 56) / (3 * W + 40), (window.innerHeight - (showLog ? 330 : 130)) / H, 1)))
        fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit)
    }, [showLog])
    useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [obs?.log])

    const driver = obs?.drivers?.find((d) => d.key === shown) || null
    const base = (sub: string) => (origin ? `${origin.proto}//${sub}.tela.localhost:${origin.port}` : '')
    const urls = useMemo(() => ({
        owner: `${base('owner')}/dev-login?as=owner&to=${encodeURIComponent('/painel-loja/pizzaria-forno-de-ouro')}`,
        client: `${base('client')}/dev-login?as=client&to=${encodeURIComponent('/carrinho?aba=pedidos')}`,
        driver: driver ? `${base('driver')}/dev-login?as=driver-${driver.key}&to=${encodeURIComponent('/entregas')}` : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [origin, driver?.key])

    if (ok === false) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Esta ferramenta só existe no ambiente local de desenvolvimento.</div>
    if (ok === null || !origin) return null

    const chip = (active: boolean): React.CSSProperties => ({ height: 28, padding: '0 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, background: active ? '#f97316' : '#1e293b', color: active ? '#fff' : '#cbd5e1' })
    return (
        <div style={{ minHeight: '100dvh', background: '#0b1220', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: '14px 28px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <b style={{ fontSize: 17 }}>⚡ Observação em 3 telas</b>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{obs ? `${obs.store} · ${obs.readyWaiting} entrega(s) pronta(s) esperando motorista` : 'conectando…'}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, opacity: 0.6 }}>Motorista:</span>
                <button style={chip(follow === 'auto')} onClick={() => setFollow('auto')}>Auto</button>
                {obs?.drivers?.map((d) => <button key={d.key} style={chip(follow === d.key)} onClick={() => setFollow(d.key)}>{d.name.split(' ')[0]}{d.stops > 0 ? ` · ${d.stops}/${d.capacity}` : ''}</button>)}
                <button style={chip(false)} onClick={() => setTick((n) => n + 1)}>Recarregar</button>
                <button style={chip(theater)} onClick={() => setTheater((v) => !v)} title="Cliente, dono e motorista usando o app sozinhos">{theater ? '🎬 Teatro ligado' : '🎬 Teatro'}</button>
                <button style={chip(showLog)} onClick={() => setShowLog((v) => !v)}>Log</button>
            </div>

            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-start' }}>
                <Phone title="Dono da loja" subtitle={says.owner || 'admin-teste · painel da pizzaria'} color="#22c55e" scale={scale}>
                    <iframe ref={frameRefs.owner} title="dono" src={urls.owner} style={{ width: W, height: H, border: 0 }} />
                </Phone>
                <Phone title="Motorista iUser" subtitle={says.driver || (driver ? `${driver.name} · ${driver.stops}/${driver.capacity} na mochila · ${driver.deliveredLastHour} entregues na última hora` : 'sem motorista')} color="#f97316" scale={scale}>
                    {urls.driver ? <iframe ref={frameRefs.driver} key={driver?.key} title="motorista" src={urls.driver} style={{ width: W, height: H, border: 0 }} /> : <div style={{ padding: 30, color: '#64748b' }}>Cadastre os motoristas: node scripts/local/seed-entregadores.mjs</div>}
                </Phone>
                <Phone title="Cliente" subtitle={says.client || 'Gabriela Carvalho · acompanhando os pedidos'} color="#3b82f6" scale={scale}>
                    <iframe ref={frameRefs.client} title="cliente" src={urls.client} style={{ width: W, height: H, border: 0 }} />
                </Phone>
            </div>

            {showLog && (
                <div ref={logRef} style={{ marginTop: 14, height: 190, overflowY: 'auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '10px 14px', fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.65 }}>
                    {obs?.log.length ? obs.log.map((l, i) => <div key={i} style={{ color: /🛵|📦/.test(l) ? '#fdba74' : /🏪/.test(l) ? '#86efac' : /✗/.test(l) ? '#fca5a5' : /⭐/.test(l) ? '#fde68a' : '#94a3b8' }}>{l}</div>) : <span style={{ opacity: 0.5 }}>O simulador não está rodando: python3 -u scripts/local/simulate-pizzaria.py</span>}
                </div>
            )}
        </div>
    )
}
