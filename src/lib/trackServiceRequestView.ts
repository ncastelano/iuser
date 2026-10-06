// src/lib/trackServiceRequestView.ts
//
// Registra que alguém viu um pedido de serviço (alimenta o "Visitantes dos
// serviços" do dono do pedido e o contador de visualizações). A função do banco
// ignora o próprio dono e a mesma pessoa repetida dentro de 30 min.
import { supabase } from '@/lib/supabase/client'

function getAnonymousId(): string {
    try {
        const key = 'iuser_anon_id'
        let id = localStorage.getItem(key)
        if (!id) {
            id = crypto.randomUUID()
            localStorage.setItem(key, id)
        }
        return id
    } catch {
        return crypto.randomUUID()
    }
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const ua = navigator.userAgent
    if (/iPad|Tablet/i.test(ua)) return 'tablet'
    if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile'
    return 'desktop'
}

export function trackServiceRequestView(requestId: string) {
    supabase
        .rpc('track_service_request_view', {
            p_request_id: requestId,
            p_anonymous_id: getAnonymousId(),
            p_device_type: getDeviceType(),
        })
        .then(() => { }, () => { })
}
