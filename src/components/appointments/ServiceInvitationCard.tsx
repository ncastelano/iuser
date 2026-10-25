// src/components/appointments/ServiceInvitationCard.tsx
//
// O CONVITE DE SERVIÇO que o dono recebe quando alguém agenda: um cartão por cliente, com todos os horários que essa pessoa pediu,
// o estado da entrada (se a loja cobra) e o respaldo — o histórico do cliente (o que outros donos disseram dele e o que ele
// disse dos serviços). O dono aceita ou recusa cada horário daqui.
'use client'

import { useState } from 'react'
import { Calendar, Check, ChevronDown, Clock3, ShieldCheck, Wallet, X } from 'lucide-react'
import ClientTrackRecord from './ClientTrackRecord'
import type { ReviewPalette } from './AppointmentReviewPanel'

export interface InvitationSlot {
    id: string
    date: string
    time: string
    duration_minutes?: number
    service_name: string
    deposit_status?: string
    deposit_amount?: number
}
export interface InvitationClient { id: string; slug: string; name?: string | null; avatarUrl?: string | null }

const hhmm = (t: string) => (t || '').slice(0, 5)
const dayLabel = (date: string) => {
    const d = new Date(`${date}T12:00:00`)
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '')
}
const brl = (n?: number) => (n ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '')
const DEPOSIT_TEXT: Record<string, { label: string; color: string }> = {
    awaiting: { label: 'Aguardando a entrada', color: '#f59e0b' },
    reported: { label: 'Entrada informada — conferir o Pix', color: '#3b82f6' },
    paid: { label: 'Entrada recebida', color: '#10b981' },
}

export default function ServiceInvitationCard({ client, slots, palette, onAccept, onDecline, onOpen }: {
    client: InvitationClient
    slots: InvitationSlot[]
    palette: ReviewPalette
    onAccept: (id: string) => void
    onDecline: (id: string) => void
    onOpen?: (id: string) => void
}) {
    const [open, setOpen] = useState(false)
    const c = palette
    return (
        <div style={{ background: c.surface, border: `1px solid ${c.border}66`, borderRadius: 22, padding: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', background: `${c.accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textPrimary, fontWeight: 900, flexShrink: 0 }}>
                    {client.avatarUrl ? <img src={client.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (client.slug || '?').charAt(0).toUpperCase()}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', color: c.accent }}>Convite de serviço</span>
                    <span style={{ display: 'block', fontSize: 16, fontWeight: 900, color: c.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name || `@${client.slug}`}</span>
                    <span style={{ display: 'block', fontSize: 12, color: c.textSecondary }}>@{client.slug} · {slots.length} {slots.length === 1 ? 'horário pedido' : 'horários pedidos'}</span>
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {slots.map((s) => {
                    const dep = s.deposit_status ? DEPOSIT_TEXT[s.deposit_status] : undefined
                    return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 16, background: `${c.border}22` }}>
                            <button onClick={() => onOpen?.(s.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: onOpen ? 'pointer' : 'default', color: c.textPrimary }}>
                                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.service_name}</span>
                                <span style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: c.textSecondary, marginTop: 2, flexWrap: 'wrap' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {dayLabel(s.date)}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock3 size={12} /> {hhmm(s.time)}{s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}</span>
                                </span>
                                {dep && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: dep.color, marginTop: 3 }}><Wallet size={11} /> {dep.label}{s.deposit_amount ? ` · ${brl(s.deposit_amount)}` : ''}</span>}
                            </button>
                            <button onClick={() => onDecline(s.id)} aria-label="Recusar horário" style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.15)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={17} /></button>
                            <button onClick={() => onAccept(s.id)} aria-label="Aceitar horário" style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={17} /></button>
                        </div>
                    )
                })}
            </div>

            <button onClick={() => setOpen((v) => !v)} style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px dashed ${c.border}88`, background: 'transparent', color: c.textPrimary, borderRadius: 14, padding: '9px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                <ShieldCheck size={15} style={{ color: '#10b981' }} /> Histórico do cliente <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
            </button>
            {open && <div style={{ marginTop: 6 }}><ClientTrackRecord clientId={client.id} palette={palette} /></div>}
        </div>
    )
}
