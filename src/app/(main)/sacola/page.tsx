// src/app/(app)/sacola/page.tsx
'use client'

import { useCartStore } from '@/store/useCartStore'
import { useRouter } from 'next/navigation'
import {
    Store,
    ChevronRight,
    Trash2,
    CheckCircle2,
    Minus,
    Plus,
    Eye,
    EyeOff,
    User,
    Package,
    ShoppingBag,
    MapPin,
    ArrowLeft,
    Home,
    Star,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ReviewModal } from '@/components/ratings/ReviewModal'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'

export default function SacolaPage() {
    const { itemsByStore, storeDetails, updateQuantity, removeItem, clearStoreCart } = useCartStore()
    const router = useRouter()
    const { colors } = useTheme()

    // ───── TODOS OS HOOKS AQUI ─────
    const [mounted, setMounted] = useState(false)
    const [viewOrder, setViewOrder] = useState<'carrinho' | 'pedidos' | 'avaliar'>('carrinho')
    const [globalLoading, setGlobalLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)

    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [myPurchases, setMyPurchases] = useState<any[]>([])
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao'>('pix')
    const [deliveryOption, setDeliveryOption] = useState<'entrega' | 'retirada'>('entrega')
    const [userAddress, setUserAddress] = useState<string | null>(null)
    const [addressInput, setAddressInput] = useState('')
    const [isEditingAddress, setIsEditingAddress] = useState(false)
    const [finishedOrders, setFinishedOrders] = useState<any[]>([])

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

    const [reviewOrder, setReviewOrder] = useState({
        isOpen: false,
        orderId: '',
        productId: '',
        productName: '',
        storeId: '',
    })

    // Itens pendentes de avaliação
    const [pendingReviews, setPendingReviews] = useState<any[]>([])
    const [loadingPendingReviews, setLoadingPendingReviews] = useState(false)

    const loadUserData = useCallback(
        async (userId: string) => {
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
                allPurchases = [
                    ...allPurchases,
                    ...purchaseDataLegacy.map((p: any) => ({
                        ...p,
                        store_name: p.stores?.name || 'Loja',
                    })),
                ]
            }

            if (purchaseDataNew) {
                const mappedNew = purchaseDataNew.flatMap((o: any) =>
                    o.order_items.map((i: any) => ({
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
                        store_name: o.stores?.name || 'Loja',
                    }))
                )
                allPurchases = [...allPurchases, ...mappedNew]
            }

            const uniquePurchases = Array.from(
                new Map(allPurchases.map(item => [item.id, item])).values()
            )
            setMyPurchases([...uniquePurchases])

            setFinishedOrders(prev => {
                if (prev.length === 0) return prev
                const hasChanges = prev.some(order => {
                    const updated = uniquePurchases.find(
                        p => p.checkout_id === order.checkout_id || p.id === order.id
                    )
                    return updated && updated.status !== order.status
                })
                if (!hasChanges) return prev

                return prev.map(order => {
                    const updated = uniquePurchases.find(
                        p => p.checkout_id === order.checkout_id || p.id === order.id
                    )
                    if (updated) return { ...order, status: updated.status }
                    return order
                })
            })

            // Buscar avaliações pendentes
            await fetchPendingReviews(userId)
        },
        [supabase]
    )

    // Buscar itens pendentes de avaliação
    const fetchPendingReviews = async (userId: string) => {
        setLoadingPendingReviews(true)
        try {
            // Buscar todos os itens finalizados (paid) do usuário
            const { data: salesItems } = await supabase
                .from('store_sales')
                .select('id, product_id, product_name, store_id, checkout_id, price, created_at')
                .eq('buyer_id', userId)
                .eq('status', 'paid')

            // Agora incluímos 'created_at' na seleção
            const { data: orderItemsRaw } = await supabase
                .from('orders')
                .select('id, checkout_id, store_id, created_at, order_items(product_id, product_name, total_price)')
                .eq('buyer_id', userId)
                .eq('status', 'paid')

            // Achatar order_items
            const orderItemsFlat: any[] = []
            orderItemsRaw?.forEach(order => {
                if (order.order_items) {
                    order.order_items.forEach((item: any) => {
                        orderItemsFlat.push({
                            id: item.product_id,
                            product_id: item.product_id,
                            product_name: item.product_name,
                            store_id: order.store_id,
                            checkout_id: order.checkout_id,
                            price: item.total_price,
                            created_at: order.created_at,   // agora disponível
                        })
                    })
                }
            })
            // Unificar todos os itens finalizados
            const allPaidItems = [...(salesItems || []), ...orderItemsFlat]

            // Buscar reviews já feitas
            const { data: reviews } = await supabase
                .from('product_reviews')
                .select('product_id')
                .eq('profile_id', userId)

            const reviewedProductIds = new Set(reviews?.map(r => r.product_id) || [])

            // Filtrar pendentes
            const pending = allPaidItems.filter(item => !reviewedProductIds.has(item.product_id))

            // Remover duplicatas (mesmo product_id)
            const uniquePending = Array.from(new Map(pending.map(item => [item.product_id, item])).values())

            setPendingReviews(uniquePending)
        } catch (err) {
            console.error('Erro ao buscar avaliações pendentes:', err)
        } finally {
            setLoadingPendingReviews(false)
        }
    }

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

    useEffect(() => {
        if (!currentUserId) return
        const channel = supabase
            .channel(`buyer-status-${currentUserId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders', filter: `buyer_id=eq.${currentUserId}` },
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
                    setFinishedOrders(prev => {
                        const hasMatch = prev.some(o => o.checkout_id === checkoutId || o.id === payload.new.id)
                        if (!hasMatch) return prev
                        return prev.map(o => (o.checkout_id === checkoutId || o.id === payload.new.id) ? { ...o, status: newStatus } : o)
                    })
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'store_sales', filter: `buyer_id=eq.${currentUserId}` },
                (payload) => {
                    const newStatus = payload.new.status
                    const saleId = payload.new.id
                    const checkoutId = payload.new.checkout_id
                    setMyPurchases(prev => prev.map(p => p.id === saleId ? { ...p, status: newStatus } : p))
                    setFinishedOrders(prev => prev.map(o => (o.checkout_id === checkoutId || o.id === saleId) ? { ...o, status: newStatus } : o))
                }
            )
            .subscribe()
        const interval = setInterval(() => loadUserData(currentUserId), 8000)
        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [currentUserId, supabase, loadUserData])

    const handleFinalizarTudo = async () => {
        if (!currentUserId) return
        setCheckoutLoading(true)
        try {
            const finalOrders: any[] = []
            for (const slug of storeSlugs) {
                const items = itemsByStore[slug]
                const details = storeDetails[slug]
                const totalPrice = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
                const { data: storeData } = await supabase.from('stores').select('id, owner_id, whatsapp').eq('storeSlug', slug).single()
                if (storeData) {
                    const checkout_id = crypto.randomUUID()
                    const { data: orderData, error: orderError } = await supabase.from('orders').insert({
                        store_id: storeData.id,
                        buyer_id: currentUserId,
                        buyer_name: currentUserName || authName || 'Cliente iUser',
                        buyer_profile_slug: currentUserSlug || 'anonimo',
                        total_amount: totalPrice,
                        status: 'pending',
                        checkout_id,
                    }).select().single()
                    if (orderError) console.warn('Fallback to legacy store_sales: ', orderError.message)
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
                        storeName: details?.name || slug,
                    })
                    if (orderData) {
                        await supabase.from('order_items').insert(items.map(item => ({
                            order_id: orderData.id,
                            product_id: item.product.id,
                            product_name: item.product.name,
                            quantity: item.quantity,
                            unit_price: item.product.price,
                            total_price: item.product.price * item.quantity,
                        })))
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
                        created_at: new Date().toISOString(),
                    }))
                    await supabase.from('store_sales').insert(salesToInsert)
                }
            }
            setFinishedOrders(finalOrders)
            storeSlugs.forEach(s => clearStoreCart(s))
            if (currentUserId) await loadUserData(currentUserId)
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
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        if (error) { setAuthError('Email ou senha inválidos'); setAuthLoading(false); return }
        if (data.user) await loadUserData(data.user.id)
        setAuthLoading(false)
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)
        if (authPassword !== authConfirmPassword) { setAuthError('As senhas não coincidem'); setAuthLoading(false); return }
        if (!authProfileSlug || !/^[a-z0-9-]+$/.test(authProfileSlug)) { setAuthError('O link do perfil deve conter apenas letras, números e hifens'); setAuthLoading(false); return }
        const { data: slugCheck } = await supabase.from('profiles').select('profileSlug').eq('profileSlug', authProfileSlug).single()
        if (slugCheck) { setAuthError('Este link de perfil já está em uso'); setAuthLoading(false); return }
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { data: { full_name: authName, slug: authProfileSlug } } })
        if (error) { setAuthError(error.message); setAuthLoading(false); return }
        if (data.user) {
            await supabase.from('profiles').upsert({ id: data.user.id, name: authName, profileSlug: authProfileSlug })
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

    const getStatusStyles = (status: string) => {
        const styles: any = {
            pending: { border: 'border-l-4 border-l-blue-500', badge: 'bg-blue-50 text-blue-700 border border-blue-200', label: 'Pendente', icon: '⏳', message: 'Aguardando confirmação do vendedor' },
            preparing: { border: 'border-l-4 border-l-yellow-500', badge: 'bg-yellow-50 text-yellow-700 border border-yellow-200', label: 'Preparando', icon: '👨‍🍳', message: 'O lojista está preparando seu pedido' },
            ready: { border: 'border-l-4 border-l-purple-500', badge: 'bg-purple-50 text-purple-700 border border-purple-200', label: 'Pronto', icon: '✅', message: 'Seu pedido está pronto para retirada!' },
            paid: { border: 'border-l-4 border-l-green-500', badge: 'bg-green-50 text-green-700 border border-green-200', label: 'Finalizado', icon: '🎉', message: 'Pedido finalizado com sucesso' },
            rejected: { border: 'border-l-4 border-l-red-500', badge: 'bg-red-50 text-red-700 border border-red-200', label: 'Recusado', icon: '❌', message: 'O pedido foi recusado pelo vendedor' },
        }
        return styles[status] || styles.pending
    }

    const storeSlugs = Object.keys(itemsByStore)
    const totalGlobalPrice = Object.values(itemsByStore).reduce(
        (acc, items) => acc + items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
        0
    )

    const filteredCartSlugs = useMemo(() => {
        if (!searchQuery.trim()) return storeSlugs
        const q = searchQuery.toLowerCase()
        return storeSlugs.filter(slug => {
            const details = storeDetails[slug]
            const storeName = (details?.name || slug).toLowerCase()
            if (storeName.includes(q)) return true
            const items = itemsByStore[slug]
            return items.some(item => item.product.name.toLowerCase().includes(q))
        })
    }, [storeSlugs, searchQuery, itemsByStore, storeDetails])

    const filteredPurchases = useMemo(() => {
        if (!searchQuery.trim()) return myPurchases
        const q = searchQuery.toLowerCase()
        return myPurchases.filter(p =>
            (p.store_name || '').toLowerCase().includes(q) ||
            (p.product_name || '').toLowerCase().includes(q)
        )
    }, [myPurchases, searchQuery])

    const filteredGroupedOrders = useMemo(() => {
        if (!searchQuery.trim()) {
            const groups: Record<string, any> = {}
            myPurchases.forEach((p: any) => {
                if (!groups[p.checkout_id]) {
                    groups[p.checkout_id] = {
                        checkout_id: p.checkout_id,
                        store_name: p.store_name,
                        created_at: p.created_at,
                        status: p.status,
                        total: 0,
                        items: [],
                    }
                }
                groups[p.checkout_id].total += p.price
                groups[p.checkout_id].items.push(p)
            })
            return Object.values(groups).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        }
        const q = searchQuery.toLowerCase()
        const groups: Record<string, any> = {}
        filteredPurchases.forEach((p: any) => {
            if (!groups[p.checkout_id]) {
                groups[p.checkout_id] = {
                    checkout_id: p.checkout_id,
                    store_name: p.store_name,
                    created_at: p.created_at,
                    status: p.status,
                    total: 0,
                    items: [],
                }
            }
            groups[p.checkout_id].total += p.price
            groups[p.checkout_id].items.push(p)
        })
        return Object.values(groups).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }, [myPurchases, filteredPurchases, searchQuery])

    // ───── ESTILOS ─────
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)
    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
        borderRadius: '1rem',
        padding: '1.5rem',
    }

    // ───── TABS ─────
    const tabs = useMemo(() => {
        if (!currentUserId) return []
        const tabList = [
            {
                id: 'carrinho',
                label: 'Sacola',
                icon: ShoppingBag as React.ComponentType<{ size?: number; color?: string }>,
                onClick: () => setViewOrder('carrinho'),
                isActive: viewOrder === 'carrinho',
            },
            {
                id: 'pedidos',
                label: 'Pedidos',
                icon: Package as React.ComponentType<{ size?: number; color?: string }>,
                onClick: () => setViewOrder('pedidos'),
                isActive: viewOrder === 'pedidos',
            },
        ]

        // Adiciona aba "Avaliar" se houver pendências
        if (pendingReviews.length > 0) {
            tabList.push({
                id: 'avaliar',
                label: 'Avaliar',
                icon: Star as React.ComponentType<{ size?: number; color?: string }>,
                onClick: () => setViewOrder('avaliar'),
                isActive: viewOrder === 'avaliar',
            })
        }

        return tabList
    }, [currentUserId, viewOrder, pendingReviews])

    // ───── COMPONENTE DE CARD DE PEDIDO UNIFICADO ─────
    const OrderCard = ({ order }: { order: any }) => {
        const statusStyle = getStatusStyles(order.status)
        return (
            <div className={`rounded-2xl p-4 ${statusStyle.border} shadow-sm`} style={cardStyle}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-black italic" style={{ color: colors.textPrimary }}>
                        {order.storeName || order.store_name}
                    </h3>
                    <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${statusStyle.badge}`}>
                        {statusStyle.icon} {statusStyle.label}
                    </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${order.status === 'pending' ? 'w-1/4 bg-blue-400' :
                        order.status === 'preparing' ? 'w-2/4 bg-yellow-400' :
                            order.status === 'ready' ? 'w-3/4 bg-purple-400' :
                                order.status === 'paid' ? 'w-full bg-green-400' :
                                    'w-full bg-red-400'
                        }`}></div>
                </div>
                <div className="space-y-2">
                    {order.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="font-bold" style={{ color: colors.textPrimary }}>
                                {item.quantity}x {item.product_name || item.product?.name}
                            </span>
                            <div className="flex items-center gap-3">
                                <span className="font-black" style={{ color: colors.textPrimary }}>
                                    R$ {(item.price || (item.product?.price * item.quantity)).toFixed(2)}
                                </span>
                                {order.status === 'paid' && (
                                    <button
                                        onClick={() => setReviewOrder({
                                            isOpen: true,
                                            orderId: order.id,
                                            productId: item.product_id || item.product?.id,
                                            productName: item.product_name || item.product?.name,
                                            storeId: order.store_id,
                                        })}
                                        className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase transition-all"
                                        style={{ background: colors.accentLight, color: colors.accent }}
                                    >
                                        Avaliar
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between items-center mt-3 pt-2 border-t" style={{ borderColor: colors.border }}>
                    <span className="text-[8px] font-black uppercase" style={{ color: colors.textSecondary }}>Total</span>
                    <span className="text-xl font-black" style={{ color: colors.accent }}>
                        R$ {order.total_amount?.toFixed(2) || order.total.toFixed(2)}
                    </span>
                </div>
                <div className={`mt-3 text-[10px] font-bold text-center py-2 rounded-lg ${statusStyle.badge}`}>
                    {statusStyle.icon} {statusStyle.message}
                </div>
            </div>
        )
    }

    if (!mounted || globalLoading) return <LoadingSpinner />

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="iUser"
                    showBack={false}
                    greeting={`Olá, ${currentUserSlug ? `@${currentUserSlug}` : 'Visitante'}`}
                    avatarUrl={currentUserAvatar}
                    loading={false}
                    tabs={tabs}
                    showSearch={true}
                    searchPlaceholder="Buscar pedido, produto ou loja..."
                    onSearch={setSearchQuery}
                    profileSlug={currentUserSlug}
                    onHomeClick={() => router.push('/')}
                />

                <div className="px-4 pt-4 pb-24 space-y-6">
                    {/* PEDIDOS FINALIZADOS (tela de sucesso) */}
                    {finishedOrders.length > 0 && (
                        <div className="space-y-4 animate-slide-in">
                            <div className="rounded-2xl p-5 text-center" style={cardStyle}>
                                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                                    <CheckCircle2 className="w-8 h-8" style={{ color: colors.accentText }} />
                                </div>
                                <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Pedido Realizado!</h2>
                                <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>Acompanhe o status abaixo em tempo real</p>
                            </div>

                            {finishedOrders.map((order, index) => (
                                <OrderCard key={index} order={order} />
                            ))}

                            <button
                                onClick={async () => {
                                    if (currentUserId) await loadUserData(currentUserId)
                                    setFinishedOrders([])
                                    setViewOrder('carrinho')
                                }}
                                className="w-full py-4 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-md"
                                style={{ background: colors.accent, color: colors.accentText }}
                            >
                                Ver Meus Pedidos
                            </button>
                        </div>
                    )}

                    {/* CONTEÚDO PRINCIPAL (SACOLA + PEDIDOS + AVALIAR) */}
                    {finishedOrders.length === 0 && (
                        <div className={`flex flex-col ${viewOrder === 'pedidos' ? 'flex-col-reverse' : viewOrder === 'avaliar' ? 'flex-col-reverse' : ''} space-y-6`}>
                            {/* Seção Sacola */}
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                                        <ShoppingBag size={16} style={{ color: colors.accentText }} />
                                    </div>
                                    <h2 className="text-base font-black italic uppercase tracking-tighter" style={{ color: colors.textPrimary }}>
                                        Sacola
                                    </h2>
                                    {storeSlugs.length > 0 && (
                                        <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                                            {filteredCartSlugs.length} loja(s)
                                        </span>
                                    )}
                                </div>

                                {/* ... (todo o conteúdo da sacola permanece igual) ... */}
                                {filteredCartSlugs.length === 0 ? (
                                    <div className="flex items-center gap-4 p-4 rounded-2xl" style={cardStyle}>
                                        <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: `${colors.accent}20` }}>
                                            <ShoppingBag className="w-7 h-7" style={{ color: colors.accent }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h2 className="text-sm font-black" style={{ color: colors.textPrimary }}>Sua sacola está vazia</h2>
                                            <p className="text-xs" style={{ color: colors.textSecondary }}>Explore as lojas e encontre o que você procura</p>
                                        </div>
                                        <Link href="/" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shrink-0" style={{ background: colors.accent, color: colors.accentText }}>
                                            Ver Vitrine <ChevronRight className="w-3.5 h-3.5" />
                                        </Link>
                                    </div>
                                ) : (
                                    <>
                                        {filteredCartSlugs.map(slug => {
                                            const details = storeDetails[slug]
                                            const items = itemsByStore[slug]
                                            const storeTotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
                                            return (
                                                <div key={slug} className="rounded-2xl p-4 mb-4" style={cardStyle}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <Store size={14} style={{ color: colors.accent }} />
                                                            <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: colors.textPrimary }}>{details?.name || slug}</h3>
                                                        </div>
                                                        <span className="text-sm font-black" style={{ color: colors.accent }}>R$ {storeTotal.toFixed(2)}</span>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {items.map(item => (
                                                            <div key={item.product.id} className="flex gap-3">
                                                                <div className="w-14 h-14 rounded-xl border-2 overflow-hidden flex-shrink-0" style={{ background: `${colors.accent}20`, borderColor: colors.accent }}>
                                                                    {item.product.image_url ? (
                                                                        <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-lg font-black italic" style={{ color: colors.accent }}>{item.product.name.charAt(0)}</div>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <h4 className="text-sm font-black" style={{ color: colors.textPrimary }}>{item.product.name}</h4>
                                                                    <p className="text-xs font-black" style={{ color: colors.accent }}>R$ {item.product.price.toFixed(2)}</p>
                                                                    <div className="flex items-center gap-2 mt-2">
                                                                        <div className="flex items-center border rounded-lg" style={{ background: `${colors.accent}10`, borderColor: colors.accent }}>
                                                                            <button onClick={() => updateQuantity(slug, item.product.id, -1)} className="w-7 h-7 flex items-center justify-center" style={{ color: colors.textPrimary }}><Minus className="w-3 h-3" /></button>
                                                                            <span className="w-7 text-center text-xs font-bold" style={{ color: colors.textPrimary }}>{item.quantity}</span>
                                                                            <button onClick={() => updateQuantity(slug, item.product.id, 1)} className="w-7 h-7 flex items-center justify-center" style={{ color: colors.textPrimary }}><Plus className="w-3 h-3" /></button>
                                                                        </div>
                                                                        <button onClick={() => removeItem(slug, item.product.id)} className="w-7 h-7 flex items-center justify-center rounded-lg transition-all" style={{ background: `${colors.accent}20`, color: colors.accent }}><Trash2 className="w-3 h-3" /></button>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>R$ {(item.product.price * item.quantity).toFixed(2)}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}

                                        {/* Total e Finalização */}
                                        {storeSlugs.length > 0 && (
                                            <div className="rounded-2xl p-5" style={cardStyle}>
                                                <div className="flex items-center justify-between mb-6">
                                                    <span className="text-xs font-black uppercase" style={{ color: colors.textSecondary }}>Total Geral</span>
                                                    <span className="text-2xl font-black" style={{ color: colors.accent }}>R$ {totalGlobalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </div>

                                                {currentUserId ? (
                                                    <div className="space-y-4">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Como deseja receber?</p>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <button onClick={() => setDeliveryOption('entrega')} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${deliveryOption === 'entrega' ? 'border-2' : ''}`}
                                                                    style={deliveryOption === 'entrega' ? { background: `${colors.accent}15`, borderColor: colors.accent, color: colors.textPrimary } : { background: colors.surface, borderColor: colors.border, color: colors.textSecondary }}>
                                                                    <span className="text-lg">📍</span><span className="text-[10px] font-black uppercase">Entrega</span>
                                                                </button>
                                                                <button onClick={() => setDeliveryOption('retirada')} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${deliveryOption === 'retirada' ? 'border-2' : ''}`}
                                                                    style={deliveryOption === 'retirada' ? { background: `${colors.accent}15`, borderColor: colors.accent, color: colors.textPrimary } : { background: colors.surface, borderColor: colors.border, color: colors.textSecondary }}>
                                                                    <span className="text-lg">🏪</span><span className="text-[10px] font-black uppercase">Retirada</span>
                                                                </button>
                                                            </div>
                                                            {deliveryOption === 'entrega' && (
                                                                <div className="mt-3">
                                                                    {userAddress && !isEditingAddress ? (
                                                                        <div className="flex items-center gap-2 rounded-xl p-3 border" style={{ background: colors.surface, borderColor: colors.border }}>
                                                                            <MapPin size={14} style={{ color: colors.accent }} className="shrink-0" />
                                                                            <p className="text-xs font-bold flex-1" style={{ color: colors.textPrimary }}>{userAddress}</p>
                                                                            <button onClick={() => setIsEditingAddress(true)} className="text-[9px] font-black" style={{ color: colors.accent }}>Mudar</button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="relative">
                                                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.accent }} />
                                                                            <input type="text" placeholder="Rua, número, bairro, cidade..." className="w-full border-2 rounded-xl pl-10 pr-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.accent, color: colors.textPrimary }} value={addressInput} onChange={e => setAddressInput(e.target.value)} autoComplete="street-address" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Forma de Pagamento</p>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <button onClick={() => setPaymentMethod('pix')} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'pix' ? 'border-2' : ''}`}
                                                                    style={paymentMethod === 'pix' ? { background: `${colors.accent}15`, borderColor: colors.accent, color: colors.textPrimary } : { background: colors.surface, borderColor: colors.border, color: colors.textSecondary }}>
                                                                    <span className="text-lg font-black">PIX</span><span className="text-[10px] font-black uppercase">PIX</span>
                                                                </button>
                                                                <button onClick={() => setPaymentMethod('cartao')} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${paymentMethod === 'cartao' ? 'border-2' : ''}`}
                                                                    style={paymentMethod === 'cartao' ? { background: `${colors.accent}15`, borderColor: colors.accent, color: colors.textPrimary } : { background: colors.surface, borderColor: colors.border, color: colors.textSecondary }}>
                                                                    <span className="text-lg">💳</span><span className="text-[10px] font-black uppercase">Cartão</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between rounded-xl p-3 border" style={{ background: `${colors.accent}10`, borderColor: colors.accent }}>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                                                                    {currentUserAvatar ? <img src={currentUserAvatar} alt="" className="w-full h-full rounded-full object-cover" /> : <User className="w-5 h-5" style={{ color: colors.accentText }} />}
                                                                </div>
                                                                <div>
                                                                    <p className="text-[7px] font-black uppercase" style={{ color: colors.textSecondary }}>Comprar como</p>
                                                                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>@{currentUserSlug}</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={handleLogout} className="px-3 py-1.5 border rounded-lg text-[7px] font-black uppercase transition-all" style={{ background: colors.surface, borderColor: colors.border, color: colors.textSecondary }}>Sair</button>
                                                        </div>
                                                        <button onClick={handleFinalizarTudo} disabled={checkoutLoading} className="w-full py-4 rounded-xl font-black uppercase text-sm tracking-wider transition-all shadow-md disabled:opacity-50" style={{ background: colors.accent, color: colors.accentText }}>
                                                            {checkoutLoading ? 'Finalizando...' : 'Finalizar Pedido'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        <p className="text-xs text-center" style={{ color: colors.textSecondary }}>Identifique-se para continuar</p>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => setAuthMode('login')} className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'login' ? 'shadow-sm' : ''}`}
                                                                style={authMode === 'login' ? { background: colors.accent, color: colors.accentText } : { background: colors.surface, color: colors.textSecondary, border: `2px solid ${colors.border}` }}>
                                                                Entrar
                                                            </button>
                                                            <button onClick={() => setAuthMode('register')} className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${authMode === 'register' ? 'shadow-sm' : ''}`}
                                                                style={authMode === 'register' ? { background: colors.accent, color: colors.accentText } : { background: colors.surface, color: colors.textSecondary, border: `2px solid ${colors.border}` }}>
                                                                Criar Conta
                                                            </button>
                                                        </div>
                                                        {authError && <div className="p-3 border rounded-xl text-[8px] font-black uppercase text-center" style={{ background: `${colors.accent}20`, borderColor: colors.accent, color: colors.accent }}>⚠️ {authError}</div>}
                                                        {authMode === 'login' ? (
                                                            <form onSubmit={handleLogin} className="space-y-3">
                                                                <input type="email" placeholder="seu@email.com" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authEmail} onChange={e => setAuthEmail(e.target.value)} required autoComplete="email" />
                                                                <div className="relative">
                                                                    <input type={showPassword ? 'text' : 'password'} placeholder="sua senha" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm pr-10" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authPassword} onChange={e => setAuthPassword(e.target.value)} required autoComplete="current-password" />
                                                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                                                                </div>
                                                                <button type="submit" disabled={authLoading} className="w-full py-2.5 rounded-xl font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50" style={{ background: colors.accent, color: colors.accentText }}>{authLoading ? 'Entrando...' : 'Entrar'}</button>
                                                            </form>
                                                        ) : (
                                                            <form onSubmit={handleRegister} className="space-y-3">
                                                                <input type="text" placeholder="Nome Completo" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authName} onChange={e => setAuthName(e.target.value)} required autoComplete="name" />
                                                                <div className="flex items-center gap-1 border-2 rounded-xl px-3" style={{ background: colors.surface, borderColor: colors.border }}>
                                                                    <span className="text-[9px] font-black" style={{ color: colors.textSecondary }}>iuser.com.br/</span>
                                                                    <input type="text" placeholder="seu-perfil" className="flex-1 py-2.5 bg-transparent text-sm outline-none" style={{ color: colors.textPrimary }} value={authProfileSlug} onChange={e => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} required autoComplete="off" />
                                                                    {isSlugAvailable !== null && <span className={`text-[9px] font-black ${isSlugAvailable ? 'text-green-500' : 'text-red-500'}`}>{isSlugAvailable ? '✓' : '✗'}</span>}
                                                                </div>
                                                                <input type="email" placeholder="seu@email.com" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authEmail} onChange={e => setAuthEmail(e.target.value)} required autoComplete="email" />
                                                                <input type={showPassword ? 'text' : 'password'} placeholder="Senha" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authPassword} onChange={e => setAuthPassword(e.target.value)} required autoComplete="new-password" />
                                                                <input type={showPassword ? 'text' : 'password'} placeholder="Confirmar senha" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authConfirmPassword} onChange={e => setAuthConfirmPassword(e.target.value)} required autoComplete="new-password" />
                                                                <button type="submit" disabled={authLoading || isSlugAvailable === false} className="w-full py-2.5 rounded-xl font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50" style={{ background: colors.accent, color: colors.accentText }}>{authLoading ? 'Criando...' : 'Criar Conta'}</button>
                                                            </form>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Seção Meus Pedidos */}
                            {currentUserId && (
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                                            <Package size={16} style={{ color: colors.accentText }} />
                                        </div>
                                        <h2 className="text-base font-black italic uppercase tracking-tighter" style={{ color: colors.textPrimary }}>
                                            Meus Pedidos
                                        </h2>
                                        <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                                            {filteredGroupedOrders.length}
                                        </span>
                                    </div>

                                    {filteredGroupedOrders.length === 0 ? (
                                        <div className="flex items-center gap-4 p-4 rounded-2xl" style={cardStyle}>
                                            <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: `${colors.accent}20` }}>
                                                <Package className="w-7 h-7" style={{ color: colors.accent }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h2 className="text-sm font-black" style={{ color: colors.textPrimary }}>Nenhum pedido ainda</h2>
                                                <p className="text-xs" style={{ color: colors.textSecondary }}>Seus pedidos aparecerão aqui</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {filteredGroupedOrders.map((order: any) => (
                                                <OrderCard key={order.checkout_id} order={order} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Seção Avaliações Pendentes */}
                            {pendingReviews.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` }}>
                                            <Star size={16} style={{ color: colors.accentText }} />
                                        </div>
                                        <h2 className="text-base font-black italic uppercase tracking-tighter" style={{ color: colors.textPrimary }}>
                                            Avaliações Pendentes
                                        </h2>
                                        <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                                            {pendingReviews.length}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        {pendingReviews.map((item: any) => (
                                            <div key={item.product_id} className="rounded-2xl p-4 flex items-center justify-between shadow-sm" style={cardStyle}>
                                                <div className="flex-1">
                                                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{item.product_name}</p>
                                                    <p className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>
                                                        Comprado em {new Date(item.created_at).toLocaleDateString('pt-BR')}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => setReviewOrder({
                                                        isOpen: true,
                                                        orderId: item.checkout_id || item.id,
                                                        productId: item.product_id,
                                                        productName: item.product_name,
                                                        storeId: item.store_id,
                                                    })}
                                                    className="px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all"
                                                    style={{ background: colors.accent, color: colors.accentText }}
                                                >
                                                    Avaliar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Botões flutuantes: Voltar + Início */}
                <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                    <button
                        onClick={() => router.back()}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                            color: colors.accentText,
                            border: `2px solid ${colors.border}`,
                            boxShadow: `0 8px 24px ${colors.accent}60`,
                        }}
                        aria-label="Voltar para a página anterior"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                        style={{
                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                            color: colors.accentText,
                            border: `2px solid ${colors.border}`,
                            boxShadow: `0 8px 24px ${colors.accent}60`,
                        }}
                        aria-label="Ir para o início"
                    >
                        <Home size={24} />
                    </button>
                </div>
            </main>

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