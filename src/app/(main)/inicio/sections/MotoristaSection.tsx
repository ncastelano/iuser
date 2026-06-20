// src/app/(main)/inicio/sections/MotoristaSection.tsx
'use client'

import { ReactNode } from 'react'
import { Car } from 'lucide-react'
import { useTheme } from '@/app/theme'

interface MotoristaSectionProps {
    dragHandle?: ReactNode
}

export default function MotoristaSection({ dragHandle }: MotoristaSectionProps) {
    const { colors } = useTheme()

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    // Estilo do botão primário (destaque) – igual às seções Criar Loja e Configurações
    const primaryButtonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '1rem',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s',
        background: colors.accent,
        color: colors.accentText,
        border: `1px solid ${colors.accent}`,
        boxShadow: `0 4px 12px ${colors.accent}40`,
        cursor: 'pointer',
    }

    return (
        <section>
            <div
                className="rounded-2xl p-5 flex flex-col gap-1"
                style={{
                    background: cardBg,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex items-center gap-2 mb-1">
                    {dragHandle}
                    <Car size={20} style={{ color: colors.accent }} />
                    <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                        Sou um Motorista
                    </h2>
                </div>
                <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                    Cadastre-se para receber clientes
                </p>

                {/* Botão colorido com destaque */}
                <button
                    className="group flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold transition-all duration-200"
                    style={primaryButtonStyle}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.filter = 'brightness(0.95)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.filter = 'brightness(1)'
                    }}
                >
                    <Car size={18} />
                    Ativar modo motorista
                </button>
            </div>
        </section>
    )
}