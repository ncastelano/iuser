// src/components/chat/DirectMediaParts.tsx
//
// Partes de mídia das conversas diretas: foto, vídeo e áudio (normal ou de visualização única), localização ao vivo e o gravador de áudio.
// O arquivo mora no R2 PRIVADO do chat; o link só sai do servidor (/api/chat/media e /api/chat/view-once), depois de conferir a conversa.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, Mic, MapPin, Pause, Play, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { fmtTime, pickRecorderMime, CHAT_LIMITS } from '@/lib/chatMedia'

export type MediaMessage = {
    id: string; kind: string; sender_id: string; view_once?: boolean; viewed_at: string | null; media_seconds?: number | null
    loc_lat: number | null; loc_lng: number | null; loc_updated_at: string | null; loc_expires_at: string | null; loc_stopped: boolean
}

const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const KIND_LABEL: Record<string, string> = { photo: 'Foto', video: 'Vídeo', audio: 'Áudio' }

/** A localização está valendo agora: não parada pelo dono e ainda dentro do prazo. */
export function isLocationActive(m: Pick<MediaMessage, 'kind' | 'loc_stopped' | 'loc_expires_at'>): boolean {
    return m.kind === 'location' && !m.loc_stopped && !!m.loc_expires_at && new Date(m.loc_expires_at).getTime() > Date.now()
}

/** Pede ao servidor o link (5 min) de uma mídia normal da conversa. */
function useMediaUrl(id: string) {
    const [url, setUrl] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)
    useEffect(() => {
        let alive = true
        fetch(`/api/chat/media?message=${encodeURIComponent(id)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!alive) return; if (j?.url) setUrl(j.url); else setFailed(true) })
            .catch(() => { if (alive) setFailed(true) })
        return () => { alive = false }
    }, [id])
    return { url, failed }
}

export function PhotoBubble({ id, colors }: { id: string; colors: any }) {
    const { url, failed } = useMediaUrl(id)
    if (failed) return <p className="text-xs italic opacity-80">Foto indisponível</p>
    if (!url) return <div className="w-56 h-40 rounded-xl animate-pulse" style={{ background: `${colors.border}55` }} />
    return <img src={url} alt="Foto enviada" className="rounded-xl max-w-[240px] max-h-72 object-cover" />
}

export function VideoBubble({ id, colors }: { id: string; colors: any }) {
    const { url, failed } = useMediaUrl(id)
    if (failed) return <p className="text-xs italic opacity-80">Vídeo indisponível</p>
    if (!url) return <div className="w-56 h-40 rounded-xl animate-pulse" style={{ background: `${colors.border}55` }} />
    return <video src={url} controls playsInline preload="metadata" className="rounded-xl max-w-[260px] max-h-80 bg-black" />
}

/** Reprodução de áudio no estilo do WhatsApp: botão redondo, barras que enchem conforme toca, tempo. */
export function AudioBubble({ src, mine, colors, seconds, autoPlay = false }: { src: string; mine: boolean; colors: any; seconds?: number | null; autoPlay?: boolean }) {
    const ref = useRef<HTMLAudioElement>(null)
    const [playing, setPlaying] = useState(false)
    const [pos, setPos] = useState(0)
    const [dur, setDur] = useState(seconds || 0)
    const bars = useRef(Array.from({ length: 30 }, (_, i) => 6 + Math.round(Math.abs(Math.sin(i * 1.7 + src.length)) * 16))).current
    const ratio = dur > 0 ? Math.min(1, pos / dur) : 0
    const fg = mine ? '#fff' : '#f97316'
    const bg = mine ? 'rgba(255,255,255,0.4)' : `${colors.border}`
    const toggle = () => { const a = ref.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause() }
    return (
        <div className="flex items-center gap-2.5 w-[250px] max-w-full">
            <audio ref={ref} src={src} preload="metadata" autoPlay={autoPlay}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setPos(0) }}
                onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration) }} />
            <button onClick={toggle} aria-label={playing ? 'Pausar áudio' : 'Ouvir áudio'} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: mine ? '#fff' : '#f97316', color: mine ? '#f97316' : '#fff' }}>
                {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-[2px] h-7">
                    {bars.map((h, i) => (
                        <span key={i} className="w-[3px] rounded-full" style={{ height: h, background: i / bars.length <= ratio ? fg : bg }} />
                    ))}
                </div>
                <p className="text-[10px] font-bold opacity-80">{fmtTime(playing || pos > 0 ? pos : dur)}</p>
            </div>
        </div>
    )
}

/** Áudio normal: pede o link e toca no estilo do WhatsApp. */
export function NormalAudio({ id, mine, colors, seconds }: { id: string; mine: boolean; colors: any; seconds?: number | null }) {
    const { url, failed } = useMediaUrl(id)
    if (failed) return <p className="text-xs italic opacity-80">Áudio indisponível</p>
    if (!url) return <div className="w-[250px] h-11 rounded-full animate-pulse" style={{ background: `${colors.border}55` }} />
    return <AudioBubble src={url} mine={mine} colors={colors} seconds={seconds} />
}

/** Foto, vídeo ou áudio de VISUALIZAÇÃO ÚNICA. Quem recebe abre uma vez (o banco marca); quem envia só vê o estado. */
export function OnceBubble({ m, mine, colors, onOpened, viewedByMe = false }: { m: MediaMessage; mine: boolean; colors: any; onOpened: (id: string) => void; viewedByMe?: boolean }) {
    const kind = m.kind
    const label = KIND_LABEL[kind] || 'Mídia'
    const [state, setState] = useState<'idle' | 'loading' | 'open' | 'used' | 'error'>('idle')
    const [errMsg, setErrMsg] = useState('Não foi possível abrir agora')
    const [url, setUrl] = useState<string | null>(null)
    // visualização única é POR PESSOA: quem já abriu vê "já visualizada"; quem não abriu ainda pode abrir
    const used = state === 'used' || (state === 'idle' && viewedByMe)

    const open = async () => {
        setState('loading')
        const r = await fetch('/api/chat/view-once', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: m.id }) })
        if (r.status === 409) { setState('used'); return }
        const j = r.ok ? await r.json() : null
        if (!j?.url) { setErrMsg(r.status === 503 ? 'Envio de mídia indisponível agora. Tente de novo mais tarde.' : 'Não foi possível abrir agora'); setState('error'); return }
        setUrl(j.url)
        setState('open')
        onOpened(m.id)
    }
    const close = () => { setUrl(null); setState('used') }

    const line = (txt: string) => <p className="flex items-center gap-1.5 text-xs font-bold"><Eye size={14} />{txt}</p>
    if (mine) return line(`${label} de visualização única · ${m.viewed_at ? 'já visualizada' : 'ainda não visualizada'}`)
    if (state === 'error') return line(errMsg)
    if (used) return line(`${label} de visualização única · já ${kind === 'audio' ? 'ouvida' : 'visualizada'}`)
    if (state === 'open' && url && kind === 'audio') return <AudioBubble src={url} mine={false} colors={colors} seconds={m.media_seconds} autoPlay />
    if (state === 'open' && url) {
        return (
            <div className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4" onClick={close}>
                <button onClick={close} aria-label="Fechar" className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white bg-white/15"><X size={20} /></button>
                {kind === 'photo'
                    ? <img src={url} alt="Foto de visualização única" className="max-h-[80vh] max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} onError={() => { setErrMsg("Não deu para mostrar. Esta visualização já foi usada."); setState("error"); setUrl(null) }} />
                    : <video src={url} controls autoPlay playsInline className="max-h-[80vh] max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} onError={() => { setErrMsg("Não deu para tocar. Esta visualização já foi usada."); setState("error"); setUrl(null) }} />}
                <p className="mt-3 text-xs text-white/80">Isto só abre uma vez. Ao fechar, some.</p>
            </div>
        )
    }
    const cta = kind === 'audio' ? 'Ouvir · 1 vez' : kind === 'video' ? 'Ver vídeo · 1 vez' : 'Ver foto · 1 vez'
    return (
        <button onClick={open} disabled={state === 'loading'} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-black" style={{ background: `${colors.accent || '#f97316'}22`, color: colors.textPrimary }}>
            <Eye size={16} style={{ color: '#f97316' }} />
            {state === 'loading' ? 'Abrindo…' : cta}
        </button>
    )
}

/** Localização ao vivo: mapa estático com o pino, horário limite e (para quem envia) parar. */
export function LocationBubble({ m, mine, colors, onStop }: { m: MediaMessage; mine: boolean; colors: any; onStop?: () => void }) {
    const active = isLocationActive(m)
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const lat = m.loc_lat, lng = m.loc_lng
    const expires = m.loc_expires_at ? new Date(m.loc_expires_at) : null
    return (
        <div className="w-[260px] max-w-full">
            {lat != null && lng != null && token ? (
                <img
                    src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+f97316(${lng},${lat})/${lng},${lat},15,0/520x260@2x?access_token=${token}`}
                    alt="Mapa com a localização" className="w-full rounded-xl" />
            ) : (
                <div className="h-32 rounded-xl flex items-center justify-center" style={{ background: `${colors.border}55` }}><MapPin size={22} /></div>
            )}
            <p className="mt-1.5 text-xs font-black flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                {active ? `Localização ao vivo · até ${expires ? hhmm(expires) : ''}` : 'Localização encerrada'}
            </p>
            {m.loc_updated_at && <p className="text-[10px] opacity-70">Atualizada às {hhmm(new Date(m.loc_updated_at))}</p>}
            <div className="flex items-center gap-3 mt-1">
                {lat != null && lng != null && (
                    <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="text-[11px] underline">Abrir no mapa</a>
                )}
                {mine && active && onStop && <button onClick={onStop} className="text-[11px] font-black text-white underline">Parar de compartilhar</button>}
            </div>
        </div>
    )
}

/** Folha de duração: 15 min, 1 h ou até desligar (teto de 8 h no banco). */
export function LocationDurationSheet({ open, onClose, onPick, colors }: { open: boolean; onClose: () => void; onPick: (minutes: number) => void; colors: any }) {
    if (!open) return null
    const opts: { minutes: number; label: string; hint: string }[] = [
        { minutes: 15, label: '15 minutos', hint: 'Para chegar num lugar' },
        { minutes: 60, label: '1 hora', hint: 'Para um encontro' },
        { minutes: 480, label: 'Até eu desligar', hint: 'Dura no máximo 8 horas' },
    ]
    return (
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-end justify-center" onClick={onClose}>
            <div className="w-full max-w-md rounded-t-3xl p-4 pb-8" style={{ background: colors.background, color: colors.textPrimary }} onClick={(e) => e.stopPropagation()}>
                <p className="text-base font-black mb-1">Compartilhar localização ao vivo</p>
                <p className="text-xs opacity-70 mb-3">A pessoa vê onde você está no mapa e atualiza sozinha. Você pode parar a qualquer momento.</p>
                <div className="flex flex-col gap-2">
                    {opts.map((o) => (
                        <button key={o.minutes} onClick={() => onPick(o.minutes)} className="text-left px-4 py-3 rounded-2xl" style={{ background: `${colors.border}40` }}>
                            <p className="text-sm font-black">{o.label}</p>
                            <p className="text-[11px] opacity-70">{o.hint}</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

/** Quem compartilha: manda a posição a cada ~10 s enquanto alguma localização dele está valendo. */
export function useSenderLocation(messages: MediaMessage[], userId: string) {
    const ids = messages.filter((m) => m.sender_id === userId && isLocationActive(m)).map((m) => m.id)
    const key = ids.join(',')
    useEffect(() => {
        if (!key || typeof navigator === 'undefined' || !navigator.geolocation) return
        const list = key.split(',')
        let last = 0
        const watch = navigator.geolocation.watchPosition(
            async (pos) => {
                if (Date.now() - last < 10000) return
                last = Date.now()
                for (const id of list) await supabase.rpc('chat_update_location', { p_msg: id, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude })
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 5000 },
        )
        return () => navigator.geolocation.clearWatch(watch)
    }, [key])
}

/** Quem recebe: relê a localização das mensagens ativas a cada 5 s (o mapa acompanha). */
export function useLocationRefresh(messages: MediaMessage[], onRows: (rows: MediaMessage[]) => void) {
    const ids = messages.filter((m) => isLocationActive(m)).map((m) => m.id)
    const key = ids.join(',')
    useEffect(() => {
        if (!key) return
        const list = key.split(',')
        let alive = true
        const tick = () => {
            supabase.from('direct_messages')
                .select('id, kind, sender_id, viewed_at, loc_lat, loc_lng, loc_updated_at, loc_expires_at, loc_stopped')
                .in('id', list)
                .then(({ data }) => { if (alive && data) onRows(data as MediaMessage[]) })
        }
        const t = setInterval(tick, 5000)
        return () => { alive = false; clearInterval(t) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
}

/** Gravador de áudio do campo de mensagem: toca para começar, toca para enviar, X para cancelar. Para sozinho no limite. */
export function useVoiceRecorder() {
    const [recording, setRecording] = useState(false)
    const [seconds, setSeconds] = useState(0)
    const recRef = useRef<MediaRecorder | null>(null)
    const chunks = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)
    const startedAt = useRef(0)
    const timer = useRef<ReturnType<typeof setInterval> | null>(null)
    const resolver = useRef<((v: { blob: Blob; seconds: number } | null) => void) | null>(null)

    const release = () => {
        if (timer.current) clearInterval(timer.current)
        timer.current = null
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        recRef.current = null
        setRecording(false)
    }
    const stop = () => new Promise<{ blob: Blob; seconds: number } | null>((resolve) => {
        const rec = recRef.current
        if (!rec || rec.state === 'inactive') return resolve(null)
        resolver.current = resolve
        rec.stop()
    })
    const start = async (): Promise<boolean> => {
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
        let stream: MediaStream
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { return false }
        streamRef.current = stream
        const mime = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t))
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
        chunks.current = []
        rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
        rec.onstop = () => {
            const secs = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
            const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })
            const r = resolver.current
            resolver.current = null
            release()
            r?.(blob.size > 0 ? { blob, seconds: secs } : null)
        }
        recRef.current = rec
        startedAt.current = Date.now()
        setSeconds(0)
        rec.start()
        setRecording(true)
        timer.current = setInterval(() => {
            const s = Math.floor((Date.now() - startedAt.current) / 1000)
            setSeconds(s)
            if (s >= CHAT_LIMITS.audio.seconds) void stop()
        }, 250)
        return true
    }
    const cancel = () => {
        const rec = recRef.current
        if (rec && rec.state !== 'inactive') { rec.onstop = null; resolver.current = null; rec.stop() }
        release()
    }
    useEffect(() => () => { cancel() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
    return { recording, seconds, start, stop, cancel }
}
