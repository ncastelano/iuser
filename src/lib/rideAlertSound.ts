// src/lib/rideAlertSound.ts
// Som curto de alerta (dois tons) gerado na hora com WebAudio — não depende
// de arquivo de áudio. Alguns navegadores só liberam áudio depois de um
// toque do usuário na página; se bloquear, falha em silêncio.
export function playRideAlertSound() {
    if (typeof window === 'undefined') return
    try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        if (!Ctx) return
        const ctx = new Ctx()
        const tone = (freq: number, start: number, duration: number) => {
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
        }
        tone(880, 0, 0.18)
        tone(1175, 0.2, 0.18)
        tone(880, 0.4, 0.18)
        tone(1175, 0.6, 0.28)
        setTimeout(() => ctx.close().catch(() => {}), 1200)
    } catch {
        // sem áudio disponível
    }
}
