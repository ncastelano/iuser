// src/modules/negotiation/domain.ts — regras puras da NEGOCIAÇÃO de corridas e do ganho mínimo por hora do motorista.
// Sem React nem rede; testado em scripts/test-negotiation.mjs (npm run test:negotiation). O banco repete as validações (a tela nunca é a única).
//
// A Tarifa iUser é só a REFERÊNCIA (km). O valor final é o que as DUAS partes aceitaram. O ganho mínimo por hora é PRIVADO do motorista:
// nada daqui que dependa dele pode ser mostrado ao passageiro.

export const MAX_AMOUNT = 100000

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Valor válido para uma oferta (mesma regra do banco): positivo, até R$ 100.000. Devolve a mensagem do problema ou null. */
export function validateAmount(n: number | null | undefined): string | null {
    if (n == null || !Number.isFinite(n)) return 'Digite um valor'
    if (n <= 0) return 'O valor precisa ser maior que zero'
    if (n > MAX_AMOUNT) return 'Valor alto demais'
    return null
}

/** Lê um valor digitado ("12,50", "R$ 12.50", "12") em reais; null se não der para entender */
export function parseMoney(raw: string): number | null {
    const t = raw.replace(/[^\d.,]/g, '')
    if (!t) return null
    // "1.250,50" → 1250.50 ; "12,5" → 12.5 ; "12.5" → 12.5
    const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
    const v = Number(norm)
    return Number.isFinite(v) ? round2(v) : null
}

// ===== TEMPO E GANHO POR HORA =====
/** Tempo total de trabalho = ir buscar o passageiro + a corrida (minutos). Sem folga extra. */
export function totalMinutes(pickupMin: number | null | undefined, tripMin: number | null | undefined): number | null {
    const p = Number.isFinite(pickupMin as number) ? Math.max(0, pickupMin as number) : 0
    const t = Number.isFinite(tripMin as number) ? Math.max(0, tripMin as number) : null
    if (t == null) return null
    const total = p + t
    return total > 0 ? total : null
}

/** Ganho por hora de um valor: valor ÷ tempo total × 60 (contínuo, sem "corridas inteiras por hora") */
export function perHour(amount: number | null | undefined, minutes: number | null | undefined): number | null {
    if (amount == null || !Number.isFinite(amount) || amount <= 0 || !minutes || minutes <= 0) return null
    return round2((amount / minutes) * 60)
}

/** Piso por tempo = (tempo total ÷ 60) × ganho mínimo por hora */
export function hourlyFloor(minutes: number | null | undefined, minHourly: number | null | undefined): number | null {
    if (!minutes || minutes <= 0 || !minHourly || minHourly <= 0) return null
    return round2((minutes / 60) * minHourly)
}

/** Tarifa sugerida ao motorista = o MAIOR entre a tarifa por distância e o piso por tempo (nunca soma). Sem mínimo, fica a tarifa por distância. */
export function suggestedFare(distanceFare: number, floor: number | null): number {
    if (floor == null) return round2(distanceFare)
    return round2(Math.max(distanceFare, floor))
}

// ===== VALOR MÍNIMO DA PLATAFORMA (por minuto de trabalho) =====
/** Padrão: R$ 0,80 por minuto (= R$ 48 por hora). O valor de verdade mora no banco (Admin → Tarifas); este só vale até ele carregar. */
export const DEFAULT_MIN_PER_MINUTE = 0.8
/** Teto padrão do mínimo: R$ 1,00 por minuto. Só o administrador geral eleva o teto (Admin → Tarifas); o banco confere. */
export const DEFAULT_MIN_PER_MINUTE_CAP = 1
/** Teto absoluto do que o admin pode liberar (igual ao CHECK do banco). */
export const MAX_MIN_PER_MINUTE_CAP = 20

/** Confere o mínimo por minuto digitado contra o teto em vigor. Devolve o motivo em português ou null se vale. */
export function minPerMinuteProblem(value: number, cap: number = DEFAULT_MIN_PER_MINUTE_CAP): string | null {
    if (!Number.isFinite(value) || value < 0) return 'Digite um valor de 0 para cima por minuto'
    if (value > cap + 1e-9) return `O mínimo por minuto não pode passar de R$ ${cap.toFixed(2).replace('.', ',')} (o teto só é elevado nas configurações de administrador)`
    return null
}

/** Confere o novo teto contra o mínimo em vigor. */
export function capProblem(cap: number, currentMin: number): string | null {
    if (!Number.isFinite(cap) || cap < 0.01 || cap > MAX_MIN_PER_MINUTE_CAP) return `O teto precisa ficar entre R$ 0,01 e R$ ${MAX_MIN_PER_MINUTE_CAP},00 por minuto`
    if (cap + 1e-9 < currentMin) return `O teto não pode ficar abaixo do mínimo em vigor (R$ ${currentMin.toFixed(2).replace('.', ',')})`
    return null
}

/** Piso de uma corrida: minutos de trabalho (ir buscar + corrida) × o mínimo por minuto, arredondado PARA CIMA em centavos. 0 se não dá para medir ou o mínimo está desligado. */
export function platformFloor(minutes: number | null | undefined, minPerMinute: number | null | undefined): number {
    if (!minutes || minutes <= 0 || !minPerMinute || minPerMinute <= 0) return 0
    return Math.ceil(minutes * minPerMinute * 100 - 1e-9) / 100
}

/** O que decidiu o valor da "Minha tarifa": a conta por km dela mesma, o ganho mínimo por hora do motorista ou o mínimo da plataforma (o MAIOR dos três vale; empate fica com o km). */
export type FareDriver = 'km' | 'hourly' | 'platform'
export function fareDriver(distanceFare: number, hourlyFloorValue: number | null, platformFloorValue: number): FareDriver {
    const km = round2(distanceFare)
    const hourly = hourlyFloorValue != null ? round2(hourlyFloorValue) : 0
    const platform = round2(platformFloorValue)
    if (platform > km && platform >= hourly) return 'platform'
    if (hourly > km) return 'hourly'
    return 'km'
}

/** Frase curta do que segurou a Minha tarifa (vazia quando foi a conta por km, que é a tarifa dele mesmo). */
export function fareDriverText(driver: FareDriver, distanceFare: number, minHourly: number | null, perMinute: number): string {
    const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
    if (driver === 'platform') return `Sua tarifa por km daria ${brl(round2(distanceFare))}, mas o mínimo da plataforma (${brl(perMinute)} por minuto de trabalho) é maior e vale para toda corrida de passageiro.`
    if (driver === 'hourly') return `Sua tarifa por km daria ${brl(round2(distanceFare))}, mas o seu ganho mínimo de ${brl(minHourly ?? 0)} por hora pede mais para esta corrida.`
    return ''
}

// ===== CORRIDA VALORIZADA: o quanto o valor que o passageiro paga passa da Tarifa iUser da MESMA corrida =====
export type ValuationTier = 'none' | 'good' | 'great'
/** de +5% a +19% = "Paga acima do normal"; +20% ou mais = "Corrida valorizada" */
export const VALUATION_GOOD_PCT = 5
export const VALUATION_GREAT_PCT = 20
export function rideValuation(price: number | null | undefined, reference: number | null | undefined): { tier: ValuationTier; pct: number; extra: number } {
    if (price == null || reference == null || !(reference > 0) || !(price > 0)) return { tier: 'none', pct: 0, extra: 0 }
    const pct = Math.round(((price - reference) / reference) * 100)
    const extra = round2(price - reference)
    if (pct >= VALUATION_GREAT_PCT) return { tier: 'great', pct, extra }
    if (pct >= VALUATION_GOOD_PCT) return { tier: 'good', pct, extra }
    return { tier: 'none', pct: Math.max(pct, 0), extra: Math.max(extra, 0) }
}
/** ordem na lista: as mais valorizadas primeiro (a sort estável mantém as mais novas antes dentro do mesmo nível) */
export const valuationRank = (tier: ValuationTier): number => (tier === 'great' ? 2 : tier === 'good' ? 1 : 0)

/** Nenhuma corrida abaixo do piso da plataforma (piso 0 = sem regra) */
export const belowPlatformFloor = (amount: number | null | undefined, floor: number): boolean => floor > 0 && amount != null && amount < floor

/** "O valor mínimo da plataforma para esta corrida é R$ 19,00 (R$ 0,50 por minuto)." */
export function platformFloorText(floor: number, minPerMinute: number): string {
    const m = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
    return `O valor mínimo da plataforma para esta corrida é ${m(floor)} (${m(minPerMinute)} por minuto de trabalho).`
}

/** Está abaixo do mínimo do motorista? (sem mínimo ou sem como medir: não) */
export function belowMinimum(perHourValue: number | null, minHourly: number | null | undefined): boolean {
    return perHourValue != null && minHourly != null && minHourly > 0 && perHourValue < minHourly
}

/** "Esta oferta representa aproximadamente R$ 32/h, abaixo do seu mínimo de R$ 50/h." */
export function belowMinimumText(perHourValue: number, minHourly: number, what = 'oferta'): string {
    const f = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}/h`
    return `Esta ${what} representa aproximadamente ${f(perHourValue)}, abaixo do seu mínimo de ${f(minHourly)}.`
}

export interface HourlyCheck { minutes: number | null; perHour: number | null; minHourly: number | null; protection: 'warn' | 'block'; below: boolean; blocked: boolean; platformMin: number | null; belowPlatform: boolean }
/** A resposta de driver_hourly_check (jsonb do banco) → objeto tipado */
export function parseHourlyCheck(j: Record<string, any> | null | undefined): HourlyCheck | null {
    if (!j || typeof j !== 'object') return null
    const num = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
    return { minutes: num(j.minutes), perHour: num(j.per_hour), minHourly: num(j.min_hourly), protection: j.protection === 'block' ? 'block' : 'warn', below: j.below === true, blocked: j.blocked === true, platformMin: num(j.platform_min), belowPlatform: j.below_platform === true }
}

// ===== VALORES RÁPIDOS E SUGESTÃO DE ACORDO =====
/** Valores rápidos dinâmicos (R$ 1 em R$ 1) em volta de um valor-âncora: -12%, âncora, +12%, +25%. Nunca repete nem devolve zero. */
export function quickValues(anchor: number | null | undefined, opts: { min?: number; max?: number; count?: number } = {}): number[] {
    if (anchor == null || !Number.isFinite(anchor) || anchor <= 0) return []
    const lo = opts.min ?? 1
    const hi = opts.max ?? MAX_AMOUNT
    const raw = [anchor * 0.88, anchor, anchor * 1.12, anchor * 1.25].map((v) => Math.round(v))
    const seen = new Set<number>()
    const out: number[] = []
    for (const v of raw) {
        if (v < lo || v > hi || seen.has(v)) continue
        seen.add(v); out.push(v)
    }
    // âncora pequena: os arredondamentos colapsam; abre de R$ 1 em R$ 1 para sempre haver opções
    let step = 1
    while (out.length < Math.min(3, opts.count ?? 4) && step < 6) {
        for (const v of [Math.round(anchor) + step, Math.round(anchor) - step]) if (v >= lo && v <= hi && !seen.has(v)) { seen.add(v); out.push(v) }
        step++
    }
    return out.sort((a, b) => a - b).slice(0, opts.count ?? 4)
}

/** Sugestão opcional do iUser entre a oferta do passageiro e a proposta do motorista: o meio, em R$ 1. Só olha os dois valores PÚBLICOS da conversa. */
export function midpoint(a: number | null | undefined, b: number | null | undefined): number | null {
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null
    const lo = Math.min(a, b), hi = Math.max(a, b)
    if (hi - lo < 2) return null                 // já estão perto: não precisa de ajuda
    const m = Math.round((lo + hi) / 2)
    return m > lo && m < hi ? m : null
}

// ===== ESTADO DA CONVERSA =====
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'superseded' | 'expired' | 'cancelled'
export interface PriceOffer { id: string; rideId: string; applicationId: string | null; authorRole: 'passenger' | 'driver'; amount: number; status: OfferStatus; expiresAt: string | null; createdAt: string }

export function offerFromRow(r: Record<string, any> | null | undefined): PriceOffer | null {
    if (!r || !r.id || !r.ride_request_id) return null
    const amount = Number(r.amount)
    if (!Number.isFinite(amount) || amount <= 0) return null
    if (r.author_role !== 'passenger' && r.author_role !== 'driver') return null
    const status = (['pending', 'accepted', 'declined', 'superseded', 'expired', 'cancelled'] as const).find((s) => s === r.status)
    if (!status) return null
    return { id: String(r.id), rideId: String(r.ride_request_id), applicationId: r.application_id ? String(r.application_id) : null, authorRole: r.author_role, amount, status, expiresAt: r.expires_at ? String(r.expires_at) : null, createdAt: String(r.created_at || '') }
}

export function secondsLeft(expiresAt: string | null | undefined, now: number = Date.now()): number | null {
    if (!expiresAt) return null
    const t = Date.parse(expiresAt)
    return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : null
}
export const isExpired = (expiresAt: string | null | undefined, now: number = Date.now()) => secondsLeft(expiresAt, now) === 0

/** "2:45" */
export function clock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A proposta aberta mais recente de uma candidatura que ainda vale */
export function currentOffer(offers: PriceOffer[], now: number = Date.now()): PriceOffer | null {
    const open = offers.filter((o) => o.status === 'pending' && !isExpired(o.expiresAt, now)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return open.length ? open[open.length - 1] : null
}

/** De quem é a vez de responder, olhando a proposta aberta: 'driver' | 'passenger' | null (nada aberto) */
export function whoMustRespond(offer: PriceOffer | null): 'driver' | 'passenger' | null {
    if (!offer) return null
    return offer.authorRole === 'passenger' ? 'driver' : 'passenger'
}

export function roundsLeft(offers: PriceOffer[], role: 'passenger' | 'driver', max = 3): number {
    return Math.max(0, max - offers.filter((o) => o.authorRole === role).length)
}

/** Mensagem em português para os erros que as funções do banco devolvem (a dica vem no `hint`) */
export function negotiationError(err: { message?: string; hint?: string | null } | null | undefined): string {
    switch (err?.hint) {
        case 'rounds_exhausted': return 'Você já usou todas as propostas desta negociação.'
        case 'offer_expired': return 'Esta proposta expirou.'
        case 'offer_closed': return 'Esta proposta já foi respondida ou trocada por outra.'
        case 'ride_closed': return 'Esta corrida já foi decidida.'
        case 'application_closed': return 'Esta candidatura não está mais aberta.'
        case 'below_min_hourly': return 'Esse valor está abaixo do seu ganho mínimo por hora.'
        case 'below_platform_min': return err?.message || 'Esse valor está abaixo do mínimo da plataforma para esta corrida.'
        case 'same_as_proposal': return 'Esse é o valor que o motorista já pediu: aceite a proposta.'
        case 'above_proposal': return 'Sua oferta é maior que a proposta do motorista: aceite a proposta.'
        case 'invalid_amount': return 'Valor inválido.'
        default: return err?.message || 'Não foi possível concluir. Tente de novo.'
    }
}
