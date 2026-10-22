// src/components/radar/radarPulse.ts
//
// Abertura do /radar: o avatar de quem abre pulsa (ondas saindo dele) e, então, um pulso maior se expande como um sonar. Onde ele
// alcança uma marcação nasce uma bolinha que pulsa ("achou alguém"). Um segundo pulso vem logo atrás e, ao alcançar cada bolinha,
// ela vira a marcação de verdade (imagem, coroa, número...), que cresce exatamente do centro da bolinha.
//
// Sem React no meio do caminho: um laço de requestAnimationFrame expande os anéis e troca o estado de cada marcação
// (hidden → blip → shown) comparando a distância dela ao avatar (map.project) com o raio de cada anel. Só transform/opacity
// mudam por quadro. Respeita "reduzir movimento" (quem chama decide não animar).
import type mapboxgl from 'mapbox-gl'

export type PulseState = 'hidden' | 'blip' | 'shown'

export interface PulseEntry {
    lng: number
    lat: number
    state: PulseState
    /** Aplica o estado visual (o RadarScreen sabe como mostrar/esconder a marcação e a bolinha) */
    apply: (state: PulseState) => void
}

const ORANGE = '249,115,22'

const STYLE_ID = 'radar-pulse-styles'
export function ensureRadarPulseStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
        /* bolinha do "eco": nasce, pulsa e, quando a marcação aparece, se desfaz */
        .radar-blip { position: relative; width: 12px; height: 12px; border-radius: 50%; background: #f97316; opacity: 0; transform: scale(0);
            box-shadow: 0 0 10px rgba(${ORANGE},.9); pointer-events: none; }
        .radar-blip::after { content: ''; position: absolute; inset: -2px; border-radius: 50%; border: 2px solid rgba(${ORANGE},.8); opacity: 0; }
        .radar-blip.on { animation: radarBlipIn .55s cubic-bezier(.2,.9,.3,1.4) forwards; }
        .radar-blip.on::after { animation: radarBlipPing 1.3s ease-out .3s infinite; }
        .radar-blip.off { animation: radarBlipOut .45s ease-in forwards; }
        @keyframes radarBlipIn { 0% { opacity: 0; transform: scale(0); } 55% { opacity: 1; transform: scale(1.7); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes radarBlipPing { 0% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(4.2); } }
        @keyframes radarBlipOut { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(2.2); } }
        /* ondas que saem do avatar (também usadas na tela de carregamento) */
        .radar-ripple { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; border: 1.5px solid rgba(${ORANGE},.85);
            box-shadow: 0 0 16px rgba(${ORANGE},.35), inset 0 0 14px rgba(${ORANGE},.18); opacity: 0; will-change: transform, opacity;
            animation: radarRipple 2.6s cubic-bezier(.2,.6,.3,1) infinite; }
        @keyframes radarRipple { 0% { transform: scale(.35); opacity: .95; } 100% { transform: scale(5.2); opacity: 0; } }
        /* pulso grande do sonar */
        .radar-wave-ring { position: absolute; width: 200px; height: 200px; margin: -100px 0 0 -100px; border-radius: 50%; opacity: 0; will-change: transform, opacity;
            border: 2px solid rgba(${ORANGE},.9);
            background: radial-gradient(circle, rgba(${ORANGE},0) 55%, rgba(${ORANGE},.14) 100%);
            box-shadow: 0 0 22px rgba(${ORANGE},.45), inset 0 0 26px rgba(${ORANGE},.22); }
        @media (prefers-reduced-motion: reduce) { .radar-ripple, .radar-blip.on::after { animation: none; } }
    `
    document.head.appendChild(style)
}

type Phase = 'waiting' | 'lead' | 'wave' | 'fade' | 'done'

// Tempos (ms) e velocidade (px/ms) do pulso
const LEAD_MS = 1000   // só o avatar pulsando, antes dos pulsos
const WAVE_SPEED = 0.34
const SECOND_WAVE_GAP = 1250 // o 2º pulso sai este tempo depois do 1º
const FADE_MS = 450

export interface RadarPulseOptions {
    map: mapboxgl.Map
    overlay: HTMLElement
    getEntries: () => PulseEntry[]
    /** Onde o avatar está (os pulsos saem dali). null = centro do mapa */
    getCenter: () => [number, number] | null
    onDone: () => void
}

export function createRadarPulse({ map, overlay, getEntries, getCenter, onDone }: RadarPulseOptions) {
    ensureRadarPulseStyles()

    const root = document.createElement('div')
    root.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;'
    const ripples = [0, 1.3].map((delay) => {
        const r = document.createElement('div')
        r.className = 'radar-ripple'
        r.style.animationDelay = `${delay}s`
        return r
    })
    const rings = [0, 1].map(() => {
        const r = document.createElement('div')
        r.className = 'radar-wave-ring'
        return r
    })
    root.append(...ripples, ...rings)
    overlay.appendChild(root)

    let phase: Phase = 'waiting'
    let phaseStart = performance.now()
    let raf = 0
    let cancelled = false
    let maxR = 0 // raio que os pulsos precisam alcançar (o alvo mais distante) — fixado ao começar
    const go = (p: Phase, now: number) => { phase = p; phaseStart = now }

    const frame = (now: number) => {
        if (cancelled) return
        const W = overlay.clientWidth || 1
        const H = overlay.clientHeight || 1
        let elapsed = now - phaseStart

        // onde o avatar está na tela
        const c = getCenter()
        const cp = c ? map.project(c) : { x: W / 2, y: H / 2 }
        const entries = getEntries()

        if (phase === 'lead' && elapsed >= LEAD_MS) {
            // o pulso precisa chegar ao alvo mais distante (com folga)
            maxR = entries.reduce((m, e) => { const p = map.project([e.lng, e.lat]); return Math.max(m, Math.hypot(p.x - cp.x, p.y - cp.y)) }, 0) + 40
            maxR = Math.max(maxR, 160)
            go('wave', now); elapsed = 0
        }

        // anéis grandes (1º acha, 2º confirma)
        let r1 = 0, r2 = 0
        if (phase === 'wave' || phase === 'fade') {
            const waveMs = maxR / WAVE_SPEED
            const prog = (ms: number) => Math.min(1, Math.max(0, ms / waveMs))
            const radius = (p: number) => maxR * (1 - Math.pow(1 - p, 1.5)) // sai rápido e desacelera, como uma onda
            const e = phase === 'fade' ? Infinity : elapsed
            const p1 = prog(e), p2 = prog(e - SECOND_WAVE_GAP)
            r1 = radius(p1); r2 = radius(p2)
            if (phase === 'wave' && p2 >= 1) go('fade', now)
            ;[[rings[0], r1, p1], [rings[1], r2, p2]].forEach(([el, r, p]) => {
                const ring = el as HTMLElement
                const started = (p as number) > 0 && (p as number) < 1
                ring.style.left = `${cp.x.toFixed(1)}px`
                ring.style.top = `${cp.y.toFixed(1)}px`
                ring.style.opacity = started ? String(0.95 * (1 - Math.pow(p as number, 2.2))) : '0'
                ring.style.transform = `scale(${Math.max(0.01, (r as number) / 100).toFixed(3)})`
            })
        }

        // ondas pulsando do avatar enquanto espera os dados e antes dos pulsos grandes
        const rippleOn = phase === 'waiting' || phase === 'lead'
        ripples.forEach((r) => { r.style.left = `${cp.x.toFixed(1)}px`; r.style.top = `${cp.y.toFixed(1)}px`; r.style.display = rippleOn ? 'block' : 'none' })

        // estado de cada marcação, pela distância ao avatar e o raio de cada pulso
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i]
            const p = map.project([e.lng, e.lat])
            const d = Math.hypot(p.x - cp.x, p.y - cp.y)
            let target: PulseState
            if (phase === 'waiting' || phase === 'lead') target = 'hidden'
            else if (phase === 'fade' || phase === 'done') target = 'shown'
            else target = d <= r2 ? 'shown' : d <= r1 ? 'blip' : 'hidden'
            if (e.state !== target) { e.state = target; e.apply(target) }
        }

        if (phase === 'fade' && elapsed >= FADE_MS) { finish(); return }
        raf = requestAnimationFrame(frame)
    }

    const cleanup = () => { cancelAnimationFrame(raf); root.remove() }
    const finish = () => {
        if (phase === 'done') return
        phase = 'done'
        getEntries().forEach((e) => { if (e.state !== 'shown') { e.state = 'shown'; e.apply('shown') } })
        cleanup()
        onDone()
    }

    raf = requestAnimationFrame(frame)

    return {
        /** Os dados chegaram: começa (primeiro só o avatar pulsando, depois os pulsos) */
        begin() { if (phase === 'waiting') go('lead', performance.now()) },
        /** Nada para mostrar: termina já */
        skip() { if (!cancelled) { cancelled = true; phase = 'done'; getEntries().forEach((e) => { e.state = 'shown'; e.apply('shown') }); cleanup(); onDone() } },
        /** Saiu da tela / o mapa foi refeito: só limpa */
        cancel() { cancelled = true; cleanup() },
    }
}

export type RadarPulse = ReturnType<typeof createRadarPulse>
