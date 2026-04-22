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
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-green-500 selection:text-white overflow-x-hidden">
            <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-12 md:py-20 pb-32">
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 sm:mb-16">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <button
                                onClick={() => router.back()}
                                className="p-2 sm:p-3 bg-secondary/50 border border-border rounded-none hover:bg-foreground hover:text-background transition-all flex-shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                            <h1 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tighter italic uppercase text-foreground leading-none break-words">
                                Carrinho
                            </h1>
                        </div>
                        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-muted-foreground ml-12 sm:ml-16 break-words">
                            Gerencie suas compras em diferentes lojas
                        </p>
                    </div>
                </header>

                {storeSlugs.length === 0 ? (
                    <div className="py-16 sm:py-24 text-center rounded-none border border-dashed border-border bg-card/40">
                        <ShoppingCart className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                        <p className="text-muted-foreground text-base sm:text-lg font-bold uppercase italic tracking-wider break-words px-4">
                            Vazio
                        </p>
                        <p className="text-muted-foreground text-[7px] sm:text-[8px] mt-1 font-black uppercase tracking-widest opacity-50 break-words px-4">
                            Adicione itens para vê-los aqui!
                        </p>
                        <Link
                            href="/"
                            className="inline-block mt-6 sm:mt-8 px-6 sm:px-8 py-2 sm:py-3 bg-foreground text-background rounded-none font-black uppercase text-[9px] sm:text-[10px] tracking-widest hover:opacity-90 transition-all"
                        >
                            Explorar Lojas
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:gap-6">
                        {storeSlugs.map((slug) => {
                            const details = storeDetails[slug]
                            const items = itemsByStore[slug]
                            const totalItems = items.reduce((acc, item) => acc + item.quantity, 0)
                            const totalPrice = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

                            return (
                                <div key={slug} className="group relative bg-card/40 backdrop-blur-3xl border border-border rounded-none p-3 sm:p-4 hover:border-green-500/30 transition-all duration-500 hover:-translate-y-0.5">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
                                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-none bg-secondary border border-border overflow-hidden shadow-xl flex-shrink-0">
                                                {details?.logo_url ? (
                                                    <img src={details.logo_url} className="w-full h-full object-cover transition-all" alt={details.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                                                        <Store className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground/30" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-0.5 min-w-0 flex-1">
                                                <div className="text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-muted-foreground">
                                                    Loja Ativa
                                                </div>
                                                <h3 className="text-base sm:text-xl font-black italic uppercase tracking-tighter text-foreground break-words">
                                                    {details?.name || slug}
                                                </h3>
                                                <p className="text-[9px] sm:text-[10px] font-bold text-green-500 break-words">
                                                    {totalItems} {totalItems === 1 ? 'item' : 'itens'} • R$ {totalPrice.toFixed(2).replace('.', ',')}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 sm:gap-3">
                                            <button
                                                onClick={() => clearStoreCart(slug)}
                                                className="p-2 sm:p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-none hover:bg-destructive hover:text-white transition-all shadow-lg flex-shrink-0"
                                                title="Esvaziar"
                                            >
                                                <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                            </button>
                                            <Link
                                                href={`/loja/${slug}/carrinho`}
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-foreground text-background rounded-none font-black uppercase text-[9px] sm:text-[10px] tracking-widest hover:bg-green-500 hover:text-white transition-all shadow-xl whitespace-nowrap"
                                            >
                                                Ver pedido<ChevronRight className="w-3 h-3" />
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Preview de itens */}
                                    <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
                                        {items.map((item, idx) => (
                                            <div key={item.product.id + idx} className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-none bg-secondary border border-border overflow-hidden relative transition-all">
                                                {item.product.image_url ? (
                                                    <img src={item.product.image_url} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[8px] sm:text-[10px] text-muted-foreground/30 font-black italic">
                                                        ITEM
                                                    </div>
                                                )}
                                                {item.quantity > 1 && (
                                                    <div className="absolute top-0 right-0 bg-green-500 text-white text-[6px] sm:text-[7px] font-black px-1 py-0.5 rounded-none shadow-lg">
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