'use client'

import { useCartStore } from '@/store/useCartStore'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Store, ChevronRight, Trash2, ArrowLeft, CheckCircle2, Minus, Plus, Eye, EyeOff, User, Link as LinkIcon, Mail, Lock } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TodosCarrinhosPage() {
    const { itemsByStore, storeDetails, updateQuantity, removeItem, clearStoreCart } = useCartStore()
    const router = useRouter()
    const supabase = createClient()
    const [mounted, setMounted] = useState(false)

    // Auth & Checkout States
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [checkoutLoading, setCheckoutLoading] = useState(false)
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

    useEffect(() => {
        setMounted(true)
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setCurrentUserId(user.id)
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('slug')
                    .eq('id', user.id)
                    .single()
                if (profile) setCurrentUserSlug(profile.slug)
            }
        }
        checkUser()
    }, [])




    const handleInlineLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)

        const { data, error } = await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword
        })

        if (error) {
            setAuthError('Email ou senha inválidos')
            setAuthLoading(false)
            return
        }

        if (data.user) {
            setCurrentUserId(data.user.id)
            const { data: profile } = await supabase
                .from('profiles')
                .select('slug')
                .eq('id', data.user.id)
                .single()
            if (profile) setCurrentUserSlug(profile.slug)
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
            setAuthError('O link do perfil deve conter apenas letras, números e hifens')
            setAuthLoading(false)
            return
        }

        // Check if slug exists
        const { data: slugCheck } = await supabase
            .from('profiles')
            .select('slug')
            .eq('slug', authProfileSlug)
            .single()

        if (slugCheck) {
            setAuthError('Este link de perfil já está em uso')
            setAuthLoading(false)
            return
        }

        const { data, error } = await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
            options: {
                data: {
                    full_name: authName,
                    slug: authProfileSlug
                }
            }
        })

        if (error) {
            setAuthError(error.message)
            setAuthLoading(false)
            return
        }

        if (data.user) {
            // Criar perfil
            await supabase.from('profiles').upsert({
                id: data.user.id,
                name: authName,
                slug: authProfileSlug
            })
            setCurrentUserId(data.user.id)
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
                .select('slug')
                .eq('slug', authProfileSlug)
                .single()
            setIsSlugAvailable(!data)
        }, 500)
    }, [authProfileSlug])

    if (!mounted) return null

    const storeSlugs = Object.keys(itemsByStore)
    const totalGlobalPrice = Object.values(itemsByStore).reduce(
        (acc, items) => acc + items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0),
        0
    )

    const handleFinalizarTudo = async () => {
        if (!currentUserId) return
        setCheckoutLoading(true)

        try {
            // Process orders for each store
            for (const slug of storeSlugs) {
                const items = itemsByStore[slug]
                const details = storeDetails[slug]
                const totalPrice = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

                // 1. Get store ID
                const { data: storeData } = await supabase
                    .from('stores')
                    .select('id, owner_id, whatsapp')
                    .eq('slug', slug)
                    .single()

                if (storeData) {
                    const checkout_id = crypto.randomUUID()
                    
                    // 2. Create Order
                    const { data: orderData } = await supabase
                        .from('orders')
                        .insert({
                            store_id: storeData.id,
                            customer_id: currentUserId,
                            total_price: totalPrice,
                            status: 'pending',
                            checkout_id
                        })
                        .select()
                        .single()

                    if (orderData) {
                        // 3. Create Items
                        await supabase.from('order_items').insert(
                            items.map(item => ({
                                order_id: orderData.id,
                                product_id: item.product.id,
                                quantity: item.quantity,
                                price_at_time: item.product.price
                            }))
                        )

                        // 4. Update sales stats
                        const { data: stats } = await supabase
                            .from('store_sales')
                            .select('total_orders, total_revenue')
                            .eq('store_id', storeData.id)
                            .single()

                        await supabase
                            .from('store_sales')
                            .upsert({
                                store_id: storeData.id,
                                total_orders: (stats?.total_orders || 0) + 1,
                                total_revenue: (stats?.total_revenue || 0) + totalPrice,
                                last_sale_at: new Date().toISOString()
                            })
                    }
                }
            }

            // If multiple stores, it's hard to redirect to all.
            // For now, if one store, redirect to WhatsApp. 
            // If multiple, show a summary page or just redirect to the first one.
            if (storeSlugs.length === 1) {
                const slug = storeSlugs[0]
                const items = itemsByStore[slug]
                const details = storeDetails[slug]
                const totalPrice = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)
                
                const { data: storeData } = await supabase
                    .from('stores')
                    .select('whatsapp')
                    .eq('slug', slug)
                    .single()

                let whatsapp = storeData?.whatsapp
                if (!whatsapp) {
                    const { data: owner } = await supabase.from('profiles').select('whatsapp').eq('id', (await supabase.from('stores').select('owner_id').eq('slug', slug).single()).data?.owner_id).single()
                    whatsapp = owner?.whatsapp
                }

                if (whatsapp) {
                    const message = encodeURIComponent(
                        `*Novo Pedido - iUser*\n\n` +
                        `*Cliente:* @${currentUserSlug}\n` +
                        `*Itens:*\n${items.map(i => `- ${i.quantity}x ${i.product.name} (R$ ${i.product.price.toFixed(2)})`).join('\n')}\n\n` +
                        `*Total: R$ ${totalPrice.toFixed(2)}*`
                    )
                    window.location.href = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${message}`
                }
            } else {
                // Multi-store case: clear carts and show success
                storeSlugs.forEach(s => clearStoreCart(s))
                alert('Pedidos realizados com sucesso para todas as lojas!')
                router.push('/')
            }

        } catch (err) {
            console.error(err)
        } finally {
            setCheckoutLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-green-500 selection:text-white pb-40">
            <div className="max-w-3xl mx-auto px-4 py-8">
                <header className="flex items-center gap-4 mb-10 border-b border-border pb-6">
                    <button
                        onClick={() => router.back()}
                        className="w-10 h-10 flex items-center justify-center bg-secondary/50 border border-border hover:bg-foreground hover:text-background transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-black tracking-tighter italic uppercase text-foreground leading-none">
                            Checkout<span className="text-green-500">.</span>
                        </h1>
                        <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                            Finalize suas compras de forma rápida
                        </p>
                    </div>
                </header>

                {storeSlugs.length === 0 ? (
                    <div className="py-20 text-center border border-dashed border-border bg-card/20">
                        <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                        <h2 className="text-xl font-black italic uppercase tracking-tighter text-foreground">Carrinho Vazio</h2>
                        <p className="text-muted-foreground text-[8px] font-bold uppercase tracking-wider opacity-60 mt-1">
                            Você não possui itens para finalizar.
                        </p>
                        <Link
                            href="/"
                            className="inline-block mt-8 px-8 py-3 bg-foreground text-background font-black uppercase text-[9px] tracking-widest hover:bg-green-500 hover:text-white transition-all"
                        >
                            Ver Vitrine
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-10">
                        {/* Unified Item List */}
                        <div className="space-y-8">
                            {storeSlugs.map((slug) => {
                                const details = storeDetails[slug]
                                const items = itemsByStore[slug]
                                return (
                                    <div key={slug} className="space-y-3">
                                        <div className="flex items-center gap-2 border-l-2 border-green-500 pl-3">
                                            <span className="text-[7px] font-black uppercase tracking-widest text-muted-foreground">Loja</span>
                                            <span className="text-[8px] font-black uppercase tracking-widest text-foreground">{details?.name || slug}</span>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            {items.map((item) => (
                                                <div key={item.product.id} className="flex gap-4 border border-border p-3 bg-card/20 group hover:border-green-500/30 transition-all">
                                                    <div className="w-16 h-16 bg-secondary border border-border flex-shrink-0">
                                                        {item.product.image_url ? (
                                                            <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-lg font-black italic">
                                                                {item.product.name.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-black italic uppercase tracking-tighter text-foreground truncate">{item.product.name}</h4>
                                                        <p className="text-[9px] font-black text-green-500 mt-0.5">R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                        
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <div className="flex items-center bg-secondary border border-border">
                                                                <button
                                                                    onClick={() => updateQuantity(slug, item.product.id, -1)}
                                                                    className="w-6 h-6 flex items-center justify-center bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                                                >
                                                                    <Minus className="w-2.5 h-2.5" />
                                                                </button>
                                                                <span className="w-6 text-center text-[10px] font-black italic">{item.quantity}</span>
                                                                <button
                                                                    onClick={() => updateQuantity(slug, item.product.id, 1)}
                                                                    className="w-6 h-6 flex items-center justify-center bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                                                >
                                                                    <Plus className="w-2.5 h-2.5" />
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={() => removeItem(slug, item.product.id)}
                                                                className="w-7 h-7 flex items-center justify-center bg-destructive/5 text-destructive/50 hover:bg-destructive hover:text-white transition-all border border-destructive/10"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-base font-black italic tracking-tighter text-foreground">
                                                            R$ {(item.product.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Summary & Auth Section */}
                        <div className="border-t border-border pt-8 space-y-8">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div>
                                    <p className="text-[7px] font-black uppercase tracking-wider text-muted-foreground">Total do Pedido</p>
                                    <p className="text-3xl sm:text-5xl font-black italic tracking-tighter text-foreground">
                                        R$ {totalGlobalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>

                                {currentUserId ? (
                                    <button
                                        onClick={handleFinalizarTudo}
                                        disabled={checkoutLoading}
                                        className="w-full sm:w-auto px-10 py-4 bg-foreground text-background font-black uppercase text-[10px] tracking-[0.2em] hover:bg-green-500 hover:text-white transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {checkoutLoading ? (
                                            <div className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-4 h-4" />
                                                Finalizar Pedido
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })}
                                        className="w-full sm:w-auto px-10 py-4 bg-foreground text-background font-black uppercase text-[10px] tracking-[0.2em] hover:bg-green-500 hover:text-white transition-all"
                                    >
                                        Identificar para Finalizar
                                    </button>
                                )}
                            </div>

                            {!currentUserId && (
                                <div id="auth-section" className="space-y-6 pt-8 border-t border-border animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="text-center space-y-1">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Identificação Necessária</h4>
                                        <p className="text-[8px] text-muted-foreground uppercase tracking-wider">Acesse sua conta ou cadastre-se para concluir</p>
                                    </div>

                                    <div className="flex bg-secondary/50 p-0.5 border border-border">
                                        <button
                                            onClick={() => setAuthMode('login')}
                                            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-wider transition-all ${authMode === 'login' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground'}`}
                                        >
                                            Entrar
                                        </button>
                                        <button
                                            onClick={() => setAuthMode('register')}
                                            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-wider transition-all ${authMode === 'register' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground'}`}
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
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                                <input
                                                    type="email"
                                                    placeholder="seu@email.com"
                                                    className="w-full bg-secondary/50 border border-border px-11 py-3 text-sm focus:outline-none focus:border-green-500/50"
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
                                                    className="w-full bg-secondary/50 border border-border px-11 py-3 text-sm focus:outline-none focus:border-green-500/50"
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
                                                    className="w-full bg-secondary/50 border border-border px-11 py-3 text-sm focus:outline-none focus:border-green-500/50"
                                                    value={authName}
                                                    onChange={(e) => setAuthName(e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="relative">
                                                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                                    <div className="flex items-center bg-secondary/50 border border-border focus-within:border-green-500/50">
                                                        <span className="pl-11 pr-1 text-[9px] font-black text-muted-foreground uppercase tracking-widest hidden sm:inline">iuser.com.br/</span>
                                                        <input
                                                            type="text"
                                                            placeholder="link-do-perfil"
                                                            className="w-full py-3 pl-11 sm:pl-0 pr-4 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30"
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
                                                    className="w-full bg-secondary/50 border border-border px-11 py-3 text-sm focus:outline-none focus:border-green-500/50"
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
                                                        className="w-full bg-secondary/50 border border-border px-11 py-3 text-sm focus:outline-none focus:border-green-500/50"
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
                                                        className="w-full bg-secondary/50 border border-border px-11 py-3 text-sm focus:outline-none focus:border-green-500/50"
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
                                <div className="flex items-center justify-between pt-4 border-t border-border">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-green-500" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">@{currentUserSlug}</span>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            await supabase.auth.signOut()
                                            setCurrentUserId(null)
                                            setAuthMode('login')
                                        }}
                                        className="text-[8px] font-black uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        Sair
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}