//app/(main)/[profileSlug]/[storeSlug]/[productSlug]/page.tsx

'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
    ArrowLeft,
    CheckCircle2,
    Store,
    Plus,
    ChevronRight,
    Star,
    Clock,
    ShoppingBag,
    Users2,
    Sparkles,
    Zap,
    Shield,
    Truck,
    Share2,
    ExternalLink,
    Trash2,
    User,
    Briefcase
} from 'lucide-react'

import { useCartStore } from '@/store/useCartStore'
import { RatingStars } from '@/components/ratings/RatingStars'
import { getAvatarUrl } from '@/lib/avatar'
import AnimatedBackground from '@/components/AnimatedBackground'

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
    const [showShareMenu, setShowShareMenu] = useState(false)

    const { itemsByStore, addItem } = useCartStore()
    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const isInCart = product && cartItems.some((item) => item.product.id === product.id)

    useEffect(() => {
        setMounted(true)
    }, [])

    const storeUrl = useMemo(() => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${profileSlug}/${storeSlug}`
    }, [profileSlug, storeSlug])

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
            .eq('is_anonymous', false)
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

        // Update product ratings in state to be consistent with fetched reviews
        if (rows.length > 0) {
            const sum = rows.reduce((acc, r) => acc + r.rating, 0)
            const avg = sum / rows.length
            setProduct(prev => prev ? { ...prev, ratings_avg: avg, ratings_count: rows.length } : null)
        }
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
            .from('product_reviews')
            .select('created_at, profiles(id, name, avatar_url, "profileSlug")')
            .eq('product_id', productData.id)
            .eq('is_anonymous', false)
            .order('created_at', { ascending: false })
            .limit(5)

        const recentBuyersMapped = (buyers || []).map((b: any) => ({
            buyer_name: Array.isArray(b.profiles) ? b.profiles[0]?.name : b.profiles?.name,
            buyer_id: Array.isArray(b.profiles) ? b.profiles[0]?.id : b.profiles?.id,
            created_at: b.created_at,
            profiles: Array.isArray(b.profiles) ? b.profiles[0] : b.profiles
        }))

        setRecentBuyers(recentBuyersMapped)

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
            <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
                <AnimatedBackground />
                <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/80 backdrop-blur-sm border border-orange-200 flex items-center justify-center shadow-lg">
                        <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-wider text-orange-600">Carregando produto...</p>
                </div>
            </div>
        )
    }

    const isService = ['service', 'serviço', 'servico'].includes((product.type || product.category || '').toLowerCase())
    const typeLabel = product.type === 'service' ? 'Serviço' : product.type === 'digital' ? 'Digital' : 'Produto'

    return (
        <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <AnimatedBackground />

            {/* Header Estilo Loja */}
            <header className="sticky top-0 z-50 px-3 py-2.5 border-b border-orange-200/30 bg-white/70 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                            className="flex w-9 h-9 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm flex-shrink-0">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-sm font-black text-gray-800 truncate">{product.name}</h1>
                            <div className="flex items-center gap-1">
                                <span className="text-[8px] font-black uppercase tracking-wider text-orange-500">
                                    {store.name}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => {
                            if (navigator.share) navigator.share({ title: product.name, url: productUrl }).catch(() => { })
                            else setShowShareMenu(true)
                        }} className="flex w-8 h-8 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:border-orange-500 transition-all shadow-sm">
                            <Share2 className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Conteúdo Principal */}
            <div className="relative z-10 pb-32">
                {/* Imagem do Produto */}
                <div className="relative mx-4 mt-4">
                    <div className="relative rounded-3xl overflow-hidden shadow-2xl border-2 border-white">
                        <div className="h-80 w-full bg-gradient-to-br from-orange-100 to-red-100">
                            {image ? (
                                <img
                                    src={image}
                                    className="w-full h-full object-cover"
                                    alt={product.name}
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                    <ShoppingBag className="w-16 h-16 text-orange-300" />
                                    <span className="text-sm font-black italic uppercase text-orange-400">Sem Imagem</span>
                                </div>
                            )}
                        </div>

                        {/* Badge de Preço Premium */}
                        <div className="absolute bottom-4 right-4">
                            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-3 rounded-2xl shadow-xl">
                                <p className="text-[9px] font-black uppercase tracking-wider opacity-90">Preço</p>
                                <p className="text-2xl font-black">
                                    R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        {/* Badge de Garantia */}
                        <div className="absolute top-4 left-4">
                            <div className="bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl shadow-lg border border-orange-200 flex items-center gap-2">
                                <Shield className="w-4 h-4 text-green-500" />
                                <span className="text-[8px] font-black uppercase text-gray-700">Garantia iUser</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Informações do Produto */}
                <div className="mx-4 mt-6">
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-orange-200/50 shadow-lg">
                        <h1 className="text-2xl font-black italic uppercase tracking-tighter text-gray-800 mb-4">
                            {product.name}
                        </h1>

                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black uppercase text-orange-500 bg-orange-50 px-2 py-1 rounded-full">
                                    {typeLabel}
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    if (isInCart) {
                                        router.push('/sacola')
                                    } else {
                                        addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url }, {
                                            id: product.id,
                                            name: product.name,
                                            price: product.price || 0,
                                            image_url: image,
                                        })
                                    }
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${isInCart
                                    ? 'bg-orange-500 text-white border border-orange-400'
                                    : 'bg-white border border-orange-200 text-orange-600 hover:bg-orange-50'
                                    }`}
                            >
                                {isInCart ? (
                                    <>
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Na Sacola
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-3.5 h-3.5" />
                                        Adicionar na Sacola
                                    </>
                                )}
                            </button>
                        </div>


                        <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-4 border border-orange-200/30">
                            <p className="text-sm text-gray-700 leading-relaxed">
                                {product.description || "Nenhuma descrição disponível para este item."}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Loja Card Premium */}
                <div className="mx-4 mt-4">
                    <div
                        onClick={() => router.push(`/${profileSlug}/${store.storeSlug}`)}
                        className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-orange-200/50 shadow-lg cursor-pointer hover:shadow-xl hover:border-orange-300 transition-all group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 p-0.5 shadow-lg">
                                <div className="w-full h-full rounded-2xl bg-white flex items-center justify-center overflow-hidden">
                                    {store.logo_url ? (
                                        <img src={store.logo_url} className="w-full h-full object-cover" alt={store.name} />
                                    ) : (
                                        <Store className="w-6 h-6 text-orange-400" />
                                    )}
                                </div>
                            </div>
                            <div className="flex-1">
                                <p className="text-[9px] font-black uppercase tracking-wider text-orange-600">Vendido por</p>
                                <p className="text-lg font-bold text-gray-800">{store.name}</p>
                                <div className="flex items-center gap-1 mt-1">
                                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                    <span className="text-[9px] font-bold text-gray-600">
                                        {(store.ratings_avg || 0).toFixed(1)} • Loja verificada
                                    </span>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-orange-400 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </div>
                </div>

                {/* Social Proof - Compradores Recentes */}
                {recentBuyers.length > 0 && (
                    <div className="mx-4 mt-4">
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-200/50">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center">
                                    <User className="w-3.5 h-3.5 text-white" />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-wider text-green-700">
                                    Compras Recentes
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {recentBuyers.slice(0, 4).map((buyer, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 p-0.5">
                                            <div className="w-full h-full rounded-xl bg-white flex items-center justify-center overflow-hidden">
                                                {buyer.profiles?.avatar_url ? (
                                                    <img src={getAvatarUrl(supabase, buyer.profiles.avatar_url)} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <span className="text-[10px] font-black text-green-600">
                                                        {buyer.buyer_name?.charAt(0) || '?'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-800">{buyer.buyer_name}</p>
                                            <p className="text-[7px] text-green-600 font-bold">Comprou</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Avaliações */}
                {ratings.length > 0 && (
                    <div className="mx-4 mt-4">
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-orange-200/50 shadow-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                    Avaliações dos Clientes
                                </h3>
                                <button 
                                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/${product.slug}/avaliacoes`)}
                                    className="flex items-center gap-2 hover:bg-orange-50 px-2 py-1 rounded-lg transition-all"
                                >
                                    <span className="text-[9px] font-bold text-orange-500">
                                        ({product.ratings_count ?? 0}) ver todas
                                    </span>
                                    <RatingStars value={Number(product.ratings_avg || 0)} size={12} />
                                    <span className="text-xs font-black text-gray-700">
                                        {Number(product.ratings_avg || 0).toFixed(1)}
                                    </span>
                                </button>
                            </div>
                            <div className="space-y-4">
                                {ratings.slice(0, 3).map((r) => (
                                    <div key={r.id} className="flex items-start gap-3 bg-gradient-to-r from-gray-50 to-white rounded-xl p-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 p-0.5">
                                            <div className="w-full h-full rounded-xl bg-white flex items-center justify-center overflow-hidden">
                                                {r.profiles?.avatar_url ? (
                                                    <img src={getAvatarUrl(supabase, r.profiles.avatar_url)} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <Users2 size={14} className="text-orange-400" />
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold text-gray-800">
                                                {r.profiles?.name || "Usuário"}
                                            </p>
                                            <RatingStars value={r.rating} size={10} />
                                            {r.comment && (
                                                <p className="text-[10px] text-gray-600 mt-1 italic line-clamp-2">
                                                    "{r.comment}"
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {ratings.length > 3 && (
                                <button
                                    onClick={() => router.push(`/${profileSlug}/${storeSlug}/${product.slug}/avaliacoes`)}
                                    className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-orange-100 to-red-100 text-orange-600 text-[9px] font-black uppercase tracking-wider hover:from-orange-200 hover:to-red-200 transition-all border border-orange-200"
                                >
                                    Ver Todas as Avaliações
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Outros Produtos */}
                {otherProducts.length > 0 && (
                    <div className="mx-4 mt-4 mb-24">
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-orange-200/50 shadow-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                                    <ShoppingBag className="w-4 h-4 text-orange-500" />
                                    Outros Itens da Loja
                                </h3>
                                <Link
                                    href={`/${profileSlug}/${storeSlug}`}
                                    className="text-[9px] font-black uppercase text-orange-600 hover:text-orange-700 transition-colors"
                                >
                                    Ver Todos →
                                </Link>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {otherProducts.slice(0, 4).map((other) => {
                                    const otherImage = other.image_url ? supabase.storage.from('product-images').getPublicUrl(other.image_url).data.publicUrl : null
                                    const inCart = itemsByStore[storeSlug as string]?.some(item => item.product.id === other.id)
                                    
                                    return (
                                        <div
                                            key={other.id}
                                            className="group bg-white rounded-2xl border-2 border-orange-100 hover:border-orange-300 transition-all shadow-sm flex flex-col overflow-hidden"
                                        >
                                            <div 
                                                onClick={() => router.push(`/${profileSlug}/${storeSlug}/${other.slug}`)}
                                                className="aspect-square bg-gradient-to-br from-orange-50 to-red-50 overflow-hidden cursor-pointer"
                                            >
                                                {other.image_url ? (
                                                    <img
                                                        src={otherImage!}
                                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                        alt={other.name}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <ShoppingBag className="w-8 h-8 text-orange-200" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-3 flex flex-col flex-1">
                                                <h4 className="text-[10px] font-bold truncate text-gray-800 mb-1">{other.name}</h4>
                                                <p className="text-xs font-black text-orange-600 mb-3">
                                                    R$ {(other.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                                
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (inCart) {
                                                            router.push('/sacola')
                                                        } else {
                                                            addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url }, {
                                                                id: other.id,
                                                                name: other.name,
                                                                price: other.price || 0,
                                                                image_url: otherImage,
                                                            })
                                                        }
                                                    }}
                                                    className={`w-full py-2 rounded-xl text-[8px] font-black uppercase transition-all flex items-center justify-center gap-1.5 ${
                                                        inCart 
                                                        ? 'bg-orange-500 text-white' 
                                                        : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                                    }`}
                                                >
                                                    {inCart ? (
                                                        <CheckCircle2 className="w-3 h-3" />
                                                    ) : (
                                                        <Plus className="w-3 h-3" />
                                                    )}
                                                    {inCart ? 'Na Sacola' : 'Adicionar'}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Bar Premium - Fixo */}
            <div className="fixed bottom-0 left-0 right-0 z-40">
                <div className="bg-white/90 backdrop-blur-md border-t-2 border-orange-200 shadow-2xl">
                    <div className="px-4 py-4">
                        <div className="flex items-center gap-3">
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
                                        className={`flex-1 py-3.5 rounded-2xl font-black uppercase text-[9px] tracking-wider transition-all flex items-center justify-center gap-2 ${isInCart
                                            ? 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 border-2 border-gray-300'
                                            : 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95'
                                            }`}
                                    >
                                        {isInCart ? (
                                            <>
                                                <CheckCircle2 className="w-4 h-4" />
                                                No Carrinho
                                            </>
                                        ) : (
                                            <>
                                                <ShoppingBag className="w-4 h-4" />
                                                Adicionar
                                            </>
                                        )}
                                    </button>
                                )}

                                <button
                                    onClick={handleBuyNow}
                                    disabled={buyLoading}
                                    className="flex-1 py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black uppercase text-[9px] tracking-wider rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 border-2 border-green-400 disabled:opacity-50"
                                >
                                    {buyLoading ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            {isService ? (
                                                <>
                                                    <Briefcase className="w-4 h-4" />
                                                    Contratar
                                                </>
                                            ) : (
                                                <>
                                                    <Zap className="w-4 h-4" />
                                                    Comprar Agora
                                                </>
                                            )}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}