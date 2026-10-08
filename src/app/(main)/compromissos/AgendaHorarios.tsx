// app/(main)/compromissos/AgendaHorarios.tsx
//
// Resumo dos horários e da disponibilidade DESTA agenda, dentro da própria página dela:
//  - agenda do perfil → profiles.working_hours; agenda da loja → stores.opening_hours.
// "Editar horários" abre o formulário completo (HorarioEDisponibilidade).
'use client'

import React, { useEffect, useState } from 'react'
import { CalendarClock, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

interface DayConfig { isOpen?: boolean; start?: string; end?: string; lunchStart?: string; lunchEnd?: string }
interface Hours { is_active?: boolean; slot_interval?: number; weekly?: Record<string, DayConfig>; blocked_dates?: string[] }

interface Props {
    scope: { kind: 'profile' | 'store'; id: string; name?: string }
    colors: { surface: string; border: string; textPrimary: string; textSecondary: string; accent: string; accentText: string; shadow?: string }
    refreshKey?: number
    onEdit: () => void
}

// Ordem de exibição: segunda → domingo (no banco, domingo = "0")
const ORDER = ['1', '2', '3', '4', '5', '6', '0']
const SHORT: Record<string, string> = { '1': 'Seg', '2': 'Ter', '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb', '0': 'Dom' }
const DEFAULT_OPEN: DayConfig = { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' }
const DEFAULT_CLOSED: DayConfig = { isOpen: false }

function describe(d: DayConfig): string {
    if (!d.isOpen) return 'Fechado'
    const base = `${d.start || '08:00'} às ${d.end || '18:00'}`
    return d.lunchStart && d.lunchEnd ? `${base} · almoço ${d.lunchStart}–${d.lunchEnd}` : base
}

/** Junta dias seguidos com o mesmo horário: "Seg a Sex · 08:00 às 18:00" */
function groupDays(weekly: Record<string, DayConfig>): { label: string; text: string; open: boolean }[] {
    const groups: { days: string[]; text: string; open: boolean }[] = []
    ORDER.forEach((id) => {
        const d = weekly[id] || DEFAULT_CLOSED
        const text = describe(d)
        const last = groups[groups.length - 1]
        if (last && last.text === text) last.days.push(id)
        else groups.push({ days: [id], text, open: !!d.isOpen })
    })
    return groups.map((g) => ({
        label: g.days.length === 1 ? SHORT[g.days[0]] : g.days.length === 2 ? `${SHORT[g.days[0]]} e ${SHORT[g.days[1]]}` : `${SHORT[g.days[0]]} a ${SHORT[g.days[g.days.length - 1]]}`,
        text: g.text,
        open: g.open,
    }))
}

export default function AgendaHorarios({ scope, colors, refreshKey = 0, onEdit }: Props) {
    const [hours, setHours] = useState<Hours | null | undefined>(undefined) // undefined = carregando, null = nunca configurado

    useEffect(() => {
        let cancelled = false
        setHours(undefined)
        const query = scope.kind === 'profile'
            ? supabase.from('profiles').select('working_hours').eq('id', scope.id).single()
            : supabase.from('stores').select('opening_hours').eq('id', scope.id).single()
        query.then(({ data }) => {
            if (cancelled) return
            const row = data as { working_hours?: Hours | null; opening_hours?: Hours | null } | null
            setHours((scope.kind === 'profile' ? row?.working_hours : row?.opening_hours) ?? null)
        })
        return () => { cancelled = true }
    }, [scope.kind, scope.id, refreshKey])

    const weekly: Record<string, DayConfig> = hours?.weekly || {
        '1': DEFAULT_OPEN, '2': DEFAULT_OPEN, '3': DEFAULT_OPEN, '4': DEFAULT_OPEN, '5': DEFAULT_OPEN,
        '6': DEFAULT_CLOSED, '0': DEFAULT_CLOSED,
    }
    const active = hours?.is_active ?? true
    const today = new Date().toISOString().slice(0, 10)
    const blockedAhead = (hours?.blocked_dates || []).filter((d) => d >= today).sort()

    return (
        <section style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 24, padding: 16, boxShadow: colors.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <CalendarClock size={20} color={colors.accent} />
                    <div style={{ minWidth: 0 }}>
                        <h2 style={{ fontWeight: 800, fontSize: 16, color: colors.textPrimary, lineHeight: 1.2 }}>Horários e disponibilidade</h2>
                        <p style={{ fontSize: 12, color: colors.textSecondary }}>
                            {scope.kind === 'store' ? `Quando ${scope.name || 'a loja'} recebe agendamentos` : 'Quando você recebe agendamentos no seu perfil'}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                        style={{
                            fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 10,
                            background: active ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)', color: active ? '#10b981' : '#ef4444',
                        }}
                    >
                        {active ? 'Recebendo agendamentos' : 'Agendamentos pausados'}
                    </span>
                    <button
                        onClick={onEdit}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.accent, color: colors.accentText, border: 'none', borderRadius: 12, padding: '8px 12px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                    >
                        <Pencil size={14} /> Editar horários
                    </button>
                </div>
            </div>

            {hours === undefined ? (
                <p style={{ marginTop: 12, fontSize: 13, color: colors.textSecondary }}>Carregando…</p>
            ) : (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {hours === null && (
                        <p style={{ fontSize: 12, color: colors.textSecondary }}>Ainda não configurado — mostrando o horário padrão. Toque em “Editar horários” para ajustar.</p>
                    )}
                    {groupDays(weekly).map((g) => (
                        <div key={g.label} style={{ display: 'flex', gap: 10, fontSize: 14 }}>
                            <span style={{ width: 74, flexShrink: 0, fontWeight: 800, color: g.open ? colors.textPrimary : colors.textSecondary }}>{g.label}</span>
                            <span style={{ color: g.open ? colors.textPrimary : colors.textSecondary }}>{g.text}</span>
                        </div>
                    ))}
                    <p style={{ marginTop: 4, fontSize: 12, color: colors.textSecondary }}>
                        Intervalo entre horários: {hours?.slot_interval ?? 60} min
                        {blockedAhead.length > 0 && ` · ${blockedAhead.length} data${blockedAhead.length > 1 ? 's' : ''} fechada${blockedAhead.length > 1 ? 's' : ''} (próxima: ${blockedAhead[0].split('-').reverse().join('/')})`}
                    </p>
                </div>
            )}
        </section>
    )
}
