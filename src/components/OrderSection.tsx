// src/components/OrderSection.tsx
'use client'

import { ReactNode, useState, useEffect } from 'react'
import { Settings2, Save, RotateCcw, X, Layout } from 'lucide-react'
import { useTheme } from '@/app/theme'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface OrderSectionProps {
    dragHandle?: ReactNode
    isEditing: boolean
    onToggleEdit: () => void
    onSave: () => void
    onRestore: () => void
    disabled?: boolean
    defaultOrder?: string[] // Nova prop para a ordem padrão
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
    defaultOrder = [], // Valor padrão vazio
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
                        borderRadius: '9999px',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        background: GRADIENT,
                        color: '#ffffff',
                        opacity: 0.5,
                    }}>
                        <Layout size={18} />
                        Personalizar ordem
                    </div>
                </div>
            </section>
        )
    }

    // Renderização normal do cliente após hidratação
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    // ===== STYLE PARA BOTÕES PILL =====
    const pillButtonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.25rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        border: 'none',
    }

    const primaryButtonStyle: React.CSSProperties = {
        ...pillButtonStyle,
        background: GRADIENT,
        color: '#ffffff',
        boxShadow: `0 4px 12px #f9731640`,
    }

    const secondaryButtonStyle: React.CSSProperties = {
        ...pillButtonStyle,
        flex: 1,
        background: 'transparent',
        color: colors.textSecondary,
        border: `1px solid ${colors.border}`,
        boxShadow: 'none',
    }

    // Função para restaurar com confirmação
    const handleRestore = () => {
        if (defaultOrder.length === 0) {
            // Se não tiver ordem padrão definida, usa o comportamento antigo
            onRestore()
            return
        }

        if (window.confirm('Deseja restaurar a ordem padrão das seções?')) {
            onRestore()
        }
    }

    return (
        <section>
            <div
                className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
                style={{
                    background: cardBg,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                <div className="flex items-center gap-4">
                    {dragHandle && <div>{dragHandle}</div>}

                    {/* Ícone com gradiente laranja-vermelho */}
                    <div
                        className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 4px 12px #f9731640`,
                        }}
                    >
                        <Settings2 size={28} />
                    </div>

                    <div>
                        <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                            Organizar Página
                        </h2>
                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                            Personalize a ordem das seções na sua página inicial.
                        </p>
                        {defaultOrder.length > 0 && (
                            <p className="text-xs mt-0.5 opacity-60" style={{ color: colors.textSecondary }}>
                                {defaultOrder.length} seções disponíveis
                            </p>
                        )}
                    </div>
                </div>

                {!isEditing ? (
                    <button
                        onClick={onToggleEdit}
                        disabled={disabled}
                        className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 4px 14px #f9731660`,
                        }}
                    >
                        <Layout size={16} />
                        Personalizar ordem
                    </button>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-shrink-0">
                        <button
                            onClick={onSave}
                            className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 14px #f9731660`,
                            }}
                        >
                            <Save size={16} />
                            Salvar Ordem
                        </button>

                        <button
                            onClick={onToggleEdit}
                            className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:opacity-70 active:scale-95"
                            style={{
                                background: 'transparent',
                                color: colors.textSecondary,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <X size={16} />
                            Cancelar
                        </button>

                        <button
                            onClick={handleRestore}
                            className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:opacity-70 active:scale-95"
                            style={{
                                background: 'transparent',
                                color: colors.textSecondary,
                                border: `1px solid ${colors.border}`,
                            }}
                            title="Restaurar ordem padrão"
                        >
                            <RotateCcw size={16} />
                            Restaurar Padrão
                        </button>
                    </div>
                )}
            </div>

            {isEditing && (
                <div className="mt-3 px-1">
                    <p
                        className="text-xs"
                        style={{ color: colors.textSecondary }}
                    >
                        Arraste as seções para reordenar. Depois clique em{' '}
                        <strong style={{ color: '#f97316' }}>
                            Salvar Ordem
                        </strong>
                        .
                        {defaultOrder.length > 0 && (
                            <span> Clique em <strong style={{ color: '#f97316' }}>Restaurar Padrão</strong> para voltar à ordem original.</span>
                        )}
                    </p>
                </div>
            )}
        </section>
    )
}