// components/SearchResultsSection.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Star, Clock, ChevronRight, Search, Loader2, Store, User } from 'lucide-react'
import { useTheme } from '@/app/theme'

interface SearchResultsSectionProps {
    dragHandle?: React.ReactNode
    searchQuery: string
}

// Cores das categorias (para manter identidade visual)
const categoriasInfo: Record<string, { titulo: string; color: string }> = {
    restaurantes: { titulo: 'Restaurantes', color: '#F97316' },
    mercados: { titulo: 'Mercados', color: '#10B981' },
    farmacias: { titulo: 'Farmácias', color: '#3B82F6' },
    petshops: { titulo: 'Pet Shops', color: '#EC4899' },
    fitness: { titulo: 'Fitness', color: '#8B5CF6' },
    roupas: { titulo: 'Roupas', color: '#F59E0B' },
    entregas: { titulo: 'Entregas', color: '#06B6D4' },
    social: { titulo: 'Social', color: '#06b6d4' },
}

function formatPrepTime(store: any): string {
    if (store.prep_time_min == null && store.prep_time_max == null) return 'Indisponível'
    if (store.prep_time_min != null && store.prep_time_max != null) return `${store.prep_time_min}–${store.prep_time_max} min`
    if (store.prep_time_min != null) return `${store.prep_time_min} min`
    return `${store.prep_time_max} min`
}

export default function SearchResultsSection({ dragHandle, searchQuery }: SearchResultsSectionProps) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(false)
    const [profiles, setProfiles] = useState<any[]>([])
    const [stores, setStores] = useState<any[]>([])

    // Busca unificada no Supabase
    useEffect(() => {
        if (!searchQuery.trim()) {
            setProfiles([])
            setStores([])
            return
        }

        const fetchResults = async () => {
            setLoading(true)
            const query = searchQuery.trim()

            // Busca perfis (nome ou profileSlug)
            const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, name, avatar_url, "profileSlug"')
                .or(`name.ilike.%${query}%,profileSlug.ilike.%${query}%`)
                .limit(10)

            // Busca lojas (nome ou descrição)
            const { data: storesData } = await supabase
                .from('stores')
                .select('id, name, "storeSlug", description, logo_url, ratings_avg, ratings_count, prep_time_min, prep_time_max, owner_id, profiles("profileSlug")')
                .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
                .limit(15)

            // Mapeia URLs públicas
            const mappedProfiles = (profilesData || []).map((p: any) => ({
                ...p,
                avatar_url: p.avatar_url
                    ? supabase.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl
                    : null,
            }))

            const mappedStores = (storesData || []).map((s: any) => ({
                ...s,
                logo_url: s.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                    : null,
                profiles: Array.isArray(s.profiles) ? s.profiles[0] : s.profiles,
            }))

            setProfiles(mappedProfiles)
            setStores(mappedStores)
            setLoading(false)
        }

        fetchResults()
    }, [searchQuery])

    const hasResults = profiles.length > 0 || stores.length > 0

    // Estilo de card translúcido
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    if (!searchQuery.trim()) return null

    return (
        <section>
            <div className="flex items-center gap-2 mb-4">
                {dragHandle}
                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                    Resultados da busca
                </h2>
            </div>

            {loading && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.accent }} />
                </div>
            )}

            {!loading && !hasResults && (
                <div
                    className="rounded-2xl p-6 flex flex-col items-center gap-3"
                    style={{
                        background: cardBg,
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                    }}
                >
                    <Search className="w-8 h-8" style={{ color: colors.textSecondary }} />
                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                        Nenhum resultado encontrado para "{searchQuery}".
                    </p>
                </div>
            )}

            {!loading && hasResults && (
                <div className="space-y-6">
                    {/* Perfis (Social) */}
                    {profiles.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span
                                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                                    style={{ background: `${categoriasInfo.social.color}20`, color: categoriasInfo.social.color }}
                                >
                                    Social
                                </span>
                            </div>
                            <div className="space-y-3">
                                {profiles.map((profile) => (
                                    <Link key={profile.id} href={`/${profile.profileSlug}`} className="block group">
                                        <div
                                            className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl"
                                            style={{
                                                background: cardBg,
                                                backdropFilter: 'blur(12px)',
                                                borderColor: colors.border,
                                                boxShadow: colors.shadow,
                                            }}
                                        >
                                            <div className="flex gap-4 items-center">
                                                <div className="w-16 h-16 rounded-full overflow-hidden shrink-0" style={{ background: `${colors.surface}44` }}>
                                                    {profile.avatar_url ? (
                                                        <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-2xl font-black" style={{ color: colors.textSecondary }}>
                                                            {profile.name?.charAt(0) || '?'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>
                                                        {profile.name}
                                                    </h3>
                                                    <p className="text-sm mt-1" style={{ color: colors.accent }}>
                                                        @{profile.profileSlug}
                                                    </p>
                                                </div>
                                                <ChevronRight className="w-5 h-5 self-center group-hover:text-orange-400 transition-colors" style={{ color: colors.textSecondary }} />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Lojas */}
                    {stores.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span
                                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                                    style={{ background: `${colors.accent}20`, color: colors.accent }}
                                >
                                    Lojas
                                </span>
                            </div>
                            <div className="space-y-3">
                                {stores.map((store) => {
                                    const ownerSlug = store.profiles?.profileSlug || 'perfil'
                                    const storeUrl = `/${ownerSlug}/${store.storeSlug}`
                                    return (
                                        <Link key={store.id} href={storeUrl} className="block group">
                                            <div
                                                className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl"
                                                style={{
                                                    background: cardBg,
                                                    backdropFilter: 'blur(12px)',
                                                    borderColor: colors.border,
                                                    boxShadow: colors.shadow,
                                                }}
                                            >
                                                <div className="flex gap-4">
                                                    <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0" style={{ background: `${colors.surface}44` }}>
                                                        {store.logo_url ? (
                                                            <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-2xl font-black" style={{ color: colors.textSecondary }}>
                                                                {store.name?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>
                                                            {store.name}
                                                        </h3>
                                                        <p className="text-xs line-clamp-2 mt-1" style={{ color: colors.textSecondary }}>
                                                            {store.description || 'Sem descrição'}
                                                        </p>
                                                        <div className="flex items-center gap-4 mt-3">
                                                            <div className="flex items-center gap-1">
                                                                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                                                <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                                    {store.ratings_avg?.toFixed(1) || '0.0'}
                                                                </span>
                                                                <span className="text-xs" style={{ color: colors.textSecondary }}>
                                                                    ({store.ratings_count || 0})
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
                                                    <ChevronRight className="w-5 h-5 self-center group-hover:text-orange-400 transition-colors" style={{ color: colors.textSecondary }} />
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    )
}