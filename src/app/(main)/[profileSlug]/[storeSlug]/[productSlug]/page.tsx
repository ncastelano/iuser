'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
    ArrowLeft,
    Briefcase,
    CheckCircle2,
    ShoppingCart,
    Store,
    Heart,
    Users,
    Plus,
    ChevronRight
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
    const [mounted, setMounted] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [buyerName, setBuyerName] = useState<string>('')
    const [ownerWhatsapp, setOwnerWhatsapp] = useState<string | null>(null)
    const [myRating, setMyRating] = useState(0)
    const [ratingLoading, setRatingLoading] = useState(false)
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
            .from('product_ratings')
            .select('id, rating, profile_id, created_at, profiles(id, name, avatar_url)')
            .eq('product_id', productId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[ProductPage] Erro ao buscar avaliações:', error)
            return
        }

        const rows = (data || []).map((r: any) => ({
            ...r,
            profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        })) as RatingRow[]
        setRatings(rows)
        const activeUserId = userId ?? currentUserId
        setMyRating(rows.find((rating) => rating.profile_id === activeUserId)?.rating ?? 0)
    }, [currentUserId, supabase])

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

        // Fetch owner whatsapp
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

        // Carregar outros produtos da loja
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

        setStore({ ...storeData, logo_url: logoUrl })
        setProduct(productData as Product)
        setImage(productData.image_url ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl : null)
        await loadRatings(productData.id, userId)

        // Load recent buyers for this product
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

    const handleBuyNow = async () => {
        if (!product || !store) return
        if (!ownerWhatsapp) {
            alert('Esta loja ainda não configurou o WhatsApp para vendas.')
            return
        }

        setBuyLoading(true)

        const finalBuyerName = buyerName || 'Cliente iUser'

        // Record the sale for the "Social Proof / Micro Extrato"
        // We Use a common table or just fire and forget if it fails
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
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground text-sm uppercase font-black tracking-widest">Carregando experiência...</p>
                </div>
            </div>
        )
    }

    const isService = ['service', 'serviço', 'servico'].includes((product.type || product.category || '').toLowerCase())
    const typeLabel = product.type === 'service' ? 'Serviço' : product.type === 'physical' ? 'Produto Físico' : (product.type || product.category || 'Produto')

    return (
        <div className="relative w-full max-w-6xl mx-auto py-8 md:py-16 animate-fade-in text-foreground selection:bg-primary selection:text-white px-4">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-secondary/10 blur-[100px] rounded-full" />
            </div>
            <div className="flex flex-col md:flex-row items-start gap-12">
                {/* Visual - skipping for brevity in thought, but replaced in file */}
                {/* Info - skipping for brevity in thought, but replaced in file */}
                <div className="w-full md:w-1/2 space-y-8">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-[48px] blur-2xl opacity-0 group-hover:opacity-100 transition duration-1000" />
                        <div className="relative aspect-square md:h-[600px] bg-card border border-border dark:border-white/5 rounded-[48px] overflow-hidden shadow-2xl">
                            {image ? (
                                <img src={image} className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-1000 group-hover:scale-105" alt={product.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-6xl font-black italic uppercase">Sem Foto</div>
                            )}
                            <div className="absolute top-8 right-8 px-6 py-2.5 bg-background/60 backdrop-blur-3xl border border-border dark:border-white/10 rounded-2xl z-20">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground">{typeLabel}</span>
                            </div>
                        </div>
                    </div>

                    <div
                        onClick={() => router.push(`/${profileSlug}/${store.storeSlug}`)}
                        className="group bg-card border border-border dark:border-white/5 rounded-[40px] p-8 cursor-pointer transition-all duration-500 hover:border-foreground/10 hover:-translate-y-1 shadow-xl"
                    >
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-2xl bg-muted border border-border overflow-hidden shadow-2xl">
                                {store.logo_url ? (
                                    <img src={store.logo_url} className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all" alt={store.name} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-muted"><Store className="w-6 h-6 text-muted-foreground" /></div>
                                )}
                            </div>
                            <div className="flex-1 space-y-1">
                                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Representante Autorizado</div>
                                <h4 className="text-2xl font-black italic uppercase tracking-tighter text-foreground group-hover:text-primary transition-colors">{store.name}</h4>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-all">
                                <ChevronRight className="w-6 h-6" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-1/2 space-y-12">
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <button onClick={() => router.back()} className="w-12 h-12 flex items-center justify-center bg-muted border border-border rounded-2xl hover:bg-foreground hover:text-background transition-all duration-500">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div className="h-px flex-1 bg-border" />
                        </div>

                        <div className="space-y-4">
                            <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter text-foreground leading-tight">
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
                            <div className="absolute -inset-4 bg-primary/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative text-5xl md:text-6xl font-black italic text-foreground flex items-start gap-2 tracking-tighter">
                                <span className="text-xl md:text-2xl mt-2">R$</span>
                                {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>

                    <div className="bg-muted/10 border border-border rounded-[40px] p-8 space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Especificações / Descrição</h3>
                        <p className="text-muted-foreground leading-relaxed text-base italic">{product.description || "Nenhuma descrição adicional informada pelo representante."}</p>
                    </div>

                    <div className="bg-muted/10 border border-border rounded-[40px] p-8">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground">Sua Experiência</h4>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Avalie este item no ecossistema</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <RatingStars value={myRating} onChange={(v) => submitRating(v)} disabled={ratingLoading} size={24} />
                                {ratingLoading && <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />}
                            </div>
                        </div>
                    </div>

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
                                className={`w-full py-6 rounded-[32px] font-black uppercase text-sm tracking-[0.3em] transition-all flex items-center justify-center gap-4 shadow-2xl ${isInCart ? 'bg-muted text-foreground border border-border' : 'bg-foreground text-background hover:bg-neutral-800 dark:hover:bg-white active:scale-[0.98]'}`}
                            >
                                {isInCart ? <CheckCircle2 className="w-6 h-6" /> : <ShoppingCart className="w-6 h-6" />}
                                {isInCart ? 'Item no Carrinho' : 'Adicionar ao Sistema'}
                            </button>
                        )}

                        <button
                            onClick={handleBuyNow}
                            disabled={buyLoading}
                            className="w-full py-6 rounded-[32px] bg-muted/50 border border-border font-black uppercase text-sm tracking-[0.3em] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                        >
                            {buyLoading ? (
                                <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                            ) : (
                                <>
                                    {isService ? <Briefcase className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                                    {isService ? 'Contratar Agora' : 'Comprar Agora'}
                                </>
                            )}
                        </button>
                    </div>

                    {/* Social Proof - Buyers */}
                    {recentBuyers.length > 0 && (
                        <div className="bg-primary/5 border border-primary/10 rounded-[32px] p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-3 text-primary">
                                <Users className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase tracking-[.2em]">Social Proof / Aquisições Recentes</span>
                            </div>
                            <div className="space-y-3">
                                {recentBuyers.map((buyer, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-background border border-border overflow-hidden">
                                            {buyer.profiles?.avatar_url ? (
                                                <img src={getAvatarUrl(supabase, buyer.profiles.avatar_url)} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[8px] font-black italic">{buyer.buyer_name?.charAt(0) || '?'}</div>
                                            )}
                                        </div>
                                        <p className="text-xs text-foreground font-bold italic">
                                            {buyer.buyer_name} <span className="text-muted-foreground font-normal">adquiriu este item recentemente.</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Social Proof - Ratings */}
                    {ratings.length > 0 && (
                        <div className="space-y-6 pt-12">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground flex items-center gap-4">Feed de Experiências <div className="h-px flex-1 bg-border" /></h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {ratings.slice(0, 4).map((r) => (
                                    <div key={r.id} className="bg-muted/30 border border-border rounded-3xl p-5 flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-muted border border-border overflow-hidden">
                                            {r.profiles?.avatar_url ? (
                                                <img src={getAvatarUrl(supabase, r.profiles.avatar_url)} className="w-full h-full object-cover grayscale-[0.3]" alt={r.profiles.name || ""} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs font-black italic">{r.profiles?.name?.charAt(0) || "?"}</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-foreground truncate">{r.profiles?.name || "Expert iUser"}</div>
                                            <RatingStars value={r.rating} size={10} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Other products from same store */}
            {otherProducts.length > 0 && (
                <div className="mt-20 space-y-8">
                    <div className="flex items-end justify-between px-4">
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Mais do Representante</h3>
                            <h2 className="text-4xl font-black italic uppercase tracking-tighter text-foreground leading-none">Explorar mais nesta loja</h2>
                        </div>
                        <Link href={`/${profileSlug}/${storeSlug}`} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
                            Ver Vitrine Completa &rarr;
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-4">
                        {otherProducts.map((other) => (
                            <div
                                key={other.id}
                                onClick={() => router.push(`/${profileSlug}/${storeSlug}/${other.slug}`)}
                                className="group bg-card border border-border rounded-[32px] overflow-hidden cursor-pointer transition-all duration-500 hover:border-foreground/10 hover:-translate-y-1 shadow-xl"
                            >
                                <div className="aspect-square bg-muted overflow-hidden relative">
                                    {other.image_url ? (
                                        <img
                                            src={supabase.storage.from('product-images').getPublicUrl(other.image_url).data.publicUrl}
                                            className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110"
                                            alt={other.name}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-2xl font-black italic">PRODUTO</div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-background/80 to-transparent pt-12">
                                        <div className="text-foreground font-black italic uppercase text-xs tracking-tighter truncate">{other.name}</div>
                                        <div className="text-primary font-black text-sm mt-1">
                                            R$ {(other.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="pb-32" />
        </div>
    )
}