// src/lib/driverLocationSync.ts
//
// A localização ao vivo do motorista acompanha o Modo motorista: ligou o modo,
// sincroniza (sem pergunta); desligou, para. Quem manda a posição de forma
// contínua é o DriverLiveLocationBroadcaster global; aqui só vai a primeira
// leitura (que também é o momento em que o aparelho pede a permissão de GPS).
import { supabase } from '@/lib/supabase/client'
import { getCurrentPosition as getNativeCurrentPosition } from '@/lib/nativeGeolocation'

export function sendFirstDriverPosition(userId: string): void {
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
