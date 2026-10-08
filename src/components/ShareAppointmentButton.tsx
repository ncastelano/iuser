// src/components/ShareAppointmentButton.tsx
//
// Botão "Compartilhar" de UM agendamento: abre o compartilhar do celular (ou copia o link).
// O link /compromisso/<id> respeita a visibilidade: público = qualquer pessoa vê; privado = só quem
// participa (e logado). O texto do compartilhar de um privado não revela detalhes.
'use client'

import React from 'react'
import { Share2 } from 'lucide-react'
import { handleShareLink } from '@/lib/share'

interface Props {
    appointmentId: string
    isPublic?: boolean
    /** Título e data só entram no texto compartilhado se o compromisso for público */
    title?: string
    dateLabel?: string
    size?: number
    /** 'icon' = só o ícone redondo; 'pill' = ícone + "Compartilhar" */
    variant?: 'icon' | 'pill'
    color?: string
}

export default function ShareAppointmentButton({ appointmentId, isPublic, title, dateLabel, size = 30, variant = 'icon', color = '#a78bfa' }: Props) {
    const share = async (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        const url = `${window.location.origin}/compromisso/${appointmentId}`
        const text = isPublic
            ? `${title ? `${title} — ` : ''}${dateLabel || 'Compromisso'} · iUser`
            : 'Compromisso no iUser (privado: só quem participa consegue abrir)'
        await handleShareLink({ title: 'Compromisso no iUser', text, url })
    }

    if (variant === 'pill') {
        return (
            <button
                onClick={share}
                aria-label="Compartilhar compromisso"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: `${color}22`, color, border: 'none', borderRadius: 14, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
            >
                <Share2 size={14} /> Compartilhar
            </button>
        )
    }
    return (
        <button
            onClick={share}
            title="Compartilhar compromisso"
            aria-label="Compartilhar compromisso"
            style={{ width: size, height: size, borderRadius: '50%', background: `${color}22`, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
            <Share2 size={Math.round(size * 0.5)} color={color} />
        </button>
    )
}
