//app/[storeSlug]/[productSlug]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ShoppingCart, Share2, Check, Copy, MessageCircle } from 'lucide-react'

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
        // Para stories do WhatsApp, precisamos de uma imagem + link
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

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                Carregando...
            </div>
        )
    }

    if (!product) return null

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
                        <span className="text-xs text-neutral-300 uppercase font-black tracking-widest">{product.type || product.category || 'Produto'}</span>
                    </div>
                </div>

                {/* Botão Compartilhar */}
                <div className="relative">
                    <button
                        onClick={shareNative}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 rounded-xl transition-all duration-300 shadow-lg hover:shadow-green-500/30 group"
                    >
                        <Share2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-semibold">Compartilhar</span>
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
                            <h3 className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-3">Sobre o Produto</h3>
                            <p className="text-neutral-300 leading-relaxed text-sm">
                                {product.description}
                            </p>
                        </div>
                    )}

                    <div className="mt-auto space-y-3">
                        <button className="w-full bg-white hover:bg-neutral-200 text-black py-4 rounded-xl font-extrabold text-lg shadow-[0_4px_15px_rgba(255,255,255,0.3)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.4)] transform hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                            <ShoppingCart className="w-5 h-5" /> Comprar Agora
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}