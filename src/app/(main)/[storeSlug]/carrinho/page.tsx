'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ShoppingCart, Minus, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'

export default function CarrinhoPage() {
    const params = useParams()
    const router = useRouter()
    
    // Suporte params como array ou string (Next13+)
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    
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
        <div className="max-w-3xl mx-auto p-4 md:p-8 animate-fade-in text-white relative z-10">
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => router.push(`/${storeSlug}`)}
                    className="flex w-10 h-10 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:border-white/50 transition shadow-md group shrink-0"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                </button>
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShoppingCart className="w-6 h-6 text-neutral-400" />
                        Seu Carrinho
                    </h1>
                    {storeInfo && (
                        <p className="text-neutral-400 text-sm">
                            Em <span className="font-bold text-white max-w-[200px] truncate inline-block align-bottom">{storeInfo.name}</span>
                        </p>
                    )}
                </div>
            </div>

            {cartItems.length === 0 ? (
                <div className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-4 mt-12 shadow-2xl">
                    <div className="w-24 h-24 bg-neutral-800/50 rounded-full flex items-center justify-center mb-2">
                        <ShoppingCart className="w-12 h-12 text-neutral-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Seu carrinho está vazio</h2>
                    <p className="text-neutral-400 text-lg">Volte para a loja e adicione alguns produtos!</p>
                    <button 
                        onClick={() => router.push(`/${storeSlug}`)}
                        className="mt-6 px-8 py-4 bg-white text-black font-extrabold text-lg rounded-xl hover:bg-neutral-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95"
                    >
                        Voltar para a Loja
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Lista de Itens */}
                    <div className="bg-neutral-900/60 rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl backdrop-blur-sm">
                        {cartItems.map((item, index) => (
                            <div 
                                key={item.product.id} 
                                className={`flex flex-col sm:flex-row gap-4 p-5 ${index !== cartItems.length - 1 ? 'border-b border-neutral-800/50' : ''} group bg-neutral-900/40 hover:bg-neutral-800/80 transition-colors relative`}
                            >
                                <div className="flex items-center gap-4 flex-1 pr-8 sm:pr-0">
                                    <div className="w-20 h-20 sm:w-28 sm:h-28 bg-neutral-950 rounded-2xl overflow-hidden flex-shrink-0 border border-neutral-800 shadow-lg">
                                        {item.product.image_url ? (
                                            <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <ShoppingCart className="w-8 h-8 text-neutral-700" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col flex-1 h-full py-1">
                                        <h4 className="font-bold text-lg sm:text-xl text-white leading-tight line-clamp-2">{item.product.name}</h4>
                                        <p className="font-extrabold text-neutral-400 mt-2">
                                            R$ {(item.product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span className="font-normal text-xs uppercase tracking-wider text-neutral-600">cada</span>
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-3 sm:gap-4 pt-4 sm:pt-0 border-t border-neutral-800 sm:border-0 mt-3 sm:mt-0">
                                    <p className="font-black text-2xl text-white block sm:hidden">
                                        R$ {(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>

                                    <div className="flex items-center gap-1 bg-black/50 p-1.5 rounded-xl border border-neutral-800 shadow-inner">
                                        <button 
                                            onClick={() => updateQuantity(storeSlug as string, item.product.id, -1)}
                                            className="w-10 h-10 rounded-lg bg-neutral-800/80 flex items-center justify-center hover:bg-neutral-700 text-white transition-colors"
                                        >
                                            <Minus className="w-4 h-4" />
                                        </button>
                                        <span className="font-black w-8 text-center text-xl">{item.quantity}</span>
                                        <button 
                                            onClick={() => updateQuantity(storeSlug as string, item.product.id, 1)}
                                            className="w-10 h-10 rounded-lg bg-neutral-800/80 flex items-center justify-center hover:bg-white hover:text-black transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <p className="font-black text-2xl text-white hidden sm:block mt-auto text-right">
                                        R$ {(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>

                                <button 
                                    onClick={() => removeItem(storeSlug as string, item.product.id)}
                                    className="absolute top-4 right-4 p-2.5 bg-neutral-900/80 sm:bg-transparent border border-neutral-800 sm:border-transparent text-neutral-500 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 rounded-xl transition-all shadow-md sm:shadow-none"
                                    title="Remover Item"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Resumo e Checkout */}
                    <div className="bg-neutral-900/80 p-6 sm:p-8 rounded-3xl border border-neutral-800 shadow-2xl flex flex-col gap-6 backdrop-blur-md relative overflow-hidden group">
                        {/* Efeito Glow */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3 group-hover:bg-orange-500/20 transition-all duration-700"></div>

                        <div className="space-y-4 pb-6 border-b border-neutral-800/50 relative z-10">
                            <div className="flex justify-between items-center text-neutral-400">
                                <span className="text-lg">Subtotal ({totalItems} itens)</span>
                                <span className="font-medium text-white text-lg">R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                            <span className="text-xl text-neutral-300 font-bold uppercase tracking-widest">Total a pagar</span>
                            <span className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <button 
                            onClick={handleFinalizarCompra}
                            className="mt-4 w-full py-5 rounded-2xl font-extrabold text-xl transition-all flex items-center justify-center gap-3 bg-gradient-to-r from-yellow-400 via-orange-500 to-amber-100 text-black shadow-[0_0_30px_rgba(255,165,0,0.2)] hover:shadow-[0_0_40px_rgba(255,165,0,0.4)] hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group/btn"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-in-out skew-x-12"></div>
                            <CheckCircle2 className="w-7 h-7" />
                            Finalizar Pedido Agora
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
