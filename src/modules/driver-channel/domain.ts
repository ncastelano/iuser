// CANAL DO MOTORISTA — o cartão compacto da home da 3.0: cada corrida aberta vira um "tile" com o VALOR, o TEMPO e a DISTÂNCIA (o que quem
// pensa em dirigir quer ver de relance). Regra pura e testada (npm run test:driver-channel); quem fala com o banco é load.ts.
// O VALOR é o MESMO do card de /aceitar-corridas: load.ts faz a conta de lib/rideQuote (rota do mapa, deslocamento até a partida,
// Minha tarifa, piso por hora e mínimo da plataforma) e aqui só se monta o tile e se decide o tipo (valorizada/corrida/entrega).
import { perHour, rideValuation } from '../negotiation/domain.ts'


export interface OfferRow {
    id: string
    ride_type: string | null
    vehicle_type: string | null
    origin_address: string | null
    destination_address: string | null
    distance_km: number | null
    duration_min: number | null
    offered_price: number | null
    passenger_offer: number | null
    order_id: string | null
    created_at: string
}

export type TileKind = 'valorizada' | 'corrida' | 'entrega'
export interface ChannelTile {
    id: string
    kind: TileKind
    value: number
    /** "a partir de": a Tarifa iUser sem o deslocamento até a partida */
    approx: boolean
    minutes: number | null
    km: number | null
    perHour: number | null
    route: string
    vehicle: string
    href: string
}

const VEHICLE: Record<string, string> = { carro: 'Carro', van: 'Van', 'van-grande': 'Van grande', moto: 'Moto', bicicleta: 'Bicicleta', qualquer: 'Qualquer veículo' }

/** "Rua X, Bairro" → "Bairro" (o lugar público da oferta é rua + bairro; o bairro diz mais de relance) */
export function shortPlace(addr: string | null | undefined): string {
    const parts = (addr || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return '—'
    const last = parts[parts.length - 1]
    return (parts.length > 1 && !/^\d/.test(last) ? last : parts[0]).slice(0, 28)
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** o que a conta de /aceitar-corridas (lib/rideQuote) devolveu para esta corrida — o cartão mostra exatamente isso */
export interface TileQuote {
    /** o valor destacado: oferta do passageiro, frete da loja, Minha tarifa (se o motorista usa a dele) ou a Tarifa iUser (+ deslocamento) */
    price: number
    /** a Tarifa iUser da mesma corrida (com o deslocamento): a base da "valorizada" */
    platform: number
    /** a oferta do passageiro é o valor destacado */
    fromPassenger: boolean
    /** "a partir de": Tarifa iUser sem o deslocamento até a partida (sem a posição de quem dirige) */
    approx: boolean
    /** km e minutos da corrida (partida → chegada) que o card de /aceitar-corridas mostra */
    tripKm: number | null
    tripMin: number | null
    /** minutos de trabalho (ir buscar + corrida); null = sem a posição de quem dirige */
    totalMin: number | null
}

export function tileOf(r: OfferRow, q: TileQuote): ChannelTile {
    const vehicle = r.vehicle_type || 'carro'
    const isDelivery = !!r.order_id
    // a mesma regra do card de /aceitar-corridas: só a oferta do PASSAGEIRO 20% acima da Tarifa iUser é "valorizada"
    const kind: TileKind = isDelivery ? 'entrega' : q.fromPassenger && rideValuation(q.price, q.platform).tier === 'great' ? 'valorizada' : 'corrida'
    return {
        id: r.id, kind, value: round2(q.price), approx: q.approx,
        minutes: q.tripMin != null ? Math.max(1, Math.round(q.tripMin)) : null,
        km: q.tripKm != null ? round2(q.tripKm) : null,
        perHour: (() => { const h = perHour(q.price, q.totalMin); return h != null ? Math.round(h) : null })(),
        route: `${shortPlace(r.origin_address)} → ${shortPlace(r.destination_address)}`,
        vehicle: isDelivery ? 'Entrega de loja' : VEHICLE[vehicle] || 'Corrida',
        href: `/aceitar-corridas?ride=${r.id}`,
    }
}

/** ordem do cartão: valorizadas primeiro, depois as que rendem mais por hora, depois as mais novas */
export function sortTiles(tiles: ChannelTile[]): ChannelTile[] {
    const rank = (t: ChannelTile) => (t.kind === 'valorizada' ? 0 : 1)
    return [...tiles].sort((a, b) => rank(a) - rank(b) || (b.perHour ?? 0) - (a.perHour ?? 0))
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const kmText = (km: number | null) => (km == null ? '' : km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`)
