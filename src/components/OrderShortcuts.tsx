// components/OrderShortcuts.tsx
'use client'

import { GripVertical, Save, RotateCcw } from 'lucide-react'
import { useTheme } from '@/app/theme'

interface OrderShortcutsProps {
    isEditing: boolean
    onToggleEdit: () => void
    onSave: () => void
    onRestore: () => void
    disabled?: boolean
}

export default function OrderShortcuts({
    isEditing,
    onToggleEdit,
    onSave,
    onRestore,
    disabled,
}: OrderShortcutsProps) {
    const { colors } = useTheme()

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                onClick={onToggleEdit}
                disabled={disabled}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:opacity-50"
                style={{
                    background: isEditing ? colors.accent : colors.background,
                    color: isEditing ? colors.accentText : colors.textSecondary,
                    border: `1px solid ${colors.border}`,
                    backdropFilter: 'blur(10px)',
                }}
            >
                <GripVertical size={16} />
                {isEditing ? 'Editando...' : 'Ordenar Widget'}
            </button>

            {isEditing && (
                <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                    <button
                        onClick={onSave}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200"
                        style={{
                            background: colors.accentLight,
                            color: colors.accent,
                            border: `1px solid ${colors.accent}`,
                        }}
                    >
                        <Save size={14} />
                        Salvar ordenação
                    </button>
                    <button
                        onClick={onRestore}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200"
                        style={{
                            background: 'transparent',
                            color: colors.textSecondary,
                            border: `1px solid ${colors.border}`,
                        }}
                    >
                        <RotateCcw size={14} />
                        Restaurar anterior
                    </button>
                </div>
            )}
        </div>
    )
}