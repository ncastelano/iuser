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

import { ReactNode, useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { borderGradient, requestAvatarBorder, subscribePlanRing } from '@/lib/planRing'

interface PlanAvatarRingProps {
    userId?: string | null
    children: ReactNode
    /** Largura da borda em px (padrão 2) */
    width?: number
    /** Raio do avatar: 'full' (redondo, padrão) ou um valor CSS, ex: '16px' */
    radius?: 'full' | string
    className?: string
    /** Clicar no avatar com borda leva ao perfil da pessoa (padrão: sim; a própria pessoa não é levada) */
    linkToProfile?: boolean
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

/** A borda em si (sem consultar ninguém) — o que o PlanAvatarRing desenha quando a pessoa usa uma borda.
 *  Redonda ('full'): gira o anel. Com cantos arredondados (quadrado/retângulo): o anel NÃO pode girar o próprio
 *  retângulo (viraria um quadrado rodando), então o que gira é o ângulo do gradiente, com o anel parado. */
export function PlanRingFrame({ children, width = 2, radius = 'full', className = '', colors, onClick }: Omit<PlanAvatarRingProps, 'userId' | 'linkToProfile'> & { colors?: string[]; onClick?: (e: React.MouseEvent) => void }) {
    const round = radius === 'full'
    const r = round ? '9999px' : radius
    const list = colors && colors.length >= 2 ? colors : ['#4ade80', '#86efac', '#fde047', '#38bdf8', '#3b82f6', '#22c55e']
    const stops = [...list, list[0]].map((c, i) => `${c} ${Math.round((i / list.length) * 360)}deg`).join(', ')
    return (
        <span
            className={`relative inline-flex flex-shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
            style={{ borderRadius: r, width: 'fit-content', height: 'fit-content' }}
            onClick={onClick}
        >
            <span
                aria-hidden
                className={`${round ? 'plan-ring-spin' : 'plan-ring-inset'} pointer-events-none absolute`}
                style={{
                    inset: -(width + 1),
                    borderRadius: round ? r : `calc(${r} + ${width + 1}px)`,
                    padding: width,
                    background: round ? borderGradient(list) : `conic-gradient(from var(--plan-ring-angle), ${stops})`,
                    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                    WebkitMaskComposite: 'xor',
                    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                    maskComposite: 'exclude',
                }}
            />
            {children}
            <style>{`
                @property --plan-ring-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
                @keyframes planRingSpin { to { transform: rotate(360deg); } }
                @keyframes planRingInset { to { --plan-ring-angle: 360deg; } }
                .plan-ring-spin { animation: planRingSpin 2.4s linear infinite; }
                .plan-ring-inset { animation: planRingInset 2.4s linear infinite; }
                @media (prefers-reduced-motion: reduce) { .plan-ring-spin, .plan-ring-inset { animation: none; } }
            `}</style>
        </span>
    )
}

/** Borda por DENTRO de um card/foto que ocupa o quadrado todo (o pai precisa ser `relative` e `overflow-hidden`).
 *  Gira trocando o ângulo do gradiente (e não rotacionando o quadrado, que sairia do card). */
export function PlanRingInset({ userId, width = 3, radius = '12px' }: { userId?: string | null; width?: number; radius?: string }) {
    const colors = useAvatarBorder(userId)
    if (!colors) return null
    const stops = [...colors, colors[0]].map((c, i) => `${c} ${Math.round((i / colors.length) * 360)}deg`).join(', ')
    return (
        <>
            <span
                aria-hidden
                className="plan-ring-inset pointer-events-none absolute inset-0 z-10"
                style={{
                    borderRadius: radius,
                    padding: width,
                    background: `conic-gradient(from var(--plan-ring-angle), ${stops})`,
                    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                    WebkitMaskComposite: 'xor',
                    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                    maskComposite: 'exclude',
                }}
            />
            <style>{`
                @property --plan-ring-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
                @keyframes planRingInset { to { --plan-ring-angle: 360deg; } }
                .plan-ring-inset { animation: planRingInset 2.4s linear infinite; }
                @media (prefers-reduced-motion: reduce) { .plan-ring-inset { animation: none; } }
            `}</style>
        </>
    )
}

// slug de cada pessoa, buscado só na hora do clique (uma vez)
const slugCache = new Map<string, string | null>()

export default function PlanAvatarRing({ userId, children, width = 2, radius = 'full', className = '', linkToProfile = true }: PlanAvatarRingProps) {
    const colors = useAvatarBorder(userId)
    const router = useRouter()
    const pathname = usePathname()
    const { userId: viewerId } = useProfile()

    // Onde tem borda personalizada, o avatar é um atalho pro perfil da pessoa
    const go = useCallback(async (e: React.MouseEvent) => {
        if (!userId) return
        e.stopPropagation()
        let slug = slugCache.get(userId)
        if (slug === undefined) {
            const { data } = await supabase.from('profiles').select('profileSlug:"profileSlug"').eq('id', userId).maybeSingle()
            slug = (data as { profileSlug?: string } | null)?.profileSlug || null
            slugCache.set(userId, slug)
        }
        if (slug && pathname !== `/${slug}`) router.push(`/${slug}`)
    }, [userId, router, pathname])

    if (!colors) return <>{children}</>
    const linkable = linkToProfile && !!userId && userId !== viewerId
    return <PlanRingFrame colors={colors} width={width} radius={radius} className={className} onClick={linkable ? go : undefined}>{children}</PlanRingFrame>
}
