// src/components/PlanAvatarRing.tsx
//
// Moldura de agrado no avatar: quem usa o plano Pré-pago (e toda a hierarquia, do administrador pra
// baixo) tem uma borda verde esmeralda que gira, do verde claro ao escuro. Envolva qualquer avatar
// onde ele apareça, passando o id do usuário:
//
//   <PlanAvatarRing userId={profile.id}><img className="w-10 h-10 rounded-full" ... /></PlanAvatarRing>
//
// A moldura fica por fora do avatar (não muda o tamanho dele). Sem o plano, devolve o filho sem nada em volta.
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { requestPlanRing, subscribePlanRing } from '@/lib/planRing'

interface PlanAvatarRingProps {
    userId?: string | null
    children: ReactNode
    /** Largura da borda em px (padrão 2) */
    width?: number
    /** Raio do avatar: 'full' (redondo, padrão) ou um valor CSS, ex: '16px' */
    radius?: 'full' | string
    className?: string
}

/** Só o "tem moldura?" (pra telas que precisam trocar o próprio visual em vez de envolver um avatar). */
export function usePlanRing(userId?: string | null): boolean {
    const [ring, setRing] = useState<boolean>(() => requestPlanRing(userId) === true)
    useEffect(() => {
        const sync = () => setRing(requestPlanRing(userId) === true)
        sync()
        return subscribePlanRing(sync)
    }, [userId])
    return ring
}

/** A moldura em si (sem consultar plano nenhum) — o que o PlanAvatarRing desenha quando o usuário tem direito a ela. */
export function PlanRingFrame({ children, width = 2, radius = 'full', className = '' }: Omit<PlanAvatarRingProps, 'userId'>) {
    const r = radius === 'full' ? '9999px' : radius
    return (
        <span className={`relative inline-flex flex-shrink-0 ${className}`} style={{ borderRadius: r, width: 'fit-content', height: 'fit-content' }}>
            {/* Anel que gira: gradiente cônico do esmeralda claro ao escuro, recortado só na borda */}
            <span
                aria-hidden
                className="plan-ring-spin pointer-events-none absolute"
                style={{
                    inset: -(width + 1),
                    borderRadius: r,
                    padding: width,
                    background: 'conic-gradient(from 0deg, #a7f3d0, #34d399, #10b981, #047857, #064e3b, #047857, #10b981, #34d399, #a7f3d0)',
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
    const ring = usePlanRing(userId)
    if (!ring) return <>{children}</>
    return <PlanRingFrame width={width} radius={radius} className={className}>{children}</PlanRingFrame>
}
