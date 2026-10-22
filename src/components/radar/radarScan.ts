// src/components/radar/radarScan.ts
//
// Abertura do /radar: um "satélite" varre o mapa. O avatar de quem abre pulsa (ondas saindo dele) e, então, uma linha de luz
// desce de cima a baixo; onde passa por um local com marcação nasce uma bolinha que pulsa ("achou alguém"). Ao tocar no
// rodapé, a linha volta para cima e, ao passar de novo, a bolinha vira a marcação de verdade (imagem, coroa, número...).
//
// Sem React no meio do caminho: um laço de requestAnimationFrame move a linha e troca o estado de cada marcação (hidden → blip →
// shown) comparando a posição na tela (map.project) com a da linha. Isso mantém a animação fluida (só transform/opacity) e
// funciona mesmo que o mapa seja arrastado durante a varredura. Respeita "reduzir movimento" (quem chama decide não animar).
import type mapboxgl from 'mapbox-gl'

export type ScanState = 'hidden' | 'blip' | 'shown'

export interface ScanEntry {
    lng: number
    lat: number
    state: ScanState
    /** Aplica o estado visual (o RadarScreen sabe como mostrar/esconder a marcação e a bolinha) */
    apply: (state: ScanState) => void
}

const ORANGE = '249,115,22'

const STYLE_ID = 'radar-scan-styles'
export function ensureRadarScanStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
        /* bolinha do "eco": nasce, pulsa e, quando a marcação aparece, se desfaz */
        .radar-blip { position: relative; width: 12px; height: 12px; border-radius: 50%; background: #f97316; opacity: 0; transform: scale(0);
            box-shadow: 0 0 10px rgba(${ORANGE},.9); pointer-events: none; }
        .radar-blip::after { content: ''; position: absolute; inset: -2px; border-radius: 50%; border: 2px solid rgba(${ORANGE},.8); opacity: 0; }
        .radar-blip.on { animation: radarBlipIn .55s cubic-bezier(.2,.9,.3,1.4) forwards; }
        .radar-blip.on::after { animation: radarBlipPing 1.5s ease-out .35s infinite; }
        .radar-blip.off { animation: radarBlipOut .4s ease-in forwards; }
        @keyframes radarBlipIn { 0% { opacity: 0; transform: scale(0); } 55% { opacity: 1; transform: scale(1.7); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes radarBlipPing { 0% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(4.2); } }
        @keyframes radarBlipOut { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(2.6); } }
        /* ondas que saem do avatar */
        .radar-ripple { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; border: 1.5px solid rgba(${ORANGE},.85);
            box-shadow: 0 0 16px rgba(${ORANGE},.35), inset 0 0 14px rgba(${ORANGE},.18); opacity: 0; will-change: transform, opacity;
            animation: radarRipple 2.6s cubic-bezier(.2,.6,.3,1) infinite; }
        @keyframes radarRipple { 0% { transform: scale(.35); opacity: .95; } 100% { transform: scale(5.2); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .radar-ripple, .radar-blip.on::after { animation: none; } }
    `
    document.head.appendChild(style)
}

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2

type Phase = 'waiting' | 'lead' | 'down' | 'turn' | 'up' | 'fade' | 'done'

// Tempos (ms)
const LEAD_MS = 1100   // só o avatar pulsando, antes da varredura
const DOWN_MS = 2600   // descida (acha os alvos)
const TURN_MS = 380    // toca o rodapé
const UP_MS = 2600     // subida (confirma e revela)
const FADE_MS = 520    // a linha se apaga

export interface RadarScanOptions {
    map: mapboxgl.Map
    overlay: HTMLElement
    getEntries: () => ScanEntry[]
    /** Onde o avatar está (as ondas saem dali). null = centro do mapa */
    getCenter: () => [number, number] | null
    onDone: () => void
}

export function createRadarScan({ map, overlay, getEntries, getCenter, onDone }: RadarScanOptions) {
    ensureRadarScanStyles()

    // ---- peças visuais da varredura (só transform/opacity mudam por quadro) ----
    const root = document.createElement('div')
    root.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;'
    const veil = document.createElement('div') // escurece levemente o mapa durante a varredura (dá o clima de "satélite")
    veil.style.cssText = `position:absolute;inset:0;background:radial-gradient(circle at 50% 45%, rgba(8,12,20,0) 35%, rgba(8,12,20,.28) 100%);opacity:0;transition:opacity .6s ease;`
    const trail = document.createElement('div')
    trail.style.cssText = `position:absolute;left:0;right:0;top:0;height:150px;opacity:0;will-change:transform,opacity;`
    const line = document.createElement('div')
    line.style.cssText = `position:absolute;left:0;right:0;top:0;height:2px;opacity:0;will-change:transform,opacity;
        background:linear-gradient(90deg, rgba(${ORANGE},0) 0%, rgba(251,146,60,.95) 14%, #fff 50%, rgba(251,146,60,.95) 86%, rgba(${ORANGE},0) 100%);
        box-shadow:0 0 10px 2px rgba(${ORANGE},.9), 0 0 38px 10px rgba(${ORANGE},.42);`
    const chip = document.createElement('div')
    chip.style.cssText = `position:absolute;left:12px;top:0;opacity:0;will-change:transform,opacity;padding:3px 8px;border-radius:999px;
        font:700 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;color:#fed7aa;background:rgba(10,12,18,.72);
        border:1px solid rgba(${ORANGE},.55);backdrop-filter:blur(4px);white-space:nowrap;`
    const waiting = document.createElement('div') // aviso enquanto os dados chegam
    waiting.style.cssText = `position:absolute;left:50%;top:14%;transform:translateX(-50%);padding:5px 12px;border-radius:999px;
        font:700 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;color:#fed7aa;background:rgba(10,12,18,.72);
        border:1px solid rgba(${ORANGE},.55);backdrop-filter:blur(4px);transition:opacity .5s ease;`
    waiting.textContent = 'SATÉLITE · SINCRONIZANDO…'
    const ripples = [0, 1.3].map((delay) => {
        const r = document.createElement('div')
        r.className = 'radar-ripple'
        r.style.animationDelay = `${delay}s`
        return r
    })
    root.append(veil, trail, line, chip, waiting, ...ripples)
    overlay.appendChild(root)
    veil.style.opacity = '1'

    let phase: Phase = 'waiting'
    let phaseStart = performance.now()
    let raf = 0
    let cancelled = false
    const setPhase = (p: Phase) => { phase = p; phaseStart = performance.now() }

    const place = (el: HTMLElement, y: number) => { el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)` }

    const frame = (now: number) => {
        if (cancelled) return
        const H = overlay.clientHeight || 1
        const W = overlay.clientWidth || 1
        let elapsed = now - phaseStart
        // trocar de fase zera o relógio da fase (senão o tempo da anterior "vaza" e a varredura pula etapas no mesmo quadro)
        const go = (p: Phase) => { setPhase(p); phaseStart = now; elapsed = 0 }

        // posição da linha e fase seguinte
        let lineY = 0
        let dir: 1 | -1 = 1
        if (phase === 'lead' && elapsed >= LEAD_MS) go('down')
        if (phase === 'down') {
            const t = Math.min(1, elapsed / DOWN_MS)
            lineY = H * easeInOutSine(t)
            if (t >= 1) go('turn')
        }
        if (phase === 'turn') { lineY = H; if (elapsed >= TURN_MS) go('up') }
        if (phase === 'up') {
            dir = -1
            const t = Math.min(1, elapsed / UP_MS)
            lineY = H * (1 - easeInOutSine(t))
            if (t >= 1) go('fade')
        }
        if (phase === 'fade') { dir = -1; lineY = 0 }

        // ondas saindo do avatar
        const c = getCenter()
        const cp = c ? map.project(c) : { x: W / 2, y: H / 2 }
        ripples.forEach((r) => { r.style.left = `${cp.x.toFixed(1)}px`; r.style.top = `${cp.y.toFixed(1)}px` })
        const rippleOn = phase === 'waiting' || phase === 'lead'
        ripples.forEach((r) => { r.style.display = rippleOn ? 'block' : 'none' })

        // estado de cada marcação
        const entries = getEntries()
        let found = 0
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i]
            const p = map.project([e.lng, e.lat])
            const offscreen = p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30
            let target: ScanState
            if (phase === 'waiting' || phase === 'lead') target = 'hidden' // o mapa ainda está se ajustando: nada aparece antes da varredura
            else if (offscreen || phase === 'fade' || phase === 'done') target = 'shown'
            else if (phase === 'down') target = p.y <= lineY ? 'blip' : 'hidden'
            else if (phase === 'turn') target = 'blip'
            else target = p.y >= lineY ? 'shown' : 'blip' // up
            if (e.state !== target) { e.state = target; e.apply(target) }
            if (target !== 'hidden') found++
        }

        // linha, rastro e telemetria
        const scanning = phase === 'down' || phase === 'turn' || phase === 'up' || phase === 'fade'
        if (scanning) {
            const fadeOut = phase === 'fade' ? 1 - Math.min(1, elapsed / FADE_MS) : 1
            const flash = phase === 'turn' ? 1 + 0.9 * Math.sin(Math.min(1, elapsed / TURN_MS) * Math.PI) : 1
            line.style.opacity = String(fadeOut)
            line.style.transform = `translate3d(0, ${lineY.toFixed(1)}px, 0) scaleY(${flash.toFixed(2)})`
            // rastro: um cometa de luz atrás da linha (acima na descida, abaixo na subida)
            const th = Math.min(150, dir === 1 ? lineY : H - lineY)
            trail.style.opacity = String(fadeOut * (phase === 'turn' ? 1 : 0.9))
            trail.style.height = `${Math.max(0, th).toFixed(0)}px`
            trail.style.background = dir === 1
                ? `linear-gradient(to bottom, rgba(${ORANGE},0), rgba(${ORANGE},.22))`
                : `linear-gradient(to top, rgba(${ORANGE},0), rgba(${ORANGE},.22))`
            trail.style.transform = `translate3d(0, ${(dir === 1 ? lineY - th : lineY).toFixed(1)}px, 0)`
            chip.style.opacity = String(fadeOut)
            const total = entries.length
            chip.textContent = phase === 'up' || phase === 'fade'
                ? `CONFIRMANDO ${String(entries.filter((x) => x.state === 'shown').length).padStart(2, '0')}/${String(total).padStart(2, '0')}`
                : `ALVOS DETECTADOS ${String(found).padStart(2, '0')}`
            chip.style.transform = `translate3d(0, ${Math.min(H - 22, Math.max(4, lineY - 24)).toFixed(1)}px, 0)`
        }
        if (phase === 'fade') veil.style.opacity = '0'

        if (phase === 'fade' && elapsed >= FADE_MS) {
            finish()
            return
        }
        raf = requestAnimationFrame(frame)
    }

    const cleanup = () => {
        cancelAnimationFrame(raf)
        root.remove()
    }
    const finish = () => {
        if (phase === 'done') return
        phase = 'done'
        // tudo que ainda não apareceu aparece
        getEntries().forEach((e) => { if (e.state !== 'shown') { e.state = 'shown'; e.apply('shown') } })
        cleanup()
        onDone()
    }

    raf = requestAnimationFrame(frame)

    return {
        /** Os dados chegaram: começa (primeiro só o avatar pulsando, depois a varredura) */
        begin() {
            if (phase !== 'waiting') return
            waiting.style.opacity = '0'
            setPhase('lead')
        },
        /** Nada para varrer (ou o usuário não quer animação): termina já */
        skip() { if (!cancelled) { cancelled = true; phase = 'done'; getEntries().forEach((e) => { e.state = 'shown'; e.apply('shown') }); cleanup(); onDone() } },
        /** Saiu da tela / o mapa foi refeito: só limpa */
        cancel() { cancelled = true; cleanup() },
    }
}

export type RadarScan = ReturnType<typeof createRadarScan>
