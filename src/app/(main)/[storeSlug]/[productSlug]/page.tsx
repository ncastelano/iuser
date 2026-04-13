//app/[storeSlug]/[productSlug]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ShoppingCart, Share2, Check, Copy, MessageCircle, Briefcase, CheckCircle2, Store, Star, ChevronRight, Tag, MapPin } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'

interface Product {
    id: string
    name: string
    price: number | null
    type: string | null
    category: string | null
    slug: string
    store_id: string
    description: string | null
    image_url: string | null
}

interface StoreData {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    description: string | null
    is_active: boolean | null
    ratings_avg: number | null
    ratings_count: number | null
}

export default function ProductPage() {
    const params = useParams()
    const router = useRouter()
    const supabase = createClient()

    const storeSlug = Array.isArray(params.storeSlug)
        ? params.storeSlug[0]
        : params.storeSlug

    const productSlug = Array.isArray(params.productSlug)
        ? params.productSlug[0]
        : params.productSlug

    const [product, setProduct] = useState<Product | null>(null)
    const [store, setStore] = useState<StoreData | null>(null)
    const [image, setImage] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [showShareMenu, setShowShareMenu] = useState(false)
    const [copied, setCopied] = useState(false)
    const [mounted, setMounted] = useState(false)

    const { itemsByStore, addItem } = useCartStore()
    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const isInCart = product && cartItems.some(item => item.product.id === product.id)

    useEffect(() => {
        setMounted(true)
        const loadProduct = async () => {
            // 🔍 buscar loja
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url, description, is_active, ratings_avg, ratings_count')
                .ilike('storeSlug', storeSlug || '')
                .maybeSingle()

            if (!storeData) {
                router.push('/')
                return
            }

            const logo_url = storeData.logo_url
                ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                : null

            setStore({ ...storeData, logo_url })

            // 🔥 buscar produto pelo slug
            const { data: productData } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', storeData.id)
                .eq('slug', productSlug)
                .single()

            if (!productData) {
                router.push(`/${storeSlug}`)
                return
            }

            setProduct(productData)

            if (productData.image_url) {
                const url = supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
                setImage(url)
            }

            setLoading(false)
        }

        loadProduct()
    }, [storeSlug, productSlug])

    const getProductUrl = () => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        return `${baseUrl}/${storeSlug}/${productSlug}`
    }

    const shareOnWhatsApp = () => {
        const productUrl = getProductUrl()
        const text = `✨ *${product?.name}* ✨\n\n💰 Preço: R$ ${(product?.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n🛍️ Confira este produto incrível na loja ${store?.name}!\n\n🔗 ${productUrl}`
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
        window.open(whatsappUrl, '_blank')
        setShowShareMenu(false)
    }

    const shareOnWhatsAppStory = () => {
        const productUrl = getProductUrl()
        const storyText = `✨ ${product?.name} - R$ ${(product?.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ✨`
        const whatsappStoryUrl = `https://wa.me/?text=${encodeURIComponent(storyText + '\n\n' + productUrl)}`
        window.open(whatsappStoryUrl, '_blank')
        setShowShareMenu(false)
    }

    const copyToClipboard = async () => {
        const productUrl = getProductUrl()
        try {
            await navigator.clipboard.writeText(productUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
            setTimeout(() => setShowShareMenu(false), 1500)
        } catch (err) {
            console.error('Erro ao copiar:', err)
        }
    }

    const shareNative = () => {
        if (navigator.share) {
            const productUrl = getProductUrl()
            navigator.share({
                title: product?.name,
                text: `Confira ${product?.name} na loja ${store?.name}!`,
                url: productUrl,
            }).catch(() => { })
        } else {
            setShowShareMenu(true)
        }
    }

    const getButtonText = () => {
        const type = product?.type?.toLowerCase()
        const category = product?.category?.toLowerCase()

        if (type === 'service' || type === 'serviço' || type === 'servico' ||
            category === 'service' || category === 'serviço' || category === 'servico') {
            return 'Contratar Agora'
        }

        return 'Comprar Agora'
    }

    const getButtonIcon = () => {
        const type = product?.type?.toLowerCase()
        const category = product?.category?.toLowerCase()

        if (type === 'service' || type === 'serviço' || type === 'servico' ||
            category === 'service' || category === 'serviço' || category === 'servico') {
            return <Briefcase className="w-5 h-5" />
        }

        return <ShoppingCart className="w-5 h-5" />
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
                    <p className="text-neutral-400 text-sm">Carregando produto...</p>
                </div>
            </div>
        )
    }

    if (!product) return null

    const isService = product?.type?.toLowerCase() === 'service' ||
        product?.type?.toLowerCase() === 'serviço' ||
        product?.type?.toLowerCase() === 'servico' ||
        product?.category?.toLowerCase() === 'service' ||
        product?.category?.toLowerCase() === 'serviço' ||
        product?.category?.toLowerCase() === 'servico'

    const typeLabel = product.type === 'service' ? 'Serviço'
        : product.type === 'physical' ? 'Produto Físico'
        : (product.type || product.category || 'Produto')

    return (
        <div className="flex flex-col gap-6 w-full animate-fade-in relative z-10">
            {/* HEADER INTERNO */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="flex w-10 h-10 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:border-white/50 transition shadow-md group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="text-xl font-bold truncate tracking-wide text-white">
                            {product.name}
                        </h1>
                        <span className="text-xs text-neutral-400 uppercase font-semibold tracking-widest">
                            {typeLabel}
                        </span>
                    </div>
                </div>

                {/* Botão Compartilhar */}
                <div className="relative">
                    <button
                        onClick={shareNative}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 hover:border-neutral-500 rounded-xl transition-all duration-300 shadow-md group"
                    >
                        <Share2 className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
                        <span className="text-sm font-semibold text-neutral-400 group-hover:text-white transition-colors">Compartilhar</span>
                    </button>

                    {showShareMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowShareMenu(false)}
                            />
                            <div className="absolute right-0 mt-2 w-72 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-top-2 duration-200">
                                <div className="p-3 border-b border-neutral-800">
                                    <p className="text-xs text-neutral-400 font-medium">Compartilhar via</p>
                                </div>

                                <button
                                    onClick={shareOnWhatsApp}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800 transition-colors group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <MessageCircle className="w-5 h-5 text-green-500" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-semibold text-white">WhatsApp</p>
                                        <p className="text-xs text-neutral-400">Enviar no chat</p>
                                    </div>
                                </button>

                                <button
                                    onClick={shareOnWhatsAppStory}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800 transition-colors group border-t border-neutral-800"
                                >
                                    <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Share2 className="w-5 h-5 text-green-500" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-semibold text-white">WhatsApp Story</p>
                                        <p className="text-xs text-neutral-400">Compartilhar nos stories</p>
                                    </div>
                                </button>

                                <button
                                    onClick={copyToClipboard}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800 transition-colors border-t border-neutral-800"
                                >
                                    <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        {copied ? (
                                            <Check className="w-5 h-5 text-green-500" />
                                        ) : (
                                            <Copy className="w-5 h-5 text-neutral-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-semibold text-white">
                                            {copied ? 'Copiado!' : 'Copiar link'}
                                        </p>
                                        <p className="text-xs text-neutral-400">
                                            {copied ? 'Link copiado com sucesso' : 'Copiar URL do produto'}
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                {/* COLUNA ESQUERDA: IMAGEM + CARD DA LOJA */}
                <div className="flex flex-col gap-4">
                    {/* IMAGEM */}
                    <div className="w-full aspect-square md:aspect-auto md:h-[440px] bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative group">
                        {image ? (
                            <img
                                src={image}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                alt={product.name}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <span className="text-neutral-600 font-medium tracking-wide">Sem Imagem</span>
                            </div>
                        )}

                        {/* Badge tipo produto - canto superior direito */}
                        <div className={`absolute top-4 right-4 px-3 py-1.5 backdrop-blur-md border rounded-lg ${isService
                            ? 'bg-blue-500/20 border-blue-500/30'
                            : 'bg-white/10 border-white/20'
                        }`}>
                            <span className={`text-xs font-bold ${isService ? 'text-blue-400' : 'text-white'}`}>
                                {typeLabel.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    {/* CARD DA LOJA — abaixo da imagem, design premium */}
                    {store && (
                        <div
                            className="group w-full bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 hover:border-white/20 rounded-2xl p-4 cursor-pointer transition-all duration-300 hover:shadow-[0_4px_24px_rgba(255,255,255,0.06)] hover:-translate-y-0.5"
                            onClick={() => router.push(`/${store.storeSlug}`)}
                        >
                            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest mb-3">Vendido por</p>
                            <div className="flex items-center gap-4">
                                {/* Logo da loja */}
                                <div className="w-14 h-14 rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden flex-shrink-0 shadow-lg">
                                    {store.logo_url ? (
                                        <img src={store.logo_url} className="w-full h-full object-cover" alt={store.name} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Store className="w-6 h-6 text-neutral-500" />
                                        </div>
                                    )}
                                </div>

                                {/* Info da loja */}
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-white font-bold text-base leading-tight truncate">{store.name}</span>
                                    {store.description && (
                                        <span className="text-neutral-500 text-xs line-clamp-1 mt-0.5">{store.description}</span>
                                    )}
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <div className="flex items-center gap-1">
                                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                            <span className="text-yellow-400 text-xs font-bold">
                                                {store.ratings_avg?.toFixed(1) ?? '0,0'}
                                            </span>
                                            <span className="text-neutral-600 text-xs">
                                                ({store.ratings_count ?? 0})
                                            </span>
                                        </div>
                                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${store.is_active
                                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        }`}>
                                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                            {store.is_active ? 'Aberto' : 'Fechado'}
                                        </div>
                                    </div>
                                </div>

                                {/* Seta */}
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-800 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                                    <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* INFO E COMPRA */}
                <div className="flex flex-col">
                    {/* Tag categoria */}
                    <div className="flex items-center gap-2 mb-3">
                        <Tag className="w-3.5 h-3.5 text-neutral-500" />
                        <span className="text-xs text-neutral-500 uppercase font-semibold tracking-widest">{typeLabel}</span>
                    </div>

                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-4">
                        {product.name}
                    </h1>

                    <p className="text-white font-black text-3xl mb-6">
                        R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>

                    {product.description && (
                        <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl mb-8 flex-1">
                            <h3 className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-3">
                                {isService ? 'Sobre o Serviço' : 'Sobre o Produto'}
                            </h3>
                            <p className="text-neutral-300 leading-relaxed text-sm">
                                {product.description}
                            </p>
                        </div>
                    )}

                    <div className="mt-auto space-y-4">
                        {mounted && (
                            isInCart ? (
                                <div className="relative p-[2px] rounded-xl overflow-hidden group cursor-pointer" onClick={() => router.push(`/${storeSlug}/carrinho`)}>
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-yellow-400 via-orange-500 to-white animate-spin-slow group-hover:animate-spin-fast" style={{ backgroundSize: '200% 200%' }} />
                                    <button className="relative w-full py-4 rounded-xl font-extrabold text-lg transition-all flex items-center justify-center gap-2 bg-black text-white z-10 group-hover:bg-neutral-900">
                                        <CheckCircle2 className="w-5 h-5 text-white" />
                                        Ver Carrinho
                                    </button>
                                </div>
                            ) : (
                                <div className="relative p-[2px] rounded-xl overflow-hidden group cursor-pointer" onClick={() => {
                                        if (product && store) {
                                            addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url }, {
                                                id: product.id,
                                                name: product.name,
                                                price: product.price || 0,
                                                image_url: image
                                            })
                                        }
                                    }}>
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-yellow-400 via-orange-500 to-white animate-spin-slow group-hover:animate-spin-fast" style={{ backgroundSize: '200% 200%' }} />
                                    <button className="relative w-full py-4 rounded-xl font-extrabold text-lg transition-all flex items-center justify-center gap-2 bg-black text-white z-10 group-hover:bg-neutral-900">
                                        <ShoppingCart className="w-5 h-5 text-white" />
                                        Adicionar ao carrinho
                                    </button>
                                </div>
                            )
                        )}

                        {/* Botão com Borda Gradiente Animada */}
                        <div className="relative p-[2px] rounded-xl overflow-hidden group">
                            <div className={`absolute inset-0 rounded-xl bg-gradient-to-r ${isService
                                ? 'from-blue-600 via-purple-500 to-blue-600'
                                : 'from-yellow-400 via-orange-500 to-red-500'
                                } animate-spin-slow group-hover:animate-spin-fast`}
                                style={{ backgroundSize: '200% 200%' }}
                            />
                            <button
                                className={`relative w-full py-4 rounded-xl font-extrabold text-lg transition-all flex items-center justify-center gap-2 bg-black text-white z-10`}
                            >
                                {getButtonIcon()}
                                {getButtonText()}
                            </button>
                        </div>

                        <p className="text-xs text-neutral-500 text-center">
                            {isService
                                ? 'Ao contratar, você será redirecionado para finalizar o serviço'
                                : 'Ao comprar, você será redirecionado para finalizar o pedido'}
                        </p>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes spin-slow {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                @keyframes spin-fast {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 200% 50%; }
                }
                .animate-spin-slow {
                    animation: spin-slow 3s ease infinite;
                }
                .group:hover .animate-spin-fast {
                    animation: spin-fast 1s linear infinite;
                }
            `}</style>
        </div>
    )
}