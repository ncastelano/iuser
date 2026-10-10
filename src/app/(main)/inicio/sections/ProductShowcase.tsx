// src/app/(main)/inicio/sections/ProductShowcase.tsx
'use client'

import { useState, useEffect, ReactNode } from 'react'
import {
    Star,
    Package,
    Eye,
} from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'
import { HomeSectionHeader } from './HomeSectionKit'
import { ViewServicesButton } from './ViewServicesButton'
import ListingRowCard from '@/components/ListingRowCard'
import SeenBox from '@/components/SeenBox'
import { usePagedRotation } from '@/hooks/usePagedRotation'
import { PageDots, PAGE_SLIDE_CSS } from '@/components/PageDots'
import { useProfile } from '@/app/contexts/ProfileContext'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ---------- Tipos ----------
export interface ProductCard {
    id: string
    name: string
    slug: string
    imageUrl: string | null
    price: number | null
    description?: string
    durationMinutes: number | null
    viewCount: number
    rating: number
    reviewCount: number
    storeName: string
    storeSlug: string
    storeAddress: string | null
    storeLogoUrl: string | null
    profileSlug?: string | null
    isProfileProduct: boolean
    // Dono (perfil) de quem vende: borda do plano no avatar e não contar a própria visualização
    sellerId?: string | null
}

// ---------- Props ----------
interface ProductShowcaseProps {
    dragHandle?: ReactNode
}

// ---------- Função para obter URL pública do avatar ----------
function getAvatarUrl(avatarPath: string | null): string | null {
    if (!avatarPath) return null

    try {
        if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
            return avatarPath
        }

        let cleanPath = avatarPath
        if (cleanPath.startsWith('avatars/')) {
            cleanPath = cleanPath.replace('avatars/', '')
        }
        if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.substring(1)
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(cleanPath)
        return data.publicUrl
    } catch (error) {
        console.error('[getAvatarUrl] Erro ao gerar URL do avatar:', error)
        return null
    }
}

// ---------- Embaralhamento ----------
function shuffleNoAdjacentStore(products: ProductCard[]): ProductCard[] {
    if (products.length <= 1) return products

    const storeMap = new Map<string, ProductCard[]>()
    for (const p of products) {
        const key = p.isProfileProduct ? `profile_${p.profileSlug}` : p.storeSlug
        const list = storeMap.get(key) || []
        list.push(p)
        storeMap.set(key, list)
    }

    const heap = Array.from(storeMap.entries()).map(([store, items]) => ({
        store,
        items,
    }))
    heap.sort((a, b) => b.items.length - a.items.length)

    const result: ProductCard[] = []
    let lastStore: string | null = null

    while (heap.length > 0) {
        let pickIdx = 0
        if (heap[0].store === lastStore && heap.length > 1) {
            pickIdx = 1
        }

        const picked = heap[pickIdx]
        result.push(picked.items.pop()!)
        lastStore = picked.store

        if (picked.items.length === 0) {
            heap.splice(pickIdx, 1)
        }

        heap.sort((a, b) => b.items.length - a.items.length)
    }

    return result
}

// Todos os produtos (do banco) já com loja/perfil, avaliação e imagem — usado pela home e por /produtos
export async function loadProductCards(): Promise<ProductCard[]> {
    const { data: storesList, error: storesErr } = await supabase
        .from('stores')
        .select('id, name, storeSlug, address, logo_url, owner_id')

    if (storesErr) {
        console.error('[ProductShowcase] Erro ao buscar lojas:', storesErr)
        return []
    }

    const storeMap = new Map(storesList?.map(s => [s.id, s]) || [])

    const { data: productsList, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .eq('listing_type', 'sale')
        .order('view_count', { ascending: false })

    if (prodErr) {
        console.error('[ProductShowcase] Erro ao buscar produtos:', prodErr)
        return []
    }

    if (!productsList || productsList.length === 0) {
        return []
    }

    const storeOwnerIds = [...new Set(storesList?.map(s => s.owner_id) || [])]
    const productOwnerIds = productsList
        .filter(p => p.owner_id)
        .map(p => p.owner_id)

    const uniqueProfileIds = [...new Set([...storeOwnerIds, ...productOwnerIds])]

    const { data: allProfiles, error: profileErr } = await supabase
        .from('profiles')
        .select('id, name, profileSlug, avatar_url')
        .in('id', uniqueProfileIds)

    if (profileErr) {
        console.error('[ProductShowcase] Erro ao buscar perfis:', profileErr)
    }

    const profileMap = new Map(allProfiles?.map(p => [p.id, p]) || [])

    const { data: reviewsList } = await supabase
        .from('product_reviews')
        .select('product_id, rating')

    const ratingMap = new Map<string, { sum: number; count: number }>()
    reviewsList?.forEach(r => {
        if (!ratingMap.has(r.product_id)) ratingMap.set(r.product_id, { sum: 0, count: 0 })
        const cur = ratingMap.get(r.product_id)!
        cur.sum += r.rating
        cur.count += 1
    })

    const cards: ProductCard[] = productsList.map(prod => {
        const isProfileProduct = !prod.store_id && !!prod.owner_id
        const store = storeMap.get(prod.store_id)

        let storeName = 'Loja desconhecida'
        let storeSlug = '#'
        let storeAddress: string | null = null
        let storeLogoUrl: string | null = null
        let profileSlug: string | null = null

        const profile = profileMap.get(prod.owner_id)

        if (profile) {
            profileSlug = profile.profileSlug || null
        }

        if (prod.owner_image_url) {
            storeLogoUrl = prod.owner_image_url
        }

        if (isProfileProduct) {
            if (profile) {
                storeName = profile.profileSlug ? `@${profile.profileSlug}` : profile.name || 'Perfil sem nome'
                storeSlug = profile.profileSlug || '#'
                storeAddress = null

                if (!storeLogoUrl && profile.avatar_url) {
                    storeLogoUrl = getAvatarUrl(profile.avatar_url)
                }
            }
        } else if (store) {
            storeName = store.name
            storeSlug = store.storeSlug
            storeAddress = store.address ?? null

            if (!storeLogoUrl && store.logo_url) {
                storeLogoUrl = supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
            }

            if (!storeLogoUrl && profile && profile.avatar_url) {
                storeLogoUrl = getAvatarUrl(profile.avatar_url)
            }
        } else {
            if (profile) {
                storeName = profile.profileSlug ? `@${profile.profileSlug}` : profile.name || 'Perfil sem nome'
                storeSlug = profile.profileSlug || '#'
                storeAddress = null

                if (!storeLogoUrl && profile.avatar_url) {
                    storeLogoUrl = getAvatarUrl(profile.avatar_url)
                }
            }
        }

        if (!storeLogoUrl && profile && profile.avatar_url) {
            storeLogoUrl = getAvatarUrl(profile.avatar_url)
        }

        const imageUrl = prod.image_url
            ? supabase.storage.from('product-images').getPublicUrl(prod.image_url).data.publicUrl
            : null

        const ratingData = ratingMap.get(prod.id)
        const avg = ratingData ? ratingData.sum / ratingData.count : 0
        const count = ratingData ? ratingData.count : 0

        return {
            id: prod.id,
            name: prod.name,
            slug: prod.slug,
            imageUrl,
            price: prod.price ?? null,
            description: prod.description,
            durationMinutes: prod.duration_minutes ?? null,
            viewCount: prod.view_count ?? 0,
            rating: Number(avg.toFixed(1)),
            reviewCount: count,
            storeName,
            storeSlug,
            storeAddress,
            storeLogoUrl,
            profileSlug: profileSlug ?? null,
            sellerId: (store as any)?.owner_id ?? prod.owner_id ?? null,
            isProfileProduct: isProfileProduct || (!prod.store_id && !!prod.owner_id),
        }
    })
    return cards
}

// ---------- Hook de dados ----------
function useProductShowcase() {
    const [products, setProducts] = useState<ProductCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true)

            try {
                const cards = await loadProductCards()
                setProducts(shuffleNoAdjacentStore(cards))
            } catch (error) {
                console.error('[ProductShowcase] Erro geral:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchProducts()
    }, [])

    return { products, loading }
}

// ---------- Helpers ----------
const formatPrice = (price: number | null) => {
    if (price == null) return null
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ========== SKELETON CARD ==========
function ProductSkeleton({ colors }: { colors: any }) {
    return <div className="h-[130px] rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />
}

// ---------- Componente ----------
// ===== URL do produto =====
function getProductUrl(product: ProductCard) {
    // Se tem storeSlug e product slug, vai para /storeSlug/productSlug
    if (product.storeSlug && product.storeSlug !== '#' && product.slug) {
        return `/${product.storeSlug}/${product.slug}`
    }
    // Fallback: se não tem storeSlug, usa o profileSlug
    if (product.profileSlug) {
        return `/${product.profileSlug}/${product.slug || product.id}`
    }
    // Fallback final
    return `/${product.storeSlug}/${product.slug || product.id}`
}

// Fileira horizontal de cards verticais (imagem quadrada em cima, nome/
// loja/preço embaixo) — igual ao "Produtos em destaque" do
// /modelodehomepage, trocando o carrossel paginado por scroll lateral.
export default function ProductShowcase({ dragHandle }: ProductShowcaseProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()

    const { products, loading } = useProductShowcase()
    const { userId } = useProfile()

    // 3 por vez, alternando sozinho (e com o dedo/touchpad), igual a "Quem já oferece serviço"
    const { page, dir, pages, goTo, handlers, visibleRange } = usePagedRotation(products.length, 3)
    const visible = products.slice(visibleRange[0], visibleRange[1])

    // Passar o mouse por cima conta como visualização (uma vez por sessão; o dono olhando o dele não conta)
    const countHover = (product: ProductCard) => {
        if (product.sellerId && product.sellerId === userId) return
        supabase.rpc('increment_product_view_count', { p_product_id: product.id }).then(() => {}, () => {})
    }

    // Pre-carrega a rota dos produtos visíveis, pra abrir na hora ao clicar.
    useEffect(() => {
        products.slice(0, 12).forEach((product) => {
            router.prefetch(getProductUrl(product))
        })
    }, [products, router])

    if (loading) {
        return (
            <div className="w-full">
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <div className="h-6 rounded w-48 animate-pulse" style={{ background: `${colors.border}60` }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 overflow-hidden">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <ProductSkeleton key={`skeleton-${i}`} colors={colors} />
                    ))}
                </div>
            </div>
        )
    }

    if (!products.length) return null

    return (
        <div className="relative w-full">
            <HomeSectionHeader
                title="Produtos em destaque"
                subtitle={`${products.length} ${products.length === 1 ? 'produto' : 'produtos'}`}
                dragHandle={dragHandle}
                action={<ViewServicesButton label="ver produtos" count={products.length} onClick={() => { startNavProgress(); router.push('/produtos') }} />}
            />

            {/* 3 cartões por vez; passa de 3 em 3 sem repetir até mostrar todos (deslizar ou pontinhos também trocam) */}
            <div {...handlers}>
                <div key={page} className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${dir > 0 ? 'page-in-next' : 'page-in-prev'}`} style={{ touchAction: 'pan-y' }}>
                    {visible.map((product) => (
                        <SeenBox
                            key={product.id}
                            onSeen={() => countHover(product)}
                            seenKey={`product:${product.id}`}
                            dwellMs={2_000_000_000}
                        >
                            <ListingRowCard
                                title={product.name}
                                description={product.description}
                                imageUrl={product.imageUrl || product.storeLogoUrl}
                                fallbackIcon={<Package size={30} />}
                                priceLabel={formatPrice(product.price)}
                                sellerName={product.storeName}
                                sellerImageUrl={product.storeLogoUrl}
                                sellerId={product.sellerId}
                                rating={product.rating}
                                views={product.viewCount}
                                onClick={() => { startNavProgress(); router.push(getProductUrl(product)) }}
                            />
                        </SeenBox>
                    ))}
                </div>
            </div>
            <PageDots pages={pages} page={page} onGo={goTo} label="Ver produtos, página" />
            <style>{PAGE_SLIDE_CSS}</style>
        </div>
    )
}