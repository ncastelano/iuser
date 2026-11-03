// src/components/digital/MusicPlayer.tsx — o player de MÚSICA da sala (produto digital só com áudio): capa grande, nome da faixa e do artista, play/pausa, faixa anterior/próxima,
// barra de progresso que se arrasta, tempo e passagem automática para a faixa seguinte. Avisa o aparelho (Media Session) do que está tocando: tela de bloqueio e fone
// mostram título, artista e capa e respondem a play/pausa/anterior/próxima — e a música segue tocando com a tela apagada. O link do arquivo é pedido ao servidor a cada faixa.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, Lock } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { formatDuration, openItem } from '@/modules/digital'

export default function MusicPlayer({ itemId, title, artist, cover, trackLabel, onEnded, onNext, onPrev }: {
    itemId: string; title: string; artist?: string | null; cover?: string | null
    /** "Faixa 2 de 8" */
    trackLabel?: string
    onEnded?: () => void; onNext?: (() => void) | null; onPrev?: (() => void) | null
}) {
    const { colors } = useTheme()
    const audioRef = useRef<HTMLAudioElement>(null)
    const [url, setUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [playing, setPlaying] = useState(false)
    const [pos, setPos] = useState(0)
    const [dur, setDur] = useState(0)
    const [seeking, setSeeking] = useState(false)

    useEffect(() => {
        let alive = true
        setUrl(null); setError(null); setPos(0); setDur(0); setPlaying(false)
        openItem(itemId).then((d) => { if (alive) setUrl(d.url) }).catch((e) => { if (alive) setError(e.message) })
        return () => { alive = false }
    }, [itemId])

    // O aparelho mostra o que está tocando e entende os botões do fone / da tela de bloqueio
    useEffect(() => {
        if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
        const ms = navigator.mediaSession
        try {
            ms.metadata = new MediaMetadata({ title, artist: artist || 'iUser', artwork: cover ? [{ src: cover, sizes: '512x512' }] : [] })
            ms.setActionHandler('play', () => { audioRef.current?.play().catch(() => {}) })
            ms.setActionHandler('pause', () => { audioRef.current?.pause() })
            ms.setActionHandler('previoustrack', onPrev || null)
            ms.setActionHandler('nexttrack', onNext || null)
            ms.setActionHandler('seekto', (d) => { if (audioRef.current && d.seekTime != null) audioRef.current.currentTime = d.seekTime })
        } catch { /* navegador sem suporte completo */ }
        return () => { try { ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'].forEach((a) => ms.setActionHandler(a as MediaSessionAction, null)) } catch { /* ok */ } }
    }, [title, artist, cover, onNext, onPrev])

    const toggle = () => { const a = audioRef.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause() }
    const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0

    if (error) {
        return (
            <div className="rounded-3xl p-8 flex flex-col items-center gap-2 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <Lock size={26} style={{ color: colors.textSecondary }} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{error}</p>
            </div>
        )
    }
    return (
        <div className="rounded-3xl p-4 sm:p-6 flex flex-col items-center gap-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="w-full max-w-[280px] aspect-square rounded-3xl overflow-hidden flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f97316,#dc2626)', boxShadow: '0 18px 40px rgba(0,0,0,0.25)' }}>
                {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <span className="text-white/90 text-6xl">♪</span>}
            </div>
            <div className="w-full text-center min-w-0">
                {trackLabel && <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#f97316' }}>{trackLabel}</p>}
                <h2 className="text-lg font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{title}</h2>
                {artist && <p className="text-sm truncate" style={{ color: colors.textSecondary }}>{artist}</p>}
            </div>

            <div className="w-full flex flex-col gap-1">
                <input type="range" min={0} max={Math.max(1, dur)} step={0.1} value={pos} onChange={(e) => { setSeeking(true); setPos(Number(e.target.value)) }}
                    onPointerUp={(e) => { const a = audioRef.current; if (a) a.currentTime = Number((e.target as HTMLInputElement).value); setSeeking(false) }}
                    onKeyUp={(e) => { const a = audioRef.current; if (a) a.currentTime = Number((e.target as HTMLInputElement).value) }}
                    aria-label="Posição da música" disabled={!url || dur <= 0} className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, #f97316 ${pct}%, ${colors.border} ${pct}%)`, accentColor: '#f97316' }} />
                <div className="flex justify-between text-[11px] font-bold tabular-nums" style={{ color: colors.textSecondary }}>
                    <span>{formatDuration(Math.floor(pos)) || '0:00'}</span><span>{formatDuration(Math.floor(dur)) || '--:--'}</span>
                </div>
            </div>

            <div className="flex items-center gap-5">
                <button type="button" onClick={() => onPrev?.()} disabled={!onPrev} aria-label="Faixa anterior" className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-30 transition active:scale-90" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><SkipBack size={20} /></button>
                <button type="button" onClick={toggle} disabled={!url} aria-label={playing ? 'Pausar' : 'Tocar'} className="w-16 h-16 rounded-full flex items-center justify-center text-white transition active:scale-90 disabled:opacity-50" style={{ background: '#f97316', boxShadow: '0 8px 22px rgba(249,115,22,0.45)' }}>
                    {!url ? <Spinner size={22} color="#fff" /> : playing ? <Pause size={26} fill="#fff" /> : <Play size={26} fill="#fff" className="ml-0.5" />}
                </button>
                <button type="button" onClick={() => onNext?.()} disabled={!onNext} aria-label="Próxima faixa" className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-30 transition active:scale-90" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><SkipForward size={20} /></button>
            </div>

            {url && (
                <audio key={url} ref={audioRef} src={url} autoPlay preload="auto"
                    onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                    onLoadedMetadata={(e) => setDur(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
                    onTimeUpdate={(e) => { if (!seeking) setPos(e.currentTarget.currentTime) }}
                    onEnded={() => { setPlaying(false); onEnded?.() }} />
            )}
        </div>
    )
}
