'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
    ArrowLeft,
    Briefcase,
    Check,
    CheckCircle2,
    ChevronRight,
    Copy,
    MessageCircle,
    Share2,
    ShoppingCart,
    Store,
    Tag,
} from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import { RatingStars } from '@/components/ratings/RatingStars'
import { getAvatarUrl } from '@/lib/avatar'

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
}

type RatingRow = {
    id: string
    rating: number
    profile_id: string
    created_at: string
    profiles?: {
        id: string
        name: string | null
        avatar_url: string | null
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
    const [showShareMenu, setShowShareMenu] = useState(false)
    const [copied, setCopied] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [myRating, setMyRating] = useState(0)
    const [ratingLoading, setRatingLoading] = useState(false)

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

    const loadRatings = useCallback(async (productId: string, userId?: string | null) => {
        const { data, error } = await supabase
            .from('product_ratings')
            .select('id, rating, profile_id, created_at, profiles(id, name, avatar_url)')
            .eq('product_id', productId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[ProductPage] Erro ao buscar avaliações:', error)
            return
        }

        const rows = (data || []) as RatingRow[]
        setRatings(rows)
        const activeUserId = userId ?? currentUserId
        setMyRating(rows.find((rating) => rating.profile_id === activeUserId)?.rating ?? 0)
    }, [currentUserId, supabase])

    const loadProduct = useCallback(async () => {
        setLoading(true)

        const { data: storeData } = await supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url, description, is_open, ratings_avg, ratings_count')
            .ilike('storeSlug', storeSlug || '')
            .maybeSingle()

        if (!storeData) {
            router.push('/')
            return
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

        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id ?? null
        setCurrentUserId(userId)

        setStore({ ...storeData, logo_url: logoUrl })
        setProduct(productData as Product)
        setImage(productData.image_url ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl : null)
        await loadRatings(productData.id, userId)
        setLoading(false)
    }, [loadRatings, productSlug, profileSlug, router, storeSlug, supabase])

    useEffect(() => {
        loadProduct()
    }, [loadProduct])

    const submitRating = async (rating: number) => {
        if (!product) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            alert('Entre na sua conta para avaliar este item.')
            router.push('/login')
            return
        }

        setRatingLoading(true)
        const { error } = await supabase
            .from('product_ratings')
            .upsert({
                product_id: product.id,
                profile_id: user.id,
                rating,
            }, { onConflict: 'product_id,profile_id' })

        if (error) {
            console.error('[ProductPage] Erro ao salvar avaliação:', error)
            alert('Não foi possível salvar sua avaliação agora.')
            setRatingLoading(false)
            return
        }

        setMyRating(rating)
        await loadProduct()
        setRatingLoading(false)
    }

    if (loading || !product || !store) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
                    <p className="text-neutral-400 text-sm">Carregando produto...</p>
                </div>
            </div>
        )
    }

    const isService = ['service', 'serviço', 'servico'].includes((product.type || product.category || '').toLowerCase())
    const typeLabel = product.type === 'service' ? 'Serviço' : product.type === 'physical' ? 'Produto Físico' : (product.type || product.category || 'Produto')
    const reviewersPreview = ratings.slice(0, 5)

    return (
        <div className="relative w-full max-w-6xl mx-auto py-8 md:py-16 animate-fade-in text-white selection:bg-white selection:text-black">
            <div className="flex flex-col md:flex-row items-start gap-12">
                {/* Product Visual */}
                <div className="w-full md:w-1/2 space-y-8">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-[48px] blur-2xl opacity-0 group-hover:opacity-100 transition duration-1000" />
                        <div className="relative aspect-square md:h-[600px] bg-neutral-900 border border-white/5 rounded-[48px] overflow-hidden shadow-2xl">
                            {image ? (
                                <img src={image} className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-1000 group-hover:scale-105" alt={product.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-800 text-6xl font-black italic">No Image</div>
                            )}
                            <div className="absolute top-8 right-8 px-6 py-2.5 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-2xl z-20">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{typeLabel}</span>
                            </div>
                        </div>
                    </div>

                    {/* Vendedor Profile */}
                    <div 
                        onClick={() => router.push(`/${profileSlug}/${store.storeSlug}`)}
                        className="group bg-neutral-900/20 backdrop-blur-3xl border border-white/5 rounded-[40px] p-8 cursor-pointer transition-all duration-500 hover:border-white/10 hover:-translate-y-1 shadow-xl"
                    >
                         <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-2xl bg-black border border-white/5 overflow-hidden shadow-2xl">
                                {store.logo_url ? (
                                    <img src={store.logo_url} className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all" alt={store.name} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-neutral-900"><Store className="w-6 h-6 text-neutral-700" /></div>
                                )}
                            </div>
                            <div className="flex-1 space-y-1">
                                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600">Representante Autorizado</div>
                                <h4 className="text-2xl font-black italic uppercase tracking-tighter text-white group-hover:text-neutral-200 transition-colors">{store.name}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                                <ChevronRight className="w-6 h-6" />
                            </div>
                         </div>
                    </div>
                </div>

                {/* Info & Actions */}
                <div className="w-full md:w-1/2 space-y-12">
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <button onClick={() => router.back()} className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl hover:bg-white hover:text-black transition-all duration-500">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div className="h-px flex-1 bg-white/5" />
                        </div>

                        <div className="space-y-4">
                            <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter text-white leading-tight">
                                {product.name}
                            </h1>
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <RatingStars value={Number(product.ratings_avg || 0)} size={16} />
                                    <span className="text-sm font-black text-white italic">{(product.ratings_avg || 0).toFixed(1)}</span>
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-600 underline cursor-pointer" onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/${product.slug}/avaliacoes`)}>
                                    {product.ratings_count ?? 0} AVALIAÇÕES
                                </div>
                            </div>
                        </div>

                        <div className="relative group inline-block">
                             <div className="absolute -inset-4 bg-white/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                             <div className="relative text-5xl md:text-6xl font-black italic text-white flex items-start gap-2">
                                <span className="text-xl md:text-2xl mt-2">R$</span>
                                {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                             </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="bg-neutral-900/10 border border-white/5 rounded-[40px] p-8 space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600">Especificações / Descrição</h3>
                        <p className="text-neutral-400 leading-relaxed text-base italic">{product.description || "Nenhuma descrição adicional informada pelo representante."}</p>
                    </div>

                    {/* My Rating */}
                    <div className="bg-neutral-900/10 border border-white/5 rounded-[40px] p-8">
                         <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Sua Experiência</h4>
                                <p className="text-[10px] text-neutral-600 uppercase font-bold tracking-widest">Avalie este item no ecossistema</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <RatingStars value={myRating} onChange={(v) => submitRating(v)} disabled={ratingLoading} size={24} />
                                {ratingLoading && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                            </div>
                         </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-4 pt-10">
                        {mounted && (
                            <button 
                                onClick={() => {
                                    if (isInCart) {
                                        router.push(`/${profileSlug}/${storeSlug}/carrinho`)
                                    } else {
                                        addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url }, {
                                            id: product.id,
                                            name: product.name,
                                            price: product.price || 0,
                                            image_url: image,
                                        })
                                    }
                                }}
                                className={`w-full py-6 rounded-[32px] font-black uppercase text-sm tracking-[0.3em] transition-all flex items-center justify-center gap-4 shadow-2xl ${isInCart ? 'bg-neutral-800 text-white border border-white/10' : 'bg-white text-black hover:bg-neutral-200 active:scale-[0.98]'}`}
                            >
                                {isInCart ? <CheckCircle2 className="w-6 h-6" /> : <ShoppingCart className="w-6 h-6" />}
                                {isInCart ? 'Item no Carrinho' : 'Adicionar ao Sistema'}
                            </button>
                        )}

                        <button className="w-full py-6 rounded-[32px] bg-neutral-900 border border-white/5 font-black uppercase text-sm tracking-[0.3em] text-neutral-400 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-4">
                            {isService ? <Briefcase className="w-6 h-6" /> : <ShoppingCart className="w-6 h-6" />}
                            {isService ? 'Contratar Agora' : 'Comprar Agora'}
                        </button>

                        <button 
                            onClick={() => navigator.share ? navigator.share({ title: product.name, text: `Confira ${product.name} na loja ${store.name}!`, url: productUrl }).catch(() => { }) : setShowShareMenu(true)}
                            className="w-full py-4 text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600 hover:text-white transition-colors"
                        >
                            Compartilhar Acesso &rarr;
                        </button>
                    </div>

                    {/* Social Proof Preview */}
                    {ratings.length > 0 && (
                        <div className="space-y-6 pt-12">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600 flex items-center gap-4">Feed de Experiências <div className="h-px flex-1 bg-white/5" /></h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {ratings.slice(0, 4).map((r) => (
                                    <div key={r.id} className="bg-white/[0.02] border border-white/5 rounded-3xl p-5 flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-black border border-white/5 overflow-hidden">
                                            {r.profiles?.avatar_url ? (
                                                <img src={getAvatarUrl(supabase, r.profiles.avatar_url)} className="w-full h-full object-cover grayscale-[0.3]" alt={r.profiles.name || ""} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs font-black italic">{r.profiles?.name?.charAt(0)}</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-white truncate">{r.profiles?.name || "Expert iUser"}</div>
                                            <RatingStars value={r.rating} size={10} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="pb-32" />
        </div>
    )
}
