// src/components/StoreDashboard/StoreDashboardSkeleton.tsx
//
// Esqueleto do painel da loja (3.0): as mesmas seções, na mesma ordem e com as mesmas cores do painel de verdade
// (pedidos nos quatro tons, o realce laranja, o selo verde de aberto). Se a página já sabe a logo e o nome da loja,
// "Informações da loja" já aparece com elas e o resto termina de preencher quando os dados chegam.
'use client'

import { useTheme } from '@/app/contexts/theme'
import { Shimmer, SkeletonRegion } from '@/components/Skeleton'

function Card({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
    const { colors } = useTheme()
    return (
        <div
            className="rounded-3xl mb-6 overflow-hidden"
            style={{
                background: colors.surface,
                border: highlight ? '1.5px solid #f97316' : `1px solid ${colors.border}`,
                boxShadow: highlight ? '0 6px 20px #f9731626' : 'none',
            }}
        >
            {children}
        </div>
    )
}

/** Cartão fechado: título, linha de apoio e seta */
function SectionRow({ title = 'w-2/5', sub = 'w-3/5', badge = false, accent }: { title?: string; sub?: string; badge?: boolean; accent?: string }) {
    return (
        <Card>
            <div className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <Shimmer className={`h-4 ${title} rounded-full`} />
                    <Shimmer className={`h-2.5 ${sub} rounded-full`} color={accent} />
                </div>
                {badge && <Shimmer className="h-6 w-7 rounded-full flex-shrink-0" color="#f97316" />}
                <Shimmer className="h-5 w-5 rounded-full flex-shrink-0" />
            </div>
        </Card>
    )
}

export default function StoreDashboardSkeleton({ logo, name, slug }: { logo?: string | null; name?: string | null; slug?: string | null }) {
    const { colors } = useTheme()
    return (
        <SkeletonRegion label="Carregando o painel da loja" className="w-full px-4 md:px-6 pb-28">
            {/* Informações da loja: a logo (e o nome) já aparecem */}
            <Card>
                <div className="flex items-center gap-3 p-4">
                    <span className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0" style={{ border: `2px solid ${colors.border}` }}>
                        {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <Shimmer className="w-full h-full rounded-full" />}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                        {name ? (
                            <span className="text-base font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{name}</span>
                        ) : (
                            <Shimmer className="h-4 w-2/5 rounded-full" />
                        )}
                        {slug ? (
                            <span className="text-[11px]" style={{ color: colors.textSecondary }}>@{slug}</span>
                        ) : (
                            <Shimmer className="h-2.5 w-3/5 rounded-full" />
                        )}
                    </div>
                    <Shimmer className="h-5 w-5 rounded-full flex-shrink-0" />
                </div>
            </Card>

            {/* Ver minha loja / Compartilhar link */}
            <div className="mb-6 grid grid-cols-2 gap-2">
                <Shimmer className="h-12 rounded-full" color="#f97316" />
                <Shimmer className="h-12 rounded-full" />
            </div>

            {/* Pedidos na loja: realce laranja e os quatro tons */}
            <Card highlight>
                <div className="flex flex-col gap-4 p-4">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                            <Shimmer className="h-4 w-2/5 rounded-full" />
                            <Shimmer className="h-2.5 w-1/2 rounded-full" color="#ea580c" />
                        </div>
                        <Shimmer className="h-5 w-5 rounded-full flex-shrink-0" />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {['#2563eb', '#d97706', '#7c3aed', '#16a34a'].map((c) => (
                            <div key={c} className="rounded-2xl py-3 px-1 flex flex-col items-center gap-2" style={{ background: `${c}10`, border: `1px solid ${c}30` }}>
                                <Shimmer className="h-5 w-5 rounded-md" color={c} />
                                <Shimmer className="h-2 w-10 rounded-full" color={c} />
                            </div>
                        ))}
                    </div>
                </div>
            </Card>

            <SectionRow title="w-1/2" sub="w-2/3" />
            <SectionRow title="w-1/3" sub="w-1/2" accent="#16a34a" />
            <SectionRow title="w-1/2" sub="w-2/5" accent="#22c55e" />

            <SectionRow title="w-1/4" sub="w-1/2" accent="#f97316" />
            <SectionRow title="w-2/5" sub="w-1/4" badge />
            <SectionRow title="w-2/5" sub="w-1/4" badge />
            <SectionRow title="w-1/2" sub="w-3/5" accent="#f97316" />
            <SectionRow title="w-1/2" sub="w-2/5" />
            <SectionRow title="w-1/3" sub="w-1/3" badge />
            <SectionRow title="w-1/3" sub="w-2/5" badge />
        </SkeletonRegion>
    )
}
