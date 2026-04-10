// app/[storeSlug]/[productSlug]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ShoppingCart, Share2, Check, Copy, MessageCircle, Briefcase } from 'lucide-react'
import Head from 'next/head'

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

interface Store {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
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
    const [store, setStore] = useState<Store | null>(null)
    const [image, setImage] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [showShareMenu, setShowShareMenu] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const loadProduct = async () => {
            // 🔍 buscar loja
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')
                .ilike('storeSlug', storeSlug || '')
                .maybeSingle()

            if (!storeData) {
                router.push('/')
                return
            }

            setStore(storeData)

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
    }, [storeSlug, productSlug, router, supabase])

    const getProductUrl = () => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        return `${baseUrl}/${storeSlug}/${productSlug}`
    }

    const shareOnWhatsApp = () => {
        const productUrl = getProductUrl()
        const text = `✨ *${product?.name}* ✨\n\n💰 Preço: R$ ${(product?.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n${product?.description ? `📝 ${product.description.substring(0, 100)}...\n\n` : ''}🛍️ ${store?.name}\n\n${productUrl}`
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
        window.open(whatsappUrl, '_blank')
        setShowShareMenu(false)
    }

    const shareOnWhatsAppStory = () => {
        const productUrl = getProductUrl()
        const storyText = `✨ ${product?.name} - R$ ${(product?.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ✨\n\n${productUrl}`
        const whatsappStoryUrl = `https://wa.me/?text=${encodeURIComponent(storyText)}`
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

    const shareNative = async () => {
        const productUrl = getProductUrl()

        let imageFile = null
        if (image) {
            try {
                const response = await fetch(image)
                const blob = await response.blob()
                imageFile = new File([blob], 'product-image.jpg', { type: blob.type })
            } catch (error) {
                console.error('Erro ao carregar imagem:', error)
            }
        }

        const shareData = {
            title: product?.name || 'Produto',
            text: `Confira ${product?.name} na loja ${store?.name}!${product?.description ? `\n\n${product.description.substring(0, 150)}` : ''}`,
            url: productUrl,
        }

        if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
            try {
                await navigator.share({
                    ...shareData,
                    files: [imageFile]
                })
                return
            } catch (error) {
                console.error('Erro ao compartilhar com imagem:', error)
            }
        }

        if (navigator.share) {
            try {
                await navigator.share(shareData)
            } catch (error) {
                console.error('Erro ao compartilhar:', error)
            }
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
                <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
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

    const productUrl = getProductUrl()

    // Valores seguros para as meta tags (convertendo null para string)
    const productName = product.name || ''
    const productDescription = product.description || `Confira ${product.name} na loja ${store?.name}`
    const productImage = image || '/default-product-image.jpg'
    const storeName = store?.name || 'Loja'
    const productPrice = product.price?.toString() || '0'

    return (
        <>
            <Head>
                {/* Meta tags básicas */}
                <title>{`${product.name} | ${store?.name}`}</title>
                <meta name="description" content={productDescription} />

                {/* Open Graph (Facebook, WhatsApp, LinkedIn) */}
                <meta property="og:title" content={productName} />
                <meta property="og:description" content={productDescription} />
                <meta property="og:image" content={productImage} />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="630" />
                <meta property="og:image:alt" content={productName} />
                <meta property="og:url" content={productUrl} />
                <meta property="og:type" content="product" />
                <meta property="og:site_name" content={storeName} />
                <meta property="og:locale" content="pt_BR" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={productName} />
                <meta name="twitter:description" content={productDescription} />
                <meta name="twitter:image" content={productImage} />

                {/* Meta tags específicas para produtos */}
                <meta property="product:price:amount" content={productPrice} />
                <meta property="product:price:currency" content="BRL" />
                <meta property="product:availability" content="in stock" />
            </Head>

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
                            <span className="text-xs text-neutral-300 uppercase font-black tracking-widest">
                                {product.type === 'service' ? 'Serviço' : (product.type || product.category || 'Produto')}
                            </span>
                        </div>
                    </div>

                    {/* Botão Compartilhar - Preto e Branco */}
                    <div className="relative">
                        <button
                            onClick={shareNative}
                            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 hover:border-neutral-500 rounded-xl transition-all duration-300 shadow-md group"
                        >
                            <Share2 className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
                            <span className="text-sm font-semibold text-neutral-400 group-hover:text-white transition-colors">Compartilhar</span>
                        </button>

                        {/* Menu de Compartilhamento Customizado (para desktop) */}
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
                    {/* IMAGEM */}
                    <div className="w-full aspect-square md:aspect-auto md:h-[500px] bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative group">
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

                        {/* Badge de Serviço/Produto */}
                        {isService && (
                            <div className="absolute top-4 right-4 px-3 py-1.5 bg-blue-500/20 backdrop-blur-md border border-blue-500/30 rounded-lg">
                                <span className="text-blue-400 text-xs font-bold">SERVIÇO</span>
                            </div>
                        )}
                    </div>

                    {/* INFO E COMPRA */}
                    <div className="flex flex-col">
                        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-4">
                            {product.name}
                        </h1>

                        <p className="text-white font-black text-3xl mb-8">
                            R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>

                        {product.description && (
                            <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl mb-8">
                                <h3 className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-3">
                                    {isService ? 'Sobre o Serviço' : 'Sobre o Produto'}
                                </h3>
                                <p className="text-neutral-300 leading-relaxed text-sm">
                                    {product.description}
                                </p>
                            </div>
                        )}

                        <div className="mt-auto space-y-3">
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

                            {/* Texto adicional explicativo */}
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
        </>
    )
}