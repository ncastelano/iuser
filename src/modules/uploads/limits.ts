// src/modules/uploads/limits.ts — o "MEU ESPAÇO": as regras de tamanho de cada tipo de envio e quanto a pessoa já usou. Sem React nem rede; testado em scripts/test-my-space.mjs.
// Quem manda e quem recusa é o banco (authorize_upload); aqui só se escreve em português o que ele já decide, para a pessoa saber ANTES de enviar.
import { formatBytes } from '../../lib/uploadLimits.ts'

export interface UploadLimit {
    kind: string
    label: string
    bucket: string
    provider: string
    enabled: boolean
    maxBytes: number
    perHourFiles: number | null
    perDayBytes: number | null
    perUserBytes: number | null
    usedBytes: number
    usedFiles: number
    usedDayBytes: number
    /** o tipo foi pausado pela VÁLVULA (espaço/banda do servidor perto do limite), não por um admin */
    paused: boolean
}

/** Linha do banco (get_my_upload_limits) → objeto do app */
export function limitFromRow(r: Record<string, any>): UploadLimit {
    const n = (v: any) => (v == null ? null : Number(v))
    return {
        kind: r.kind, label: r.label, bucket: r.bucket, provider: r.provider, enabled: !!r.enabled, maxBytes: Number(r.max_bytes) || 0,
        perHourFiles: n(r.per_hour_files), perDayBytes: n(r.per_day_bytes), perUserBytes: n(r.per_user_bytes),
        usedBytes: Number(r.used_bytes) || 0, usedFiles: Number(r.used_files) || 0, usedDayBytes: Number(r.used_day_bytes) || 0, paused: !!r.paused,
    }
}

/** "até 25 MB por arquivo · 20 por hora · 200 MB por dia · 500 MB no total" */
export function ruleText(l: Pick<UploadLimit, 'maxBytes' | 'perHourFiles' | 'perDayBytes' | 'perUserBytes'>): string {
    const parts = [`até ${formatBytes(l.maxBytes)} por arquivo`]
    if (l.perHourFiles) parts.push(`${l.perHourFiles} por hora`)
    if (l.perDayBytes) parts.push(`${formatBytes(l.perDayBytes)} por dia`)
    if (l.perUserBytes) parts.push(`${formatBytes(l.perUserBytes)} no total`)
    return parts.join(' · ')
}

/** Percentual usado (0 a 100, inteiro; 0 se não há limite) */
export function percentUsed(used: number, limit: number | null): number {
    if (!limit || limit <= 0) return 0
    return Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
}

export type SpaceTone = 'ok' | 'warn' | 'full'
/** Cor da barra: verde até 80%, amarelo de 80% a 99%, vermelho cheio */
export function spaceTone(pct: number): SpaceTone { return pct >= 100 ? 'full' : pct >= 80 ? 'warn' : 'ok' }

/** Quanto ainda cabe agora: o menor entre o que sobra no total da pessoa e o que sobra no dia (e nunca mais que o tamanho máximo do arquivo) */
export function roomLeftBytes(l: Pick<UploadLimit, 'maxBytes' | 'perDayBytes' | 'perUserBytes' | 'usedBytes' | 'usedDayBytes'>): number {
    const total = l.perUserBytes ? l.perUserBytes - l.usedBytes : Infinity
    const day = l.perDayBytes ? l.perDayBytes - l.usedDayBytes : Infinity
    return Math.max(0, Math.min(total, day, l.maxBytes))
}

/** Antes de enviar: mensagem em português se o arquivo não cabe (ou null se pode). O banco confere de novo. */
export function checkFitsLimit(l: UploadLimit | null | undefined, size: number, what = 'arquivo'): string | null {
    if (!l) return null
    if (!l.enabled) return l.paused ? `O envio de ${l.label.toLowerCase()} está pausado: o servidor está com o espaço quase cheio. Tente de novo mais tarde.` : `O envio de ${l.label.toLowerCase()} está desligado no momento.`
    if (size > l.maxBytes) return `Este ${what} tem ${formatBytes(size)} e o limite é ${formatBytes(l.maxBytes)} por arquivo.`
    if (l.perUserBytes && l.usedBytes + size > l.perUserBytes) return `Seu espaço de ${l.label.toLowerCase()} está cheio (${formatBytes(l.usedBytes)} de ${formatBytes(l.perUserBytes)}). Apague algo antes de enviar.`
    if (l.perDayBytes && l.usedDayBytes + size > l.perDayBytes) return `Você já enviou ${formatBytes(l.usedDayBytes)} de ${formatBytes(l.perDayBytes)} hoje. Tente de novo amanhã.`
    return null
}

/** Estimativa de banda dos programas (Admin): GB com 1 casa decimal */
export function gbText(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024)
    return gb >= 1 ? `${gb.toFixed(1).replace('.', ',')} GB` : formatBytes(bytes)
}
