// src/app/(main)/inicio/sections/ViewServicesButton.tsx
//
// Botão "ver serviços" (pílula laranja → vermelha, igual ao "Ver todas" das outras
// seções da home) usado ao lado dos títulos do card Serviços.
'use client'

import { ArrowRight } from 'lucide-react'
import { HOME_GRADIENT } from './HomeSectionKit'

export function ViewServicesButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap flex-shrink-0"
            style={{ background: HOME_GRADIENT, color: '#ffffff', boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}
        >
            <span>ver serviços</span>
            <ArrowRight className="w-3.5 h-3.5" />
        </button>
    )
}
