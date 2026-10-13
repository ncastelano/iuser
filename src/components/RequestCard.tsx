// src/components/RequestCard.tsx
//
// Pedido de serviço citado dentro da bolha de uma mensagem do chat (conversas) — no mesmo molde da "resposta
// citada" de um chat: barra colorida ao lado, tipo + situação, o que a pessoa pediu, onde e a foto. Fica DENTRO da
// bolha, em cima do texto da mensagem, pra parecer parte da conversa e não um cartão solto.
'use client'

import Link from 'next/link'
import { MapPin } from 'lucide-react'
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

const REQUEST_STATUS: Record<string, string> = {
    pending: 'Aberto',
    accepted: 'Contratado',
    completed: 'Concluído',
}

export default function RequestCard({ r, mine, colors }: { r: RequestRef; mine: boolean; colors: any }) {
    const Icon = getServiceIcon(r.service_type)
    const status = REQUEST_STATUS[r.status]
    const photo = r.photo_urls?.[0] || null
    return (
        <Link
            href="/procurar-servico"
            className="flex items-stretch gap-2.5 mb-2 rounded-xl overflow-hidden"
            style={{ background: mine ? 'rgba(255,255,255,0.18)' : `${colors.border}40` }}
        >
            <span className="w-1 flex-shrink-0" style={{ background: mine ? '#fff' : '#7c3aed' }} />
            <span className="min-w-0 flex-1 py-1.5">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide opacity-80">
                    <Icon size={11} />
                    <span className="truncate">{getServiceLabel(r.service_type, r.custom_service)}</span>
                    {status && <span className="flex-shrink-0">· {status}</span>}
                </span>
                <span className="block text-[13px] font-black leading-snug line-clamp-2 mt-0.5">
                    {getRequestTitle(r.description, r.service_type, r.custom_service, 120)}
                </span>
                {r.location_address && (
                    <span className="flex items-start gap-1 text-[11px] opacity-80 mt-0.5">
                        <MapPin size={11} className="flex-shrink-0 mt-px" />
                        <span className="line-clamp-1">{r.location_address}</span>
                    </span>
                )}
            </span>
            {photo
                ? <img src={photo} alt="" className="w-14 h-auto object-cover flex-shrink-0" />
                : <span className="w-1 flex-shrink-0" />}
        </Link>
    )
}
