// components/OrderSection.tsx
'use client'

import { ReactNode } from 'react'
import { Settings2, Save, RotateCcw } from 'lucide-react'
import { useTheme } from '@/app/theme'

interface OrderSectionProps {
    dragHandle?: ReactNode
    isEditing: boolean
    onToggleEdit: () => void
    onSave: () => void
    onRestore: () => void
    disabled?: boolean
}

// Helper para converter hex em rgb
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

    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    return (
        <section>
            <div className="flex items-center gap-2 mb-3">
                {dragHandle}
                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                    Organizar Página
                </h2>
            </div>

            <div
                className="rounded-2xl p-5 flex flex-col gap-4"
                style={{
                    background: cardBg,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={onToggleEdit}
                        disabled={disabled}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:opacity-50"
                        style={{
                            background: isEditing ? colors.accent : colors.background,
                            color: isEditing ? colors.accentText : colors.textPrimary,
                            border: `1px solid ${isEditing ? colors.accent : colors.border}`,
                        }}
                    >
                        <Settings2 size={16} />
                        {isEditing ? 'Modo Edição' : 'Ordenar Widgets'}
                    </button>

                    {isEditing && (
                        <>
                            <button
                                onClick={onSave}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200"
                                style={{
                                    background: colors.accent,
                                    color: colors.accentText,
                                    boxShadow: colors.shadow,
                                }}
                            >
                                <Save size={16} />
                                Salvar Ordem
                            </button>
                            <button
                                onClick={onRestore}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200"
                                style={{
                                    background: 'transparent',
                                    color: colors.textSecondary,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                <RotateCcw size={16} />
                                Restaurar Padrão
                            </button>
                        </>
                    )}
                </div>
                {isEditing && (
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        Arraste as seções para reordenar. Depois clique em{' '}
                        <strong style={{ color: colors.accent }}>Salvar Ordem</strong>.
                    </p>
                )}
            </div>
        </section>
    )
}