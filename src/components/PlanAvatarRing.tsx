// src/components/PlanAvatarRing.tsx
//
// Borda do avatar: a que a pessoa escolheu usar (ex: "Eu sou brasileiro", verde com brilhos de amarelo e
// azul) gira em volta da foto. As bordas são conquistadas (plano Pré-pago, resgates, hierarquia) e
// escolhidas em Informações do Perfil → Bordas. Envolva qualquer avatar onde ele apareça, passando o id:
//
//   <PlanAvatarRing userId={profile.id}><img className="w-10 h-10 rounded-full" ... /></PlanAvatarRing>
//
// A moldura fica por fora do avatar (não muda o tamanho dele). Sem o plano, devolve o filho sem nada em volta.
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { borderGradient, requestAvatarBorder, subscribePlanRing } from '@/lib/planRing'

interface PlanAvatarRingProps {
    userId?: string | null
    children: ReactNode
    /** Largura da borda em px (padrão 2) */
    width?: number
    /** Raio do avatar: 'full' (redondo, padrão) ou um valor CSS, ex: '16px' */
    radius?: 'full' | string
    className?: string
}

/** As cores da borda que essa pessoa está usando (null = nenhuma). */
export function useAvatarBorder(userId?: string | null): string[] | null {
    const [colors, setColors] = useState<string[] | null>(() => requestAvatarBorder(userId) ?? null)
    useEffect(() => {
        const sync = () => setColors(requestAvatarBorder(userId) ?? null)
        sync()
        return subscribePlanRing(sync)
    }, [userId])
    return colors
}

/** Só o "tem borda?" (pra telas que precisam trocar o próprio visual em vez de envolver um avatar). */
export function usePlanRing(userId?: string | null): boolean {
    return useAvatarBorder(userId) !== null
}

/** A borda em si (sem consultar ninguém) — o que o PlanAvatarRing desenha quando a pessoa usa uma borda. */
export function PlanRingFrame({ children, width = 2, radius = 'full', className = '', colors }: Omit<PlanAvatarRingProps, 'userId'> & { colors?: string[] }) {
    const r = radius === 'full' ? '9999px' : radius
    const gradient = borderGradient(colors && colors.length >= 2 ? colors : ['#4ade80', '#86efac', '#fde047', '#38bdf8', '#3b82f6', '#22c55e'])
    return (
        <span className={`relative inline-flex flex-shrink-0 ${className}`} style={{ borderRadius: r, width: 'fit-content', height: 'fit-content' }}>
            {/* Anel que gira: gradiente cônico com as cores da borda, recortado só na borda */}
            <span
                aria-hidden
                className="plan-ring-spin pointer-events-none absolute"
                style={{
                    inset: -(width + 1),
                    borderRadius: r,
                    padding: width,
                    background: gradient,
                    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                    WebkitMaskComposite: 'xor',
                    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                    maskComposite: 'exclude',
                }}
            />
            {children}
            <style>{`
                @keyframes planRingSpin { to { transform: rotate(360deg); } }
                .plan-ring-spin { animation: planRingSpin 2.4s linear infinite; }
                @media (prefers-reduced-motion: reduce) { .plan-ring-spin { animation: none; } }
            `}</style>
        </span>
    )
}

export default function PlanAvatarRing({ userId, children, width = 2, radius = 'full', className = '' }: PlanAvatarRingProps) {
    const colors = useAvatarBorder(userId)
    if (!colors) return <>{children}</>
    return <PlanRingFrame colors={colors} width={width} radius={radius} className={className}>{children}</PlanRingFrame>
}
