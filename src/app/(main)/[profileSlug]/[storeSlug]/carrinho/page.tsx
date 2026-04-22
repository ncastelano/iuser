'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ShoppingCart, Minus, Plus, Trash2, CheckCircle2, Eye, EyeOff, User, Link as LinkIcon, Mail, Lock } from 'lucide-react'
import { useCartStore } from '@/store/useCartStore'
import { createClient } from '@/lib/supabase/client'
import { formatCartMessage, getWhatsAppLink } from '@/lib/whatsapp'
import { useRef } from 'react'

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
    const [authConfirmPassword, setAuthConfirmPassword] = useState('')
    const [authName, setAuthName] = useState('')
    const [authProfileSlug, setAuthProfileSlug] = useState('')
    const [authLoading, setAuthLoading] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null)
    const slugTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

        if (authPassword !== authConfirmPassword) {
            setAuthError('As senhas não coincidem')
            setAuthLoading(false)
            return
        }

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

    // Debounced Slug Check
    useEffect(() => {
        if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current)
        
        if (authProfileSlug.length < 3) {
            setIsSlugAvailable(null)
            return
        }

        slugTimeoutRef.current = setTimeout(async () => {
            const { data } = await supabase
                .from('profiles')
                .select('profileSlug')
                .eq('profileSlug', authProfileSlug)
                .single()
            setIsSlugAvailable(!data)
        }, 500)
    }, [authProfileSlug, supabase])

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
        <div className="relative w-full max-w-4xl mx-auto py-6 px-4 pb-32 animate-fade-in text-foreground selection:bg-green-500 selection:text-white">
            {/* Header Compacto */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-border pb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="w-10 h-10 flex items-center justify-center bg-secondary/50 border border-border hover:bg-foreground hover:text-background transition-all duration-500"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter text-foreground">
                            Carrinho<span className="text-green-500">.</span>
                        </h1>
                        {storeInfo && (
                            <p className="text-[7px] font-black uppercase tracking-wider text-muted-foreground mt-0.5">
                                {storeInfo.name}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 border border-border">
                    <ShoppingCart className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">{totalItems} itens</span>
                </div>
            </div>

            {cartItems.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-border bg-card/40 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 bg-secondary flex items-center justify-center border border-border">
                        <ShoppingCart className="w-6 h-6 text-muted-foreground/30" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black italic uppercase tracking-tighter text-foreground">Vazio</h2>
                        <p className="text-muted-foreground text-[8px] font-bold uppercase tracking-wider opacity-60 mt-1">
                            Sua sacola está aguardando produtos.
                        </p>
                    </div>
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="px-6 py-3 bg-foreground text-background font-black uppercase text-[9px] tracking-wider hover:bg-green-500 hover:text-white transition-all shadow-lg"
                    >
                        Voltar para a Vitrine
                    </button>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Items List - Compacto */}
                    <div className="space-y-3">
                        {cartItems.map((item) => (
                            <div
                                key={item.product.id}
                                className="flex gap-4 border border-border p-3 hover:border-green-500/30 transition-all bg-card/20"
                            >
                                <div className="w-16 h-16 bg-secondary border border-border flex-shrink-0">
                                    {item.product.image_url ? (
                                        <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-lg font-black italic">
                                            {item.product.name.charAt(0)}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-black italic uppercase tracking-tighter text-foreground truncate">
                                        {item.product.name}
                                    </h4>
                                    <p className="text-[9px] font-black text-green-500 mt-0.5">
                                        R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>

                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="flex items-center bg-secondary border border-border">
                                            <button
                                                onClick={() => updateQuantity(storeSlug as string, item.product.id, -1)}
                                                className="w-6 h-6 flex items-center justify-center bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                            >
                                                <Minus className="w-2.5 h-2.5" />
                                            </button>
                                            <span className="w-6 text-center text-[10px] font-black italic">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(storeSlug as string, item.product.id, 1)}
                                                className="w-6 h-6 flex items-center justify-center bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                            >
                                                <Plus className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeItem(storeSlug as string, item.product.id)}
                                            className="w-7 h-7 flex items-center justify-center bg-destructive/5 text-destructive/50 hover:bg-destructive hover:text-white transition-all border border-destructive/10"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="text-right flex-shrink-0">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Subtotal</p>
                                    <p className="text-base font-black italic tracking-tighter text-foreground">
                                        R$ {(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary & Checkout - Compacto sem card */}
                    <div id="checkout-auth-area" className="border-t border-b border-border py-6 space-y-6">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <p className="text-[7px] font-black uppercase tracking-wider text-muted-foreground">Total</p>
                                <p className="text-2xl sm:text-3xl font-black italic tracking-tighter text-foreground">
                                    R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>

                            {!currentUserId ? (
                                <button
                                    onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })}
                                    className="px-6 py-3 bg-foreground text-background font-black uppercase text-[9px] tracking-wider hover:bg-green-500 hover:text-white transition-all"
                                >
                                    Identificar para Finalizar
                                </button>
                            ) : (
                                <button
                                    onClick={handleFinalizarCompra}
                                    disabled={checkoutLoading}
                                    className="px-6 py-3 bg-foreground text-background font-black uppercase text-[9px] tracking-wider hover:bg-green-500 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {checkoutLoading ? (
                                        <div className="w-3.5 h-3.5 border-2 border-background/20 border-t-background rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Finalizar via WhatsApp
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Auth Section - Compacto */}
                        {!currentUserId && (
                            <div id="auth-section" className="space-y-4 pt-4 border-t border-border">
                                <div className="flex bg-secondary/50 p-0.5 border border-border">
                                    <button
                                        onClick={() => setAuthMode('login')}
                                        className={`flex-1 py-2 text-[8px] font-black uppercase tracking-wider transition-all ${authMode === 'login' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
                                    >
                                        Entrar
                                    </button>
                                    <button
                                        onClick={() => setAuthMode('register')}
                                        className={`flex-1 py-2 text-[8px] font-black uppercase tracking-wider transition-all ${authMode === 'register' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
                                    >
                                        Criar Conta
                                    </button>
                                </div>

                                {authError && (
                                    <div className="p-2 bg-destructive/10 border border-destructive/20 text-destructive text-[7px] font-black uppercase tracking-wider text-center">
                                        {authError}
                                    </div>
                                )}

                                {authMode === 'login' ? (
                                    <form onSubmit={handleInlineLogin} className="space-y-3">
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                            <input
                                                type="email"
                                                placeholder="seu@email.com"
                                                className="w-full bg-secondary/50 border border-border px-11 py-3 text-xs focus:outline-none focus:border-green-500/50"
                                                value={authEmail}
                                                onChange={(e) => setAuthEmail(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="sua senha"
                                                className="w-full bg-secondary/50 border border-border px-11 py-3 text-xs focus:outline-none focus:border-green-500/50"
                                                value={authPassword}
                                                onChange={(e) => setAuthPassword(e.target.value)}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <button
                                            disabled={authLoading}
                                            className="w-full py-4 bg-foreground text-background font-black uppercase text-[10px] tracking-widest hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                                        >
                                            {authLoading ? 'Acessando...' : 'Acessar e Finalizar'}
                                        </button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleInlineRegister} className="space-y-3">
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                            <input
                                                type="text"
                                                placeholder="Nome Completo"
                                                className="w-full bg-secondary/50 border border-border px-11 py-3 text-xs focus:outline-none focus:border-green-500/50"
                                                value={authName}
                                                onChange={(e) => setAuthName(e.target.value)}
                                                required
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="relative">
                                                <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                                <div className="flex items-center bg-secondary/50 border border-border focus-within:border-green-500/50">
                                                    <span className="pl-11 pr-1 text-[8px] font-black text-muted-foreground uppercase tracking-widest hidden sm:inline">iuser.com.br/</span>
                                                    <input
                                                        type="text"
                                                        placeholder="link-do-perfil"
                                                        className="w-full py-3 pl-11 sm:pl-0 pr-4 bg-transparent text-xs outline-none placeholder:text-muted-foreground/30"
                                                        value={authProfileSlug}
                                                        onChange={(e) => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                        required
                                                    />
                                                    {isSlugAvailable !== null && (
                                                        <div className={`pr-4 ${isSlugAvailable ? 'text-green-500' : 'text-red-500'}`}>
                                                            {isSlugAvailable ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-[7px] font-black uppercase">Indisponível</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                            <input
                                                type="email"
                                                placeholder="seu@email.com"
                                                className="w-full bg-secondary/50 border border-border px-11 py-3 text-xs focus:outline-none focus:border-green-500/50"
                                                value={authEmail}
                                                onChange={(e) => setAuthEmail(e.target.value)}
                                                required
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="relative">
                                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    placeholder="Senha"
                                                    className="w-full bg-secondary/50 border border-border px-11 py-3 text-xs focus:outline-none focus:border-green-500/50"
                                                    value={authPassword}
                                                    onChange={(e) => setAuthPassword(e.target.value)}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all"
                                                >
                                                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    placeholder="Confirmar"
                                                    className="w-full bg-secondary/50 border border-border px-11 py-3 text-xs focus:outline-none focus:border-green-500/50"
                                                    value={authConfirmPassword}
                                                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <button
                                            disabled={authLoading || isSlugAvailable === false}
                                            className="w-full py-4 bg-foreground text-background font-black uppercase text-[10px] tracking-widest hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                                        >
                                            {authLoading ? 'Cadastrando...' : 'Cadastrar e Finalizar'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}

                        {currentUserId && (
                            <div className="flex items-center justify-between pt-2 border-t border-border">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-green-500" />
                                    <span className="text-[7px] font-black uppercase tracking-wider text-muted-foreground">@{currentUserSlug}</span>
                                </div>
                                <button
                                    onClick={async () => {
                                        await supabase.auth.signOut()
                                        setCurrentUserId(null)
                                        setAuthMode('login')
                                    }}
                                    className="text-[7px] font-black uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
                                >
                                    Sair
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sugestões Compactas */}
            {suggestions.length > 0 && (
                <div className="mt-12 space-y-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-[7px] font-black uppercase tracking-wider text-muted-foreground">Sugestões</h3>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {suggestions.map((p) => (
                            <div key={p.id} className="border border-border p-2 hover:border-green-500/30 transition-all bg-card/20">
                                <div className="aspect-square overflow-hidden bg-secondary border border-border/50 mb-2">
                                    {p.image_url ? (
                                        <img
                                            src={supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl}
                                            alt={p.name}
                                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-lg font-black italic">
                                            {p.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <h4 className="text-[9px] font-bold text-foreground truncate">{p.name}</h4>
                                <div className="flex items-center justify-between gap-1 mt-1">
                                    <p className="text-[10px] font-black text-green-500 italic">R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    <button
                                        onClick={() => addItem(storeSlug as string, { name: storeInfo?.name || '', logo_url: storeInfo?.logo_url || null }, {
                                            id: p.id,
                                            name: p.name,
                                            price: p.price,
                                            image_url: p.image_url ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl : null
                                        })}
                                        className="w-6 h-6 bg-foreground text-background flex items-center justify-center hover:bg-green-500 hover:text-white transition-all"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}