// Pedido esquecido não aparece para o motorista (23/11/2026, decisão do dono): corrida de pessoa vale 3 h, entrega de loja 90 min
// (como a Central de entregas). Corrida AGENDADA vale até a hora marcada.
export const RIDE_OFFER_MAX_MIN = 180
export const DELIVERY_OFFER_MAX_MIN = 90

export function offerIsStale(r: { created_at: string; order_id?: string | null; scheduled_for?: string | null }, now = Date.now()): boolean {
    if (r.scheduled_for) return new Date(r.scheduled_for).getTime() < now - 30 * 60_000
    const ageMin = (now - new Date(r.created_at).getTime()) / 60_000
    return ageMin > (r.order_id ? DELIVERY_OFFER_MAX_MIN : RIDE_OFFER_MAX_MIN)
}
