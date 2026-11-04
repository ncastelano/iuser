// src/modules/negotiation/load.ts — fala com o banco (ofertas, contrapropostas, ganho mínimo). A validação de verdade mora nas funções do banco.
import { supabase } from '@/lib/supabase/client'
import { DEFAULT_MIN_PER_MINUTE, DEFAULT_MIN_PER_MINUTE_CAP, negotiationError, offerFromRow, parseHourlyCheck, type HourlyCheck, type PriceOffer } from './domain'

export class NegotiationError extends Error {
    hint: string | null
    constructor(err: { message?: string; hint?: string | null }) { super(negotiationError(err)); this.hint = err.hint ?? null }
}
const unwrap = <T,>(res: { data: T | null; error: any }): T => {
    if (res.error) throw new NegotiationError(res.error)
    return res.data as T
}

/** O passageiro oferece um valor (para todos os motoristas) */
export async function setPassengerOffer(rideId: string, amount: number) {
    return unwrap(await supabase.rpc('set_passenger_offer', { p_ride: rideId, p_amount: amount })) as { ok: boolean; amount: number; rounds_left: number }
}
/** O passageiro responde a um motorista com outro valor */
export async function passengerCounter(applicationId: string, amount: number) {
    return unwrap(await supabase.rpc('passenger_counter', { p_application: applicationId, p_amount: amount })) as { ok: boolean; amount: number; expires_at: string; rounds_left: number }
}
/** O motorista faz uma contraproposta (minutes = a estimativa de tempo que a tela mostra, para o bloqueio do mínimo usar a mesma conta) */
export async function driverCounter(applicationId: string, amount: number, minutes?: number | null) {
    return unwrap(await supabase.rpc('driver_counter', { p_application: applicationId, p_amount: amount, p_minutes: minutes ?? null })) as { ok: boolean; amount: number; expires_at: string | null; rounds_left: number }
}
/** Aceitar ou recusar a proposta aberta do outro lado. Aceitar fecha a corrida no valor da proposta. */
export async function respondOffer(offerId: string, accept: boolean, minutes?: number | null) {
    return unwrap(await supabase.rpc('respond_ride_offer', { p_offer: offerId, p_accept: accept, p_minutes: minutes ?? null })) as { ok: boolean; status: 'accepted' | 'declined'; agreed_price?: number }
}
/** Quanto uma proposta rende por hora para ESTE motorista e se fere o mínimo dele (null = não deu para medir) */
export async function hourlyCheck(rideId: string, amount: number, minutes?: number | null): Promise<HourlyCheck | null> {
    const { data, error } = await supabase.rpc('driver_hourly_check', { p_ride: rideId, p_amount: amount, p_minutes: minutes ?? null })
    return error ? null : parseHourlyCheck(data as Record<string, any>)
}

/** Histórico de propostas das candidaturas dadas (o banco só entrega as da própria pessoa) */
export async function loadOffers(applicationIds: string[]): Promise<PriceOffer[]> {
    if (applicationIds.length === 0) return []
    const { data, error } = await supabase.from('ride_price_offers').select('id, ride_request_id, application_id, author_role, amount, status, expires_at, created_at').in('application_id', applicationIds).order('created_at', { ascending: true })
    if (error || !data) return []
    return data.map(offerFromRow).filter((o): o is PriceOffer => !!o)
}

// ===== GANHO MÍNIMO POR HORA (PRIVADO) =====
export interface EarningGoal { minHourly: number | null; protection: 'warn' | 'block' }
export async function loadEarningGoal(driverId: string): Promise<EarningGoal> {
    const { data } = await supabase.from('driver_earning_goals').select('min_hourly, protection').eq('driver_id', driverId).maybeSingle()
    return { minHourly: data?.min_hourly != null ? Number(data.min_hourly) : null, protection: data?.protection === 'block' ? 'block' : 'warn' }
}
export async function saveEarningGoal(driverId: string, goal: EarningGoal): Promise<void> {
    const { error } = await supabase.from('driver_earning_goals').upsert({ driver_id: driverId, min_hourly: goal.minHourly, protection: goal.protection, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' })
    if (error) throw new NegotiationError(error)
}

// ===== VALOR MÍNIMO DA PLATAFORMA (por minuto) =====
let minCache: { at: number; value: number } | null = null
/** O mínimo por minuto de trabalho (Admin → Tarifas). Guardado 5 min; se não carregar, vale o padrão. */
export async function loadRideMinimum(): Promise<number> {
    if (minCache && Date.now() - minCache.at < 300_000) return minCache.value
    const { data, error } = await supabase.rpc('get_ride_minimum')
    const v = !error && data != null && Number.isFinite(Number(data)) ? Number(data) : DEFAULT_MIN_PER_MINUTE
    minCache = { at: Date.now(), value: v }
    return v
}
export function forgetRideMinimum() { minCache = null }

/** O teto do mínimo por minuto (só para o Admin mostrar). */
export async function loadRideMinimumCap(): Promise<number> {
    const { data, error } = await supabase.rpc('get_ride_minimum_cap')
    return !error && data != null && Number.isFinite(Number(data)) ? Number(data) : DEFAULT_MIN_PER_MINUTE_CAP
}
