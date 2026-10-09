// src/app/(main)/inicio/sections/ViewServicesButton.tsx
//
// Botão "ver serviços" / "ver lojas" / "ver produtos" / "ver publicações" / "ver comunidades" / "ver pessoas" (pílula laranja → vermelha, igual ao
// "Ver todas" das outras seções da home). O número é um selo no canto de cima à direita, igual ao do carrinho:
// degradê laranja → vermelho com borda branca.
'use client'

import { HOME_GRADIENT } from './HomeSectionKit'

export function ViewServicesButton({ onClick, count, label = 'ver serviços', accent = HOME_GRADIENT }: { onClick: () => void; count?: number; label?: string; accent?: string }) {
    return (
        <button
            onClick={onClick}
            className="relative flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap flex-shrink-0"
            style={{ background: accent, color: '#ffffff', boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}
        >
            <span>{label}</span>
            {!!count && count > 0 && (
                <span
                    className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full text-white text-[10px] flex items-center justify-center font-black leading-none"
                    style={{ background: HOME_GRADIENT, border: '2px solid #ffffff', boxShadow: '0 2px 6px rgba(220,38,38,0.35)' }}
                >
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </button>
    )
}
