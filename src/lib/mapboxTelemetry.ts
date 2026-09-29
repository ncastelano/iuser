// lib/mapboxTelemetry.ts
// Telemetria própria de chamadas ao Mapbox — eles não expõem uso via API
// pública (o NEXT_PUBLIC_MAPBOX_TOKEN não dá pra ler estatística de conta,
// só a página de billing no dashboard deles mostra isso). Fire-and-forget:
// nunca deve atrasar nem quebrar a chamada real ao Mapbox por causa disso.
import { supabase } from '@/lib/supabase/client'

export function trackMapboxRequest(metric: 'directions' | 'optimization' | 'geocoding'): void {
    supabase.rpc('track_service_usage', { p_service: 'mapbox', p_metric: metric }).then(
        () => {},
        () => {}
    )
}
