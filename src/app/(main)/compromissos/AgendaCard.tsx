// app/(main)/compromissos/AgendaCard.tsx
//
// Cartão COMPACTO de um agendamento — o mesmo desenho dos atalhos do ProfileDashboard e do StoreDashboard
// (foto redonda com a borda, data + status em cima, título, quem é, hora e ações embaixo), pra agenda ocupar
// menos espaço e mostrar tudo já aberto, sem "expandir". Usado em todas as listas de /compromissos/<slug>.
'use client'

import React from 'react'
import { Check, Clock, Earth, Lock, X } from 'lucide-react'

export interface AgendaPalette {
    surface: string
    border: string
    textPrimary: string
    textSecondary: string
    accent: string
}

/** Paleta pros modais escuros da agenda */
export const AGENDA_DARK: Omit<AgendaPalette, 'accent'> = {
    surface: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.12)',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
}

/** Grade das listas: vários cartões por linha quando cabe (web), um embaixo do outro no celular */
export const AGENDA_GRID: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 12,
}
export const AGENDA_GRID_SINGLE: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr', gap: 10 }

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const STATUS = {
    confirmed: { bg: 'rgba(16,185,129,0.2)', text: '#34d399', label: 'Confirmado' },
    pending: { bg: 'rgba(234,179,8,0.2)', text: '#fbbf24', label: 'Pendente' },
    cancelled: { bg: 'rgba(239,68,68,0.2)', text: '#f87171', label: 'Cancelado' },
    completed: { bg: 'rgba(96,165,250,0.2)', text: '#60a5fa', label: 'Concluído' },
} as const

interface AgendaCardProps {
    palette: AgendaPalette
    /** Avatar já pronto (o AppointmentAvatar de 44px, com a borda de quem aparece) */
    avatar: React.ReactNode
    /** "Hoje", "11 de set." ... */
    dateLabel: string
    status: keyof typeof STATUS
    /** Troca o texto do status (ex: "Aceito") */
    statusLabel?: string
    isPast?: boolean
    title: React.ReactNode
    durationMin?: number | null
    /** Linha "quem é" (ícone + texto) */
    subtitle?: React.ReactNode
    isPublic?: boolean
    time: string
    /** Selo no canto: "Novo" (pendente pra responder) ou "Próximo · em 2h" */
    badge?: string
    highlight?: boolean
    actions?: React.ReactNode
    onClick?: () => void
}

export default function AgendaCard({
    palette, avatar, dateLabel, status, statusLabel, isPast, title, durationMin, subtitle, isPublic, time, badge, highlight, actions, onClick,
}: AgendaCardProps) {
    const st = STATUS[status] || STATUS.pending
    const attention = status === 'pending' && !!badge && !highlight
    return (
        <div
            onClick={onClick}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                minWidth: 0,
                borderRadius: 16,
                background: palette.surface,
                border: highlight ? `2px solid ${palette.accent}` : `1px solid ${attention ? '#f9731660' : palette.border}`,
                boxShadow: highlight ? `0 6px 20px ${palette.accent}40` : attention ? '0 0 0 2px #f9731640' : '0 1px 2px rgba(0,0,0,0.06)',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'box-shadow 0.2s',
            }}
        >
            {badge && (
                <span
                    style={{
                        position: 'absolute', top: -8, right: -6, zIndex: 2, padding: '2px 10px', borderRadius: 999,
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.3, color: '#fff', background: highlight ? palette.accent : GRADIENT,
                        boxShadow: '0 2px 6px #f9731640', whiteSpace: 'nowrap',
                    }}
                >
                    {badge}
                </span>
            )}

            <div style={{ flexShrink: 0 }}>{avatar}</div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: palette.textSecondary }}>{dateLabel}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: st.bg, color: st.text }}>{statusLabel || st.label}</span>
                    {isPast && status !== 'cancelled' && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>Passado</span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
                    <h4 style={{ fontWeight: 700, fontSize: 14, color: palette.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{title}</h4>
                    {durationMin ? <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', color: palette.textSecondary }}>· {durationMin} min</span> : null}
                </div>

                {(subtitle || isPublic !== undefined) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap', minWidth: 0 }}>
                        {subtitle && <p style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: palette.textSecondary, margin: 0, minWidth: 0 }}>{subtitle}</p>}
                        {isPublic !== undefined && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: `${palette.textSecondary}22`, color: palette.textSecondary, whiteSpace: 'nowrap' }}>
                                {isPublic ? <Earth size={10} /> : <Lock size={10} />}
                                {isPublic ? 'Público' : 'Privado'}
                            </span>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${palette.border}` }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 900, color: '#f97316', fontVariantNumeric: 'tabular-nums' }}>
                        <Clock size={14} /> {time}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{actions}</div>
                </div>
            </div>
        </div>
    )
}

/** Botão redondo de ação (aceitar / recusar) no mesmo tamanho dos outros botões do cartão */
export function AgendaIconButton({ kind, onClick, size = 26 }: { kind: 'accept' | 'decline'; onClick: (e: React.MouseEvent) => void; size?: number }) {
    const accept = kind === 'accept'
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(e) }}
            title={accept ? 'Aceitar' : 'Recusar'}
            aria-label={accept ? 'Aceitar' : 'Recusar'}
            style={{ width: size, height: size, borderRadius: '50%', border: 'none', cursor: 'pointer', background: accept ? '#10b981' : '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
            {accept ? <Check size={Math.round(size * 0.55)} /> : <X size={Math.round(size * 0.55)} />}
        </button>
    )
}
