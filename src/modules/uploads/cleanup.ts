// src/modules/uploads/cleanup.ts — regras PURAS do painel de limpeza de arquivos órfãos (Camada 6): validação das configurações (a mesma na tela e na rota) e textos. Sem React nem rede.
// A regra do que é órfão e quando apagar mora no BANCO (migration 20261130000022); aqui só se valida entrada e se escreve em português o que o banco devolve.

export type CleanupSettings = { enabled: boolean; min_age_days: number; quarantine_days: number; max_per_run: number }
export const CLEANUP_BOUNDS = { min_age_days: [1, 365], quarantine_days: [1, 365], max_per_run: [1, 1000] } as const
export type CleanupField = keyof CleanupSettings
export const CLEANUP_LABEL: Record<CleanupField, string> = {
    enabled: 'Apagar de verdade',
    min_age_days: 'Idade mínima do arquivo',
    quarantine_days: 'Dias marcado antes de apagar',
    max_per_run: 'Máximo apagado por rodada',
}
/** Os nomes que a tela usa → os nomes das colunas do banco. */
export const CLEANUP_DB_FIELD: Record<CleanupField, string> = { enabled: 'cleanup_enabled', min_age_days: 'cleanup_min_age_days', quarantine_days: 'cleanup_quarantine_days', max_per_run: 'cleanup_max_per_run' }
const DB_TO_FIELD = Object.fromEntries(Object.entries(CLEANUP_DB_FIELD).map(([k, v]) => [v, k])) as Record<string, CleanupField>
export const cleanupFieldFromDb = (dbField: string): CleanupField | null => DB_TO_FIELD[dbField] ?? null

export type CleanupErrors = Partial<Record<CleanupField, string>>

/** Corpo recebido pela rota (nomes da tela) → patch com os nomes do banco. Só campos conhecidos, com o tipo certo e dentro dos limites. */
export function validateCleanupPatch(raw: unknown): { ok: true; patch: Record<string, boolean | number> } | { ok: false; errors: CleanupErrors } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: { enabled: 'Alteração inválida.' } }
    const src = raw as Record<string, unknown>
    const errors: CleanupErrors = {}
    const patch: Record<string, boolean | number> = {}
    for (const key of Object.keys(src)) {
        if (!(key in CLEANUP_DB_FIELD)) return { ok: false, errors: { enabled: `Campo não editável: ${key}` } }
        const f = key as CleanupField
        const v = src[key]
        if (f === 'enabled') { if (typeof v !== 'boolean') errors.enabled = 'Use ligado ou desligado.'; else patch[CLEANUP_DB_FIELD.enabled] = v; continue }
        const [lo, hi] = CLEANUP_BOUNDS[f]
        if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) errors[f] = `Use um número inteiro entre ${lo} e ${hi}.`
        else patch[CLEANUP_DB_FIELD[f]] = v
    }
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patch }
}

export type CleanupForm = { min_age_days: string; quarantine_days: string; max_per_run: string }
export const cleanupToForm = (s: CleanupSettings): CleanupForm => ({ min_age_days: String(s.min_age_days), quarantine_days: String(s.quarantine_days), max_per_run: String(s.max_per_run) })

/** Formulário (texto) → só o que mudou, já validado. */
export function cleanupFormToPatch(form: CleanupForm, current: CleanupSettings): { ok: true; patch: Partial<Omit<CleanupSettings, 'enabled'>> } | { ok: false; errors: CleanupErrors } {
    const errors: CleanupErrors = {}
    const out: Partial<Omit<CleanupSettings, 'enabled'>> = {}
    for (const f of ['min_age_days', 'quarantine_days', 'max_per_run'] as const) {
        const t = (form[f] || '').trim()
        const [lo, hi] = CLEANUP_BOUNDS[f]
        if (!/^\d+$/.test(t) || Number(t) < lo || Number(t) > hi) { errors[f] = `Use um número inteiro entre ${lo} e ${hi}.`; continue }
        if (Number(t) !== current[f]) out[f] = Number(t)
    }
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patch: out }
}

export type RunRow = { started_at: string; source: 'cron' | 'admin'; dry_run: boolean; scanned: number; marked: number; cleared: number; due: number; deleted: number; bytes_freed: number; reconciled: number; errors: number; note: string | null }

/** Uma linha por rodada, para o painel. */
export function runSummary(r: RunRow, formatBytes: (n: number) => string): string {
    const parts: string[] = []
    parts.push(r.dry_run ? 'Simulação' : 'Apagou de verdade')
    parts.push(`olhou ${r.scanned}`)
    if (r.marked) parts.push(`marcou ${r.marked}`)
    if (r.cleared) parts.push(`desmarcou ${r.cleared}`)
    parts.push(r.dry_run ? `${r.due} já poderiam ser apagados` : `apagou ${r.deleted} (${formatBytes(r.bytes_freed)})`)
    if (r.reconciled) parts.push(`${r.reconciled} já tinham sumido do armazenamento`)
    if (r.errors) parts.push(`${r.errors} erro(s)`)
    return parts.join(' · ')
}

/** Texto do que falta para um candidato ser apagado. */
export function candidateStatus(c: { keep: boolean; due: boolean; days_left: number | null }): string {
    if (c.keep) return 'Mantido: nunca será apagado'
    if (c.due) return 'Pronto para apagar na próxima rodada'
    const d = c.days_left ?? 0
    return d <= 0 ? 'Termina a quarentena hoje' : `Em quarentena: ${d} ${d === 1 ? 'dia' : 'dias'} para poder apagar`
}

/** Só o nome do arquivo (último pedaço do caminho); nomes longos (id da pessoa + data) mostram o final, que é o que os distingue. */
export const fileLabel = (key: string): string => {
    const n = key.split('/').pop() || key
    return n.length > 30 ? `…${n.slice(-28)}` : n
}
