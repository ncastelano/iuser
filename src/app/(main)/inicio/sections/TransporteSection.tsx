// src/app/(main)/inicio/sections/TransporteSection.tsx
'use client'

import { ReactNode, useEffect } from 'react'
import { CarTaxiFront, Bike, Truck } from 'lucide-react'
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

interface TransporteSectionProps {
    dragHandle?: ReactNode
    onBreveStatusChange?: (isBreve: boolean) => void
}

export default function TransporteSection({ dragHandle, onBreveStatusChange }: TransporteSectionProps) {
    const { colors } = useTheme()

    // Notifica o pai que esta seção está "em breve"
    useEffect(() => {
        onBreveStatusChange?.(true)
        return () => onBreveStatusChange?.(false)
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
        background: colors.accent,
        color: colors.accentText,
        border: `1px solid ${colors.accent}`,
        boxShadow: `0 4px 14px ${colors.accent}60`,
        opacity: 0.5,
        cursor: 'not-allowed',
    }

    return (
        <section>
            <div
                className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                {/* Badge "Em breve" */}
                <span
                    className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide"
                    style={{
                        background: `${colors.accent}20`,
                        color: colors.accent,
                        border: `1px solid ${colors.accent}40`,
                    }}
                >
                    Em breve
                </span>

                <div className="flex items-center gap-4">
                    {/* Ícone com gradiente (usando CarTaxiFront para representar o serviço) */}
                    <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                            color: colors.accentText,
                        }}
                    >
                        <CarTaxiFront size={28} />
                    </div>

                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                            Ofereça transporte e ganhe dinheiro
                        </h3>
                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                            Use seu carro, moto ou bike para fazer corridas e entregas quando quiser.
                        </p>
                    </div>
                </div>

                <button
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-lg whitespace-nowrap"
                    style={buttonStyle}
                    disabled
                    aria-disabled="true"
                >
                    <Truck size={16} />
                    Seja um parceiro em breve
                </button>
            </div>
        </section>
    )
}