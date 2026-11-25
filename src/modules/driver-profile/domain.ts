// modules/driver-profile/domain.ts — o VALOR DO BOTÃO "Solicitar corrida" do perfil do motorista (17/11/2026). Regra pura, sem React e sem
// importar a tarifa do app (quem chama resolve a tarifa por km com getEffectivePricing e os extras com computeRideExtras e passa aqui).
// O app lê get_driver_public_quote (migration 20261130000072). O motorista escolhe o modo no Canal do Motorista → Tarifa:
//   platform = Tarifa iUser do veículo (o padrão) · km = a tarifa própria por km · time = a tarifa própria por tempo (R$ por minuto; sem valor
//   próprio vale o ganho mínimo por hora padrão do iUser ÷ 60). Nada fica abaixo do mínimo da plataforma (quem chama aplica platformFloor).
// Testes: scripts/test-driver-profile.mjs (npm run test:driver-profile).
import { effectiveTimeRate, platformFloor } from '../negotiation/domain.ts'

export type QuoteMode = 'platform' | 'km' | 'time'

/** A tarifa por km já resolvida (o mesmo formato de DriverPricing em lib/driverPricing) */
export interface KmShape { baseFee: number; baseDistanceKm: number; pricePerKmAfterBase: number }

export interface DriverQuote {
    mode: QuoteMode
    pricing_mode: 'platform' | 'custom'
    active: boolean
    live: { lat: number; lng: number; at: string } | null
    /** os números crus da tarifa (para getEffectivePricing) */
    row: { pricing_mode: 'platform' | 'custom'; [k: string]: number | null | string }
    price_per_minute: number | null
}

export const QUOTE_MODES: { id: QuoteMode; title: string; desc: string }[] = [
    { id: 'platform', title: 'Tarifa iUser', desc: 'O valor padrão do iUser para o seu veículo.' },
    { id: 'km', title: 'Minha tarifa por km', desc: 'O seu valor inicial e o seu valor por quilômetro.' },
    { id: 'time', title: 'Minha tarifa por tempo', desc: 'O seu valor por minuto de corrida.' },
]

export const quoteModeLabel = (m: QuoteMode): string => QUOTE_MODES.find((x) => x.id === m)!.title
/** O nome do jeito de cobrar visto por quem PEDE a corrida ("Minha tarifa…" é a fala do motorista) */
export const quoteModeClientLabel = (m: QuoteMode): string => (m === 'km' ? 'Tarifa por km' : m === 'time' ? 'Tarifa por tempo' : 'Tarifa iUser')

const ROW_KEYS = ['base_distance_km', 'base_fee', 'price_per_km_after_base', 'price_per_minute', 'extra_fee_pessoa', 'extra_fee_animal', 'extra_fee_objeto', 'extra_fee_condominio', 'extra_fee_compras', 'extra_fee_necessidade_especial', 'extra_fee_pet_sem_caixa', 'extra_fee_entrega_interna', 'extra_fee_ar_condicionado']

export function parseQuote(raw: unknown): DriverQuote | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, any>
    const mode: QuoteMode = r.mode === 'km' || r.mode === 'time' ? r.mode : 'platform'
    const n = (v: unknown) => (v == null || v === '' ? null : Number(v))
    const live = r.live && r.live.lat != null && r.live.lng != null ? { lat: Number(r.live.lat), lng: Number(r.live.lng), at: String(r.live.at) } : null
    const row: DriverQuote['row'] = { pricing_mode: mode === 'km' ? 'custom' : 'platform' }
    for (const k of ROW_KEYS) row[k] = n(r[k])
    return { mode, pricing_mode: r.pricing_mode === 'custom' ? 'custom' : 'platform', active: !!r.active, live, row, price_per_minute: n(r.price_per_minute) }
}

/** O R$ por minuto do modo "tempo": o do motorista, nunca abaixo do ganho mínimo padrão do iUser (hourly ÷ 60) */
export const quoteTimeRate = (q: DriverQuote, defaultHourly: number): number | null => effectiveTimeRate(q.price_per_minute, defaultHourly)

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * O valor da corrida no modo escolhido (sem o piso da plataforma). `shape` = a tarifa por km que vale no modo (resolvida por quem chama com
 * getEffectivePricing(q.row, veículo)); `extras` = os extras da corrida nessa tarifa. km/platform precisam da distância; time, dos minutos.
 */
export function quotePrice(q: DriverQuote, shape: KmShape, trip: { km: number | null; minutes: number | null }, defaultHourly: number, extras = 0): number | null {
    if (q.mode === 'time') {
        const rate = quoteTimeRate(q, defaultHourly)
        if (!trip.minutes || !(trip.minutes > 0) || !rate) return null
        return r2(trip.minutes * rate + Math.max(0, extras))
    }
    if (trip.km == null || !(trip.km >= 0)) return null
    return r2(shape.baseFee + Math.max(0, trip.km - shape.baseDistanceKm) * shape.pricePerKmAfterBase + Math.max(0, extras))
}

/**
 * Exemplos para a página: 3, 5 e 10 km (km/Tarifa iUser) ou 10, 20 e 30 minutos (tempo). Cada exemplo respeita o PISO da plataforma
 * (R$ 40/h de trabalho, R$ 8 de corrida e R$ 2 por km) — por isso a conta sai do mesmo platformFloor de todo o app.
 */
export function quoteExamples(q: DriverQuote, shape: KmShape, defaultHourly: number, minPerMinute: number | null = null, minFare?: number): { label: string; price: number }[] {
    const floorFor = (km: number | null, minutes: number | null) => platformFloor(minutes, minPerMinute, minFare, km)
    if (q.mode === 'time') return [10, 20, 30].map((m) => ({ label: `${m} min`, price: Math.max(quotePrice(q, shape, { km: null, minutes: m }, defaultHourly) ?? 0, floorFor(null, m)) }))
    return [3, 5, 10].map((km) => ({ label: `${km} km`, price: Math.max(quotePrice(q, shape, { km, minutes: null }, defaultHourly) ?? 0, floorFor(km, null)) }))
}

/** A frase curta de como ele cobra ("R$ 7,00 até 3 km + R$ 2,00 por km", "R$ 0,67 por minuto…") */
export function quoteRule(q: DriverQuote, shape: KmShape, defaultHourly: number): string {
    const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`
    if (q.mode === 'time') {
        const rate = quoteTimeRate(q, defaultHourly)
        return rate ? `${brl(rate)} por minuto de corrida (≈ ${brl(rate * 60)} por hora)` : 'Por minuto de corrida'
    }
    return `${brl(shape.baseFee)} até ${shape.baseDistanceKm} km${shape.pricePerKmAfterBase > 0 ? ` + ${brl(shape.pricePerKmAfterBase)} por km` : ''}`
}

/**
 * Quanto tempo o motorista está de quem vê a página (17/11/2026): linha reta × 1,3 (as ruas não são retas) a ~30 km/h na cidade, a mesma
 * conta das entregas. Só com as duas posições; a do motorista já é a APROXIMADA (~330 m), então o texto diz "cerca de".
 */
export function etaFromViewer(viewer: { lat: number; lng: number } | null, driver: { lat: number; lng: number } | null): { km: number; minutes: number } | null {
    if (!viewer || !driver) return null
    const R = 6371, rad = (d: number) => (d * Math.PI) / 180
    const h = Math.sin(rad(driver.lat - viewer.lat) / 2) ** 2 + Math.cos(rad(viewer.lat)) * Math.cos(rad(driver.lat)) * Math.sin(rad(driver.lng - viewer.lng) / 2) ** 2
    const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 1.3
    if (km > 300) return null   // longe demais para dizer "minutos"
    return { km: Math.round(km * 10) / 10, minutes: Math.max(1, Math.round((km / 30) * 60)) }
}

/** "Cerca de 6 min de você · 2,4 km" (ou "pertinho de você" a menos de 2 min) */
export function etaText(e: { km: number; minutes: number }): string {
    const km = e.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    if (e.minutes <= 2) return `Pertinho de você · ${km} km`
    return e.minutes < 60 ? `Cerca de ${e.minutes} min de você · ${km} km` : `Cerca de ${Math.floor(e.minutes / 60)} h ${e.minutes % 60 ? `${e.minutes % 60} min ` : ''}de você · ${km} km`
}
