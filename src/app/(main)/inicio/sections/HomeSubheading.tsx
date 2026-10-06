// src/app/(main)/inicio/sections/HomeSubheading.tsx
//
// Título de bloco dentro de um card da home (sem o ícone do HomeSectionHeader):
// mesma fonte do "Quem já oferece serviço", pra os blocos do card Serviços
// ficarem todos iguais.
'use client'

import { useTheme } from '@/app/contexts/theme'

export function HomeSubheading({ title, subtitle }: { title: string; subtitle?: string }) {
    const { colors } = useTheme()
    return (
        <div className="mb-3">
            <h3 className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</h3>
            {subtitle && <p className="text-xs opacity-60" style={{ color: colors.textPrimary }}>{subtitle}</p>}
        </div>
    )
}
