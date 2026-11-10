// src/lib/rideApplication.ts
//
// Candidatura do motorista a uma corrida, compartilhada entre o card de
// /aceitar-corridas e o toast de "Nova corrida disponível!". Lança o erro
// do Supabase se o insert falhar (quem chama decide a mensagem).
import { supabase } from '@/lib/supabase/client'
import { hourlyCheck } from '@/modules/negotiation'
import { belowMinimumText } from '@/modules/negotiation/domain'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'

/** `alts` = até 2 valores a mais (maiores que `price`, até o triplo): o passageiro escolhe um deles ou o principal (o banco confere) */
export async function submitRideApplication(userId: string, rideId: string, price: number, minutes?: number | null, alts?: number[]): Promise<void> {
    // Ganho mínimo por hora do motorista em modo "não aceitar abaixo": vale para QUALQUER forma de candidatura (card, aviso do celular...)
    const check = await hourlyCheck(rideId, price, minutes)
    if (check?.belowPlatform && check.platformMin != null) {
        throw Object.assign(new Error(`O valor mínimo da plataforma para esta corrida é R$ ${check.platformMin.toFixed(2).replace('.', ',')}.`), { hint: 'below_platform_min' })
    }
    if (check?.blocked) {
        throw Object.assign(new Error(belowMinimumText(check.perHour as number, check.minHourly as number, 'proposta')), { hint: 'below_min_hourly' })
    }
    const { error } = await supabase.from('ride_applications').insert({
        ride_request_id: rideId,
        applicant_id: userId,
        proposed_price: price,
        ...(alts && alts.length ? { alt_prices: alts } : {}),
    })
    if (error) throw error

    // O passageiro precisa poder ver o motorista em tempo real assim que ele
    // vira candidato — não dá pra depender dele lembrar de ativar
    // "Sincronização para motorista" manualmente. Liga o flag e já manda uma
    // primeira leitura de GPS: o DriverLiveLocationBroadcaster global assume
    // o watch contínuo a partir daqui.
    supabase.from('driver_pricing').update({ live_location_sync: true }).eq('driver_id', userId).then(() => {})
    getNativeCurrentPosition(
        (pos) => {
            supabase
                .from('driver_pricing')
                .update({
                    live_lat: pos.coords.latitude,
                    live_lng: pos.coords.longitude,
                    live_updated_at: new Date().toISOString(),
                })
                .eq('driver_id', userId)
                .then(() => {})
        },
        () => { /* sem permissão ainda: o broadcaster global tenta de novo depois */ },
        { enableHighAccuracy: true, timeout: 10000 }
    )
}
