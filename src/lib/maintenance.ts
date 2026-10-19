// Modo "iUser em manutenção": quando o Supabase passa a responder 402 (cota do plano estourada = projeto restringido) ou fica fora do ar,
// o site continua abrindo (a Vercel é independente), mas sem login nem dados. Em vez de telas vazias/quebradas, mostramos um aviso
// (MaintenanceBanner no site todo; MaintenanceCard nas telas de login/cadastro). O estado vive neste módulo (um por aba) e em
// sessionStorage por alguns minutos (sobrevive a recarregar a página). Volta ao normal sozinho: o aviso testa o Supabase de tempos em
// tempos (probeSupabase) e limpa quando ele responde de novo. `?manutencao=1` / `?manutencao=0` na URL liga/desliga o aviso só para
// conferir o visual, sem precisar de uma queda de verdade.
const KEY = 'iuser_maintenance_until'
const TTL_MS = 10 * 60 * 1000

let flagged = false
let loaded = false
const listeners = new Set<() => void>()

function storage(): Storage | null {
    try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null }
}
function load() {
    if (loaded) return
    loaded = true
    const until = Number(storage()?.getItem(KEY) || 0)
    flagged = until > Date.now()
}
function emit() { listeners.forEach((l) => { try { l() } catch { /* um ouvinte com erro não derruba os outros */ } }) }

/** `?manutencao=1` na URL = aviso forçado (conferir o visual): nenhum teste de saúde pode desligá-lo. */
export function maintenanceForcedByUrl(): boolean {
    try { return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('manutencao') === '1' } catch { return false }
}

export function getMaintenance(): boolean {
    load()
    return flagged
}

export function reportMaintenance() {
    load()
    try { storage()?.setItem(KEY, String(Date.now() + TTL_MS)) } catch { /* sem storage: vale só nesta aba */ }
    if (!flagged) { flagged = true; emit() }
}

export function clearMaintenance(force = false) {
    load()
    if (!force && maintenanceForcedByUrl()) return // aviso forçado pela URL (conferir o visual): nenhuma resposta boa do Supabase o desliga
    try { storage()?.removeItem(KEY) } catch { /* ignora */ }
    if (flagged) { flagged = false; emit() }
}

export function subscribeMaintenance(cb: () => void): () => void {
    listeners.add(cb)
    return () => { listeners.delete(cb) }
}

/** Pergunta ao Supabase se ele está respondendo (rota de saúde do Auth, que não gasta banco). 402 liga o aviso; resposta boa desliga. */
export async function probeSupabase(): Promise<void> {
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    if (!base || !key || typeof fetch === 'undefined') return
    try {
        const res = await fetch(`${base}/auth/v1/health`, { headers: { apikey: key }, cache: 'no-store' })
        if (res.status === 402) reportMaintenance()
        else if (res.ok) clearMaintenance()
    } catch {
        // sem rede do usuário: não é problema do Supabase, não mexe no aviso
    }
}
