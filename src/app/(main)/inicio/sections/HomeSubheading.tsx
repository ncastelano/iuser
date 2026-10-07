// src/app/(main)/inicio/sections/HomeSubheading.tsx
//
// Título de bloco dentro de um card da home (sem o ícone do HomeSectionHeader):
// mesma fonte do "Quem já oferece serviço", pra os blocos do card Serviços
// ficarem todos iguais. `action` é um botão opcional no lado direito.
'use client'

import type { ReactNode } from 'react'
import { useTheme } from '@/app/contexts/theme'

export function HomeSubheading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
    const { colors } = useTheme()
    return (
        <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
                <h3 className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</h3>
                {subtitle && <p className="text-xs opacity-60" style={{ color: colors.textPrimary }}>{subtitle}</p>}
            </div>
            {action}
        </div>
    )
}
