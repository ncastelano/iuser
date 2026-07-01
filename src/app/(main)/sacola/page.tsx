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
    Package,
    ShoppingBag,
    MapPin,
    ArrowLeft,
    Home,
    Star,
    Truck,
    QrCode,
    CreditCard,
    Banknote,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ReviewModal } from '@/components/ratings/ReviewModal'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'

// ----- Tipagem para dados de entrega -----
interface StoreDeliveryInfo {
    delivery_type: string | null
    delivery_fee: number | null
    delivery_fee_per_km: number | null
    store_lat: number | null
    store_lng: number | null
}

// ----- Haversine (distância em km) -----
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function SacolaPage() {
    const {
        itemsByStore,
        storeDetails,
        updateQuantity,
        removeItem,
        clearStoreCart,
        loadFromSupabase,
        syncToSupabase,
    } = useCartStore()

    const router = useRouter()
    const { colors } = useTheme()

    const [mounted, setMounted] = useState(false)
    const [viewOrder, setViewOrder] = useState<'carrinho' | 'pedidos' | 'avaliar'>('carrinho')
    const [globalLoading, setGlobalLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)

    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
    const [myPurchases, setMyPurchases] = useState<any[]>([])
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

    const [pendingReviews, setPendingReviews] = useState<any[]>([])
    const [loadingPendingReviews, setLoadingPendingReviews] = useState(false)

    // Configurações individuais por loja
    const [storeConfigs, setStoreConfigs] = useState<Record<string, {
        accepts_delivery: boolean
        accepts_pickup: boolean
        accepts_pix: boolean
        accepts_card: boolean
        accepts_cash: boolean
    }>>({})

    // Opções selecionadas por loja
    const [deliveryOptionByStore, setDeliveryOptionByStore] = useState<Record<string, 'entrega' | 'retirada'>>({})
    const [paymentMethodByStore, setPaymentMethodByStore] = useState<Record<string, 'pix' | 'cartao' | 'dinheiro'>>({})

    // Cache dos dados de entrega da loja (usado apenas na exibição da sacola)
    const [storeDeliveryInfo, setStoreDeliveryInfo] = useState<Record<string, StoreDeliveryInfo>>({})

    // ----- Funções auxiliares (atualizadas para orders + order_items) -----
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

            // Busca apenas na nova estrutura orders + order_items
            const { data: ordersData } = await supabase
                .from('orders')
                .select(`
                    *,
                    order_items (*),
                    stores:store_id ( name )
                `)
                .eq('buyer_id', userId)
                .order('created_at', { ascending: false })

            let allPurchases: any[] = []

            if (ordersData) {
                allPurchases = ordersData.flatMap((o: any) => {
                    return o.order_items.map((i: any) => ({
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
                        delivery_fee: Number(o.delivery_fee || 0),
                        delivery_address: o.delivery_address,
                        delivery_option: o.delivery_option,
                        payment_method: o.payment_method,
                    }))
                })
            }

            setMyPurchases(allPurchases)

            // Atualiza os pedidos finalizados recentes com status do banco
            setFinishedOrders((prev) => {
                if (prev.length === 0) return prev
                return prev.map((order) => {
                    const updated = allPurchases.find(
                        (p) => p.checkout_id === order.checkout_id
                    )
                    if (updated) return { ...order, status: updated.status }
                    return order
                }).filter(Boolean)
            })

            await fetchPendingReviews(userId)
        },
        [supabase]
    )

    const fetchPendingReviews = async (userId: string) => {
        setLoadingPendingReviews(true)
        try {
            // Busca somente da nova estrutura orders + order_items
            const { data: orderItemsRaw } = await supabase
                .from('orders')
                .select('id, checkout_id, store_id, created_at, order_items(product_id, product_name, total_price)')
                .eq('buyer_id', userId)
                .eq('status', 'paid')

            const allPaidItems: any[] = []
            orderItemsRaw?.forEach((order) => {
                order.order_items?.forEach((item: any) => {
                    allPaidItems.push({
                        id: item.product_id,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        store_id: order.store_id,
                        checkout_id: order.checkout_id,
                        price: item.total_price,
                        created_at: order.created_at,
                    })
                })
            })

            const { data: reviews } = await supabase
                .from('product_reviews')
                .select('product_id')
                .eq('profile_id', userId)

            const reviewedProductIds = new Set(reviews?.map((r) => r.product_id) || [])

            const pending = allPaidItems.filter((item) => !reviewedProductIds.has(item.product_id))
            const uniquePending = Array.from(new Map(pending.map((item) => [item.product_id, item])).values())

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
        if (!currentUserId) return
        const localItems = useCartStore.getState().itemsByStore
        const localDetails = useCartStore.getState().storeDetails

        loadFromSupabase(currentUserId).then(() => {
            const state = useCartStore.getState()
            let changed = false
            for (const slug of Object.keys(localItems)) {
                const localStoreItems = localItems[slug]
                const currentStoreItems = state.itemsByStore[slug] || []
                for (const localItem of localStoreItems) {
                    const exists = currentStoreItems.some(
                        (item) => item.product.id === localItem.product.id
                    )
                    if (!exists) {
                        state.addItem(slug, localDetails[slug] || { name: '', logo_url: null }, localItem.product)
                        state.updateQuantity(slug, localItem.product.id, localItem.quantity - 1)
                        changed = true
                    }
                }
            }
            if (changed) {
                syncToSupabase(currentUserId)
            }
        })
    }, [currentUserId, loadFromSupabase, syncToSupabase])

    useEffect(() => {
        if (!currentUserId) return
        const timer = setTimeout(() => {
            syncToSupabase(currentUserId)
        }, 500)
        return () => clearTimeout(timer)
    }, [itemsByStore, currentUserId, syncToSupabase])

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

    // Listener em tempo real apenas na tabela orders (removeu store_sales)
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
                    setMyPurchases((prev) => {
                        const existing = prev.find((p) => p.checkout_id === checkoutId)
                        if (!existing) return prev
                        if (existing.status !== newStatus) {
                            if (newStatus === 'preparing') toast.info('👨‍🍳 O lojista começou a preparar seu pedido!')
                            if (newStatus === 'ready') toast.success('✅ Seu pedido está pronto!')
                            if (newStatus === 'paid') toast.success('🎉 Pedido finalizado com sucesso!')
                            if (newStatus === 'rejected') toast.error('❌ Seu pedido foi recusado pelo lojista.')
                        }
                        return prev.map((p) =>
                            p.checkout_id === checkoutId ? { ...p, status: newStatus } : p
                        )
                    })
                    setFinishedOrders((prev) => {
                        const hasMatch = prev.some(
                            (o) => o.checkout_id === checkoutId || o.id === payload.new.id
                        )
                        if (!hasMatch) return prev
                        return prev.map((o) =>
                            o.checkout_id === checkoutId || o.id === payload.new.id
                                ? { ...o, status: newStatus }
                                : o
                        )
                    })
                }
            )
            .subscribe()
        const interval = setInterval(() => loadUserData(currentUserId), 8000)
        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [currentUserId, supabase, loadUserData])

    // Busca configurações das lojas do carrinho e inicializa seleções
    useEffect(() => {
        const storeSlugs = Object.keys(itemsByStore)
        if (storeSlugs.length === 0) {
            setStoreConfigs({})
            setDeliveryOptionByStore({})
            setPaymentMethodByStore({})
            setStoreDeliveryInfo({})
            return
        }

        const fetchConfigs = async () => {
            const { data } = await supabase
                .from('stores')
                .select('storeSlug, accepts_delivery, accepts_pickup, accepts_pix, accepts_card, accepts_cash, delivery_type, delivery_fee, delivery_fee_per_km, store_lat, store_lng')
                .in('storeSlug', storeSlugs)

            if (data) {
                const configs: Record<string, any> = {}
                const defaultDelivery: Record<string, 'entrega' | 'retirada'> = {}
                const defaultPayment: Record<string, 'pix' | 'cartao' | 'dinheiro'> = {}
                const deliveryInfo: Record<string, any> = {}

                data.forEach(s => {
                    configs[s.storeSlug] = {
                        accepts_delivery: s.accepts_delivery,
                        accepts_pickup: s.accepts_pickup,
                        accepts_pix: s.accepts_pix,
                        accepts_card: s.accepts_card,
                        accepts_cash: s.accepts_cash,
                    }

                    deliveryInfo[s.storeSlug] = {
                        delivery_type: s.delivery_type,
                        delivery_fee: s.delivery_fee,
                        delivery_fee_per_km: s.delivery_fee_per_km,
                        store_lat: s.store_lat,
                        store_lng: s.store_lng,
                    }

                    if (s.accepts_delivery) {
                        defaultDelivery[s.storeSlug] = 'entrega'
                    } else if (s.accepts_pickup) {
                        defaultDelivery[s.storeSlug] = 'retirada'
                    }

                    if (s.accepts_pix) defaultPayment[s.storeSlug] = 'pix'
                    else if (s.accepts_card) defaultPayment[s.storeSlug] = 'cartao'
                    else if (s.accepts_cash) defaultPayment[s.storeSlug] = 'dinheiro'
                })

                setStoreConfigs(configs)
                setDeliveryOptionByStore(prev => ({ ...defaultDelivery, ...prev }))
                setPaymentMethodByStore(prev => ({ ...defaultPayment, ...prev }))
                setStoreDeliveryInfo(deliveryInfo)
            }
        }
        fetchConfigs()
    }, [itemsByStore])

    // ---- Handler de finalização por loja (orders + order_items) ----
    const handleFinalizarLoja = async (slug: string) => {
        if (!currentUserId) return
        setCheckoutLoading(slug)

        try {
            const items = itemsByStore[slug]
            const details = storeDetails[slug]

            // Busca os dados de entrega DIRETAMENTE no banco, ignorando o estado
            const { data: storeDeliveryData } = await supabase
                .from('stores')
                .select('delivery_type, delivery_fee, delivery_fee_per_km, store_lat, store_lng')
                .eq('storeSlug', slug)
                .single()

            // Garante um objeto com todas as propriedades, mesmo se não encontrado
            const deliveryInfo: StoreDeliveryInfo = storeDeliveryData || {
                delivery_type: null,
                delivery_fee: null,
                delivery_fee_per_km: null,
                store_lat: null,
                store_lng: null,
            }

            const itemsTotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)

            const { data: storeData } = await supabase
                .from('stores')
                .select('id, owner_id, whatsapp, storeSlug')
                .eq('storeSlug', slug)
                .single()

            if (!storeData) {
                toast.error('Loja não encontrada')
                setCheckoutLoading(null)
                return
            }

            const deliveryOpt = deliveryOptionByStore[slug] || 'retirada'
            const paymentOpt = paymentMethodByStore[slug] || 'pix'

            if (deliveryOpt === 'entrega' && !addressInput.trim()) {
                toast.error('Informe o endereço de entrega.')
                setCheckoutLoading(null)
                return
            }

            const address = deliveryOpt === 'entrega' ? addressInput.trim() : 'Retirada no local'

            // Geocodificação (opcional — não bloqueia o pedido se falhar)
            let deliveryLat: number | null = null
            let deliveryLng: number | null = null
            if (deliveryOpt === 'entrega' && addressInput.trim()) {
                try {
                    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
                    if (token) {
                        const res = await fetch(
                            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressInput)}.json?access_token=${token}&limit=1&country=BR`
                        )
                        const geoData = await res.json()
                        if (geoData?.features?.length > 0) {
                            const [lng, lat] = geoData.features[0].center
                            deliveryLat = lat
                            deliveryLng = lng
                        }
                    }
                } catch (e) {
                    console.warn('[Checkout] Geocodificação falhou:', e)
                }
            }

            // Cálculo do frete (agora usando deliveryInfo tipado corretamente)
            let deliveryFee = 0
            if (deliveryOpt === 'entrega') {
                const dtype = deliveryInfo.delivery_type
                if (dtype === 'fixed') {
                    deliveryFee = Number(deliveryInfo.delivery_fee) || 0
                } else if (dtype === 'distance') {
                    const feePerKm = Number(deliveryInfo.delivery_fee_per_km) || 0
                    const storeLat = deliveryInfo.store_lat
                    const storeLng = deliveryInfo.store_lng
                    if (storeLat != null && storeLng != null && deliveryLat != null && deliveryLng != null) {
                        const dist = getDistanceKm(storeLat, storeLng, deliveryLat, deliveryLng)
                        deliveryFee = dist * feePerKm
                    } else {
                        toast.error('Não foi possível calcular a distância. Verifique o endereço.')
                        setCheckoutLoading(null)
                        return
                    }
                }
                // 'free' mantém deliveryFee = 0
            }

            const finalTotal = itemsTotal + deliveryFee
            const checkout_id = crypto.randomUUID()

            // 1. Inserir pedido principal em orders
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    store_id: storeData.id,
                    buyer_id: currentUserId,
                    buyer_name: (currentUserName || authName || 'Cliente').trim(),
                    buyer_profile_slug: (currentUserSlug || currentUserId).trim(),
                    total_amount: finalTotal,
                    delivery_fee: deliveryFee,
                    delivery_option: deliveryOpt,
                    payment_method: paymentOpt,
                    delivery_address: address,
                    delivery_lat: deliveryLat,
                    delivery_lng: deliveryLng,
                    status: 'pending',
                    checkout_id,
                })
                .select()
                .single()

            if (orderError) {
                console.error('[Checkout] Erro ao inserir order:', orderError)
                toast.error(`Erro ao criar pedido: ${orderError.message}`)
                setCheckoutLoading(null)
                return
            }

            // 2. Inserir itens em order_items
            const orderItemsToInsert = items.map((item) => ({
                order_id: orderData.id,
                product_id: item.product.id,
                product_name: item.product.name,
                quantity: item.quantity,
                unit_price: item.product.price,
                total_price: item.product.price * item.quantity,
            }))

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItemsToInsert)

            if (itemsError) {
                console.error('[Checkout] Erro ao inserir order_items:', itemsError)
                // Rollback: apaga o order criado
                await supabase.from('orders').delete().eq('id', orderData.id)
                toast.error(`Erro ao salvar itens: ${itemsError.message}`)
                setCheckoutLoading(null)
                return
            }

            // 3. Atualizar endereço salvo no perfil
            if (addressInput.trim()) {
                await supabase
                    .from('profiles')
                    .update({ address: addressInput.trim() })
                    .eq('id', currentUserId)
                setUserAddress(addressInput.trim())
            }

            // 4. Limpar carrinho e recarregar dados
            clearStoreCart(slug)
            await loadUserData(currentUserId)
            await syncToSupabase(currentUserId)

            // 5. Notificar lojista via WhatsApp (último item da sacola)
            const remainingSlugs = Object.keys(itemsByStore).filter(s => s !== slug)
            if (remainingSlugs.length === 0) {
                try {
                    const { data: storeForWa } = await supabase
                        .from('stores')
                        .select('whatsapp, owner_id')
                        .eq('storeSlug', slug)
                        .single()
                    let whatsapp = storeForWa?.whatsapp
                    if (!whatsapp && storeForWa?.owner_id) {
                        const { data: owner } = await supabase
                            .from('profiles')
                            .select('whatsapp')
                            .eq('id', storeForWa.owner_id)
                            .single()
                        whatsapp = owner?.whatsapp
                    }
                    if (whatsapp) {
                        const paymentLabel = paymentOpt === 'pix' ? 'PIX' : paymentOpt === 'cartao' ? 'Cartão' : 'Dinheiro'
                        const deliveryLabel = deliveryOpt === 'entrega'
                            ? `Entrega (${address})${deliveryFee > 0 ? ` - Taxa: R$ ${deliveryFee.toFixed(2)}` : ' - Grátis'}`
                            : 'Retirada no Balcão'
                        const message = encodeURIComponent(
                            `*Novo Pedido - iUser*\n\n` +
                            `*Cliente:* @${currentUserSlug || 'cliente'}\n` +
                            `*Pagamento:* ${paymentLabel}\n` +
                            `*Entrega:* ${deliveryLabel}\n` +
                            `*Itens:*\n${items.map((i: any) => `- ${i.quantity}x ${i.product.name} (R$ ${i.product.price.toFixed(2)})`).join('\n')}\n\n` +
                            `*Subtotal: R$ ${itemsTotal.toFixed(2)}*\n` +
                            `*Taxa de entrega: R$ ${deliveryFee.toFixed(2)}*\n` +
                            `*Total: R$ ${finalTotal.toFixed(2)}*`
                        )
                        window.open(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${message}`, '_blank')
                    }
                } catch (waErr) {
                    console.warn('[Checkout] Falha ao abrir WhatsApp:', waErr)
                }
            }

            // 6. Estado local imediato para exibição do card de confirmação
            setFinishedOrders(prev => [...prev, {
                id: orderData.id,
                checkout_id,
                store_id: storeData.id,
                store_name: details?.name || slug,
                storeName: details?.name || slug,
                total_amount: finalTotal,
                deliveryFee: deliveryFee,
                status: 'pending',
                created_at: orderData.created_at,
                items: items.map(item => ({
                    product_id: item.product.id,
                    product_name: item.product.name,
                    quantity: item.quantity,
                    unit_price: item.product.price,
                    price: item.product.price * item.quantity,
                })),
            }])

            toast.success('Pedido realizado com sucesso! 🎉')
        } catch (err: any) {
            console.error('[Checkout] Erro inesperado:', err)
            toast.error(`Erro inesperado: ${err?.message ?? 'Tente novamente.'}`)
        } finally {
            setCheckoutLoading(null)
        }
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)
        const { data, error } = await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword,
        })
        if (error) {
            setAuthError('Email ou senha inválidos')
            setAuthLoading(false)
            return
        }
        if (data.user) await loadUserData(data.user.id)
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
            options: { data: { full_name: authName, slug: authProfileSlug } },
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
                profileSlug: authProfileSlug,
            })
            await loadUserData(data.user.id)
        }
        setAuthLoading(false)
    }

    const getStatusColor = (status: string) => {
        const colorMap: Record<string, string> = {
            pending: '#DBEAFE',
            preparing: '#FEF3C7',
            ready: '#EDE9FE',
            paid: '#D1FAE5',
            rejected: '#FEE2E2',
        }
        return colorMap[status] || '#F3F4F6'
    }

    const getStatusStyles = (status: string) => {
        const styles: any = {
            pending: { badge: 'bg-blue-100 text-blue-800 border border-blue-200', label: 'Pendente', icon: '⏳', message: 'Aguardando confirmação do vendedor' },
            preparing: { badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200', label: 'Preparando', icon: '👨‍🍳', message: 'O lojista está preparando seu pedido' },
            ready: { badge: 'bg-purple-100 text-purple-800 border border-purple-200', label: 'Pronto', icon: '✅', message: 'Seu pedido está pronto para retirada!' },
            paid: { badge: 'bg-green-100 text-green-800 border border-green-200', label: 'Finalizado', icon: '🎉', message: 'Pedido finalizado com sucesso' },
            rejected: { badge: 'bg-red-100 text-red-800 border border-red-200', label: 'Recusado', icon: '❌', message: 'O pedido foi recusado pelo vendedor' },
        }
        return styles[status] || styles.pending
    }

    const storeSlugs = Object.keys(itemsByStore)
    const filteredCartSlugs = useMemo(() => {
        if (!searchQuery.trim()) return storeSlugs
        const q = searchQuery.toLowerCase()
        return storeSlugs.filter((slug) => {
            const details = storeDetails[slug]
            const storeName = (details?.name || slug).toLowerCase()
            if (storeName.includes(q)) return true
            const items = itemsByStore[slug]
            return items.some((item) => item.product.name.toLowerCase().includes(q))
        })
    }, [storeSlugs, searchQuery, itemsByStore, storeDetails])

    const filteredPurchases = useMemo(() => {
        if (!searchQuery.trim()) return myPurchases
        const q = searchQuery.toLowerCase()
        return myPurchases.filter(
            (p) =>
                (p.store_name || '').toLowerCase().includes(q) ||
                (p.product_name || '').toLowerCase().includes(q)
        )
    }, [myPurchases, searchQuery])

    const filteredGroupedOrders = useMemo(() => {
        const source = searchQuery.trim() ? filteredPurchases : myPurchases
        const groups: Record<string, any> = {}
        source.forEach((p: any) => {
            if (!groups[p.checkout_id]) {
                groups[p.checkout_id] = {
                    checkout_id: p.checkout_id,
                    store_name: p.store_name,
                    store_id: p.store_id,
                    created_at: p.created_at,
                    status: p.status,
                    total_amount: 0,
                    deliveryFee: Number(p.delivery_fee || 0),
                    delivery_address: p.delivery_address,
                    items: [],
                }
            }
            groups[p.checkout_id].items.push({
                product_id: p.product_id,
                product_name: p.product_name,
                quantity: p.quantity,
                unit_price: p.unit_price,
                price: p.price, // total do item
            })
            groups[p.checkout_id].total_amount += Number(p.price || 0)
        })
        // Adiciona o frete ao total_amount (já está no total_amount do pedido, mas estamos recalculando)
        Object.values(groups).forEach((group: any) => {
            group.total_amount = group.total_amount + group.deliveryFee
        })
        let grouped = Object.values(groups)
        const statusOrder: Record<string, number> = {
            ready: 1,
            preparing: 2,
            pending: 3,
            paid: 4,
            rejected: 5,
        }
        grouped.sort((a: any, b: any) => {
            const orderA = statusOrder[a.status] || 99
            const orderB = statusOrder[b.status] || 99
            if (orderA !== orderB) return orderA - orderB
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        return grouped
    }, [myPurchases, filteredPurchases, searchQuery])

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

    const OrderCard = ({ order }: { order: any }) => {
        const statusStyle = getStatusStyles(order.status)
        const bgColor = getStatusColor(order.status)
        return (
            <div
                className="rounded-2xl p-4 shadow-sm"
                style={{
                    background: bgColor,
                    border: `1px solid ${colors.border}`,
                    color: '#000',
                }}
            >
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-black italic" style={{ color: '#000' }}>
                        {order.storeName || order.store_name}
                    </h3>
                    <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${statusStyle.badge}`}>
                        {statusStyle.icon} {statusStyle.label}
                    </span>
                </div>
                <div className="w-full bg-white/50 rounded-full h-2 mb-3 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                            width:
                                order.status === 'pending' ? '25%' :
                                    order.status === 'preparing' ? '50%' :
                                        order.status === 'ready' ? '75%' :
                                            order.status === 'paid' ? '100%' : '100%',
                            background:
                                order.status === 'pending' ? '#3b82f6' :
                                    order.status === 'preparing' ? '#eab308' :
                                        order.status === 'ready' ? '#a855f7' :
                                            order.status === 'paid' ? '#10b981' : '#ef4444',
                        }}
                    ></div>
                </div>
                <div className="space-y-2">
                    {order.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="font-bold" style={{ color: '#000' }}>
                                {item.quantity}x {item.product_name}
                            </span>
                            <div className="flex items-center gap-3">
                                <span className="font-black" style={{ color: '#000' }}>
                                    R$ {Number(item.price).toFixed(2)}
                                </span>
                                {order.status === 'paid' && (
                                    <button
                                        onClick={() =>
                                            setReviewOrder({
                                                isOpen: true,
                                                orderId: order.id,
                                                productId: item.product_id,
                                                productName: item.product_name,
                                                storeId: order.store_id,
                                            })
                                        }
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
                <div className="flex justify-between items-center mt-3 pt-2 border-t border-black/20">
                    <span className="text-[8px] font-black uppercase" style={{ color: '#000' }}>Total</span>
                    <div className="text-right">
                        <span className="text-xl font-black block" style={{ color: '#000' }}>
                            R$ {Number(order.total_amount).toFixed(2)}
                        </span>
                        {Number(order.deliveryFee) > 0 && (
                            <span className="text-[9px] font-bold text-black/60 block -mt-1">
                                (frete R$ {Number(order.deliveryFee).toFixed(2)})
                            </span>
                        )}
                    </div>
                </div>
                <div className={`mt-3 text-[10px] font-bold text-center py-2 rounded-lg ${statusStyle.badge}`}>
                    {statusStyle.icon} {statusStyle.message}
                </div>
            </div>
        )
    }

    // Função para calcular os totais incluindo a taxa de entrega (exibição na sacola)
    const getStoreTotals = (slug: string) => {
        const items = itemsByStore[slug] || []
        const itemsTotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
        const deliveryOpt = deliveryOptionByStore[slug] || 'retirada'
        let deliveryFee = 0
        if (deliveryOpt === 'entrega') {
            const info = storeDeliveryInfo[slug]
            if (info) {
                if (info.delivery_type === 'fixed') {
                    deliveryFee = info.delivery_fee || 0
                } else if (info.delivery_type === 'distance') {
                    // Será exibido "a calcular"
                    return { itemsTotal, deliveryFee: -1, finalTotal: itemsTotal }
                }
                // free mantém 0
            }
        }
        const finalTotal = deliveryFee >= 0 ? itemsTotal + deliveryFee : itemsTotal
        return { itemsTotal, deliveryFee, finalTotal }
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

                    {finishedOrders.length === 0 && (
                        <div className="space-y-6">
                            {/* Aba Sacola */}
                            {viewOrder === 'carrinho' && (
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
                                            {filteredCartSlugs.map((slug) => {
                                                const details = storeDetails[slug]
                                                const items = itemsByStore[slug]
                                                const config = storeConfigs[slug] || {}
                                                const { itemsTotal, deliveryFee, finalTotal } = getStoreTotals(slug)
                                                const deliveryOpt = deliveryOptionByStore[slug] || 'retirada'
                                                const paymentOpt = paymentMethodByStore[slug] || 'pix'

                                                const canDelivery = config.accepts_delivery
                                                const canPickup = config.accepts_pickup
                                                const canPix = config.accepts_pix
                                                const canCard = config.accepts_card
                                                const canCash = config.accepts_cash

                                                return (
                                                    <div key={slug} className="rounded-2xl p-5 mb-4 border" style={{ borderColor: colors.border, background: colors.surface }}>
                                                        {/* Cabeçalho da loja */}
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-2">
                                                                <Store size={18} style={{ color: colors.accent }} />
                                                                <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: colors.textPrimary }}>{details?.name || slug}</h3>
                                                            </div>
                                                            <span className="text-lg font-black" style={{ color: colors.accent }}>R$ {itemsTotal.toFixed(2)}</span>
                                                        </div>

                                                        {/* Itens */}
                                                        <div className="space-y-3 mb-4">
                                                            {items.map((item) => (
                                                                <div key={item.product.id} className="flex gap-3 items-center">
                                                                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                                                        {item.product.image_url ? (
                                                                            <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-400">?</div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{item.product.name}</p>
                                                                        <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>
                                                                            R$ {item.product.price.toFixed(2)} cada
                                                                        </p>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <div className="flex items-center border rounded-lg" style={{ borderColor: colors.border }}>
                                                                                <button onClick={() => updateQuantity(slug, item.product.id, -1)} className="w-6 h-6 flex items-center justify-center"><Minus size={12} /></button>
                                                                                <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                                                                                <button onClick={() => updateQuantity(slug, item.product.id, 1)} className="w-6 h-6 flex items-center justify-center"><Plus size={12} /></button>
                                                                            </div>
                                                                            <button onClick={() => removeItem(slug, item.product.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                                                        </div>
                                                                    </div>
                                                                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                                        R$ {(item.product.price * item.quantity).toFixed(2)}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Resumo de valores */}
                                                        <div className="border-t pt-3 space-y-1 text-xs" style={{ borderColor: colors.border }}>
                                                            <div className="flex justify-between">
                                                                <span style={{ color: colors.textSecondary }}>Subtotal</span>
                                                                <span className="font-bold" style={{ color: colors.textPrimary }}>R$ {itemsTotal.toFixed(2)}</span>
                                                            </div>
                                                            {deliveryOpt === 'entrega' && (
                                                                <div className="flex justify-between">
                                                                    <span style={{ color: colors.textSecondary }}>Taxa de entrega</span>
                                                                    {deliveryFee >= 0 ? (
                                                                        <span className="font-bold" style={{ color: colors.accent }}>
                                                                            {deliveryFee === 0 ? 'Grátis' : `R$ ${deliveryFee.toFixed(2)}`}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="italic" style={{ color: colors.textSecondary }}>a calcular</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between pt-1 border-t" style={{ borderColor: colors.border }}>
                                                                <span className="font-bold" style={{ color: colors.textPrimary }}>Total</span>
                                                                <span className="font-bold text-base" style={{ color: colors.accent }}>R$ {finalTotal.toFixed(2)}</span>
                                                            </div>
                                                        </div>

                                                        {/* Opções de entrega/pagamento por loja */}
                                                        {currentUserId && (
                                                            <div className="mt-4 space-y-3">
                                                                <div>
                                                                    <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Recebimento</p>
                                                                    <div className="flex gap-2">
                                                                        {canDelivery && (
                                                                            <button
                                                                                onClick={() => setDeliveryOptionByStore(prev => ({ ...prev, [slug]: 'entrega' }))}
                                                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${deliveryOpt === 'entrega' ? 'text-white' : ''}`}
                                                                                style={deliveryOpt === 'entrega' ? { background: colors.accent, color: colors.accentText } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                            >
                                                                                <Truck size={14} /> Entrega
                                                                            </button>
                                                                        )}
                                                                        {canPickup && (
                                                                            <button
                                                                                onClick={() => setDeliveryOptionByStore(prev => ({ ...prev, [slug]: 'retirada' }))}
                                                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${deliveryOpt === 'retirada' ? 'text-white' : ''}`}
                                                                                style={deliveryOpt === 'retirada' ? { background: colors.accent, color: colors.accentText } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                            >
                                                                                <Store size={14} /> Retirada
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    {deliveryOpt === 'entrega' && (
                                                                        <div className="mt-2">
                                                                            {userAddress && !isEditingAddress ? (
                                                                                <div className="flex items-center gap-2 text-xs p-2 rounded-xl" style={{ background: `${colors.accent}10`, color: colors.textPrimary }}>
                                                                                    <MapPin size={14} style={{ color: colors.accent }} />
                                                                                    <span className="flex-1">{userAddress}</span>
                                                                                    <button onClick={() => setIsEditingAddress(true)} className="font-bold" style={{ color: colors.accent }}>Mudar</button>
                                                                                </div>
                                                                            ) : (
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="Endereço de entrega"
                                                                                    className="w-full border rounded-lg px-3 py-1.5 text-xs"
                                                                                    style={{ background: colors.surface, borderColor: colors.accent, color: colors.textPrimary }}
                                                                                    value={addressInput}
                                                                                    onChange={(e) => setAddressInput(e.target.value)}
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Pagamento</p>
                                                                    <div className="flex gap-2 flex-wrap">
                                                                        {canPix && (
                                                                            <button
                                                                                onClick={() => setPaymentMethodByStore(prev => ({ ...prev, [slug]: 'pix' }))}
                                                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentOpt === 'pix' ? 'text-white' : ''}`}
                                                                                style={paymentOpt === 'pix' ? { background: colors.accent, color: colors.accentText } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                            >
                                                                                <QrCode size={14} /> Pix
                                                                            </button>
                                                                        )}
                                                                        {canCard && (
                                                                            <button
                                                                                onClick={() => setPaymentMethodByStore(prev => ({ ...prev, [slug]: 'cartao' }))}
                                                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentOpt === 'cartao' ? 'text-white' : ''}`}
                                                                                style={paymentOpt === 'cartao' ? { background: colors.accent, color: colors.accentText } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                            >
                                                                                <CreditCard size={14} /> Cartão
                                                                            </button>
                                                                        )}
                                                                        {canCash && (
                                                                            <button
                                                                                onClick={() => setPaymentMethodByStore(prev => ({ ...prev, [slug]: 'dinheiro' }))}
                                                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentOpt === 'dinheiro' ? 'text-white' : ''}`}
                                                                                style={paymentOpt === 'dinheiro' ? { background: colors.accent, color: colors.accentText } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                                            >
                                                                                <Banknote size={14} /> Dinheiro
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleFinalizarLoja(slug)}
                                                                    disabled={checkoutLoading === slug}
                                                                    className="w-full py-3 rounded-xl font-black uppercase text-sm tracking-wider transition shadow-lg"
                                                                    style={{ background: colors.accent, color: colors.accentText }}
                                                                >
                                                                    {checkoutLoading === slug ? 'Finalizando...' : `Finalizar Pedido (R$ ${finalTotal.toFixed(2)})`}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                            {!currentUserId && storeSlugs.length > 0 && (
                                                <div className="rounded-2xl p-5" style={cardStyle}>
                                                    <p className="text-xs text-center mb-4" style={{ color: colors.textSecondary }}>Identifique-se para continuar</p>
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
                                                    {authError && <div className="p-3 border rounded-xl text-[8px] font-black uppercase text-center mt-3" style={{ background: `${colors.accent}20`, borderColor: colors.accent, color: colors.accent }}>⚠️ {authError}</div>}
                                                    {authMode === 'login' ? (
                                                        <form onSubmit={handleLogin} className="space-y-3 mt-3">
                                                            <input type="email" placeholder="seu@email.com" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required autoComplete="email" />
                                                            <div className="relative">
                                                                <input type={showPassword ? 'text' : 'password'} placeholder="sua senha" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm pr-10" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required autoComplete="current-password" />
                                                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                                                            </div>
                                                            <button type="submit" disabled={authLoading} className="w-full py-2.5 rounded-xl font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50" style={{ background: colors.accent, color: colors.accentText }}>{authLoading ? 'Entrando...' : 'Entrar'}</button>
                                                        </form>
                                                    ) : (
                                                        <form onSubmit={handleRegister} className="space-y-3 mt-3">
                                                            <input type="text" placeholder="Nome Completo" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authName} onChange={(e) => setAuthName(e.target.value)} required autoComplete="name" />
                                                            <div className="flex items-center gap-1 border-2 rounded-xl px-3" style={{ background: colors.surface, borderColor: colors.border }}>
                                                                <span className="text-[9px] font-black" style={{ color: colors.textSecondary }}>iuser.com.br/</span>
                                                                <input type="text" placeholder="seu-perfil" className="flex-1 py-2.5 bg-transparent text-sm outline-none" style={{ color: colors.textPrimary }} value={authProfileSlug} onChange={(e) => setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} required autoComplete="off" />
                                                                {isSlugAvailable !== null && <span className={`text-[9px] font-black ${isSlugAvailable ? 'text-green-500' : 'text-red-500'}`}>{isSlugAvailable ? '✓' : '✗'}</span>}
                                                            </div>
                                                            <input type="email" placeholder="seu@email.com" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required autoComplete="email" />
                                                            <input type={showPassword ? 'text' : 'password'} placeholder="Senha" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required autoComplete="new-password" />
                                                            <input type={showPassword ? 'text' : 'password'} placeholder="Confirmar senha" className="w-full border-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }} value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} required autoComplete="new-password" />
                                                            <button type="submit" disabled={authLoading || isSlugAvailable === false} className="w-full py-2.5 rounded-xl font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50" style={{ background: colors.accent, color: colors.accentText }}>{authLoading ? 'Criando...' : 'Criar Conta'}</button>
                                                        </form>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Aba Pedidos */}
                            {viewOrder === 'pedidos' && currentUserId && (
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

                            {/* Aba Avaliar */}
                            {viewOrder === 'avaliar' && pendingReviews.length > 0 && (
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
                                                    onClick={() =>
                                                        setReviewOrder({
                                                            isOpen: true,
                                                            orderId: item.checkout_id || item.id,
                                                            productId: item.product_id,
                                                            productName: item.product_name,
                                                            storeId: item.store_id,
                                                        })
                                                    }
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
                onClose={() => setReviewOrder((prev) => ({ ...prev, isOpen: false }))}
                orderId={reviewOrder.orderId}
                productId={reviewOrder.productId}
                productName={reviewOrder.productName}
                storeId={reviewOrder.storeId}
            />
        </div>
    )
}