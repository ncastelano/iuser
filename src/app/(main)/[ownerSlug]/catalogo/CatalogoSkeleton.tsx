// src/app/(main)/[ownerSlug]/catalogo/CatalogoSkeleton.tsx
//
// Esqueleto do catálogo da loja: a página já aparece com a forma do que vai chegar (na 3.0: logo + nome, chips de categoria, a
// grade de produtos e a peça de baixo com voltar e busca; na 2.0: a lista em linhas) e os dados entram no lugar.
'use client'

import { useTheme } from '@/app/contexts/theme'
import { Shimmer, SkeletonRegion } from '@/components/Skeleton'

export default function CatalogoSkeleton({ v3 }: { v3: boolean }) {
    const { colors } = useTheme()

    if (!v3) {
        return (
            <SkeletonRegion label="Carregando o catálogo" className="min-h-dvh px-3 pt-4 pb-32" >
                <Shimmer className="h-10 w-48 rounded-full" />
                <Shimmer className="mt-3 h-11 w-full rounded-full" />
                <div className="mt-5 flex flex-col gap-4">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl overflow-hidden flex" style={{ background: colors.surface }}>
                            <Shimmer className="w-32 flex-shrink-0 rounded-none" style={{ minHeight: 140 }} />
                            <div className="flex-1 p-4 flex flex-col gap-2.5">
                                <Shimmer className="h-3.5 w-3/5 rounded-full" />
                                <Shimmer className="h-2.5 w-full rounded-full" />
                                <Shimmer className="h-2.5 w-4/5 rounded-full" />
                                <Shimmer className="mt-auto h-4 w-20 rounded-full" />
                            </div>
                        </div>
                    ))}
                </div>
            </SkeletonRegion>
        )
    }

    return (
        <SkeletonRegion label="Carregando o catálogo" className="px-4 pt-3 pb-40">
            {/* logo + nome e status */}
            <div className="flex items-center gap-3">
                <Shimmer className="w-12 h-12 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <Shimmer className="h-5 w-3/5 rounded-full" />
                    <Shimmer className="h-3 w-2/5 rounded-full" />
                </div>
            </div>

            {/* chips de categoria */}
            <div className="mt-3 flex gap-2 overflow-hidden">
                <Shimmer className="h-9 w-24 rounded-full flex-shrink-0" />
                <Shimmer className="h-9 w-28 rounded-full flex-shrink-0" />
                <Shimmer className="h-9 w-32 rounded-full flex-shrink-0" />
                <Shimmer className="h-9 w-28 rounded-full flex-shrink-0" />
            </div>

            {/* grade de produtos */}
            <div className="mt-4 grid grid-cols-2 gap-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                        <Shimmer className="aspect-[5/4] w-full rounded-none" />
                        <div className="p-2.5 flex flex-col gap-2">
                            <Shimmer className="h-3 w-4/5 rounded-full" />
                            <Shimmer className="h-3 w-3/5 rounded-full" />
                            <Shimmer className="h-2.5 w-full rounded-full" />
                            <div className="mt-1 flex items-center justify-between">
                                <Shimmer className="h-4 w-16 rounded-full" />
                                <Shimmer className="w-9 h-9 rounded-full" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* peça de baixo: voltar + busca */}
            <div
                className="fixed flex items-center gap-2 px-2"
                style={{
                    bottom: 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))', left: 12, right: 12, maxWidth: 448, margin: '0 auto', height: 62, zIndex: 998,
                    background: colors.background, border: `1px solid ${colors.border}`, borderRadius: 30, boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                }}
            >
                <Shimmer className="w-11 h-11 rounded-full flex-shrink-0" />
                <Shimmer className="flex-1 h-11 rounded-full" />
            </div>
        </SkeletonRegion>
    )
}
