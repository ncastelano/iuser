// src/modules/deliveries/domain.ts — regras puras da CENTRAL DE ENTREGAS do motorista iUser (entregas de loja): o que cabe na mochila, em que etapa está
// a saída, a melhor ordem de entrega, sugestões de combo (várias entregas perto uma da outra), o que cobrar, o que ganha e os links para navegar.
// Sem React nem rede; testado em scripts/test-deliveries.mjs (npm run test:deliveries). A regra da capacidade em si mora no banco (guard_ride_applications_insert).

export interface LatLng { lat: number; lng: number }

/** Uma entrega de loja já aceita por este motorista (ride_requests com order_id) */
export interface ActiveDelivery {
    id: string
    orderId: string
    storeName: string
    storeAddress: string
    store: LatLng | null
    customerName: string
    address: string
    to: LatLng | null
    items: string
    price: number
    km: number | null
    /** volume que a entrega ocupa na mochila (calculado no banco a partir dos produtos) e quantos itens leva */
    units: number
    itemsCount: number
    paymentMethod: string | null
    cashChangeFor: number | null
    enRoute: boolean
    arrived: boolean
    started: boolean
    /** o motorista tocou "Estou no local": o cliente foi avisado de que ele está na porta */
    atDoor: boolean
    /** estado do pedido na loja (`preparing` | `ready`...): a tela mostra "Pronto ✓" ou "Em preparo…" antes do código de retirada; null = ainda não carregou */
    orderStatus: string | null
}

/** Oferta de entrega mais velha que isso não aparece mais para o motorista: o pedido já esfriou (a loja continua vendo "sem motorista") */
export const OFFER_MAX_AGE_MIN = 90

/** Frases PRONTAS do motorista para o cliente durante a entrega (o texto completo mora no banco: _delivery_msg_text). `issue`: também avisa a loja. */
export const DRIVER_QUICK: { code: string; label: string; issue?: boolean }[] = [
    { code: 'at_gate', label: 'Estou em frente' },
    { code: 'cant_find', label: 'Não acho o endereço', issue: true },
    { code: 'no_answer', label: 'Ninguém atende', issue: true },
    { code: 'late', label: 'Vou atrasar um pouco' },
]

/** Uma entrega aberta (ainda sem motorista), vista por quem está no raio */
export interface DeliveryOffer {
    id: string
    orderId: string
    storeName: string
    storeAddress: string
    store: LatLng | null
    address: string
    to: LatLng | null
    items: string
    price: number
    km: number | null
    units: number
    itemsCount: number
    createdAt: string
}

export function haversineKm(a: LatLng, b: LatLng): number {
    const R = 6371, rad = (d: number) => (d * Math.PI) / 180
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Quanto da mochila está ocupado */
export function capacityState(active: number, capacity: number) {
    const cap = Math.max(1, capacity)
    return { used: active, capacity: cap, left: Math.max(0, cap - active), full: active >= cap, ratio: Math.min(1, active / cap) }
}

/** Quanto da mochila está ocupado em VOLUME (unidades). `capacity` null = o motorista não limitou por volume. */
export function unitsState(activeUnits: number, capacity: number | null) {
    if (capacity == null || capacity <= 0) return { used: activeUnits, capacity: null as number | null, left: Infinity, full: false, ratio: 0 }
    return { used: activeUnits, capacity, left: Math.max(0, capacity - activeUnits), full: activeUnits >= capacity, ratio: Math.min(1, activeUnits / capacity) }
}
/** Cabe mais esta entrega (em volume)? */
export const fitsUnits = (activeUnits: number, offerUnits: number, capacity: number | null) => capacity == null || activeUnits + offerUnits <= capacity + 1e-9
/** "6 itens · 2,5 un." */
export function loadLabel(itemsCount: number, units: number): string {
    const u = Number.isInteger(units) ? String(units) : units.toFixed(2).replace(/0$/, '').replace('.', ',')
    return `${itemsCount} ${itemsCount === 1 ? 'item' : 'itens'} · ${u} un.`
}

export type DeliveryPhase = 'idle' | 'accepted' | 'to_store' | 'at_store' | 'delivering'
/** Em que etapa está a saída: aceitou → foi para a loja → chegou → pegou os pedidos → entregando */
export function phaseOf(active: Pick<ActiveDelivery, 'enRoute' | 'arrived' | 'started'>[]): DeliveryPhase {
    if (active.length === 0) return 'idle'
    if (active.some((d) => d.started)) return 'delivering'
    if (active.every((d) => d.arrived)) return 'at_store'
    if (active.some((d) => d.enRoute)) return 'to_store'
    return 'accepted'
}

export const PHASE_LABEL: Record<DeliveryPhase, string> = {
    idle: 'Livre', accepted: 'Aceitou — vá até a loja', to_store: 'A caminho da loja', at_store: 'Na loja — pegue os pedidos', delivering: 'Entregando',
}

/** Ordem de entrega: sempre a mais perto do ponto atual (começa na loja). Entrega sem coordenada vai para o fim. */
export function routeOrder<T extends { to: LatLng | null }>(from: LatLng | null, stops: T[]): T[] {
    const withPos = stops.filter((s) => s.to), without = stops.filter((s) => !s.to)
    const out: T[] = []
    let here = from
    const left = [...withPos]
    while (left.length) {
        let best = 0
        if (here) {
            let d = Infinity
            left.forEach((s, i) => { const x = haversineKm(here as LatLng, s.to as LatLng); if (x < d) { d = x; best = i } })
        }
        const [next] = left.splice(best, 1)
        out.push(next)
        here = next.to
    }
    return [...out, ...without]
}

/** Distância (km, em linha reta) de uma rota que sai de `from` e passa pelas paradas na ordem */
export function routeKm(from: LatLng | null, stops: { to: LatLng | null }[]): number {
    let km = 0, here = from
    for (const s of stops) { if (here && s.to) km += haversineKm(here, s.to); if (s.to) here = s.to }
    return km
}

/** Tempo estimado de moto na cidade (~28 km/h), em minutos */
export const etaMinutes = (km: number, kmh = 28) => Math.max(1, Math.round((km * 1.3 / kmh) * 60))

export interface BatchSuggestion { offers: DeliveryOffer[]; total: number; km: number; perKm: number }

/** COMBOS: junta entregas abertas que saem da mesma loja e terminam perto umas das outras, até o que cabe na mochila. Devolve os melhores (mais ganho por km). */
export function suggestBatches(offers: DeliveryOffer[], spaceLeft: number, reachKm = 3.5, max = 3, unitsLeft = Infinity): BatchSuggestion[] {
    if (spaceLeft < 1 || offers.length === 0) return []
    offers = offers.filter((o) => o.units <= unitsLeft + 1e-9)   // nenhuma sugestão que a mochila não comporte
    const seen = new Set<string>()
    const out: BatchSuggestion[] = []
    for (const seed of offers) {
        const group = [seed]
        if (seed.to) {
            let usedUnits = seed.units
            for (const o of [...offers].filter((x) => x.id !== seed.id && x.to && x.storeName === seed.storeName).sort((a, b) => haversineKm(seed.to as LatLng, a.to as LatLng) - haversineKm(seed.to as LatLng, b.to as LatLng))) {
                if (group.length >= spaceLeft) break
                if (usedUnits + o.units > unitsLeft + 1e-9) continue   // não cabe em volume: pula para a próxima
                if (haversineKm(seed.to, o.to as LatLng) <= reachKm) { group.push(o); usedUnits += o.units }
            }
        }
        const key = group.map((g) => g.id).sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        const ordered = routeOrder(seed.store, group)
        const km = routeKm(seed.store, ordered)
        const total = group.reduce((a, o) => a + o.price, 0)
        out.push({ offers: ordered, total, km, perKm: km > 0 ? total / km : total })
    }
    return out.sort((a, b) => b.offers.length - a.offers.length || b.perKm - a.perKm).slice(0, max)
}

/** Só as entregas dentro do raio do motorista (a partir da posição dele) */
export function withinRadius(offers: DeliveryOffer[], pos: LatLng | null, radiusKm: number | null): DeliveryOffer[] {
    if (!pos || !radiusKm) return offers
    return offers.filter((o) => !o.store || haversineKm(pos, o.store) <= radiusKm)
}

export interface PaymentRecap { label: string; collect: boolean; note: string | null }
/** O que o motorista faz com o dinheiro na porta: pago online (nada), cartão (levar a máquina) ou dinheiro (troco) */
export function paymentRecap(method: string | null, cashChangeFor: number | null): PaymentRecap {
    if (method === 'dinheiro' || method === 'money') return { label: 'Dinheiro na entrega', collect: true, note: cashChangeFor ? `Cliente paga com R$ ${cashChangeFor.toFixed(2).replace('.', ',')} — leve o troco` : 'Leve troco' }
    if (method === 'cartao' || method === 'credit_card') return { label: 'Cartão na entrega', collect: true, note: 'Leve a maquininha' }
    if (method === 'pix') return { label: 'Pix — já pago', collect: false, note: null }
    return { label: 'Pagamento combinado', collect: false, note: null }
}

export const wazeUrl = (p: LatLng) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
export const mapsUrl = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`

export const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "Rua X, 123, Bairro, Cidade" → "Rua X, 123 · Bairro" (curto, para listas) */
export function shortAddress(a: string | null | undefined): string {
    if (!a) return '—'
    const p = a.split(',').map((x) => x.trim()).filter(Boolean)
    if (p.length >= 3) return `${p[0]}, ${p[1]} · ${p[2]}`
    return p.slice(0, 2).join(', ')
}

/** Resumo do que há no pedido: "2x Pizza X, 1x Coca" → ["2x Pizza X", "1x Coca"] */
export function itemsList(description: string | null | undefined): string[] {
    const d = (description || '').replace(/^Pedido da loja [^:]+:\s*/i, '')
    return d.split(/,\s+(?=\d+x\s)/).map((s) => s.trim()).filter(Boolean)
}

export function earnings(rides: { price: number }[]): number {
    return rides.reduce((a, r) => a + (Number(r.price) || 0), 0)
}
