// src/components/RequestCard.tsx
//
// Cartão de um pedido de serviço dentro do chat (conversas): outro desenho do que o da postagem — faixa roxa de
// "Pedido de serviço", o que a pessoa pediu, onde e a foto — pra ficar claro que a conversa é sobre um pedido e não
// sobre um anúncio.
'use client'

import Link from 'next/link'
import { ClipboardList, MapPin } from 'lucide-react'
import { getRequestTitle, getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'

export interface RequestRef {
    id: string
    service_type: string
    custom_service: string | null
    description: string | null
    location_address: string | null
    photo_urls: string[] | null
    status: string
    created_at: string
    requester_slug: string | null
}

const REQUEST_STATUS: Record<string, { label: string; bg: string }> = {
    pending: { label: 'Aberto', bg: '#f59e0b' },
    accepted: { label: 'Contratado', bg: '#22c55e' },
    completed: { label: 'Concluído', bg: '#64748b' },
}

export default function RequestCard({ r, mine, colors }: { r: RequestRef; mine: boolean; colors: any }) {
    const Icon = getServiceIcon(r.service_type)
    const status = REQUEST_STATUS[r.status]
    const photo = r.photo_urls?.[0] || null
    return (
        <Link
            href="/procurar-servico"
            className={`block w-[min(85%,340px)] rounded-2xl overflow-hidden ${mine ? 'self-end' : 'self-start'}`}
            style={{ background: colors.surface, border: '1px solid #7c3aed66', boxShadow: '0 4px 14px rgba(124,58,237,0.18)' }}
        >
            <span className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                <ClipboardList size={15} />
                <span className="text-[11px] font-black uppercase tracking-wider flex-1">Pedido de serviço</span>
                {status && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: status.bg }}>{status.label}</span>
                )}
            </span>
            <span className="flex gap-3 p-3">
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-black mb-1" style={{ color: '#7c3aed' }}>
                        <Icon size={13} />
                        {getServiceLabel(r.service_type, r.custom_service)}
                    </span>
                    <span className="block text-sm font-black leading-snug line-clamp-3" style={{ color: colors.textPrimary }}>
                        {getRequestTitle(r.description, r.service_type, r.custom_service, 140)}
                    </span>
                    {r.location_address && (
                        <span className="flex items-start gap-1 text-[11px] mt-1.5" style={{ color: colors.textSecondary }}>
                            <MapPin size={12} className="flex-shrink-0 mt-px" />
                            <span className="line-clamp-2">{r.location_address}</span>
                        </span>
                    )}
                </span>
                {photo && <img src={photo} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />}
            </span>
            <span className="block px-3 py-2 text-[11px] font-black text-center" style={{ borderTop: `1px solid ${colors.border}`, color: '#7c3aed' }}>
                Ver meus pedidos
            </span>
        </Link>
    )
}

