// src/modules/ridewait/load.ts — fala com o banco (pedir, aprovar, encerrar, ler as esperas). A validação e a conta de verdade moram nas funções do banco.
import { supabase } from '@/lib/supabase/client'
import { settingsFromJson, viewFromJson, waitError, DEFAULT_WAIT_SETTINGS, type RideWaitsView, type WaitKind, type WaitSettings } from './domain'

export class RideWaitError extends Error {
    hint: string | null
    constructor(err: { message?: string; hint?: string | null }) { super(waitError(err)); this.hint = err.hint ?? null }
}

/** As esperas da corrida (só as duas pontas leem; qualquer outra pessoa recebe null) */
export async function loadRideWaits(rideId: string): Promise<RideWaitsView | null> {
    const { data, error } = await supabase.rpc('get_ride_waits', { p_ride: rideId })
    if (error) return null
    return viewFromJson(data)
}
/** O passageiro pede tempo de espera (o motorista aprova para começar a contar) */
export async function requestRideWait(rideId: string, kind: WaitKind, note: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('request_ride_wait', { p_ride: rideId, p_kind: kind, p_note: note })
    if (error) throw new RideWaitError(error)
    return data as string
}
/** O motorista aprova (o relógio começa para os dois) ou recusa */
export async function respondRideWait(waitId: string, accept: boolean): Promise<void> {
    const { error } = await supabase.rpc('respond_ride_wait', { p_wait: waitId, p_accept: accept })
    if (error) throw new RideWaitError(error)
}
/** Qualquer das duas pontas encerra: em andamento fecha e cobra; só pedida, cancela */
export async function endRideWait(waitId: string): Promise<void> {
    const { error } = await supabase.rpc('end_ride_wait', { p_wait: waitId })
    if (error) throw new RideWaitError(error)
}

/** As regras de espera vigentes (do iUser); se a leitura falhar, o padrão de fábrica (só para mostrar) */
export async function loadWaitSettings(): Promise<WaitSettings> {
    const { data, error } = await supabase.rpc('get_ride_wait_settings')
    return error || !data ? DEFAULT_WAIT_SETTINGS : settingsFromJson(data)
}

/** O motorista dá um DESCONTO nesta espera: diminui o valor inicial e/ou o valor por minuto (o valor do iUser é o teto; o banco confere) */
export async function setRideWaitDiscount(waitId: string, baseCents: number, rateCents: number): Promise<void> {
    const { error } = await supabase.rpc('set_ride_wait_discount', { p_wait: waitId, p_base_cents: baseCents, p_rate_cents: rateCents })
    if (error) throw new RideWaitError(error)
}
