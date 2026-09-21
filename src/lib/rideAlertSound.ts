// src/lib/rideAlertSound.ts
// Sons de notificação do iUser, gerados na hora com WebAudio — não dependem de
// arquivo de áudio. Alguns navegadores só liberam áudio depois de um toque do
// usuário na página; se bloquear, falha em silêncio.
//
// Um som padrão (identidade do iUser) e variações curtas por tipo de evento:
//   new_ride    corrida nova disponível (motorista)         — 4 tons, mais insistente
//   arrived     motorista chegou ao local (passageiro)      — três notas subindo
//   approaching motorista chegando / com o objeto (cliente) — dois toques suaves
//   completed   fim da corrida (motorista e passageiro)     — arpejo de sucesso
//   default     qualquer outro aviso                        — dois tons
export type NotificationSoundKind = 'default' | 'new_ride' | 'arrived' | 'approaching' | 'completed'

const PATTERNS: Record<NotificationSoundKind, { freq: number; start: number; duration: number }[]> = {
    default: [
        { freq: 880, start: 0, duration: 0.18 },
        { freq: 1175, start: 0.2, duration: 0.24 },
    ],
    new_ride: [
        { freq: 880, start: 0, duration: 0.18 },
        { freq: 1175, start: 0.2, duration: 0.18 },
        { freq: 880, start: 0.4, duration: 0.18 },
        { freq: 1175, start: 0.6, duration: 0.28 },
    ],
    arrived: [
        { freq: 784, start: 0, duration: 0.16 },
        { freq: 988, start: 0.18, duration: 0.16 },
        { freq: 1319, start: 0.36, duration: 0.34 },
    ],
    approaching: [
        { freq: 988, start: 0, duration: 0.14 },
        { freq: 988, start: 0.22, duration: 0.14 },
        { freq: 1319, start: 0.44, duration: 0.22 },
    ],
    completed: [
        { freq: 523, start: 0, duration: 0.14 },
        { freq: 659, start: 0.15, duration: 0.14 },
        { freq: 784, start: 0.3, duration: 0.14 },
        { freq: 1047, start: 0.45, duration: 0.4 },
    ],
}

export function playNotificationSound(kind: NotificationSoundKind = 'default') {
    if (typeof window === 'undefined') return
    try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        if (!Ctx) return
        const ctx = new Ctx()
        const pattern = PATTERNS[kind] || PATTERNS.default
        let end = 0
        for (const { freq, start, duration } of pattern) {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = 'sine'
            osc.frequency.value = freq
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
            gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration)
            osc.connect(gain).connect(ctx.destination)
            osc.start(ctx.currentTime + start)
            osc.stop(ctx.currentTime + start + duration + 0.05)
            end = Math.max(end, start + duration)
        }
        setTimeout(() => ctx.close().catch(() => {}), (end + 0.4) * 1000)
    } catch {
        // sem áudio disponível
    }
}

// Compatibilidade: o alerta de corrida nova (usado em aceitar-corridas e no painel).
export function playRideAlertSound() {
    playNotificationSound('new_ride')
}
