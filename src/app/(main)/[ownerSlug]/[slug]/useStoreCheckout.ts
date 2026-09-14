// app/(main)/[ownerSlug]/[slug]/useStoreCheckout.ts
//
// Mesmas etapas de finalização de pedido da sacola do catálogo
// (CatalogoClientPage.tsx + CatalogBag.tsx: escolher retirada/entrega,
// endereço, forma de pagamento, criar o pedido) só que reutilizável fora
// da página de catálogo — usado pela sacola da loja na página de produto.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useCartStore, type CartItem } from '@/store/useCartStore'
import { isStoreOpenNow, getNextOpeningInfo, type BusinessHours } from '@/lib/storeHours'
import { toast } from 'sonner'

export type CheckoutStep = 'auth' | 'delivery' | 'payment' | null

interface StoreConfig {
    id: string
    accepts_delivery: boolean
    accepts_pickup: boolean
    accepts_pix: boolean
    accepts_card: boolean
    accepts_cash: boolean
    delivery_type: string | null
    delivery_fee: number | null
    delivery_fee_per_km: number | null
    delivery_base_distance: number | null
    delivery_base_fee: number | null
    store_lat: number | null
    store_lng: number | null
    store_address: string | null
    business_hours: BusinessHours | null
}

export function useStoreCheckout(ownerSlug: string | undefined, cartItems: CartItem[]) {
    const { userId } = useProfile()
    const { clearStoreCart, syncToSupabase } = useCartStore()

    const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null)

    useEffect(() => {
        if (!ownerSlug) return
        let active = true
        supabase
            .from('stores')
            .select('id, business_hours, accepts_delivery, accepts_pickup, accepts_pix, accepts_card, accepts_cash, delivery_type, delivery_fee, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, store_lat, store_lng, address')
            .eq('storeSlug', ownerSlug)
            .maybeSingle()
            .then(({ data }) => {
                if (!active || !data) return
                setStoreConfig({
                    id: data.id,
                    accepts_delivery: data.accepts_delivery || false,
                    accepts_pickup: data.accepts_pickup ?? true,
                    accepts_pix: data.accepts_pix || false,
                    accepts_card: data.accepts_card || false,
                    accepts_cash: data.accepts_cash || false,
                    delivery_type: data.delivery_type || null,
                    delivery_fee: data.delivery_fee || null,
                    delivery_fee_per_km: data.delivery_fee_per_km || null,
                    delivery_base_distance: data.delivery_base_distance || null,
                    delivery_base_fee: data.delivery_base_fee || null,
                    store_lat: data.store_lat || null,
                    store_lng: data.store_lng || null,
                    store_address: data.address || null,
                    business_hours: data.business_hours || null,
                })
            })
        return () => { active = false }
    }, [ownerSlug])

    const isStoreOpen = useMemo(() => isStoreOpenNow(storeConfig?.business_hours), [storeConfig?.business_hours])
    const nextAvailable = useMemo(() => {
        if (!storeConfig?.business_hours) return null
        const next = getNextOpeningInfo(storeConfig.business_hours)
        if (!next) return null
        return { day: next.dayLabel, open: next.time }
    }, [storeConfig?.business_hours])

    const canChooseReceivingMethod = !!(storeConfig?.accepts_delivery && storeConfig?.accepts_pickup)
    const onlyPickupAvailable = !!(storeConfig?.accepts_pickup && !storeConfig?.accepts_delivery)
    const onlyDeliveryAvailable = !!(storeConfig?.accepts_delivery && !storeConfig?.accepts_pickup)

    // ===== FINALIZAÇÃO =====
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>(null)
    const [deliveryOption, setDeliveryOption] = useState<'entrega' | 'retirada' | null>(null)
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao' | 'dinheiro' | null>(null)
    const [deliveryAddress, setDeliveryAddress] = useState('')
    const [deliveryLat, setDeliveryLat] = useState<number | null>(null)
    const [deliveryLng, setDeliveryLng] = useState<number | null>(null)
    const [locationSearchQuery, setLocationSearchQuery] = useState('')
    const [isSearchingLocation, setIsSearchingLocation] = useState(false)
    const [isEditingAddress, setIsEditingAddress] = useState(false)
    const [showAddressSearch, setShowAddressSearch] = useState(false)
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [userAddress, setUserAddress] = useState<string | null>(null)

    // Se a loja só tem uma forma de recebimento, já seleciona sozinha.
    useEffect(() => {
        if (!storeConfig || deliveryOption) return
        if (storeConfig.accepts_pickup && !storeConfig.accepts_delivery) setDeliveryOption('retirada')
        else if (storeConfig.accepts_delivery && !storeConfig.accepts_pickup) setDeliveryOption('entrega')
    }, [storeConfig, deliveryOption])

    // ===== DADOS DO COMPRADOR LOGADO =====
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)

    const loadUserData = useCallback(async (uid: string) => {
        setCurrentUserId(uid)
        const { data: profile } = await supabase
            .from('profiles')
            .select('profileSlug, name, address, store_lat, store_lng')
            .eq('id', uid)
            .single()
        if (profile) {
            setCurrentUserSlug(profile.profileSlug)
            setCurrentUserName(profile.name)
            setUserAddress(profile.address)
            if (profile.store_lat && profile.store_lng) {
                setUserLocation({ lat: profile.store_lat, lng: profile.store_lng })
            }
        }
    }, [])

    useEffect(() => {
        if (userId) loadUserData(userId)
    }, [userId, loadUserData])

    // ===== AUTENTICAÇÃO (login/cadastro antes de finalizar) =====
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
    const [authEmail, setAuthEmail] = useState('')
    const [authPassword, setAuthPassword] = useState('')
    const [authConfirmPassword, setAuthConfirmPassword] = useState('')
    const [authName, setAuthName] = useState('')
    const [authProfileSlug, setAuthProfileSlug] = useState('')
    const [authLoading, setAuthLoading] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)
    const [authAvatarFile, setAuthAvatarFile] = useState<File | null>(null)
    const [authAvatarPreview, setAuthAvatarPreview] = useState<string | null>(null)
    const authAvatarInputRef = useRef<HTMLInputElement>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null)
    const slugTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleAuthAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setAuthAvatarFile(file)
        const reader = new FileReader()
        reader.onloadend = () => setAuthAvatarPreview(reader.result as string)
        reader.readAsDataURL(file)
    }

    useEffect(() => {
        if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current)
        if (authProfileSlug.length < 3) {
            setIsSlugAvailable(null)
            return
        }
        slugTimeoutRef.current = setTimeout(async () => {
            const { data } = await supabase.from('profiles').select('profileSlug').eq('profileSlug', authProfileSlug).single()
            setIsSlugAvailable(!data)
        }, 500)
        return () => { if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current) }
    }, [authProfileSlug])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthLoading(true)
        setAuthError(null)
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        if (error) {
            setAuthError('Email ou senha inválidos')
            setAuthLoading(false)
            return
        }
        if (data.user) {
            await loadUserData(data.user.id)
            setCheckoutStep('delivery')
            toast.success('Login realizado com sucesso!')
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
        if (!authAvatarFile) {
            setAuthError('Adicione uma foto de perfil para continuar')
            setAuthLoading(false)
            return
        }
        if (!authProfileSlug || !/^[a-z0-9-]+$/.test(authProfileSlug)) {
            setAuthError('O link do perfil deve conter apenas letras, números e hifens')
            setAuthLoading(false)
            return
        }
        const { data: slugCheck } = await supabase.from('profiles').select('profileSlug').eq('profileSlug', authProfileSlug).single()
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
            let avatarUrl: string | null = null
            if (authAvatarFile) {
                const fileExt = authAvatarFile.name.split('.').pop()
                const fileName = `${data.user.id}-${Date.now()}.${fileExt}`
                const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, authAvatarFile, { upsert: true })
                if (uploadError) {
                    setAuthError(`Erro ao enviar foto de perfil: ${uploadError.message}`)
                    setAuthLoading(false)
                    return
                }
                avatarUrl = supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl
            }
            await supabase.from('profiles').upsert({ id: data.user.id, name: authName, profileSlug: authProfileSlug, avatar_url: avatarUrl })
            await loadUserData(data.user.id)
            setCheckoutStep('delivery')
            toast.success('Conta criada com sucesso!')
        }
        setAuthLoading(false)
    }

    // ===== ENDEREÇO =====
    const geocodeAddress = async (query: string): Promise<{ lat: number; lng: number; address: string } | null> => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            if (!token) return null
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=BR`)
            const data = await res.json()
            if (data?.features?.length > 0) {
                const [lng, lat] = data.features[0].center
                return { lat, lng, address: data.features[0].place_name || query }
            }
            return null
        } catch {
            return null
        }
    }

    const searchLocation = async () => {
        if (!locationSearchQuery.trim()) return
        setIsSearchingLocation(true)
        const result = await geocodeAddress(locationSearchQuery.trim())
        setIsSearchingLocation(false)
        if (result) {
            setDeliveryAddress(result.address)
            setDeliveryLat(result.lat)
            setDeliveryLng(result.lng)
            setIsEditingAddress(false)
            setShowAddressSearch(false)
            toast.success('Endereço localizado!')
        } else {
            toast.error('Endereço não encontrado')
        }
    }

    const useSavedAddress = () => {
        if (!userAddress || !userLocation) return
        setDeliveryAddress(userAddress)
        setDeliveryLat(userLocation.lat)
        setDeliveryLng(userLocation.lng)
        setIsEditingAddress(false)
        setShowAddressSearch(false)
        toast.success('Endereço do perfil selecionado!')
    }

    // ===== PREÇO =====
    const calculateDeliveryFee = useCallback((): { fee: number; isCalculating: boolean } => {
        if (deliveryOption !== 'entrega' || !storeConfig) return { fee: 0, isCalculating: false }
        if (!deliveryLat || !deliveryLng) return { fee: 0, isCalculating: true }

        const dtype = storeConfig.delivery_type
        if (dtype === 'fixed') return { fee: Number(storeConfig.delivery_fee) || 0, isCalculating: false }
        if (dtype === 'distance') {
            const feePerKm = Number(storeConfig.delivery_fee_per_km) || 0
            const storeLat = storeConfig.store_lat
            const storeLng = storeConfig.store_lng
            if (storeLat == null || storeLng == null) return { fee: 0, isCalculating: true }

            const R = 6371
            const dLat = (deliveryLat - storeLat) * Math.PI / 180
            const dLng = (deliveryLng - storeLng) * Math.PI / 180
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(storeLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
            const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

            if (storeConfig.delivery_base_distance != null && storeConfig.delivery_base_fee != null) {
                const baseDist = Number(storeConfig.delivery_base_distance) || 0
                const baseFee = Number(storeConfig.delivery_base_fee) || 0
                if (dist <= baseDist) return { fee: baseFee, isCalculating: false }
                return { fee: baseFee + (dist - baseDist) * feePerKm, isCalculating: false }
            }
            return { fee: dist * feePerKm, isCalculating: false }
        }
        return { fee: 0, isCalculating: false }
    }, [deliveryOption, storeConfig, deliveryLat, deliveryLng])

    const getStoreTotals = useCallback(() => {
        const itemsTotal = cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
        const { fee: deliveryFee, isCalculating } = calculateDeliveryFee()
        const finalTotal = isCalculating ? itemsTotal : itemsTotal + deliveryFee
        return { itemsTotal, deliveryFee, finalTotal, isCalculating }
    }, [cartItems, calculateDeliveryFee])

    const bagDeliveryEstimate = useMemo(() => {
        const empty = { type: 'none' as const, fee: 0, isEstimate: false, distanceKm: null as number | null, originAddress: null as string | null, destinationAddress: null as string | null, baseDistanceKm: null as number | null, baseFee: null as number | null, feePerKm: null as number | null }
        if (!storeConfig || !storeConfig.accepts_delivery) return empty

        const custLat = deliveryLat ?? userLocation?.lat ?? null
        const custLng = deliveryLng ?? userLocation?.lng ?? null
        const destinationAddress = deliveryAddress || userAddress || null
        const originAddress = storeConfig.store_address || null

        let distanceKm: number | null = null
        if (storeConfig.store_lat != null && storeConfig.store_lng != null && custLat != null && custLng != null) {
            const R = 6371
            const dLat = (custLat - storeConfig.store_lat) * Math.PI / 180
            const dLng = (custLng - storeConfig.store_lng) * Math.PI / 180
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(storeConfig.store_lat * Math.PI / 180) * Math.cos(custLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
            distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        }

        const dtype = storeConfig.delivery_type
        if (dtype === 'free') return { ...empty, type: 'free', distanceKm, originAddress, destinationAddress }
        if (dtype === 'fixed') return { ...empty, type: 'fixed', fee: Number(storeConfig.delivery_fee) || 0, distanceKm, originAddress, destinationAddress }
        if (dtype === 'distance') {
            const feePerKm = Number(storeConfig.delivery_fee_per_km) || 0
            const baseDist = Number(storeConfig.delivery_base_distance) || 0
            const baseFee = Number(storeConfig.delivery_base_fee) || 0
            if (distanceKm == null) {
                return { ...empty, type: 'distance', fee: baseFee, isEstimate: true, originAddress, baseDistanceKm: baseDist, baseFee, feePerKm }
            }
            const fee = distanceKm <= baseDist ? baseFee : baseFee + (distanceKm - baseDist) * feePerKm
            return { ...empty, type: 'distance', fee, distanceKm, originAddress, destinationAddress, baseDistanceKm: baseDist, baseFee, feePerKm }
        }
        return empty
    }, [storeConfig, deliveryLat, deliveryLng, userLocation, deliveryAddress, userAddress])

    const getStoreStatus = useCallback(() => {
        if (!storeConfig?.business_hours) return { isOpen: true, nextOpening: null as { day: string; open: string } | null }
        return { isOpen: isStoreOpenNow(storeConfig.business_hours), nextOpening: nextAvailable }
    }, [storeConfig, nextAvailable])

    // ===== FINALIZAR PEDIDO =====
    const handleFinalizeOrder = async () => {
        if (!currentUserId) {
            setCheckoutStep('auth')
            return
        }
        if (!storeConfig) {
            toast.error('Dados da loja não carregados')
            return
        }
        const { isOpen, nextOpening } = getStoreStatus()
        if (!isOpen) {
            toast.error(`🕐 Loja fechada no momento.${nextOpening ? ` Abre ${nextOpening.day} às ${nextOpening.open}.` : ''}`)
            return
        }
        if (cartItems.length === 0) {
            toast.error('Sua sacola está vazia')
            return
        }
        if (!deliveryOption) {
            toast.error('Escolha como deseja receber o pedido')
            setCheckoutStep('delivery')
            return
        }
        if (deliveryOption === 'entrega' && !deliveryAddress.trim()) {
            toast.error('Informe o endereço de entrega')
            setCheckoutStep('delivery')
            return
        }
        if (!paymentMethod) {
            toast.error('Escolha a forma de pagamento')
            setCheckoutStep('payment')
            return
        }

        setCheckoutLoading(true)
        try {
            const { itemsTotal, deliveryFee, finalTotal } = getStoreTotals()
            const checkout_id = crypto.randomUUID()
            const address = deliveryOption === 'entrega' ? deliveryAddress : 'Retirada no local'

            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    store_id: storeConfig.id,
                    buyer_id: currentUserId,
                    buyer_name: (currentUserName || 'Cliente').trim(),
                    buyer_profile_slug: (currentUserSlug || currentUserId).trim(),
                    total_amount: finalTotal,
                    delivery_fee: deliveryFee,
                    delivery_option: deliveryOption,
                    payment_method: paymentMethod,
                    delivery_address: address,
                    delivery_lat: deliveryOption === 'entrega' ? deliveryLat : null,
                    delivery_lng: deliveryOption === 'entrega' ? deliveryLng : null,
                    status: 'pending',
                    checkout_id,
                })
                .select()
                .single()

            if (orderError) {
                toast.error(`Erro ao criar pedido: ${orderError.message}`)
                setCheckoutLoading(false)
                return
            }

            const orderItemsToInsert = cartItems.map((item) => ({
                order_id: orderData.id,
                product_id: item.product.id,
                product_name: item.product.name,
                quantity: item.quantity,
                unit_price: item.product.price,
                total_price: item.product.price * item.quantity,
                comment: (item as any).comment || null,
            }))

            const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert)
            if (itemsError) {
                await supabase.from('orders').delete().eq('id', orderData.id)
                toast.error(`Erro ao salvar itens: ${itemsError.message}`)
                setCheckoutLoading(false)
                return
            }

            if (ownerSlug) {
                clearStoreCart(ownerSlug)
                await syncToSupabase(currentUserId)
            }

            try {
                const { data: storeData } = await supabase.from('stores').select('whatsapp, owner_id').eq('id', storeConfig.id).single()
                let whatsapp = storeData?.whatsapp
                if (!whatsapp && storeData?.owner_id) {
                    const { data: owner } = await supabase.from('profiles').select('whatsapp').eq('id', storeData.owner_id).single()
                    whatsapp = owner?.whatsapp
                }
                if (whatsapp) {
                    const paymentLabel = paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'cartao' ? 'Cartão' : 'Dinheiro'
                    const deliveryLabel = deliveryOption === 'entrega'
                        ? `Entrega (${address})${deliveryFee > 0 ? ` - Taxa: R$ ${deliveryFee.toFixed(2)}` : ' - Grátis'}`
                        : 'Retirada no Balcão'
                    const message = encodeURIComponent(
                        `*Novo Pedido - iUser*\n\n` +
                        `*Cliente:* @${currentUserSlug || 'cliente'}\n` +
                        `*Pagamento:* ${paymentLabel}\n` +
                        `*Entrega:* ${deliveryLabel}\n` +
                        `*Itens:*\n${cartItems.map((i: any) => `- ${i.quantity}x ${i.product.name} (R$ ${(i.product.price * i.quantity).toFixed(2)})${i.comment ? ` - Obs: ${i.comment}` : ''}`).join('\n')}\n\n` +
                        `*Subtotal: R$ ${itemsTotal.toFixed(2)}*\n` +
                        `*Taxa de entrega: R$ ${deliveryFee.toFixed(2)}*\n` +
                        `*Total: R$ ${finalTotal.toFixed(2)}*`
                    )
                    window.open(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${message}`, '_blank')
                }
            } catch {
                // melhor esforço - não bloqueia o pedido já criado
            }

            toast.success('Pedido realizado com sucesso! 🎉')
            setCheckoutStep(null)
            setDeliveryOption(null)
            setPaymentMethod(null)
            setCheckoutLoading(false)
        } catch (err: any) {
            toast.error(`Erro inesperado: ${err?.message ?? 'Tente novamente.'}`)
            setCheckoutLoading(false)
        }
    }

    const startCheckout = () => {
        setCheckoutStep(currentUserId ? 'delivery' : 'auth')
    }

    return {
        storeConfig, isStoreOpen, nextAvailable,
        canChooseReceivingMethod, onlyPickupAvailable, onlyDeliveryAvailable,
        checkoutStep, setCheckoutStep, checkoutLoading, startCheckout,
        deliveryOption, setDeliveryOption, paymentMethod, setPaymentMethod,
        deliveryAddress, isEditingAddress, setIsEditingAddress, showAddressSearch, setShowAddressSearch,
        locationSearchQuery, setLocationSearchQuery, isSearchingLocation, searchLocation,
        userAddress, userLocation, useSavedAddress,
        getStoreTotals, bagDeliveryEstimate, handleFinalizeOrder,
        currentUserId,
        authMode, setAuthMode, authEmail, setAuthEmail, authPassword, setAuthPassword,
        authConfirmPassword, setAuthConfirmPassword, authName, setAuthName,
        authProfileSlug, setAuthProfileSlug, authLoading, authError,
        authAvatarFile, authAvatarPreview, handleAuthAvatarChange, authAvatarInputRef,
        showPassword, setShowPassword, isSlugAvailable,
        handleLogin, handleRegister,
    }
}
