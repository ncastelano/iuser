// src/components/radar/RadarSonar.tsx
//
// Efeito de sonar do /radar. Duas fases:
//  - "loading": enquanto o mapa/localização/dados carregam, uma tela de radar (fundo escuro com anéis e grade, varredura girando
//    e ondas saindo do centro) com o texto do que está sendo feito.
//  - "scan": uma vez, assim que a tela de carregamento sai, os pins do mapa são "localizados" um a um, dos mais perto de onde a
//    pessoa está para os mais longe (cada um salta com um brilho e solta um anel). Não há outra faixa/onda por cima do mapa:
//    a tela de carregamento já mostrou a busca.
// Só apresentação: não mexe nos dados do radar. Respeita "reduzir movimento".
'use client'

import { useEffect, useRef, useState } from 'react'
import type mapboxgl from 'mapbox-gl'

const ORANGE = '#f97316'
// Os pins são localizados ao longo de POP_MS, do mais perto para o mais longe
const POP_MS = 2400
const popTime = (distance: number, radius: number) => 120 + POP_MS * Math.pow(Math.min(distance / radius, 1), 0.7)

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
                /* usa as propriedades "scale"/"translate" (separadas de "transform", que o Mapbox usa para posicionar o pin) */
                .sonar-found { transform-origin: 50% 100%; animation: sonarFound .9s cubic-bezier(.3,1.4,.5,1) both; }
                @keyframes sonarFound {
                    0% { scale: .2; translate: 0 -26px; opacity: 0; filter: drop-shadow(0 0 0 rgba(251,146,60,0)); }
                    45% { scale: 1.4; translate: 0 0; opacity: 1; filter: drop-shadow(0 0 18px rgba(251,146,60,1)); }
                    65% { scale: .92; }
                    82% { scale: 1.06; }
                    100% { scale: 1; filter: drop-shadow(0 0 0 rgba(251,146,60,0)); }
                }
                .sonar-found-ring { position: absolute; left: 50%; top: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 9999px; border: 3px solid #f97316; pointer-events: none; animation: sonarFoundRing 1s ease-out forwards; }
                @keyframes sonarFoundRing { 0% { transform: scale(.3); opacity: .95; } 100% { transform: scale(2.4); opacity: 0; } }
                @media (prefers-reduced-motion: reduce) { .radar-wave, .radar-sweep, .radar-blip, .sonar-found, .sonar-found-ring { animation-duration: 0.01s; animation-iteration-count: 1; } }
            `}</style>
        </>
    )
}

// Esconde os pins e os "localiza" um a um (a ordem é a distância até onde a pessoa está).
function Scan({ map, center, onDone }: { map: mapboxgl.Map | null; center: { lat: number; lng: number } | null; onDone?: () => void }) {
    const doneRef = useRef(onDone)
    doneRef.current = onDone

    useEffect(() => {
        if (!map) return
        const c = center ? { lng: center.lng, lat: center.lat } : map.getCenter()
        const p = map.project([c.lng, c.lat])
        const container = map.getContainer()
        const box = container.getBoundingClientRect()
        const r = Math.max(Math.hypot(p.x, p.y), Math.hypot(box.width - p.x, p.y), Math.hypot(p.x, box.height - p.y), Math.hypot(box.width - p.x, box.height - p.y)) || 1
        const hidden: HTMLElement[] = []
        const timers: ReturnType<typeof setTimeout>[] = []
        container.querySelectorAll<HTMLElement>('.mapboxgl-marker').forEach((el) => {
            const b = el.getBoundingClientRect()
            const d = Math.hypot(b.left + b.width / 2 - box.left - p.x, b.top + b.height / 2 - box.top - p.y)
            el.style.opacity = '0'
            hidden.push(el)
            timers.push(setTimeout(() => {
                el.style.opacity = ''
                el.classList.add('sonar-found')
                const ring = document.createElement('span')
                ring.className = 'sonar-found-ring'
                el.appendChild(ring)
                timers.push(setTimeout(() => { ring.remove(); el.classList.remove('sonar-found') }, 1100))
            }, popTime(d, r)))
        })
        const end = setTimeout(() => doneRef.current?.(), POP_MS + 1200)
        return () => {
            timers.forEach(clearTimeout)
            clearTimeout(end)
            hidden.forEach((el) => { el.style.opacity = ''; el.classList.remove('sonar-found'); el.querySelectorAll('.sonar-found-ring').forEach((x) => x.remove()) })
        }
    }, [map, center])

    return null
}
