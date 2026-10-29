// src/components/digital/ProPlayer.tsx — o player de vídeo-aula: tela escura estilo cinema, controles próprios (play, ±10 s, barra com o já carregado, volume, velocidade, PiP, tela cheia),
// atalhos de teclado, retoma de onde a pessoa parou e, ao acabar, conta 5 s e abre a próxima aula. O link do arquivo vem do servidor (assinado, vale 1 hora).
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { openItem } from '@/modules/digital'

const ORANGE = '#f97316'
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]
const AUTO_NEXT_SECONDS = 5
const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
const posKey = (id: string) => `iuser_digital_pos_${id}`

interface Props {
    itemId: string
    title: string
    nextTitle?: string | null
    onEnded: () => void        // acabou de verdade: marca como concluída
    onNext?: (() => void) | null
}

export default function ProPlayer({ itemId, title, nextTitle, onEnded, onNext }: Props) {
    const { colors } = useTheme()
    const wrap = useRef<HTMLDivElement>(null)
    const video = useRef<HTMLVideoElement>(null)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastSave = useRef(0)
    const [src, setSrc] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [playing, setPlaying] = useState(false)
    const [time, setTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [buffered, setBuffered] = useState(0)
    const [volume, setVolume] = useState(1)
    const [muted, setMuted] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [full, setFull] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [ended, setEnded] = useState(false)
    const [countdown, setCountdown] = useState<number | null>(null)
    const [toast, setToast] = useState<string | null>(null)
    const [scrub, setScrub] = useState<number | null>(null)

    // link do arquivo a cada troca de aula
    useEffect(() => {
        let alive = true
        setSrc(null); setError(null); setEnded(false); setCountdown(null); setTime(0); setDuration(0); setBuffered(0); setPlaying(false)
        openItem(itemId).then((d) => { if (alive) setSrc(d.url) }).catch((e) => { if (alive) setError(e.message) })
        return () => { alive = false }
    }, [itemId])

    const flash = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? null : t)), 900) }, [])
    const poke = useCallback(() => {
        setShowControls(true)
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => { if (video.current && !video.current.paused) setShowControls(false) }, 2600)
    }, [])

    const toggle = useCallback(() => { const v = video.current; if (!v) return; if (v.paused) v.play().catch(() => { }); else v.pause() }, [])
    const seekBy = useCallback((d: number) => { const v = video.current; if (!v) return; v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.05, v.currentTime + d)); flash(d > 0 ? `+${d} s` : `${d} s`); poke() }, [flash, poke])
    const setRate = useCallback((r: number) => { const v = video.current; if (v) v.playbackRate = r; setSpeed(r); flash(`${r}x`) }, [flash])
    const fullscreen = useCallback(() => { const el = wrap.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().catch(() => { }) }, [])
    const pip = useCallback(() => { const v = video.current as any; if (!v) return; if ((document as any).pictureInPictureElement) (document as any).exitPictureInPicture(); else v.requestPictureInPicture?.().catch(() => { }) }, [])
    const toggleMute = useCallback(() => { const v = video.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted) }, [])

    useEffect(() => {
        const onFs = () => setFull(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', onFs)
        return () => document.removeEventListener('fullscreenchange', onFs)
    }, [])

    // atalhos (não atrapalham quando se escreve num campo)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            const k = e.key
            if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); poke() }
            else if (k === 'ArrowRight') { e.preventDefault(); seekBy(5) }
            else if (k === 'ArrowLeft') { e.preventDefault(); seekBy(-5) }
            else if (k === 'l') seekBy(10)
            else if (k === 'j') seekBy(-10)
            else if (k === 'f') fullscreen()
            else if (k === 'm') toggleMute()
            else if (k === 'ArrowUp') { e.preventDefault(); const v = video.current; if (v) { v.volume = Math.min(1, v.volume + 0.1); setVolume(v.volume); flash(`Volume ${Math.round(v.volume * 100)}%`) } }
            else if (k === 'ArrowDown') { e.preventDefault(); const v = video.current; if (v) { v.volume = Math.max(0, v.volume - 0.1); setVolume(v.volume); flash(`Volume ${Math.round(v.volume * 100)}%`) } }
            else if (k === '>' || k === '.') setRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)] ?? speed)
            else if (k === '<' || k === ',') setRate(SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)] ?? speed)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [toggle, seekBy, fullscreen, toggleMute, setRate, speed, flash, poke])

    // contagem para a próxima aula
    useEffect(() => {
        if (countdown === null) return
        if (countdown <= 0) { onNext?.(); return }
        const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
        return () => clearTimeout(t)
    }, [countdown, onNext])

    const onLoaded = () => {
        const v = video.current; if (!v) return
        setDuration(v.duration || 0)
        v.playbackRate = speed
        let at = 0
        try { at = Number(localStorage.getItem(posKey(itemId)) || 0) } catch { /* ok */ }
        if (at > 5 && at < (v.duration || 0) - 6) { v.currentTime = at; flash(`Retomando em ${fmt(at)}`) }
        v.play().catch(() => { /* o navegador pediu um toque: o botão grande aparece */ })
    }
    const onTime = () => {
        const v = video.current; if (!v) return
        setTime(v.currentTime)
        if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
        const now = Date.now()
        if (now - lastSave.current > 3000) { lastSave.current = now; try { localStorage.setItem(posKey(itemId), String(Math.floor(v.currentTime))) } catch { /* ok */ } }
    }
    const finished = () => {
        setPlaying(false); setEnded(true); setShowControls(true)
        try { localStorage.removeItem(posKey(itemId)) } catch { /* ok */ }
        onEnded()
        if (onNext) setCountdown(AUTO_NEXT_SECONDS)
    }
    const replay = () => { const v = video.current; if (!v) return; setEnded(false); setCountdown(null); v.currentTime = 0; v.play().catch(() => { }) }

    const shownTime = scrub ?? time
    const pct = duration ? (shownTime / duration) * 100 : 0
    const bufPct = duration ? (buffered / duration) * 100 : 0
    const icon = 'flex items-center justify-center rounded-full transition hover:bg-white/15 active:scale-90'

    return (
        <div ref={wrap} onMouseMove={poke} onTouchStart={poke} onMouseLeave={() => { if (video.current && !video.current.paused) setShowControls(false) }}
            className="relative w-full overflow-hidden select-none" style={{ background: colors.surface, border: `1px solid ${colors.border}`, aspectRatio: full ? undefined : '16 / 9', height: full ? '100%' : undefined, borderRadius: full ? 0 : 20, boxShadow: full ? 'none' : '0 20px 60px -20px rgba(249,115,22,.35)' }}>
            {error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"><p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{error}</p></div>
            ) : (
                <video ref={video} src={src || undefined} playsInline preload="metadata" className="absolute inset-0 w-full h-full object-contain" onClick={toggle} onDoubleClick={fullscreen}
                    onLoadedMetadata={onLoaded} onTimeUpdate={onTime} onProgress={onTime} onPlay={() => { setPlaying(true); setEnded(false); poke() }} onPause={() => { setPlaying(false); setShowControls(true) }}
                    onEnded={finished} onVolumeChange={(e) => { setMuted(e.currentTarget.muted); setVolume(e.currentTarget.volume) }} />
            )}
            {!src && !error && <div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: `${colors.border}`, borderTopColor: ORANGE }} /></div>}

            {/* botão grande no centro quando está parado */}
            {src && !playing && !ended && (
                <button type="button" onClick={toggle} aria-label="Reproduzir" className="absolute inset-0 m-auto w-20 h-20 rounded-full flex items-center justify-center text-white backdrop-blur-md transition hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(249,115,22,.85)', boxShadow: '0 10px 40px rgba(249,115,22,.5)' }}><Play size={34} fill="white" className="ml-1" /></button>
            )}
            {toast && <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-black text-white" style={{ background: 'rgba(0,0,0,.7)' }}>{toast}</div>}

            {/* fim da aula */}
            {ended && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3 text-center p-3 sm:p-6" style={{ background: `${colors.background}ee`, color: colors.textPrimary, backdropFilter: 'blur(6px)' }}>
                    <CheckCircle2 size={36} style={{ color: '#22c55e' }} />
                    <p className="text-base sm:text-lg font-black">Aula concluída!</p>
                    {onNext ? (
                        <>
                            <p className="text-sm" style={{ color: colors.textSecondary }}>Próxima: <b style={{ color: colors.textPrimary }}>{nextTitle}</b> {countdown !== null && <>em <b style={{ color: ORANGE }}>{countdown}s</b></>}</p>
                            <div className="flex gap-2">
                                <button type="button" onClick={replay} className="h-10 px-4 rounded-full text-sm font-black inline-flex items-center gap-2" style={{ background: `${colors.border}55` }}><RotateCcw size={15} /> Rever</button>
                                {countdown !== null && <button type="button" onClick={() => setCountdown(null)} className="h-10 px-4 rounded-full text-sm font-black" style={{ background: `${colors.border}55` }}>Cancelar</button>}
                                <button type="button" onClick={() => onNext()} className="h-10 px-5 rounded-full text-sm font-black inline-flex items-center gap-2" style={{ background: ORANGE }}>Próxima agora <SkipForward size={15} /></button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-sm" style={{ color: colors.textSecondary }}>Você chegou ao fim do conteúdo. Parabéns! 🎉</p>
                            <button type="button" onClick={replay} className="h-10 px-4 rounded-full text-sm font-black inline-flex items-center gap-2" style={{ background: `${colors.border}55` }}><RotateCcw size={15} /> Rever esta aula</button>
                        </>
                    )}
                </div>
            )}

            {/* controles */}
            {src && (
                <div className="absolute inset-x-0 bottom-0 pt-16 pb-2 px-3 text-white transition-opacity duration-300" style={{ opacity: showControls && !ended ? 1 : 0, pointerEvents: showControls && !ended ? 'auto' : 'none', background: 'linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,0))' }}>
                    <p className="text-[13px] font-black truncate mb-2 px-1 opacity-90">{title}</p>
                    <div className="relative h-5 flex items-center group px-1">
                        <div className="absolute left-1 right-1 h-1.5 group-hover:h-2 rounded-full transition-all" style={{ background: 'rgba(255,255,255,.22)' }}>
                            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${bufPct}%`, background: 'rgba(255,255,255,.35)' }} />
                            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: ORANGE }} />
                            <div className="absolute top-1/2 w-3.5 h-3.5 rounded-full -translate-y-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition" style={{ left: `${pct}%`, background: ORANGE, boxShadow: '0 0 0 4px rgba(249,115,22,.3)' }} />
                        </div>
                        <input type="range" min={0} max={duration || 0} step={0.1} value={shownTime} aria-label="Posição do vídeo" className="absolute inset-x-0 w-full h-5 opacity-0 cursor-pointer"
                            onChange={(e) => setScrub(Number(e.target.value))} onMouseUp={() => { if (scrub !== null && video.current) video.current.currentTime = scrub; setScrub(null) }}
                            onTouchEnd={() => { if (scrub !== null && video.current) video.current.currentTime = scrub; setScrub(null) }} onKeyUp={() => setScrub(null)} />
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                        <button type="button" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproduzir'} className={`${icon} w-10 h-10`}>{playing ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" className="ml-0.5" />}</button>
                        <button type="button" onClick={() => seekBy(-10)} aria-label="Voltar 10 segundos" className={`${icon} w-9 h-9 text-[11px] font-black`}>-10</button>
                        <button type="button" onClick={() => seekBy(10)} aria-label="Avançar 10 segundos" className={`${icon} w-9 h-9 text-[11px] font-black`}>+10</button>
                        <span className="text-[12px] font-bold tabular-nums mx-1 opacity-90">{fmt(shownTime)} / {fmt(duration)}</span>
                        <span className="flex-1" />
                        <button type="button" onClick={toggleMute} aria-label={muted ? 'Ativar som' : 'Silenciar'} className={`${icon} w-9 h-9`}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                        <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume" className="hidden sm:block w-16 accent-orange-500"
                            onChange={(e) => { const v = video.current; if (!v) return; v.volume = Number(e.target.value); v.muted = Number(e.target.value) === 0 }} />
                        <button type="button" onClick={() => setRate(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} aria-label="Velocidade" className={`${icon} h-9 px-2 text-[12px] font-black min-w-[44px]`}>{speed}x</button>
                        <button type="button" onClick={pip} aria-label="Janela flutuante" className={`${icon} w-9 h-9 hidden sm:flex`}><PictureInPicture2 size={17} /></button>
                        <button type="button" onClick={fullscreen} aria-label="Tela cheia" className={`${icon} w-9 h-9`}>{full ? <Minimize size={18} /> : <Maximize size={18} />}</button>
                    </div>
                </div>
            )}
        </div>
    )
}
