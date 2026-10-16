// src/versions/shared/screens/CarrinhoSkeleton.tsx
//
// Esqueleto do carrinho: as mesmas peças da tela de verdade (abas, resumo, cartões de loja com itens e botão de
// finalizar). Os dados entram no lugar e a página "termina de preencher", sem pulo de layout.
'use client'

import { useTheme } from '@/app/contexts/theme'
import { Shimmer, SkeletonRegion } from '@/components/Skeleton'

function StoreCardSkeleton({ items }: { items: number }) {
    const { colors } = useTheme()
    return (
        <div className="rounded-3xl mb-4 overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            {/* loja: logo, nome e status */}
            <div className="p-3.5 flex items-center gap-3">
                <Shimmer className="w-11 h-11 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <Shimmer className="h-3.5 w-3/5 rounded-full" />
                    <Shimmer className="h-2.5 w-2/5 rounded-full" />
                </div>
                <Shimmer className="h-6 w-14 rounded-full flex-shrink-0" />
            </div>

            {/* itens */}
            <div className="px-3.5 flex flex-col">
                {Array.from({ length: items }).map((_, i) => (
                    <div key={i} className="py-2.5 flex items-center gap-3" style={{ borderTop: `1px solid ${colors.border}` }}>
                        <Shimmer className="w-12 h-12 rounded-xl flex-shrink-0" />
                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                            <Shimmer className="h-3 w-4/5 rounded-full" />
                            <Shimmer className="h-3 w-1/4 rounded-full" />
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Shimmer className="w-8 h-8 rounded-full" />
                            <Shimmer className="w-4 h-4 rounded-md" />
                            <Shimmer className="w-8 h-8 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>

            {/* resumo e finalizar */}
            <div className="p-3.5" style={{ borderTop: `1px solid ${colors.border}`, background: `${colors.border}20` }}>
                <div className="flex items-center justify-between">
                    <Shimmer className="h-3 w-16 rounded-full" />
                    <Shimmer className="h-3.5 w-20 rounded-full" />
                </div>
                <Shimmer className="mt-2 h-2.5 w-2/5 rounded-full" />
                <Shimmer className="mt-3 h-12 w-full rounded-full" />
            </div>
        </div>
    )
}

export default function CarrinhoSkeleton() {
    return (
        <SkeletonRegion label="Carregando o carrinho">
            {/* abas Carrinho · Pedidos · Avaliações */}
            <div className="flex gap-2 overflow-hidden">
                <Shimmer className="h-11 w-32 rounded-full flex-shrink-0" />
                <Shimmer className="h-11 w-28 rounded-full flex-shrink-0" />
                <Shimmer className="h-11 w-32 rounded-full flex-shrink-0" />
            </div>

            {/* resumo + esvaziar */}
            <div className="mt-4 mb-5 px-1 flex items-center justify-between gap-4">
                <Shimmer className="h-3 w-48 rounded-full" />
                <Shimmer className="h-6 w-20 rounded-full" />
            </div>

            <StoreCardSkeleton items={2} />
            <StoreCardSkeleton items={1} />
        </SkeletonRegion>
    )
}
