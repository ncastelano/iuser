// src/components/radar/RadarSonar.tsx
//
// Efeito de sonar do /radar. Duas fases:
//  - "loading": enquanto o mapa/localização/dados carregam, uma tela de radar (fundo escuro com anéis e grade, varredura girando
//    e ondas saindo do centro) com o texto do que está sendo feito.
//  - "scan": uma vez, quando tudo carregou, ondas saem do ponto onde a pessoa está e, conforme a onda chega em cada marcador do
//    mapa, ele "aparece" com um brilho (os marcadores ficam escondidos até a onda passar).
// Só apresentação: não mexe nos dados do radar. Respeita "reduzir movimento".
'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type mapboxgl from 'mapbox-gl'

const ORANGE = '#f97316'
const SCAN_MS = 3600

export default function RadarSonar({ phase, map, center, label, onScanDone }: {
    phase: 'loading' | 'scan' | 'off'
    map: mapboxgl.Map | null
    center: { lat: number; lng: number } | null
    label?: string
    onScanDone?: () => void
}) {
    // a tela de carregamento some com um fade (fica montada 450 ms depois de sair)
    const [showLoading, setShowLoading] = useState(phase === 'loading')
    const [loadingFading, setLoadingFading] = useState(false)
    useEffect(() => {
        if (phase === 'loading') { setShowLoading(true); setLoadingFading(false); return }
        if (!showLoading) return
        setLoadingFading(true)
        const t = setTimeout(() => setShowLoading(false), 450)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase])

    return (
        <>
            {showLoading && (
                <div className="absolute inset-0 z-10 overflow-hidden flex items-center justify-center transition-opacity duration-500" style={{ opacity: loadingFading ? 0 : 1, background: 'radial-gradient(circle at 50% 46%, #0b2a3a 0%, #07131f 62%, #050b13 100%)', pointerEvents: loadingFading ? 'none' : 'auto' }} role="status" aria-live="polite">
                    <div className="relative" style={{ width: 'min(78vw, 440px)', aspectRatio: '1 / 1' }}>
                        {/* anéis e cruz fixos */}
                        {[1, 0.72, 0.44, 0.2].map((s) => (
                            <span key={s} className="absolute rounded-full" style={{ inset: `${(1 - s) * 50}%`, border: '1px solid rgba(251,146,60,0.28)' }} />
                        ))}
                        <span className="absolute left-0 right-0 top-1/2 h-px" style={{ background: 'rgba(251,146,60,0.2)' }} />
                        <span className="absolute top-0 bottom-0 left-1/2 w-px" style={{ background: 'rgba(251,146,60,0.2)' }} />
                        {/* ondas */}
                        {[0, 0.9, 1.8].map((d) => (
                            <span key={d} className="radar-wave absolute inset-0 rounded-full" style={{ border: `2px solid ${ORANGE}`, animationDelay: `${d}s` }} />
                        ))}
                        {/* varredura */}
                        <span className="radar-sweep absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(249,115,22,0) 0deg, rgba(249,115,22,0) 250deg, rgba(249,115,22,0.55) 358deg, rgba(251,146,60,0.9) 360deg)' }} />
                        {/* pontinhos que aparecem e somem, como ecos */}
                        {[[28, 30], [68, 24], [74, 62], [36, 72], [54, 40]].map(([x, y], i) => (
                            <span key={i} className="radar-blip absolute w-2 h-2 rounded-full" style={{ left: `${x}%`, top: `${y}%`, background: '#fdba74', animationDelay: `${i * 0.7}s` }} />
                        ))}
                        <span className="absolute left-1/2 top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: ORANGE, boxShadow: '0 0 0 4px rgba(249,115,22,0.35), 0 0 22px rgba(249,115,22,0.9)' }} />
                    </div>
                    {label && <p className="absolute left-1/2 -translate-x-1/2 text-sm font-black tracking-wide text-white/90" style={{ bottom: '17%' }}>{label}</p>}
                </div>
            )}
            {phase === 'scan' && <Scan map={map} center={center} onDone={onScanDone} />}
            <style>{`
                .radar-wave { animation: radarWave 2.7s cubic-bezier(.2,.6,.3,1) infinite; transform: scale(0); opacity: 0; }
                @keyframes radarWave { 0% { transform: scale(0.04); opacity: .9; } 100% { transform: scale(1); opacity: 0; } }
                .radar-sweep { animation: radarSweep 2.4s linear infinite; }
                @keyframes radarSweep { to { transform: rotate(360deg); } }
                .radar-blip { animation: radarBlip 3.4s ease-out infinite; opacity: 0; }
                @keyframes radarBlip { 0%, 100% { opacity: 0; transform: scale(.4); } 12% { opacity: 1; transform: scale(1.3); box-shadow: 0 0 14px #fb923c; } 45% { opacity: 0; } }
                .sonar-ring { position: absolute; border-radius: 9999px; transform: scale(0.02); opacity: 0; animation: sonarRing ${SCAN_MS}ms cubic-bezier(.22,.61,.36,1) forwards; }
                @keyframes sonarRing { 0% { transform: scale(0.02); opacity: .95; } 80% { opacity: .5; } 100% { transform: scale(1); opacity: 0; } }
                .sonar-sweep-grow { position: absolute; border-radius: 9999px; transform: scale(0.05); animation: sonarGrow ${SCAN_MS}ms cubic-bezier(.22,.61,.36,1) forwards; }
                @keyframes sonarGrow { 0% { transform: scale(0.05); opacity: 1; } 85% { opacity: .8; } 100% { transform: scale(1); opacity: 0; } }
                .sonar-sweep-spin { position: absolute; inset: 0; border-radius: 9999px; animation: radarSweep 1.1s linear infinite; }
                .sonar-found { animation: sonarFound 1s ease-out; }
                @keyframes sonarFound { 0% { filter: drop-shadow(0 0 0 rgba(251,146,60,0)); } 35% { filter: drop-shadow(0 0 16px rgba(251,146,60,1)); } 100% { filter: none; } }
                @media (prefers-reduced-motion: reduce) { .radar-wave, .radar-sweep, .radar-blip, .sonar-ring, .sonar-sweep-grow, .sonar-sweep-spin { animation-duration: 0.01s; animation-iteration-count: 1; } }
            `}</style>
        </>
    )
}

// A onda sai do ponto onde a pessoa está, no tamanho do mapa; os marcadores aparecem quando ela passa por eles.
function Scan({ map, center, onDone }: { map: mapboxgl.Map | null; center: { lat: number; lng: number } | null; onDone?: () => void }) {
    const [geo, setGeo] = useState<{ x: number; y: number; r: number } | null>(null)
    const doneRef = useRef(onDone)
    doneRef.current = onDone

    useLayoutEffect(() => {
        if (!map) return
        const c = center || map.getCenter()
        const p = map.project([center ? center.lng : (c as mapboxgl.LngLat).lng, center ? center.lat : (c as mapboxgl.LngLat).lat])
        const box = map.getContainer().getBoundingClientRect()
        const r = Math.max(Math.hypot(p.x, p.y), Math.hypot(box.width - p.x, p.y), Math.hypot(p.x, box.height - p.y), Math.hypot(box.width - p.x, box.height - p.y))
        setGeo({ x: p.x, y: p.y, r })
    }, [map, center])

    useEffect(() => {
        if (!map || !geo) return
        const container = map.getContainer()
        const box = container.getBoundingClientRect()
        const hidden: HTMLElement[] = []
        const timers: ReturnType<typeof setTimeout>[] = []
        container.querySelectorAll<HTMLElement>('.mapboxgl-marker').forEach((el) => {
            const b = el.getBoundingClientRect()
            const d = Math.hypot(b.left + b.width / 2 - box.left - geo.x, b.top + b.height / 2 - box.top - geo.y)
            // o marcador some até a onda chegar nele (a onda desacelera: chega mais rápido perto do centro)
            const at = Math.min(SCAN_MS * 0.92, SCAN_MS * 0.9 * Math.pow(Math.min(d / geo.r, 1), 0.62))
            el.style.opacity = '0'
            el.style.transition = 'opacity .35s ease'
            hidden.push(el)
            timers.push(setTimeout(() => { el.style.opacity = ''; el.classList.add('sonar-found') }, at))
        })
        const end = setTimeout(() => doneRef.current?.(), SCAN_MS + 150)
        return () => {
            timers.forEach(clearTimeout)
            clearTimeout(end)
            hidden.forEach((el) => { el.style.opacity = ''; el.style.transition = ''; el.classList.remove('sonar-found') })
        }
    }, [map, geo])

    if (!geo) return null
    const size = geo.r * 2
    const pos = { left: geo.x - geo.r, top: geo.y - geo.r, width: size, height: size }
    return (
        <div className="absolute inset-0 z-[12] overflow-hidden pointer-events-none" aria-hidden>
            <div className="sonar-sweep-grow" style={pos}>
                <div className="sonar-sweep-spin" style={{ background: 'conic-gradient(from 0deg, rgba(249,115,22,0) 0deg, rgba(249,115,22,0) 270deg, rgba(249,115,22,0.28) 350deg, rgba(251,146,60,0.55) 360deg)' }} />
            </div>
            {[0, 0.28, 0.56].map((d) => (
                <div key={d} className="sonar-ring" style={{ ...pos, border: `${3 - d * 2.5}px solid ${ORANGE}`, background: 'radial-gradient(circle, rgba(249,115,22,0) 68%, rgba(249,115,22,0.16) 100%)', animationDelay: `${d}s` }} />
            ))}
            <span className="absolute w-4 h-4 rounded-full" style={{ left: geo.x - 8, top: geo.y - 8, background: ORANGE, boxShadow: '0 0 0 6px rgba(249,115,22,0.35), 0 0 26px rgba(249,115,22,0.9)' }} />
        </div>
    )
}
