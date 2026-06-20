'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Star, Clock, ChevronRight, Search, Loader2 } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { addRecentClick } from '@/components/LastSearched'

const categoriasInfo: { titulo: string; slug: string; color: string; keywords: string[] }[] = [
    { titulo: 'Alimentação', slug: 'alimentacao', color: '#f97316', keywords: ['restaurante', 'lanchonete', 'pizzaria', 'comida', 'alimentação', 'mercado', 'supermercado', 'hortifruti', 'bebidas'] },
    { titulo: 'Saúde e Bem-estar', slug: 'saude', color: '#eab308', keywords: ['farmácia', 'drogaria', 'medicamento', 'saúde', 'fitness', 'academia', 'crossfit', 'suplemento'] },
    { titulo: 'Moda e Beleza', slug: 'moda', color: '#ec4899', keywords: ['roupa', 'moda', 'vestuário', 'calçado', 'salão', 'beleza', 'cabelo'] },
    { titulo: 'Casa e Decoração', slug: 'casa', color: '#a855f7', keywords: ['móvel', 'decoração', 'casa', 'móveis'] },
    { titulo: 'Eletrônicos e Tecnologia', slug: 'eletronicos', color: '#06b6d4', keywords: ['celular', 'smartphone', 'eletrônico', 'acessório', 'computador', 'conserto', 'manutenção'] },
    { titulo: 'Serviços', slug: 'servicos', color: '#8b5cf6', keywords: ['mecânica', 'oficina', 'conserto', 'reparo', 'serviço', 'pintura', 'limpeza'] },
    { titulo: 'Pet', slug: 'pets', color: '#84cc16', keywords: ['pet', 'cachorro', 'gato', 'veterinário'] },
    { titulo: 'Transporte e Logística', slug: 'transporte', color: '#64748b', keywords: ['entrega', 'transportadora', 'logística', 'motoqueiro', 'frete'] },
]

function getCategoryForStore(store: any): string {
    if (store.category && categoriasInfo.some(c => c.slug === store.category)) {
        return store.category
    }
    const texto = `${store.name || ''} ${store.description || ''} ${store.storeSlug || ''}`.toLowerCase()
    for (const cat of categoriasInfo) {
        if (cat.keywords.some(kw => texto.includes(kw))) {
            return cat.slug
        }
    }
    return 'outros'
}

function formatPrepTime(store: any): string {
    if (store.prep_time_min == null && store.prep_time_max == null) return 'Indisponível'
    if (store.prep_time_min != null && store.prep_time_max != null) return `${store.prep_time_min}–${store.prep_time_max} min`
    if (store.prep_time_min != null) return `${store.prep_time_min} min`
    return `${store.prep_time_max} min`
}

export default function SearchResultsSection({
    dragHandle,
    searchQuery,
    onSearchSelect,
}: {
    dragHandle?: React.ReactNode
    searchQuery: string
    onSearchSelect?: (query: string) => void
}) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(false)
    const [profiles, setProfiles] = useState<any[]>([])
    const [storesByCategory, setStoresByCategory] = useState<Record<string, any[]>>({})

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Efeito de busca
    useEffect(() => {
        if (!searchQuery.trim()) {
            setProfiles([])
            setStoresByCategory({})
            return
        }

        const fetchResults = async () => {
            setLoading(true)
            const query = searchQuery.trim()

            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, name, avatar_url, "profileSlug"')
                .or(`name.ilike.%${query}%,profileSlug.ilike.%${query}%`)
                .limit(10)

            if (profilesError) console.error('Erro ao buscar perfis:', profilesError)

            const mappedProfiles = (profilesData || []).map((p: any) => ({
                ...p,
                avatar_url: p.avatar_url
                    ? supabase.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl
                    : null,
            }))
            setProfiles(mappedProfiles)

            const { data: storesData, error: storesError } = await supabase
                .from('stores')
                .select('id, name, "storeSlug", description, logo_url, ratings_avg, ratings_count, prep_time_min, prep_time_max, category, owner_id')
                .or(`name.ilike.%${query}%,description.ilike.%${query}%,"storeSlug".ilike.%${query}%,category.ilike.%${query}%`)
                .limit(30)

            if (storesError) console.error('Erro ao buscar lojas:', storesError)

            const ownerIds = [...new Set((storesData || []).map(s => s.owner_id).filter(Boolean))]
            let profilesMap: Record<string, string> = {}
            if (ownerIds.length) {
                const { data: profilesData, error: profError } = await supabase
                    .from('profiles')
                    .select('id, "profileSlug"')
                    .in('id', ownerIds)

                if (profError) console.error('Erro ao buscar profileSlug dos donos:', profError)
                else profilesMap = Object.fromEntries((profilesData || []).map(p => [p.id, p.profileSlug]))
            }

            const mappedStores = (storesData || []).map((s: any) => ({
                ...s,
                logo_url: s.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                    : null,
                profiles: { profileSlug: profilesMap[s.owner_id] || null },
            }))

            const grouped: Record<string, any[]> = {}
            for (const store of mappedStores) {
                const cat = getCategoryForStore(store)
                if (!grouped[cat]) grouped[cat] = []
                grouped[cat].push(store)
            }

            setStoresByCategory(grouped)
            setLoading(false)
        }

        fetchResults()
    }, [searchQuery])

    // Sem termo → não renderiza nada
    if (!searchQuery.trim()) return null

    const hasResults = profiles.length > 0 || Object.keys(storesByCategory).length > 0

    // Funções auxiliares para salvar clique no histórico
    const handleProfileClick = (profile: any) => {
        addRecentClick({
            type: 'profile',
            id: profile.id,
            name: profile.name,
            imageUrl: profile.avatar_url,
            url: `/${profile.profileSlug}`,
        })
    }

    const handleStoreClick = (store: any, ownerSlug: string) => {
        addRecentClick({
            type: 'store',
            id: store.id,
            name: store.name,
            imageUrl: store.logo_url,
            url: `/${ownerSlug}/${store.storeSlug}`,
        })
    }

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

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
                <div className="rounded-2xl p-6 flex flex-col items-center gap-3" style={{ background: cardBg, backdropFilter: 'blur(12px)', border: `1px solid ${colors.border}` }}>
                    <Search className="w-8 h-8" style={{ color: colors.textSecondary }} />
                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                        Nenhum resultado encontrado para "{searchQuery}".
                    </p>
                </div>
            )}

            {!loading && hasResults && (
                <div className="space-y-6">
                    {profiles.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider" style={{ background: '#3b82f620', color: '#3b82f6' }}>
                                    Social
                                </span>
                            </div>
                            <div className="space-y-3">
                                {profiles.map((profile) => (
                                    <Link
                                        key={profile.id}
                                        href={`/${profile.profileSlug}`}
                                        onClick={() => handleProfileClick(profile)}
                                        className="block group"
                                    >
                                        <div className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl" style={{ background: cardBg, backdropFilter: 'blur(12px)', borderColor: colors.border, boxShadow: colors.shadow }}>
                                            <div className="flex gap-4 items-center">
                                                <div className="w-16 h-16 rounded-full overflow-hidden shrink-0" style={{ background: `${colors.surface}44` }}>
                                                    {profile.avatar_url ? (
                                                        <img src={profile.avatar_url} className="w-full h-full object-cover" alt={profile.name} />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-2xl font-black" style={{ color: colors.textSecondary }}>
                                                            {profile.name?.charAt(0) || '?'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>{profile.name}</h3>
                                                    <p className="text-sm mt-1" style={{ color: colors.accent }}>@{profile.profileSlug}</p>
                                                </div>
                                                <ChevronRight className="w-5 h-5 self-center group-hover:text-orange-400 transition-colors" style={{ color: colors.textSecondary }} />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {Object.entries(storesByCategory).map(([slug, stores]) => {
                        const catInfo = categoriasInfo.find(c => c.slug === slug)
                        const titulo = catInfo?.titulo || 'Outros'
                        const color = catInfo?.color || '#94a3b8'

                        return (
                            <div key={slug}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider" style={{ background: `${color}20`, color }}>
                                        {titulo}
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    {stores.map((store) => {
                                        const ownerSlug = store.profiles?.profileSlug || 'perfil'
                                        const storeUrl = `/${ownerSlug}/${store.storeSlug}`
                                        return (
                                            <Link
                                                key={store.id}
                                                href={storeUrl}
                                                onClick={() => handleStoreClick(store, ownerSlug)}
                                                className="block group"
                                            >
                                                <div className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl" style={{ background: cardBg, backdropFilter: 'blur(12px)', borderColor: colors.border, boxShadow: colors.shadow }}>
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
                                                            <h3 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>{store.name}</h3>
                                                            <p className="text-xs line-clamp-2 mt-1" style={{ color: colors.textSecondary }}>{store.description || 'Sem descrição'}</p>
                                                            <p className="text-[10px] mt-1 font-mono" style={{ color: colors.textSecondary }}>/{ownerSlug}/{store.storeSlug}</p>
                                                            <div className="flex items-center gap-4 mt-3">
                                                                <div className="flex items-center gap-1">
                                                                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                                                    <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{store.ratings_avg?.toFixed(1) || '0.0'}</span>
                                                                    <span className="text-xs" style={{ color: colors.textSecondary }}>({store.ratings_count || 0})</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <Clock size={14} style={{ color: colors.accent }} />
                                                                    <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>{formatPrepTime(store)}</span>
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
                        )
                    })}
                </div>
            )}
        </section>
    )
}