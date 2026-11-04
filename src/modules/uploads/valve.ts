// src/modules/uploads/valve.ts — a VÁLVULA DE SEGURANÇA dos uploads: regras puras (limiares, estágios, validação do formulário, textos). Sem React nem rede; testado em scripts/test-upload-valve.mjs.
// Quem mede e desliga de verdade é o banco (upload_valve_tick, a cada 10 min, migration 20261130000032). Aqui só se valida o que o admin digita e se descreve o que o banco devolve.
import { formatBytes } from '../../lib/uploadLimits.ts'

export const VALVE_DEFAULTS = { trip_pct: 80, critical_pct: 95, resume_pct: 65, storage_quota_gb: 1, egress_quota_gb: 5, cycle_day: 13 } as const

export interface ValveSettings {
    enabled: boolean; trip_pct: number; critical_pct: number; resume_pct: number; storage_quota_gb: number; egress_quota_gb: number; cycle_day: number
    egress_manual_gb: number | null; egress_manual_cycle: string | null; override_until: string | null
    tripped_at: string | null; tripped_stage: number | null; tripped_reason: 'storage' | 'egress' | null
    last_eval_at: string | null; last_storage_pct: number | null; last_egress_pct: number | null
}
export interface ValveMeasure {
    cycle_start: string; storage_bytes: number; storage_quota_bytes: number; storage_quota_source: 'valve' | 'financeiro'; storage_pct: number
    egress_bytes: number; egress_quota_bytes: number; egress_quota_source: 'valve' | 'financeiro'; egress_pct: number; egress_parts: { telemetry: number; downloads: number; manual: number }
}
export interface ValveKind { kind: string; label: string; stage: 1 | 2 | null; enabled: boolean; paused: boolean; paused_at: string | null }
export interface ValveEvent { id: number; at: string; action: 'trip' | 'escalate' | 'resume' | 'override' | 'off'; stage: number | null; reason: string | null; storage_pct: number | null; egress_pct: number | null; kinds: string[] }
export interface ValveStatus { settings: ValveSettings; measure: ValveMeasure; kinds: ValveKind[]; events: ValveEvent[] }

export type ValveLevel = 'ok' | 'warn' | 'trip' | 'critical'
/** Cor/estado de um percentual: ok até 10 pontos antes do disparo, "atenção" daí até o disparo, "disparo" até o crítico e "crítico" dali em diante */
export function valveLevel(pct: number, s: Pick<ValveSettings, 'trip_pct' | 'critical_pct'>): ValveLevel {
    if (pct >= s.critical_pct) return 'critical'
    if (pct >= s.trip_pct) return 'trip'
    if (pct >= s.trip_pct - 10) return 'warn'
    return 'ok'
}
export const LEVEL_COLOR: Record<ValveLevel, string> = { ok: '#22c55e', warn: '#f59e0b', trip: '#ef4444', critical: '#b91c1c' }

export type ValveState = 'off' | 'watching' | 'override' | 'tripped'
export function valveState(s: Pick<ValveSettings, 'enabled' | 'override_until' | 'tripped_at'>, now = Date.now()): ValveState {
    if (!s.enabled) return 'off'
    if (s.override_until && new Date(s.override_until).getTime() > now) return 'override'
    return s.tripped_at ? 'tripped' : 'watching'
}
export const STATE_LABEL: Record<ValveState, string> = { off: 'Desligada (só mede)', watching: 'Ligada e vigiando', override: 'Liberada por um tempo', tripped: 'DISPARADA' }
export const STAGE_LABEL: Record<number, string> = { 1: 'Estágio 1 — digital (música, programa, curso/arquivos) e R2', 2: 'Estágio 2 — também o Flash' }
export const REASON_LABEL: Record<string, string> = { storage: 'armazenamento', egress: 'banda de download', manual: 'liberação manual', valve_off: 'válvula desligada' }

/** Uma linha do histórico em português */
export function eventText(e: Pick<ValveEvent, 'action' | 'stage' | 'reason' | 'storage_pct' | 'egress_pct' | 'kinds'>): string {
    const pct = `armazenamento ${e.storage_pct ?? '?'}% · banda ${e.egress_pct ?? '?'}%`
    const kinds = e.kinds.length ? ` (${e.kinds.join(', ')})` : ''
    switch (e.action) {
        case 'trip': return `Disparou o estágio ${e.stage} por ${REASON_LABEL[e.reason || ''] || e.reason}: ${pct}${kinds}`
        case 'escalate': return `Subiu para o estágio ${e.stage} por ${REASON_LABEL[e.reason || ''] || e.reason}: ${pct}${kinds}`
        case 'resume': return `Religou o que tinha desligado: ${pct}${kinds}`
        case 'override': return `Liberada à mão: religou${kinds || ' (nada estava desligado)'} e não dispara até o prazo`
        default: return `Válvula desligada: religou${kinds}`
    }
}

// ------------------------------------------------------------------ formulário do admin
export interface ValveForm { trip_pct: string; critical_pct: string; resume_pct: string; storage_quota_gb: string; egress_quota_gb: string; cycle_day: string; egress_manual_gb: string }
export const valveToForm = (s: ValveSettings, manualActive: boolean): ValveForm => ({
    trip_pct: String(s.trip_pct), critical_pct: String(s.critical_pct), resume_pct: String(s.resume_pct), storage_quota_gb: String(s.storage_quota_gb), egress_quota_gb: String(s.egress_quota_gb),
    cycle_day: String(s.cycle_day), egress_manual_gb: manualActive && s.egress_manual_gb != null ? String(s.egress_manual_gb) : '',
})
export type ValveErrors = Partial<Record<keyof ValveForm, string>>
export const VALVE_FIELD_LABEL: Record<keyof ValveForm, string> = {
    trip_pct: 'Desligar a partir de (%)', critical_pct: 'Desligar também o Flash a partir de (%)', resume_pct: 'Religar quando cair a (%)', storage_quota_gb: 'Cota de armazenamento (GB)',
    egress_quota_gb: 'Cota de banda por ciclo (GB)', cycle_day: 'Dia em que o ciclo do Supabase vira', egress_manual_gb: 'Banda já usada neste ciclo, do painel do Supabase (GB)',
}

/** O que mudou no formulário, validado (e a ordem religar < desligar < crítico conferida no conjunto). Banda manual vazia = apagar. */
export function valveFormToPatch(form: ValveForm, current: ValveSettings, manualActive: boolean): { ok: true; patch: Record<string, number | null> } | { ok: false; errors: ValveErrors } {
    const errors: ValveErrors = {}
    const out: Record<string, number | null> = {}
    const num = (t: string) => (t.trim() === '' ? NaN : Number(t.trim().replace(',', '.')))
    const intIn = (k: 'trip_pct' | 'critical_pct' | 'resume_pct' | 'cycle_day', lo: number, hi: number) => {
        const n = num(form[k])
        if (!Number.isInteger(n) || n < lo || n > hi) { errors[k] = `Use um número inteiro entre ${lo} e ${hi}.`; return }
        if (n !== current[k]) out[k] = n
    }
    intIn('trip_pct', 50, 99); intIn('critical_pct', 60, 100); intIn('resume_pct', 10, 95); intIn('cycle_day', 1, 28)
    for (const k of ['storage_quota_gb', 'egress_quota_gb'] as const) {
        const n = num(form[k])
        if (!Number.isFinite(n) || n <= 0 || n > 100000) errors[k] = 'Use um número maior que zero.'
        else if (n !== current[k]) out[k] = n
    }
    const t = form.egress_manual_gb.trim()
    if (t === '') { if (manualActive && current.egress_manual_gb != null) out.egress_manual_gb = null }
    else { const n = num(t); if (!Number.isFinite(n) || n < 0 || n > 100000) errors.egress_manual_gb = 'Use um número de 0 para cima.'; else if (!manualActive || n !== current.egress_manual_gb) out.egress_manual_gb = n }
    const trip = Number(form.trip_pct), crit = Number(form.critical_pct), res = Number(form.resume_pct)
    if (!errors.trip_pct && !errors.critical_pct && !errors.resume_pct && !(res < trip && trip < crit)) errors.resume_pct = 'A ordem é: religar < desligar < crítico (ex.: 65 < 80 < 95).'
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patch: out }
}

/** Corpo recebido pela rota → patch validado (só campos conhecidos, tipos certos). O banco confere a ordem dos limiares de novo. */
export function validateValvePatch(raw: unknown): { ok: true; patch: Record<string, boolean | number | null> } | { ok: false; error: string } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Alteração inválida.' }
    const src = raw as Record<string, unknown>, patch: Record<string, boolean | number | null> = {}
    const ranges: Record<string, [number, number, boolean]> = { trip_pct: [50, 99, true], critical_pct: [60, 100, true], resume_pct: [10, 95, true], cycle_day: [1, 28, true], storage_quota_gb: [0.0001, 100000, false], egress_quota_gb: [0.0001, 100000, false], egress_manual_gb: [0, 100000, false] }
    for (const k of Object.keys(src)) {
        const v = src[k]
        if (k === 'enabled') { if (typeof v !== 'boolean') return { ok: false, error: 'Use ligado ou desligado.' }; patch.enabled = v; continue }
        const r = ranges[k]
        if (!r) return { ok: false, error: `Campo não editável: ${k}` }
        if (k === 'egress_manual_gb' && v === null) { patch[k] = null; continue }
        if (typeof v !== 'number' || !Number.isFinite(v) || v < r[0] || v > r[1] || (r[2] && !Number.isInteger(v))) return { ok: false, error: `Valor inválido em ${k}.` }
        patch[k] = v
    }
    return Object.keys(patch).length ? { ok: true, patch } : { ok: false, error: 'Nada para alterar.' }
}

/** "3,2 GB de 5 GB" */
export const usedOfText = (used: number, quota: number) => `${formatBytes(used)} de ${formatBytes(quota)}`
