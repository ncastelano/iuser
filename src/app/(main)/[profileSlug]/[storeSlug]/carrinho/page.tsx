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
    
    // Auth Inline States
    const [authMode, setAuthMode] = useState<'login' | 'register' | 'none'>('login')
    const [authEmail, setAuthEmail] = useState('')
    const [authPassword, setAuthPassword] = useState('')
    const [authName, setAuthName] = useState('')
    const [authProfileSlug, setAuthProfileSlug] = useState('')
    const [authLoading, setAuthLoading] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)

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

                // Load suggestions
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

    const handleInlineLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)

        const { data, error } = await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword,
        })

        if (error) {
            setAuthError(error.message)
            setAuthLoading(false)
            return
        }

        if (data.user) {
            const { data: profile } = await supabase.from('profiles').select('name, profileSlug').eq('id', data.user.id).single()
            setCurrentUserId(data.user.id)
            if (profile?.name) setBuyerName(profile.name)
            if (profile?.profileSlug) setCurrentUserSlug(profile.profileSlug)
        }
        setAuthLoading(false)
    }

    const handleInlineRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)

        if (!authProfileSlug || !/^[a-z0-9-]+$/.test(authProfileSlug)) {
            setAuthError('O link deve conter apenas letras, números e hifens.')
            setAuthLoading(false)
            return
        }

        const { data: authData, error: authErr } = await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
            options: { data: { name: authName } }
        })

        if (authErr) {
            setAuthError(authErr.message)
            setAuthLoading(false)
            return
        }

        if (authData.user) {
            await supabase.from('profiles').upsert({
                id: authData.user.id,
                name: authName,
                profileSlug: authProfileSlug
            })
            setCurrentUserId(authData.user.id)
            setBuyerName(authName)
            setCurrentUserSlug(authProfileSlug)
        }
        setAuthLoading(false)
    }

    const handleFinalizarCompra = async () => {
        if (!storeInfo || !storeSlug) return
        if (!ownerWhatsapp) {
            alert('Esta loja ainda não configurou o WhatsApp para vendas.')
            return
        }

        if (!currentUserId) {
            alert('Por favor, identifique-se abaixo para finalizar.')
            document.getElementById('checkout-auth-area')?.scrollIntoView({ behavior: 'smooth' })
            return
        }

        setCheckoutLoading(true)

        const finalBuyerName = buyerName || 'Cliente iUser'

        try {
            const { data: storeData } = await supabase
                .from('stores')
                .select('id, storeSlug')
                .ilike('storeSlug', storeSlug)
                .single()

            if (storeData) {
                const checkout_id = crypto.randomUUID()
                
                const { data: orderData } = await supabase
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

                if (orderData?.id) {
                    const itemsToInsert = cartItems.map(item => ({
                        order_id: orderData.id,
                        product_id: item.product.id,
                        product_name: item.product.name,
                        quantity: item.quantity,
                        unit_price: item.product.price,
                        total_price: item.product.price * item.quantity
                    }))
                    await supabase.from('order_items').insert(itemsToInsert)
                }

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

        setTimeout(() => {
            clearStoreCart(storeSlug)
        }, 1000)
    }

    if (!mounted) {
        return <div className="min-h-screen bg-background flex items-center justify-center text-foreground font-sans">Carregando Carrinho...</div>
    }

    return (
        <div className="relative w-full max-w-4xl mx-auto py-8 md:py-16 animate-fade-in text-foreground selection:bg-green-500 selection:text-white px-4 pb-32">
            {/* Header Compacto */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="w-12 h-12 flex items-center justify-center bg-secondary/50 border border-border rounded-none hover:bg-foreground hover:text-background transition-all duration-500 shadow-xl"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="space-y-0.5">
                        <h1 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-foreground">
                            Seu Carrinho<span className="text-green-500">.</span>
                        </h1>
                        {storeInfo && (
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground">Checkout em</span>
                                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-foreground">{storeInfo.name}</span>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="px-6 py-2 bg-secondary/50 border border-border rounded-none">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground">{totalItems} Itens</span>
                    </div>
                </div>
            </div>

            {cartItems.length === 0 ? (
                <div className="py-24 text-center rounded-none border border-dashed border-border bg-card/40 flex flex-col items-center justify-center gap-6">
                    <div className="w-20 h-20 bg-secondary rounded-none flex items-center justify-center border border-border">
                        <ShoppingCart className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">Vazio</h2>
                        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest opacity-60">Sua sacola está aguardando produtos.</p>
                    </div>
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="px-10 py-4 bg-foreground text-background font-black uppercase text-[10px] tracking-widest rounded-none hover:opacity-90 transition-all shadow-xl"
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
                                className="group relative bg-card/40 backdrop-blur-3xl border border-border rounded-none p-4 md:p-6 flex flex-col md:flex-row items-center gap-6 transition-all hover:bg-card/60 hover:border-green-500/30 shadow-lg"
                            >
                                <div className="w-28 h-28 md:w-32 md:h-32 bg-secondary rounded-none overflow-hidden border border-border flex-shrink-0 shadow-lg">
                                    {item.product.image_url ? (
                                        <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-3xl font-black italic">{item.product.name.charAt(0)}</div>
                                    )}
                                </div>

                                <div className="flex-1 space-y-4 text-center md:text-left">
                                    <div className="space-y-0.5">
                                        <h4 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter text-foreground line-clamp-2">{item.product.name}</h4>
                                        <div className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground">R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    </div>

                                    <div className="flex items-center justify-center md:justify-start gap-3">
                                        <div className="flex items-center bg-secondary border border-border p-0.5 rounded-none shadow-inner">
                                            <button
                                                onClick={() => updateQuantity(storeSlug as string, item.product.id, -1)}
                                                className="w-8 h-8 flex items-center justify-center rounded-none bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                            >
                                                <Minus className="w-3 h-3" />
                                            </button>
                                            <span className="w-8 text-center text-xs font-black italic">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(storeSlug as string, item.product.id, 1)}
                                                className="w-8 h-8 flex items-center justify-center rounded-none bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                            >
                                                <Plus className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeItem(storeSlug as string, item.product.id)}
                                            className="w-10 h-10 flex items-center justify-center rounded-none bg-destructive/5 text-destructive/50 hover:bg-destructive hover:text-white transition-all border border-destructive/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="text-center md:text-right">
                                    <div className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground mb-0.5">Subtotal</div>
                                    <div className="text-2xl font-black italic tracking-tighter text-foreground">
                                        R$ {(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary & Checkout Logic Area */}
                    <div id="checkout-auth-area" className="bg-card/60 backdrop-blur-3xl border border-border rounded-none p-8 md:p-10 space-y-8 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-green-500/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        <div className="flex flex-col md:flex-row items-center justify-between gap-8 border-b border-border pb-8">
                            <div className="space-y-0.5 text-center md:text-left">
                                <h3 className="text-[8px] font-black uppercase tracking-[0.5em] text-muted-foreground">Total Acumulado</h3>
                                <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest opacity-50">Exclusividade iUser</p>
                            </div>
                            <div className="text-4xl md:text-5xl font-black italic tracking-tighter text-foreground">
                                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        {!currentUserId ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                <div className="text-center space-y-1">
                                    <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Identificação</h4>
                                    <p className="text-[8px] text-muted-foreground uppercase tracking-wider">Acesse sua conta ou cadastre-se para finalizar</p>
                                </div>

                                <div className="flex bg-secondary/50 p-1 border border-border rounded-none">
                                    <button 
                                        onClick={() => setAuthMode('login')}
                                        className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${authMode === 'login' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground'}`}
                                    >
                                        Entrar
                                    </button>
                                    <button 
                                        onClick={() => setAuthMode('register')}
                                        className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${authMode === 'register' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground'}`}
                                    >
                                        Criar Conta
                                    </button>
                                </div>

                                {authError && (
                                    <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-[8px] font-black uppercase tracking-wider text-center">
                                        {authError}
                                    </div>
                                )}

                                {authMode === 'login' ? (
                                    <form onSubmit={handleInlineLogin} className="space-y-3">
                                        <input 
                                            type="email" 
                                            placeholder="seu@email.com"
                                            className="w-full bg-secondary/50 border border-border rounded-none px-4 py-3 text-xs focus:outline-none focus:border-green-500/50 transition-colors"
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            required
                                        />
                                        <input 
                                            type="password" 
                                            placeholder="sua senha"
                                            className="w-full bg-secondary/50 border border-border rounded-none px-4 py-3 text-xs focus:outline-none focus:border-green-500/50 transition-colors"
                                            value={authPassword}
                                            onChange={(e) => setAuthPassword(e.target.value)}
                                            required
                                        />
                                        <button 
                                            disabled={authLoading}
                                            className="w-full py-4 bg-foreground text-background font-black uppercase text-[10px] tracking-widest hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                                        >
                                            {authLoading ? 'Acessando...' : 'Acessar e Finalizar'}
                                        </button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleInlineRegister} className="space-y-3">
                                        <input 
                                            type="text" 
                                            placeholder="Nome Completo"
                                            className="w-full bg-secondary/50 border border-border rounded-none px-4 py-3 text-xs focus:outline-none focus:border-green-500/50 transition-colors"
                                            value={authName}
                                            onChange={(e) => setAuthName(e.target.value)}
                                            required
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="link-do-perfil (slug)"
                                            className="w-full bg-secondary/50 border border-border rounded-none px-4 py-3 text-xs focus:outline-none focus:border-green-500/50 transition-colors"
                                            value={authProfileSlug}
                                            onChange={(e) => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                            required
                                        />
                                        <input 
                                            type="email" 
                                            placeholder="seu@email.com"
                                            className="w-full bg-secondary/50 border border-border rounded-none px-4 py-3 text-xs focus:outline-none focus:border-green-500/50 transition-colors"
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            required
                                        />
                                        <input 
                                            type="password" 
                                            placeholder="Crie uma senha"
                                            className="w-full bg-secondary/50 border border-border rounded-none px-4 py-3 text-xs focus:outline-none focus:border-green-500/50 transition-colors"
                                            value={authPassword}
                                            onChange={(e) => setAuthPassword(e.target.value)}
                                            required
                                        />
                                        <button 
                                            disabled={authLoading}
                                            className="w-full py-4 bg-foreground text-background font-black uppercase text-[10px] tracking-widest hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                                        >
                                            {authLoading ? 'Cadastrando...' : 'Cadastrar e Finalizar'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4 animate-in fade-in duration-500">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Logado como @{currentUserSlug}</span>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            await supabase.auth.signOut()
                                            setCurrentUserId(null)
                                            setAuthMode('login')
                                        }}
                                        className="text-[7px] font-black uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        Sair
                                    </button>
                                </div>
                                <button
                                    onClick={handleFinalizarCompra}
                                    disabled={checkoutLoading}
                                    className="w-full py-5 bg-foreground text-background rounded-none font-black uppercase text-xs tracking-[0.4em] transition-all hover:bg-green-500 hover:text-white active:scale-[0.98] shadow-xl flex items-center justify-center gap-4 group/btn disabled:opacity-50"
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
                                <p className="text-center text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground">O pedido será enviado para o WhatsApp da loja.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sugestões Compactas */}
            {suggestions.length > 0 && (
                <div className="mt-16 space-y-6">
                    <div className="flex items-center gap-3">
                        <h3 className="text-[8px] font-black uppercase tracking-[0.5em] text-muted-foreground whitespace-nowrap">Sugestões</h3>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {suggestions.map((p) => (
                            <div key={p.id} className="bg-card/40 border border-border rounded-none p-3 group hover:border-green-500/30 transition-all">
                                <div className="aspect-square rounded-none overflow-hidden bg-secondary mb-3 border border-border/50">
                                    {p.image_url ? (
                                        <img
                                            src={supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl}
                                            alt={p.name}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-lg font-black italic">{p.name.charAt(0)}</div>
                                    )}
                                </div>
                                <h4 className="text-[10px] font-bold text-foreground truncate mb-0.5">{p.name}</h4>
                                <div className="flex items-center justify-between gap-1.5">
                                    <p className="text-xs font-black text-green-500 italic">R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    <button
                                        onClick={() => addItem(storeSlug as string, { name: storeInfo?.name || '', logo_url: storeInfo?.logo_url || null }, {
                                            id: p.id,
                                            name: p.name,
                                            price: p.price,
                                            image_url: p.image_url ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null
                                        })}
                                        className="w-7 h-7 rounded-none bg-foreground text-background flex items-center justify-center hover:bg-green-500 hover:text-white transition-all shadow-lg active:scale-90"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
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
