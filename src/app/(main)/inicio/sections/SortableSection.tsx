// src/app/(main)/inicio/sections/SortableSection.tsx

'use client'

import { ReactElement, cloneElement } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useTheme } from '@/app/theme'

interface SortableSectionProps {
    id: string
    children: ReactElement
    isEditing?: boolean
    onMoveUp?: (id: string) => void
    onMoveDown?: (id: string) => void
    isFirst?: boolean
    isLast?: boolean
}

export default function SortableSection({
    id,
    children,
    isEditing = false,
    onMoveUp,
    onMoveDown,
    isFirst = false,
    isLast = false,
}: SortableSectionProps) {
    const { colors } = useTheme()

    // Botões de controle para mover a seção
    const controls = isEditing ? (
        <div className="flex items-center gap-1">
            <button
                type="button"
                onClick={() => onMoveUp?.(id)}
                disabled={isFirst}
                className={`
                    p-1.5 rounded-lg transition-all
                    ${isFirst
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:bg-white/20 cursor-pointer'
                    }
                `}
                style={{
                    color: isFirst ? colors.textSecondary : colors.accent,
                }}
                title="Mover para cima"
            >
                <ChevronUp className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => onMoveDown?.(id)}
                disabled={isLast}
                className={`
                    p-1.5 rounded-lg transition-all
                    ${isLast
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:bg-white/20 cursor-pointer'
                    }
                `}
                style={{
                    color: isLast ? colors.textSecondary : colors.accent,
                }}
                title="Mover para baixo"
            >
                <ChevronDown className="w-4 h-4" />
            </button>
        </div>
    ) : null

    // Se não estiver em modo de edição, renderiza apenas o children
    if (!isEditing) {
        return children
    }

    // Em modo de edição, envolve com os controles
    return (
        <div className="relative">
            {cloneElement(children, {
                dragHandle: controls,
            })}
        </div>
    )
}