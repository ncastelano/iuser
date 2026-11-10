// CANAL DO MOTORISTA — o cartão compacto da home da 3.0: cada corrida aberta vira um "tile" com o VALOR, o TEMPO e a DISTÂNCIA (o que quem
// pensa em dirigir quer ver de relance). Regra pura e testada (npm run test:driver-channel); quem fala com o banco é load.ts.
// O valor mostrado: a OFERTA do passageiro (se ele ofereceu), o FRETE da loja (entrega) ou a Tarifa iUser da corrida "a partir de"
// (partida → chegada, sem o deslocamento de quem dirige — por isso "a partir de"), nunca abaixo do mínimo da plataforma.

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
/** minutos de ir buscar o passageiro que o cartão supõe (o R$/h conta o trabalho todo: sem isso uma corrida de 3 min parecia render R$ 160/h) */
export const PICKUP_MIN = 5

/**
 * @param fareOf  Tarifa iUser da corrida (partida → chegada) pelo veículo e tipo
 * @param floorOf mínimo da plataforma pelos minutos da corrida
 */
export function tileOf(r: OfferRow, fareOf: (km: number, vehicle: string, rideType: string | null) => number, floorOf: (minutes: number | null) => number): ChannelTile {
    const km = r.distance_km != null ? Number(r.distance_km) : null
    const minutes = r.duration_min != null ? Math.max(1, Math.round(Number(r.duration_min))) : null
    const vehicle = r.vehicle_type || 'carro'
    const isDelivery = !!r.order_id
    const iuser = km != null ? Math.max(fareOf(km, vehicle, r.ride_type), floorOf(minutes)) : floorOf(minutes)
    let value: number, approx = false, kind: TileKind = isDelivery ? 'entrega' : 'corrida'
    if (isDelivery && r.offered_price != null) value = Number(r.offered_price)
    else if (r.passenger_offer != null && Number(r.passenger_offer) > 0) {
        value = Number(r.passenger_offer)
        if (iuser > 0 && value >= iuser * 1.2) kind = 'valorizada'
    } else { value = iuser; approx = true }
    value = round2(value)
    return {
        id: r.id, kind, value, approx, minutes, km: km != null ? round2(km) : null,
        perHour: minutes ? Math.round((value / (minutes + PICKUP_MIN)) * 60) : null,
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
