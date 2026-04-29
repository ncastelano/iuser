'use client'

import { useCartStore } from '@/store/useCartStore'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Store, ChevronRight, Trash2, ArrowLeft, CheckCircle2, Minus, Plus, Eye, EyeOff, User, Link as LinkIcon, Mail, Lock, Package, Flame, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import AnimatedBackground from '@/components/AnimatedBackground'

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
            .channel(`buyer-status-${currentUserId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `buyer_id=eq.${currentUserId}`
                },
                (payload) => {
                    const newStatus = payload.new.status
                    const checkoutId = payload.new.checkout_id

                    setMyPurchases(prev => {
                        const existing = prev.find(p => p.checkout_id === checkoutId)
                        if (!existing) return prev

                        if (existing.status !== newStatus) {
                            if (newStatus === 'preparing') toast.info('👨‍🍳 O lojista começou a preparar seu pedido!')
                            if (newStatus === 'ready') toast.success('✅ Seu pedido está pronto!')
                            if (newStatus === 'paid') toast.success('🎉 Pedido finalizado com sucesso!')
                            if (newStatus === 'rejected') toast.error('❌ Seu pedido foi recusado pelo lojista.')
                        }

                        return prev.map(p => p.checkout_id === checkoutId ? { ...p, status: newStatus } : p)
                    })
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'store_sales',
                    filter: `buyer_id=eq.${currentUserId}`
                },
                (payload) => {
                    setMyPurchases(prev => prev.map(p => p.id === payload.new.id ? { ...p, status: payload.new.status } : p))
                }
            )
            .subscribe()

        const interval = setInterval(() => {
            loadUserData(currentUserId)
        }, 8000)

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
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            {/* Fundo animado compartilhado */}
            <AnimatedBackground />

            {/* Conteúdo principal */}
            <div className="relative z-10 max-w-3xl mx-auto px-4 py-6">
                {/* Header */}
                <header className="flex items-center gap-3 mb-6 pb-4 border-b border-orange-200/50">
                    <button
                        onClick={() => router.back()}
                        className="w-8 h-8 flex items-center justify-center bg-white/90 border-2 border-orange-200 rounded-xl hover:bg-gradient-to-r hover:from-orange-500 hover:to-red-500 hover:text-white transition-all"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tighter">
                            {finishedOrders.length > 0 ? 'Pedidos' : 'Carrinho'}
                        </h1>
                        <p className="text-[8px] font-black uppercase tracking-wider text-gray-500 mt-0.5">
                            {finishedOrders.length > 0 ? 'Acompanhe suas compras' : `${storeSlugs.length} loja(s)`}
                        </p>
                    </div>
                </header>

                {/* TELA DE PEDIDOS REALIZADOS */}
                {finishedOrders.length > 0 ? (
                    <div className="space-y-6">
                        {/* Banner de confirmação */}
                        <div className="flex items-center gap-3 p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-green-500/30">
                            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-gray-900">Pedido Realizado!</h2>
                                <p className="text-[8px] text-gray-500">Acompanhe o status abaixo</p>
                            </div>
                        </div>

                        {/* Comprador Info */}
                        <div className="flex items-center gap-3 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-orange-200/50">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-md">
                                {currentUserAvatar ? (
                                    <img src={currentUserAvatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    <User className="w-6 h-6 text-white" />
                                )}
                            </div>
                            <div>
                                <p className="text-[7px] font-black uppercase text-gray-500">Comprador</p>
                                <p className="text-sm font-black text-gray-900">@{currentUserSlug}</p>
                            </div>
                        </div>

                        {/* Lista de pedidos */}
                        <div className="space-y-3">
                            {finishedOrders.map((order, index) => (
                                <div key={order.id || index} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-4 space-y-3 shadow-sm">
                                    <div className="flex justify-between items-center border-b border-orange-100 pb-2">
                                        <div>
                                            <span className="text-[7px] font-black uppercase text-gray-500">Loja</span>
                                            <p className="text-sm font-black text-gray-900">{order.storeName}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded-full text-[7px] font-black uppercase border ${order.status === 'pending' ? 'border-blue-500/30 bg-blue-500/10 text-blue-600' :
                                                order.status === 'preparing' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600' :
                                                    order.status === 'ready' ? 'border-purple-500/30 bg-purple-500/10 text-purple-600' :
                                                        order.status === 'paid' ? 'border-green-500/30 bg-green-500/10 text-green-600' :
                                                            'border-red-500/30 bg-red-500/10 text-red-600'
                                            }`}>
                                            {order.status === 'pending' ? 'Pendente' :
                                                order.status === 'preparing' ? 'Preparo' :
                                                    order.status === 'ready' ? 'Pronto' :
                                                        order.status === 'paid' ? 'Finalizado' : 'Recusado'}
                                        </span>
                                    </div>

                                    <div className="space-y-1.5">
                                        {order.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <span className="font-bold text-gray-700">{item.quantity}x {item.product.name}</span>
                                                <span className="font-black text-gray-600">R$ {(item.product.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="border-t border-orange-100 pt-2 flex justify-between items-center">
                                        <span className="text-[7px] font-black uppercase text-gray-500">Total</span>
                                        <span className="text-lg font-black text-orange-600">R$ {order.total_amount.toFixed(2)}</span>
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
                            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all"
                        >
                            Ver Meus Pedidos
                        </button>
                    </div>
                ) : storeSlugs.length === 0 ? (
                    /* CARRINHO VAZIO */
                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-6 text-center">
                        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ShoppingCart className="w-8 h-8 text-orange-400" />
                        </div>
                        <h2 className="text-lg font-black text-gray-900 mb-1">Carrinho vazio</h2>
                        <p className="text-xs text-gray-500 mb-4">Acesse a vitrine para ver lojas, produtos ou serviços.</p>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-[8px] tracking-wider hover:shadow-lg transition-all"
                        >
                            Ver Vitrine
                            <ChevronRight className="w-3 h-3" />
                        </Link>
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
                                    <div key={slug} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 overflow-hidden shadow-sm">
                                        <div className="bg-gradient-to-r from-orange-50 to-red-50 px-4 py-2.5 border-b border-orange-200/50 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                                                    <Store className="w-3 h-3 text-white" />
                                                </div>
                                                <span className="text-xs font-black uppercase tracking-wide text-gray-800">{details?.name || slug}</span>
                                            </div>
                                            <span className="text-xs font-black text-orange-600">R$ {storeTotal.toFixed(2)}</span>
                                        </div>

                                        <div className="divide-y divide-orange-100">
                                            {items.map((item) => (
                                                <div key={item.product.id} className="flex gap-3 p-4">
                                                    <div className="w-14 h-14 rounded-xl bg-orange-100 border-2 border-orange-200 overflow-hidden flex-shrink-0">
                                                        {item.product.image_url ? (
                                                            <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-orange-400 text-xs font-black italic">
                                                                {item.product.name.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-black text-gray-900 truncate">{item.product.name}</h4>
                                                        <p className="text-xs font-black text-orange-600 mt-0.5">R$ {item.product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <div className="flex items-center bg-orange-50 border border-orange-200 rounded-lg">
                                                                <button
                                                                    onClick={() => updateQuantity(slug, item.product.id, -1)}
                                                                    className="w-6 h-6 flex items-center justify-center text-gray-600 hover:bg-orange-200 transition-all"
                                                                >
                                                                    <Minus className="w-3 h-3" />
                                                                </button>
                                                                <span className="w-6 text-center text-xs font-bold text-gray-800">{item.quantity}</span>
                                                                <button
                                                                    onClick={() => updateQuantity(slug, item.product.id, 1)}
                                                                    className="w-6 h-6 flex items-center justify-center text-gray-600 hover:bg-orange-200 transition-all"
                                                                >
                                                                    <Plus className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={() => removeItem(slug, item.product.id)}
                                                                className="w-6 h-6 flex items-center justify-center bg-red-50 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-black text-gray-900">
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
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase text-gray-500">Total Geral</span>
                                <span className="text-2xl font-black text-orange-600">R$ {totalGlobalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>

                            {currentUserId ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-3 bg-orange-50/50 rounded-xl p-3 border border-orange-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                                {currentUserAvatar ? (
                                                    <img src={currentUserAvatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    <User className="w-5 h-5 text-white" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-[7px] font-black uppercase text-gray-500">Comprar como</p>
                                                <p className="text-sm font-black text-gray-900">@{currentUserSlug}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                await supabase.auth.signOut()
                                                setCurrentUserId(null)
                                                setMyPurchases([])
                                                setAuthMode('login')
                                            }}
                                            className="px-2 py-1 bg-white border border-orange-200 rounded-lg text-[7px] font-black uppercase text-gray-500 hover:text-red-500 transition-all"
                                        >
                                            Sair
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleFinalizarTudo}
                                        disabled={checkoutLoading}
                                        className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {checkoutLoading ? (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-4 h-4" />
                                                Finalizar Pedido
                                            </>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })}
                                    className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all"
                                >
                                    Identificar para Finalizar
                                </button>
                            )}
                        </div>

                        {/* Auth Section */}
                        {!currentUserId && (
                            <div id="auth-section" className="bg-white/60 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-4 space-y-3">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setAuthMode('login')}
                                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${authMode === 'login' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md' : 'bg-white/80 text-gray-600 border border-orange-200'}`}
                                    >
                                        Entrar
                                    </button>
                                    <button
                                        onClick={() => setAuthMode('register')}
                                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${authMode === 'register' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md' : 'bg-white/80 text-gray-600 border border-orange-200'}`}
                                    >
                                        Criar Conta
                                    </button>
                                </div>

                                {authError && (
                                    <div className="p-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[7px] font-black uppercase text-center">
                                        ⚠️ {authError}
                                    </div>
                                )}

                                {authMode === 'login' ? (
                                    <form onSubmit={handleInlineLogin} className="space-y-3">
                                        <input
                                            type="email"
                                            placeholder="seu@email.com"
                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500 transition-all"
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            required
                                        />
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="sua senha"
                                                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500 pr-10"
                                                value={authPassword}
                                                onChange={(e) => setAuthPassword(e.target.value)}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <button
                                            disabled={authLoading}
                                            className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-[8px] tracking-wider hover:shadow-lg transition-all disabled:opacity-50"
                                        >
                                            {authLoading ? 'Acessando...' : 'Acessar'}
                                        </button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleInlineRegister} className="space-y-3">
                                        <input
                                            type="text"
                                            placeholder="Nome Completo"
                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500"
                                            value={authName}
                                            onChange={(e) => setAuthName(e.target.value)}
                                            required
                                        />
                                        <div className="flex items-center gap-1 bg-white border-2 border-orange-200 rounded-xl px-3">
                                            <span className="text-[9px] font-black text-gray-500">iuser.com.br/</span>
                                            <input
                                                type="text"
                                                placeholder="link-do-perfil"
                                                className="flex-1 py-2.5 bg-transparent text-sm outline-none"
                                                value={authProfileSlug}
                                                onChange={(e) => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                required
                                            />
                                            {isSlugAvailable !== null && (
                                                <span className={`text-[9px] font-black ${isSlugAvailable ? 'text-green-500' : 'text-red-500'}`}>
                                                    {isSlugAvailable ? '✓' : '✗'}
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            type="email"
                                            placeholder="seu@email.com"
                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500"
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            required
                                        />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Senha"
                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500"
                                            value={authPassword}
                                            onChange={(e) => setAuthPassword(e.target.value)}
                                            required
                                        />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Confirmar senha"
                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500"
                                            value={authConfirmPassword}
                                            onChange={(e) => setAuthConfirmPassword(e.target.value)}
                                            required
                                        />
                                        <button
                                            disabled={authLoading || isSlugAvailable === false}
                                            className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-[8px] tracking-wider hover:shadow-lg transition-all disabled:opacity-50"
                                        >
                                            {authLoading ? 'Cadastrando...' : 'Cadastrar'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* MINHAS COMPRAS - DESTAQUE */}
                {currentUserId && myPurchases.length > 0 && finishedOrders.length === 0 && (
                    <div className="mt-10 pt-6 border-t border-orange-200/50">
                        <div className="flex items-center gap-2 mb-4">
                            <Package className="w-5 h-5 text-orange-500" />
                            <h2 className="text-lg font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Meus Pedidos</h2>
                            <span className="text-[8px] font-black text-gray-500 bg-white/50 px-2 py-0.5 rounded-full">({myPurchases.length})</span>
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
                                <div key={order.checkout_id} className="bg-white/70 backdrop-blur-sm rounded-xl border border-orange-200/50 p-3 hover:border-orange-300 transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <p className="text-[7px] font-black text-gray-500 uppercase tracking-wider">
                                                {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                            </p>
                                            <h3 className="text-sm font-black text-gray-900">{order.store_name}</h3>
                                        </div>
                                        <div className={`px-2 py-0.5 rounded-full text-[6px] font-black uppercase border ${order.status === 'pending' ? 'border-blue-500/30 bg-blue-500/10 text-blue-600' :
                                                order.status === 'preparing' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600' :
                                                    order.status === 'ready' ? 'border-purple-500/30 bg-purple-500/10 text-purple-600' :
                                                        order.status === 'paid' ? 'border-green-500/30 bg-green-500/10 text-green-600' :
                                                            'border-red-500/30 bg-red-500/10 text-red-600'
                                            }`}>
                                            {order.status === 'pending' ? 'Pendente' :
                                                order.status === 'preparing' ? 'Preparo' :
                                                    order.status === 'ready' ? 'Pronto' :
                                                        order.status === 'paid' ? 'Finalizado' : 'Cancelado'}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {order.items.slice(0, 2).map((item: any, idx: number) => (
                                            <span key={idx} className="text-[7px] font-bold text-gray-600 bg-orange-50 px-2 py-0.5 rounded-full">
                                                {item.quantity}x {item.product_name}
                                            </span>
                                        ))}
                                        {order.items.length > 2 && (
                                            <span className="text-[7px] font-bold text-gray-500">+{order.items.length - 2}</span>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-orange-100">
                                        <span className="text-[7px] font-black uppercase text-gray-500">Total</span>
                                        <span className="text-sm font-black text-orange-600">R$ {order.total.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {Object.values(myPurchases.reduce((groups: any, p) => {
                            if (!groups[p.checkout_id]) groups[p.checkout_id] = true
                            return groups
                        }, {})).length > 5 && (
                                <Link href="/pedidos" className="block text-center w-full mt-3 py-2 text-[8px] font-black uppercase tracking-wider text-gray-500 hover:text-orange-500 transition-colors border border-orange-200 rounded-xl bg-white/30">
                                    Ver todos os pedidos
                                </Link>
                            )}
                    </div>
                )}
            </div>
        </div>
    )
}