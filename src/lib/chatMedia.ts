// src/lib/chatMedia.ts
//
// Regras de mídia das conversas (foto, vídeo e áudio). Os números aqui TÊM que bater com o banco:
// upload_kinds (tamanho, tipos e cota) e chat_send_media (duração). Ver supabase/migrations/20261130000136 e ...138.

export type ChatMediaKind = 'photo' | 'video' | 'audio'

export const CHAT_LIMITS = {
    photo: { bytes: 10 * 1024 * 1024, seconds: null as number | null, label: 'foto de até 10 MB' },
    video: { bytes: 25 * 1024 * 1024, seconds: 60, label: 'vídeo de até 25 MB e 1 minuto' },
    audio: { bytes: 5 * 1024 * 1024, seconds: 300, label: 'áudio de até 5 minutos' },
} as const

/** Tipo de envio do R2 (upload_kinds.kind) para cada mídia. Todos no bucket privado do chat (iuser-chat). */
export const CHAT_UPLOAD_KIND: Record<ChatMediaKind, string> = { photo: 'chat_media', video: 'chat_video', audio: 'chat_audio' }

export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime'
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif'

/** Tipo sem o `;codecs=...` (o R2 só aceita o tipo base). */
export function baseMime(type: string): string {
    return String(type || '').split(';')[0].trim().toLowerCase()
}

/** Formato de gravação que o navegador aceita (Chrome/Android: webm; Safari/iOS: mp4). */
export function pickRecorderMime(isSupported: (t: string) => boolean): string | null {
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => isSupported(t)) ?? null
}

/** Duração em segundos de um arquivo de vídeo ou áudio (0 se não der para ler). Vídeo gravado no navegador (WebM) não traz
 *  a duração no cabeçalho: nesse caso o navegador só a descobre depois de "pular" para o fim, e isso é feito aqui. */
export function mediaSeconds(file: Blob, kind: 'video' | 'audio'): Promise<number> {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') return resolve(0)
        const el = document.createElement(kind)
        const url = URL.createObjectURL(file)
        let settled = false
        const done = (v: number) => {
            if (settled) return
            settled = true
            URL.revokeObjectURL(url)
            resolve(Number.isFinite(v) && v > 0 ? v : 0)
        }
        el.preload = 'metadata'
        el.ondurationchange = () => { if (Number.isFinite(el.duration) && el.duration > 0) done(el.duration) }
        el.onloadedmetadata = () => {
            if (Number.isFinite(el.duration) && el.duration > 0) return done(el.duration)
            el.currentTime = 1e101   // pede o fim: o navegador calcula a duração
        }
        el.onerror = () => done(0)
        setTimeout(() => done(el.duration || 0), 5000)
        el.src = url
    })
}

export function fmtTime(sec: number): string {
    const s = Math.max(0, Math.round(sec || 0))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
