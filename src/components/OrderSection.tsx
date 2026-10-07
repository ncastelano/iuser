// src/components/OrderSection.tsx
'use client'

import { ReactNode, useState, useEffect } from 'react'
import { Settings2, Layout } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { HOME_GRADIENT } from '@/app/(main)/inicio/sections/HomeSectionKit'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = HOME_GRADIENT

interface OrderSectionProps {
    dragHandle?: ReactNode
    isEditing: boolean
    onToggleEdit: () => void
    onSave: () => void
    onRestore: () => void
    disabled?: boolean
    defaultOrder?: string[] // Nova prop para a ordem padrão
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
        color: colors.textPrimary,
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
            {/* Mesmo desenho das outras seções da home: título e frase à esquerda, botão em pílula à direita, sem card */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {dragHandle}
                    <div className="min-w-0">
                        <h2 className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>Organizar Página</h2>
                        <p className="text-xs opacity-60" style={{ color: colors.textPrimary }}>
                            Personalize a ordem das seções na sua página inicial
                            {defaultOrder.length > 0 && ` · ${defaultOrder.length} seções`}
                        </p>
                    </div>
                </div>

                {!isEditing && (
                    <button
                        onClick={onToggleEdit}
                        disabled={disabled}
                        className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                        style={{ background: GRADIENT, color: '#ffffff', boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}
                    >
                        Personalizar ordem
                    </button>
                )}
            </div>

            {isEditing && (
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={onSave}
                        className="flex-1 py-2 rounded-full font-black text-xs transition-all hover:scale-[1.02] active:scale-95 whitespace-nowrap"
                        style={{ background: GRADIENT, color: '#ffffff', boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}
                    >
                        Salvar ordem
                    </button>
                    <button
                        onClick={onToggleEdit}
                        className="flex-1 py-2 rounded-full font-black text-xs transition-all hover:opacity-70 active:scale-95 whitespace-nowrap"
                        style={{ background: 'transparent', color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleRestore}
                        className="flex-1 py-2 rounded-full font-black text-xs transition-all hover:opacity-70 active:scale-95 whitespace-nowrap"
                        style={{ background: 'transparent', color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        title="Restaurar ordem padrão"
                    >
                        Restaurar padrão
                    </button>
                </div>
            )}

            {isEditing && (
                <div className="mt-3 px-1">
                    <p
                        className="text-xs"
                        style={{ color: colors.textPrimary }}
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