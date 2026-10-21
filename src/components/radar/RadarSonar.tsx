// src/components/radar/RadarSonar.tsx
//
// Tela de carregamento do /radar em forma de sonar: fundo escuro com anéis e grade, varredura girando, ondas saindo do centro e
// ecos que acendem, com o texto do que está sendo feito. Some com um fade quando o mapa, a localização e os dados chegaram.
// Só apresentação (os pins do mapa não têm animação). Respeita "reduzir movimento".
'use client'

import { useEffect, useState } from 'react'

const ORANGE = '#f97316'
export default function RadarSonar({ loading, label }: { loading: boolean; label?: string }) {
    // a tela de carregamento some com um fade (fica montada 450 ms depois de sair)
    const [showLoading, setShowLoading] = useState(loading)
    const [loadingFading, setLoadingFading] = useState(false)
    useEffect(() => {
        if (loading) { setShowLoading(true); setLoadingFading(false); return }
        if (!showLoading) return
        setLoadingFading(true)
        const t = setTimeout(() => setShowLoading(false), 450)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading])

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
            <style>{`
                .radar-wave { animation: radarWave 2.7s cubic-bezier(.2,.6,.3,1) infinite; transform: scale(0); opacity: 0; }
                @keyframes radarWave { 0% { transform: scale(0.04); opacity: .9; } 100% { transform: scale(1); opacity: 0; } }
                .radar-sweep { animation: radarSweep 2.4s linear infinite; }
                @keyframes radarSweep { to { transform: rotate(360deg); } }
                .radar-blip { animation: radarBlip 3.4s ease-out infinite; opacity: 0; }
                @keyframes radarBlip { 0%, 100% { opacity: 0; transform: scale(.4); } 12% { opacity: 1; transform: scale(1.3); box-shadow: 0 0 14px #fb923c; } 45% { opacity: 0; } }
                @media (prefers-reduced-motion: reduce) { .radar-wave, .radar-sweep, .radar-blip { animation-duration: 0.01s; animation-iteration-count: 1; } }
            `}</style>
        </>
    )
}
