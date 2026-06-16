// src/app/(main)/inicio/sections/TransporteSection.tsx
'use client'

import { ReactNode } from 'react'
import { ChevronRight, MapPinned } from 'lucide-react'
import { useTheme } from '@/app/theme'

interface TransporteSectionProps {
    dragHandle?: ReactNode
}

export default function TransporteSection({ dragHandle }: TransporteSectionProps) {
    const { colors } = useTheme()

    return (
        <section>
            <div className="flex items-center gap-2 mb-3">
                {dragHandle}
                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                    Transporte
                </h2>
            </div>

            <div
                className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:shadow-lg transition-all"
                style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                    boxShadow: colors.shadow,
                }}
            >
                <MapPinned className="w-8 h-8" style={{ color: colors.accent }} />

                <div className="flex-1">
                    <h3 className="font-bold">Ir para algum lugar</h3>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Encontre seu motorista!</p>
                </div>

                <ChevronRight className="w-5 h-5" style={{ color: colors.textSecondary }} />
            </div>
        </section>
    )
}