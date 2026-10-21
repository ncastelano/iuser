// src/components/v3/StoreSkeleton.tsx
//
// Esqueleto da página da loja (cabeçalho, ações, publicações, abas e grade de produtos) no lugar de qualquer "carregando":
// a página já aparece com a forma que vai ter e só os conteúdos entram no lugar. Usado enquanto a loja carrega.
'use client'

import { useTheme } from '@/app/contexts/theme'

export default function StoreSkeleton({ withBack = true }: { withBack?: boolean }) {
    const { colors } = useTheme()
    const block = colors.border
    const Bar = ({ w, h = 12, r = 8 }: { w: number | string; h?: number; r?: number }) => <span className="block animate-pulse" style={{ width: w, height: h, borderRadius: r, background: block }} />

    return (
        <div aria-hidden className="w-full max-w-3xl mx-auto px-4 pt-4 pb-24" style={{ background: colors.background }}>
            {withBack && <span className="block w-[46px] h-[46px] rounded-full animate-pulse" style={{ background: block }} />}

            {/* logo, nome e situação */}
            <div className="mt-5 flex items-center gap-3.5">
                <span className="block w-[76px] h-[76px] rounded-3xl animate-pulse flex-shrink-0" style={{ background: block }} />
                <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                    <Bar w="62%" h={20} />
                    <Bar w="44%" h={12} />
                </div>
            </div>

            {/* descrição e links */}
            <div className="mt-5 flex flex-col gap-2">
                <Bar w="100%" />
                <Bar w="94%" />
                <Bar w="70%" />
            </div>
            <div className="mt-3 flex flex-col gap-2">
                <Bar w={90} />
                <Bar w={120} />
            </div>

            {/* endereço, nota, seguidores */}
            <div className="mt-4 flex gap-2 flex-wrap">
                <Bar w={170} h={34} r={17} />
                <Bar w={78} h={34} r={17} />
                <Bar w={96} h={34} r={17} />
            </div>

            {/* ações */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
                <Bar w="100%" h={48} r={24} />
                <Bar w="100%" h={48} r={24} />
                <Bar w="100%" h={44} r={22} />
                <Bar w="100%" h={44} r={22} />
            </div>

            {/* publicações */}
            <div className="mt-7 flex gap-3.5 overflow-hidden">
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                        <span className="block w-16 h-16 rounded-full animate-pulse" style={{ background: block }} />
                        <Bar w={52} h={8} />
                    </div>
                ))}
            </div>

            {/* abas e busca */}
            <div className="mt-7 flex gap-6">
                <Bar w={84} h={16} />
                <Bar w={76} h={16} />
                <Bar w={92} h={16} />
            </div>
            <div className="mt-4"><Bar w="100%" h={44} r={22} /></div>

            {/* grade de produtos */}
            <div className="mt-5 grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex flex-col gap-2">
                        <span className="block aspect-square rounded-2xl animate-pulse" style={{ background: block }} />
                        <Bar w="78%" h={12} />
                        <Bar w="40%" h={14} />
                    </div>
                ))}
            </div>
        </div>
    )
}
