// src/components/AdminDashboard/points/shared.tsx — tipos e peças comuns do painel Admin → Pontuação
'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { ThemeColors } from '@/app/contexts/theme'

export interface EventRow { event: string; label: string; description: string | null; sort_order: number }
export interface RuleRow {
    action: string; event: string; label: string; description: string | null; points: number; daily_limit: number | null; max_total: number | null
    starts_at: string | null; ends_at: string | null; is_active: boolean; times: number; given: number
}
export interface SignalRow {
    kind: string; signal: string; label: string; weight: number; is_active: boolean; rolls_up: boolean; max_units: number | null; sort_order: number
}
export interface SettingsRow {
    use_total_score: boolean; diversity_step: number; diversity_max: number; diversity_max_share: number; diversity_min_points: number; refreshed_at: string | null
}
export interface RankRow { rank: number; profile_id: string; total: number; name: string | null; slug: string | null }
export interface Overview { events: EventRow[]; rules: RuleRow[]; signals: SignalRow[]; settings: SettingsRow | null; ranking: RankRow[] }

export interface PanelProps { colors: ThemeColors; cardStyle: CSSProperties; reload: () => Promise<void> }

export const inputStyle = (colors: ThemeColors): CSSProperties => ({
    background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, borderRadius: 12, padding: '8px 12px', fontSize: 13, width: '100%',
})

export function Field({ colors, label, children, hint }: { colors: ThemeColors; label: string; children: ReactNode; hint?: string }) {
    return (
        <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{label}</span>
            {children}
            {hint && <span className="text-[10px]" style={{ color: colors.textSecondary }}>{hint}</span>}
        </label>
    )
}

export function Check({ colors, checked, onChange, children }: { colors: ThemeColors; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
    return (
        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-orange-500" />
            {children}
        </label>
    )
}

/** ISO do banco → valor do <input type="datetime-local"> (hora do aparelho) e de volta */
export const toLocalInput = (iso: string | null): string => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null)

export const STATE_STYLE: Record<string, { bg: string; fg: string }> = {
    ligada: { bg: '#16a34a22', fg: '#15803d' },
    desligada: { bg: '#6b728022', fg: '#6b7280' },
    agendada: { bg: '#2563eb22', fg: '#1d4ed8' },
    encerrada: { bg: '#dc262622', fg: '#b91c1c' },
}
