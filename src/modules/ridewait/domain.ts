// src/modules/ridewait/domain.ts — ESPERAS NA CORRIDA (embarque, paradas, desembarque). Regras puras, sem rede nem React.
// A conta de verdade (o valor que vale) é do BANCO (migration 20261130000042: _wait_fee_cents); aqui está a MESMA conta só para o relógio e o valor
// subirem ao vivo na tela entre uma leitura e outra. O valor inicial (R$ 3,00, que já cobre os primeiros 3 min), o valor por minuto depois disso (R$ 0,60) e o limite são SEMPRE do iUser (Admin → Tarifas) e cobrados DEPOIS, junto com a corrida.
// Testado em scripts/test-ridewait.mjs (npm run test:ridewait).

export type WaitKind = 'pickup' | 'stop' | 'dropoff'
export type WaitStatus = 'requested' | 'active' | 'ended' | 'declined' | 'cancelled'

export interface RideWait {
    id: string
    kind: WaitKind
    note: string | null
    status: WaitStatus
    requestedBy: string
    requestedAt: string
    startedAt: string | null
    endedAt: string | null
    /** congelados quando o motorista aprovou: o valor inicial (já inclui os primeiros minutos), o valor por minuto depois deles e o limite */
    baseCents: number | null
    rateCents: number | null
    /** o valor do iUser dessa espera (o teto do desconto do motorista): igual a baseCents/rateCents quando não há desconto */
    listBaseCents: number | null
    listRateCents: number | null
    /** por que terminou: left_spot (o carro saiu do local), ride_started (o embarque acabou), ride_finished; vazio = alguém tocou em terminar */
    endedReason?: string | null
    graceSeconds: number | null
    maxSeconds: number | null
    seconds: number | null
    feeCents: number | null
}

export interface RideWaitsView {
    /** diferença entre o relógio do servidor e o do aparelho (ms), para os dois relógios baterem */
    offsetMs: number
    /** as regras vigentes agora (valem para a PRÓXIMA espera aprovada) */
    baseCents: number
    rateCents: number
    graceSeconds: number
    maxSeconds: number
    waits: RideWait[]
}

export const WAIT_KIND_LABEL: Record<WaitKind, string> = { pickup: 'Embarque', stop: 'Parada', dropoff: 'Desembarque' }
export const WAIT_NOTE_MAX = 80

/** Valor da espera em centavos: JÁ vale o valor inicial ao começar (R$ 3,00), que cobre os primeiros minutos (`graceSeconds`); depois deles, o valor por minuto proporcional aos segundos (igual ao banco). */
export function waitFeeCents(seconds: number, graceSeconds: number, rateCents: number, baseCents = 0): number {
    const s = Math.max(0, Math.floor(seconds || 0))
    const g = Math.max(0, Math.floor(graceSeconds || 0))
    const base = Math.max(0, Math.round(baseCents || 0))
    if (s <= g) return base
    return base + Math.round(((s - g) * Math.max(0, rateCents || 0)) / 60)
}

/** Segundos de uma espera agora (em andamento: até agora, sempre no relógio do servidor), nunca além do limite congelado */
export function waitSeconds(w: RideWait, nowMs: number, offsetMs = 0): number {
    if (w.status === 'active' && w.startedAt) {
        const s = Math.floor((nowMs + offsetMs - Date.parse(w.startedAt)) / 1000)
        return Math.min(Math.max(s, 0), w.maxSeconds ?? 7200)
    }
    return w.seconds ?? 0
}

/** Valor da espera agora, em centavos (em andamento: ao vivo; fechada: o valor gravado; pedida/recusada/cancelada: 0) */
export function waitFeeNow(w: RideWait, nowMs: number, offsetMs = 0): number {
    if (w.status === 'active') return waitFeeCents(waitSeconds(w, nowMs, offsetMs), w.graceSeconds ?? 0, w.rateCents ?? 0, w.baseCents ?? 0)
    if (w.status === 'ended') return w.feeCents ?? 0
    return 0
}

/** Soma de todas as esperas da corrida (cada uma com os seus minutos grátis) */
export function totalWaitCents(waits: RideWait[], nowMs: number, offsetMs = 0): number {
    return waits.reduce((sum, w) => sum + waitFeeNow(w, nowMs, offsetMs), 0)
}

/** A espera que ainda está aberta (pedida ou em andamento); só existe uma por corrida */
export const openWait = (waits: RideWait[]): RideWait | null => waits.find((w) => w.status === 'requested' || w.status === 'active') ?? null

/** Quais esperas o passageiro pode pedir agora: embarque antes de a corrida começar; parada e desembarque depois */
export const kindsForPhase = (rideStarted: boolean): WaitKind[] => (rideStarted ? ['stop', 'dropoff'] : ['pickup'])

/** 7:05 → "7:05"; 75 → "1:15"; passa de 1 h → "1:02:03" */
export function clock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds || 0))
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    const two = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}

export const centsToBrl = (cents: number): string => `R$ ${(Math.max(0, cents || 0) / 100).toFixed(2).replace('.', ',')}`

/** Quanto falta dos minutos que o valor inicial já cobre (0 = já está passando disso: cobrando por minuto) */
export const graceLeft = (seconds: number, graceSeconds: number): number => Math.max(0, graceSeconds - seconds)

/** "Cada espera vale R$ 3,00 (já cobre os primeiros 3 min); depois, R$ 0,60 por minuto. Cobrado depois, junto com a corrida." */
export function ruleText(graceSeconds: number, rateCents: number, baseCents = 0): string {
    const g = Math.round(graceSeconds / 60)
    const head = baseCents > 0
        ? `Cada espera vale ${centsToBrl(baseCents)}${g > 0 ? ` (já cobre os primeiros ${g} min)` : ''}; depois, `
        : g > 0 ? `Os primeiros ${g} min de cada espera são grátis; depois ` : 'Cada espera é cobrada: '
    return `${head}${centsToBrl(rateCents)} por minuto. Cobrado depois, junto com a corrida.`
}

/** Linha do histórico: "Parada · 8 min 00 s · R$ 2,50 (comprar água)" */
export function waitLine(w: RideWait, nowMs: number, offsetMs = 0): string {
    const s = waitSeconds(w, nowMs, offsetMs)
    const base = `${WAIT_KIND_LABEL[w.kind]} · ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s · ${centsToBrl(waitFeeNow(w, nowMs, offsetMs))}`
    const why = w.endedReason === 'left_spot' ? ' · terminou sozinha: o carro saiu do local' : w.endedReason === 'ride_started' ? ' · terminou ao começar a corrida' : ''
    return (w.note ? `${base} (${w.note})` : base) + why
}

/** Nota digitada: sem espaços nas pontas e até 80 caracteres (o banco confere de novo) */
export const cleanNote = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim().slice(0, WAIT_NOTE_MAX)
    return t || null
}

/** Resposta de get_ride_waits → o que a tela usa. Sem resposta (null) = a pessoa não é parte da corrida. */
export function viewFromJson(j: any, deviceNowMs = Date.now()): RideWaitsView | null {
    if (!j || !Array.isArray(j.waits)) return null
    const num = (v: any): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v))
    return {
        offsetMs: j.now ? Date.parse(j.now) - deviceNowMs : 0,
        baseCents: Number(j.base_cents) || 0,
        rateCents: Number(j.rate_cents) || 0,
        graceSeconds: Number(j.grace_seconds) || 0,
        maxSeconds: Number(j.max_seconds) || 7200,
        waits: j.waits.map((w: any): RideWait => ({
            id: w.id, kind: w.kind, note: w.note ?? null, status: w.status, requestedBy: w.requested_by, requestedAt: w.requested_at,
            startedAt: w.started_at ?? null, endedAt: w.ended_at ?? null,
            baseCents: num(w.base_cents), rateCents: num(w.rate_cents), listBaseCents: num(w.list_base_cents), listRateCents: num(w.list_rate_cents), endedReason: w.ended_reason ?? null, graceSeconds: num(w.grace_seconds), maxSeconds: num(w.max_seconds), seconds: num(w.seconds), feeCents: num(w.fee_cents),
        })),
    }
}

/** Mensagens em português para os erros do banco (pela dica `hint`) */
export function waitError(err: { message?: string; hint?: string | null } | null | undefined): string {
    const map: Record<string, string> = {
        not_passenger: 'Só quem pediu a corrida pode pedir tempo de espera.',
        not_driver: 'Só o motorista da corrida pode aprovar a espera.',
        ride_not_active: 'A corrida não está em andamento.',
        not_for_deliveries: 'Entrega de loja não tem tempo de espera.',
        wrong_phase: 'Esse tipo de espera não vale nesta etapa da corrida.',
        wait_already_open: 'Já existe uma espera aberta nesta corrida.',
        too_many_waits: 'Esta corrida já teve muitos pedidos de espera.',
        already_answered: 'Esse pedido já foi respondido.',
        wait_not_active: 'O desconto vale só enquanto a espera está em andamento.',
        above_ceiling: 'O valor inicial pode ter desconto, mas não passar do valor do iUser.',
        below_floor: 'O valor por minuto não pode ficar abaixo do mínimo do iUser.',
        invalid_amount: 'Digite valores válidos.',
    }
    return (err?.hint && map[err.hint]) || err?.message || 'Não deu certo. Tente de novo.'
}

/** valor inicial (R$), minutos que ele já cobre, valor por minuto depois deles (R$) e limite de uma espera */
export interface WaitSettings { baseFee: number; ratePerMinute: number; graceMinutes: number; maxMinutes: number }
export const DEFAULT_WAIT_SETTINGS: WaitSettings = { baseFee: 3, ratePerMinute: 0.6, graceMinutes: 3, maxMinutes: 120 }

/** Valida as regras de espera que o admin digita (o banco confere de novo). null = tudo certo. */
export function waitSettingsProblem(v: WaitSettings): string | null {
    if (![v.baseFee, v.ratePerMinute, v.graceMinutes, v.maxMinutes].every((n) => Number.isFinite(n))) return 'Preencha os quatro campos com números.'
    if (v.baseFee < 0 || v.baseFee > 100) return 'O valor inicial da espera fica entre R$ 0,00 e R$ 100,00.'
    if (v.ratePerMinute < 0 || v.ratePerMinute > 20) return 'O valor da espera fica entre R$ 0,00 e R$ 20,00 por minuto.'
    if (!Number.isInteger(v.graceMinutes) || v.graceMinutes < 0 || v.graceMinutes > 30) return 'Os minutos já cobertos pelo valor inicial ficam entre 0 e 30 (número inteiro).'
    if (!Number.isInteger(v.maxMinutes) || v.maxMinutes < 5 || v.maxMinutes > 480) return 'O limite de uma espera fica entre 5 e 480 minutos (número inteiro).'
    return null
}

/** Quanto uma espera de N minutos custa com estas regras (para o admin ver o efeito: "10 min de espera = R$ 3,50") */
export const exampleWaitCents = (minutes: number, v: WaitSettings): number => waitFeeCents(minutes * 60, v.graceMinutes * 60, Math.round(v.ratePerMinute * 100), Math.round(v.baseFee * 100))

export function settingsFromJson(j: any): WaitSettings {
    const n = (x: any, d: number) => (x != null && Number.isFinite(Number(x)) ? Number(x) : d)
    return { baseFee: n(j?.base_fee, DEFAULT_WAIT_SETTINGS.baseFee), ratePerMinute: n(j?.rate_per_minute, DEFAULT_WAIT_SETTINGS.ratePerMinute), graceMinutes: n(j?.grace_minutes, DEFAULT_WAIT_SETTINGS.graceMinutes), maxMinutes: n(j?.max_minutes, DEFAULT_WAIT_SETTINGS.maxMinutes) }
}

// ===== VALOR DA ESPERA AJUSTADO PELO MOTORISTA =====
// O valor INICIAL pode ganhar desconto (nunca passa do valor do iUser). O valor POR MINUTO nunca fica abaixo do mínimo do iUser (R$ 0,60): o motorista pode pôr o SEU, acima dele (até R$ 20,00).
export const MAX_WAIT_RATE_CENTS = 2000
/** Esta espera tem desconto no valor inicial? */
export const hasDiscount = (w: RideWait): boolean => w.listBaseCents != null && (w.baseCents ?? 0) < w.listBaseCents
/** Esta espera usa um valor por minuto do motorista (acima do mínimo do iUser)? */
export const hasOwnRate = (w: RideWait): boolean => w.listRateCents != null && (w.rateCents ?? 0) > w.listRateCents

/** "3,00" / "3.5" / "R$ 0,6" → centavos (null se não é um valor) */
export function parseCents(text: string): number | null {
    const t = String(text ?? '').replace(/[^\d.,]/g, '').replace(',', '.')
    if (!t || Number.isNaN(Number(t))) return null
    return Math.round(Number(t) * 100)
}

/** Confere o que o motorista digitou: inicial até o do iUser (desconto), por minuto do mínimo do iUser até R$ 20; devolve o motivo em português ou null se vale */
export function discountProblem(baseCents: number | null, rateCents: number | null, listBaseCents: number, listRateCents: number): string | null {
    if (baseCents == null || rateCents == null) return 'Digite os dois valores.'
    if (baseCents < 0 || rateCents < 0) return 'Os valores não podem ser negativos.'
    if (baseCents > listBaseCents) return `O valor inicial pode ter desconto, mas não passar de ${centsToBrl(listBaseCents)} (o do iUser).`
    if (rateCents < listRateCents) return `O valor por minuto não pode ficar abaixo de ${centsToBrl(listRateCents)} (o mínimo do iUser).`
    if (rateCents > MAX_WAIT_RATE_CENTS) return `O valor por minuto fica entre ${centsToBrl(listRateCents)} e ${centsToBrl(MAX_WAIT_RATE_CENTS)}.`
    return null
}

/** "Valor inicial R$ 3,00 (cobre 3 min) · R$ 0,60 por minuto" */
export function ruleLine(w: Pick<RideWait, 'baseCents' | 'rateCents' | 'graceSeconds'>): string {
    const g = Math.round((w.graceSeconds ?? 0) / 60)
    return `Valor inicial ${centsToBrl(w.baseCents ?? 0)}${g > 0 ? ` (cobre ${g} min)` : ''} · ${centsToBrl(w.rateCents ?? 0)} por minuto`
}
