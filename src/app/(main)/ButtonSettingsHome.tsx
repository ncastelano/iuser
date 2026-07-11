// src/app/(main)/ButtonSettingsHome.tsx
'use client'

import { Settings, Palette } from 'lucide-react'
import { useTheme } from '@/app/theme'

/* ─── Helper para converter hex em RGB ─── */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
}

interface ButtonSettingsHomeProps {
    onClick?: () => void
}

export default function ButtonSettingsHome({ onClick }: ButtonSettingsHomeProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    return (
        <div
            className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                border: `1px solid ${colors.border}`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
            }}
        >
            <div className="flex items-center gap-4">
                {/* Ícone de configurações com gradiente do tema */}
                <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center"
                    style={{
                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                        color: colors.accentText,
                    }}
                >
                    <Settings size={28} />
                </div>
                <div>
                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                        Personalize sua página inicial
                    </h3>
                    <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                        Altere o plano de fundo, reordene seções e ajuste as cores.
                    </p>
                </div>
            </div>
            <button
                onClick={onClick}
                className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg"
                style={{
                    background: colors.accent,
                    color: colors.accentText,
                    boxShadow: `0 4px 14px ${colors.accent}60`,
                }}
            >
                <Palette size={16} />
                Configurar
            </button>
        </div>
    )
}