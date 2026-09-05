// app/src/app/(main)/[ownerSlug]/catalogo/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useCartStore } from '@/store/useCartStore'
import { Plus, X, Info, Search, Clock, Tag, Package, Calendar, MapPin, Truck, Store, QrCode, CreditCard, Banknote, Navigation, Home, CheckCircle2, Eye, EyeOff, ArrowLeft, User, Camera } from 'lucide-react'
import Image from 'next/image'
import { isStoreOpenNow, getNextOpeningInfo, type BusinessHours } from '@/lib/storeHours'
import { toast } from 'sonner'
import HeaderSearchInput from '@/app/HeaderSearchInput'
import CatalogBag, { type CartItemWithComment } from './CatalogBag'

interface Product {
    id: string
    name: string
    description: string | null
    price: number
    image_url: string | null
    category: string | null
    stock: number | null
    store_id: string
    type?: string
    price_type?: string
    slug?: string
    created_at?: string
}

interface StoreInfo {
    id: string
    name: string
    slug: string
    logo_url: string | null
    banner_url: string | null
    business_hours?: BusinessHours | null
}

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function CatalogoPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const {
        bgMode,
        customBgUrl,
        profileSlug: loggedUserSlug,
        avatarUrl: loggedUserAvatarUrl,
        loading: profileLoading
    } = useProfile()
    const { itemsByStore, addItem, removeItem, updateQuantity, clearStoreCart, syncToSupabase } = useCartStore()

    const ownerSlug = Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug

    const [loading, setLoading] = useState(true)
    const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
    const [products, setProducts] = useState<Product[]>([])
    const [cartAnimating, setCartAnimating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
    const [showProductModal, setShowProductModal] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos')
    const [searchExpanded, setSearchExpanded] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // ===== STATES PARA O BUTTON SHOPPING BAG =====
    const [isBagExpanded, setIsBagExpanded] = useState(false)
    const [bagItems, setBagItems] = useState<CartItemWithComment[]>([])
    const [showAddCommentModal, setShowAddCommentModal] = useState(false)
    const [commentText, setCommentText] = useState('')
    const [pendingProduct, setPendingProduct] = useState<any | null>(null)

    // ===== STATES PARA FINALIZAÇÃO =====
    const [showCheckoutModal, setShowCheckoutModal] = useState(false)
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [checkoutStep, setCheckoutStep] = useState<'auth' | 'delivery' | 'payment' | 'confirm'>('auth')

    // ===== AUTH =====
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

    const handleAuthAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setAuthAvatarFile(file)
        const reader = new FileReader()
        reader.onloadend = () => setAuthAvatarPreview(reader.result as string)
        reader.readAsDataURL(file)
    }
    const [showPassword, setShowPassword] = useState(false)
    const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null)
    const slugTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserSlug, setCurrentUserSlug] = useState<string | null>(null)
    const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
    const [currentUserName, setCurrentUserName] = useState<string | null>(null)

    // ===== DELIVERY =====
    const [deliveryOption, setDeliveryOption] = useState<'entrega' | 'retirada'>('retirada')
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao' | 'dinheiro'>('pix')
    const [deliveryAddress, setDeliveryAddress] = useState('')
    const [deliveryLat, setDeliveryLat] = useState<number | null>(null)
    const [deliveryLng, setDeliveryLng] = useState<number | null>(null)
    const [locationSearchQuery, setLocationSearchQuery] = useState('')
    const [isSearchingLocation, setIsSearchingLocation] = useState(false)
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null)
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [userAddress, setUserAddress] = useState<string | null>(null)
    const [addressInput, setAddressInput] = useState('')

    // ===== CONFIGS DA LOJA =====
    const [storeConfig, setStoreConfig] = useState<{
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
        business_hours?: BusinessHours
    } | null>(null)

    // ===== STATUS DA LOJA =====
    const isStoreOpen = useMemo(() => {
        if (!storeInfo) return false
        return isStoreOpenNow(storeInfo.business_hours)
    }, [storeInfo])

    const nextAvailable = useMemo(() => {
        if (!storeInfo?.business_hours) return null
        const next = getNextOpeningInfo(storeInfo.business_hours)
        if (!next) return null
        return {
            day: next.dayLabel,
            open: next.time,
        }
    }, [storeInfo?.business_hours])

    // ========== CORES DO HEADER ==========
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        }
    }
    const surfaceRgb = hexToRgb(colors.surface)

    const gradientBg = `linear-gradient(to bottom, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 1) 0%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.95) 20%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.8) 40%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.5) 60%,
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2) 80%,
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0) 100%)`

    // ========== CARREGAR DADOS DA LOJA ==========
    useEffect(() => {
        async function loadStoreData() {
            if (!ownerSlug) {
                setError('Loja não encontrada')
                setLoading(false)
                return
            }

            try {
                const { data: store, error: storeError } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, logo_url, banner_url, business_hours, accepts_delivery, accepts_pickup, accepts_pix, accepts_card, accepts_cash, delivery_type, delivery_fee, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, store_lat, store_lng')
                    .eq('storeSlug', ownerSlug)
                    .maybeSingle()

                if (storeError || !store) {
                    setError('Loja não encontrada')
                    setLoading(false)
                    return
                }

                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select('*')
                    .eq('store_id', store.id)
                    .eq('listing_type', 'sale')
                    .order('created_at', { ascending: false })

                if (productsError) {
                    console.error('Erro ao buscar produtos:', productsError)
                }

                const productsWithUrls = (productsData || []).map((p: any) => {
                    let imageUrl: string | null = null
                    if (p.image_url) {
                        const { data: publicUrlData } = supabase.storage
                            .from('product-images')
                            .getPublicUrl(p.image_url)
                        imageUrl = publicUrlData.publicUrl
                    }
                    return {
                        ...p,
                        image_url: imageUrl,
                    }
                })

                let logoUrl: string | null = null
                if (store.logo_url) {
                    const { data: logoData } = supabase.storage
                        .from('store-logos')
                        .getPublicUrl(store.logo_url)
                    logoUrl = logoData.publicUrl
                }

                let bannerUrl: string | null = null
                if (store.banner_url) {
                    const { data: bannerData } = supabase.storage
                        .from('store-banners')
                        .getPublicUrl(store.banner_url)
                    bannerUrl = bannerData.publicUrl
                }

                setStoreInfo({
                    id: store.id,
                    name: store.name,
                    slug: store.storeSlug,
                    logo_url: logoUrl,
                    banner_url: bannerUrl,
                    business_hours: store.business_hours,
                })

                setStoreConfig({
                    accepts_delivery: store.accepts_delivery || false,
                    accepts_pickup: store.accepts_pickup || true,
                    accepts_pix: store.accepts_pix || false,
                    accepts_card: store.accepts_card || false,
                    accepts_cash: store.accepts_cash || false,
                    delivery_type: store.delivery_type || null,
                    delivery_fee: store.delivery_fee || null,
                    delivery_fee_per_km: store.delivery_fee_per_km || null,
                    delivery_base_distance: store.delivery_base_distance || null,
                    delivery_base_fee: store.delivery_base_fee || null,
                    store_lat: store.store_lat || null,
                    store_lng: store.store_lng || null,
                    business_hours: store.business_hours,
                })

                setProducts(productsWithUrls)
            } catch (err: any) {
                console.error('Erro ao carregar dados:', err)
                setError('Erro ao carregar página')
            } finally {
                setLoading(false)
            }
        }

        loadStoreData()
    }, [ownerSlug])

    useEffect(() => {
        setMounted(true)
        loadUserData()
    }, [])

    // ========== FUNÇÕES DO USUÁRIO ==========
    const loadUserData = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            setCurrentUserId(user.id)
            const { data: profile } = await supabase
                .from('profiles')
                .select('profileSlug, avatar_url, name, address, store_lat, store_lng')
                .eq('id', user.id)
                .single()
            if (profile) {
                setCurrentUserSlug(profile.profileSlug)
                setCurrentUserAvatar(profile.avatar_url)
                setCurrentUserName(profile.name)
                setUserAddress(profile.address)
                setAddressInput(profile.address || '')
                if (profile.store_lat && profile.store_lng) {
                    setUserLocation({ lat: profile.store_lat, lng: profile.store_lng })
                }
            }
        }
    }, [supabase])

    // ===== VERIFICA SLUG DISPONÍVEL =====
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

    // ========== FUNÇÕES DO CARRINHO ==========
    const storeKey = useMemo(() => {
        if (!ownerSlug) return ''
        return ownerSlug
    }, [ownerSlug])

    const cartItems = useMemo(() => {
        if (!storeKey) return []
        return itemsByStore[storeKey] || []
    }, [itemsByStore, storeKey])

    useEffect(() => {
        const items = cartItems.map(item => ({
            product: item.product,
            quantity: item.quantity,
            comment: (item as any).comment || ''
        }))
        setBagItems(items)
    }, [cartItems])

    const totalCartQuantity = useMemo(
        () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
        [cartItems]
    )

    const totalCartValue = useMemo(() => {
        let total = 0
        Object.values(itemsByStore).forEach(items => {
            items.forEach(item => {
                const price = item.product?.price || 0
                const quantity = item.quantity || 1
                total += Number(price) * quantity
            })
        })
        return total
    }, [itemsByStore])

    const getProductQuantity = useCallback(
        (productId: string) => {
            if (!ownerSlug) return 0
            const storeItems = itemsByStore[ownerSlug] || []
            const found = storeItems.find((item) => item.product.id === productId)
            return found ? found.quantity : 0
        },
        [itemsByStore, ownerSlug]
    )

    // ===== FUNÇÃO: Adicionar com comentário =====
    const handleAddWithComment = (product: any) => {
        if (!storeInfo || !ownerSlug) return

        if (!isStoreOpen) {
            toast.error('Loja fechada no momento. Não é possível adicionar itens ao carrinho.')
            return
        }

        setPendingProduct(product)
        setCommentText('')
        setShowAddCommentModal(true)
    }

    const confirmAddWithComment = () => {
        if (!pendingProduct || !storeInfo || !ownerSlug) return

        const storeDetails = {
            name: storeInfo.name,
            logo_url: storeInfo.logo_url ?? null,
        }

        const cartProduct = {
            id: pendingProduct.id,
            name: pendingProduct.name,
            price: pendingProduct.price || 0,
            image_url: pendingProduct.image_url || null,
            slug: pendingProduct.slug,
            description: pendingProduct.description || undefined,
            category: pendingProduct.category || undefined,
        }

        addItem(ownerSlug, storeDetails, cartProduct as any)

        // Atualiza o item com comentário
        setTimeout(() => {
            const storeItems = itemsByStore[ownerSlug] || []
            const found = storeItems.find((item: any) => item.product.id === pendingProduct.id)
            if (found) {
                const updatedItems = storeItems.map((item: any) => {
                    if (item.product.id === pendingProduct.id) {
                        return { ...item, comment: commentText.trim() || undefined }
                    }
                    return item
                })
                const items = updatedItems.map(item => ({
                    product: item.product,
                    quantity: item.quantity,
                    comment: (item as any).comment || ''
                }))
                setBagItems(items)
            }
        }, 100)

        toast.success(`Produto adicionado${commentText.trim() ? ' com observação!' : '!'}`)
        setShowAddCommentModal(false)
        setPendingProduct(null)
        setCommentText('')
    }

    const increaseQuantity = useCallback(
        (product: any) => {
            if (!storeInfo || !ownerSlug) return

            if (!isStoreOpen) {
                toast.error('Loja fechada no momento. Não é possível adicionar itens ao carrinho.')
                return
            }

            addItem(ownerSlug, { name: storeInfo.name, logo_url: storeInfo.logo_url ?? null }, product)
        },
        [storeInfo, ownerSlug, addItem, isStoreOpen]
    )

    const decreaseQuantity = useCallback(
        (productId: string) => {
            if (!ownerSlug) return
            updateQuantity(ownerSlug, productId, -1)
        },
        [ownerSlug, updateQuantity]
    )

    const removeAllOfProduct = useCallback(
        (productId: string) => {
            if (!ownerSlug) return
            removeItem(ownerSlug, productId)
            setBagItems(prev => prev.filter(item => item.product.id !== productId))
        },
        [ownerSlug, removeItem]
    )

    // ===== HANDLE PRODUCT CLICK =====
    const handleProductClick = (product: any, e?: React.MouseEvent) => {
        if (e?.target && (e.target as HTMLElement).closest('.product-action-button')) {
            return
        }

        if (!ownerSlug) return

        setSelectedProduct(product)
        setShowProductModal(true)
    }

    // ===== FUNÇÕES DE GEOLOCALIZAÇÃO =====
    const geocodeAddress = async (query: string): Promise<{ lat: number; lng: number; address: string } | null> => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            if (!token) return null
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=BR`
            )
            const data = await res.json()
            if (data?.features?.length > 0) {
                const [lng, lat] = data.features[0].center
                return {
                    lat,
                    lng,
                    address: data.features[0].place_name || query
                }
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
            setSelectedLocation(result)
            setDeliveryAddress(result.address)
            setDeliveryLat(result.lat)
            setDeliveryLng(result.lng)
            toast.success('Endereço localizado!')
        } else {
            toast.error('Endereço não encontrado')
        }
    }

    // ===== FUNÇÃO DE LOGIN/REGISTRO =====
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
        if (data.user) {
            setCurrentUserId(data.user.id)
            await loadUserData()
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
            let avatarUrl: string | null = null
            if (authAvatarFile) {
                const fileExt = authAvatarFile.name.split('.').pop()
                const fileName = `${data.user.id}-${Date.now()}.${fileExt}`
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, authAvatarFile, { upsert: true })
                if (uploadError) {
                    setAuthError(`Erro ao enviar foto de perfil: ${uploadError.message}`)
                    setAuthLoading(false)
                    return
                }
                avatarUrl = supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl
            }

            await supabase.from('profiles').upsert({
                id: data.user.id,
                name: authName,
                profileSlug: authProfileSlug,
                avatar_url: avatarUrl,
            })
            setCurrentUserId(data.user.id)
            await loadUserData()
            setCheckoutStep('delivery')
            toast.success('Conta criada com sucesso!')
        }
        setAuthLoading(false)
    }

    // ===== FUNÇÃO DE FINALIZAR COMPRA =====
    const calculateDeliveryFee = useCallback((): { fee: number; isCalculating: boolean } => {
        if (deliveryOption !== 'entrega' || !storeConfig) {
            return { fee: 0, isCalculating: false }
        }

        if (!deliveryLat || !deliveryLng) {
            return { fee: 0, isCalculating: true }
        }

        const dtype = storeConfig.delivery_type
        if (dtype === 'fixed') {
            return { fee: Number(storeConfig.delivery_fee) || 0, isCalculating: false }
        } else if (dtype === 'distance') {
            const feePerKm = Number(storeConfig.delivery_fee_per_km) || 0
            const storeLat = storeConfig.store_lat
            const storeLng = storeConfig.store_lng

            if (storeLat == null || storeLng == null) {
                return { fee: 0, isCalculating: true }
            }

            // Haversine
            const R = 6371
            const dLat = (deliveryLat - storeLat) * Math.PI / 180
            const dLng = (deliveryLng - storeLng) * Math.PI / 180
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(storeLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
            const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

            if (storeConfig.delivery_base_distance != null && storeConfig.delivery_base_fee != null) {
                const baseDist = Number(storeConfig.delivery_base_distance) || 0
                const baseFee = Number(storeConfig.delivery_base_fee) || 0
                if (dist <= baseDist) {
                    return { fee: baseFee, isCalculating: false }
                } else {
                    const extraKm = dist - baseDist
                    return { fee: baseFee + (extraKm * feePerKm), isCalculating: false }
                }
            }
            return { fee: dist * feePerKm, isCalculating: false }
        }
        return { fee: 0, isCalculating: false }
    }, [deliveryOption, storeConfig, deliveryLat, deliveryLng])

    const getStoreTotals = useCallback(() => {
        const items = cartItems
        const itemsTotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
        const { fee: deliveryFee, isCalculating } = calculateDeliveryFee()
        const finalTotal = isCalculating ? itemsTotal : itemsTotal + deliveryFee
        return { itemsTotal, deliveryFee, finalTotal, isCalculating }
    }, [cartItems, calculateDeliveryFee])

    const handleFinalizeOrder = async () => {
        if (!currentUserId) {
            setCheckoutStep('auth')
            return
        }

        if (!storeInfo || !storeConfig) {
            toast.error('Dados da loja não carregados')
            return
        }

        const { isOpen } = getStoreStatus()
        if (!isOpen) {
            let message = '🕐 Loja fechada no momento.'
            if (nextAvailable) {
                message += ` Abre ${nextAvailable.day} às ${nextAvailable.open}.`
            }
            toast.error(message)
            return
        }

        if (cartItems.length === 0) {
            toast.error('Sua sacola está vazia')
            return
        }

        if (deliveryOption === 'entrega' && !deliveryAddress.trim()) {
            toast.error('Informe o endereço de entrega')
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
                    store_id: storeInfo.id,
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
                console.error('[Checkout] Erro ao inserir order:', orderError)
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

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItemsToInsert)

            if (itemsError) {
                console.error('[Checkout] Erro ao inserir order_items:', itemsError)
                await supabase.from('orders').delete().eq('id', orderData.id)
                toast.error(`Erro ao salvar itens: ${itemsError.message}`)
                setCheckoutLoading(false)
                return
            }

            // Limpa o carrinho - CORREÇÃO: verifica se ownerSlug existe
            if (ownerSlug) {
                clearStoreCart(ownerSlug)
                await syncToSupabase(currentUserId)
            }

            // Abre WhatsApp
            try {
                const { data: storeData } = await supabase
                    .from('stores')
                    .select('whatsapp, owner_id')
                    .eq('id', storeInfo.id)
                    .single()
                let whatsapp = storeData?.whatsapp
                if (!whatsapp && storeData?.owner_id) {
                    const { data: owner } = await supabase
                        .from('profiles')
                        .select('whatsapp')
                        .eq('id', storeData.owner_id)
                        .single()
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
                        `*Itens:*\n${cartItems.map((i: any) => `- ${i.quantity}x ${i.product.name} (R$ ${(i.product.price * i.quantity).toFixed(2)})${(i as any).comment ? ` - Obs: ${(i as any).comment}` : ''}`).join('\n')}\n\n` +
                        `*Subtotal: R$ ${itemsTotal.toFixed(2)}*\n` +
                        `*Taxa de entrega: R$ ${deliveryFee.toFixed(2)}*\n` +
                        `*Total: R$ ${finalTotal.toFixed(2)}*`
                    )
                    window.open(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${message}`, '_blank')
                }
            } catch (waErr) {
                console.warn('[Checkout] Falha ao abrir WhatsApp:', waErr)
            }

            toast.success('Pedido realizado com sucesso! 🎉')
            setShowCheckoutModal(false)
            setIsBagExpanded(false)
            setCheckoutStep('auth')
            setCheckoutLoading(false)

        } catch (err: any) {
            console.error('[Checkout] Erro inesperado:', err)
            toast.error(`Erro inesperado: ${err?.message ?? 'Tente novamente.'}`)
            setCheckoutLoading(false)
        }
    }

    const getStoreStatus = useCallback(() => {
        if (!storeConfig || !storeConfig.business_hours) {
            return { isOpen: true, statusText: 'Aberto', nextOpening: null }
        }
        const isOpen = isStoreOpenNow(storeConfig.business_hours)
        return { isOpen, statusText: isOpen ? 'Aberto' : 'Fechado', nextOpening: nextAvailable }
    }, [storeConfig, nextAvailable])

    // ========== FILTRO DE PRODUTOS ==========
    const filteredProducts = useMemo(() => {
        let result = products

        if (selectedCategory !== 'Todos') {
            result = result.filter(p => p.category === selectedCategory)
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            result = result.filter(p =>
                p.name?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query) ||
                p.category?.toLowerCase().includes(query)
            )
        }

        return result
    }, [products, searchQuery, selectedCategory])

    // ========== CATEGORIAS ==========
    const categories = useMemo(() => {
        const cats = new Map<string, number>()
        products.forEach(p => {
            if (p.category) {
                cats.set(p.category, (cats.get(p.category) || 0) + 1)
            }
        })
        return [
            { name: 'Todos', count: products.length },
            ...Array.from(cats.entries()).map(([name, count]) => ({ name, count }))
        ]
    }, [products])

    // ========== VOLTAR ==========
    const handleGoBack = () => {
        if (!ownerSlug) {
            router.push('/')
            return
        }
        router.push(`/${ownerSlug}`)
    }

    const handleHome = () => {
        router.push('/')
    }

    // ========== FORMATAR PREÇO ==========
    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(price)
    }

    // ========== RENDER ==========
    if (loading) {
        return <LoadingSpinner message="Carregando catálogo..." background={colors.background} />
    }

    if (error || !storeInfo || !ownerSlug) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">📦</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Catálogo não encontrado'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Não foi possível carregar o catálogo desta loja.
                    </p>
                    <button
                        onClick={handleGoBack}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        Voltar à loja
                    </button>
                </div>
            </div>
        )
    }

    // Cor padrão para os textos
    const textColor = colors.textPrimary
    const cardBackground = colors.surface

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh pb-32">
                {/* ===== HEADER EMBUTIDO ===== */}
                <div
                    style={{
                        color: colors.textPrimary,
                        padding: '8px 12px 0 12px',
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        overflow: 'hidden',
                        background: gradientBg,
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                        minHeight: 120,
                    }}
                    className="sm:px-6 sm:pt-5"
                >
                    <div
                        style={{
                            position: 'absolute',
                            right: storeInfo.logo_url ? -15 : -5,
                            top: storeInfo.logo_url ? -15 : -5,
                            width: storeInfo.logo_url ? 130 : 90,
                            height: storeInfo.logo_url ? 130 : 90,
                            opacity: storeInfo.logo_url ? 0.45 : 0.35,
                            transform: 'rotate(6deg)',
                            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0) 75%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0) 75%)',
                            pointerEvents: 'none',
                            background: storeInfo.logo_url ? 'transparent' : colors.accent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1,
                        }}
                    >
                        {storeInfo.logo_url ? (
                            <img
                                src={storeInfo.logo_url}
                                alt=""
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '50%',
                                }}
                            />
                        ) : (
                            <img
                                src="/logotransparente.png"
                                alt="headerimage"
                                style={{ width: 45, height: 45, objectFit: 'contain' }}
                            />
                        )}
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <button
                                onClick={handleHome}
                                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                            >
                                <img src="/logo.png" alt="iUser" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" />
                            </button>
                            <button
                                onClick={handleHome}
                                className="text-sm sm:text-lg font-semibold opacity-90 bg-transparent border-none cursor-pointer"
                                style={{ color: colors.textPrimary }}
                            >
                                iUser
                            </button>
                        </div>

                        <div className="flex items-center gap-3 mt-1">
                            {storeInfo.logo_url && (
                                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2" style={{ borderColor: colors.accent }}>
                                    <img src={storeInfo.logo_url} alt={storeInfo.name} className="w-full h-full object-cover" />
                                </div>
                            )}
                            <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight break-words" style={{ color: colors.textPrimary }}>
                                {storeInfo.name}
                            </h1>
                        </div>

                        {categories.length > 1 && (
                            <div
                                className="flex gap-1.5 mt-2 overflow-x-auto scroll-smooth pb-1 pt-1 scrollbar-hide px-1"
                                style={{
                                    overflowY: 'visible',
                                    paddingLeft: '4px',
                                    paddingRight: '4px',
                                }}
                            >
                                {categories.map((cat) => {
                                    const isActive = selectedCategory === cat.name
                                    return (
                                        <button
                                            key={cat.name}
                                            onClick={() => setSelectedCategory(cat.name)}
                                            className="relative flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap flex-shrink-0 hover:scale-105"
                                            style={{
                                                background: isActive
                                                    ? GRADIENT
                                                    : 'transparent',
                                                color: textColor,
                                                boxShadow: isActive ? `0 2px 12px #f9731650` : 'none',
                                                border: isActive ? 'none' : `1px solid ${colors.border}44`,
                                                ...(isActive ? {
                                                    fontWeight: 'bold',
                                                    transform: 'scale(1.05)',
                                                } : {}),
                                            }}
                                        >
                                            <div
                                                className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
                                                style={{
                                                    background: isActive
                                                        ? 'linear-gradient(135deg, #f97316, #dc2626)'
                                                        : colors.surface,
                                                    color: textColor,
                                                    border: isActive ? 'none' : `1px solid ${colors.border}33`,
                                                }}
                                            >
                                                {cat.count}
                                            </div>
                                            <span className="ml-1.5 sm:ml-2">{cat.name}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}

                        <div className="mt-2">
                            <HeaderSearchInput
                                placeholder="Buscar produtos..."
                                value={searchQuery}
                                onChange={setSearchQuery}
                                inputRef={searchInputRef}
                            />
                        </div>
                    </div>
                </div>

                {/* Banner da loja */}
                {storeInfo.banner_url && (
                    <div className="w-full h-96 md:h-[32rem] relative overflow-hidden">
                        <Image
                            src={storeInfo.banner_url}
                            alt={storeInfo.name}
                            fill
                            className="object-cover"
                            style={{
                                maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 60%, rgba(0,0,0,0.8) 75%, rgba(0,0,0,0.4) 90%, rgba(0,0,0,0) 100%)',
                                WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 60%, rgba(0,0,0,0.8) 75%, rgba(0,0,0,0.4) 90%, rgba(0,0,0,0) 100%)',
                            }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    </div>
                )}

                {/* Status da loja */}
                {!isStoreOpen && (
                    <div className="max-w-7xl mx-auto px-4 pt-4">
                        <div
                            className="rounded-xl p-3 text-center"
                            style={{
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: `1px dashed #ef4444`,
                            }}
                        >
                            <Info size={16} style={{ color: '#ef4444' }} className="inline mr-2" />
                            <span className="text-xs font-bold" style={{ color: '#ef4444' }}>
                                Loja fechada no momento
                            </span>
                            {nextAvailable && (
                                <span className="text-xs ml-2" style={{ color: '#f97316' }}>
                                    Abre {nextAvailable.day} às {nextAvailable.open}
                                </span>
                            )}
                            <span className="text-xs ml-2" style={{ color: textColor }}>
                                Clique no produto para ver detalhes
                            </span>
                        </div>
                    </div>
                )}

                {/* Catálogo de produtos */}
                <div className="max-w-7xl mx-auto px-1 py-1">
                    {filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="text-6xl mb-4">🛍️</div>
                            <h3 className="text-xl font-semibold" style={{ color: textColor }}>
                                {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}
                            </h3>
                            <p className="text-sm mt-2" style={{ color: textColor }}>
                                {searchQuery ? 'Tente buscar com outro termo' : 'Esta loja ainda não possui produtos em seu catálogo.'}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {filteredProducts.map((product) => {
                                const isSelected = mounted && cartItems.some((item: any) => item.product.id === product.id)
                                const quantity = getProductQuantity(product.id)
                                const isHourly = product.price_type === 'hourly'
                                const productIsDisabled = !isStoreOpen

                                const handleProductInteraction = (e: React.MouseEvent) => {
                                    e.stopPropagation()
                                    if (productIsDisabled) {
                                        handleProductClick(product, e)
                                    } else {
                                        handleAddWithComment(product)
                                    }
                                }

                                return (
                                    <div
                                        key={product.id}
                                        onClick={(e) => handleProductClick(product, e)}
                                        className={`group rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl cursor-pointer border-4 flex flex-row`}
                                        style={{
                                            background: cardBackground,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                            borderColor: isSelected ? '#22c55e' : 'transparent',
                                        }}
                                    >
                                        <div className="w-32 sm:w-40 md:w-48 flex-shrink-0 relative bg-gray-100 overflow-hidden" style={{ minHeight: '140px', height: 'auto' }}>
                                            {product.image_url || storeInfo?.logo_url ? (
                                                <img
                                                    src={product.image_url || storeInfo?.logo_url || ''}
                                                    alt={product.name}
                                                    className={`w-full h-full transition-transform duration-300 ${product.image_url ? 'object-cover group-hover:scale-110' : 'object-contain p-4 group-hover:scale-110'}`}
                                                    style={{ minHeight: '140px' }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200" style={{ minHeight: '140px' }}>
                                                    <span className="text-3xl opacity-50">📦</span>
                                                </div>
                                            )}
                                            {product.type && (
                                                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase backdrop-blur-md"
                                                    style={{ background: 'rgba(0,0,0,0.3)', color: '#ffffff' }}>
                                                    {product.type === 'physical' ? 'Físico' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                </span>
                                            )}
                                            {product.stock !== null && product.stock <= 0 && (
                                                <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                                    Esgotado
                                                </div>
                                            )}
                                            {productIsDisabled && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                                                    <span className="text-[8px] font-black uppercase px-2 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(249, 115, 22, 0.9)', color: '#ffffff' }}>
                                                        <Info size={10} /> Ver detalhes
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0">
                                            <div>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold text-sm truncate" style={{ color: textColor }}>
                                                            {product.name}
                                                        </h3>
                                                        {product.category && (
                                                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: '#f9731620', color: '#f97316' }}>
                                                                {product.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex-shrink-0 text-right">
                                                        <span className="text-base sm:text-lg font-bold" style={{ color: '#f97316' }}>
                                                            {formatPrice(product.price)}
                                                        </span>
                                                        {isHourly && <span className="text-xs ml-0.5" style={{ color: textColor }}>/h</span>}
                                                    </div>
                                                </div>
                                                {product.description && (
                                                    <p className="text-xs mt-1 line-clamp-2" style={{ color: textColor }}>
                                                        {product.description}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="mt-2 flex justify-end items-center">
                                                {isSelected ? (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                if (quantity <= 1) {
                                                                    removeAllOfProduct(product.id)
                                                                } else {
                                                                    decreaseQuantity(product.id)
                                                                }
                                                            }}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-md hover:scale-110 transition-transform product-action-button"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff'
                                                            }}
                                                        >
                                                            −
                                                        </button>
                                                        <span className="text-xs font-bold min-w-[20px] text-center" style={{ color: '#f97316' }}>
                                                            {quantity}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleAddWithComment(product)
                                                            }}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-md hover:scale-110 transition-transform product-action-button"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff'
                                                            }}
                                                        >
                                                            +
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                removeAllOfProduct(product.id)
                                                            }}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform text-xs product-action-button"
                                                            style={{
                                                                background: '#ef4444',
                                                                color: '#ffffff'
                                                            }}
                                                            title="Remover todos"
                                                        >
                                                            <X className="w-3 h-3 text-white" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={handleProductInteraction}
                                                        className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform product-action-button"
                                                        style={{ background: GRADIENT }}
                                                    >
                                                        {productIsDisabled ? <Info size={14} /> : <Plus size={14} />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* ===== BOTÃO FLUTUANTE - SACOLA (busca agora vive no header, igual à home) ===== */}
                <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                    <CatalogBag
                        bagItems={bagItems}
                        isExpanded={isBagExpanded}
                        onToggleExpanded={() => setIsBagExpanded(!isBagExpanded)}
                        onIncrease={increaseQuantity}
                        onDecrease={decreaseQuantity}
                        onRemove={removeAllOfProduct}
                        onCheckout={() => {
                            setCheckoutStep(currentUserId ? 'delivery' : 'auth')
                            setShowCheckoutModal(true)
                            setIsBagExpanded(false)
                        }}
                        colors={colors}
                    />
                </div>

                {/* ===== MODAL DE COMENTÁRIO ===== */}
                {showAddCommentModal && pendingProduct && (
                    <div
                        className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => {
                            setShowAddCommentModal(false)
                            setPendingProduct(null)
                            setCommentText('')
                        }}
                    >
                        <div
                            className="w-full max-w-md rounded-2xl p-6 animate-fade-in"
                            style={{ background: cardBackground }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-black" style={{ color: textColor }}>
                                    Adicionar à Sacola
                                </h3>
                                <button
                                    onClick={() => {
                                        setShowAddCommentModal(false)
                                        setPendingProduct(null)
                                        setCommentText('')
                                    }}
                                    className="p-1.5 rounded-full hover:bg-black/5 transition"
                                    style={{ color: colors.textSecondary }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-xl mb-4" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                                    {pendingProduct.image_url ? (
                                        <img src={pendingProduct.image_url} alt={pendingProduct.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate" style={{ color: textColor }}>
                                        {pendingProduct.name}
                                    </p>
                                    <p className="text-sm font-bold" style={{ color: '#f97316' }}>
                                        {formatPrice(pendingProduct.price)}
                                    </p>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="text-sm font-medium block mb-1" style={{ color: textColor }}>
                                    Observação (opcional)
                                </label>
                                <textarea
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Ex: Sem cebola, ponto da carne, etc..."
                                    className="w-full p-3 rounded-xl resize-none text-sm"
                                    style={{
                                        background: `${colors.surface}44`,
                                        border: `1px solid ${colors.border}`,
                                        color: textColor,
                                        minHeight: 80,
                                        outline: 'none',
                                    }}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowAddCommentModal(false)
                                        setPendingProduct(null)
                                        setCommentText('')
                                    }}
                                    className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                    style={{
                                        background: 'transparent',
                                        border: `2px solid ${colors.border}`,
                                        color: colors.textSecondary
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmAddWithComment}
                                    className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731660`,
                                    }}
                                >
                                    Adicionar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== MODAL DE CHECKOUT ===== */}
                {showCheckoutModal && (
                    <div
                        className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => {
                            if (!checkoutLoading) {
                                setShowCheckoutModal(false)
                                setCheckoutStep('auth')
                            }
                        }}
                    >
                        <div
                            className="w-full max-w-md rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto"
                            style={{ background: cardBackground }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* ===== STEP AUTH ===== */}
                            {checkoutStep === 'auth' && (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-black" style={{ color: textColor }}>
                                            {authMode === 'login' ? 'Entrar' : 'Criar Conta'}
                                        </h3>
                                        <button
                                            onClick={() => {
                                                setShowCheckoutModal(false)
                                                setCheckoutStep('auth')
                                            }}
                                            className="p-1.5 rounded-full hover:bg-black/5 transition"
                                            style={{ color: colors.textSecondary }}
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                                        {authMode === 'login'
                                            ? 'Entre para finalizar seu pedido'
                                            : 'Crie sua conta e finalize seu pedido'}
                                    </p>

                                    {authError && (
                                        <div className="p-3 border rounded-full text-[8px] font-black uppercase text-center mb-3"
                                            style={{ background: '#f9731620', borderColor: '#f97316', color: '#f97316' }}>
                                            ⚠️ {authError}
                                        </div>
                                    )}

                                    <div className="flex gap-2 mb-4">
                                        <button
                                            onClick={() => setAuthMode('login')}
                                            className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase transition-all ${authMode === 'login' ? 'shadow-sm' : ''}`}
                                            style={authMode === 'login' ? { background: GRADIENT, color: '#ffffff' } : { background: colors.surface, color: colors.textSecondary, border: `2px solid ${colors.border}` }}
                                        >
                                            Entrar
                                        </button>
                                        <button
                                            onClick={() => setAuthMode('register')}
                                            className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase transition-all ${authMode === 'register' ? 'shadow-sm' : ''}`}
                                            style={authMode === 'register' ? { background: GRADIENT, color: '#ffffff' } : { background: colors.surface, color: colors.textSecondary, border: `2px solid ${colors.border}` }}
                                        >
                                            Criar Conta
                                        </button>
                                    </div>

                                    {authMode === 'login' ? (
                                        <form onSubmit={handleLogin} className="space-y-3">
                                            <input
                                                type="email"
                                                placeholder="seu@email.com"
                                                className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                                value={authEmail}
                                                onChange={(e) => setAuthEmail(e.target.value)}
                                                required
                                                autoComplete="email"
                                            />
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    placeholder="sua senha"
                                                    className="w-full border-2 rounded-full px-4 py-2.5 text-sm pr-10"
                                                    style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                                    value={authPassword}
                                                    onChange={(e) => setAuthPassword(e.target.value)}
                                                    required
                                                    autoComplete="current-password"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2"
                                                    style={{ color: colors.textSecondary }}
                                                >
                                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={authLoading}
                                                className="w-full py-2.5 rounded-full font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                {authLoading ? 'Entrando...' : 'Entrar'}
                                            </button>
                                        </form>
                                    ) : (
                                        <form onSubmit={handleRegister} className="space-y-3">
                                            <div className="flex flex-col items-center gap-1.5 pb-1">
                                                <div className="relative">
                                                    <div className="w-16 h-16 rounded-full p-[2px]" style={{ background: GRADIENT }}>
                                                        <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                                            {authAvatarPreview ? (
                                                                <img src={authAvatarPreview} alt="Foto de perfil" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <User className="w-6 h-6" style={{ color: '#f97316', opacity: 0.4 }} />
                                                            )}
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="file"
                                                        ref={authAvatarInputRef}
                                                        onChange={handleAuthAvatarChange}
                                                        accept="image/*"
                                                        style={{ display: 'none' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => authAvatarInputRef.current?.click()}
                                                        disabled={authLoading}
                                                        className="absolute -bottom-1 -right-1 p-1.5 rounded-full transition-all hover:scale-110"
                                                        style={{ background: GRADIENT, color: '#fff' }}
                                                    >
                                                        <Camera size={12} />
                                                    </button>
                                                </div>
                                                <span className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                                                    Foto de perfil (obrigatória)
                                                </span>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Nome Completo"
                                                className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                                value={authName}
                                                onChange={(e) => setAuthName(e.target.value)}
                                                required
                                                autoComplete="name"
                                            />
                                            <div className="flex items-center gap-1 border-2 rounded-full px-3" style={{ background: colors.surface, borderColor: colors.border }}>
                                                <span className="text-[9px] font-black" style={{ color: colors.textSecondary }}>iuser.com.br/</span>
                                                <input
                                                    type="text"
                                                    placeholder="seu-perfil"
                                                    className="flex-1 py-2.5 bg-transparent text-sm outline-none"
                                                    style={{ color: colors.textPrimary }}
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
                                                className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                                value={authEmail}
                                                onChange={(e) => setAuthEmail(e.target.value)}
                                                required
                                                autoComplete="email"
                                            />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="Senha"
                                                className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                                value={authPassword}
                                                onChange={(e) => setAuthPassword(e.target.value)}
                                                required
                                                autoComplete="new-password"
                                            />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="Confirmar senha"
                                                className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                                style={{ background: colors.surface, borderColor: colors.border, color: colors.textPrimary }}
                                                value={authConfirmPassword}
                                                onChange={(e) => setAuthConfirmPassword(e.target.value)}
                                                required
                                                autoComplete="new-password"
                                            />
                                            <button
                                                type="submit"
                                                disabled={authLoading || isSlugAvailable === false || !authAvatarFile}
                                                className="w-full py-2.5 rounded-full font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                {authLoading ? 'Criando...' : 'Criar Conta'}
                                            </button>
                                        </form>
                                    )}
                                </>
                            )}

                            {/* ===== STEP DELIVERY ===== */}
                            {checkoutStep === 'delivery' && (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-black" style={{ color: textColor }}>
                                            Finalizar Pedido
                                        </h3>
                                        <button
                                            onClick={() => {
                                                setShowCheckoutModal(false)
                                                setCheckoutStep('auth')
                                            }}
                                            className="p-1.5 rounded-full hover:bg-black/5 transition"
                                            style={{ color: colors.textSecondary }}
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>

                                    {/* Itens resumidos com observações */}
                                    <div className="mb-4 p-3 rounded-xl" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                        <p className="text-xs font-bold mb-2" style={{ color: colors.textPrimary }}>
                                            {bagItems.length} {bagItems.length === 1 ? 'item' : 'itens'} na sacola
                                        </p>
                                        <div className="space-y-1 max-h-32 overflow-y-auto">
                                            {bagItems.map((item) => (
                                                <div key={item.product.id} className="flex justify-between text-xs">
                                                    <span style={{ color: colors.textSecondary }}>
                                                        {item.quantity}x {item.product.name}
                                                        {item.comment && <span className="text-[8px] ml-1 opacity-60">({item.comment})</span>}
                                                    </span>
                                                    <span className="font-bold" style={{ color: textColor }}>
                                                        {formatPrice(item.product.price * item.quantity)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="border-t mt-2 pt-2 flex justify-between font-bold text-sm" style={{ borderColor: colors.border }}>
                                            <span style={{ color: textColor }}>Subtotal</span>
                                            <span style={{ color: '#f97316' }}>{formatPrice(getStoreTotals().itemsTotal)}</span>
                                        </div>
                                    </div>

                                    {/* Status da loja */}
                                    <div
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 text-xs font-bold"
                                        style={{
                                            background: isStoreOpen ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                            color: isStoreOpen ? '#22c55e' : '#ef4444',
                                            border: `1px solid ${isStoreOpen ? '#22c55e30' : '#ef444430'}`,
                                        }}
                                    >
                                        <Clock size={14} />
                                        <span>{isStoreOpen ? '🟢 Aberto' : '🔴 Fechado'}</span>
                                        {!isStoreOpen && nextAvailable && (
                                            <span style={{ opacity: 0.7 }}>
                                                • Abre {nextAvailable.day} às {nextAvailable.open}
                                            </span>
                                        )}
                                    </div>

                                    {/* Delivery Option */}
                                    <div className="mb-3">
                                        <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Recebimento</p>
                                        <div className="flex gap-2">
                                            {storeConfig?.accepts_delivery && (
                                                <button
                                                    onClick={() => setDeliveryOption('entrega')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${deliveryOption === 'entrega' ? 'text-white' : ''}`}
                                                    style={deliveryOption === 'entrega' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                >
                                                    <Truck size={14} /> Entrega
                                                </button>
                                            )}
                                            {storeConfig?.accepts_pickup && (
                                                <button
                                                    onClick={() => setDeliveryOption('retirada')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${deliveryOption === 'retirada' ? 'text-white' : ''}`}
                                                    style={deliveryOption === 'retirada' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                >
                                                    <Store size={14} /> Retirada
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Delivery Address */}
                                    {deliveryOption === 'entrega' && (
                                        <div className="mb-3">
                                            <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Endereço de Entrega</p>

                                            {/* Endereço salvo do perfil */}
                                            {userAddress && userLocation && (
                                                <button
                                                    onClick={() => {
                                                        setDeliveryAddress(userAddress)
                                                        setDeliveryLat(userLocation.lat)
                                                        setDeliveryLng(userLocation.lng)
                                                        setSelectedLocation({
                                                            lat: userLocation.lat,
                                                            lng: userLocation.lng,
                                                            address: userAddress
                                                        })
                                                        toast.success('Endereço do perfil selecionado!')
                                                    }}
                                                    className="w-full p-2 rounded-xl mb-2 border-2 border-green-500/30 hover:bg-green-50 transition flex items-center gap-2 text-xs"
                                                    style={{ background: 'rgba(16,185,129,0.05)' }}
                                                >
                                                    <Home size={16} style={{ color: '#10b981' }} />
                                                    <span className="flex-1 truncate" style={{ color: colors.textPrimary }}>{userAddress}</span>
                                                    <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                                                </button>
                                            )}

                                            {/* Buscar endereço */}
                                            <div className="flex gap-2">
                                                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: colors.border }}>
                                                    <Search size={14} style={{ color: colors.textSecondary }} />
                                                    <input
                                                        type="text"
                                                        value={locationSearchQuery}
                                                        onChange={(e) => setLocationSearchQuery(e.target.value)}
                                                        placeholder="Buscar endereço..."
                                                        className="flex-1 bg-transparent outline-none text-sm"
                                                        style={{ color: colors.textPrimary }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') searchLocation() }}
                                                    />
                                                </div>
                                                <button
                                                    onClick={searchLocation}
                                                    disabled={isSearchingLocation}
                                                    className="px-3 py-1.5 rounded-full text-xs font-bold text-white disabled:opacity-50"
                                                    style={{ background: GRADIENT }}
                                                >
                                                    {isSearchingLocation ? '...' : 'Buscar'}
                                                </button>
                                            </div>

                                            {selectedLocation && (
                                                <div className="mt-2 p-2 rounded-xl" style={{ background: `${colors.accent}10`, border: `1px solid ${colors.accent}30` }}>
                                                    <p className="text-[10px] font-bold" style={{ color: colors.textPrimary }}>📍 {selectedLocation.address}</p>
                                                </div>
                                            )}

                                            {deliveryAddress && !selectedLocation && (
                                                <div className="mt-2 p-2 rounded-xl" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                    <p className="text-[10px]" style={{ color: colors.textPrimary }}>{deliveryAddress}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Payment */}
                                    <div className="mb-4">
                                        <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Pagamento</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {storeConfig?.accepts_pix && (
                                                <button
                                                    onClick={() => setPaymentMethod('pix')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentMethod === 'pix' ? 'text-white' : ''}`}
                                                    style={paymentMethod === 'pix' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                >
                                                    <QrCode size={14} /> Pix
                                                </button>
                                            )}
                                            {storeConfig?.accepts_card && (
                                                <button
                                                    onClick={() => setPaymentMethod('cartao')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentMethod === 'cartao' ? 'text-white' : ''}`}
                                                    style={paymentMethod === 'cartao' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                >
                                                    <CreditCard size={14} /> Cartão
                                                </button>
                                            )}
                                            {storeConfig?.accepts_cash && (
                                                <button
                                                    onClick={() => setPaymentMethod('dinheiro')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${paymentMethod === 'dinheiro' ? 'text-white' : ''}`}
                                                    style={paymentMethod === 'dinheiro' ? { background: GRADIENT, color: '#ffffff' } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                >
                                                    <Banknote size={14} /> Dinheiro
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Total e finalizar */}
                                    <div className="border-t pt-3" style={{ borderColor: colors.border }}>
                                        {deliveryOption === 'entrega' && (
                                            <div className="flex justify-between text-xs mb-1">
                                                <span style={{ color: colors.textSecondary }}>Taxa de entrega</span>
                                                {getStoreTotals().isCalculating ? (
                                                    <span className="italic animate-pulse" style={{ color: colors.textSecondary }}>Calculando...</span>
                                                ) : getStoreTotals().deliveryFee === 0 ? (
                                                    <span className="font-bold text-green-500">Grátis</span>
                                                ) : (
                                                    <span className="font-bold" style={{ color: '#f97316' }}>
                                                        {formatPrice(getStoreTotals().deliveryFee)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex justify-between text-base font-bold">
                                            <span style={{ color: textColor }}>Total</span>
                                            {getStoreTotals().isCalculating ? (
                                                <span className="italic" style={{ color: colors.textSecondary }}>Calculando...</span>
                                            ) : (
                                                <span style={{ color: '#f97316' }}>{formatPrice(getStoreTotals().finalTotal)}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-3 mt-4">
                                        <button
                                            onClick={() => {
                                                setShowCheckoutModal(false)
                                                setCheckoutStep('auth')
                                            }}
                                            className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                            style={{
                                                background: 'transparent',
                                                border: `2px solid ${colors.border}`,
                                                color: colors.textSecondary
                                            }}
                                        >
                                            Voltar
                                        </button>
                                        <button
                                            onClick={handleFinalizeOrder}
                                            disabled={checkoutLoading || getStoreTotals().isCalculating || (deliveryOption === 'entrega' && !deliveryAddress.trim())}
                                            className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95 disabled:opacity-50"
                                            style={{
                                                background: GRADIENT,
                                                color: '#ffffff',
                                                boxShadow: `0 4px 14px #f9731660`,
                                            }}
                                        >
                                            {checkoutLoading ? 'Finalizando...' :
                                                getStoreTotals().isCalculating ? 'Calculando...' :
                                                    (deliveryOption === 'entrega' && !deliveryAddress.trim()) ? 'Informe o endereço' :
                                                        'Confirmar Pedido'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ===== MODAL DE DETALHES DO PRODUTO ===== */}
                {showProductModal && selectedProduct && (
                    <div
                        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setShowProductModal(false)}
                    >
                        <div
                            className="w-full max-w-3xl rounded-2xl p-5 animate-fade-in max-h-[80vh] overflow-y-auto"
                            style={{ background: cardBackground }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-black" style={{ color: textColor }}>
                                    Detalhes do Produto
                                </h3>
                                <button
                                    onClick={() => setShowProductModal(false)}
                                    className="p-1.5 rounded-full hover:bg-black/5 transition"
                                    style={{ color: textColor }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="sm:w-2/5">
                                    <div className="w-full aspect-square rounded-xl overflow-hidden" style={{ background: colors.accentLight }}>
                                        {selectedProduct.image_url || storeInfo?.logo_url ? (
                                            <img
                                                src={selectedProduct.image_url || storeInfo?.logo_url || ''}
                                                alt={selectedProduct.name}
                                                className={selectedProduct.image_url ? 'w-full h-full object-cover' : 'w-full h-full object-contain p-8'}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-sm font-medium" style={{ color: textColor }}>
                                                Sem imagem
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col">
                                    <div>
                                        <h4 className="text-lg font-black truncate" style={{ color: textColor }}>
                                            {selectedProduct.name}
                                        </h4>
                                        {selectedProduct.category && (
                                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#f9731620', color: '#f97316' }}>
                                                {selectedProduct.category}
                                            </span>
                                        )}
                                        <div className="mt-1">
                                            <span className="text-xl font-extrabold" style={{ color: '#f97316' }}>
                                                {formatPrice(selectedProduct.price || 0)}
                                            </span>
                                            {selectedProduct.price_type === 'hourly' && (
                                                <span className="text-xs ml-0.5 opacity-75" style={{ color: textColor }}>/hora</span>
                                            )}
                                        </div>
                                    </div>

                                    {selectedProduct.description && (
                                        <div className="mt-2 p-2.5 rounded-lg flex-1" style={{ background: `${colors.surface}66`, border: `1px solid ${colors.border}` }}>
                                            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: textColor }}>
                                                {selectedProduct.description}
                                            </p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        {selectedProduct.type && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Package size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Tipo</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: textColor }}>
                                                    {selectedProduct.type === 'physical' ? 'Físico' :
                                                        selectedProduct.type === 'service' ? 'Serviço' : 'Digital'}
                                                </p>
                                            </div>
                                        )}
                                        {selectedProduct.stock !== null && selectedProduct.stock !== undefined && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Tag size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Estoque</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: selectedProduct.stock > 0 ? '#22c55e' : '#ef4444' }}>
                                                    {selectedProduct.stock > 0 ? `${selectedProduct.stock} un.` : 'Esgotado'}
                                                </p>
                                            </div>
                                        )}
                                        {selectedProduct.price_type && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Modalidade</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: textColor }}>
                                                    {selectedProduct.price_type === 'fixed' ? 'Fixo' :
                                                        selectedProduct.price_type === 'hourly' ? 'Por hora' : 'Negociável'}
                                                </p>
                                            </div>
                                        )}
                                        {selectedProduct.created_at && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Adicionado</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: textColor }}>
                                                    {new Date(selectedProduct.created_at).toLocaleDateString('pt-BR', {
                                                        day: '2-digit',
                                                        month: 'short'
                                                    })}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {!isStoreOpen && (
                                        <div className="mt-2 p-2 rounded-lg text-center" style={{ background: 'rgba(239, 68, 68, 0.08)', border: `1px dashed #ef4444` }}>
                                            <Info size={14} style={{ color: '#ef4444' }} className="inline mr-1.5" />
                                            <span className="text-[10px] font-bold" style={{ color: '#ef4444' }}>
                                                Loja fechada
                                            </span>
                                            {nextAvailable && (
                                                <span className="text-[10px] ml-1.5" style={{ color: '#f97316' }}>
                                                    Abre {nextAvailable.day} às {nextAvailable.open}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                        {isStoreOpen ? (
                                            <>
                                                {cartItems.some((item: any) => item.product.id === selectedProduct.id) ? (
                                                    <div className="flex items-center gap-2 w-full">
                                                        <button
                                                            onClick={() => {
                                                                const qty = getProductQuantity(selectedProduct.id)
                                                                if (qty <= 1) {
                                                                    removeAllOfProduct(selectedProduct.id)
                                                                } else {
                                                                    decreaseQuantity(selectedProduct.id)
                                                                }
                                                            }}
                                                            className="flex-1 py-2 rounded-full font-bold text-xs transition hover:scale-105 active:scale-95"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff',
                                                                boxShadow: `0 4px 14px #f9731660`,
                                                            }}
                                                        >
                                                            Remover
                                                        </button>
                                                        <span className="text-base font-bold min-w-[32px] text-center" style={{ color: '#f97316' }}>
                                                            {getProductQuantity(selectedProduct.id)}
                                                        </span>
                                                        <button
                                                            onClick={() => handleAddWithComment(selectedProduct)}
                                                            className="flex-1 py-2 rounded-full font-bold text-xs transition hover:scale-105 active:scale-95"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff',
                                                                boxShadow: `0 4px 14px #f9731660`,
                                                            }}
                                                        >
                                                            Adicionar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAddWithComment(selectedProduct)}
                                                        className="w-full py-2 rounded-full font-bold text-xs transition hover:scale-105 active:scale-95"
                                                        style={{
                                                            background: GRADIENT,
                                                            color: '#ffffff',
                                                            boxShadow: `0 4px 14px #f9731660`,
                                                        }}
                                                    >
                                                        Adicionar ao carrinho
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => setShowProductModal(false)}
                                                className="w-full py-2 rounded-full font-bold text-xs transition hover:scale-105 active:scale-95"
                                                style={{
                                                    background: GRADIENT,
                                                    color: '#ffffff',
                                                    boxShadow: `0 4px 14px #f9731660`,
                                                }}
                                            >
                                                Fechar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    )
}