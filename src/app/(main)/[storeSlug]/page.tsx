'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getMockStores, getMockProducts, MockStore, MockProduct } from '@/lib/mockData'

export default function StorePage() {
    const { storeSlug } = useParams()
    const router = useRouter()
    const supabase = createClient()

    const [store, setStore] = useState<MockStore | null>(null)
    const [products, setProducts] = useState<MockProduct[]>([])
    const [loading, setLoading] = useState(true)
    const [isOwner, setIsOwner] = useState(false)

    useEffect(() => {
        const fetchStore = async () => {
            setLoading(true)

            // Usa dados de Mock
            const allStores = getMockStores()
            const foundStore = allStores.find(s => s.storeSlug === storeSlug)

            if (!foundStore) {
                setLoading(false)
                return
            }

            // Simula delay de rede
            setTimeout(async () => {
                // 🔥 verifica dono real caso haja sessão ativa (apenas para manter botão + produto)
                const { data: { user } } = await supabase.auth.getUser()

                if (user && user.id === foundStore.owner_id) {
                    setIsOwner(true)
                }

                setStore(foundStore)
                setProducts(getMockProducts(foundStore.id))
                setLoading(false)
            }, 300)
        }

        if (storeSlug) fetchStore()
    }, [storeSlug])

    const getLogoUrl = (logoPath: string | null) => ''
    const getProductImageUrl = (imagePath: string | null) => ''

    if (loading)
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                Carregando...
            </div>
        )

    if (!store)
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white px-4 text-center">
                <div className="flex flex-col gap-4">
                    <h2 className="text-2xl font-bold">Loja não encontrada</h2>
                    <p className="text-neutral-500">Essa loja ({storeSlug}) não existe nos mocks.</p>
                    <button onClick={() => router.push('/')} className="text-orange-500 hover:underline">
                        Voltar para a Vitrine
                    </button>
                </div>
            </div>
        )

    const stats = store.store_stats

    return (
        <div className="flex flex-col gap-6 w-full animate-fade-in relative z-10">

            {/* HEADER TOP */}
            <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                <button
                    onClick={() => {
                        if (window.history.length > 1) {
                            router.back()
                        } else {
                            router.push('/')
                        }
                    }}
                    className="flex w-10 h-10 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 transition shadow-md group"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span>
                </button>

                <h1 className="text-xl font-bold truncate tracking-wide">
                    {store.name} (Mock)
                </h1>
            </div>

            {/* HEADER DA LOJA */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 bg-neutral-900/40 p-6 rounded-2xl border border-neutral-800 shadow-xl backdrop-blur-sm">

                <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-neutral-950 flex items-center justify-center border border-neutral-800 shadow-2xl">
                    <span className="text-neutral-600 text-sm font-medium">Sem Logo (Mock)</span>
                </div>

                <div className="flex flex-col gap-3 text-center md:text-left flex-1 pt-2">

                    <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                        {store.name}
                    </h2>

                    {store.description && (
                        <p className="text-gray-400 text-sm md:text-base leading-relaxed">
                            {store.description}
                        </p>
                    )}

                    {/* ⭐ RATING */}
                    <div className="flex items-center justify-center md:justify-start gap-2 text-orange-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i}>
                                {i < Math.round(stats.ratings_avg) ? '★' : '☆'}
                            </span>
                        ))}
                        <span className="text-neutral-400 text-sm ml-1">
                            ({stats.ratings_count} avaliações)
                        </span>
                    </div>

                    {/* STATUS */}
                    <div className="mt-2">
                        <span
                            className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${store.is_open
                                ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                                : 'bg-red-500/10 text-red-500 border border-red-500/30'
                                }`}
                        >
                            {store.is_open ? 'Aberto' : 'Fechado'}
                        </span>
                    </div>

                </div>
            </div>

            {/* 🔥 BOTÃO ADD PRODUTO (SÓ DONO) */}
            {isOwner && (
                <div className="flex justify-end">
                    <button
                        onClick={() => router.push(`/${store.storeSlug}/criar-produto`)}
                        className="px-6 py-3 bg-orange-500 text-black font-bold rounded-xl hover:bg-orange-600 active:bg-orange-700 transition shadow-[0_0_20px_rgba(249,115,22,0.2)] hover:shadow-[0_0_25px_rgba(249,115,22,0.3)] transform hover:-translate-y-0.5 active:scale-95"
                    >
                        + Adicionar Produto
                    </button>
                </div>
            )}

            {/* PRODUTOS */}
            <div className="mt-4">

                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <span className="w-2 h-8 bg-orange-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)]"></span>
                    Menu ({products.length})
                </h3>

                {products.length === 0 ? (
                    <div className="text-center py-16 bg-neutral-900/30 rounded-2xl border border-neutral-800 border-dashed">
                        <p className="text-neutral-400 text-lg font-medium">
                            Nenhum produto disponível no momento.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

                        {products.map(product => (
                            <div
                                key={product.id}
                                className="bg-neutral-900/60 rounded-2xl overflow-hidden shadow-xl border border-neutral-800 group hover:border-orange-500/50 hover:shadow-[0_10px_30px_rgba(249,115,22,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer backdrop-blur-sm"
                            >
                                <div className="w-full h-48 bg-neutral-950 flex items-center justify-center border-b border-neutral-800">
                                    <span className="text-neutral-600 font-medium text-sm">Sem Imagem (Mock)</span>
                                </div>

                                <div className="p-5 flex flex-col gap-3 flex-1">
                                    
                                    <div className="flex justify-between items-start gap-2">
                                        <h4 className="font-bold text-lg line-clamp-1 text-white">
                                            {product.name}
                                        </h4>
                                        <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">
                                            {product.category}
                                        </span>
                                    </div>

                                    {product.description && (
                                        <p className="text-neutral-400 text-sm line-clamp-2 leading-relaxed">
                                            {product.description}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-neutral-800">
                                        <p className="text-orange-500 font-extrabold text-xl">
                                            R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>

                                        <button className="bg-neutral-800 hover:bg-orange-500 hover:text-black text-white w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 font-bold shadow-md hover:shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                                            +
                                        </button>
                                    </div>

                                </div>
                            </div>
                        ))}

                    </div>
                )}
            </div>
        </div>
    )
}
