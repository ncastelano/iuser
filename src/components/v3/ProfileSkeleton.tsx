// src/components/v3/ProfileSkeleton.tsx
//
// Esqueleto da página de perfil de pessoa (foto, nome, apresentação, ações, números, abas e grade de publicações) no lugar de
// qualquer "carregando". Irmão do StoreSkeleton.
'use client'

import { useTheme } from '@/app/contexts/theme'

export default function ProfileSkeleton({ withBack = true }: { withBack?: boolean }) {
    const { colors } = useTheme()
    const block = colors.border
    const Bar = ({ w, h = 12, r = 8 }: { w: number | string; h?: number; r?: number }) => <span className="block animate-pulse" style={{ width: w, height: h, borderRadius: r, background: block }} />

    return (
        <div aria-hidden className="w-full max-w-3xl mx-auto px-4 pt-4 pb-24" style={{ background: colors.background }}>
            {withBack && <span className="block w-[46px] h-[46px] rounded-full animate-pulse" style={{ background: block }} />}

            {/* foto, nome e @ */}
            <div className="mt-5 flex items-center gap-4">
                <span className="block w-[92px] h-[92px] rounded-full animate-pulse flex-shrink-0" style={{ background: block }} />
                <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                    <Bar w="58%" h={20} />
                    <Bar w="36%" h={12} />
                    <Bar w="48%" h={12} />
                </div>
            </div>

            {/* apresentação e links */}
            <div className="mt-5 flex flex-col gap-2">
                <Bar w="100%" />
                <Bar w="90%" />
                <Bar w="62%" />
            </div>
            <div className="mt-3"><Bar w={110} /></div>

            {/* ações */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
                <Bar w="100%" h={46} r={23} />
                <Bar w="100%" h={46} r={23} />
            </div>

            {/* números */}
            <div className="mt-5 flex gap-2.5">
                <Bar w={96} h={34} r={17} />
                <Bar w={110} h={34} r={17} />
                <Bar w={84} h={34} r={17} />
            </div>

            {/* abas */}
            <div className="mt-7 flex gap-6">
                <Bar w={92} h={16} />
                <Bar w={80} h={16} />
                <Bar w={96} h={16} />
            </div>

            {/* publicações / serviços */}
            <div className="mt-5 grid grid-cols-3 gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="block aspect-square rounded-2xl animate-pulse" style={{ background: block }} />)}
            </div>
        </div>
    )
}
