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
    disabled = false,
}: OrderSectionProps) {
    const { colors } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Valores padrão para o servidor (antes da hidratação)
    if (!mounted) {
        return (
            <section>
                <div
                    className="rounded-2xl p-5 flex flex-col gap-1"
                    style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                    }}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <div>
                            <Settings2 size={24} color="#6b7280" />
                        </div>
                        <h2 className="text-xl font-black" style={{ color: '#000000' }}>
                            Organizar Página
                        </h2>
                    </div>
                    <p className="text-sm mb-3" style={{ color: '#6b7280' }}>
                        Personalize a ordem das seções na sua página inicial.
                    </p>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        background: '#3b82f6',
                        color: '#ffffff',
                        opacity: 0.5,
                    }}>
                        <Settings2 size={18} />
                        Personalizar ordem
                    </div>
                </div>
            </section>
        )
    }

    // Renderização normal do cliente após hidratação
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const primaryButtonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '1rem',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all .2s',
        background: colors.accent,
        color: colors.accentText,
        border: `1px solid ${colors.accent}`,
        boxShadow: `0 4px 12px ${colors.accent}40`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
    }

    const secondaryButtonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        flex: 1,
        padding: '0.6rem .75rem',
        borderRadius: '.75rem',
        fontSize: '.8rem',
        fontWeight: 600,
        transition: 'all .2s',
        background: 'transparent',
        color: colors.textSecondary,
        border: `1px solid ${colors.border}`,
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
                    {dragHandle && <div>{dragHandle}</div>}

                    <div>
                        <Settings2
                            size={24}
                            style={{ color: colors.accent }}
                        />
                    </div>

                    <h2
                        className="text-xl font-black"
                        style={{ color: colors.textPrimary }}
                    >
                        Organizar Página
                    </h2>
                </div>

                <p
                    className="text-sm mb-3"
                    style={{ color: colors.textSecondary }}
                >
                    Personalize a ordem das seções na sua página inicial.
                </p>

                {!isEditing ? (
                    <button
                        onClick={onToggleEdit}
                        disabled={disabled}
                        style={primaryButtonStyle}
                        className="flex items-center justify-center gap-2"
                    >
                        <Settings2 size={18} />
                        Personalizar ordem
                    </button>
                ) : (
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={onSave}
                            style={primaryButtonStyle}
                            className="flex items-center justify-center gap-2"
                        >
                            <Save size={18} />
                            Salvar Ordem
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={onToggleEdit}
                                style={secondaryButtonStyle}
                            >
                                <X size={16} />
                                Cancelar
                            </button>

                            <button
                                onClick={onRestore}
                                style={secondaryButtonStyle}
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
                        style={{ color: colors.textSecondary }}
                    >
                        Arraste as seções para reordenar. Depois clique em{' '}
                        <strong style={{ color: colors.accent }}>
                            Salvar Ordem
                        </strong>
                        .
                    </p>
                )}
            </div>
        </section>
    )
}