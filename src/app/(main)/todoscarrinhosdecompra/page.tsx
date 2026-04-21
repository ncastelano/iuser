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
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-green-500 selection:text-white">
            <div className="max-w-4xl mx-auto px-4 py-12 md:py-20 pb-32">
                <header className="flex items-center justify-between mb-16">
                    <div className="space-y-2">
                        <div className="flex items-center gap-4">
                            <button onClick={() => router.back()} className="p-3 bg-secondary/50 border border-border rounded-2xl hover:bg-foreground hover:text-background transition-all">
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <h1 className="text-5xl md:text-7xl font-black tracking-tighter italic uppercase text-foreground leading-none">
                                Meus<span className="text-green-500">Carrinhos</span>
                            </h1>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground ml-16">Gerencie suas compras em diferentes lojas</p>
                    </div>
                </header>

                {storeSlugs.length === 0 ? (
                    <div className="py-32 text-center rounded-[40px] border border-dashed border-border bg-card/40">
                        <ShoppingCart className="w-16 h-16 text-muted-foreground mx-auto mb-6 opacity-20" />
                        <p className="text-muted-foreground text-xl font-bold uppercase italic tracking-wider">Seu ecossistema está vazio</p>
                        <p className="text-muted-foreground text-[10px] mt-2 font-black uppercase tracking-widest opacity-50">Adicione itens de qualquer loja para vê-los aqui!</p>
                        <Link href="/" className="inline-block mt-10 px-10 py-4 bg-foreground text-background rounded-2xl font-black uppercase text-[11px] tracking-widest hover:opacity-90 transition-all">
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
                                <div key={slug} className="group relative bg-card/40 backdrop-blur-3xl border border-border rounded-[40px] p-8 hover:border-green-500/30 transition-all duration-500 hover:-translate-y-1">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                                        <div className="flex items-center gap-6">
                                            <div className="w-20 h-20 rounded-3xl bg-secondary border border-border overflow-hidden shadow-2xl">
                                                {details?.logo_url ? (
                                                    <img src={details.logo_url} className="w-full h-full object-cover transition-all" alt={details.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-secondary"><Store className="w-8 h-8 text-muted-foreground/30" /></div>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Loja Ativa</div>
                                                <h3 className="text-3xl font-black italic uppercase tracking-tighter text-foreground">{details?.name || slug}</h3>
                                                <p className="text-xs font-bold text-green-500">{totalItems} {totalItems === 1 ? 'item' : 'itens'} • R$ {totalPrice.toFixed(2).replace('.', ',')}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => clearStoreCart(slug)}
                                                className="p-5 bg-destructive/10 text-destructive border border-destructive/20 rounded-3xl hover:bg-destructive hover:text-white transition-all shadow-xl"
                                                title="Esvaziar"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                            <Link 
                                                href={`/loja/${slug}/carrinho`}
                                                className="flex-1 md:flex-none flex items-center justify-center gap-3 px-10 py-5 bg-foreground text-background rounded-3xl font-black uppercase text-[11px] tracking-widest hover:bg-green-500 hover:text-white transition-all shadow-2xl"
                                            >
                                                Ver Carrinho <ChevronRight className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Preview de itens */}
                                    <div className="mt-8 pt-8 border-t border-border flex gap-4 overflow-x-auto no-scrollbar">
                                        {items.map((item, idx) => (
                                            <div key={item.product.id + idx} className="flex-shrink-0 w-16 h-16 rounded-2xl bg-secondary border border-border overflow-hidden relative transition-all">
                                                {item.product.image_url ? (
                                                    <img src={item.product.image_url} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground/30 font-black italic">ITEM</div>
                                                )}
                                                {item.quantity > 1 && (
                                                    <div className="absolute top-1 right-1 bg-green-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-lg">
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
