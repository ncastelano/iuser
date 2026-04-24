'use client'

import { useCartStore } from '@/store/useCartStore'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Store, ChevronRight, Trash2, ArrowLeft, CheckCircle2, Minus, Plus, Eye, EyeOff, User, Link as LinkIcon, Mail, Lock, Package } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Sacola() {
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
    const [finishedOrders, setFinishedOrders] = useState<any[]>([])

    const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)
    const [myPurchases, setMyPurchases] = useState<any[]>([])

    const loadUserData = async (userId: string) => {
        setCurrentUserId(userId)

        const { data: profile } = await supabase
            .from('profiles')
            .select('profileSlug, avatar_url, name')
            .eq('id', userId)
            .single()

        if (profile) {
            setCurrentUserSlug(profile.profileSlug)
            setCurrentUserAvatar(profile.avatar_url)
            setCurrentUserName(profile.name)
        }

        const { data: purchaseDataLegacy } = await supabase
            .from('store_sales')
            .select('*, stores(name)')
            .eq('buyer_id', userId)
            .order('created_at', { ascending: false })

        const { data: purchaseDataNew } = await supabase
            .from('orders')
            .select('*, order_items(*), stores(name)')
            .eq('buyer_id', userId)
            .order('created_at', { ascending: false })

        let allPurchases: any[] = []

        if (purchaseDataLegacy) {
            allPurchases = [...allPurchases, ...purchaseDataLegacy.map((p: any) => ({
                ...p,
                store_name: p.stores?.name || 'Loja'
            }))]
        }

        if (purchaseDataNew) {
            const mappedNew = purchaseDataNew.flatMap((o: any) => o.order_items.map((i: any) => ({
                id: i.id,
                product_id: i.product_id,
                product_name: i.product_name,
                quantity: i.quantity,
                price: i.total_price,
                created_at: o.created_at,
                status: o.status,
                checkout_id: o.checkout_id,
                buyer_id: o.buyer_id,
                buyer_name: o.buyer_name,
                buyer_profile_slug: o.buyer_profile_slug,
                store_id: o.store_id,
                store_name: o.stores?.name || 'Loja'
            })))
            allPurchases = [...allPurchases, ...mappedNew]
        }

        const uniquePurchases = Array.from(new Map(allPurchases.map(item => [item.id, item])).values())
        setMyPurchases([...uniquePurchases])
    }

    useEffect(() => {
        setMounted(true)
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                await loadUserData(user.id)
            }
        }
        checkUser()
    }, [supabase])

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
            await loadUserData(data.user.id)
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

        const { data: slugCheck } = await supabase
            .from('profiles')
            .select('profileSlug')
            .eq('profileSlug', authProfileSlug)
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
            await supabase.from('profiles').upsert({
                id: data.user.id,
                name: authName,
                profileSlug: authProfileSlug
            })
            await loadUserData(data.user.id)
        }
        setAuthLoading(false)
    }

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
    }, [authProfileSlug])

    useEffect(() => {
        if (finishedOrders.length === 0) return

        const channels = finishedOrders.map((order, idx) => {
            return supabase
                .channel(`global-order-${order.id}-${idx}`)
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
                    (payload) => {
                        setFinishedOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: payload.new.status } : o))
                    }
                )
                .subscribe()
        })

        return () => {
            channels.forEach(ch => supabase.removeChannel(ch))
        }
    }, [finishedOrders, supabase])

    // Real-time updates for myPurchases (Meus Pedidos)
    useEffect(() => {
        if (!currentUserId) return

        const channel = supabase
            .channel(`public:orders:${currentUserId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders' },
                (payload) => {
                    setMyPurchases(prev => {
                        const exists = prev.some(p => p.checkout_id === payload.new.checkout_id)
                        if (!exists) return prev
                        return prev.map(p => p.checkout_id === payload.new.checkout_id ? { ...p, status: payload.new.status } : p)
                    })
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'store_sales' },
                (payload) => {
                    setMyPurchases(prev => {
                        const exists = prev.some(p => p.checkout_id === payload.new.checkout_id)
                        if (!exists) return prev
                        return prev.map(p => p.id === payload.new.id ? { ...p, status: payload.new.status } : p)
                    })
                }
            )
            .subscribe()

        // Fallback polling (garante atualização se realtime não estiver ativado no banco)
        const interval = setInterval(() => {
            loadUserData(currentUserId)
        }, 5000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [currentUserId, supabase])

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
            const finalOrders: any[] = []

            for (const slug of storeSlugs) {
                const items = itemsByStore[slug]
                const details = storeDetails[slug]
                const totalPrice = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

                const { data: storeData } = await supabase
                    .from('stores')
                    .select('id, owner_id, whatsapp')
                    .eq('storeSlug', slug)
                    .single()

                if (storeData) {
                    const checkout_id = crypto.randomUUID()

                    const { data: orderData, error: orderError } = await supabase
                        .from('orders')
                        .insert({
                            store_id: storeData.id,
                            buyer_id: currentUserId,
                            buyer_name: currentUserName || authName || 'Cliente iUser',
                            buyer_profile_slug: currentUserSlug || 'anonimo',
                            total_amount: totalPrice,
                            status: 'pending',
                            checkout_id
                        })
                        .select()
                        .single()

                    if (orderError) {
                        console.warn('Fallback to legacy store_sales: ', orderError.message)
                    }

                    // Sempre adicionar ao finalOrders e salvar no store_sales para não quebrar o fluxo
                    finalOrders.push({
                        id: orderData?.id || checkout_id,
                        store_id: storeData.id,
                        buyer_id: currentUserId,
                        buyer_name: currentUserName || authName || 'Cliente iUser',
                        buyer_profile_slug: currentUserSlug || 'anonimo',
                        total_amount: totalPrice,
                        status: 'pending',
                        checkout_id,
                        items,
                        storeName: details?.name || slug
                    })

                    if (orderData) {
                        await supabase.from('order_items').insert(
                            items.map(item => ({
                                order_id: orderData.id,
                                product_id: item.product.id,
                                product_name: item.product.name,
                                quantity: item.quantity,
                                unit_price: item.product.price,
                                total_price: item.product.price * item.quantity
                            }))
                        )
                    }

                    const salesToInsert = items.map(item => ({
                        store_id: storeData.id,
                        checkout_id: checkout_id,
                        buyer_id: currentUserId,
                        buyer_name: currentUserName || authName || 'Cliente iUser',
                        buyer_profile_slug: currentUserSlug || 'anonimo',
                        store_slug: slug,
                        product_id: item.product.id,
                        product_name: item.product.name,
                        price: item.product.price * item.quantity,
                        quantity: item.quantity,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    }))
                    await supabase.from('store_sales').insert(salesToInsert)

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

            setFinishedOrders(finalOrders)
            storeSlugs.forEach(s => clearStoreCart(s))

            if (currentUserId) {
                await loadUserData(currentUserId)
            }


            if (storeSlugs.length === 1 && finalOrders.length > 0) {
                const slug = storeSlugs[0]
                const { data: storeData } = await supabase.from('stores').select('whatsapp, owner_id').eq('storeSlug', slug).single()
                let whatsapp = storeData?.whatsapp
                if (!whatsapp) {
                    const { data: owner } = await supabase.from('profiles').select('whatsapp').eq('id', storeData?.owner_id).single()
                    whatsapp = owner?.whatsapp
                }

                if (whatsapp) {
                    const message = encodeURIComponent(
                        `*Novo Pedido - iUser*\n\n` +
                        `*Cliente:* @${currentUserSlug}\n` +
                        `*Itens:*\n${finalOrders[0].items.map((i: any) => `- ${i.quantity}x ${i.product.name} (R$ ${i.product.price.toFixed(2)})`).join('\n')}\n\n` +
                        `*Total: R$ ${finalOrders[0].total_amount.toFixed(2)}*`
                    )
                    window.open(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${message}`, '_blank')
                }
            }

        } catch (err) {
            console.error(err)
        } finally {
            setCheckoutLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-green-500 selection:text-white pb-32">
            <div className="max-w-3xl mx-auto px-4 py-6">
                {/* Header */}
                <header className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                    <button
                        onClick={() => router.back()}
                        className="w-8 h-8 flex items-center justify-center bg-secondary/50 border border-border hover:bg-foreground hover:text-background transition-all"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black tracking-tighter italic uppercase text-foreground leading-none">
                            {finishedOrders.length > 0 ? 'Pedidos' : 'Carrinho'}<span className="text-green-500">.</span>
                        </h1>
                        <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">
                            {finishedOrders.length > 0 ? 'Acompanhe suas compras' : `${storeSlugs.length} loja(s)`}
                        </p>
                    </div>
                </header>

                {/* TELA DE PEDIDOS REALIZADOS */}
                {finishedOrders.length > 0 ? (
                    <div className="space-y-6">
                        {/* Banner de confirmação menor */}
                        <div className="flex items-center gap-3 p-3 border border-green-500/20 bg-green-500/5">
                            <div className="w-8 h-8 bg-green-500/10 flex items-center justify-center border border-green-500/20">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                            </div>
                            <div>
                                <h2 className="text-xs font-black italic uppercase tracking-tighter text-foreground">Pedido Realizado!</h2>
                                <p className="text-[7px] text-muted-foreground">Acompanhe o status abaixo</p>
                            </div>
                        </div>

                        {/* Comprador Info */}
                        <div className="flex items-center gap-3 p-3 border border-border bg-secondary/10">
                            <div className="w-10 h-10 bg-background border border-border flex-shrink-0">
                                {currentUserAvatar ? (
                                    <img src={currentUserAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary">
                                        <User className="w-5 h-5" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground">Comprador</p>
                                <p className="text-sm font-black italic text-foreground leading-none mt-0.5">@{currentUserSlug}</p>
                            </div>
                        </div>

                        {/* Lista de pedidos */}
                        <div className="space-y-3">
                            {finishedOrders.map((order, index) => (
                                <div key={order.id || index} className="border border-border p-4 space-y-3 bg-card/20">
                                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                        <div>
                                            <span className="text-[7px] font-black uppercase text-muted-foreground block mb-0.5">Loja</span>
                                            <span className="text-sm font-black text-foreground uppercase">{order.storeName}</span>
                                        </div>
                                        <span className={`px-2 py-1 text-[7px] font-black uppercase tracking-wider border ${order.status === 'pending' ? 'border-blue-500/30 bg-blue-500/10 text-blue-500' :
                                            order.status === 'preparing' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500' :
                                                order.status === 'ready' ? 'border-purple-500/30 bg-purple-500/10 text-purple-500' :
                                                    order.status === 'paid' ? 'border-green-500/30 bg-green-500/10 text-green-500' :
                                                        'border-destructive/30 bg-destructive/10 text-destructive'
                                            }`}>
                                            {order.status === 'pending' ? 'Pendente' :
                                                order.status === 'preparing' ? 'Preparo' :
                                                    order.status === 'ready' ? 'Pronto' :
                                                        order.status === 'paid' ? 'Finalizado' : 'Recusado'}
                                        </span>
                                    </div>

                                    <div className="space-y-1.5">
                                        {order.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center text-xs">
                                                <span className="font-bold text-foreground">{item.quantity}x {item.product.name}</span>
                                                <span className="font-black text-muted-foreground">R$ {(item.product.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="border-t border-border/50 pt-2 flex justify-between items-center">
                                        <span className="text-[7px] font-black uppercase text-muted-foreground">Total</span>
                                        <span className="text-base font-black italic text-foreground">R$ {order.total_amount.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={async () => {
                                if (currentUserId) await loadUserData(currentUserId)
                                setFinishedOrders([])
                                setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100)
                            }}
                            className="block w-full text-center px-6 py-3 bg-foreground text-background font-black uppercase text-[9px] tracking-wider hover:bg-green-500 hover:text-white transition-all"
                        >
                            Acompanhar em Meus Pedidos
                        </button>
                    </div>
                ) : storeSlugs.length === 0 ? (
                    /* CARRINHO VAZIO - BEM MENOR */
                    <div className="py-8 px-4 border border-dashed border-border bg-card/10">
                        <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-secondary/50 border border-border">
                                    <ShoppingCart className="w-5 h-5 text-muted-foreground/30" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black italic uppercase tracking-tighter text-foreground">Carrinho vazio</h2>
                                    <p className="text-muted-foreground text-[7px] font-bold uppercase tracking-wider">
                                        acesse o vitrine para ver lojas , produtos ou serviços.
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/"
                                className="px-5 py-2 bg-foreground text-background font-black uppercase text-[8px] tracking-wider hover:bg-green-500 hover:text-white transition-all whitespace-nowrap"
                            >
                                Ver Vitrine
                            </Link>
                        </div>
                    </div>
                ) : (
                    /* CARRINHO COM ITENS */
                    <div className="space-y-6">
                        {/* Lista de Itens */}
                        <div className="space-y-4">
                            {storeSlugs.map((slug) => {
                                const details = storeDetails[slug]
                                const items = itemsByStore[slug]
                                const storeTotal = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

                                return (
                                    <div key={slug} className="border border-border overflow-hidden">
                                        <div className="bg-secondary/20 px-3 py-2 border-b border-border flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Store className="w-3 h-3 text-green-500" />
                                                <span className="text-[8px] font-black uppercase tracking-wider">{details?.name || slug}</span>
                                            </div>
                                            <span className="text-[8px] font-black text-muted-foreground">R$ {storeTotal.toFixed(2)}</span>
                                        </div>

                                        <div className="divide-y divide-border">
                                            {items.map((item) => (
                                                <div key={item.product.id} className="flex gap-3 p-3">
                                                    <div className="w-12 h-12 bg-secondary border border-border flex-shrink-0">
                                                        {item.product.image_url ? (
                                                            <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 text-xs font-black italic">
                                                                {item.product.name.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-xs font-black uppercase tracking-tighter text-foreground truncate">{item.product.name}</h4>
                                                        <p className="text-[8px] font-black text-green-500">R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                        <div className="flex items-center gap-2 mt-1.5">
                                                            <div className="flex items-center bg-secondary border border-border">
                                                                <button
                                                                    onClick={() => updateQuantity(slug, item.product.id, -1)}
                                                                    className="w-5 h-5 flex items-center justify-center bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                                                >
                                                                    <Minus className="w-2 h-2" />
                                                                </button>
                                                                <span className="w-5 text-center text-[9px] font-black italic">{item.quantity}</span>
                                                                <button
                                                                    onClick={() => updateQuantity(slug, item.product.id, 1)}
                                                                    className="w-5 h-5 flex items-center justify-center bg-background text-foreground hover:bg-foreground hover:text-background transition-all"
                                                                >
                                                                    <Plus className="w-2 h-2" />
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={() => removeItem(slug, item.product.id)}
                                                                className="w-5 h-5 flex items-center justify-center bg-destructive/5 text-destructive/50 hover:bg-destructive hover:text-white transition-all border border-destructive/10"
                                                            >
                                                                <Trash2 className="w-2.5 h-2.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black italic text-foreground">
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

                        {/* Total e Finalização */}
                        <div className="border-t border-border pt-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Total Geral</span>
                                <span className="text-2xl font-black italic tracking-tighter text-foreground">
                                    R$ {totalGlobalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>

                            {currentUserId ? (
                                <div className="w-full flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-3 bg-green-500/10 border border-green-500/20 p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-background border border-border flex-shrink-0">
                                                {currentUserAvatar ? (
                                                    <img src={currentUserAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary">
                                                        <User className="w-4 h-4" />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground">Comprar como</p>
                                                <p className="text-xs font-black italic text-foreground leading-none mt-0.5">@{currentUserSlug}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                await supabase.auth.signOut()
                                                setCurrentUserId(null)
                                                setMyPurchases([])
                                                setAuthMode('login')
                                            }}
                                            className="px-2 py-1 bg-background border border-border text-[6px] font-black uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            Sair
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleFinalizarTudo}
                                        disabled={checkoutLoading}
                                        className="w-full py-3 bg-foreground text-background font-black uppercase text-[9px] tracking-wider hover:bg-green-500 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {checkoutLoading ? (
                                            <div className="w-3.5 h-3.5 border-2 border-background/20 border-t-background rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Finalizar Pedido
                                            </>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })}
                                    className="w-full py-3 bg-foreground text-background font-black uppercase text-[9px] tracking-wider hover:bg-green-500 hover:text-white transition-all"
                                >
                                    Identificar para Finalizar
                                </button>
                            )}
                        </div>

                        {/* Auth Section */}
                        {!currentUserId && (
                            <div id="auth-section" className="border-t border-border pt-4 space-y-3">
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setAuthMode('login')}
                                        className={`flex-1 py-2 text-[8px] font-black uppercase tracking-wider transition-all border ${authMode === 'login' ? 'bg-foreground text-background border-foreground' : 'bg-secondary/30 text-muted-foreground border-border'}`}
                                    >
                                        Entrar
                                    </button>
                                    <button
                                        onClick={() => setAuthMode('register')}
                                        className={`flex-1 py-2 text-[8px] font-black uppercase tracking-wider transition-all border ${authMode === 'register' ? 'bg-foreground text-background border-foreground' : 'bg-secondary/30 text-muted-foreground border-border'}`}
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
                                    <form onSubmit={handleInlineLogin} className="space-y-2">
                                        <input
                                            type="email"
                                            placeholder="seu@email.com"
                                            className="w-full bg-secondary/50 border border-border px-3 py-2 text-xs focus:outline-none focus:border-green-500/50"
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            required
                                        />
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="sua senha"
                                                className="w-full bg-secondary/50 border border-border px-3 py-2 text-xs focus:outline-none focus:border-green-500/50 pr-8"
                                                value={authPassword}
                                                onChange={(e) => setAuthPassword(e.target.value)}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2"
                                            >
                                                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                            </button>
                                        </div>
                                        <button
                                            disabled={authLoading}
                                            className="w-full py-2.5 bg-foreground text-background font-black uppercase text-[8px] tracking-wider hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                                        >
                                            {authLoading ? 'Acessando...' : 'Acessar'}
                                        </button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleInlineRegister} className="space-y-2">
                                        <input
                                            type="text"
                                            placeholder="Nome Completo"
                                            className="w-full bg-secondary/50 border border-border px-3 py-2 text-xs focus:outline-none focus:border-green-500/50"
                                            value={authName}
                                            onChange={(e) => setAuthName(e.target.value)}
                                            required
                                        />
                                        <div className="flex items-center gap-1 bg-secondary/50 border border-border px-2">
                                            <span className="text-[7px] font-black text-muted-foreground">iuser.com.br/</span>
                                            <input
                                                type="text"
                                                placeholder="link-do-perfil"
                                                className="flex-1 py-2 bg-transparent text-xs outline-none"
                                                value={authProfileSlug}
                                                onChange={(e) => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                required
                                            />
                                            {isSlugAvailable !== null && (
                                                <span className={`text-[7px] font-black ${isSlugAvailable ? 'text-green-500' : 'text-red-500'}`}>
                                                    {isSlugAvailable ? '✓' : '✗'}
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            type="email"
                                            placeholder="seu@email.com"
                                            className="w-full bg-secondary/50 border border-border px-3 py-2 text-xs focus:outline-none focus:border-green-500/50"
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            required
                                        />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Senha"
                                            className="w-full bg-secondary/50 border border-border px-3 py-2 text-xs focus:outline-none focus:border-green-500/50"
                                            value={authPassword}
                                            onChange={(e) => setAuthPassword(e.target.value)}
                                            required
                                        />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Confirmar senha"
                                            className="w-full bg-secondary/50 border border-border px-3 py-2 text-xs focus:outline-none focus:border-green-500/50"
                                            value={authConfirmPassword}
                                            onChange={(e) => setAuthConfirmPassword(e.target.value)}
                                            required
                                        />
                                        <button
                                            disabled={authLoading || isSlugAvailable === false}
                                            className="w-full py-2.5 bg-foreground text-background font-black uppercase text-[8px] tracking-wider hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                                        >
                                            {authLoading ? 'Cadastrando...' : 'Cadastrar'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* MINHAS COMPRAS - DESTAQUE MAIOR */}
                {currentUserId && myPurchases.length > 0 && finishedOrders.length === 0 && (
                    <div className="mt-10 pt-6 border-t border-border">
                        <div className="flex items-center gap-2 mb-4">
                            <Package className="w-4 h-4 text-green-500" />
                            <h2 className="text-sm font-black italic uppercase tracking-tighter text-foreground">Meus Pedidos</h2>
                            <span className="text-[7px] font-black text-muted-foreground">({myPurchases.length} itens)</span>
                        </div>

                        <div className="space-y-3">
                            {Object.values(myPurchases.reduce((groups: any, p) => {
                                if (!groups[p.checkout_id]) {
                                    groups[p.checkout_id] = {
                                        checkout_id: p.checkout_id,
                                        store_name: (p as any).store_name,
                                        created_at: p.created_at,
                                        status: p.status,
                                        total: 0,
                                        items: []
                                    }
                                }
                                groups[p.checkout_id].total += p.price
                                groups[p.checkout_id].items.push(p)
                                return groups
                            }, {})).slice(0, 5).map((order: any) => (
                                <div key={order.checkout_id} className="border border-border p-3 hover:border-green-500/30 transition-all bg-card/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <p className="text-[7px] font-black text-muted-foreground uppercase tracking-wider">
                                                {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                            </p>
                                            <h3 className="text-xs font-black italic uppercase tracking-tighter">{order.store_name}</h3>
                                        </div>
                                        <div className={`px-2 py-0.5 text-[6px] font-black uppercase tracking-wider border ${order.status === 'pending' ? 'border-blue-500/30 bg-blue-500/10 text-blue-500' :
                                            order.status === 'preparing' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500' :
                                                order.status === 'ready' ? 'border-purple-500/30 bg-purple-500/10 text-purple-500' :
                                                    order.status === 'paid' ? 'border-green-500/30 bg-green-500/10 text-green-500' :
                                                        'border-destructive/30 bg-destructive/10 text-destructive'
                                            }`}>
                                            {order.status === 'pending' ? 'Pendente' :
                                                order.status === 'preparing' ? 'Preparo' :
                                                    order.status === 'ready' ? 'Pronto' :
                                                        order.status === 'paid' ? 'Finalizado' : 'Cancelado'}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {order.items.slice(0, 2).map((item: any, idx: number) => (
                                            <span key={idx} className="text-[7px] font-bold text-muted-foreground bg-secondary/30 px-1.5 py-0.5">
                                                {item.quantity}x {item.product_name}
                                            </span>
                                        ))}
                                        {order.items.length > 2 && (
                                            <span className="text-[7px] font-bold text-muted-foreground">+{order.items.length - 2}</span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                        <span className="text-[7px] font-black uppercase text-muted-foreground">Total</span>
                                        <span className="text-sm font-black italic text-foreground">R$ {order.total.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {Object.values(myPurchases.reduce((groups: any, p) => {
                            if (!groups[p.checkout_id]) groups[p.checkout_id] = true
                            return groups
                        }, {})).length > 5 && (
                                <Link href="/pedidos" className="block text-center w-full mt-3 py-2 text-[7px] font-black uppercase tracking-wider text-muted-foreground hover:text-green-500 transition-colors border border-border">
                                    Ver todos os pedidos
                                </Link>
                            )}
                    </div>
                )}
            </div>
        </div>
    )
}