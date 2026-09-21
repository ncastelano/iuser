// components/CollapsibleSection.tsx
'use client'

import { useState } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface CollapsibleSectionProps {
    title: string
    subtitle?: string
    defaultOpen?: boolean
    children: React.ReactNode
}

// Seção que começa FECHADA nos dashboards. O conteúdo continua montado
// (só escondido) pra que os dados carreguem e os avisos de "última
// atualização" das seções continuem funcionando.
export default function CollapsibleSection({ title, subtitle, defaultOpen = false, children }: CollapsibleSectionProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const [open, setOpen] = useState(defaultOpen)

    return (
        <div className="mb-6">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-2xl transition-all"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
                aria-expanded={open}
            >
                <span className="text-left min-w-0">
                    <span className="block text-base font-black" style={{ color: colors.textPrimary }}>{title}</span>
                    {subtitle && <span className="block text-xs" style={{ color: colors.textSecondary }}>{subtitle}</span>}
                </span>
                {open ? <ChevronUp size={22} style={{ color: colors.textSecondary }} /> : <ChevronDown size={22} style={{ color: colors.textSecondary }} />}
            </button>
            <div className={open ? 'mt-3' : 'hidden'}>{children}</div>
        </div>
    )
}
