// src/components/ProfileDashboard/DashboardSection.tsx
//
// Seção do ProfileDashboard que abre e fecha sozinha (cabeçalho com título, frase e seta),
// no mesmo visual dos outros cards do painel. Lembra aberto/fechado por navegador.
'use client'

import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'

interface DashboardSectionProps {
    /** Chave da preferência aberto/fechado (localStorage) */
    storageKey: string
    title: string
    subtitle?: string
    /** Resumo mostrado ao lado da seta só enquanto a seção está fechada */
    collapsedSummary?: ReactNode
    /** Conteúdo mostrado logo abaixo do cabeçalho enquanto a seção está fechada (ex: as últimas 5 notificações) */
    collapsedContent?: ReactNode
    defaultExpanded?: boolean
    children: ReactNode
}

export default function DashboardSection({ storageKey, title, subtitle, collapsedSummary, collapsedContent, defaultExpanded = false, children }: DashboardSectionProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const [expanded, setExpanded] = usePersistedExpanded(storageKey, defaultExpanded)

    return (
        <div
            className="rounded-2xl"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                backdropFilter: 'blur(12px)',
                border: `1px solid ${colors.border}`,
                boxShadow: colors.shadow,
            }}
        >
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
                <div className="min-w-0">
                    <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>{title}</h3>
                    {!expanded && collapsedSummary ? (
                        <div className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>{collapsedSummary}</div>
                    ) : subtitle ? (
                        <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>{subtitle}</p>
                    ) : null}
                </div>
                {expanded
                    ? <ChevronUp size={18} style={{ color: colors.textSecondary }} className="flex-shrink-0" />
                    : <ChevronDown size={18} style={{ color: colors.textSecondary }} className="flex-shrink-0" />}
            </button>

            {!expanded && collapsedContent && (
                <div className="px-4 pb-4 pt-1 flex flex-col gap-0.5">
                    {collapsedContent}
                </div>
            )}

            {expanded && (
                <div className="px-4 pb-4 pt-4 flex flex-col gap-4 border-t" style={{ borderColor: colors.border }}>
                    {children}
                </div>
            )}
        </div>
    )
}
