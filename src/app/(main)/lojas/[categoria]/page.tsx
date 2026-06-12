// app/(main)/lojas/[categoria]/page.tsx
'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Star,
    Clock,
    ChevronRight,
    Search,
    ArrowLeft,
    UtensilsCrossed,
    ShoppingCart,
    Pill,
    PawPrint,
    Dumbbell,
    Shirt,
    Truck,
    type LucideIcon,
} from 'lucide-react'
import { dadosMockados, type Store } from '@/app/(main)/inicio/dadoDeLojas'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Link from 'next/link'
import { useProfile } from '@/app/contexts/ProfileContext'

const categoriasInfo: Record<string, { titulo: string; descricao: string; icon: LucideIcon; color: string }> = {
    restaurantes: { titulo: 'Restaurantes', descricao: 'Peça sua comida favorita', icon: UtensilsCrossed, color: '#F97316' },
    mercados: { titulo: 'Mercados', descricao: 'Compras do dia a dia', icon: ShoppingCart, color: '#10B981' },
    farmacias: { titulo: 'Farmácias', descricao: 'Saúde e bem-estar', icon: Pill, color: '#3B82F6' },
    petshops: { titulo: 'Pet Shops', descricao: 'Para seu melhor amigo', icon: PawPrint, color: '#EC4899' },
    fitness: { titulo: 'Fitness', descricao: 'Academias e suplementos', icon: Dumbbell, color: '#8B5CF6' },
    roupas: { titulo: 'Roupas', descricao: 'Moda e estilo', icon: Shirt, color: '#F59E0B' },
    entregas: { titulo: 'Entregas', descricao: 'Envie ou receba pacotes', icon: Truck, color: '#06B6D4' },
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

    // 🔥 Tudo agora vem do contexto global
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading } = useProfile()

    if (!categoria || !categoriasInfo[categoria]) {
        return (
            <div className="relative min-h-screen flex items-center justify-center bg-black text-white">
                <AnimatedBackgroundiUser bgMode="black" />
                <div className="relative z-10 text-center">
                    <h1 className="text-2xl font-black mb-4">Categoria não encontrada</h1>
                    <Link href="/" className="text-purple-400 underline font-bold">
                        Voltar ao início
                    </Link>
                </div>
            </div>
        )
    }

    const info = categoriasInfo[categoria]
    const categoryColor = info.color
    const stores: Store[] = useMemo(() => dadosMockados[categoria] || [], [categoria])
    const recentStores: Store[] = stores.slice(0, 3)

    return (
        <div className="relative min-h-dvh" style={{ background: '#000' }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                {/* HEADER STICKY */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #000000, #000000)',
                        padding: '20px 24px',
                        color: '#ffffff',
                        borderBottomLeftRadius: 36,
                        borderBottomRightRadius: 36,
                        boxShadow: '0 10px 40px rgba(255,255,255,0.25)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        overflow: 'hidden',
                    }}
                >
                    {/* Avatar do usuário */}
                    <div
                        style={{
                            position: 'absolute',
                            right: -20,
                            top: -20,
                            opacity: 0.4,
                            transform: 'rotate(10deg)',
                            maskImage:
                                'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                            WebkitMaskImage:
                                'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                        }}
                    >
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="" style={{ width: 280, height: 280, objectFit: 'cover' }} />
                        ) : (
                            <img
                                src="/logotransparente.png"
                                alt="Logo"
                                style={{ width: 280, height: 280, objectFit: 'contain' }}
                            />
                        )}
                    </div>

                    <div className="relative z-10">
                        {/* Linha superior: seta + nome da categoria */}
                        <div className="flex items-center gap-3 mb-1">
                            <button
                                onClick={() => router.back()}
                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(10px)',
                                    border: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                <ArrowLeft size={20} color="#fff" />
                            </button>
                            <h2 className="text-lg font-semibold opacity-90">{info.titulo}</h2>
                        </div>

                        {/* Saudação com @profileSlug */}
                        <h1 className="text-3xl font-extrabold mt-2 tracking-tight">
                            Olá, {loading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}
                        </h1>

                        {/* Últimos clicados (lojas recentes) */}
                        {recentStores.length > 0 && (
                            <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
                                {recentStores.map((store: Store) => (
                                    <Link
                                        key={store.id}
                                        href={`/lojas/${categoria}/${store.storeSlug}`}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap"
                                        style={{
                                            background: 'rgba(255,255,255,0.15)',
                                            backdropFilter: 'blur(10px)',
                                            color: '#fff',
                                        }}
                                    >
                                        {store.logo_url ? (
                                            <img
                                                src={store.logo_url}
                                                alt={store.name}
                                                className="w-5 h-5 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white text-xs">
                                                {store.name.charAt(0)}
                                            </div>
                                        )}
                                        <span>{store.name}</span>
                                    </Link>
                                ))}
                            </div>
                        )}

                        {/* Barra de busca */}
                        <div
                            className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm"
                            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}
                        >
                            <Search size={18} className="opacity-70" />
                            <span className="opacity-70">Buscar em {info.titulo.toLowerCase()}...</span>
                        </div>
                    </div>
                </div>

                {/* LISTA DE LOJAS (CARDS ESTILO ESCURO) */}
                <section className="px-4 mt-6 pb-24">
                    <div className="space-y-4">
                        {stores.map((store: Store) => (
                            <Link
                                key={store.id}
                                href={`/lojas/${categoria}/${store.storeSlug}`}
                                className="block group"
                            >
                                <div
                                    className="rounded-2xl p-4 border transition-all duration-200 hover:shadow-lg hover:scale-[1.02]"
                                    style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        backdropFilter: 'blur(12px)',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                    }}
                                >
                                    <div className="flex gap-4">
                                        <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-white/10">
                                            {store.logo_url ? (
                                                <img
                                                    src={store.logo_url}
                                                    alt={store.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white/30">
                                                    {store.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg font-black text-white truncate">{store.name}</h3>
                                            <p className="text-xs text-white/60 line-clamp-2 mt-1">{store.description}</p>

                                            <div className="flex items-center gap-4 mt-3">
                                                <div className="flex items-center gap-1">
                                                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                                    <span className="text-sm font-bold text-white">
                                                        {store.ratings_avg}
                                                    </span>
                                                    <span className="text-xs text-white/40">
                                                        ({store.ratings_count})
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock size={14} className="text-purple-400" />
                                                    <span className="text-xs font-bold text-white/70">
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

                                        <ChevronRight className="w-5 h-5 text-white/30 self-center group-hover:text-orange-400 transition-colors" />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    )
}