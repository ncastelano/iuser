// src/components/store/StoreFrame.tsx
//
// A MOLDURA DO NÍVEL DA LOJA em volta do logo (ou do cartão). Quem decide o nível é o banco (`stores.store_level`, pelos pontos do Outdoor);
// o desenho de cada nível mora em `modules/store-levels` (`frameSpec`). A moldura da loja é QUADRADA arredondada e tem cores próprias — o
// anel do PERFIL é redondo e de metal (PlanAvatarRing) — para loja e pessoa nunca se confundirem. Nível 0 não desenha nada: devolve os
// filhos como estão (o layout não muda). A moldura cresce PARA FORA (padding), então não rouba espaço do logo.
'use client'

import { ReactNode } from 'react'
import { Crown } from 'lucide-react'
import { useStoreLevels } from '@/hooks/useStoreLevels'
import { frameSpec, levelOf } from '@/modules/store-levels'

interface Props {
    /** `stores.store_level` (0 = sem moldura) */
    level: number | null | undefined
    /** lado do logo (px) — só serve para dimensionar a moldura; num cartão que ocupa a coluna passe `ring` e `innerRadius` */
    size?: number
    /** raio do que está DENTRO (o logo); a moldura soma a espessura por cima */
    innerRadius?: number
    ring?: number
    /** cor de fundo atrás (o anel duplo do nível 3 pinta uma faixa dela) */
    bg?: string
    /** ocupa a largura toda (cartão) em vez de se ajustar ao conteúdo */
    fluid?: boolean
    /** corta o conteúdo no raio interno (logo sim; cartão que já tem cantos e sombra própria, não) */
    clip?: boolean
    className?: string
    children: ReactNode
}

export default function StoreFrame({ level, size = 48, innerRadius, ring, bg, fluid = false, clip = true, className = '', children }: Props) {
    const levels = useStoreLevels()
    const spec = frameSpec(levelOf(levels, level), size, { ring, bg })
    if (!spec) return <>{children}</>
    const inner = innerRadius ?? Math.round(size * 0.26)
    const outer = inner + spec.ring
    return (
        <span className={`relative ${fluid ? 'block' : 'inline-block'} ${className}`} style={{ padding: spec.ring, borderRadius: outer, boxShadow: spec.glow }} data-store-level={level}>
            <span aria-hidden className="absolute inset-0 overflow-hidden" style={{ borderRadius: outer, background: spec.background ?? undefined }}>
                {spec.conic && <span className="absolute motion-reduce:animate-none" style={{ inset: '-60%', background: spec.conic, animation: 'storeFrameSpin 5s linear infinite' }} />}
            </span>
            <span className={`relative block ${clip ? 'overflow-hidden' : ''}`} style={{ borderRadius: inner }}>{children}</span>
            {spec.crown && (
                <span aria-hidden className="absolute flex items-center justify-center rounded-full" style={{ right: -size * 0.08, top: -size * 0.1, width: size * 0.34, height: size * 0.34, background: '#fbbf24', color: '#7c2d12', boxShadow: `0 0 0 2px ${bg ?? '#fff'}` }}>
                    <Crown size={Math.round(size * 0.2)} />
                </span>
            )}
        </span>
    )
}
