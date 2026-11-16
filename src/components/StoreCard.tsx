'use client'
import { useRouter } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { resolveCategoria } from '@/lib/categorias'
import { RatingStars } from '@/components/ratings/RatingStars'
import { isStoreOpenNow, type BusinessHours } from '@/lib/storeHours'

export type StoreCardData = {
    id: string
    name: string
    storeSlug: string
    description?: string | null
    address?: string | null
    logo_url?: string | null
    category?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    owner_id: string
    business_hours?: BusinessHours | null
    view_count?: number
    listing_type?: 'sale' | 'publication' | null
    top_products?: {
        id: string
        name: string
        slug?: string | null
        image_url?: string | null
        price: number
        listing_type?: 'sale' | 'publication' | null
    }[]
    recent_reviews?: {
        id: string
        rating: number
        comment?: string
        profile_name?: string
    }[]
}

// ========== COMPONENTE CARD ==========
// Mesmo idioma dos outros cards da home (cantos grandes, capa, texto legível): o logo da loja aparece INTEIRO num
// círculo sobre uma cópia desfocada dele mesmo (nada de logo cortado), e o texto fala como gente.
export function StoreCard({
    store,
    onClick,
    colors,
}: {
    store: StoreCardData
    onClick: () => void
    colors: any
}) {
    const router = useRouter()
    // Tocar num produto/serviço do cartão abre a loja já "levando a câmera" até ele (a página rola até o item e o destaca)
    const openProduct = (e: React.SyntheticEvent, product: NonNullable<StoreCardData['top_products']>[number]) => {
        e.stopPropagation()
        // publicação não tem lugar na vitrine da loja: abre a própria página dela
        if (product.listing_type === 'publication' && product.slug) return router.push(`/${store.storeSlug}/${product.slug}`)
        router.push(`/${store.storeSlug}?produto=${product.id}`)
    }
    const isOpen = isStoreOpenNow(store.business_hours)
    const addressShort = store.address ? store.address.split(',')[0]?.trim() || store.address : ''

    const products = (store.top_products || []).slice(0, 2)
    const hasRating = !!store.ratings_count && store.ratings_count > 0
    const hasLogo = !!store.logo_url

    const categoryInfo = resolveCategoria(store.category)
    const categoryName = categoryInfo?.nome || store.category || null

    // v3: cartão de loja (sem capa): logo quadrado, nome, nota, endereço e situação; miniaturas do que ela vende
    return (
            <div onClick={onClick} className="p-3 rounded-3xl border flex gap-3 cursor-pointer transition active:scale-[0.99]" style={{ background: colors.surface, borderColor: colors.border }}>
                <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: '#f9731620' }}>
                    {hasLogo
                        ? <img src={store.logo_url!} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <span className="text-2xl font-black" style={{ color: '#f97316' }}>{store.name.charAt(0).toUpperCase()}</span>}
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{store.name}</h3>
                    <p className="mt-0.5 text-[12px] truncate" style={{ color: colors.textSecondary }}>
                        {[categoryName, addressShort].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap text-[12px]" style={{ color: colors.textSecondary }}>
                        {hasRating && (
                            <span className="flex items-center gap-1"><RatingStars value={store.ratings_avg || 0} size={11} /><b style={{ color: colors.textPrimary }}>{store.ratings_avg?.toFixed(1)}</b> ({store.ratings_count})</span>
                        )}
                        <span className="font-black" style={{ color: isOpen ? '#16a34a' : '#ef4444' }}>{isOpen ? 'Aberto agora' : 'Fechado'}</span>
                    </div>
                    {products.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5">
                            {(store.top_products || []).slice(0, 4).map((product) => (
                                <button key={product.id} onClick={(e) => openProduct(e, product)} aria-label={`Ver ${product.name} na loja`} title={product.name} className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center transition active:scale-90" style={{ background: `${colors.border}40` }}>
                                    {product.image_url
                                        ? <img src={product.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        : <ShoppingCart className="w-4 h-4 opacity-40" style={{ color: colors.textPrimary }} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )
}

// ========== SKELETON CARD ==========
export function StoreCardSkeleton({ colors }: { colors: any }) {
    const bar = (w: string, h = 12) => <div className="rounded-full" style={{ width: w, height: h, background: `${colors.border}40` }} />
    return (
        <div className="w-full rounded-3xl overflow-hidden border flex flex-col animate-pulse" style={{ borderColor: colors.border, background: colors.surface }}>
            <div className="w-full h-40 flex items-center justify-center" style={{ background: `${colors.border}35` }}>
                <div className="w-24 h-24 rounded-full" style={{ background: `${colors.border}50` }} />
            </div>
            <div className="p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-2">{bar('70%', 18)}{bar('45%')}</div>
                <div className="flex flex-col gap-2">{bar('60%')}{bar('50%')}</div>
                <div className="pt-3 border-t flex flex-col gap-2" style={{ borderColor: colors.border }}>
                    <div className="flex items-center gap-2.5"><div className="w-10 h-10 rounded-xl" style={{ background: `${colors.border}35` }} />{bar('55%')}</div>
                    <div className="flex items-center gap-2.5"><div className="w-10 h-10 rounded-xl" style={{ background: `${colors.border}35` }} />{bar('45%')}</div>
                </div>
                <div className="rounded-full" style={{ height: 40, background: `${colors.border}35` }} />
            </div>
        </div>
    )
}

