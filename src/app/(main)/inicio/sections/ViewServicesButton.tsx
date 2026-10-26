// src/app/(main)/inicio/sections/ViewServicesButton.tsx
//
// Botão "ver serviços" / "ver lojas" / "ver produtos" / "ver publicações" / "ver comunidades" / "ver pessoas" (pílula laranja → vermelha, igual ao
// "Ver todas" das outras seções da home). Sem selo de contagem: o total já aparece no subtítulo da seção.
'use client'

import { HOME_GRADIENT } from './HomeSectionKit'

export function ViewServicesButton({ onClick, label = 'ver serviços', accent = HOME_GRADIENT }: { onClick: () => void; label?: string; accent?: string }) {
    return (
        <button
            onClick={onClick}
            className="relative flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap flex-shrink-0"
            style={{ background: accent, color: '#ffffff', boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}
        >
            <span>{label}</span>
        </button>
    )
}
