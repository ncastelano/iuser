'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
    ArrowLeft,
    Briefcase,
    CheckCircle2,
    Store,
    Heart,
    Users,
    Plus,
    ChevronRight,
    Star,
    Clock,
    MapPin,
    ShoppingBag
} from 'lucide-react'

import { useCartStore } from '@/store/useCartStore'
import { RatingStars } from '@/components/ratings/RatingStars'
import { getAvatarUrl } from '@/lib/avatar'

import { formatOrderMessage, getWhatsAppLink } from '@/lib/whatsapp'

type Product = {
    id: string
    name: string
    price: number | null
    type: string | null
    category: string | null
    slug: string
    store_id: string
    description: string | null
    image_url: string | null
    ratings_avg: number | null
    ratings_count: number | null
}

type StoreData = {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    description: string | null
    is_open: boolean | null
    ratings_avg: number | null
    ratings_count: number | null
    owner_id: string
}

type RatingRow = {
    id: string
    rating: number
    comment?: string
    is_anonymous?: boolean
    created_at: string
    profiles?: {
        id: string
        name: string | null
        avatar_url: string | null
        profileSlug?: string | null
    } | null
}

export default function ProductPage() {
    const params = useParams()
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const productSlug = Array.isArray(params.productSlug) ? params.productSlug[0] : params.productSlug

    const [product, setProduct] = useState<Product | null>(null)
    const [store, setStore] = useState<StoreData | null>(null)
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [image, setImage] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [mounted, setMounted] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [buyerName, setBuyerName] = useState<string>('')
    const [ownerWhatsapp, setOwnerWhatsapp] = useState<string | null>(null)
    const [buyLoading, setBuyLoading] = useState(false)
    const [recentBuyers, setRecentBuyers] = useState<any[]>([])

    const { itemsByStore, addItem } = useCartStore()
    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const isInCart = product && cartItems.some((item) => item.product.id === product.id)

    useEffect(() => {
        setMounted(true)
    }, [])

    const productUrl = useMemo(() => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${profileSlug}/${storeSlug}/${productSlug}`
    }, [productSlug, profileSlug, storeSlug])

    const [otherProducts, setOtherProducts] = useState<Product[]>([])

    const loadRatings = useCallback(async (productId: string, userId?: string | null) => {
        const { data, error } = await supabase
            .from('product_reviews')
            .select('id, rating, comment, is_anonymous, created_at, profiles(id, name, avatar_url, "profileSlug")')
            .eq('product_id', productId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[ProductPage] Erro ao buscar avaliações:', error)
            return
        }

        const rows = (data || []).map((r: any) => ({
            ...r,
            profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        }))
        setRatings(rows)
    }, [supabase])

    const loadProduct = useCallback(async () => {
        setLoading(true)

        const { data: storeData } = await supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url, description, is_open, ratings_avg, ratings_count, owner_id')
            .ilike('storeSlug', storeSlug || '')
            .maybeSingle()

        if (!storeData) {
            router.push('/')
            return
        }

        if (storeData.owner_id) {
            const { data: ownerProfile } = await supabase
                .from('profiles')
                .select('whatsapp')
                .eq('id', storeData.owner_id)
                .single()

            if (ownerProfile?.whatsapp) {
                setOwnerWhatsapp(ownerProfile.whatsapp)
            }
        }

        const logoUrl = storeData.logo_url
            ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
            : null

        const { data: productData } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', storeData.id)
            .eq('slug', productSlug)
            .single()

        if (!productData) {
            router.push(`/${profileSlug}/${storeSlug}`)
            return
        }

        const { data: others } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', storeData.id)
            .neq('id', productData.id)
            .limit(4)

        if (others) {
            setOtherProducts(others as Product[])
        }

        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id ?? null
        setCurrentUserId(userId)

        if (user) {
            const { data: userProfile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
            if (userProfile?.name) setBuyerName(userProfile.name)
        }

        if (storeData.owner_id === userId) {
            router.push(`/${profileSlug}/${storeSlug}/${productSlug}/editar-produto`)
            return
        }

        setStore({ ...storeData, logo_url: logoUrl })
        setProduct(productData as Product)
        setImage(productData.image_url ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl : null)
        await loadRatings(productData.id, userId)

        const { data: buyers } = await supabase
            .from('store_sales')
            .select('buyer_name, buyer_id, created_at, profiles:buyer_id(avatar_url, "profileSlug")')
            .eq('product_id', productData.id)
            .order('created_at', { ascending: false })
            .limit(5)

        setRecentBuyers(buyers || [])

        setLoading(false)
    }, [loadRatings, productSlug, profileSlug, router, storeSlug, supabase])

    useEffect(() => {
        loadProduct()
    }, [loadProduct])


    const handleBuyNow = async () => {
        if (!product || !store) return
        if (!ownerWhatsapp) {
            alert('Esta loja ainda não configurou o WhatsApp para vendas.')
            return
        }

        setBuyLoading(true)

        const finalBuyerName = buyerName || 'Cliente iUser'

        try {
            await supabase.from('store_sales').insert({
                store_id: store.id,
                buyer_id: currentUserId,
                buyer_name: finalBuyerName,
                product_name: product.name,
                price: product.price,
                product_id: product.id
            })
        } catch (e) {
            console.error('[BuyNow] Erro ao registrar venda:', e)
        }

        const message = formatOrderMessage({
            storeName: store.name,
            productName: product.name,
            price: product.price,
            buyerName: finalBuyerName,
            storeUrl: productUrl
        })

        const link = getWhatsAppLink(ownerWhatsapp, message)

        setBuyLoading(false)
        window.open(link, '_blank')
    }

    if (loading || !product || !store) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
                    <p className="text-muted-foreground text-[8px] uppercase font-black tracking-wider">Carregando...</p>
                </div>
            </div>
        )
    }

    const isService = ['service', 'serviço', 'servico'].includes((product.type || product.category || '').toLowerCase())
    const typeLabel = product.type === 'service' ? 'Serviço' : product.type === 'digital' ? 'Digital' : 'Produto'

    return (
        <div className="min-h-screen bg-background">
            {/* Header Fixo iFood Style */}
            <div className="sticky top-0 z-40 bg-background border-b border-border">
                <div className="px-4 py-2 flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="w-8 h-8 flex items-center justify-center bg-secondary/50 border border-border hover:bg-foreground hover:text-background transition-all"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex-1">
                        <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Detalhe do produto</p>
                        <p className="text-[10px] font-bold truncate">{product.name}</p>
                    </div>
                    <div className="px-2 py-1 border border-border">
                        <span className="text-[7px] font-black uppercase tracking-wider">{typeLabel}</span>
                    </div>
                </div>
            </div>

            {/* Conteúdo Principal */}
            <div className="pb-24">
                {/* Imagem - Tamanho iFood (280px) */}
                <div className="relative bg-muted border-b border-border">
                    <div className="h-64 w-full overflow-hidden">
                        {image ? (
                            <img
                                src={image}
                                className="w-full h-full object-cover"
                                alt={product.name}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-lg font-black italic uppercase">
                                Sem Imagem
                            </div>
                        )}
                    </div>

                    {/* Preço flutuante */}
                    <div className="absolute bottom-3 right-3 px-3 py-1.5 bg-foreground border border-border">
                        <span className="text-xs font-black text-background">
                            R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* Info do Produto */}
                <div className="px-4 py-4 border-b border-border">
                    <h1 className="text-lg font-black italic uppercase tracking-tighter text-foreground mb-2">
                        {product.name}
                    </h1>

                    <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-1">
                            <RatingStars value={Number(product.ratings_avg || 0)} size={12} />
                            <span className="text-[10px] font-bold text-foreground">{(product.ratings_avg || 0).toFixed(1)}</span>
                        </div>
                        <button
                            onClick={() => router.push(`/${profileSlug}/${storeSlug}/${product.slug}/avaliacoes`)}
                            className="text-[8px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {product.ratings_count ?? 0} avaliações
                        </button>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {product.description || "Nenhuma descrição disponível para este item."}
                    </p>
                </div>

                {/* Info da Loja - Estilo iFood */}
                <div
                    onClick={() => router.push(`/${profileSlug}/${store.storeSlug}`)}
                    className="px-4 py-3 border-b border-border flex items-center gap-3 cursor-pointer hover:bg-muted/10 transition-colors"
                >
                    <div className="w-10 h-10 bg-muted border border-border overflow-hidden flex-shrink-0">
                        {store.logo_url ? (
                            <img src={store.logo_url} className="w-full h-full object-cover" alt={store.name} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Store className="w-4 h-4 text-muted-foreground/30" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Vendido por</p>
                        <p className="text-sm font-bold text-foreground">{store.name}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>

                {/* Botões de Ação - Fixos no Bottom iFood Style */}
                <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-3 z-30">
                    <div className="max-w-6xl mx-auto flex items-center gap-3">
                        {/* Seção de Avaliação Rápida */}
                        <div className="flex items-center gap-2 px-2 py-1 border border-border bg-muted/20">
                            <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                            <RatingStars value={Number(product.ratings_avg || 0)} size={10} />
                        </div>

                        <div className="flex-1 flex gap-2">
                            {mounted && (
                                <button
                                    onClick={() => {
                                        if (isInCart) {
                                            router.push(`/sacola`)
                                        } else {
                                            addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url }, {
                                                id: product.id,
                                                name: product.name,
                                                price: product.price || 0,
                                                image_url: image,
                                            })
                                        }
                                    }}
                                    className={`flex-1 py-3 font-black uppercase text-[9px] tracking-wider transition-all flex items-center justify-center gap-2 border ${isInCart
                                        ? 'bg-muted text-foreground border-border'
                                        : 'bg-foreground text-background border-transparent hover:bg-green-500'
                                        }`}
                                >
                                    {isInCart ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                                    {isInCart ? 'No carrinho' : 'Adicionar'}
                                </button>
                            )}

                            <button
                                onClick={handleBuyNow}
                                disabled={buyLoading}
                                className="flex-1 py-3 bg-green-500 text-white font-black uppercase text-[9px] tracking-wider hover:bg-green-600 transition-all flex items-center justify-center gap-2 border border-green-600 disabled:opacity-50"
                            >
                                {buyLoading ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        {isService ? <Briefcase className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                                        {isService ? 'Contratar' : 'Comprar'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Social Proof - Recent Buyers (Estilo iFood) */}
                {recentBuyers.length > 0 && (
                    <div className="px-4 py-3 border-b border-border bg-green-500/5">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-[8px] font-black uppercase tracking-wider text-green-600">Compras recentes</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {recentBuyers.slice(0, 3).map((buyer, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-secondary border border-border overflow-hidden rounded-full">
                                        {buyer.profiles?.avatar_url ? (
                                            <img src={getAvatarUrl(supabase, buyer.profiles.avatar_url)} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[7px] font-black">
                                                {buyer.buyer_name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[9px] text-foreground">{buyer.buyer_name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Ratings Feed */}
                {ratings.length > 0 && (
                    <div className="px-4 py-4">
                        <h3 className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-3">Avaliações dos clientes</h3>
                        <div className="space-y-3">
                            {ratings.slice(0, 3).map((r) => (
                                <div key={r.id} className="flex items-start gap-3">
                                    <div className="w-8 h-8 bg-secondary border border-border overflow-hidden rounded-full flex-shrink-0 flex items-center justify-center">
                                        {!r.is_anonymous && r.profiles?.avatar_url ? (
                                            <img src={getAvatarUrl(supabase, r.profiles.avatar_url)} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <User size={12} className="text-muted-foreground/40" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[9px] font-bold text-foreground">
                                            {r.is_anonymous ? "Consumidor Anônimo" : (r.profiles?.name || "Usuário")}
                                        </p>
                                        <RatingStars value={r.rating} size={10} />
                                        {r.comment && <p className="text-[8px] text-muted-foreground mt-1 italic line-clamp-2">"{r.comment}"</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {ratings.length > 3 && (
                            <button
                                onClick={() => router.push(`/${profileSlug}/${storeSlug}/${product.slug}/avaliacoes`)}
                                className="w-full mt-3 py-2 text-[8px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors border border-border"
                            >
                                Ver mais avaliações
                            </button>
                        )}
                    </div>
                )}

                {/* Outros Produtos da Loja */}
                {otherProducts.length > 0 && (
                    <div className="px-4 py-4 border-t border-border">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Outros itens da loja</h3>
                            <Link href={`/${profileSlug}/${storeSlug}`} className="text-[7px] font-black uppercase tracking-wider text-green-600 hover:text-green-700 transition-colors">
                                Ver todos →
                            </Link>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {otherProducts.slice(0, 3).map((other) => (
                                <div
                                    key={other.id}
                                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/${other.slug}`)}
                                    className="group border border-border overflow-hidden cursor-pointer hover:border-green-500/30 transition-all"
                                >
                                    <div className="aspect-square bg-muted overflow-hidden">
                                        {other.image_url ? (
                                            <img
                                                src={supabase.storage.from('product-images').getPublicUrl(other.image_url).data.publicUrl}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                alt={other.name}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-[8px] font-black italic">
                                                SEM FOTO
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-1.5">
                                        <h4 className="text-[8px] font-bold truncate">{other.name}</h4>
                                        <p className="text-[8px] font-black text-green-600">
                                            R$ {(other.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}