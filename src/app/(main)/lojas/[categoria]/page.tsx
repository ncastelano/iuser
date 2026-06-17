// app/(main)/lojas/[categoria]/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Star,
    Clock,
    ChevronRight,
} from 'lucide-react'
import { dadosMockados, type Store } from '@/app/(main)/inicio/dadoDeLojas'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'

// Cores e ícones das categorias (mantidas para os cards)
const categoriasInfo: Record<string, { titulo: string; descricao: string; color: string }> = {
    restaurantes: { titulo: 'Restaurantes', descricao: 'Peça sua comida favorita', color: '#F97316' },
    mercados: { titulo: 'Mercados', descricao: 'Compras do dia a dia', color: '#10B981' },
    farmacias: { titulo: 'Farmácias', descricao: 'Saúde e bem-estar', color: '#3B82F6' },
    petshops: { titulo: 'Pet Shops', descricao: 'Para seu melhor amigo', color: '#EC4899' },
    fitness: { titulo: 'Fitness', descricao: 'Academias e suplementos', color: '#8B5CF6' },
    roupas: { titulo: 'Roupas', descricao: 'Moda e estilo', color: '#F59E0B' },
    entregas: { titulo: 'Entregas', descricao: 'Envie ou receba pacotes', color: '#06B6D4' },
}

function formatPrepTime(store: Store): string {
    if (store.prep_time_min === null && store.prep_time_max === null) return 'Indisponível'
    if (store.prep_time_min !== null && store.prep_time_max !== null) {
        return `${store.prep_time_min}–${store.prep_time_max} min`
    }
    if (store.prep_time_min !== null) return `${store.prep_time_min} min`
    return `${store.prep_time_max} min`
}

export default function ListaCategoriaPage() {
    const params = useParams()
    const router = useRouter()
    const categoriaRaw = params.categoria
    const categoria: string | undefined = Array.isArray(categoriaRaw) ? categoriaRaw[0] : categoriaRaw

    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading } = useProfile()
    const { colors } = useTheme()

    const [searchQuery, setSearchQuery] = useState('') // estado do filtro

    if (!categoria || !categoriasInfo[categoria]) {
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

    const info = categoriasInfo[categoria]
    const categoryColor = info.color
    const allStores: Store[] = useMemo(() => dadosMockados[categoria] || [], [categoria])

    // Filtro aplicado conforme o texto digitado na busca
    const filteredStores = useMemo(() => {
        if (!searchQuery.trim()) return allStores
        const query = searchQuery.toLowerCase()
        return allStores.filter(
            store =>
                store.name.toLowerCase().includes(query) ||
                store.description?.toLowerCase().includes(query)
        )
    }, [allStores, searchQuery])

    // Helper para fundo semitransparente com blur
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                {/* Header global com busca ativada */}
                <Header
                    title="Restaurantes"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${loading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={loading}
                    showSearch={true}
                    searchPlaceholder="Filtrar lojas..."
                    onSearch={setSearchQuery}
                />

                {/* LISTA DE LOJAS FILTRADA */}
                <section className="px-4 md:px-6 mt-2 pb-24">
                    {filteredStores.length === 0 ? (
                        <div
                            className="rounded-2xl p-6 flex flex-col items-center gap-3 mt-4"
                            style={{
                                background: cardBg,
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: `1px solid ${colors.border}`,
                                boxShadow: colors.shadow,
                            }}
                        >
                            <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                Nenhuma loja encontrada.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredStores.map((store: Store) => (
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
                                            {/* Logo da loja */}
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
                                                        {store.name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>

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

                                                <div className="mt-3">
                                                    <span
                                                        className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                                                        style={{
                                                            background: `${categoryColor}20`,
                                                            color: categoryColor,
                                                        }}
                                                    >
                                                        {info.titulo}
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
                </section>
            </main>
        </div>
    )
}