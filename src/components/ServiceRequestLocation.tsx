// src/components/ServiceRequestLocation.tsx
//
// Onde o serviço vai acontecer, para o profissional ESCOLHIDO (e para quem pediu): o endereço completo, o acesso (condomínio fechado) e
// um botão que abre o ponto exato no mapa para ir até lá. Vem de get_service_request_location (migration 20261128): estranhos e candidatos
// ainda sem resposta recebem nada.
'use client'

import { useEffect, useState } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'

interface Loc { address: string | null; lat: number | null; lng: number | null; needs_access: boolean | null; access_notes: string | null }

export default function ServiceRequestLocation({ requestId }: { requestId: string }) {
    const { colors } = useTheme()
    const [loc, setLoc] = useState<Loc | null | undefined>(undefined)
    useEffect(() => {
        let alive = true
        supabase.rpc('get_service_request_location', { p_request: requestId }).then(({ data }) => { if (alive) setLoc((data as Loc | null) || null) }, () => { if (alive) setLoc(null) })
        return () => { alive = false }
    }, [requestId])
    if (!loc) return null
    const has = loc.lat != null && loc.lng != null
    const href = has
        ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`
        : loc.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address)}` : null
    return (
        <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30` }}>
            <p className="flex items-start gap-1.5 text-xs font-black" style={{ color: colors.textPrimary }}>
                <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#f97316' }} />
                <span className="min-w-0">Onde fica: {loc.address || 'endereço não informado'}</span>
            </p>
            {loc.needs_access && <p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>Condomínio fechado{loc.access_notes ? ` — ${loc.access_notes}` : ''}</p>}
            {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12px] font-black text-white" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                    <Navigation size={13} /> {has ? 'Abrir o ponto exato no mapa' : 'Abrir no mapa'}
                </a>
            )}
        </div>
    )
}
