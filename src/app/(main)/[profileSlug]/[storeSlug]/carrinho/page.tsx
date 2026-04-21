'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ShoppingCart, Minus, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import { createClient } from '@/lib/supabase/client'
import { formatCartMessage, getWhatsAppLink } from '@/lib/whatsapp'

export default function CarrinhoPage() {
    const params = useParams()
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug

    const { itemsByStore, updateQuantity, removeItem, storeDetails, clearStoreCart, addItem } = useCartStore()
    const [mounted, setMounted] = useState(false)
    const [ownerWhatsapp, setOwnerWhatsapp] = useState<string | null>(null)
    const [buyerName, setBuyerName] = useState<string>('')
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<any[]>([])

    useEffect(() => { setMounted(true) }, [])

    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const storeInfo = typeof storeSlug === 'string' ? storeDetails[storeSlug] : null

    const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0)
    const totalPrice = cartItems.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

    const storeUrl = useMemo(() => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${profileSlug}/${storeSlug}`
    }, [profileSlug, storeSlug])

    useEffect(() => {
        const loadInfo = async () => {
            if (!storeSlug) return

            // 1. Fetch store owner to get WhatsApp
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, owner_id, whatsapp')
                .ilike('storeSlug', storeSlug)
                .single()

            if (storeData) {
                if (storeData.whatsapp) {
                    setOwnerWhatsapp(storeData.whatsapp)
                } else if (storeData.owner_id) {
                    const { data: profileData } = await supabase
                        .from('profiles')
                        .select('whatsapp')
                        .eq('id', storeData.owner_id)
                        .single()
                    
                    if (profileData?.whatsapp) setOwnerWhatsapp(profileData.whatsapp)
                }

                // Load suggestions (products from same store not in cart)
                const { data: productsData } = await supabase
                    .from('products')
                    .select('*')
                    .eq('store_id', storeData.id)
                    .limit(10)
                
                if (productsData) {
                    const inCartIds = new Set(cartItems.map(item => item.product.id))
                    setSuggestions(productsData.filter(p => !inCartIds.has(p.id)).slice(0, 4))
                }
            }

            // 2. Fetch current user info
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setCurrentUserId(user.id)
                const { data: userProfile } = await supabase
                    .from('profiles')
                    .select('name, profileSlug')
                    .eq('id', user.id)
                    .single()
                if (userProfile?.name) setBuyerName(userProfile.name)
                if (userProfile?.profileSlug) setCurrentUserSlug(userProfile.profileSlug)
            }
        }

        loadInfo()
    }, [storeSlug, supabase, cartItems.length])

    const handleFinalizarCompra = async () => {
        if (!storeInfo || !storeSlug) return
        if (!ownerWhatsapp) {
            alert('Esta loja ainda não configurou o WhatsApp para vendas.')
            return
        }

        setCheckoutLoading(true)
        
        const finalBuyerName = buyerName || 'Cliente iUser'

        // Record the sales in database
        try {
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, storeSlug')
                .ilike('storeSlug', storeSlug)
                .single()

            if (storeData) {
                const checkout_id = crypto.randomUUID()
                
                // 1. Inserir o Pedido (Header) na nova tabela 'orders'
                const { data: orderData, error: orderError } = await supabase
                    .from('orders')
                    .insert({
                        store_id: storeData.id,
                        buyer_id: currentUserId,
                        buyer_name: finalBuyerName,
                        buyer_profile_slug: currentUserSlug || 'anonimo',
                        status: 'pending',
                        total_amount: totalPrice,
                        checkout_id: checkout_id
                    })
                    .select()
                    .single()

                if (orderError) {
                    console.error('[Cart Checkout] Erro ao criar pedido:', orderError.message, orderError.details)
                }

                // 2. Inserir Itens do Pedido (Details) - Apenas se o pedido foi criado
                if (orderData?.id) {
                    const itemsToInsert = cartItems.map(item => ({
                        order_id: orderData.id,
                        product_id: item.product.id,
                        product_name: item.product.name,
                        quantity: item.quantity,
                        unit_price: item.product.price,
                        total_price: item.product.price * item.quantity
                    }))

                    const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert)
                    if (itemsError) console.error('[Cart Checkout] Erro ao inserir itens:', itemsError.message, itemsError.details)
                }

                // 3. Manter store_sales por enquanto para retrocompatibilidade do financeiro atual
                const salesToInsert = cartItems.map(item => ({
                    store_id: storeData.id,
                    checkout_id: checkout_id,
                    buyer_id: currentUserId,
                    buyer_name: finalBuyerName,
                    buyer_profile_slug: currentUserSlug || 'anonimo',
                    store_slug: storeData.storeSlug,
                    product_id: item.product.id,
                    product_name: item.product.name,
                    price: item.product.price * item.quantity,
                    quantity: item.quantity,
                    status: 'pending',
                    created_at: new Date().toISOString()
                }))

                await supabase.from('store_sales').insert(salesToInsert)
            }
        } catch (e) {
            console.error('[Cart Checkout] Erro ao registrar vendas:', e)
        }

        const message = formatCartMessage({
            storeName: storeInfo.name,
            items: cartItems,
            totalPrice: totalPrice,
            buyerName: finalBuyerName,
            storeUrl: storeUrl
        })

        const link = getWhatsAppLink(ownerWhatsapp, message)
        
        setCheckoutLoading(false)
        window.open(link, '_blank')
        
        // Limpar o carrinho após finalizar
        setTimeout(() => {
            clearStoreCart(storeSlug)
        }, 1000)
    }

    if (!mounted) {
        return <div className="min-h-screen bg-background flex items-center justify-center text-foreground font-sans">Carregando Carrinho...</div>
    }

    return (
        <div className="relative w-full max-w-3xl mx-auto py-4 md:py-8 animate-fade-in text-foreground selection:bg-green-500 selection:text-white px-4 pb-32">
            {/* Header Compacto */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="w-10 h-10 flex items-center justify-center bg-secondary/50 border border-border rounded-xl hover:bg-foreground hover:text-background transition-all duration-300"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="space-y-0.5">
                        <h1 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-foreground">
                            Carrinho<span className="text-green-500">.</span>
                        </h1>
                        {storeInfo && (
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">{storeInfo.name}</span>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="px-4 py-2 bg-secondary/50 border border-border rounded-full">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">{totalItems} Itens</span>
                    </div>
                </div>
            </div>

            {cartItems.length === 0 ? (
                <div className="py-32 text-center rounded-[48px] border border-dashed border-border bg-card/40 flex flex-col items-center justify-center gap-8">
                    <div className="w-24 h-24 bg-secondary rounded-[32px] flex items-center justify-center border border-border">
                        <ShoppingCart className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-foreground">Carrinho Vazio</h2>
                        <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest opacity-60">Sua sacola de alta performance está aguardando produtos.</p>
                    </div>
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="px-12 py-5 bg-foreground text-background font-black uppercase text-xs tracking-widest rounded-full hover:opacity-90 transition-all shadow-2xl"
                    >
                        Voltar para a Vitrine
                    </button>
                </div>
            ) : (
                <>
                    {/* Items List - Compacto */}
                    <div className="space-y-3">
                        {cartItems.map((item) => (
                            <div
                                key={item.product.id}
                                className="group relative bg-card/40 backdrop-blur-3xl border border-border rounded-2xl p-3 flex items-center gap-4 transition-all hover:bg-card/60 hover:border-green-500/30 shadow-sm"
                            >
                                <div className="w-20 h-20 bg-secondary rounded-xl overflow-hidden border border-border flex-shrink-0">
                                    {item.product.image_url ? (
                                        <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-xl font-black italic">{item.product.name.charAt(0)}</div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="space-y-0.5">
                                        <h4 className="text-sm font-black italic uppercase tracking-tighter text-foreground truncate">{item.product.name}</h4>
                                        <div className="text-[7px] font-black uppercase tracking-widest text-muted-foreground">R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    </div>

                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="flex items-center bg-secondary border border-border p-0.5 rounded-lg">
                                            <button
                                                onClick={() => updateQuantity(storeSlug as string, item.product.id, -1)}
                                                className="w-6 h-6 flex items-center justify-center rounded-md bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                            >
                                                <Minus className="w-2.5 h-2.5" />
                                            </button>
                                            <span className="w-6 text-center text-[10px] font-black italic">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(storeSlug as string, item.product.id, 1)}
                                                className="w-6 h-6 flex items-center justify-center rounded-md bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                            >
                                                <Plus className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeItem(storeSlug as string, item.product.id)}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-destructive/5 text-destructive/50 hover:bg-destructive hover:text-white transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="text-right flex-shrink-0">
                                     <div className="text-[7px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Subtotal</div>
                                     <div className="text-lg font-black italic tracking-tighter text-foreground">
                                        R$ {(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                     </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Card - Compacto */}
                    <div className="bg-card/60 backdrop-blur-3xl border border-border rounded-3xl p-6 md:p-8 space-y-6 shadow-xl relative overflow-hidden">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-border pb-6">
                            <div className="space-y-0.5 text-center md:text-left">
                                <h3 className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground">Total do Pedido</h3>
                                <p className="text-[7px] text-muted-foreground font-bold uppercase tracking-widest opacity-50">Checkout seguro via iUser</p>
                            </div>
                            <div className="text-3xl md:text-5xl font-black italic tracking-tighter text-foreground">
                                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleFinalizarCompra}
                                disabled={checkoutLoading}
                                className="w-full py-5 bg-foreground text-background rounded-2xl font-black uppercase text-xs tracking-[0.3em] transition-all hover:bg-green-500 hover:text-white active:scale-[0.98] shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {checkoutLoading ? (
                                    <div className="w-5 h-5 border-2 border-background/20 border-t-background rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-5 h-5" />
                                        Finalizar via WhatsApp
                                    </>
                                )}
                            </button>
                            <p className="text-center text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground">O pedido será enviado para o WhatsApp da loja.</p>
                        </div>
                    </div>
                </>
            )}

            {/* Suggested Items */}
            {suggestions.length > 0 && (
                <div className="mt-24 space-y-8">
                    <div className="flex items-center gap-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-muted-foreground whitespace-nowrap">Sugestões para você</h3>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {suggestions.map((p) => (
                            <div key={p.id} className="bg-card/40 border border-border rounded-[32px] p-4 group hover:border-green-500/30 transition-all">
                                <div className="aspect-square rounded-2xl overflow-hidden bg-secondary mb-4 border border-border/50">
                                    {p.image_url ? (
                                        <img 
                                            src={supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl} 
                                            alt={p.name} 
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-xl font-black italic">{p.name.charAt(0)}</div>
                                    )}
                                </div>
                                <h4 className="text-xs font-bold text-foreground truncate mb-1">{p.name}</h4>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-black text-green-500 italic">R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    <button 
                                        onClick={() => addItem(storeSlug as string, { name: storeInfo?.name || '', logo_url: storeInfo?.logo_url || null }, {
                                            id: p.id,
                                            name: p.name,
                                            price: p.price,
                                            image_url: p.image_url ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null
                                        })}
                                        className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-green-500 hover:text-white transition-all shadow-lg active:scale-90"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="pb-32" />
        </div>
    )
}
