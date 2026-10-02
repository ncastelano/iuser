// src/lib/rideApplication.ts
//
// Candidatura do motorista a uma corrida, compartilhada entre o card de
// /aceitar-corridas e o toast de "Nova corrida disponível!". Lança o erro
// do Supabase se o insert falhar (quem chama decide a mensagem).
import { supabase } from '@/lib/supabase/client'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'

export async function submitRideApplication(userId: string, rideId: string, price: number): Promise<void> {
    const { error } = await supabase.from('ride_applications').insert({
        ride_request_id: rideId,
        applicant_id: userId,
        proposed_price: price,
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
