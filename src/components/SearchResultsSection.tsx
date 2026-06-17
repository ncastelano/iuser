// components/SearchResultsSection.tsx
'use client'

import { ReactNode, useMemo } from 'react'
import Link from 'next/link'
import { Star, Clock, ChevronRight, Search } from 'lucide-react'
import { dadosMockados, type Store } from '@/app/(main)/inicio/dadoDeLojas'
import { useTheme } from '@/app/theme'

interface SearchResultsSectionProps {
    dragHandle?: ReactNode
    searchQuery: string
}

const categoriasInfo: Record<string, { titulo: string; color: string }> = {
    restaurantes: { titulo: 'Restaurantes', color: '#F97316' },
    mercados: { titulo: 'Mercados', color: '#10B981' },
    farmacias: { titulo: 'Farmácias', color: '#3B82F6' },
    petshops: { titulo: 'Pet Shops', color: '#EC4899' },
    fitness: { titulo: 'Fitness', color: '#8B5CF6' },
    roupas: { titulo: 'Roupas', color: '#F59E0B' },
    entregas: { titulo: 'Entregas', color: '#06B6D4' },
}

function formatPrepTime(store: Store): string {
    if (store.prep_time_min === null && store.prep_time_max === null) return 'Indisponível'
    if (store.prep_time_min !== null && store.prep_time_max !== null) {
        return `${store.prep_time_min}–${store.prep_time_max} min`
    }
    if (store.prep_time_min !== null) return `${store.prep_time_min} min`
    return `${store.prep_time_max} min`
}

export default function SearchResultsSection({ dragHandle, searchQuery }: SearchResultsSectionProps) {
    const { colors } = useTheme()

    const resultsByCategory = useMemo(() => {
        if (!searchQuery.trim()) return {}
        const query = searchQuery.toLowerCase()
        const grouped: Record<string, Store[]> = {}

        Object.entries(dadosMockados).forEach(([categoria, stores]) => {
            const filtered = stores.filter(
                s => s.name.toLowerCase().includes(query) || s.description?.toLowerCase().includes(query)
            )
            if (filtered.length > 0) {
                grouped[categoria] = filtered
            }
        })
        return grouped
    }, [searchQuery])

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const totalResults = Object.values(resultsByCategory).reduce((acc, stores) => acc + stores.length, 0)

    if (totalResults === 0) {
        return (
            <section>
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                        Resultados da busca
                    </h2>
                </div>
                <div
                    className="rounded-2xl p-6 flex flex-col items-center gap-3"
                    style={{
                        background: cardBg,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                    }}
                >
                    <Search className="w-8 h-8" style={{ color: colors.textSecondary }} />
                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                        Nenhum resultado encontrado para "{searchQuery}".
                    </p>
                </div>
            </section>
        )
    }

    return (
        <section>
            <div className="flex items-center gap-2 mb-4">
                {dragHandle}
                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                    Resultados da busca
                </h2>
            </div>
            <div className="space-y-6">
                {Object.entries(resultsByCategory).map(([categoria, stores]) => {
                    const info = categoriasInfo[categoria] || { titulo: categoria, color: colors.accent }
                    return (
                        <div key={categoria}>
                            <div className="flex items-center gap-2 mb-3">
                                <span
                                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                                    style={{ background: `${info.color}20`, color: info.color }}
                                >
                                    {info.titulo}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {stores.map(store => (
                                    <Link
                                        key={store.id}
                                        href={`/lojas/${categoria}/${store.storeSlug}`}
                                        className="block group"
                                    >
                                        <div
                                            className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl"
                                            style={{
                                                background: cardBg,
                                                backdropFilter: 'blur(12px)',
                                                WebkitBackdropFilter: 'blur(12px)',
                                                borderColor: colors.border,
                                                boxShadow: colors.shadow,
                                            }}
                                        >
                                            <div className="flex gap-4">
                                                <div
                                                    className="w-24 h-24 rounded-xl overflow-hidden shrink-0"
                                                    style={{ background: `${colors.surface}44` }}
                                                >
                                                    {store.logo_url ? (
                                                        <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div
                                                            className="w-full h-full flex items-center justify-center text-2xl font-black"
                                                            style={{ color: colors.textSecondary }}
                                                        >
                                                            {store.name.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>
                                                        {store.name}
                                                    </h3>
                                                    <p className="text-xs line-clamp-2 mt-1" style={{ color: colors.textSecondary }}>
                                                        {store.description}
                                                    </p>
                                                    <div className="flex items-center gap-4 mt-3">
                                                        <div className="flex items-center gap-1">
                                                            <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                                            <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                                {store.ratings_avg}
                                                            </span>
                                                            <span className="text-xs" style={{ color: colors.textSecondary }}>
                                                                ({store.ratings_count})
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Clock size={14} style={{ color: colors.accent }} />
                                                            <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                                                {formatPrepTime(store)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <ChevronRight
                                                    className="w-5 h-5 self-center group-hover:text-orange-400 transition-colors"
                                                    style={{ color: colors.textSecondary }}
                                                />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}