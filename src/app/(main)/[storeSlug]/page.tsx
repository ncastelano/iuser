// src/app/(main)/[storeSlug]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Search, ArrowLeft, Star, Plus, Share2, MessageCircle, Copy, Check, ShoppingCart, Minus, X, Trash2, CheckCircle2 } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'

export default function StorePage() {
    const params = useParams()
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const router = useRouter()

    const [store, setStore] = useState<any | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isOwner, setIsOwner] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showShareMenu, setShowShareMenu] = useState(false)
    const [copied, setCopied] = useState(false)
    const [showCart, setShowCart] = useState(false)
    const [mounted, setMounted] = useState(false)

    const { itemsByStore, addItem, updateQuantity, removeItem } = useCartStore()
    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0)
    const totalPrice = cartItems.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

    useEffect(() => { setMounted(true) }, [])

    const getStoreUrl = () => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${storeSlug}`
    }

    const shareOnWhatsApp = () => {
        const storeUrl = getStoreUrl()
        const text = `✨ *${store?.name}* ✨\n\n${store?.storeSlug}\n\n🔗 ${storeUrl}`
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
        window.open(whatsappUrl, '_blank')
        setShowShareMenu(false)
    }

    const shareOnWhatsAppStory = () => {
        const storeUrl = getStoreUrl()
        const storyText = `✨ ${store?.name} ✨`
        const whatsappStoryUrl = `https://wa.me/?text=${encodeURIComponent(storyText + '\n\n' + storeUrl)}`
        window.open(whatsappStoryUrl, '_blank')
        setShowShareMenu(false)
    }

    const copyToClipboard = async () => {
        const storeUrl = getStoreUrl()
        try {
            await navigator.clipboard.writeText(storeUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
            setTimeout(() => setShowShareMenu(false), 1500)
        } catch (err) {
            console.error('Erro ao copiar:', err)
        }
    }

    const shareNative = () => {
        if (navigator.share) {
            const storeUrl = getStoreUrl()
            navigator.share({
                title: store?.name,
                text: store?.storeSlug,
                url: storeUrl,
            }).catch(() => { })
        } else {
            setShowShareMenu(true)
        }
    }

    const toggleStoreStatus = async () => {
        if (!isOwner || !store) return

        const newStatus = !store.is_active
        const confirmMessage = newStatus
            ? "Você quer abrir a loja?"
            : "Você quer fechar a loja?"

        if (window.confirm(confirmMessage)) {
            setStore({ ...store, is_active: newStatus })

            const supabase = createClient()
            const { error: updateError } = await supabase
                .from('stores')
                .update({ is_active: newStatus })
                .eq('id', store.id)

            if (updateError) {
                console.error('[StorePage] Erro ao atualizar status da loja:', updateError)
                alert("Erro ao alterar o status da loja.")
                setStore({ ...store, is_active: !newStatus })
            }
        }
    }

    useEffect(() => {
        if (!storeSlug) return

        const fetchStore = async () => {
            setLoading(true)
            setError(null)

            const supabase = createClient()

            const { data: foundStore, error: storeError } = await supabase
                .from('stores')
                .select('*')
                .ilike('storeSlug', storeSlug || '')
                .maybeSingle()

            if (storeError) {
                console.error('[StorePage] Erro ao buscar loja:', storeError)
                setError(`Erro ao buscar loja: ${storeError.message}`)
                setLoading(false)
                return
            }

            if (!foundStore) {
                console.warn('[StorePage] Loja não encontrada para slug:', storeSlug)
                setLoading(false)
                return
            }

            const logo_url = foundStore.logo_url
                ? supabase.storage.from('store-logos').getPublicUrl(foundStore.logo_url).data.publicUrl
                : null

            const { data: { user } } = await supabase.auth.getUser()
            if (user && user.id === foundStore.owner_id) {
                setIsOwner(true)
            }

            const { data: productsData, error: productsError } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', foundStore.id)
                .order('created_at', { ascending: false })

            if (productsError) {
                console.error('[StorePage] Erro ao buscar produtos:', productsError)
            }

            const mappedProducts = (productsData || []).map(p => ({
                ...p,
                image_url: p.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                    : null
            }))

            setStore({ ...foundStore, logo_url })
            setProducts(mappedProducts)
            setLoading(false)
        }

        fetchStore()
    }, [storeSlug])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
                    <p className="text-neutral-400 text-sm">Carregando loja...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white px-4 text-center">
                <div className="flex flex-col gap-4 max-w-sm items-center">
                    <AlertTriangle className="w-12 h-12 text-white" />
                    <h2 className="text-2xl font-bold">Erro ao carregar</h2>
                    <p className="text-neutral-500 text-sm">{error}</p>
                    <button onClick={() => router.push('/')} className="text-neutral-300 hover:text-white hover:underline mt-2">
                        Voltar para a Vitrine
                    </button>
                </div>
            </div>
        )
    }

    if (!store) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white px-4 text-center">
                <div className="flex flex-col gap-4 max-w-sm items-center">
                    <Search className="w-12 h-12 text-neutral-500" />
                    <h2 className="text-2xl font-bold">Loja não encontrada</h2>
                    <p className="text-neutral-500 text-sm">
                        Nenhuma loja com o endereço <span className="text-white font-mono">/{storeSlug}</span> foi encontrada.
                    </p>
                    <button onClick={() => router.push('/')} className="text-neutral-300 hover:text-white hover:underline text-sm mt-2 flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> Voltar para a Vitrine
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 w-full animate-fade-in relative z-10">

            {/* BACK + TITLE + SHARE */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 gap-4">
                <div className="flex items-center gap-4 min-w-0">
                    <button
                        onClick={() => window.history.length > 1 ? router.back() : router.push('/')}
                        className="flex w-10 h-10 flex-shrink-0 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:border-white/50 transition shadow-md group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <h1 className="text-xl font-bold truncate tracking-wide">{store.name}</h1>
                </div>

                <div className="relative flex-shrink-0">
                    <button
                        onClick={shareNative}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 hover:border-neutral-500 rounded-xl transition-all duration-300 shadow-md group"
                    >
                        <Share2 className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
                        <span className="text-sm font-semibold text-neutral-400 group-hover:text-white transition-colors hidden sm:inline">Compartilhar</span>
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
                                            {copied ? 'Link copiado com sucesso' : 'Copiar URL da loja'}
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* STORE HEADER */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 bg-neutral-900/40 p-6 rounded-2xl border border-neutral-800 shadow-xl backdrop-blur-sm">

                {/* LOGO */}
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-neutral-950 flex items-center justify-center border border-neutral-800 shadow-2xl overflow-hidden flex-shrink-0">
                    {store.logo_url ? (
                        <img src={store.logo_url} className="w-full h-full object-cover" alt={`Logo ${store.name}`} />
                    ) : (
                        <span className="text-neutral-600 text-sm font-medium text-center px-2">{store.name?.charAt(0)}</span>
                    )}
                </div>

                {/* INFO */}
                <div className="flex flex-col gap-3 text-center md:text-left flex-1 pt-2">

                    <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                        {store.name}
                    </h2>

                    {store.description && (
                        <p className="text-gray-400 text-sm md:text-base leading-relaxed">
                            {store.description}
                        </p>
                    )}

                    {/* RATING */}
                    <div className="flex items-center justify-center md:justify-start gap-1 text-white">
                        <Star className="w-4 h-4 fill-white" />
                        <span className="font-bold">{store.ratings_avg?.toFixed(1) ?? '0.0'}</span>
                        <span className="text-neutral-400 text-sm ml-1">
                            ({store.ratings_count ?? 0} avaliações)
                        </span>
                    </div>

                    {/* BADGES */}
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-1">
                        <button
                            onClick={isOwner ? toggleStoreStatus : undefined}
                            className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${store.is_active
                                ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                                : 'bg-red-500/10 text-red-500 border border-red-500/30'
                                } ${isOwner ? 'cursor-pointer hover:opacity-80 transition hover:scale-105 active:scale-95 shadow-md flex items-center gap-1' : 'cursor-default'}`}>
                            {store.is_active ? '● Aberto' : '● Fechado'}
                        </button>

                        {store.prep_time_min != null && store.prep_time_max != null && (
                            <span className="px-3 py-1.5 rounded-full text-xs border border-neutral-700 text-neutral-300 bg-neutral-900/50">
                                ⏱ {store.prep_time_min}–{store.prep_time_max} min
                            </span>
                        )}

                        {store.price_min != null && store.price_max != null && (
                            <span className="px-3 py-1.5 rounded-full text-xs border border-neutral-700 text-green-400 bg-neutral-900/50">
                                💰 R${store.price_min} – R${store.price_max}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* OWNER ACTION */}
            {isOwner && (
                <div className="flex justify-end">
                    <button
                        onClick={() => router.push(`/${store.storeSlug}/criar-produto`)}
                        className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 active:bg-neutral-300 transition shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_25px_rgba(255,255,255,0.3)] transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" /> Adicionar Produto ou Serviço
                    </button>
                </div>
            )}

            {/* PRODUCTS */}
            <div className="mt-4">
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <span className="w-2 h-8 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                    Menu ({products.length})
                </h3>

                {products.length === 0 ? (
                    <div className="text-center py-16 bg-neutral-900/30 rounded-2xl border border-neutral-800 border-dashed flex flex-col items-center">
                        <p className="text-neutral-400 text-lg font-medium">Nenhum produto disponível no momento.</p>
                        {isOwner && (
                            <button
                                onClick={() => router.push(`/${store.storeSlug}/criar-produto`)}
                                className="mt-4 text-white text-sm hover:underline flex items-center gap-1"
                            >
                                Adicionar seu primeiro produto <ArrowLeft className="w-4 h-4 rotate-180" />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {products.map(product => (
                            <div
                                key={product.id}
                                onClick={() => router.push(`/${store.storeSlug}/${product.slug || product.id}`)}
                                className="bg-neutral-900/60 rounded-2xl overflow-hidden shadow-xl border border-neutral-800 group hover:border-white/50 hover:shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer backdrop-blur-sm"
                            >
                                <div className="w-full h-48 bg-neutral-950 flex items-center justify-center border-b border-neutral-800 overflow-hidden relative">
                                    {product.image_url ? (
                                        <img
                                            src={product.image_url}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            alt={product.name}
                                        />
                                    ) : (
                                        <span className="text-neutral-600 font-medium text-sm">Sem Imagem</span>
                                    )}
                                </div>

                                <div className="p-5 flex flex-col gap-3 flex-1">
                                    <div className="flex justify-between items-start gap-2">
                                        <h4 className="font-bold text-lg line-clamp-1 text-white">{product.name}</h4>
                                        {(product.type || product.category) && (
                                            <span className="text-xs bg-neutral-800 text-neutral-300 px-2 py-1 rounded-md whitespace-nowrap">
                                                {product.type || product.category}
                                            </span>
                                        )}
                                    </div>

                                    {product.description && (
                                        <p className="text-neutral-400 text-sm line-clamp-2 leading-relaxed">
                                            {product.description}
                                        </p>
                                    )}

                                    <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-neutral-800">
                                        <p className="text-white font-extrabold text-xl">
                                            R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                        
                                        {mounted && cartItems.some((item: any) => item.product.id === product.id) ? (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    router.push(`/${storeSlug}/carrinho`)
                                                }}
                                                className="w-full py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-amber-100 text-black shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                                            >
                                                <CheckCircle2 className="w-5 h-5" />
                                                Adicionado (Ver)
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url }, product)
                                                }}
                                                className="w-full py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-neutral-800 hover:bg-white hover:text-black text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                                            >
                                                <Plus className="w-5 h-5" />
                                                Adicionar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {/* VENDAS/CARRINHO BOTTOM BAR */}
            {mounted && totalItems > 0 && (
                <>
                    <div className="h-24"></div>
                    
                    <div className="fixed bottom-0 left-0 right-0 p-4 z-40 bg-gradient-to-t from-black via-black/90 to-transparent pointer-events-none">
                        <div className="max-w-7xl mx-auto flex justify-center pointer-events-auto">
                            <button
                                onClick={() => router.push(`/${storeSlug}/carrinho`)}
                                className="w-full sm:w-[400px] bg-gradient-to-r from-yellow-400 via-orange-500 to-amber-100 text-black py-4 px-6 rounded-2xl font-black text-lg flex items-center justify-between shadow-[0_0_30px_rgba(255,165,0,0.3)] hover:shadow-[0_0_40px_rgba(255,165,0,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="bg-black/10 text-black w-8 h-8 rounded-full flex items-center justify-center font-extrabold">
                                        {totalItems}
                                    </div>
                                    <span>Ver Carrinho</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    <ShoppingCart className="w-5 h-5" />
                                </div>
                            </button>
                        </div>
                    </div>
                </>
            )}


        </div>
    )
}