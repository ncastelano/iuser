'use client'

import { useCartStore } from '@/store/useCartStore'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Store, ChevronRight, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function TodosCarrinhosPage() {
    const { itemsByStore, storeDetails, clearStoreCart } = useCartStore()
    const router = useRouter()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    const storeSlugs = Object.keys(itemsByStore)

    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
            <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
                <header className="flex items-center justify-between mb-16">
                    <div className="space-y-2">
                        <div className="flex items-center gap-4">
                            <button onClick={() => router.back()} className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white hover:text-black transition-all">
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <h1 className="text-5xl md:text-7xl font-black tracking-tighter italic uppercase text-white leading-none">
                                Meus<span className="text-blue-500">Carrinhos</span>
                            </h1>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500 ml-16">Gerencie suas compras em diferentes lojas</p>
                    </div>
                </header>

                {storeSlugs.length === 0 ? (
                    <div className="py-32 text-center rounded-[40px] border border-dashed border-white/5 bg-white/[0.01]">
                        <ShoppingCart className="w-16 h-16 text-neutral-800 mx-auto mb-6" />
                        <p className="text-neutral-500 text-xl font-bold uppercase italic tracking-wider">Seu ecossistema está vazio</p>
                        <p className="text-neutral-600 text-xs mt-2 font-black uppercase tracking-widest">Adicione itens de qualquer loja para vê-los aqui!</p>
                        <Link href="/" className="inline-block mt-10 px-10 py-4 bg-white text-black rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-neutral-200 transition-all">
                            Explorar Lojas
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-6">
                        {storeSlugs.map((slug) => {
                            const details = storeDetails[slug]
                            const items = itemsByStore[slug]
                            const totalItems = items.reduce((acc, item) => acc + item.quantity, 0)
                            const totalPrice = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

                            return (
                                <div key={slug} className="group relative bg-neutral-900/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-8 hover:border-white/10 transition-all duration-500 hover:-translate-y-1">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                                        <div className="flex items-center gap-6">
                                            <div className="w-20 h-20 rounded-3xl bg-black border border-white/5 overflow-hidden shadow-2xl">
                                                {details?.logo_url ? (
                                                    <img src={details.logo_url} className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all" alt={details.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-neutral-900"><Store className="w-8 h-8 text-neutral-700" /></div>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600">Loja Ativa</div>
                                                <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">{details?.name || slug}</h3>
                                                <p className="text-xs font-bold text-neutral-500">{totalItems} {totalItems === 1 ? 'item' : 'itens'} • R$ {totalPrice.toFixed(2).replace('.', ',')}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => clearStoreCart(slug)}
                                                className="p-5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-3xl hover:bg-red-500 hover:text-white transition-all shadow-xl"
                                                title="Esvaziar"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                            <Link 
                                                href={`/loja/${slug}/carrinho`}
                                                className="flex-1 md:flex-none flex items-center justify-center gap-3 px-10 py-5 bg-white text-black rounded-3xl font-black uppercase text-[11px] tracking-widest hover:bg-neutral-200 transition-all shadow-2xl"
                                            >
                                                Ver Carrinho <ChevronRight className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Preview de itens */}
                                    <div className="mt-8 pt-8 border-t border-white/5 flex gap-4 overflow-x-auto no-scrollbar">
                                        {items.map((item, idx) => (
                                            <div key={item.product.id + idx} className="flex-shrink-0 w-16 h-16 rounded-2xl bg-black border border-white/5 overflow-hidden relative grayscale hover:grayscale-0 transition-all">
                                                {item.product.image_url ? (
                                                    <img src={item.product.image_url} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-800 font-black italic">ITEM</div>
                                                )}
                                                {item.quantity > 1 && (
                                                    <div className="absolute top-1 right-1 bg-blue-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-lg">
                                                        {item.quantity}x
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
