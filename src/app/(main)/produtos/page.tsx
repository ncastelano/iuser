// app/(main)/produtos/page.tsx
//
// Todos os produtos do iUser (de lojas e de perfis), no mesmo cartão em linha da home: foto de um lado, texto do outro.
// "Produtos em destaque" da home leva pra cá pelo botão "ver produtos".
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package } from 'lucide-react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import ListingRowCard from '@/components/ListingRowCard'
import { Spinner } from '@/components/Spinner'
import { loadProductCards, type ProductCard } from '../inicio/sections/ProductShowcase'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const PAGE_SIZE = 24

const formatPrice = (price: number | null) => (price == null ? null : price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

export default function ProdutosPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [products, setProducts] = useState<ProductCard[] | null>(null)
    const [search, setSearch] = useState('')
    const [shown, setShown] = useState(PAGE_SIZE)

    useEffect(() => {
        loadProductCards().then(setProducts).catch(() => setProducts([]))
    }, [])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        const list = products || []
        if (!q) return list
        return list.filter((p) => p.name?.toLowerCase().includes(q) || p.storeName?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    }, [products, search])

    useEffect(() => { setShown(PAGE_SIZE) }, [search])

    const urlOf = (p: ProductCard) => {
        if (p.storeSlug && p.storeSlug !== '#' && p.slug) return `/${p.storeSlug}/${p.slug}`
        if (p.profileSlug) return `/${p.profileSlug}/${p.slug || p.id}`
        return `/${p.storeSlug}/${p.slug || p.id}`
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Produtos"
                    showBack
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                    showSearch
                    searchPlaceholder="Procurar produtos"
                    searchValue={search}
                    onSearch={setSearch}
                />

                <section className="px-4 md:px-6 mt-3 pb-24">
                    {products === null ? (
                        <div className="flex justify-center py-16"><Spinner size={28} color={colors.accent} /></div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-3xl p-8 flex flex-col items-center gap-2 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Package size={26} /></span>
                            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                {search ? 'Nenhum produto encontrado' : 'Nenhum produto por enquanto'}
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                                {filtered.length} {filtered.length === 1 ? 'produto' : 'produtos'}{search ? ` para “${search}”` : ''}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {filtered.slice(0, shown).map((p) => (
                                    <ListingRowCard
                                        key={p.id}
                                        title={p.name}
                                        description={p.description}
                                        imageUrl={p.imageUrl || p.storeLogoUrl}
                                        fallbackIcon={<Package size={30} />}
                                        priceLabel={formatPrice(p.price)}
                                        sellerName={p.storeName}
                                        sellerImageUrl={p.storeLogoUrl}
                                        rating={p.rating}
                                        views={p.viewCount}
                                        onClick={() => router.push(urlOf(p))}
                                    />
                                ))}
                            </div>
                            {shown < filtered.length && (
                                <div className="flex justify-center mt-5">
                                    <button
                                        onClick={() => setShown((n) => n + PAGE_SIZE)}
                                        className="px-6 py-3 rounded-full font-black text-sm text-white transition-transform hover:scale-105 active:scale-95"
                                        style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731640' }}
                                    >
                                        Mostrar mais
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    )
}
