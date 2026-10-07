// src/app/(main)/inicio/sections/ViewServicesButton.tsx
//
// Botão "ver serviços" / "ver lojas" (pílula laranja → vermelha, igual ao "Ver todas" das outras
// seções da home) usado ao lado dos títulos do card Serviços.
'use client'

import { HOME_GRADIENT } from './HomeSectionKit'

export function ViewServicesButton({ onClick, count, label = 'ver serviços' }: { onClick: () => void; count?: number; label?: string }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap flex-shrink-0"
            style={{ background: HOME_GRADIENT, color: '#ffffff', boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}
        >
            <span>{label}</span>
            {!!count && count > 0 && (
                <span
                    className="min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-black leading-none"
                    style={{ background: '#ffffff', color: '#ea580c' }}
                >
                    {count}
                </span>
            )}
        </button>
    )
}
