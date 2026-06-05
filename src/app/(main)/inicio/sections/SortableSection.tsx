// src/app/(main)/inicio/SortableSection.tsx

'use client'

import {
    cloneElement,
    ReactElement,
} from 'react'

import {
    useSortable,
} from '@dnd-kit/sortable'

import {
    CSS,
} from '@dnd-kit/utilities'

import {
    GripVertical,
} from 'lucide-react'

interface SortableSectionProps {
    id: string
    children: ReactElement
}

export default function SortableSection({
    id,
    children,
}: SortableSectionProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const dragHandle = (
        <button
            type="button"
            {...attributes}
            {...listeners}
            className="
                p-2
                rounded-lg
                hover:bg-white/60
                transition-colors
                cursor-grab
                active:cursor-grabbing
            "
        >
            <GripVertical className="w-5 h-5 text-gray-500" />
        </button>
    )

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                transition-all
                duration-200
                ${isDragging
                    ? 'scale-105 opacity-80 z-50'
                    : ''
                }
            `}
        >
            {cloneElement(children, {
                dragHandle,
            })}
        </div>
    )
}