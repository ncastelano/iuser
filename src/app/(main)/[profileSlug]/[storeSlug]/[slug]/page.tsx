// app/(main)/[profileSlug]/[storeSlug]/[slug]/page.tsx

'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
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
    Share2,
    User,
    Briefcase,
    MessageCircle,
    Megaphone,
    Home,
    Heart,
    Eye,
    Calendar,
    MoreHorizontal,
} from 'lucide-react'

import { useCartStore } from '@/store/useCartStore'
import { RatingStars } from '@/components/ratings/RatingStars'
import { getAvatarUrl } from '@/lib/avatar'
import { formatOrderMessage, getWhatsAppLink } from '@/lib/whatsapp'
import { useTheme } from '@/app/theme'

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
    listing_type?: 'sale' | 'publication'
    view_count?: number
    created_at?: string
}

type StoreData = {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    description: string | null
    ratings_avg: number | null
    ratings_count: number | null
    owner_id: string
    final_whatsapp?: string | null
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

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

export default function ProductPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug

    const [product, setProduct] = useState<Product | null>(null)
    const [store, setStore] = useState<StoreData | null>(null)
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [image, setImage] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [buyerName, setBuyerName] = useState<string>('')
    const [ownerWhatsapp, setOwnerWhatsapp] = useState<string | null>(null)
    const [buyLoading, setBuyLoading] = useState(false)
    const [recentBuyers, setRecentBuyers] = useState<any[]>([])
    const [isPublication, setIsPublication] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isLiked, setIsLiked] = useState(false)
    const [likesCount, setLikesCount] = useState(0)

    const { itemsByStore, addItem } = useCartStore()
    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const isInCart = product && cartItems.some((item) => item.product.id === product.id)

    const storeUrl = useMemo(() => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${profileSlug}/${storeSlug}`
    }, [profileSlug, storeSlug])

    const productUrl = useMemo(() => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${profileSlug}/${storeSlug}/${slug}`
    }, [slug, profileSlug, storeSlug])

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

        if (rows.length > 0) {
            const sum = rows.reduce((acc, r) => acc + r.rating, 0)
            const avg = sum / rows.length
            setProduct(prev => prev ? { ...prev, ratings_avg: avg, ratings_count: rows.length } : null)
        }
    }, [supabase])

    const loadProduct = useCallback(async () => {
        setLoading(true)
        setError(null)

        const cleanStoreSlug = storeSlug ? decodeURIComponent(storeSlug) : ''
        const cleanSlug = slug ? decodeURIComponent(slug) : ''

        if (!cleanStoreSlug || !cleanSlug) {
            setError('Parâmetros inválidos')
            setLoading(false)
            return
        }

        const { data: storeData, error: storeError } = await supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url, description, ratings_avg, ratings_count, owner_id, whatsapp')
            .ilike('storeSlug', cleanStoreSlug)
            .maybeSingle()

        if (storeError) {
            console.error('[ProductPage] Supabase error on store query:', storeError)
            setError('Erro ao carregar a loja')
            setLoading(false)
            return
        }

        if (!storeData) {
            console.error('[ProductPage] Store not found for:', cleanStoreSlug)
            setError('Loja não encontrada')
            setLoading(false)
            return
        }

        let storeWhatsapp = storeData.whatsapp || null
        if (!storeWhatsapp && storeData.owner_id) {
            const { data: ownerProfile } = await supabase
                .from('profiles')
                .select('whatsapp')
                .eq('id', storeData.owner_id)
                .single()
            storeWhatsapp = ownerProfile?.whatsapp || null
        }
        setOwnerWhatsapp(storeWhatsapp)

        const logoUrl = storeData.logo_url
            ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
            : null

        let { data: productData } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', storeData.id)
            .eq('slug', cleanSlug)
            .maybeSingle()

        if (!productData) {
            const { data: byId } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', storeData.id)
                .eq('id', cleanSlug)
                .maybeSingle()
            productData = byId
        }

        if (!productData) {
            console.error('[ProductPage] Product not found for slug:', cleanSlug)
            setError('Publicação ou produto não encontrado')
            setLoading(false)
            return
        }

        const isPub = productData.listing_type === 'publication'
        setIsPublication(isPub)
        setLikesCount(productData.view_count || 0)

        const { data: others } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', storeData.id)
            .neq('id', productData.id)
            .eq('listing_type', 'sale')
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
            router.push(`/${profileSlug}/${storeSlug}/${slug}/editar-produto`)
            return
        }

        setStore({ ...storeData, logo_url: logoUrl })
        setProduct(productData as Product)
        setImage(productData.image_url ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl : null)

        if (!isPub) {
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
        }

        setLoading(false)
    }, [loadRatings, slug, profileSlug, router, storeSlug, supabase])

    useEffect(() => {
        loadProduct()
    }, [loadProduct])

    const handleWhatsAppClick = () => {
        if (!ownerWhatsapp) {
            alert('Esta loja ainda não configurou o WhatsApp para contato.')
            return
        }

        const message = isPublication
            ? `Olá! Vi a publicação "${product?.name}" na loja ${store?.name} e tenho interesse.`
            : `Olá! Gostaria de comprar o produto "${product?.name}" da loja ${store?.name}.`

        const link = getWhatsAppLink(ownerWhatsapp, message)
        window.open(link, '_blank')
    }

    const handleLike = () => {
        setIsLiked(!isLiked)
        setLikesCount(prev => isLiked ? prev - 1 : prev + 1)
    }

    if (error) {
        return (
            <div className="relative min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 text-center px-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/80 border border-orange-200 flex items-center justify-center shadow-lg">
                        <Megaphone className="w-8 h-8 text-orange-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>{error}</h2>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>Não foi possível exibir este item no momento.</p>
                    </div>
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="px-5 py-2.5 rounded-xl font-bold text-xs shadow-md hover:shadow-lg transition-all"
                        style={{ background: GRADIENT, color: '#ffffff' }}
                    >
                        Voltar para a Loja
                    </button>
                </div>
            </div>
        )
    }

    if (loading || !product || !store) {
        return (
            <div className="relative min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/80 border border-orange-200 flex items-center justify-center shadow-lg">
                        <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-wider text-orange-600">Carregando...</p>
                </div>
            </div>
        )
    }

    const hasWhatsapp = !!ownerWhatsapp

    return (
        <div className="relative min-h-screen">
            {/* Imagem de fundo (full screen) */}
            {image ? (
                <div
                    className="fixed inset-0 z-0"
                    style={{
                        backgroundImage: `url(${image})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                />
            ) : (
                <div
                    className="fixed inset-0 z-0"
                    style={{
                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                    }}
                />
            )}

            {/* Overlay escuro para melhor legibilidade */}
            <div className="fixed inset-0 z-0 bg-black/30" />

            {/* Gradiente no rodapé */}
            <div
                className="fixed bottom-0 left-0 right-0 z-0 h-[50vh] pointer-events-none"
                style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
                }}
            />

            <div className="relative z-10 min-h-screen flex flex-col">
                {/* Header - apenas botão Voltar e nome da loja */}
                <div className="absolute top-0 left-0 right-0 z-20 px-4 py-3 flex items-center gap-3">
                    {/* Botão Voltar */}
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="flex w-12 h-12 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-all border border-white/10 flex-shrink-0"
                    >
                        <ArrowLeft className="w-6 h-6 text-white" />
                    </button>

                    {/* Informações do criador */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/30">
                            {store.logo_url ? (
                                <img src={store.logo_url} className="w-full h-full object-cover" alt={store.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-orange-500 text-white text-xs font-bold">
                                    {store.name?.charAt(0)}
                                </div>
                            )}
                        </div>
                        <span className="text-sm font-bold text-white drop-shadow-lg">{store.name}</span>
                    </div>
                </div>

                {/* Botões laterais direitos - estilo TikTok */}
                <div className="absolute right-4 bottom-32 z-20 flex flex-col items-center gap-6">
                    {/* Like */}
                    <button
                        onClick={handleLike}
                        className="flex flex-col items-center gap-1 group"
                    >
                        <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-all border border-white/10 group-hover:bg-black/60">
                            <Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                        </div>
                        <span className="text-xs font-bold text-white drop-shadow-lg">{likesCount}</span>
                    </button>

                    {/* Avaliações */}
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}/${slug}/avaliacoes`)}
                        className="flex flex-col items-center gap-1 group"
                    >
                        <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-all border border-white/10 group-hover:bg-black/60">
                            <Star className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-bold text-white drop-shadow-lg">{product.ratings_count || 0}</span>
                    </button>

                    {/* Compartilhar */}
                    <button
                        onClick={() => {
                            if (navigator.share) navigator.share({ title: product.name, url: productUrl }).catch(() => { })
                        }}
                        className="flex flex-col items-center gap-1 group"
                    >
                        <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-all border border-white/10 group-hover:bg-black/60">
                            <Share2 className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-bold text-white drop-shadow-lg">Compartilhar</span>
                    </button>
                </div>

                {/* Nome e Descrição do produto */}
                <div className="absolute bottom-28 left-0 right-0 z-20 px-4">
                    <div className="max-w-md mx-auto">
                        <h1 className="text-2xl md:text-3xl font-black text-white drop-shadow-lg">
                            {product.name}
                        </h1>
                        {product.description && (
                            <p className="text-sm text-white/90 drop-shadow-lg mt-1 line-clamp-2">
                                {product.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* Barra inferior fixa - WhatsApp + Logo */}
                <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-4"
                    style={{
                        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)',
                    }}
                >
                    <div className="max-w-md mx-auto flex items-center gap-3">
                        {hasWhatsapp && (
                            <button
                                onClick={handleWhatsAppClick}
                                disabled={buyLoading}
                                className="flex-1 py-3.5 rounded-2xl font-black uppercase text-sm tracking-widest shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#ffffff',
                                    boxShadow: '0 8px 24px rgba(34, 197, 94, 0.4)',
                                }}
                            >
                                {buyLoading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <MessageCircle className="w-5 h-5" />
                                        {isPublication ? 'Falar com a Loja' : 'Comprar Agora'}
                                    </>
                                )}
                            </button>
                        )}

                        {/* Botão iUser - Logo */}
                        <button
                            onClick={() => router.push('/')}
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95 flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                border: `2px solid #f97316`,
                                boxShadow: `0 8px 24px #f9731660`,
                            }}
                            aria-label="Ir para o início"
                        >
                            <img src="/logotransparente.png" alt="iUser" className="w-8 h-8 object-contain" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}