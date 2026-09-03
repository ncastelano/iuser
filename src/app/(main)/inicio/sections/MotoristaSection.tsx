// src/app/(main)/inicio/sections/MotoristaSection.tsx
'use client'

import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Car, User, Package } from 'lucide-react'
import { useTheme } from '@/app/theme'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const RIDE_SHORTCUTS = [
    { id: 'para-mim', label: 'Pra mim', icon: Car },
    { id: 'buscar-alguem', label: 'Buscar alguém', icon: User },
    { id: 'entregar-algo', label: 'Entregar algo', icon: Package },
]

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

interface MotoristaSectionProps {
    dragHandle?: ReactNode
    onBreveStatusChange?: (isBreve: boolean) => void
}

export default function MotoristaSection({ dragHandle, onBreveStatusChange }: MotoristaSectionProps) {
    const { colors } = useTheme()
    const router = useRouter()

    useEffect(() => {
        onBreveStatusChange?.(false)
    }, [onBreveStatusChange])

    const surfaceRgb = hexToRgb(colors.surface)

    const buttonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.5rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s',
        background: GRADIENT,
        color: '#ffffff',
        border: 'none',
        boxShadow: `0 4px 12px #f9731640`,
        cursor: 'pointer',
    }

    return (
        <section>
            <div
                className="rounded-2xl p-6 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                    transform: 'translateZ(0)',
                    willChange: 'transform',
                }}
            >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {dragHandle && <div>{dragHandle}</div>}

                        {/* Ícone com gradiente laranja-vermelho - igual ao ButtonSettingsHome */}
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                        >
                            <Car size={28} />
                        </div>

                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Motorista Particular
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                Chame um motorista para te levar aonde quiser
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => router.push('/pedir-corrida')}
                        className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap hover:scale-105 active:scale-95"
                        style={buttonStyle}
                    >
                        <Car size={16} />
                        pedir corrida
                    </button>
                </div>

                {/* Atalhos rápidos de pedido de corrida */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {RIDE_SHORTCUTS.map((shortcut) => {
                        const Icon = shortcut.icon
                        return (
                            <button
                                key={shortcut.id}
                                onClick={() => router.push(`/pedir-corrida?tipo=${shortcut.id}`)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95"
                                style={{
                                    background: `${colors.border}30`,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                            >
                                <Icon size={14} />
                                {shortcut.label}
                            </button>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}