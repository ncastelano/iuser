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

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ---------- Tipos ----------
interface ProductCard {
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

// ---------- Hook de dados ----------
function useProductShowcase() {
    const [products, setProducts] = useState<ProductCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true)

            try {
                const { data: storesList, error: storesErr } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, address, logo_url, owner_id')

                if (storesErr) {
                    console.error('[ProductShowcase] Erro ao buscar lojas:', storesErr)
                    setLoading(false)
                    return
                }

                const storeMap = new Map(storesList?.map(s => [s.id, s]) || [])

                const { data: productsList, error: prodErr } = await supabase
                    .from('products')
                    .select('*')
                    .eq('listing_type', 'sale')
                    .order('view_count', { ascending: false })

                if (prodErr) {
                    console.error('[ProductShowcase] Erro ao buscar produtos:', prodErr)
                    setLoading(false)
                    return
                }

                if (!productsList || productsList.length === 0) {
                    setProducts([])
                    setLoading(false)
                    return
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
                            storeName = profile.name || 'Perfil sem nome'
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
                            storeName = profile.name || 'Perfil sem nome'
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
                        isProfileProduct: isProfileProduct || (!prod.store_id && !!prod.owner_id),
                    }
                })

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
    return (
        <div className="w-48 flex-shrink-0 rounded-3xl overflow-hidden border animate-pulse" style={{ borderColor: colors.border, background: colors.surface }}>
            <div className="w-full h-40" style={{ background: `${colors.border}40` }} />
            <div className="p-3.5 flex flex-col gap-2">
                <div className="h-3.5 rounded-full w-4/5" style={{ background: `${colors.border}40` }} />
                <div className="h-3 rounded-full w-1/2" style={{ background: `${colors.border}30` }} />
                <div className="h-4 rounded-full w-1/3" style={{ background: `${colors.border}40` }} />
            </div>
        </div>
    )
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
                <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 4 }).map((_, i) => (
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
                action={<ViewServicesButton label="ver lojas" onClick={() => { startNavProgress(); router.push('/lojas') }} />}
            />

            <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 items-stretch" style={{ scrollbarWidth: 'none' }}>
                {products.map((product) => {
                    const cover = product.imageUrl || product.storeLogoUrl
                    const price = formatPrice(product.price)

                    return (
                        <div
                            key={product.id}
                            onClick={() => { startNavProgress(); router.push(getProductUrl(product)) }}
                            className="w-48 flex-shrink-0 rounded-3xl overflow-hidden border cursor-pointer group flex flex-col transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
                            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
                        >
                            {/* Foto inteira sobre uma cópia desfocada dela mesma, igual aos outros cards da home */}
                            <div className="relative w-full h-40 overflow-hidden flex-shrink-0" style={{ background: GRADIENT }}>
                                {cover ? (
                                    <>
                                        <img src={cover} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl opacity-70" loading="lazy" />
                                        <img src={cover} alt={product.name} className="relative w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Package size={32} color="#fff" opacity={0.8} />
                                    </div>
                                )}
                                {product.viewCount > 0 && (
                                    <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 text-[11px] font-bold text-white px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.45)' }}>
                                        <Eye size={12} />
                                        {product.viewCount}
                                    </span>
                                )}
                                {product.rating > 0 && (
                                    <span className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[11px] font-black text-white px-2.5 py-1 rounded-full backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.45)' }}>
                                        <Star size={11} className="fill-yellow-400 text-yellow-400" />
                                        {product.rating.toFixed(1)}
                                    </span>
                                )}
                            </div>

                            <div className="p-3.5 flex flex-col gap-2 flex-1">
                                <p className="text-sm font-black leading-snug line-clamp-2" style={{ color: colors.textPrimary }}>{product.name}</p>
                                <div className="flex items-center gap-1.5 min-w-0">
                                    {product.storeLogoUrl && (
                                        <img src={product.storeLogoUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" loading="lazy" />
                                    )}
                                    <span className="text-xs truncate" style={{ color: colors.textSecondary }}>{product.storeName}</span>
                                </div>
                                {price && (
                                    <p className="mt-auto pt-1 text-base font-black" style={{ color: '#f97316' }}>{price}</p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}