// app/(main)/lojas/[categoria]/page.tsx
'use client'

import { useMemo, useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Star,
    Clock,
    ChevronRight,
    Loader2,
} from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import { categoriasMap } from '@/lib/categorias' // <-- IMPORTE O MAPA CENTRAL

// ----------------------------------------------------------------------
// Tipagem para loja vinda do Supabase (simplificada)
// ----------------------------------------------------------------------
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
    profiles?: {
        profileSlug: string
    } | null
}

// ----------------------------------------------------------------------
// Helper para formatar tempo de preparo
// ----------------------------------------------------------------------
function formatPrepTime(store: StoreFromDB): string {
    if (store.prep_time_min === null && store.prep_time_max === null) return 'Indisponível'
    if (store.prep_time_min !== null && store.prep_time_max !== null) {
        return `${store.prep_time_min}–${store.prep_time_max} min`
    }
    if (store.prep_time_min !== null) return `${store.prep_time_min} min`
    return `${store.prep_time_max} min`
}

// ----------------------------------------------------------------------
// Componente principal
// ----------------------------------------------------------------------
export default function ListaCategoriaPage() {
    const params = useParams()
    const router = useRouter()
    const categoriaRaw = params.categoria
    const categoria: string | undefined = Array.isArray(categoriaRaw) ? categoriaRaw[0] : categoriaRaw

    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [searchQuery, setSearchQuery] = useState('')

    // Dados reais
    const [stores, setStores] = useState<StoreFromDB[]>([])
    const [profiles, setProfiles] = useState<any[]>([])      // usado apenas em "social"
    const [loadingData, setLoadingData] = useState(false)

    // ------------------------------------------------------------------
    // Efeito: busca lojas (ou perfis, se for social) do Supabase
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!categoria) return

        // Categoria "social" → busca perfis
        if (categoria === 'social') {
            const loadProfiles = async () => {
                setLoadingData(true)
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
                }
                setLoadingData(false)
            }
            loadProfiles()
            return
        }

        // Demais categorias → busca lojas reais
        const loadStores = async () => {
            setLoadingData(true)

            // Obtém a informação da categoria a partir do mapa central
            const info = categoriasMap[categoria]
            const categoryName = info?.nome || categoria // fallback para o próprio slug

            // --------------------------------------------------------------
            // 1. Buscar lojas SEM a relação com profiles
            //    (usamos o campo "category" da tabela stores para filtrar)
            // --------------------------------------------------------------
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
                    category
                `)
                // Filtra pelo campo category (que deve ser o slug da categoria)
                // Ex: "alimentacao", "saude", etc.
                .eq('category', categoria)
                .order('ratings_avg', { ascending: false })
                .limit(30)

            if (storesError) {
                console.error('Erro ao buscar lojas:', storesError)
                setStores([])
                setLoadingData(false)
                return
            }

            // Se não veio nenhuma loja, tenta uma busca mais ampla (fallback)
            let finalStores = storesData || []
            if (finalStores.length === 0) {
                // Fallback: busca por nome/descrição contendo o nome da categoria
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
                        category
                    `)
                    .or(`name.ilike.%${categoryName}%, description.ilike.%${categoryName}%`)
                    .order('ratings_avg', { ascending: false })
                    .limit(30)

                if (!fallbackError && fallbackData) {
                    finalStores = fallbackData
                }
            }

            // --------------------------------------------------------------
            // 2. Buscar os profileSlug dos donos (owner_id → profiles)
            // --------------------------------------------------------------
            const ownerIds = [...new Set(finalStores.map(s => s.owner_id).filter(Boolean))]
            let profilesMap: Record<string, string> = {}
            if (ownerIds.length) {
                const { data: profilesData, error: profError } = await supabase
                    .from('profiles')
                    .select('id, "profileSlug"')
                    .in('id', ownerIds)

                if (profError) {
                    console.error('Erro ao buscar profileSlug dos donos:', profError)
                } else {
                    profilesMap = Object.fromEntries((profilesData || []).map(p => [p.id, p.profileSlug]))
                }
            }

            // --------------------------------------------------------------
            // 3. Mapear as lojas com o profileSlug (e logo pública)
            // --------------------------------------------------------------
            const mappedStores = finalStores.map((store: any) => ({
                ...store,
                logo_url: store.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null,
                profiles: { profileSlug: profilesMap[store.owner_id] || null },
            }))

            setStores(mappedStores as StoreFromDB[])
            setLoadingData(false)
        }

        loadStores()
    }, [categoria])

    // ------------------------------------------------------------------
    // Filtro local por busca textual
    // ------------------------------------------------------------------
    const filteredStores = useMemo(() => {
        if (!searchQuery.trim()) return stores
        const q = searchQuery.toLowerCase()
        return stores.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                (s.description && s.description.toLowerCase().includes(q))
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

    // ------------------------------------------------------------------
    // Fallback: categoria inválida (agora usando o mapa central)
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Estilo de card translúcido (tema adaptável)
    // ------------------------------------------------------------------
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    // ------------------------------------------------------------------
    // Renderização
    // ------------------------------------------------------------------
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title={info.nome} // <-- agora usa "nome" em vez de "titulo"
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

                    {/* CATEGORIA SOCIAL: lista de perfis */}
                    {categoria === 'social' && !loadingData && (
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
                                        Nenhum perfil encontrado.
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

                    {/* DEMAIS CATEGORIAS: lista de lojas reais */}
                    {categoria !== 'social' && !loadingData && (
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
                                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                        Nenhuma loja encontrada para esta categoria.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredStores.map((store) => {
                                        const ownerSlug = store.profiles?.profileSlug || 'perfil'
                                        const storeUrl = `/${ownerSlug}/${store.storeSlug}`

                                        return (
                                            <Link
                                                key={store.id}
                                                href={storeUrl}
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
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <div
                                                                    className="w-full h-full flex items-center justify-center text-2xl font-black"
                                                                    style={{ color: colors.textSecondary }}
                                                                >
                                                                    {store.name?.charAt(0) || '?'}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Informações */}
                                                        <div className="flex-1 min-w-0">
                                                            <h3
                                                                className="text-lg font-black truncate"
                                                                style={{ color: colors.textPrimary }}
                                                            >
                                                                {store.name}
                                                            </h3>
                                                            <p
                                                                className="text-xs line-clamp-2 mt-1"
                                                                style={{ color: colors.textSecondary }}
                                                            >
                                                                {store.description || 'Sem descrição'}
                                                            </p>

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
                                                                <div className="flex items-center gap-1">
                                                                    <Clock size={14} style={{ color: colors.accent }} />
                                                                    <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                                                        {formatPrepTime(store)}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Tag da categoria */}
                                                            <div className="mt-3">
                                                                <span
                                                                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                                                                    style={{
                                                                        background: `${categoryColor}20`,
                                                                        color: categoryColor,
                                                                    }}
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