// components/OrderSection.tsx
'use client'

import { ReactNode, useState, useEffect } from 'react'
import { Settings2, Save, RotateCcw, X } from 'lucide-react'
import { useTheme } from '@/app/theme'

interface OrderSectionProps {
    dragHandle?: ReactNode
    isEditing: boolean
    onToggleEdit: () => void
    onSave: () => void
    onRestore: () => void
    disabled?: boolean
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
}

export default function OrderSection({
    dragHandle,
    isEditing,
    onToggleEdit,
    onSave,
    onRestore,
    disabled,
}: OrderSectionProps) {
    const { colors } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    // Fallback colors for server-side rendering
    const fallbackAccent = '#6b7280'
    const fallbackTextPrimary = '#000000'
    const fallbackTextSecondary = '#6b7280'
    const fallbackBorder = '#d1d5db'

    // Usar cores fixas no servidor e dinâmicas no cliente
    const accentColor = mounted ? colors.accent : fallbackAccent
    const textPrimaryColor = mounted ? colors.textPrimary : fallbackTextPrimary
    const textSecondaryColor = mounted ? colors.textSecondary : fallbackTextSecondary
    const borderColor = mounted ? colors.border : fallbackBorder
    const shadowColor = mounted ? colors.shadow : '0 8px 32px rgba(0,0,0,0.08)'
    const backgroundColor = mounted ? cardBg : 'rgba(249, 250, 251, 0.6)'
    const accentTextColor = mounted ? colors.accentText : '#ffffff'

    // Estilo do botão primário
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
        background: accentColor,
        color: accentTextColor,
        border: `1px solid ${accentColor}`,
        boxShadow: mounted ? `0 4px 12px ${colors.accent}40` : `0 4px 12px ${fallbackAccent}40`,
        cursor: 'pointer',
    }

    // Estilo para botão secundário
    const secondaryButtonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        flex: 1,
        padding: '0.6rem 0.75rem',
        borderRadius: '0.75rem',
        fontSize: '0.8rem',
        fontWeight: 600,
        transition: 'all 0.2s',
        background: 'transparent',
        color: textSecondaryColor,
        border: `1px solid ${borderColor}`,
        cursor: 'pointer',
    }

    // Renderização consistente - SEMPRE mostra Settings2 + h2, independente de mounted
    return (
        <section>
            <div
                className="rounded-2xl p-5 flex flex-col gap-1"
                style={{
                    background: backgroundColor,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${borderColor}`,
                    boxShadow: shadowColor,
                }}
            >
                {/* Título com ícone e dragHandle */}
                <div className="flex items-center gap-2 mb-1">
                    {mounted && dragHandle}
                    <Settings2
                        size={24}
                        style={{
                            color: accentColor
                        }}
                    />
                    <h2
                        className="text-xl font-black"
                        style={{
                            color: textPrimaryColor
                        }}
                    >
                        Organizar Página
                    </h2>
                </div>

                {/* Descrição */}
                <p
                    className="text-sm mb-3"
                    style={{
                        color: textSecondaryColor
                    }}
                >
                    Personalize a ordem das seções na sua página inicial.
                </p>

                {/* Botões */}
                {!isEditing ? (
                    <button
                        onClick={onToggleEdit}
                        disabled={disabled}
                        className="group flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-50"
                        style={primaryButtonStyle}
                        onMouseEnter={(e) => {
                            if (!disabled && mounted) e.currentTarget.style.filter = 'brightness(0.95)'
                        }}
                        onMouseLeave={(e) => {
                            if (!disabled && mounted) e.currentTarget.style.filter = 'brightness(1)'
                        }}
                    >
                        <Settings2 size={18} />
                        Personalizar ordem
                    </button>
                ) : (
                    <div className="flex flex-col gap-3">
                        {/* Botão principal "Salvar Ordem" */}
                        <button
                            onClick={onSave}
                            className="group flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold transition-all duration-200"
                            style={primaryButtonStyle}
                            onMouseEnter={(e) => {
                                if (mounted) e.currentTarget.style.filter = 'brightness(0.95)'
                            }}
                            onMouseLeave={(e) => {
                                if (mounted) e.currentTarget.style.filter = 'brightness(1)'
                            }}
                        >
                            <Save size={18} />
                            Salvar Ordem
                        </button>

                        {/* Botões secundários lado a lado */}
                        <div className="flex gap-2">
                            <button
                                onClick={onToggleEdit}
                                className="group flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                                style={secondaryButtonStyle}
                                onMouseEnter={(e) => {
                                    if (mounted) {
                                        e.currentTarget.style.background = colors.accent
                                        e.currentTarget.style.color = colors.accentText
                                        e.currentTarget.style.borderColor = colors.accent
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (mounted) {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = colors.textSecondary
                                        e.currentTarget.style.borderColor = colors.border
                                    }
                                }}
                            >
                                <X size={16} />
                                Cancelar
                            </button>

                            <button
                                onClick={onRestore}
                                className="group flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                                style={secondaryButtonStyle}
                                onMouseEnter={(e) => {
                                    if (mounted) {
                                        e.currentTarget.style.background = colors.accent
                                        e.currentTarget.style.color = colors.accentText
                                        e.currentTarget.style.borderColor = colors.accent
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (mounted) {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = colors.textSecondary
                                        e.currentTarget.style.borderColor = colors.border
                                    }
                                }}
                            >
                                <RotateCcw size={16} />
                                Restaurar padrão
                            </button>
                        </div>
                    </div>
                )}

                {isEditing && (
                    <p
                        className="text-xs mt-2"
                        style={{
                            color: textSecondaryColor
                        }}
                    >
                        Arraste as seções para reordenar. Depois clique em{' '}
                        <strong style={{ color: accentColor }}>
                            Salvar Ordem
                        </strong>.
                    </p>
                )}
            </div>
        </section>
    )
}