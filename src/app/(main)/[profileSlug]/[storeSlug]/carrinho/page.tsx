'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ShoppingCart, Minus, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'

export default function CarrinhoPage() {
    const params = useParams()
    const router = useRouter()

    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug

    const { itemsByStore, updateQuantity, removeItem, storeDetails } = useCartStore()
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const storeInfo = typeof storeSlug === 'string' ? storeDetails[storeSlug] : null

    const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0)
    const totalPrice = cartItems.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

    // Se precisar criar um texto pro WhatsApp
    const handleFinalizarCompra = () => {
        if (!storeInfo) return

        let texto = `*Novo Pedido - ${storeInfo.name}*\n\n`
        cartItems.forEach(item => {
            texto += `${item.quantity}x ${item.product.name} - R$ ${(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`
        })
        texto += `\n*TOTAL: R$ ${totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`

        const url = `https://wa.me/?text=${encodeURIComponent(texto)}`
        window.open(url, '_blank')
    }

    if (!mounted) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">Carregando...</div>
    }

    return (
        <div className="relative w-full max-w-4xl mx-auto py-8 md:py-16 animate-fade-in text-white selection:bg-white selection:text-black">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-16">
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="w-14 h-14 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl hover:bg-white hover:text-black transition-all duration-500 shadow-2xl"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="space-y-1">
                        <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white">
                            Seu Carrinho<span className="text-blue-500">.</span>
                        </h1>
                        {storeInfo && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600">Checkout em</span>
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{storeInfo.name}</span>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="px-8 py-3 bg-white/5 border border-white/10 rounded-full">
                    <div className="flex items-center gap-3">
                        <ShoppingCart className="w-4 h-4 text-neutral-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400">{totalItems} Itens Selecionados</span>
                    </div>
                </div>
            </div>

            {cartItems.length === 0 ? (
                <div className="py-32 text-center rounded-[48px] border border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-8">
                    <div className="w-24 h-24 bg-neutral-900 rounded-[32px] flex items-center justify-center border border-white/5">
                        <ShoppingCart className="w-10 h-10 text-neutral-700" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">Carrinho Vazio</h2>
                        <p className="text-neutral-500 text-sm font-bold uppercase tracking-widest">Sua sacola de alta performance está aguardando produtos.</p>
                    </div>
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="px-12 py-5 bg-white text-black font-black uppercase text-xs tracking-widest rounded-full hover:bg-neutral-200 transition-all shadow-2xl hover:shadow-white/10"
                    >
                        Voltar para a Vitrine
                    </button>
                </div>
            ) : (
                <div className="space-y-12">
                    {/* Items List */}
                    <div className="space-y-6">
                        {cartItems.map((item) => (
                            <div
                                key={item.product.id}
                                className="group relative bg-neutral-900/10 backdrop-blur-3xl border border-white/5 rounded-[40px] p-6 md:p-8 flex flex-col md:flex-row items-center gap-8 transition-all hover:bg-neutral-900/20 hover:border-white/10 shadow-xl"
                            >
                                <div className="w-32 h-32 md:w-40 md:h-40 bg-black rounded-[32px] overflow-hidden border border-white/5 flex-shrink-0 shadow-2xl">
                                    {item.product.image_url ? (
                                        <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-neutral-800 text-3xl font-black italic">{item.product.name.charAt(0)}</div>
                                    )}
                                </div>

                                <div className="flex-1 space-y-4 text-center md:text-left">
                                    <div className="space-y-1">
                                        <h4 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-white line-clamp-2">{item.product.name}</h4>
                                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600">Unitário: R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    </div>

                                    <div className="flex items-center justify-center md:justify-start gap-4">
                                        <div className="flex items-center bg-black border border-white/5 p-1 rounded-2xl shadow-inner">
                                            <button
                                                onClick={() => updateQuantity(storeSlug as string, item.product.id, -1)}
                                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-white hover:bg-white hover:text-black transition-all"
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span className="w-10 text-center text-sm font-black italic">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(storeSlug as string, item.product.id, 1)}
                                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-white hover:bg-white hover:text-black transition-all"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeItem(storeSlug as string, item.product.id)}
                                            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-red-500/5 text-red-500/50 hover:bg-red-500 hover:text-white transition-all border border-red-500/10"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="text-center md:text-right">
                                     <div className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-600 mb-1">Subtotal Item</div>
                                     <div className="text-3xl font-black italic tracking-tighter text-white">
                                        R$ {(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                     </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Card */}
                    <div className="bg-neutral-900/20 backdrop-blur-3xl border border-white/5 rounded-[48px] p-10 md:p-14 space-y-10 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        
                        <div className="flex flex-col md:flex-row items-center justify-between gap-8 border-b border-white/5 pb-10">
                            <div className="space-y-1 text-center md:text-left">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-600">Total Acumulado</h3>
                                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Calculado com impostos e exclusividades iUser</p>
                            </div>
                            <div className="text-5xl md:text-7xl font-black italic tracking-tighter text-white">
                                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <button
                                onClick={handleFinalizarCompra}
                                className="w-full py-7 bg-white text-black rounded-[32px] font-black uppercase text-sm tracking-[0.4em] transition-all hover:bg-neutral-200 active:scale-[0.98] shadow-2xl hover:shadow-white/10 flex items-center justify-center gap-4 group/btn"
                            >
                                <CheckCircle2 className="w-6 h-6" />
                                Finalizar via WhatsApp
                            </button>
                            <p className="text-center text-[9px] font-black uppercase tracking-[0.3em] text-neutral-700">Ao clicar em finalizar você será redirecionado para o atendimento exclusivo do representante.</p>
                        </div>
                    </div>
                </div>
            )}
            <div className="pb-32" />
        </div>
    )
}
