// src/modules/uploads/admin.ts — regras PURAS do painel Admin → Uploads: edição de limites (formulário ↔ valores), validação, bloqueios e rótulos. A MESMA validação roda na tela e na rota
// /api/admin/uploads (e o banco ainda tem os CHECKs), então não existe um caminho que aceite o que o outro recusa. Sem React nem rede; imports relativos com .ts (rodam nos testes de Node).
import { MB } from '../../lib/uploadLimits.ts'

/** Os limites de um tipo que o admin pode mexer (espelha upload_kinds). null = sem limite. */
export type KindLimits = {
    enabled: boolean
    requires_plan: boolean
    max_bytes: number
    per_hour_files: number | null
    per_day_bytes: number | null
    per_user_bytes: number | null
    grant_minutes: number
}

/** O que a pessoa digita: texto, em MB para tamanhos (vazio = sem limite, onde permitido). */
export type KindForm = { enabled: boolean; requires_plan: boolean; max_mb: string; per_hour_files: string; per_day_mb: string; per_user_mb: string; grant_minutes: string }

export const LIMIT_FIELDS = ['enabled', 'requires_plan', 'max_bytes', 'per_hour_files', 'per_day_bytes', 'per_user_bytes', 'grant_minutes'] as const
export type LimitField = (typeof LIMIT_FIELDS)[number]
export const FIELD_LABEL: Record<LimitField, string> = {
    enabled: 'Tipo ligado',
    requires_plan: 'Exige plano ativo',
    max_bytes: 'Tamanho máximo do arquivo',
    per_hour_files: 'Arquivos por hora',
    per_day_bytes: 'Envio por dia',
    per_user_bytes: 'Espaço total por pessoa',
    grant_minutes: 'Validade da autorização',
}
const MAX_FILE_MB = 10 * 1024   // 10 GB: acima disso é erro de digitação

const nf = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
export const mbText = (bytes: number | null): string => (bytes == null ? '' : nf(bytes / MB))

/** Tamanho em MB digitado ("5", "1,5", "0.5") → bytes; '' → null; qualquer outra coisa → 'invalid'. */
export function parseMegabytes(text: string): number | null | 'invalid' {
    const t = (text || '').trim().replace(',', '.')
    if (t === '') return null
    if (!/^\d+(\.\d+)?$/.test(t)) return 'invalid'
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? Math.round(n * MB) : 'invalid'
}
/** Número inteiro positivo digitado; '' → null; outra coisa → 'invalid'. */
export function parseCount(text: string): number | null | 'invalid' {
    const t = (text || '').trim()
    if (t === '') return null
    return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : 'invalid'
}

export function kindToForm(k: KindLimits): KindForm {
    return { enabled: k.enabled, requires_plan: k.requires_plan, max_mb: mbText(k.max_bytes), per_hour_files: k.per_hour_files == null ? '' : String(k.per_hour_files), per_day_mb: mbText(k.per_day_bytes), per_user_mb: mbText(k.per_user_bytes), grant_minutes: String(k.grant_minutes) }
}

export type LimitErrors = Partial<Record<LimitField, string>>

/** Coerência dos valores finais (números). Vale para tela e servidor. */
export function checkLimits(l: KindLimits): LimitErrors {
    const e: LimitErrors = {}
    if (!Number.isFinite(l.max_bytes) || l.max_bytes <= 0) e.max_bytes = 'Informe o tamanho máximo do arquivo (maior que zero).'
    else if (l.max_bytes > MAX_FILE_MB * MB) e.max_bytes = 'Tamanho máximo acima de 10 GB: confira o valor.'
    if (l.per_hour_files != null && (!Number.isInteger(l.per_hour_files) || l.per_hour_files <= 0)) e.per_hour_files = 'Use um número inteiro maior que zero (ou deixe vazio para sem limite).'
    if (l.per_day_bytes != null && (!Number.isFinite(l.per_day_bytes) || l.per_day_bytes <= 0)) e.per_day_bytes = 'Use um valor maior que zero (ou deixe vazio para sem limite).'
    if (l.per_user_bytes != null && (!Number.isFinite(l.per_user_bytes) || l.per_user_bytes <= 0)) e.per_user_bytes = 'Use um valor maior que zero (ou deixe vazio para sem limite).'
    if (!Number.isInteger(l.grant_minutes) || l.grant_minutes < 1 || l.grant_minutes > 240) e.grant_minutes = 'A validade deve ficar entre 1 e 240 minutos.'
    if (!e.max_bytes && !e.per_day_bytes && l.per_day_bytes != null && l.per_day_bytes < l.max_bytes) e.per_day_bytes = 'O limite do dia precisa caber ao menos um arquivo do tamanho máximo.'
    if (!e.per_day_bytes && !e.per_user_bytes && l.per_day_bytes != null && l.per_user_bytes != null && l.per_user_bytes < l.per_day_bytes) e.per_user_bytes = 'O espaço total precisa ser ao menos o limite do dia.'
    if (!e.max_bytes && !e.per_user_bytes && l.per_day_bytes == null && l.per_user_bytes != null && l.per_user_bytes < l.max_bytes) e.per_user_bytes = 'O espaço total precisa caber ao menos um arquivo do tamanho máximo.'
    return e
}

/** Formulário → só o que MUDOU (o que a rota manda). Erros por campo se algo não vale. */
export function formToPatch(form: KindForm, current: KindLimits): { ok: true; patch: Partial<KindLimits> } | { ok: false; errors: LimitErrors } {
    const errors: LimitErrors = {}
    const max = parseMegabytes(form.max_mb)
    const perHour = parseCount(form.per_hour_files)
    const perDay = parseMegabytes(form.per_day_mb)
    const perUser = parseMegabytes(form.per_user_mb)
    const minutes = parseCount(form.grant_minutes)
    if (max === 'invalid' || max === null) errors.max_bytes = 'Informe o tamanho máximo do arquivo em MB (ex.: 5 ou 1,5).'
    if (perHour === 'invalid') errors.per_hour_files = 'Use um número inteiro maior que zero (ou deixe vazio para sem limite).'
    if (perDay === 'invalid') errors.per_day_bytes = 'Use MB, ex.: 50 ou 1,5 (ou deixe vazio para sem limite).'
    if (perUser === 'invalid') errors.per_user_bytes = 'Use MB, ex.: 200 (ou deixe vazio para sem limite).'
    if (minutes === 'invalid' || minutes === null) errors.grant_minutes = 'A validade deve ficar entre 1 e 240 minutos.'
    if (Object.keys(errors).length) return { ok: false, errors }
    const next: KindLimits = { enabled: form.enabled, requires_plan: form.requires_plan, max_bytes: max as number, per_hour_files: perHour as number | null, per_day_bytes: perDay as number | null, per_user_bytes: perUser as number | null, grant_minutes: minutes as number }
    const bad = checkLimits(next)
    if (Object.keys(bad).length) return { ok: false, errors: bad }
    return { ok: true, patch: diffLimits(current, next) }
}

/** Só os campos que mudaram. */
export function diffLimits(a: KindLimits, b: KindLimits): Partial<KindLimits> {
    const out: Record<string, unknown> = {}
    for (const f of LIMIT_FIELDS) if (a[f] !== b[f]) out[f] = b[f]
    return out as Partial<KindLimits>
}

/** Servidor: confere o que veio no corpo (tipos e campos permitidos), junta com o que está no banco e valida o resultado. */
export function validatePatch(raw: unknown, current: KindLimits): { ok: true; patch: Partial<KindLimits> } | { ok: false; errors: LimitErrors } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: { max_bytes: 'Alteração inválida.' } }
    const src = raw as Record<string, unknown>
    const errors: LimitErrors = {}
    const patch: Record<string, unknown> = {}
    for (const key of Object.keys(src)) {
        if (!(LIMIT_FIELDS as readonly string[]).includes(key)) return { ok: false, errors: { max_bytes: `Campo não editável: ${key}` } }
        const v = src[key]
        if (key === 'enabled' || key === 'requires_plan') { if (typeof v !== 'boolean') errors[key] = 'Use verdadeiro ou falso.'; else patch[key] = v }
        else if (key === 'max_bytes' || key === 'grant_minutes') { if (typeof v !== 'number' || !Number.isFinite(v)) errors[key as LimitField] = 'Valor numérico obrigatório.'; else patch[key] = v }
        else { if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) errors[key as LimitField] = 'Use um número ou vazio (sem limite).'; else patch[key] = v }
    }
    if (Object.keys(errors).length) return { ok: false, errors }
    const bad = checkLimits({ ...current, ...(patch as Partial<KindLimits>) })
    if (Object.keys(bad).length) return { ok: false, errors: bad }
    return { ok: true, patch: patch as Partial<KindLimits> }
}

/** Texto de um valor de limite ("sem limite", "5 MB", "20 por hora"...). */
export function limitText(field: LimitField, value: unknown): string {
    if (typeof value === 'boolean') return value ? 'sim' : 'não'
    if (value == null) return 'sem limite'
    const n = Number(value)
    if (field === 'per_hour_files') return `${n} por hora`
    if (field === 'grant_minutes') return `${n} min`
    return n >= 1024 * MB ? `${nf(n / (1024 * MB))} GB` : `${nf(n / MB)} MB`
}

// ===== bloqueios =====
export const BLOCK_DURATIONS = [
    { hours: 1, label: '1 hora' },
    { hours: 24, label: '24 horas' },
    { hours: 24 * 7, label: '7 dias' },
    { hours: 24 * 30, label: '30 dias' },
    { hours: null, label: 'Até eu liberar' },
] as const

export type BlockInput = { profile_id?: string | null; kind?: string | null; hours?: number | null; reason?: string | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateBlock(b: BlockInput): { ok: true; value: { profile_id: string | null; kind: string | null; hours: number | null; reason: string | null } } | { ok: false; error: string } {
    const profile = b.profile_id ? String(b.profile_id) : null
    const kind = b.kind ? String(b.kind) : null
    if (profile && !UUID.test(profile)) return { ok: false, error: 'Pessoa inválida.' }
    if (kind && !/^[a-z][a-z0-9_]{1,40}$/.test(kind)) return { ok: false, error: 'Tipo inválido.' }
    if (!profile && !kind) return { ok: false, error: 'Escolha a pessoa, o tipo, ou os dois.' }
    const hours = b.hours == null ? null : Number(b.hours)
    if (hours != null && (!Number.isInteger(hours) || hours < 1 || hours > 24 * 365)) return { ok: false, error: 'A duração deve ser de 1 hora a 1 ano (ou até liberar).' }
    const reason = (b.reason || '').trim()
    if (reason.length > 300) return { ok: false, error: 'O motivo pode ter até 300 caracteres.' }
    return { ok: true, value: { profile_id: profile, kind, hours, reason: reason || null } }
}

// ===== recusas =====
/** Texto do motivo de uma recusa (os códigos de authorize_upload). */
export const DENIAL_LABEL: Record<string, string> = {
    kind_disabled: 'Tipo desligado',
    wrong_provider: 'Provedor ainda não disponível',
    account_blocked: 'Conta bloqueada',
    blocked: 'Bloqueado pelo admin',
    type_not_allowed: 'Formato não aceito',
    empty_file: 'Arquivo vazio',
    too_large: 'Arquivo grande demais',
    invalid_path: 'Nome de arquivo inválido',
    wrong_folder: 'Pasta de outra pessoa',
    not_owner: 'Arquivo de outra pessoa',
    plan_required: 'Exige plano ativo',
    rate_limited: 'Passou do ritmo por hora',
    daily_quota: 'Passou da cota do dia',
    storage_quota: 'Passou do espaço total',
}
export const denialLabel = (code: string): string => DENIAL_LABEL[code] || code

/** Quais motivos indicam ABUSO provável (e não só erro de uso): destacados no painel. */
export const ABUSE_CODES = new Set(['rate_limited', 'daily_quota', 'storage_quota', 'blocked', 'wrong_folder', 'not_owner', 'invalid_path'])

// ===== alertas da cota do Supabase =====
export type Meter = { label: string; used: number; included: number; unit: string }
export function meterPct(m: Meter): number { return m.included > 0 ? (m.used / m.included) * 100 : 0 }
export function meterTone(pct: number): 'ok' | 'warn' | 'danger' { return pct >= 90 ? 'danger' : pct >= 80 ? 'warn' : 'ok' }
