// src/components/radar/RadarSonar.tsx
//
// Carregamento do /radar: no lugar de uma tela de radar, o seu AVATAR pulsando no centro (ondas saindo dele) sobre a cor do tema.
// O mapa carrega por baixo e, quando chega, aparece com o avatar já no mesmo lugar (o pulso continua no mapa — ver radarPulse.ts).
// Some com um fade. Respeita "reduzir movimento".
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { ensureRadarPulseStyles } from './radarPulse'

export default function RadarSonar({ loading, label, avatarUrl, name }: { loading: boolean; label?: string; avatarUrl?: string | null; name?: string | null }) {
    const { colors } = useTheme()
    // a tela some com um fade (fica montada 450 ms depois de sair)
    const [show, setShow] = useState(loading)
    const [fading, setFading] = useState(false)
    useEffect(() => { ensureRadarPulseStyles() }, [])
    useEffect(() => {
        if (loading) { setShow(true); setFading(false); return }
        if (!show) return
        setFading(true)
        const t = setTimeout(() => setShow(false), 450)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading])

    if (!show) return null
    const initial = (name || '').replace('@', '').charAt(0).toUpperCase()
    return (
        <div
            className="absolute inset-0 z-10 overflow-hidden transition-opacity duration-500"
            style={{ opacity: fading ? 0 : 1, background: colors.background, pointerEvents: fading ? 'none' : 'auto' }}
            role="status"
            aria-live="polite"
        >
            {/* centro do mapa = onde o avatar aparece quando o mapa chega */}
            <div className="absolute left-1/2 top-1/2">
                <span className="radar-ripple" />
                <span className="radar-ripple" style={{ animationDelay: '1.3s' }} />
                <span
                    className="absolute rounded-full overflow-hidden flex items-center justify-center text-white font-bold"
                    style={{ width: 34, height: 34, margin: '-17px 0 0 -17px', border: '3px solid #f97316', boxShadow: '0 0 0 3px rgba(249,115,22,0.3), 0 8px 20px rgba(0,0,0,0.2)', background: 'linear-gradient(135deg,#f97316,#ef4444)', fontSize: 16 }}
                >
                    {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initial}
                </span>
            </div>
            {label && <p className="absolute left-1/2 -translate-x-1/2 text-xs font-bold tracking-wide" style={{ bottom: '18%', color: colors.textSecondary }}>{label}</p>}
        </div>
    )
}
