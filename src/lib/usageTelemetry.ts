// lib/usageTelemetry.ts
//
// Contador próprio de Egress e Realtime Messages, já que o Supabase não
// expõe esses números por API pública (ver painel Financeiro > Supabase).
// Acumula localmente no navegador e manda pro banco de tempos em tempos
// via a função track_usage (RPC) — nunca um request por chamada, isso
// geraria tráfego (e Egress!) demais.
let egressBytesBuffer = 0
let realtimeMessagesBuffer = 0
let flushTimer: ReturnType<typeof setInterval> | null = null

const FLUSH_INTERVAL_MS = 20000

export function trackEgressBytes(bytes: number) {
    if (!bytes || bytes <= 0) return
    egressBytesBuffer += bytes
    ensureFlushLoop()
}

export function trackRealtimeMessage() {
    realtimeMessagesBuffer += 1
    ensureFlushLoop()
}

function ensureFlushLoop() {
    if (flushTimer || typeof window === 'undefined') return
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)
    // "hidden" dispara ao trocar de aba/minimizar, não só ao fechar — dá
    // uma chance a mais de mandar antes da aba sumir de vez. sendBeacon não
    // dá pra usar aqui porque não permite mandar os headers que o
    // PostgREST exige (apikey/Authorization), só o corpo.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush()
    })
}

async function flush() {
    if (egressBytesBuffer <= 0 && realtimeMessagesBuffer <= 0) return
    const egress = egressBytesBuffer
    const realtime = realtimeMessagesBuffer
    egressBytesBuffer = 0
    realtimeMessagesBuffer = 0

    try {
        // Import dinâmico pra evitar ciclo (client.ts importa este arquivo).
        const { supabase } = await import('@/lib/supabase/client')
        await supabase.rpc('track_usage', { p_egress_bytes: egress, p_realtime_messages: realtime })
    } catch {
        // Perde essa leva de telemetria — não é crítico, e não deve travar nada.
    }
}

