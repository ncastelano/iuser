// src/components/Graduation/LevelBadge.tsx
//
// Identidade visual de um nível de graduação — selo e moldura de avatar. Nada de nomes fixos ("Bronze", "Ouro"...):
// tudo vem da configuração do nível (border_style, border_color(s), background_style, badge_style, icon), então
// níveis criados pelo admin funcionam igual. Discreto de propósito, no padrão do iUser.
'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { levelBackground, levelBorderCss, levelGradient, type LevelVisual } from '@/lib/graduation'

const SIZES = {
    sm: { font: 10, padY: 2, padX: 8 },
    md: { font: 12, padY: 4, padX: 12 },
    lg: { font: 15, padY: 6, padX: 18 },
} as const

export default function LevelBadge({ level, size = 'md', className = '' }: { level: LevelVisual; size?: keyof typeof SIZES; className?: string }) {
    const { colors } = useTheme()
    const s = SIZES[size]
    const radius: Record<string, string> = { pill: '9999px', shield: '10px 10px 18px 18px', ribbon: '4px', plain: '9999px' }
    const base: CSSProperties = {
        ['--level-fill' as string]: colors.surface,
        borderRadius: radius[level.badge_style] || '9999px',
        padding: `${s.padY}px ${s.padX}px`,
        fontSize: s.font,
        fontWeight: 900,
        letterSpacing: level.badge_style === 'ribbon' ? 0.8 : 0.2,
        textTransform: level.badge_style === 'ribbon' ? 'uppercase' : 'none',
        color: colors.textPrimary,
        background: levelBackground(level),
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
    }
    const style: CSSProperties = level.badge_style === 'plain'
        ? { ...base, color: level.border_color, padding: 0 }
        : { ...base, ...levelBorderCss(level, 1.5) }

    // Com degradê, o "background" do miolo precisa vencer o do nível; o css do contorno já cuida disso
    return (
        <span className={className} style={style} title={level.name}>
            {level.icon ? <span aria-hidden>{level.icon}</span> : null}
            {level.name}
        </span>
    )
}

/** Anel do nível em volta de um avatar redondo (estático — o anel que gira é o da borda de perfil, outra coisa) */
export function LevelAvatarFrame({ level, children, width = 2 }: { level: LevelVisual; children: ReactNode; width?: number }) {
    const color = level.border_color
    const gradient = levelGradient(level)
    const glow = level.border_style === 'glow' || level.border_style === 'diamond'
    return (
        <span
            className="inline-flex flex-shrink-0 rounded-full"
            style={{
                padding: width,
                background: level.border_style === 'gradient' || level.border_style === 'diamond' ? gradient : color,
                boxShadow: glow ? `0 0 10px ${(level.border_colors?.[0] || color)}66` : undefined,
                outline: level.border_style === 'double' ? `1.5px solid ${color}` : undefined,
                outlineOffset: level.border_style === 'double' ? 1.5 : undefined,
            }}
        >
            <span className="inline-flex rounded-full overflow-hidden" style={{ background: '#fff' }}>{children}</span>
        </span>
    )
}
