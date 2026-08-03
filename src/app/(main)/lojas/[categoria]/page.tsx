// app/(main)/lojas/[categoria]/page.tsx
'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Star,
    Clock,
    ChevronRight,
    Loader2,
    Store,
    MapPin,
    ShoppingBag,
    AlertCircle,
} from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import { categoriasMap } from '@/lib/categorias'
import { isStoreOpenNow, getStoreStatusText, type BusinessHours } from '@/lib/storeHours'

// ===== TIPAGEM =====
interface StoreFromDB {
    id: string
    name: string
    storeSlug: string
    description?: string | null
    logo_url?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    prep_time_min?: number | null
    prep_time_max?: number | null
    owner_id: string
    category?: string | null
    address?: string | null
    business_hours?: BusinessHours | null
    whatsapp?: string | null
    profiles?: {
        profileSlug: string
    } | null
}

// ===== HELPER =====
function formatPrepTime(store: StoreFromDB): string {
    if (store.prep_time_min === null && store.prep_time_max === null) return 'Indisponível'
    if (store.prep_time_min !== null && store.prep_time_max !== null) {
        return `${store.prep_time_min}–${store.prep_time_max} min`
    }
    if (store.prep_time_min !== null) return `${store.prep_time_min} min`
    return `${store.prep_time_max} min`
}

// ===== COMPONENTE PRINCIPAL =====
export default function ListaCategoriaPage() {
    const params = useParams()
    const router = useRouter()
    const categoriaRaw = params.categoria
    const categoria: string | undefined = Array.isArray(categoriaRaw) ? categoriaRaw[0] : categoriaRaw

    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [searchQuery, setSearchQuery] = useState('')
    const [stores, setStores] = useState<StoreFromDB[]>([])
    const [profiles, setProfiles] = useState<any[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // ===== CARREGAR LOJAS =====
    const loadStores = useCallback(async () => {
        if (!categoria) return

        // Categoria "social" → busca perfis
        if (categoria === 'social') {
            setLoadingData(true)
            setError(null)
            const { data, error } = await supabase
                .from('profiles')
                .select('id, name, avatar_url, "profileSlug"')
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error && data) {
                const mapped = data.map((p: any) => ({
                    ...p,
                    avatar_url: p.avatar_url
                        ? supabase.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl
                        : null,
                }))
                setProfiles(mapped)
            } else {
                setError('Erro ao carregar perfis')
            }
            setLoadingData(false)
            return
        }

        setLoadingData(true)
        setError(null)

        try {
            // Busca informações da categoria
            const info = categoriasMap[categoria]
            const categoryName = info?.nome || categoria

            // Busca lojas com filtro correto
            const { data: storesData, error: storesError } = await supabase
                .from('stores')
                .select(`
                    id,
                    name,
                    "storeSlug",
                    description,
                    logo_url,
                    ratings_avg,
                    ratings_count,
                    prep_time_min,
                    prep_time_max,
                    owner_id,
                    category,
                    address,
                    business_hours,
                    whatsapp
                `)
                .eq('category', categoryName)
                .eq('is_active', true)
                .order('ratings_avg', { ascending: false })
                .limit(50)

            if (storesError) {
                console.error('Erro ao buscar lojas:', storesError)
                setError('Erro ao carregar lojas')
                setStores([])
                setLoadingData(false)
                return
            }

            let finalStores = storesData || []

            // Fallback: se não encontrou, tenta busca por similaridade
            if (finalStores.length === 0) {
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('stores')
                    .select(`
                        id,
                        name,
                        "storeSlug",
                        description,
                        logo_url,
                        ratings_avg,
                        ratings_count,
                        prep_time_min,
                        prep_time_max,
                        owner_id,
                        category,
                        address,
                        business_hours,
                        whatsapp
                    `)
                    .or(`name.ilike.%${categoryName}%, description.ilike.%${categoryName}%`)
                    .eq('is_active', true)
                    .order('ratings_avg', { ascending: false })
                    .limit(50)

                if (!fallbackError && fallbackData) {
                    finalStores = fallbackData
                }
            }

            // Busca profileSlug dos donos
            const ownerIds = [...new Set(finalStores.map(s => s.owner_id).filter(Boolean))]
            let profilesMap: Record<string, string> = {}
            if (ownerIds.length) {
                const { data: profilesData, error: profError } = await supabase
                    .from('profiles')
                    .select('id, "profileSlug"')
                    .in('id', ownerIds)

                if (!profError && profilesData) {
                    profilesMap = Object.fromEntries(profilesData.map(p => [p.id, p.profileSlug]))
                }
            }

            // Mapeia as lojas com dados completos
            const mappedStores = finalStores.map((store: any) => ({
                ...store,
                logo_url: store.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null,
                profiles: { profileSlug: profilesMap[store.owner_id] || null },
            }))

            setStores(mappedStores)
        } catch (err) {
            console.error('Erro ao carregar lojas:', err)
            setError('Erro ao carregar lojas')
            setStores([])
        }

        setLoadingData(false)
    }, [categoria])

    useEffect(() => {
        loadStores()
    }, [loadStores])

    // ===== FILTRO LOCAL =====
    const filteredStores = useMemo(() => {
        if (!searchQuery.trim()) return stores
        const q = searchQuery.toLowerCase()
        return stores.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                (s.description && s.description.toLowerCase().includes(q)) ||
                (s.address && s.address.toLowerCase().includes(q))
        )
    }, [stores, searchQuery])

    const filteredProfiles = useMemo(() => {
        if (!searchQuery.trim()) return profiles
        const q = searchQuery.toLowerCase()
        return profiles.filter(
            (p) =>
                p.name?.toLowerCase().includes(q) ||
                p.profileSlug?.toLowerCase().includes(q)
        )
    }, [profiles, searchQuery])

    // ===== FALLBACK =====
    const info = categoriasMap[categoria as string]
    if (!categoria || !info) {
        return (
            <div className="relative min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                <div className="relative z-10 text-center">
                    <h1 className="text-2xl font-black mb-4" style={{ color: colors.textPrimary }}>
                        Categoria não encontrada
                    </h1>
                    <Link href="/" className="font-bold underline" style={{ color: colors.accent }}>
                        Voltar ao início
                    </Link>
                </div>
            </div>
        )
    }

    const categoryColor = info.color

    // ===== ESTILOS =====
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    // ===== RENDER =====
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title={info.nome}
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch={true}
                    searchPlaceholder={categoria === 'social' ? 'Filtrar perfis...' : 'Filtrar lojas...'}
                    onSearch={setSearchQuery}
                />

                <section className="px-4 md:px-6 mt-2 pb-24">
                    {/* LOADING */}
                    {loadingData && (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.accent }} />
                        </div>
                    )}

                    {/* ERROR */}
                    {error && !loadingData && (
                        <div
                            className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                            style={{
                                background: cardBg,
                                backdropFilter: 'blur(12px)',
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <AlertCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
                            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                {error}
                            </p>
                            <button
                                onClick={() => loadStores()}
                                className="px-4 py-2 rounded-xl text-xs font-bold"
                                style={{
                                    background: `linear-gradient(135deg, #f97316, #dc2626)`,
                                    color: '#ffffff',
                                }}
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* CATEGORIA SOCIAL */}
                    {categoria === 'social' && !loadingData && !error && (
                        <>
                            {filteredProfiles.length === 0 ? (
                                <div
                                    className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                                    style={{
                                        background: cardBg,
                                        backdropFilter: 'blur(12px)',
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                        {searchQuery ? 'Nenhum perfil encontrado para esta busca.' : 'Nenhum perfil disponível.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredProfiles.map((profile) => (
                                        <Link
                                            key={profile.id}
                                            href={`/${profile.profileSlug}`}
                                            className="block group"
                                        >
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
                                                    <div
                                                        className="w-16 h-16 rounded-full overflow-hidden shrink-0"
                                                        style={{ background: `${colors.surface}44` }}
                                                    >
                                                        {profile.avatar_url ? (
                                                            <img src={profile.avatar_url} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div
                                                                className="w-full h-full flex items-center justify-center text-2xl font-black"
                                                                style={{ color: colors.textSecondary }}
                                                            >
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
                                                        <div className="mt-2">
                                                            <span
                                                                className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                                                                style={{ background: `${categoryColor}20`, color: categoryColor }}
                                                            >
                                                                {info.nome}
                                                            </span>
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
                            )}
                        </>
                    )}

                    {/* DEMAIS CATEGORIAS */}
                    {categoria !== 'social' && !loadingData && !error && (
                        <>
                            {filteredStores.length === 0 ? (
                                <div
                                    className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                                    style={{
                                        background: cardBg,
                                        backdropFilter: 'blur(12px)',
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <Store className="w-8 h-8 opacity-40" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                        {searchQuery ? 'Nenhuma loja encontrada para esta busca.' : 'Nenhuma loja disponível nesta categoria.'}
                                    </p>
                                    {!searchQuery && (
                                        <p className="text-xs opacity-60" style={{ color: colors.textSecondary }}>
                                            Seja o primeiro a criar uma loja nesta categoria!
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredStores.map((store) => {
                                        const ownerSlug = store.profiles?.profileSlug || 'perfil'
                                        const storeUrl = `/${ownerSlug}/${store.storeSlug}`
                                        const isOpen = isStoreOpenNow(store.business_hours)
                                        const addressShort = store.address ? store.address.split(',')[0]?.trim() || store.address : ''

                                        return (
                                            <Link
                                                key={store.id}
                                                href={storeUrl}
                                                className="block group"
                                            >
                                                <div
                                                    className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
                                                    style={{
                                                        background: cardBg,
                                                        backdropFilter: 'blur(12px)',
                                                        borderColor: colors.border,
                                                        boxShadow: colors.shadow,
                                                    }}
                                                >
                                                    <div className="flex gap-4">
                                                        {/* Logo */}
                                                        <div
                                                            className="w-24 h-24 rounded-xl overflow-hidden shrink-0"
                                                            style={{ background: `${colors.surface}44` }}
                                                        >
                                                            {store.logo_url ? (
                                                                <img
                                                                    src={store.logo_url}
                                                                    alt={store.name}
                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                />
                                                            ) : (
                                                                <div
                                                                    className="w-full h-full flex items-center justify-center text-3xl font-black"
                                                                    style={{ color: colors.textSecondary }}
                                                                >
                                                                    {store.name?.charAt(0).toUpperCase() || '?'}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Informações */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <h3
                                                                        className="text-lg font-black truncate"
                                                                        style={{ color: colors.textPrimary }}
                                                                    >
                                                                        {store.name}
                                                                    </h3>
                                                                    {addressShort && (
                                                                        <div className="flex items-center gap-1 mt-0.5">
                                                                            <MapPin className="w-3 h-3 opacity-50" style={{ color: colors.textSecondary }} />
                                                                            <span className="text-xs truncate" style={{ color: colors.textSecondary }}>
                                                                                {addressShort}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <div
                                                                        className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-green-500' : 'bg-red-500'}`}
                                                                    />
                                                                    <span className="text-[10px] font-bold" style={{ color: isOpen ? '#10b981' : '#ef4444' }}>
                                                                        {isOpen ? 'Aberto' : 'Fechado'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Descrição */}
                                                            {store.description && (
                                                                <p
                                                                    className="text-xs line-clamp-2 mt-1"
                                                                    style={{ color: colors.textSecondary }}
                                                                >
                                                                    {store.description}
                                                                </p>
                                                            )}

                                                            {/* Rating + Tempo */}
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
                                                                {store.prep_time_min !== null || store.prep_time_max !== null ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <Clock size={14} style={{ color: colors.accent }} />
                                                                        <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                                                            {formatPrepTime(store)}
                                                                        </span>
                                                                    </div>
                                                                ) : null}
                                                            </div>

                                                            {/* WhatsApp */}
                                                            {store.whatsapp && (
                                                                <div className="mt-2 flex items-center gap-1">
                                                                    <span className="text-[10px] font-bold text-green-600">
                                                                        📱 WhatsApp
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <ChevronRight
                                                            className="w-5 h-5 self-center group-hover:text-orange-400 transition-colors"
                                                            style={{ color: colors.textSecondary }}
                                                        />
                                                    </div>
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    )
}