'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Search, ArrowLeft, Star, Plus } from 'lucide-react'
import { Image as ImageIcon, Trash } from 'lucide-react'

export default function StorePage() {
    const params = useParams()
    const router = useRouter()

    // 🔒 garante string segura
    const rawSlug = Array.isArray(params.storeSlug)
        ? params.storeSlug[0]
        : params.storeSlug

    const storeSlug = typeof rawSlug === 'string' ? rawSlug : null

    const [store, setStore] = useState<any | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isOwner, setIsOwner] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [storeLinks, setStoreLinks] = useState<any[]>([])
    const [showDialog, setShowDialog] = useState(false)
    const [linkInput, setLinkInput] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)

    const supabase = createClient()

    // ─────────────────────────────────────────────────────────────
    const toggleStoreStatus = async () => {
        if (!isOwner || !store) return

        const newStatus = !store.is_active

        if (window.confirm(newStatus ? "Abrir loja?" : "Fechar loja?")) {
            setStore({ ...store, is_active: newStatus })

            const { error } = await supabase
                .from('stores')
                .update({ is_active: newStatus })
                .eq('id', store.id)

            if (error) {
                alert("Erro ao alterar status")
                setStore({ ...store, is_active: !newStatus })
            }
        }
    }

    const fetchLinks = async (storeId: string) => {
        const { data } = await supabase
            .from('store_links')
            .select('*')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })

        const mapped = (data || []).map(l => ({
            ...l,
            image_url: supabase.storage.from('store-links')
                .getPublicUrl(l.image_url).data.publicUrl
        }))

        setStoreLinks(mapped)
    }

    const handleSaveLink = async () => {
        if (!imageFile || !linkInput || !store) return

        const filePath = `${store.id}/${Date.now()}`

        const { error: uploadError } = await supabase.storage
            .from('store-links')
            .upload(filePath, imageFile)

        if (uploadError) return alert('Erro upload')

        const { error } = await supabase
            .from('store_links')
            .insert({
                store_id: store.id,
                image_url: filePath,
                link_url: linkInput
            })

        if (error) return alert('Erro salvar')

        setShowDialog(false)
        setLinkInput('')
        setImageFile(null)

        fetchLinks(store.id)
    }

    const deleteLink = async (id: string) => {
        await supabase.from('store_links').delete().eq('id', id)
        setStoreLinks(prev => prev.filter(l => l.id !== id))
    }

    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        // ✅ VERIFICAÇÃO ANTES DE USAR storeSlug
        if (!storeSlug) {
            setError('Slug da loja inválido')
            setLoading(false)
            return
        }

        const fetchStore = async () => {
            setLoading(true)
            setError(null)

            // ✅ AGORA storeSlug É GARANTIDAMENTE UMA STRING
            const { data: foundStore, error: storeError } = await supabase
                .from('stores')
                .select('*')
                .eq('storeSlug', storeSlug) // ou .ilike('storeSlug', storeSlug)
                .maybeSingle()

            if (storeError) {
                setError(storeError.message)
                setLoading(false)
                return
            }

            if (!foundStore) {
                setLoading(false)
                return
            }

            const logo_url = foundStore.logo_url
                ? supabase.storage.from('store-logos')
                    .getPublicUrl(foundStore.logo_url).data.publicUrl
                : null

            const { data: { user } } = await supabase.auth.getUser()

            if (user?.id === foundStore.owner_id) {
                setIsOwner(true)
            }

            const { data: productsData } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', foundStore.id)
                .order('created_at', { ascending: false })

            const mappedProducts = (productsData || []).map(p => ({
                ...p,
                image_url: p.image_url
                    ? supabase.storage.from('product-images')
                        .getPublicUrl(p.image_url).data.publicUrl
                    : null
            }))

            setStore({ ...foundStore, logo_url })
            setProducts(mappedProducts)

            await fetchLinks(foundStore.id)

            setLoading(false)
        }

        fetchStore()
    }, [storeSlug])

    // ─────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
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

    // ─────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-6 w-full animate-fade-in relative z-10 text-white">

            {/* BACK + TITLE */}
            <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                <button
                    onClick={() => window.history.length > 1 ? router.back() : router.push('/')}
                    className="flex w-10 h-10 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:border-white/50 transition shadow-md group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                </button>
                <h1 className="text-xl font-bold truncate tracking-wide">{store.name}</h1>
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

            {/* BANNER LINKS VISUAIS - Movido para cima do Menu */}
            {storeLinks.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {storeLinks.map(link => (
                        <div key={link.id} className="relative group cursor-pointer" onClick={() => window.open(link.link_url, '_blank')}>
                            <img
                                src={link.image_url}
                                className="w-full aspect-square object-cover rounded-xl hover:scale-105 transition border border-neutral-800 hover:border-white/50"
                                alt="Banner"
                            />
                            {isOwner && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        deleteLink(link.id)
                                    }}
                                    className="absolute top-1 right-1 bg-black/70 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                                >
                                    <Trash size={12} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ACTIONS BAR - Botões lado a lado */}
            {isOwner && (
                <div className="flex items-center justify-between">
                    {/* Botão Adicionar Banner - Lado Esquerdo */}
                    <button
                        onClick={() => setShowDialog(true)}
                        className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 active:bg-neutral-300 transition shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_25px_rgba(255,255,255,0.3)] transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2"
                    >
                        <ImageIcon className="w-5 h-5" /> Adicionar Banner
                    </button>

                    {/* Botão Adicionar Produto - Lado Direito */}
                    <button
                        onClick={() => router.push(`/${store.storeSlug}/criar-produto`)}
                        className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 active:bg-neutral-300 transition shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_25px_rgba(255,255,255,0.3)] transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" /> Adicionar Produto
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

                                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-neutral-800">
                                        <p className="text-white font-extrabold text-xl">
                                            R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                        <button className="bg-neutral-800 hover:bg-white hover:text-black text-white w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 font-bold shadow-md hover:shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* DIALOG DE ADICIONAR BANNER */}
            {showDialog && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-neutral-900 p-6 rounded-xl w-full max-w-md flex flex-col gap-4">

                        <h2 className="text-lg font-bold">Adicionar Banner</h2>

                        <input
                            placeholder="https://..."
                            value={linkInput}
                            onChange={e => setLinkInput(e.target.value)}
                            className="p-2 rounded bg-black border border-neutral-700 text-white"
                        />

                        <label className="border-2 border-dashed border-neutral-700 rounded-xl h-32 flex items-center justify-center cursor-pointer hover:border-white/50 transition">
                            {imageFile ? (
                                <span className="text-sm text-neutral-300">{imageFile.name}</span>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-neutral-400">
                                    <ImageIcon className="w-8 h-8" />
                                    <span className="text-sm">Clique para selecionar uma imagem</span>
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={e => setImageFile(e.target.files?.[0] || null)}
                            />
                        </label>

                        {/* LISTA DE LINKS EXISTENTES */}
                        {storeLinks.length > 0 && (
                            <div className="flex flex-col gap-2 max-h-40 overflow-auto">
                                <p className="text-xs text-neutral-400">Banners existentes:</p>
                                {storeLinks.map(link => (
                                    <div key={link.id} className="flex items-center justify-between text-sm bg-black p-2 rounded">
                                        <span className="truncate text-neutral-300">{link.link_url}</span>
                                        <button
                                            onClick={() => deleteLink(link.id)}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            <Trash size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-2">
                            <button
                                onClick={() => setShowDialog(false)}
                                className="px-4 py-2 text-neutral-400 hover:text-white transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveLink}
                                className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-neutral-200 transition"
                            >
                                Salvar Banner
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    )
}