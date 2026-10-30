// app/src/app/(main)/[ownerSlug]/catalogo/CatalogoClientPage.tsx
'use client'

import { cartAddedFeedback } from '@/lib/cartFeedback'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { createStoreOrder, CreateStoreOrderError } from '@/lib/createStoreOrder'
import { useCheckoutFlow } from '@/lib/useCheckoutFlow'
import { isEstimateRejection } from '@/modules/delivery-estimate'
import { V2CheckoutReview } from '@/components/DeliveryEstimate/V2CheckoutReview'
import { Spinner } from '@/components/Spinner'
import { useTheme } from '@/app/contexts/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useCartStore, type CartAddon, cartItemUnitPrice, cartItemLineTotal } from '@/store/useCartStore'
import { Plus, Minus, Flame, X, Info, Search, Clock, Tag, Package, Calendar, MapPin, Truck, Store, QrCode, CreditCard, Banknote, Navigation, Home, CheckCircle2, Eye, EyeOff, ArrowLeft, User, Camera, ChevronDown, ChevronsUpDown, Trash2 } from 'lucide-react'
import { isDigitalCart } from '@/modules/digital'
import Image from 'next/image'
import { isStoreOpenNow, getNextOpeningInfo, getTodayHoursText, type BusinessHours } from '@/lib/storeHours'
import { toast } from '@/lib/toast'
import HeaderSearchInput from './HeaderSearchInput'
import CatalogBag, { type CartItemWithComment } from './CatalogBag'
import CatalogoSkeleton from './CatalogoSkeleton'
import { hexToRgb } from '@/lib/color'
import AddToCartModal from '@/components/AddToCartModal'
import FallbackImage from '@/components/FallbackImage'
import DigitalCurriculum from '@/components/digital/DigitalCurriculum'
import { captureReferral } from '@/lib/referralCapture'
import { saveOwnProfile } from '@/lib/saveOwnProfile'
import { useInsideShell } from '@/components/InsideShell'

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
    has_addons?: boolean
}

// Oferta: a loja escreve "De R$ 29,90 por R$ 21,90." no começo da descrição; o catálogo mostra o preço antigo riscado e o % OFF (o preço cobrado é sempre o do produto)
function parsePromo(desc: string | null | undefined, price: number): { old: number; pct: number; rest: string } | null {
    const m = (desc || '').match(/^\s*De\s+R\$\s*([\d.]+,\d{2})\s+por\s+R\$\s*[\d.]+,\d{2}\.?\s*/i)
    if (!m || !desc) return null
    const old = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
    if (!(old > price) || !(price > 0)) return null
    return { old, pct: Math.round((1 - price / old) * 100), rest: desc.slice(m[0].length) }
}

interface StoreInfo {
    id: string
    name: string
    slug: string
    logo_url: string | null
    banner_url: string | null
    business_hours?: BusinessHours | null
    owner_id: string
}

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function CatalogoClientPage() {
    const params = useParams()
    const router = useRouter()
    const insideShell = useInsideShell()   // v3: a página abre dentro da casca (navbar fixa) e ganha o botão voltar
    const { colors } = useTheme()
    const {
        userId,
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
    const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({})   // categorias recolhidas (buscando, tudo abre)
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
    const [showProductModal, setShowProductModal] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos')
    const [searchExpanded, setSearchExpanded] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // ===== STATES PARA O BUTTON SHOPPING BAG =====
    const [isBagExpanded, setIsBagExpanded] = useState(false)
    const [bagItems, setBagItems] = useState<CartItemWithComment[]>([])
    const [showAddCommentModal, setShowAddCommentModal] = useState(false)
    const [pendingProduct, setPendingProduct] = useState<any | null>(null)

    // ===== STATES PARA FINALIZAÇÃO =====
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [checkoutStep, setCheckoutStep] = useState<'auth' | 'delivery' | 'payment' | null>(null)

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
    const [deliveryOption, setDeliveryOption] = useState<'entrega' | 'retirada' | null>(null)
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao' | 'dinheiro' | null>(null)
    const [cashChangeFor, setCashChangeFor] = useState('')
    const [cardIsContactless, setCardIsContactless] = useState<boolean | null>(null)
    const [deliveryAddress, setDeliveryAddress] = useState('')
    const [deliveryLat, setDeliveryLat] = useState<number | null>(null)
    const [deliveryLng, setDeliveryLng] = useState<number | null>(null)
    const [locationSearchQuery, setLocationSearchQuery] = useState('')
    const [isSearchingLocation, setIsSearchingLocation] = useState(false)
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null)
    // Só mostra a busca de endereço quando ainda não tem um selecionado, ou
    // quando a pessoa pede pra trocar explicitamente - senão fica sempre
    // visível junto do endereço já escolhido, o que é redundante.
    const [isEditingAddress, setIsEditingAddress] = useState(false)
    // Enquanto escolhendo/trocando endereço: começa mostrando a escolha entre
    // usar o salvo ou alterar - só revela o campo de busca se a pessoa pedir
    // pra alterar (evita jogar tudo na tela de uma vez).
    const [showAddressSearch, setShowAddressSearch] = useState(false)
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
        store_address: string | null
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

    // ===== SE A LOJA SÓ TEM UMA FORMA DE RECEBIMENTO, JÁ SELECIONA AUTOMATICAMENTE =====
    useEffect(() => {
        if (!storeConfig || deliveryOption) return
        if (storeConfig.accepts_pickup && !storeConfig.accepts_delivery) {
            setDeliveryOption('retirada')
        } else if (storeConfig.accepts_delivery && !storeConfig.accepts_pickup) {
            setDeliveryOption('entrega')
        }
    }, [storeConfig, deliveryOption])


    // ========== CORES DO HEADER ==========
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
                    .select('id, name, storeSlug, logo_url, banner_url, business_hours, accepts_delivery, accepts_pickup, accepts_pix, accepts_card, accepts_cash, delivery_type, delivery_fee, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, store_lat, store_lng, address, owner_id')
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
                    owner_id: store.owner_id,
                })

                // Link do catálogo compartilhado também vale como convite:
                // visitante ainda não logado vira indicado do dono da loja
                // se se cadastrar depois.
                if (!userId) {
                    captureReferral(supabase, { ownerId: store.owner_id })
                }

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
                    store_address: store.address || null,
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
    }, [])

    // Chegou por um link do bot do WhatsApp (?addCart=...) — adiciona os
    // itens na sacola dessa loja e limpa a URL. Só roda depois que
    // storeInfo carrega (addItem precisa do nome/logo da loja).
    const [pendingCartHydrate, setPendingCartHydrate] = useState(false)
    useEffect(() => {
        if (!storeInfo || !ownerSlug) return
        if (typeof window === 'undefined') return
        const raw = new URLSearchParams(window.location.search).get('addCart')
        if (!raw) return
        try {
            const payload = JSON.parse(raw) as {
                items: { id: string; name: string; price: number; image_url: string | null; slug?: string; quantity: number }[]
            }
            if (Array.isArray(payload.items) && payload.items.length > 0) {
                for (const item of payload.items) {
                    const product = { id: item.id, name: item.name, price: item.price, image_url: item.image_url, slug: item.slug }
                    addItem(ownerSlug, { name: storeInfo.name, logo_url: storeInfo.logo_url }, product as any)
                    if (item.quantity > 1) {
                        updateQuantity(ownerSlug, item.id, item.quantity - 1)
                    }
                }
                setIsBagExpanded(true)
                setPendingCartHydrate(true)
            }
        } catch {
            // link malformado — ignora silenciosamente
        }
        router.replace(`/${ownerSlug}/catalogo`, { scroll: false })
    }, [storeInfo, ownerSlug, addItem, updateQuantity, router])

    // Assim que soubermos se a pessoa está logada, abre direto a etapa
    // certa: checkout (se já logada) ou o pedido de identificação (se
    // não) — mesmo caminho do botão "Finalizar" da sacola.
    useEffect(() => {
        if (!pendingCartHydrate || profileLoading) return
        setCheckoutStep(currentUserId ? 'delivery' : 'auth')
        setPendingCartHydrate(false)
    }, [pendingCartHydrate, profileLoading, currentUserId])

    // ========== FUNÇÕES DO USUÁRIO ==========
    const loadUserData = useCallback(async (uid: string) => {
        setCurrentUserId(uid)
        const { data: profile } = await supabase
            .from('my_profile')
            .select('profileSlug, avatar_url, name, address, store_lat, store_lng')
            .eq('id', uid)
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
    }, [supabase])

    useEffect(() => {
        if (userId) loadUserData(userId)
    }, [userId, loadUserData])

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

    // Carrinho só de produto DIGITAL: sem entrega nem retirada de verdade (retirada + Pix; o acesso abre quando a loja confirma o pagamento)
    const digitalOnly = isDigitalCart(cartItems)
    const canChooseReceivingMethod = !digitalOnly && !!(storeConfig?.accepts_delivery && storeConfig?.accepts_pickup)
    const onlyPickupAvailable = digitalOnly || !!(storeConfig?.accepts_pickup && !storeConfig?.accepts_delivery)
    const onlyDeliveryAvailable = !digitalOnly && !!(storeConfig?.accepts_delivery && !storeConfig?.accepts_pickup)
    useEffect(() => { if (digitalOnly && deliveryOption !== 'retirada') setDeliveryOption('retirada') }, [digitalOnly, deliveryOption])

    useEffect(() => {
        const items = cartItems.map(item => ({
            product: item.product,
            quantity: item.quantity,
            comment: item.comment || '',
            addons: item.addons,
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
            // Soma todas as linhas do produto — pode haver mais de uma quando
            // cada uma tem uma observação diferente.
            return storeItems
                .filter((item) => item.product.id === productId)
                .reduce((sum, item) => sum + item.quantity, 0)
        },
        [itemsByStore, ownerSlug]
    )

    // ===== FUNÇÃO: Adicionar com etapas (observação sempre; adicionais só se a loja habilitar) =====
    // Etapas em si (observação + adicionais) ficam no <AddToCartModal>,
    // compartilhado com a página de produto.
    const handleAddWithComment = (product: any) => {
        if (!storeInfo || !ownerSlug) return

        if (!isStoreOpen) {
            toast.error('Loja fechada no momento. Não é possível adicionar itens ao carrinho.')
            return
        }

        // Produto digital não tem observação nem adicionais: vai direto para o carrinho
        if (product.type === 'digital') {
            addItem(ownerSlug, { name: storeInfo.name, logo_url: storeInfo.logo_url ?? null }, {
                id: product.id, name: product.name, price: product.price || 0, image_url: product.image_url || null, slug: product.slug, type: 'digital',
                description: product.description || undefined, category: product.category || undefined,
            } as any)
            void cartAddedFeedback()
            return
        }

        setPendingProduct(product)
        setShowAddCommentModal(true)
    }

    const confirmAddWithComment = (comment: string | undefined, addons: CartAddon[]) => {
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
            type: pendingProduct.type || undefined,
            description: pendingProduct.description || undefined,
            category: pendingProduct.category || undefined,
        }

        // Duas adições do mesmo produto com observação e/ou adicionais
        // diferentes viram linhas separadas no carrinho (ver
        // useCartStore.addItem) — assim a personalização de cada uma não se
        // perde nem sobrescreve a outra.
        addItem(ownerSlug, storeDetails, cartProduct as any, comment, addons.length > 0 ? addons : undefined)

        // 3.0: o aviso cobria a peça de baixo; o retorno visual já está no selo/quantidade do produto e na faixa da sacola
        if (!insideShell) toast.success(`Produto adicionado${comment || addons.length > 0 ? ' com personalização!' : '!'}`)
        void cartAddedFeedback()
        setShowAddCommentModal(false)
        setPendingProduct(null)
    }

    const increaseQuantity = useCallback(
        (product: any, comment?: string, addons?: CartAddon[]) => {
            if (!storeInfo || !ownerSlug) return

            if (!isStoreOpen) {
                toast.error('Loja fechada no momento. Não é possível adicionar itens ao carrinho.')
                return
            }

            addItem(ownerSlug, { name: storeInfo.name, logo_url: storeInfo.logo_url ?? null }, product, comment, addons)
        },
        [storeInfo, ownerSlug, addItem, isStoreOpen]
    )

    const decreaseQuantity = useCallback(
        (productId: string, comment?: string, addons?: CartAddon[]) => {
            if (!ownerSlug) return
            updateQuantity(ownerSlug, productId, -1, comment, addons)
        },
        [ownerSlug, updateQuantity]
    )

    const removeAllOfProduct = useCallback(
        (productId: string, comment?: string, addons?: CartAddon[]) => {
            if (!ownerSlug) return
            removeItem(ownerSlug, productId, comment, addons)
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
            setIsEditingAddress(false)
            setShowAddressSearch(false)
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
            await loadUserData(data.user.id)
            setCheckoutStep('delivery')
            setIsBagExpanded(true)
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

            // Indicação: respeita uma indicação já existente (cookie de
            // /convite, de outra pessoa) antes de qualquer coisa. Só se não
            // tiver nenhuma é que o dono desta loja vira quem indicou —
            // reconhece quem trouxe a pessoa pro iUser, sem travar a compra.
            let uplineId: string | null = null
            let usedReferralCookie = false
            try {
                const res = await fetch('/api/get-referral-cookie')
                const cookieData = await res.json()
                if (cookieData.referralSlug) {
                    const { data: upline } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('profileSlug', cookieData.referralSlug)
                        .maybeSingle()
                    if (upline) {
                        uplineId = upline.id
                        usedReferralCookie = true
                    }
                }
            } catch {
                // sem cookie/indicação prévia — segue pro fallback da loja
            }
            if (!uplineId && storeInfo?.owner_id) {
                uplineId = storeInfo.owner_id
            }

            await saveOwnProfile(supabase, data.user.id, {
                name: authName,
                profileSlug: authProfileSlug,
                avatar_url: avatarUrl,
                upline_id: uplineId,
            })
            if (usedReferralCookie) {
                await fetch('/api/clear-referral-cookie', { method: 'POST' })
            }
            await loadUserData(data.user.id)
            setCheckoutStep('delivery')
            setIsBagExpanded(true)
            toast.success('Conta criada com sucesso!')
        }
        setAuthLoading(false)
    }

    // ===== CAMINHO V2 (entrega iUser com estimativa oficial) — desligado em produção =====
    // O servidor decide (chave global E da loja); aqui só se escolhe a tela. Estimativa/validade: V2CheckoutReview (compartilhado).
    const checkoutFlow = useCheckoutFlow(storeInfo?.id, currentUserId)
    const isV2Delivery = checkoutFlow === 'v2' && deliveryOption === 'entrega'

    // ===== FUNÇÃO DE FINALIZAR COMPRA =====
    const calculateDeliveryFee = useCallback((): { fee: number; isCalculating: boolean } => {
        if (deliveryOption !== 'entrega' || !storeConfig) {
            return { fee: 0, isCalculating: false }
        }

        if (!deliveryLat || !deliveryLng) {
            return { fee: 0, isCalculating: true }
        }
        // V2: o frete é a ESTIMATIVA oficial do servidor (etapa de revisão); nenhuma conta de frete no navegador
        if (isV2Delivery) return { fee: 0, isCalculating: true }

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
    }, [deliveryOption, storeConfig, deliveryLat, deliveryLng, isV2Delivery])

    const getStoreTotals = useCallback(() => {
        const items = cartItems
        const itemsTotal = items.reduce((acc, item) => acc + cartItemLineTotal(item), 0)
        const { fee: deliveryFee, isCalculating } = calculateDeliveryFee()
        const finalTotal = isCalculating ? itemsTotal : itemsTotal + deliveryFee
        return { itemsTotal, deliveryFee, finalTotal, isCalculating }
    }, [cartItems, calculateDeliveryFee])

    // ===== ESTIMATIVA DE FRETE PARA O CARRINHO FLUTUANTE (antes de escolher entrega/retirada no checkout) =====
    const bagDeliveryEstimate = useMemo((): {
        type: 'free' | 'fixed' | 'distance' | 'none'
        fee: number
        isEstimate: boolean
        distanceKm: number | null
        originAddress: string | null
        destinationAddress: string | null
        baseDistanceKm: number | null
        baseFee: number | null
        feePerKm: number | null
    } => {
        if (!storeConfig || !storeConfig.accepts_delivery) {
            return { type: 'none', fee: 0, isEstimate: false, distanceKm: null, originAddress: null, destinationAddress: null, baseDistanceKm: null, baseFee: null, feePerKm: null }
        }
        // V2: o frete só aparece na etapa de revisão, vindo da estimativa oficial do servidor
        if (checkoutFlow === 'v2') {
            return { type: 'distance', fee: 0, isEstimate: true, distanceKm: null, originAddress: null, destinationAddress: null, baseDistanceKm: null, baseFee: null, feePerKm: null }
        }

        // Endereço de destino: o já escolhido no checkout, senão o salvo no perfil
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
        if (dtype === 'free') {
            return { type: 'free', fee: 0, isEstimate: false, distanceKm, originAddress, destinationAddress, baseDistanceKm: null, baseFee: null, feePerKm: null }
        }
        if (dtype === 'fixed') {
            return { type: 'fixed', fee: Number(storeConfig.delivery_fee) || 0, isEstimate: false, distanceKm, originAddress, destinationAddress, baseDistanceKm: null, baseFee: null, feePerKm: null }
        }
        if (dtype === 'distance') {
            const feePerKm = Number(storeConfig.delivery_fee_per_km) || 0
            const baseDist = Number(storeConfig.delivery_base_distance) || 0
            const baseFee = Number(storeConfig.delivery_base_fee) || 0

            if (distanceKm == null) {
                // Sem endereço ainda pra calcular a distância real: mostra a partir do valor base
                return { type: 'distance', fee: baseFee, isEstimate: true, distanceKm: null, originAddress, destinationAddress: null, baseDistanceKm: baseDist, baseFee, feePerKm }
            }

            const fee = distanceKm <= baseDist ? baseFee : baseFee + (distanceKm - baseDist) * feePerKm
            return { type: 'distance', fee, isEstimate: false, distanceKm, originAddress, destinationAddress, baseDistanceKm: baseDist, baseFee, feePerKm }
        }
        return { type: 'none', fee: 0, isEstimate: false, distanceKm: null, originAddress: null, destinationAddress: null, baseDistanceKm: null, baseFee: null, feePerKm: null }
    }, [storeConfig, deliveryLat, deliveryLng, userLocation, deliveryAddress, userAddress, checkoutFlow])

    const finalizeOrder = async (estimateId?: string): Promise<{ estimateRejected?: boolean } | void> => {
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
            toast.error('Seu carrinho está vazio')
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

        if (!paymentMethod && !isV2Delivery) {
            toast.error('Escolha a forma de pagamento')
            setCheckoutStep('payment')
            return
        }
        if (isV2Delivery && !estimateId) {
            toast.error('Aguarde o cálculo da entrega para enviar o pedido')
            return
        }

        setCheckoutLoading(true)

        try {
            let { itemsTotal, deliveryFee, finalTotal } = getStoreTotals()
            const address = deliveryOption === 'entrega' ? deliveryAddress : 'Retirada no local'

            let created: Awaited<ReturnType<typeof createStoreOrder>>
            try {
                // Preços, adicionais, frete, desconto, total e status inicial são calculados pelo servidor
                created = await createStoreOrder({
                    storeId: storeInfo.id,
                    items: cartItems,
                    deliveryOption: deliveryOption as 'entrega' | 'retirada',
                    paymentMethod: (paymentMethod ?? 'combinar') as string,
                    estimateId: isV2Delivery ? estimateId : null,   // V2: createStoreOrder força 'entrega' + 'combinar'
                    address: address,
                    lat: deliveryOption === 'entrega' ? deliveryLat : null,
                    lng: deliveryOption === 'entrega' ? deliveryLng : null,
                    cashChangeFor: paymentMethod === 'dinheiro' && cashChangeFor.trim() ? Number(cashChangeFor.replace(',', '.')) : null,
                    cardIsContactless: paymentMethod === 'cartao' ? cardIsContactless : null,
                    discountCode: null,
                })
            } catch (err: any) {
                console.error('[Checkout] Erro ao criar pedido:', err)
                toast.error(err?.message || 'Erro ao criar pedido')
                setCheckoutLoading(false)
                // estimativa recusada (expirou, endereço mudou…): a revisão busca outra e MOSTRA o valor antes de confirmar de novo
                return { estimateRejected: err instanceof CreateStoreOrderError && isEstimateRejection(err.hint) }
            }
            const orderData = { id: created.orderId }
            itemsTotal = created.itemsTotal
            deliveryFee = created.deliveryFee
            finalTotal = created.totalAmount

            // Limpa o carrinho - CORREÇÃO: verifica se ownerSlug existe
            if (ownerSlug) {
                clearStoreCart(ownerSlug)
                await syncToSupabase(currentUserId)
            }

            // Abre WhatsApp
            try {
                // Telefone da loja: RPC que só responde a quem acabou de fazer pedido nela
                const { data: waRows } = await supabase.rpc('get_store_order_whatsapp', { p_store: storeInfo.id })
                const waRow = Array.isArray(waRows) ? waRows[0] : waRows
                const whatsapp: string | null | undefined = waRow?.whatsapp
                if (whatsapp && waRow?.orders_enabled !== false) {
                    const paymentLabel = isV2Delivery ? 'A combinar após a loja aceitar' : paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'cartao' ? 'Cartão' : 'Dinheiro'
                    const deliveryLabel = deliveryOption === 'entrega'
                        ? `Entrega (${address})${deliveryFee > 0 ? ` - Taxa: R$ ${deliveryFee.toFixed(2)}` : ' - Grátis'}`
                        : 'Retirada no Balcão'
                    const message = encodeURIComponent(
                        `*Novo Pedido - iUser*\n\n` +
                        `*Cliente:* @${currentUserSlug || 'cliente'}\n` +
                        `*Pagamento:* ${paymentLabel}\n` +
                        `*Entrega:* ${deliveryLabel}\n` +
                        `*Itens:*\n${cartItems.map((i) => `- ${i.quantity}x ${i.product.name}${i.addons && i.addons.length > 0 ? ` (${i.addons.map(a => a.name).join(', ')})` : ''} (R$ ${cartItemLineTotal(i).toFixed(2)})${i.comment ? ` - Obs: ${i.comment}` : ''}`).join('\n')}\n\n` +
                        `*Subtotal: R$ ${itemsTotal.toFixed(2)}*\n` +
                        `*Taxa de entrega: R$ ${deliveryFee.toFixed(2)}*\n` +
                        `*Total: R$ ${finalTotal.toFixed(2)}*`
                    )
                    window.open(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${message}`, '_blank')
                }
            } catch (waErr) {
                console.warn('[Checkout] Falha ao abrir WhatsApp:', waErr)
            }

            toast.success(isV2Delivery ? 'Pedido enviado! Aguarde a loja aceitar.' : 'Pedido realizado com sucesso! 🎉')
            setIsBagExpanded(false)
            setCheckoutStep(null)
            setCheckoutLoading(false)

        } catch (err: any) {
            console.error('[Checkout] Erro inesperado:', err)
            toast.error(`Erro inesperado: ${err?.message ?? 'Tente novamente.'}`)
            setCheckoutLoading(false)
        }
    }
    // onClick={handleFinalizeOrder} passa o evento como 1º argumento: o caminho V1 não recebe parâmetros
    const handleFinalizeOrder = () => finalizeOrder()
    const submitV2Order = (estimateId: string) => finalizeOrder(estimateId)

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

    // ========== AGRUPAR POR CATEGORIA (o tipo vira título da seção, não etiqueta do card) ==========
    // "Promoções" vem sempre primeiro (na lista e nos chips)
    const isPromoCategory = (name: string | null | undefined) => /promo/i.test(name || '')
    const groupedFilteredProducts = useMemo(() => {
        const groups: Record<string, typeof filteredProducts> = {}
        filteredProducts.forEach(product => {
            const cat = product.category || 'Geral'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(product)
        })
        // promoções primeiro e, depois, as categorias com mais produtos (a mesma ordem dos chips)
        const total: Record<string, number> = {}
        products.forEach(p => { const c = p.category || 'Geral'; total[c] = (total[c] || 0) + 1 })
        const sortedNames = Object.keys(groups).sort((a, b) => Number(isPromoCategory(b)) - Number(isPromoCategory(a)) || (total[b] || 0) - (total[a] || 0))
        return Object.fromEntries(sortedNames.map(n => [n, groups[n]])) as Record<string, typeof filteredProducts>
    }, [filteredProducts, products])

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
            ...Array.from(cats.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => Number(isPromoCategory(b.name)) - Number(isPromoCategory(a.name)) || b.count - a.count)
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
        // esqueleto com a forma do catálogo (3.0: grade + peça de baixo; 2.0: lista em linhas)
        return <div style={{ background: colors.background, minHeight: insideShell ? undefined : '100dvh' }}><CatalogoSkeleton v3={insideShell} /></div>
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
            {!insideShell && (
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
            )}

            <main className="relative z-10 min-h-dvh" style={{ paddingBottom: insideShell ? 'calc(150px + var(--staging-banner-h, 0px))' : '8rem' }}>

                {/* ===== 3.0: o topo é só o título da loja e as categorias (nada flutuante). Voltar, loja e busca ficam na peça de baixo, fundidos à sacola. ===== */}
                {insideShell ? (
                    <div className="px-4 pt-3 pb-1">
                        {/* logo ao lado do nome (o anel mostra se está aberta); toque leva à página da loja */}
                        <button onClick={() => router.push(`/${ownerSlug}`)} className="flex items-center gap-3 min-w-0 text-left max-w-full">
                            <span className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-black" style={{ background: GRADIENT, boxShadow: `0 0 0 2.5px ${isStoreOpen ? '#16a34a' : '#ef4444'}` }}>
                                {storeInfo.logo_url ? <img src={storeInfo.logo_url} alt="" className="w-full h-full object-cover" /> : storeInfo.name.trim().charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-xl font-black leading-tight tracking-tight truncate" style={{ color: colors.textPrimary }}>{storeInfo.name}</span>
                                <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: isStoreOpen ? '#16a34a' : '#ef4444' }}>
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isStoreOpen ? '#16a34a' : '#ef4444' }} />
                                    <span className="truncate">
                                        {isStoreOpen
                                            ? `Aberta agora${(() => { const h = getTodayHoursText(storeInfo.business_hours); return h ? ` · ${h === '00:00 - 00:00' ? '24 horas' : h}` : '' })()}`
                                            : nextAvailable ? `Fechada · abre ${nextAvailable.day} às ${nextAvailable.open}` : 'Fechada agora'}
                                    </span>
                                </span>
                            </span>
                        </button>
                        {categories.length > 1 && (
                            <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-0.5">
                                {categories.map((cat) => {
                                    const on = selectedCategory === cat.name
                                    return (
                                        <button
                                            key={cat.name}
                                            onClick={() => setSelectedCategory(cat.name)}
                                            className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-black whitespace-nowrap flex-shrink-0 transition active:scale-95"
                                            style={{ background: on ? '#f9731614' : colors.background, color: on ? '#ea580c' : colors.textPrimary, border: `1.5px solid ${on ? '#f97316' : colors.border}` }}
                                        >
                                            {cat.name}
                                            <span className="text-[10px] font-black px-1.5 py-px rounded-full" style={{ background: on ? '#f97316' : `${colors.border}66`, color: on ? '#fff' : colors.textSecondary }}>{cat.count}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                <div
                    style={{
                        color: colors.textPrimary,
                        padding: '8px 12px 14px 12px',
                        position: 'sticky',
                        top: insideShell ? 'var(--shell-top, 0px)' : 0,
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
                        <div className="flex items-center gap-3">
                            {insideShell && (
                                <button
                                    onClick={() => (typeof window !== 'undefined' && window.history.length > 1 ? router.back() : router.push(`/${ownerSlug}`))}
                                    aria-label="Voltar"
                                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95"
                                    style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                                >
                                    <ArrowLeft size={19} />
                                </button>
                            )}
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

                )}

                {/* Banner da loja */}
                {storeInfo.banner_url && (
                    <div className={insideShell ? 'mx-4 mt-2 h-36 rounded-3xl relative overflow-hidden' : 'w-full h-96 md:h-[32rem] relative overflow-hidden'}>
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
                        <div className="flex flex-col gap-6">
                            {Object.entries(groupedFilteredProducts).map(([category, categoryProducts], groupIndex, allGroups) => {
                                const isCollapsed = !searchQuery.trim() && !!collapsedCats[category]
                                const allCollapsed = allGroups.every(([c]) => collapsedCats[c])
                                const toggle = () => setCollapsedCats(prev => ({ ...prev, [category]: !prev[category] }))
                                return (
                                <div key={category} className="flex flex-col gap-3">
                                    {groupIndex === 0 && allGroups.length > 1 && !searchQuery.trim() && (
                                        <div className="flex items-center justify-between gap-2 px-1">
                                            <span className="text-[11px] font-bold" style={{ color: textColor }}>{allGroups.length} categorias</span>
                                            <button
                                                onClick={() => setCollapsedCats(Object.fromEntries(allGroups.map(([c]) => [c, !allCollapsed])))}
                                                className="h-8 px-3 rounded-full text-[11px] font-black flex items-center gap-1 transition active:scale-95"
                                                style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                                            >
                                                <ChevronsUpDown size={13} /> {allCollapsed ? 'Expandir todas' : 'Recolher todas'}
                                            </button>
                                        </div>
                                    )}
                                    {/* 3.0: com uma categoria só, o título ("Geral") não diz nada */}
                                    {!(insideShell && allGroups.length <= 1) && (
                                        <button type="button" onClick={toggle} aria-expanded={!isCollapsed} className="w-full flex items-center gap-2 px-1 text-left transition active:opacity-70">
                                            {insideShell && isPromoCategory(category) ? (
                                                <span className="flex-1 min-w-0 flex items-center gap-2 text-xl font-black leading-none" style={{ color: '#dc2626' }}>
                                                    <Flame size={22} /> {category}
                                                    <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(220,38,38,0.4), transparent)' }} />
                                                </span>
                                            ) : insideShell ? (
                                                <span className="flex-1 min-w-0 flex items-center gap-2 text-xl font-black leading-none" style={{ color: colors.textPrimary }}>
                                                    {category}
                                                    <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>{categoryProducts.length}</span>
                                                    <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${colors.border}, transparent)` }} />
                                                </span>
                                            ) : (
                                                <span className="flex-1 min-w-0 text-[11px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>{category}</span>
                                            )}
                                            <ChevronDown size={insideShell ? 20 : 14} className="flex-shrink-0 transition-transform" style={{ color: insideShell && isPromoCategory(category) ? '#dc2626' : '#f97316', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }} />
                                        </button>
                                    )}
                                    {!(isCollapsed && !(insideShell && allGroups.length <= 1)) && (
                                    <div className={insideShell ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-4'}>
                                        {categoryProducts.map((product) => {
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


                                // 3.0: cartão em grade (foto em cima, nome, preço e o botão de adicionar/quantidade), no desenho do /comprar
                                if (insideShell) {
                                    const soldOut = product.stock !== null && product.stock <= 0
                                    const promo = parsePromo(product.description, product.price)
                                    // Adicionar / −·+ : o mesmo nos dois desenhos do cartão (sobre a foto escura, os botões ficam translúcidos)
                                    const controls = (dark: boolean) => soldOut ? null : isSelected && !productIsDisabled ? (
                                        <span className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); if (quantity <= 1) removeAllOfProduct(product.id); else decreaseQuantity(product.id) }}
                                                aria-label={quantity <= 1 ? 'Remover' : 'Diminuir'}
                                                className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90"
                                                style={{ background: dark ? 'rgba(255,255,255,0.25)' : `${colors.border}55`, color: dark ? '#fff' : quantity <= 1 ? '#ef4444' : colors.textPrimary }}
                                            >
                                                {quantity <= 1 ? <X size={14} /> : <Minus size={14} />}
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleAddWithComment(product) }}
                                                aria-label="Adicionar mais um"
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-white transition active:scale-90"
                                                style={{ background: GRADIENT }}
                                            >
                                                <Plus size={14} strokeWidth={3} />
                                            </button>
                                        </span>
                                    ) : (
                                        <button
                                            onClick={handleProductInteraction}
                                            aria-label={productIsDisabled ? 'Ver detalhes' : `Adicionar ${product.name}`}
                                            className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 transition active:scale-90"
                                            style={{ background: productIsDisabled ? (dark ? 'rgba(255,255,255,0.25)' : `${colors.border}`) : GRADIENT, color: productIsDisabled && !dark ? colors.textSecondary : '#fff' }}
                                        >
                                            {productIsDisabled ? <Info size={15} /> : <Plus size={16} strokeWidth={3} />}
                                        </button>
                                    )
                                    // Oferta: a foto é o fundo do cartão e as letras ficam na frente (diferente dos outros, com a foto em cima e o texto embaixo)
                                    if (promo || isPromoCategory(category)) {
                                        return (
                                            <div
                                                key={product.id}
                                                onClick={(e) => handleProductClick(product, e)}
                                                className="relative aspect-[4/5] rounded-3xl overflow-hidden cursor-pointer text-left transition active:scale-[0.99]"
                                                style={{ background: GRADIENT, boxShadow: '0 8px 22px rgba(220,38,38,0.22)', outline: isSelected ? '2px solid #22c55e' : 'none', outlineOffset: -2, opacity: soldOut ? 0.6 : 1 }}
                                            >
                                                {product.image_url || storeInfo?.logo_url
                                                    ? <img src={product.image_url || storeInfo?.logo_url || ''} alt="" className={`absolute inset-0 w-full h-full ${product.image_url ? 'object-cover' : 'object-contain p-10'}`} loading="lazy" />
                                                    : <span className="absolute inset-0 flex items-center justify-center text-white/90 text-5xl font-black">{storeInfo?.name?.trim().charAt(0).toUpperCase() || '?'}</span>}
                                                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 38%, rgba(0,0,0,0) 68%)' }} />
                                                {soldOut
                                                    ? <span className="absolute left-2 top-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white" style={{ background: '#dc2626' }}>Esgotado</span>
                                                    : promo && <span className="absolute left-2 top-2 text-xs font-black px-2.5 py-1 rounded-full text-white flex items-center gap-1" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', boxShadow: '0 2px 8px rgba(239,68,68,0.5)' }}><Flame size={12} />-{promo.pct}%</span>}
                                                {isSelected && quantity > 0 && (
                                                    <span className="absolute right-2 top-2 min-w-[24px] h-6 px-1.5 rounded-full text-[11px] font-black text-white flex items-center justify-center" style={{ background: '#16a34a', boxShadow: '0 0 0 2px #fff' }}>{quantity}</span>
                                                )}
                                                <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col gap-1.5">
                                                    <h3 className="text-[13px] font-black leading-snug text-white" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{product.name}</h3>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-lg font-black text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                                                            {formatPrice(product.price)}{isHourly && <span className="text-[10px] font-bold text-white/80"> /h</span>}
                                                        </span>
                                                        {controls(true)}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }
                                    return (
                                        <div
                                            key={product.id}
                                            onClick={(e) => handleProductClick(product, e)}
                                            className="rounded-3xl overflow-hidden flex flex-col cursor-pointer text-left transition active:scale-[0.99]"
                                            style={{ background: colors.surface, border: `1px solid ${isSelected ? '#22c55e' : colors.border}`, boxShadow: '0 6px 18px rgba(0,0,0,0.06)', opacity: soldOut ? 0.6 : 1 }}
                                        >
                                            <div className="relative aspect-[5/4] overflow-hidden" style={{ background: GRADIENT }}>
                                                {product.image_url || storeInfo?.logo_url
                                                    ? <img src={product.image_url || storeInfo?.logo_url || ''} alt="" className={`w-full h-full ${product.image_url ? 'object-cover' : 'object-contain p-6'}`} loading="lazy" />
                                                    : <span className="absolute inset-0 flex items-center justify-center text-white/90 text-4xl font-black">{storeInfo?.name?.trim().charAt(0).toUpperCase() || '?'}</span>}
                                                {soldOut && <span className="absolute left-2 top-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white" style={{ background: '#dc2626' }}>Esgotado</span>}
                                                {isSelected && quantity > 0 && (
                                                    <span className="absolute right-2 top-2 min-w-[24px] h-6 px-1.5 rounded-full text-[11px] font-black text-white flex items-center justify-center" style={{ background: '#16a34a', boxShadow: '0 0 0 2px #fff' }}>{quantity}</span>
                                                )}
                                            </div>
                                            <div className="p-2.5 flex flex-col gap-1 flex-1">
                                                <h3 className="text-[13px] font-black leading-snug" style={{ color: colors.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.75em' }}>{product.name}</h3>
                                                {product.description && (
                                                    <p className="text-[11px] leading-snug truncate" style={{ color: colors.textSecondary }}>{product.description}</p>
                                                )}
                                                <div className="mt-auto pt-1.5 flex items-center justify-between gap-2">
                                                    <span className="flex flex-col leading-tight">
                                                        <span className="text-sm font-black" style={{ color: '#f97316' }}>
                                                            {formatPrice(product.price)}{isHourly && <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}> /h</span>}
                                                        </span>
                                                    </span>
                                                    {controls(false)}
                                                </div>
                                            </div>
                                        </div>
                                    )
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
                                                <div className="w-full h-full flex items-center justify-center font-black text-4xl" style={{ minHeight: '140px', background: GRADIENT, color: '#ffffff' }}>
                                                    {storeInfo?.name?.trim() ? storeInfo.name.trim().charAt(0).toUpperCase() : '?'}
                                                </div>
                                            )}
                                            {product.type && (
                                                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase backdrop-blur-md"
                                                    style={{ background: 'rgba(0,0,0,0.3)', color: '#ffffff' }}>
                                                    {product.type === 'physical' ? 'Produto' : product.type === 'service' ? 'Serviço' : 'Digital'}
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
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* ===== MARCA IUSER — fica embaixo do último produto, não mais no header ===== */}
                <div className="max-w-7xl mx-auto px-4 py-8 flex justify-center">
                    <button
                        onClick={handleHome}
                        className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer"
                    >
                        <img src="/logo.png" alt="iUser" className="w-6 h-6 object-contain" />
                        <span className="text-xs font-semibold" style={{ color: textColor }}>
                            Catálogo oferecido pelo iUser
                        </span>
                    </button>
                </div>

                {/* ===== BOTÃO FLUTUANTE - INÍCIO (lado direito; some enquanto a sacola está aberta) ===== */}
                {!insideShell && !isBagExpanded && !checkoutStep && (
                    <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                        <button
                            onClick={handleHome}
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                            style={{
                                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                color: '#ffffff',
                                border: '2px solid #f97316',
                                boxShadow: '0 8px 24px #f9731660',
                            }}
                            aria-label="Voltar ao início"
                        >
                            <Home size={24} />
                        </button>
                    </div>
                )}

                {/* ===== BOTÃO FLUTUANTE - SACOLA (agora no lado esquerdo; busca vive no header, igual à home) ===== */}
                <div style={insideShell
                    ? {
                        // UMA peça só (como a barra de baixo do app): sacola em cima e, embaixo, voltar + loja + busca
                        position: 'fixed', bottom: 'calc(10px + var(--staging-banner-h, 0px) + env(safe-area-inset-bottom))', left: 12, right: 12, maxWidth: 448, margin: '0 auto', zIndex: showProductModal ? 150 : 998,
                        background: colors.background, border: `1px solid ${colors.border}`, borderRadius: 30, boxShadow: '0 12px 32px rgba(0,0,0,0.2)', overflow: 'hidden',
                    }
                    : { position: 'fixed', bottom: 32, left: 16, zIndex: showProductModal ? 150 : 998, maxWidth: 'calc(100vw - 32px)' }}>
                    {/* 3.0: a sacola só aparece com itens (compacta, como a faixa do carrinho da barra); sem itens, só a linha de baixo */}
                    {(!insideShell || bagItems.length > 0) && (
                    <CatalogBag
                        v3={insideShell}
                        bare={insideShell}
                        bagItems={bagItems}
                        isExpanded={isBagExpanded}
                        onToggleExpanded={() => setIsBagExpanded(!isBagExpanded)}
                        onIncrease={increaseQuantity}
                        onDecrease={decreaseQuantity}
                        onRemove={removeAllOfProduct}
                        onCheckout={() => {
                            setCheckoutStep(currentUserId ? 'delivery' : 'auth')
                        }}
                        colors={colors}
                        isStoreOpen={isStoreOpen}
                        storeImageUrl={storeInfo?.logo_url ?? null}
                        storeName={storeInfo?.name}
                        checkoutContent={checkoutStep === 'delivery' ? (
                            <>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                        Etapa 1 de 2 · Recebimento
                                    </p>
                                    <button
                                        onClick={() => setCheckoutStep(null)}
                                        className="p-1 rounded-full hover:bg-black/5 transition"
                                        style={{ color: colors.textSecondary }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Pergunta de recebimento */}
                                <div className="mb-3">
                                    <p className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>
                                        Como você quer receber seu pedido?
                                    </p>

                                    {canChooseReceivingMethod ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            {([
                                                {
                                                    value: 'retirada' as const,
                                                    icon: Store,
                                                    label: 'Retirar na loja',
                                                    desc: 'Busque no balcão',
                                                    priceLine: (
                                                        <span className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                                            {formatPrice(getStoreTotals().itemsTotal)}
                                                        </span>
                                                    ),
                                                },
                                                {
                                                    value: 'entrega' as const,
                                                    icon: Truck,
                                                    label: 'Receber em casa',
                                                    desc: 'Entregamos no endereço',
                                                    priceLine: bagDeliveryEstimate.isEstimate ? (
                                                        <span className="text-[10px] font-medium" style={{ color: colors.textSecondary, opacity: 0.7 }}>
                                                            Frete a calcular
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span className="text-[9px] font-bold" style={{ color: bagDeliveryEstimate.fee === 0 ? '#22c55e' : colors.textSecondary }}>
                                                                {bagDeliveryEstimate.fee === 0 ? 'Frete grátis' : `+ ${formatPrice(bagDeliveryEstimate.fee)} frete`}
                                                            </span>
                                                            <span className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                                                {formatPrice(getStoreTotals().itemsTotal + bagDeliveryEstimate.fee)}
                                                            </span>
                                                        </>
                                                    ),
                                                },
                                            ]).map((opt) => {
                                                const selected = deliveryOption === opt.value
                                                return (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => setDeliveryOption(opt.value)}
                                                        className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 text-center transition hover:scale-[1.02] active:scale-95"
                                                        style={selected
                                                            ? { borderColor: '#f97316', background: `${colors.accent}10` }
                                                            : { borderColor: colors.border, background: 'transparent' }}
                                                    >
                                                        <div
                                                            className="w-10 h-10 rounded-full flex items-center justify-center"
                                                            style={selected ? { background: GRADIENT, color: '#ffffff' } : { background: `${colors.surface}88`, color: colors.textSecondary }}
                                                        >
                                                            <opt.icon size={18} />
                                                        </div>
                                                        <span className="text-xs font-bold" style={{ color: selected ? '#f97316' : colors.textPrimary }}>
                                                            {opt.label}
                                                        </span>
                                                        <span className="text-[9px]" style={{ color: colors.textSecondary }}>
                                                            {opt.desc}
                                                        </span>
                                                        <div className="w-full flex flex-col items-center gap-0.5 pt-1.5 mt-0.5 border-t" style={{ borderColor: colors.border }}>
                                                            {opt.priceLine}
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    ) : onlyPickupAvailable ? (
                                        <div
                                            className="flex items-center gap-3 p-3 rounded-2xl"
                                            style={{ background: `${colors.surface}66`, border: `1px dashed ${colors.border}` }}
                                        >
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                                                <Store size={18} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>{digitalOnly ? 'Produto digital: não tem entrega' : 'Essa loja não tem entrega'}</p>
                                                <p className="text-[10px]" style={{ color: colors.textSecondary }}>{digitalOnly ? 'Pague com Pix e o acesso abre em Minhas compras digitais quando a loja confirmar o pagamento' : 'Seu pedido será retirado no balcão'}</p>
                                            </div>
                                        </div>
                                    ) : onlyDeliveryAvailable ? (
                                        <div
                                            className="flex items-center gap-3 p-3 rounded-2xl"
                                            style={{ background: `${colors.surface}66`, border: `1px dashed ${colors.border}` }}
                                        >
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                                                <Truck size={18} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>Essa loja não faz retirada no local</p>
                                                <p className="text-[10px]" style={{ color: colors.textSecondary }}>Seu pedido será entregue no seu endereço</p>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                {/* Delivery Address */}
                                {deliveryOption === 'entrega' && (
                                    <div className="mb-3">
                                        <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Endereço de Entrega</p>

                                        {deliveryAddress && !isEditingAddress ? (
                                            /* Já tem endereço escolhido: mesmo cartão de recap usado na etapa 2 (Alterar) */
                                            <div
                                                className="flex items-center gap-3 p-2.5 rounded-xl"
                                                style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}
                                            >
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                                                    <MapPin size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                        {deliveryAddress}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => { setIsEditingAddress(true); setShowAddressSearch(false) }}
                                                    className="text-[10px] font-bold underline flex-shrink-0"
                                                    style={{ color: '#f97316' }}
                                                >
                                                    Alterar
                                                </button>
                                            </div>
                                        ) : userAddress && userLocation && !showAddressSearch ? (
                                            /* Tem endereço salvo no perfil: escolhe entre usar ele ou digitar outro - nunca os dois juntos */
                                            <div className="flex flex-col gap-2">
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
                                                        setIsEditingAddress(false)
                                                        setShowAddressSearch(false)
                                                        toast.success('Endereço do perfil selecionado!')
                                                    }}
                                                    className="w-full p-3 rounded-xl border-2 border-green-500/30 hover:bg-green-50 transition flex items-center gap-2.5 text-left"
                                                    style={{ background: 'rgba(16,185,129,0.05)' }}
                                                >
                                                    <Home size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                                                    <span className="flex-1 text-xs min-w-0" style={{ color: colors.textPrimary }}>
                                                        <span className="font-bold">Usar endereço salvo:</span> {userAddress}
                                                    </span>
                                                    <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                                                </button>
                                                <button
                                                    onClick={() => setShowAddressSearch(true)}
                                                    className="w-full py-2 rounded-xl border-2 text-xs font-bold transition hover:scale-[1.01]"
                                                    style={{ borderColor: colors.border, color: colors.textSecondary }}
                                                >
                                                    Alterar
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: colors.border }}>
                                                    <Search size={14} style={{ color: colors.textSecondary }} />
                                                    <input
                                                        type="text"
                                                        value={locationSearchQuery}
                                                        onChange={(e) => setLocationSearchQuery(e.target.value)}
                                                        placeholder="Buscar endereço..."
                                                        className="flex-1 bg-transparent outline-none text-sm min-w-0"
                                                        style={{ color: colors.textPrimary }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') searchLocation() }}
                                                    />
                                                </div>
                                                <button
                                                    onClick={searchLocation}
                                                    disabled={isSearchingLocation}
                                                    className="px-3 py-1.5 rounded-full text-xs font-bold text-white disabled:opacity-50 flex-shrink-0"
                                                    style={{ background: GRADIENT }}
                                                >
                                                    {isSearchingLocation ? '...' : 'Buscar'}
                                                </button>
                                                {(deliveryAddress || (userAddress && userLocation)) && (
                                                    <button
                                                        onClick={() => { setIsEditingAddress(false); setShowAddressSearch(false) }}
                                                        className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
                                                        style={{ border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => setCheckoutStep(null)}
                                        className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95"
                                        style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={() => setCheckoutStep('payment')}
                                        disabled={!deliveryOption || (deliveryOption === 'entrega' && !deliveryAddress.trim())}
                                        className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95 disabled:opacity-50"
                                        style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 14px #f9731660` }}
                                    >
                                        {!deliveryOption ? 'Escolha como receber' :
                                            (deliveryOption === 'entrega' && !deliveryAddress.trim()) ? 'Informe o endereço' :
                                                'Continuar'}
                                    </button>
                                </div>
                            </>
                        ) : checkoutStep === 'payment' && isV2Delivery && storeInfo ? (
                            <>
                                <p className="mb-3 text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                    Etapa 2 de 2 · Revisão
                                </p>
                                <V2CheckoutReview
                                    storeId={storeInfo.id}
                                    itemsTotal={getStoreTotals().itemsTotal}
                                    address={deliveryAddress}
                                    lat={deliveryLat}
                                    lng={deliveryLng}
                                    submitting={checkoutLoading}
                                    onBack={() => setCheckoutStep('delivery')}
                                    onSubmit={submitV2Order}
                                />
                            </>
                        ) : checkoutStep === 'payment' ? (
                            <>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                        Etapa 2 de 2 · Pagamento
                                    </p>
                                    <button
                                        onClick={() => setCheckoutStep(null)}
                                        className="p-1 rounded-full hover:bg-black/5 transition"
                                        style={{ color: colors.textSecondary }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Itens do pedido e o valor de cada um */}
                                <div className="mb-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                                    <div className="max-h-36 overflow-y-auto divide-y" style={{ borderColor: colors.border }}>
                                        {cartItems.map((item) => (
                                            <div
                                                key={`${item.product.id}::${item.comment || ''}::${(item.addons || []).map(a => a.id).sort().join(',')}`}
                                                className="flex items-center justify-between gap-2 px-3 py-2"
                                                style={{ borderColor: colors.border }}
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                        {item.product.name}
                                                    </p>
                                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                        {item.quantity}x {formatPrice(cartItemUnitPrice(item))}
                                                    </p>
                                                    {item.addons && item.addons.length > 0 && (
                                                        <p className="text-[9px] truncate" style={{ color: colors.textSecondary, opacity: 0.8 }}>
                                                            + {item.addons.map(a => a.name).join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-xs font-black flex-shrink-0" style={{ color: '#f97316' }}>
                                                    {formatPrice(cartItemLineTotal(item))}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Pergunta de pagamento */}
                                <div className="mb-3">
                                    <p className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>
                                        Como você quer pagar?
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {([
                                            { value: 'pix' as const, icon: QrCode, label: 'Pix', enabled: storeConfig?.accepts_pix },
                                            { value: 'cartao' as const, icon: CreditCard, label: 'Cartão', enabled: storeConfig?.accepts_card },
                                            { value: 'dinheiro' as const, icon: Banknote, label: 'Dinheiro', enabled: storeConfig?.accepts_cash },
                                        ]).filter(opt => opt.enabled && (!digitalOnly || opt.value === 'pix')).map((opt) => {
                                            const selected = paymentMethod === opt.value
                                            return (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => {
                                                        setPaymentMethod(opt.value)
                                                        if (opt.value !== 'dinheiro') setCashChangeFor('')
                                                        if (opt.value !== 'cartao') setCardIsContactless(null)
                                                    }}
                                                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border-2 text-center transition hover:scale-[1.02] active:scale-95"
                                                    style={selected
                                                        ? { borderColor: '#f97316', background: `${colors.accent}10` }
                                                        : { borderColor: colors.border, background: 'transparent' }}
                                                >
                                                    <div
                                                        className="w-9 h-9 rounded-full flex items-center justify-center"
                                                        style={selected ? { background: GRADIENT, color: '#ffffff' } : { background: `${colors.surface}88`, color: colors.textSecondary }}
                                                    >
                                                        <opt.icon size={16} />
                                                    </div>
                                                    <span className="text-[11px] font-bold" style={{ color: selected ? '#f97316' : colors.textPrimary }}>
                                                        {opt.label}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {paymentMethod === 'dinheiro' && (
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={cashChangeFor}
                                            onChange={(e) => setCashChangeFor(e.target.value.replace(/[^0-9,.]/g, ''))}
                                            placeholder="Precisa de troco para quanto? (opcional)"
                                            className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                        />
                                    )}

                                    {paymentMethod === 'cartao' && (
                                        <div className="mt-2">
                                            <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Seu cartão tem aproximação?</span>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setCardIsContactless(true)}
                                                    className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                                                    style={cardIsContactless === true ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                >
                                                    Sim
                                                </button>
                                                <button
                                                    onClick={() => setCardIsContactless(false)}
                                                    className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                                                    style={cardIsContactless === false ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                >
                                                    Não
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Total e finalizar */}
                                <div className="border-t pt-2.5" style={{ borderColor: colors.border }}>
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
                                    <div className="flex justify-between text-sm font-bold">
                                        <span style={{ color: colors.textPrimary }}>Total</span>
                                        {getStoreTotals().isCalculating ? (
                                            <span className="italic" style={{ color: colors.textSecondary }}>Calculando...</span>
                                        ) : (
                                            <span style={{ color: '#f97316' }}>{formatPrice(getStoreTotals().finalTotal)}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => setCheckoutStep('delivery')}
                                        className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95"
                                        style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={handleFinalizeOrder}
                                        disabled={checkoutLoading || getStoreTotals().isCalculating || !paymentMethod}
                                        className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95 disabled:opacity-50"
                                        style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 14px #f9731660` }}
                                    >
                                        {checkoutLoading ? 'Finalizando...' :
                                            getStoreTotals().isCalculating ? 'Calculando...' :
                                                !paymentMethod ? 'Escolha o pagamento' :
                                                    'Confirmar Pedido'}
                                    </button>
                                </div>
                            </>
                        ) : null}
                    />
                    )}
                    {insideShell && (
                        <div className="flex items-center gap-2 px-2" style={{ height: 62, borderTop: bagItems.length > 0 ? `1px solid ${colors.border}` : 'none' }}>
                            <button
                                onClick={() => (typeof window !== 'undefined' && window.history.length > 1 ? router.back() : router.push(`/${ownerSlug}`))}
                                aria-label="Voltar"
                                className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition active:scale-95"
                                style={{ background: `${colors.border}55`, color: colors.textPrimary }}
                            >
                                <ArrowLeft size={19} />
                            </button>
                            <div className="flex-1 min-w-0 flex items-center gap-2 px-3.5 h-11 rounded-full" style={{ background: `${colors.border}40` }}>
                                <Search size={16} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                <input
                                    ref={searchInputRef}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar na loja"
                                    className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                                    style={{ color: colors.textPrimary }}
                                />
                                {searchQuery && <button onClick={() => setSearchQuery('')} aria-label="Limpar busca" style={{ color: colors.textSecondary }}><X size={15} /></button>}
                            </div>
                        </div>
                    )}
                </div>

                {/* ===== MODAL DE ADICIONAR (observação sempre; adicionais se a loja habilitar) ===== */}
                {showAddCommentModal && pendingProduct && (
                    <AddToCartModal
                        product={pendingProduct}
                        colors={colors}
                        storeImageUrl={storeInfo?.logo_url ?? null}
                        storeName={storeInfo?.name}
                        onClose={() => {
                            setShowAddCommentModal(false)
                            setPendingProduct(null)
                        }}
                        onConfirm={confirmAddWithComment}
                    />
                )}

                {/* ===== MODAL DE AUTENTICAÇÃO (login/cadastro antes de finalizar) ===== */}
                {checkoutStep === 'auth' && (
                    <div
                        className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => {
                            if (!checkoutLoading) {
                                setCheckoutStep(null)
                            }
                        }}
                    >
                        <div
                            className="w-full max-w-md rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto"
                            style={{ background: cardBackground }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-black" style={{ color: textColor }}>
                                            {authMode === 'login' ? 'Entrar' : 'Criar Conta'}
                                        </h3>
                                        <button
                                            onClick={() => setCheckoutStep(null)}
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
                            className="w-full max-w-lg rounded-2xl p-5 animate-fade-in max-h-[88vh] overflow-y-auto"
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

                            <div className="flex flex-col gap-3">
                                {/* O que é o produto vem primeiro: a foto é só uma miniatura ao lado do nome e do preço */}
                                <div className="flex items-start gap-3">
                                    <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-xl overflow-hidden" style={{ background: colors.accentLight }}>
                                        {selectedProduct.image_url || storeInfo?.logo_url ? (
                                            <img
                                                src={selectedProduct.image_url || storeInfo?.logo_url || ''}
                                                alt={selectedProduct.name}
                                                className={selectedProduct.image_url ? 'w-full h-full object-cover' : 'w-full h-full object-contain p-3'}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] font-medium" style={{ color: textColor }}>
                                                Sem imagem
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-lg font-black leading-tight" style={{ color: textColor }}>
                                            {selectedProduct.name}
                                        </h4>
                                        {selectedProduct.category && (
                                            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#f9731620', color: '#f97316' }}>
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
                                </div>

                                <div className="flex-1 flex flex-col">
                                    {selectedProduct.description && (
                                        <div className="p-3 rounded-lg" style={{ background: `${colors.surface}66`, border: `1px solid ${colors.border}` }}>
                                            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: textColor }}>
                                                {selectedProduct.description}
                                            </p>
                                        </div>
                                    )}

                                    {selectedProduct.stock !== null && selectedProduct.stock !== undefined && selectedProduct.stock <= 0 && (
                                        <p className="mt-2 text-xs font-bold" style={{ color: '#ef4444' }}>Esgotado</p>
                                    )}

                                    {selectedProduct.type === 'digital' && (
                                        <div className="mt-3">
                                            <DigitalCurriculum productId={selectedProduct.id} />
                                        </div>
                                    )}

                                    {/* Dados técnicos ficam recolhidos: o foco é o que o produto é, o preço, a foto e a descrição */}
                                    <details className="group mt-3 rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
                                        <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none text-xs font-bold select-none" style={{ color: textColor }}>
                                            Ver mais sobre este produto
                                            <ChevronDown size={16} className="transition-transform group-open:rotate-180" style={{ color: '#f97316' }} />
                                        </summary>
                                        <div className="px-3 pb-3">
                                            <div className="grid grid-cols-2 gap-2">
                                        {selectedProduct.type && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Package size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Tipo</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: textColor }}>
                                                    {selectedProduct.type === 'physical' ? 'Produto' :
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
                                        </div>
                                    </details>

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

                                    <div className="mt-3 sticky -bottom-5 -mx-5 -mb-5 px-5 py-3 flex flex-col sm:flex-row gap-2" style={{ background: cardBackground }}>
                                        {isStoreOpen ? (
                                            <>
                                                {cartItems.some((item: any) => item.product.id === selectedProduct.id) ? (
                                                    /* Já está no carrinho: seletor de quantidade (− 1 +). Com 1 unidade o "−" vira a lixeira e tira o produto */
                                                    <div className="flex items-center justify-between gap-3 w-full">
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>No carrinho</p>
                                                            <p className="text-sm font-black" style={{ color: textColor }}>
                                                                {getProductQuantity(selectedProduct.id)} {getProductQuantity(selectedProduct.id) === 1 ? 'unidade' : 'unidades'}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-1 rounded-full p-1" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                                            <button
                                                                onClick={() => {
                                                                    const qty = getProductQuantity(selectedProduct.id)
                                                                    if (qty <= 1) removeAllOfProduct(selectedProduct.id)
                                                                    else decreaseQuantity(selectedProduct.id)
                                                                }}
                                                                aria-label={getProductQuantity(selectedProduct.id) <= 1 ? 'Tirar do carrinho' : 'Diminuir quantidade'}
                                                                className="w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90"
                                                                style={getProductQuantity(selectedProduct.id) <= 1 ? { background: '#ef444418', color: '#ef4444' } : { background: colors.surface, color: textColor, border: `1px solid ${colors.border}` }}
                                                            >
                                                                {getProductQuantity(selectedProduct.id) <= 1 ? <Trash2 size={17} /> : <Minus size={18} />}
                                                            </button>
                                                            <span className="min-w-[40px] text-center text-lg font-black" style={{ color: textColor }} aria-live="polite">
                                                                {getProductQuantity(selectedProduct.id)}
                                                            </span>
                                                            <button
                                                                onClick={() => handleAddWithComment(selectedProduct)}
                                                                aria-label="Aumentar quantidade"
                                                                className="w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90"
                                                                style={{ background: GRADIENT, color: '#ffffff', boxShadow: '0 4px 14px #f9731660' }}
                                                            >
                                                                <Plus size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAddWithComment(selectedProduct)}
                                                        className="w-full h-12 rounded-full font-black text-sm flex items-center justify-center gap-2 transition hover:scale-[1.02] active:scale-95"
                                                        style={{
                                                            background: GRADIENT,
                                                            color: '#ffffff',
                                                            boxShadow: `0 4px 14px #f9731660`,
                                                        }}
                                                    >
                                                        <Plus size={18} />
                                                        Adicionar ao carrinho · {formatPrice(selectedProduct.price || 0)}
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