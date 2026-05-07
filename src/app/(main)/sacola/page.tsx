// src/app/(app)/sacola/page.tsx
'use client'

import { useCartStore } from '@/store/useCartStore'
import { useRouter } from 'next/navigation'
import { Store, ChevronRight, Trash2, CheckCircle2, Minus, Plus, Eye, EyeOff, User, Package, ShoppingBag, ShoppingCart, MapPin } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import AnimatedBackground from '@/components/AnimatedBackground'
import { ReviewModal } from '@/components/ratings/ReviewModal'
import { LoadingSpinner } from '@/components/vitrine/LoadingSpinner'

export default function SacolaPage() {
    const { itemsByStore, storeDetails, updateQuantity, removeItem, clearStoreCart } = useCartStore()
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])

    // Estados
    const [mounted, setMounted] = useState(false)
    const [viewOrder, setViewOrder] = useState<'carrinho' | 'pedidos'>('carrinho')
    const [globalLoading, setGlobalLoading] = useState(true)

    // Auth
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)

    // Checkout
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [myPurchases, setMyPurchases] = useState<any[]>([])
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao'>('pix')
    const [deliveryOption, setDeliveryOption] = useState<'entrega' | 'retirada'>('entrega')
    const [userAddress, setUserAddress] = useState<string | null>(null)
    const [addressInput, setAddressInput] = useState('')
    const [isEditingAddress, setIsEditingAddress] = useState(false)
    const [finishedOrders, setFinishedOrders] = useState<any[]>([])

    // Auth Form
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
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

    // Review Modal
    const [reviewOrder, setReviewOrder] = useState({
        isOpen: false,
        orderId: '',
        productId: '',
        productName: '',
        storeId: ''
    })

    const loadUserData = useCallback(async (userId: string) => {
        setCurrentUserId(userId)

        const { data: profile } = await supabase
            .from('profiles')
            .select('profileSlug, avatar_url, name, address')
            .eq('id', userId)
            .single()

        if (profile) {
            setCurrentUserSlug(profile.profileSlug)
            setCurrentUserAvatar(profile.avatar_url)
            setCurrentUserName(profile.name)
            setUserAddress(profile.address)
            if (profile.address) setAddressInput(profile.address)
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
    }, [supabase])

    // Inicialização
    useEffect(() => {
        setMounted(true)
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                await loadUserData(user.id)
            }
            setGlobalLoading(false)
        }
        checkUser()
    }, [supabase, loadUserData])

    // Verificação de slug disponível
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

        return () => {
            if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current)
        }
    }, [authProfileSlug, supabase])

    // Monitoramento de pedidos finalizados
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

    // Monitoramento em tempo real dos pedidos
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
    }, [currentUserId, supabase, loadUserData])

    if (!mounted || globalLoading) return <LoadingSpinner message="Carregando sacola..." />

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
                    const paymentLabel = paymentMethod === 'pix' ? 'PIX' : 'Cartão'
                    const deliveryLabel = deliveryOption === 'entrega' ? `Entrega (${addressInput})` : 'Retirada no Balcão'
                    const message = encodeURIComponent(
                        `*Novo Pedido - iUser*\n\n` +
                        `*Cliente:* @${currentUserSlug}\n` +
                        `*Pagamento:* ${paymentLabel}\n` +
                        `*Entrega:* ${deliveryLabel}\n` +
                        `*Itens:*\n${finalOrders[0].items.map((i: any) => `- ${i.quantity}x ${i.product.name} (R$ ${i.product.price.toFixed(2)})`).join('\n')}\n\n` +
                        `*Total: R$ ${finalOrders[0].total_amount.toFixed(2)}*`
                    )
                    window.open(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${message}`, '_blank')
                }
            }

        } catch (err) {
            console.error(err)
            toast.error('Erro ao finalizar pedido')
        } finally {
            setCheckoutLoading(false)
        }
    }

    const handleLogin = async (e: React.FormEvent) => {
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

    const handleRegister = async (e: React.FormEvent) => {
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

    const handleLogout = async () => {
        await supabase.auth.signOut()
        setCurrentUserId(null)
        setCurrentUserSlug(null)
        setCurrentUserAvatar(null)
        setCurrentUserName(null)
        setMyPurchases([])
        setAuthMode('login')
    }

    // Renderização
    return (
        <div className="relative min-h-screen pb-24 bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <AnimatedBackground />

            {/* Header */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-orange-100 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
                            <ShoppingBag size={18} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black italic uppercase tracking-tighter bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                                {finishedOrders.length > 0 ? 'Pedidos' : 'Sacola'}
                            </h1>
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-wider">
                                {finishedOrders.length > 0 ? 'Acompanhe suas compras' : `${storeSlugs.length} loja(s)`}
                            </p>
                        </div>
                    </div>

                    {!finishedOrders.length && (
                        <div className="flex bg-orange-100 rounded-full p-0.5">
                            <button
                                onClick={() => setViewOrder('carrinho')}
                                className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${viewOrder === 'carrinho'
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                                    : 'text-gray-600'
                                    }`}
                            >
                                <ShoppingBag size={10} />
                                Carrinho
                            </button>
                            <button
                                onClick={() => setViewOrder('pedidos')}
                                className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${viewOrder === 'pedidos'
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                                    : 'text-gray-600'
                                    }`}
                            >
                                <Package size={10} />
                                Pedidos
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="relative z-10 max-w-3xl mx-auto px-4 py-6">
                {/* PEDIDOS FINALIZADOS */}
                {finishedOrders.length > 0 ? (
                    <div className="space-y-6 animate-slide-in">
                        <div className="bg-white/40 rounded-2xl p-5 text-center border border-orange-100">
                            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <CheckCircle2 className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-lg font-black text-gray-900">Pedido Realizado!</h2>
                            <p className="text-[10px] text-gray-500 mt-1">Acompanhe o status abaixo em tempo real</p>
                        </div>

                        {currentUserId && (
                            <div className="bg-white/40 rounded-2xl p-4 border border-orange-100 flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                    {currentUserAvatar ? (
                                        <img src={currentUserAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        <User className="w-6 h-6 text-white" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-[8px] font-black uppercase text-gray-500">Comprador</p>
                                    <p className="text-base font-black text-gray-900">@{currentUserSlug}</p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            {finishedOrders.map((order, index) => (
                                <div key={index} className="bg-white/40 rounded-2xl p-4 border border-orange-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-lg font-black italic text-gray-900">{order.storeName}</h3>
                                        <span className={`text-[8px] font-black px-2 py-1 rounded-full ${order.status === 'pending' ? 'bg-blue-100 text-blue-600' :
                                            order.status === 'preparing' ? 'bg-yellow-100 text-yellow-600' :
                                                order.status === 'ready' ? 'bg-purple-100 text-purple-600' :
                                                    order.status === 'paid' ? 'bg-green-100 text-green-600' :
                                                        'bg-red-100 text-red-600'
                                            }`}>
                                            {order.status === 'pending' ? 'Pendente' :
                                                order.status === 'preparing' ? 'Preparo' :
                                                    order.status === 'ready' ? 'Pronto' :
                                                        order.status === 'paid' ? 'Finalizado' : 'Recusado'}
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {order.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center text-sm">
                                                <span className="font-bold text-gray-700">
                                                    {item.quantity}x {item.product.name}
                                                </span>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-black text-gray-900">
                                                        R$ {(item.product.price * item.quantity).toFixed(2)}
                                                    </span>
                                                    {order.status === 'paid' && (
                                                        <button
                                                            onClick={() => setReviewOrder({
                                                                isOpen: true,
                                                                orderId: order.id,
                                                                productId: item.product.id,
                                                                productName: item.product.name,
                                                                storeId: order.store_id
                                                            })}
                                                            className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-[8px] font-black uppercase hover:bg-orange-500 hover:text-white transition-all"
                                                        >
                                                            Avaliar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-orange-100">
                                        <span className="text-[8px] font-black uppercase text-gray-500">Total</span>
                                        <span className="text-xl font-black text-orange-600">
                                            R$ {order.total_amount.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={async () => {
                                if (currentUserId) await loadUserData(currentUserId)
                                setFinishedOrders([])
                                setViewOrder('carrinho')
                            }}
                            className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all"
                        >
                            Ver Meus Pedidos
                        </button>
                    </div>
                ) : (
                    /* CONTEÚDO PRINCIPAL */
                    <div className="space-y-8 animate-slide-in">
                        {/* Meus Pedidos (quando viewOrder = pedidos) */}
                        {viewOrder === 'pedidos' && currentUserId && myPurchases.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                        <Package size={16} className="text-white" />
                                    </div>
                                    <h2 className="text-base font-black italic uppercase tracking-tighter bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                                        Meus Pedidos
                                    </h2>
                                    <span className="text-[8px] font-black text-gray-500 bg-orange-100 px-2 py-0.5 rounded-full">
                                        {myPurchases.length}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {Object.values(myPurchases.reduce((groups: any, p) => {
                                        if (!groups[p.checkout_id]) {
                                            groups[p.checkout_id] = {
                                                checkout_id: p.checkout_id,
                                                store_name: p.store_name,
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
                                        <div key={order.checkout_id} className="bg-white/40 rounded-2xl p-4 border border-orange-100 relative overflow-hidden">
                                            {/* Efeito de brilho nos status ativos */}
                                            {(order.status === 'pending' || order.status === 'preparing' || order.status === 'ready') && (
                                                <div className={`absolute inset-0 opacity-10 animate-pulse ${order.status === 'pending' ? 'bg-blue-400' :
                                                        order.status === 'preparing' ? 'bg-yellow-400' :
                                                            'bg-purple-400'
                                                    }`}></div>
                                            )}

                                            <div className="relative z-10">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[8px] font-black text-gray-500 uppercase">
                                                        {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                                    </p>
                                                    <span className={`text-[10px] font-black px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg ${order.status === 'pending' ? 'bg-blue-500 text-white animate-pulse scale-110' :
                                                            order.status === 'preparing' ? 'bg-yellow-500 text-white animate-pulse scale-110' :
                                                                order.status === 'ready' ? 'bg-purple-500 text-white animate-pulse scale-110' :
                                                                    'bg-green-100 text-green-700'
                                                        }`}>
                                                        {/* Ícone animado */}
                                                        {order.status === 'pending' && (
                                                            <span className="relative flex h-3 w-3">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                                                            </span>
                                                        )}
                                                        {order.status === 'preparing' && (
                                                            <span className="text-sm animate-bounce">👨‍🍳</span>
                                                        )}
                                                        {order.status === 'ready' && (
                                                            <span className="text-sm animate-bounce">✅</span>
                                                        )}

                                                        {order.status === 'pending' ? 'PENDENTE' :
                                                            order.status === 'preparing' ? 'PREPARANDO' :
                                                                order.status === 'ready' ? 'PRONTO' : 'FINALIZADO'}
                                                    </span>
                                                </div>

                                                {/* Barra de progresso para status ativos */}
                                                {(order.status === 'pending' || order.status === 'preparing' || order.status === 'ready') && (
                                                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all duration-1000 animate-pulse ${order.status === 'pending' ? 'w-1/3 bg-gradient-to-r from-blue-400 to-blue-600' :
                                                                order.status === 'preparing' ? 'w-2/3 bg-gradient-to-r from-yellow-400 to-yellow-600' :
                                                                    'w-5/6 bg-gradient-to-r from-purple-400 to-purple-600'
                                                            }`}></div>
                                                    </div>
                                                )}

                                                <h3 className="text-sm font-black text-gray-900">{order.store_name}</h3>

                                                <div className="flex justify-between items-center mt-2">
                                                    <span className="text-[7px] font-black text-gray-500">{order.items.length} itens</span>
                                                    <span className="text-sm font-black text-orange-600">R$ {order.total.toFixed(2)}</span>
                                                </div>

                                                {/* Mensagem de status chamativa */}
                                                {(order.status === 'pending' || order.status === 'preparing' || order.status === 'ready') && (
                                                    <div className={`mt-3 text-[9px] font-black text-center py-2 rounded-lg uppercase tracking-wider animate-pulse ${order.status === 'pending' ? 'bg-blue-100 text-blue-700 border border-blue-300' :
                                                            order.status === 'preparing' ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' :
                                                                'bg-purple-100 text-purple-700 border border-purple-300'
                                                        }`}>
                                                        {order.status === 'pending' && '⏳ Aguardando confirmação...'}
                                                        {order.status === 'preparing' && '👨‍🍳 Preparando seu pedido!'}
                                                        {order.status === 'ready' && '✅ Pronto! Pode retirar!'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <Link href="/pedidos" className="block text-center w-full mt-3 py-2 text-[8px] font-black uppercase tracking-wider text-gray-500 hover:text-orange-500 transition-colors">
                                    Ver todos os pedidos →
                                </Link>
                            </div>
                        )}

                        {/* Seção Carrinho */}
                        <div className={viewOrder === 'pedidos' && currentUserId && myPurchases.length > 0 ? "mt-8 pt-6 border-t border-orange-200" : ""}>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                    <ShoppingCart size={16} className="text-white" />
                                </div>
                                <h2 className="text-base font-black italic uppercase tracking-tighter text-gray-900">Carrinho</h2>
                                {storeSlugs.length > 0 && (
                                    <span className="text-[8px] font-black text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full">
                                        {storeSlugs.length} loja(s)
                                    </span>
                                )}
                            </div>

                            {storeSlugs.length === 0 ? (
                                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-orange-200/50">
                                    <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                        <ShoppingBag className="w-7 h-7 text-orange-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-sm font-black text-gray-900">Sua sacola está vazia</h2>
                                        <p className="text-xs text-gray-500">Explore as lojas e encontre o que você procura</p>
                                    </div>
                                    <Link
                                        href="/"
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-wider hover:shadow-lg transition-all shrink-0"
                                    >
                                        Ver Vitrine
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    {/* Itens por loja */}
                                    {storeSlugs.map((slug) => {
                                        const details = storeDetails[slug]
                                        const items = itemsByStore[slug]
                                        const storeTotal = items.reduce((acc, item) => acc + (item.product.price * item.quantity), 0)

                                        return (
                                            <div key={slug} className="bg-white/40 rounded-2xl p-4 border border-orange-100 mb-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <Store size={14} className="text-orange-500" />
                                                        <h3 className="text-sm font-black uppercase tracking-wide text-gray-800">
                                                            {details?.name || slug}
                                                        </h3>
                                                    </div>
                                                    <span className="text-sm font-black text-orange-600">
                                                        R$ {storeTotal.toFixed(2)}
                                                    </span>
                                                </div>

                                                <div className="space-y-3">
                                                    {items.map((item) => (
                                                        <div key={item.product.id} className="flex gap-3">
                                                            <div className="w-14 h-14 rounded-xl bg-orange-100 border-2 border-orange-200 overflow-hidden flex-shrink-0">
                                                                {item.product.image_url ? (
                                                                    <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-orange-400 text-lg font-black italic">
                                                                        {item.product.name.charAt(0)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex-1">
                                                                <h4 className="text-sm font-black text-gray-900">{item.product.name}</h4>
                                                                <p className="text-xs font-black text-orange-600">R$ {item.product.price.toFixed(2)}</p>
                                                                <div className="flex items-center gap-2 mt-2">
                                                                    <div className="flex items-center bg-orange-50 border border-orange-200 rounded-lg">
                                                                        <button onClick={() => updateQuantity(slug, item.product.id, -1)} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-orange-200">
                                                                            <Minus className="w-3 h-3" />
                                                                        </button>
                                                                        <span className="w-7 text-center text-xs font-bold text-gray-800">{item.quantity}</span>
                                                                        <button onClick={() => updateQuantity(slug, item.product.id, 1)} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-orange-200">
                                                                            <Plus className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                    <button onClick={() => removeItem(slug, item.product.id)} className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-400 rounded-lg hover:bg-red-500 hover:text-white">
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-gray-900">
                                                                    R$ {(item.product.price * item.quantity).toFixed(2)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Total e Finalização */}
                                    <div className="bg-white/40 rounded-2xl p-5 border border-orange-100">
                                        <div className="flex items-center justify-between mb-6">
                                            <span className="text-xs font-black uppercase text-gray-500">Total Geral</span>
                                            <span className="text-2xl font-black text-orange-600">
                                                R$ {totalGlobalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        {currentUserId ? (
                                            <div className="space-y-4">
                                                {/* Entrega/Retirada */}
                                                <div>
                                                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider mb-2">Como deseja receber?</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button onClick={() => setDeliveryOption('entrega')} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${deliveryOption === 'entrega' ? 'bg-orange-500/10 border-orange-500' : 'bg-white border-orange-100'}`}>
                                                            <span className="text-lg">📍</span>
                                                            <span className="text-[10px] font-black uppercase">Entrega</span>
                                                        </button>
                                                        <button onClick={() => setDeliveryOption('retirada')} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${deliveryOption === 'retirada' ? 'bg-orange-500/10 border-orange-500' : 'bg-white border-orange-100'}`}>
                                                            <span className="text-lg">🏪</span>
                                                            <span className="text-[10px] font-black uppercase">Retirada</span>
                                                        </button>
                                                    </div>

                                                    {deliveryOption === 'entrega' && (
                                                        <div className="mt-3">
                                                            {userAddress && !isEditingAddress ? (
                                                                <div className="flex items-center gap-2 bg-white rounded-xl p-3 border border-orange-100">
                                                                    <MapPin size={14} className="text-orange-500 shrink-0" />
                                                                    <p className="text-xs font-bold text-gray-800 flex-1">{userAddress}</p>
                                                                    <button onClick={() => setIsEditingAddress(true)} className="text-[9px] font-black text-orange-500">Mudar</button>
                                                                </div>
                                                            ) : (
                                                                <div className="relative">
                                                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500 w-4 h-4" />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Rua, número, bairro, cidade..."
                                                                        className="w-full bg-white border-2 border-orange-200 rounded-xl pl-10 pr-4 py-2.5 text-sm"
                                                                        value={addressInput}
                                                                        onChange={(e) => setAddressInput(e.target.value)}
                                                                        autoComplete="street-address"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Pagamento */}
                                                <div>
                                                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider mb-2">Forma de Pagamento</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button onClick={() => setPaymentMethod('pix')} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'pix' ? 'bg-orange-500/10 border-orange-500' : 'bg-white border-orange-100'}`}>
                                                            <span className="text-lg font-black">PIX</span>
                                                            <span className="text-[10px] font-black uppercase">PIX</span>
                                                        </button>
                                                        <button onClick={() => setPaymentMethod('cartao')} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'cartao' ? 'bg-orange-500/10 border-orange-500' : 'bg-white border-orange-100'}`}>
                                                            <span className="text-lg">💳</span>
                                                            <span className="text-[10px] font-black uppercase">Cartão</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Usuário */}
                                                <div className="flex items-center justify-between bg-orange-50/50 rounded-xl p-3 border border-orange-100">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                                            {currentUserAvatar ? (
                                                                <img src={currentUserAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                                                            ) : (
                                                                <User className="w-5 h-5 text-white" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-[7px] font-black uppercase text-gray-500">Comprar como</p>
                                                            <p className="text-sm font-black text-gray-900">@{currentUserSlug}</p>
                                                        </div>
                                                    </div>
                                                    <button onClick={handleLogout} className="px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-[7px] font-black uppercase text-gray-500 hover:text-red-500 transition-all">
                                                        Sair
                                                    </button>
                                                </div>

                                                <button onClick={handleFinalizarTudo} disabled={checkoutLoading} className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-sm tracking-wider hover:shadow-lg transition-all disabled:opacity-50">
                                                    {checkoutLoading ? 'Finalizando...' : 'Finalizar Pedido'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <p className="text-xs text-gray-500 text-center">Identifique-se para continuar</p>

                                                {/* Tabs Login/Registro */}
                                                <div className="flex gap-2">
                                                    <button onClick={() => setAuthMode('login')} className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'login' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white' : 'bg-white text-gray-600 border border-orange-200'}`}>
                                                        Entrar
                                                    </button>
                                                    <button onClick={() => setAuthMode('register')} className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'register' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white' : 'bg-white text-gray-600 border border-orange-200'}`}>
                                                        Criar Conta
                                                    </button>
                                                </div>

                                                {authError && (
                                                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[8px] font-black uppercase text-center">
                                                        ⚠️ {authError}
                                                    </div>
                                                )}

                                                {authMode === 'login' ? (
                                                    <form onSubmit={handleLogin} className="space-y-3">
                                                        <input
                                                            type="email"
                                                            placeholder="seu@email.com"
                                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm"
                                                            value={authEmail}
                                                            onChange={(e) => setAuthEmail(e.target.value)}
                                                            required
                                                            autoComplete="email"
                                                        />
                                                        <div className="relative">
                                                            <input
                                                                type={showPassword ? 'text' : 'password'}
                                                                placeholder="sua senha"
                                                                className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm pr-10"
                                                                value={authPassword}
                                                                onChange={(e) => setAuthPassword(e.target.value)}
                                                                required
                                                                autoComplete="current-password"
                                                            />
                                                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                            </button>
                                                        </div>
                                                        <button type="submit" disabled={authLoading} className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-[9px] tracking-wider disabled:opacity-50">
                                                            {authLoading ? 'Entrando...' : 'Entrar'}
                                                        </button>
                                                    </form>
                                                ) : (
                                                    <form onSubmit={handleRegister} className="space-y-3">
                                                        <input
                                                            type="text"
                                                            placeholder="Nome Completo"
                                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm"
                                                            value={authName}
                                                            onChange={(e) => setAuthName(e.target.value)}
                                                            required
                                                            autoComplete="name"
                                                        />
                                                        <div className="flex items-center gap-1 bg-white border-2 border-orange-200 rounded-xl px-3">
                                                            <span className="text-[9px] font-black text-gray-500">iuser.com.br/</span>
                                                            <input
                                                                type="text"
                                                                placeholder="seu-perfil"
                                                                className="flex-1 py-2.5 bg-transparent text-sm outline-none"
                                                                value={authProfileSlug}
                                                                onChange={(e) => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                                required
                                                                autoComplete="off"
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
                                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm"
                                                            value={authEmail}
                                                            onChange={(e) => setAuthEmail(e.target.value)}
                                                            required
                                                            autoComplete="email"
                                                        />
                                                        <input
                                                            type={showPassword ? 'text' : 'password'}
                                                            placeholder="Senha"
                                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm"
                                                            value={authPassword}
                                                            onChange={(e) => setAuthPassword(e.target.value)}
                                                            required
                                                            autoComplete="new-password"
                                                        />
                                                        <input
                                                            type={showPassword ? 'text' : 'password'}
                                                            placeholder="Confirmar senha"
                                                            className="w-full bg-white border-2 border-orange-200 rounded-xl px-4 py-2.5 text-sm"
                                                            value={authConfirmPassword}
                                                            onChange={(e) => setAuthConfirmPassword(e.target.value)}
                                                            required
                                                            autoComplete="new-password"
                                                        />
                                                        <button type="submit" disabled={authLoading || isSlugAvailable === false} className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-[9px] tracking-wider disabled:opacity-50">
                                                            {authLoading ? 'Criando...' : 'Criar Conta'}
                                                        </button>
                                                    </form>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Meus Pedidos (quando viewOrder = carrinho) */}
                        {viewOrder === 'carrinho' && currentUserId && myPurchases.length > 0 && (
                            <div className="mt-8 pt-6 border-t border-orange-200">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                        <Package size={16} className="text-white" />
                                    </div>
                                    <h2 className="text-base font-black italic uppercase tracking-tighter bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                                        Meus Pedidos
                                    </h2>
                                    <span className="text-[8px] font-black text-gray-500 bg-orange-100 px-2 py-0.5 rounded-full">
                                        {myPurchases.length}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {Object.values(myPurchases.reduce((groups: any, p) => {
                                        if (!groups[p.checkout_id]) {
                                            groups[p.checkout_id] = {
                                                checkout_id: p.checkout_id,
                                                store_name: p.store_name,
                                                created_at: p.created_at,
                                                status: p.status,
                                                total: 0,
                                                items: []
                                            }
                                        }
                                        groups[p.checkout_id].total += p.price
                                        groups[p.checkout_id].items.push(p)
                                        return groups
                                    }, {})).slice(0, 3).map((order: any) => (
                                        <div key={order.checkout_id} className="bg-white/40 rounded-2xl p-4 border border-orange-100">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-[8px] font-black text-gray-500 uppercase">
                                                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                                </p>
                                                <span className={`text-[6px] font-black px-2 py-0.5 rounded-full ${order.status === 'pending' ? 'bg-blue-100 text-blue-600' :
                                                    order.status === 'preparing' ? 'bg-yellow-100 text-yellow-600' :
                                                        order.status === 'ready' ? 'bg-purple-100 text-purple-600' :
                                                            'bg-green-100 text-green-600'
                                                    }`}>
                                                    {order.status === 'pending' ? 'Pendente' :
                                                        order.status === 'preparing' ? 'Preparo' :
                                                            order.status === 'ready' ? 'Pronto' : 'Finalizado'}
                                                </span>
                                            </div>
                                            <h3 className="text-sm font-black text-gray-900">{order.store_name}</h3>
                                            <div className="flex justify-between items-center mt-2">
                                                <span className="text-[7px] font-black text-gray-500">{order.items.length} itens</span>
                                                <span className="text-sm font-black text-orange-600">R$ {order.total.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <Link href="/pedidos" className="block text-center w-full mt-3 py-2 text-[8px] font-black uppercase tracking-wider text-gray-500 hover:text-orange-500 transition-colors">
                                    Ver todos os pedidos →
                                </Link>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ReviewModal
                isOpen={reviewOrder.isOpen}
                onClose={() => setReviewOrder(prev => ({ ...prev, isOpen: false }))}
                orderId={reviewOrder.orderId}
                productId={reviewOrder.productId}
                productName={reviewOrder.productName}
                storeId={reviewOrder.storeId}
            />
        </div>
    )
}