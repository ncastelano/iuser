// src/app/SearchResultsSection.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Star, Clock, ChevronRight, Search, Loader2, User } from 'lucide-react'
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

interface SearchResultsSectionProps {
    searchQuery: string
    onSearchSelect?: (query: string) => void
}

export default function SearchResultsSection({ searchQuery, onSearchSelect }: SearchResultsSectionProps) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(false)
    const [profiles, setProfiles] = useState<any[]>([])
    const [stores, setStores] = useState<any[]>([])
    const [storesByCategory, setStoresByCategory] = useState<Record<string, any[]>>({})
    const [hasSearched, setHasSearched] = useState(false)
    const [displayQuery, setDisplayQuery] = useState('')

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const trimmed = searchQuery.trim()

        setDisplayQuery(trimmed)

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
        }

        if (!trimmed) {
            setProfiles([])
            setStores([])
            setStoresByCategory({})
            setHasSearched(false)
            setLoading(false)
            return
        }

        setHasSearched(true)
        setLoading(true)

        debounceTimerRef.current = setTimeout(async () => {
            const query = trimmed

            try {
                // 1. Buscar perfis
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, name, avatar_url, "profileSlug"')
                    .or(`name.ilike.%${query}%,profileSlug.ilike.%${query}%`)
                    .limit(10)

                if (profilesError) {
                    console.error('Erro ao buscar perfis:', profilesError)
                }

                const mappedProfiles = (profilesData || []).map((p: any) => ({
                    ...p,
                    avatar_url: p.avatar_url
                        ? supabase.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl
                        : null,
                }))
                setProfiles(mappedProfiles)

                // 2. Buscar lojas (agora sem precisar do owner_id)
                const { data: storesData, error: storesError } = await supabase
                    .from('stores')
                    .select('id, name, "storeSlug", description, logo_url, ratings_avg, ratings_count, prep_time_min, prep_time_max, category')
                    .or(`name.ilike.%${query}%,description.ilike.%${query}%,"storeSlug".ilike.%${query}%,category.ilike.%${query}%`)
                    .limit(30)

                if (storesError) {
                    console.error('Erro ao buscar lojas:', storesError)
                }

                // 3. Mapear lojas (sem precisar do ownerSlug)
                const mappedStores = (storesData || []).map((s: any) => ({
                    ...s,
                    logo_url: s.logo_url
                        ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                        : null,
                }))
                setStores(mappedStores)

                // 4. Agrupar por categoria
                const grouped: Record<string, any[]> = {}
                for (const store of mappedStores) {
                    const cat = getCategoryForStore(store)
                    if (!grouped[cat]) grouped[cat] = []
                    grouped[cat].push(store)
                }
                setStoresByCategory(grouped)

            } catch (err) {
                console.error('Erro na busca:', err)
            } finally {
                setLoading(false)
            }
        }, 300)

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
            }
        }
    }, [searchQuery])

    const handleProfileClick = (profile: any) => {
        addRecentClick({
            type: 'profile',
            id: profile.id,
            name: profile.name,
            imageUrl: profile.avatar_url,
            url: `/${profile.profileSlug}`,
        })
        if (onSearchSelect) {
            onSearchSelect('')
        }
    }

    const handleStoreClick = (store: any) => {
        // Agora usa apenas o storeSlug
        addRecentClick({
            type: 'store',
            id: store.id,
            name: store.name,
            imageUrl: store.logo_url,
            url: `/${store.storeSlug}`,
        })
        if (onSearchSelect) {
            onSearchSelect('')
        }
    }

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const num = parseInt(clean, 16)
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const hasResults = profiles.length > 0 || Object.keys(storesByCategory).length > 0

    if (!displayQuery) {
        return null
    }

    const totalResults = profiles.length + Object.values(storesByCategory).reduce((acc, arr) => acc + arr.length, 0)

    return (
        <section>
            <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                    Resultados para "{displayQuery}"
                </h2>
                {hasSearched && !loading && (
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                        {totalResults} resultados
                    </span>
                )}
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
                        Nenhum resultado encontrado para "{displayQuery}".
                    </p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        Tente buscar por outro termo ou verifique a ortografia.
                    </p>
                </div>
            )}

            {!loading && hasResults && (
                <div className="space-y-6">
                    {/* Perfis */}
                    {profiles.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <User size={16} style={{ color: '#3b82f6' }} />
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#3b82f6' }}>
                                    Perfis
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

                    {/* Lojas agrupadas por categoria */}
                    {Object.entries(storesByCategory).map(([slug, stores]) => {
                        const catInfo = categoriasInfo.find(c => c.slug === slug)
                        const titulo = catInfo?.titulo || 'Outros'
                        const color = catInfo?.color || '#94a3b8'

                        return (
                            <div key={slug}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs font-black uppercase tracking-wider" style={{ color }}>
                                        {titulo}
                                    </span>
                                    <span className="text-[10px] font-bold opacity-60" style={{ color }}>
                                        ({stores.length})
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    {stores.map((store) => {
                                        // URL agora usa apenas o storeSlug
                                        const storeUrl = `/${store.storeSlug}`
                                        return (
                                            <Link
                                                key={store.id}
                                                href={storeUrl}
                                                onClick={() => handleStoreClick(store)}
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
                                                            <p className="text-[10px] mt-1 font-mono" style={{ color: colors.textSecondary }}>/{store.storeSlug}</p>
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