// src/app/(main)/page.tsx
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, Store, Home, MapPin, LayoutDashboard, ShoppingBag, ShoppingCart, X, Radar } from 'lucide-react'

import CategoriasSection from './inicio/sections/CanIhelp'
import LookForAService from './inicio/sections/LookForAService'
import MotoristaSection from './inicio/sections/MotoristaSection'
import HireAService from './inicio/sections/HireAService'
import SortableSection from './inicio/sections/SortableSection'
import ConfiguracoesContent from './Configuration'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '../contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import OrderSection from '@/components/OrderSection'
import SearchResultsSection from '@/app/SearchResultsSection'
import LastSearched from '@/components/LastSearched'
import { supabase } from '@/lib/supabase/client'
import Header from '../Header'
import CreateStoreAndRegisterProfile from './CreateStoreAndRegisterProfile'
import LoginAndRegister from './LoginAndRegister'
import ProfileDashboard from './ProfileDashboard'
import { useCartStore } from '@/store/useCartStore'
import HomeBag, { type HomeBagItem } from './HomeBag'
import { isStoreOpenNow } from '@/lib/storeHours'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import ButtonSettingsHome from './ButtonSettingsHome'
import ProductShowcase from './inicio/sections/ProductShowcase'
import FeaturedPublications from './inicio/sections/FeaturePublications'
import FeaturedProfiles from './inicio/sections/FeaturedProfiles'
import LocationPicker from './LocationPicker'
import StoreList from './inicio/sections/StoreList'
import StoreDashboard from './StoreDashboard'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== GRADIENTE PARA O BOTÃO RADAR (LARANJA PARA VERMELHO) =====
const RADAR_GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== TODAS AS SEÇÕES DISPONÍVEIS (INCLUINDO AS "EM BREVE") =====
const DEFAULT_SECTIONS = [
    'categorias',
    'storeList',
    'productShowcase',
    'publicationShowcase',
    'profileShowcase',
    'transporte',
    'motorista',
    'servico',
    'settingsSection',
    'orderSection',
]

const ORDER_STORAGE_KEY = 'homepage_sections_order'

// ---------- Função para formatar endereço ----------
function formatAddress(address: string, addressNumber?: string): string {
    if (!address) return 'Definir local'

    const displayAddress = addressNumber ? `${address.split(',')[0]}, ${addressNumber}` : address
    const firstPart = displayAddress.split(',')[0].trim()
    const match = firstPart.match(/^(.+?)(\s+\d+)/)

    if (match) {
        let result = match[0].trim()
        result = result
            .replace(/^Avenida\s/, 'Av. ')
            .replace(/^Rua\s/, 'R. ')
            .replace(/^Travessa\s/, 'Tv. ')
            .replace(/^Praça\s/, 'Pç. ')
            .replace(/^Alameda\s/, 'Al. ')
            .replace(/^Rodovia\s/, 'Rod. ')
            .replace(/^Estrada\s/, 'Estr. ')

        if (result.length > 28) {
            return result.substring(0, 25) + '...'
        }
        return result
    }

    if (firstPart.length > 28) {
        return firstPart.substring(0, 25) + '...'
    }
    return firstPart
}

// ---------- Funções de horário ----------
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function getTodayKey(): string {
    return DAY_KEYS[new Date().getDay()]
}

function getTodaySchedule(businessHours: Record<string, { open: string; close: string }> | null | undefined) {
    if (!businessHours) return null
    const todayKey = getTodayKey()
    return businessHours[todayKey] || null
}

function isOpenNow(schedule: { open: string; close: string } | null | undefined): boolean {
    if (!schedule || !schedule.open || !schedule.close) return false
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const [openH, openM] = schedule.open.split(':').map(Number)
    let [closeH, closeM] = schedule.close.split(':').map(Number)
    if (closeH === 0 && closeM === 0) closeH = 24
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes
}

export interface StoreInfo {
    id: string
    slug: string
    logoUrl: string | null
    name: string
    business_hours?: Record<string, { open: string; close: string }> | null
}

export default function HomePage() {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const {
        profileSlug,
        avatarUrl,
        bgMode,
        customBgUrl,
        loading,
        setBgMode,
        setCustomBgUrl,
    } = useProfile()

    const { colors } = useTheme()
    const { itemsByStore, storeDetails, addItem, updateQuantity, removeItem } = useCartStore()

    const [sections, setSections] = useState<string[]>(DEFAULT_SECTIONS)
    const [showConfig, setShowConfig] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [hasInteractedWithSearch, setHasInteractedWithSearch] = useState(false)
    const [cartAnimating, setCartAnimating] = useState(false)
    const [isBagExpanded, setIsBagExpanded] = useState(false)
    const [stores, setStores] = useState<StoreInfo[]>([])
    const [showCreateStore, setShowCreateStore] = useState(false)
    const [showLogin, setShowLogin] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const [showStoreDashboard, setShowStoreDashboard] = useState<{ slug: string; name: string } | null>(null)

    const [savedLocation, setSavedLocation] = useState<{ lat: number; lng: number; address: string; addressNumber?: string; addressComplement?: string } | null>(null)
    const [showLocationDialog, setShowLocationDialog] = useState(false)
    const [isSavingLocation, setIsSavingLocation] = useState(false)

    const [loadingStores, setLoadingStores] = useState(true)

    const [breveMap, setBreveMap] = useState<Record<string, boolean>>({})

    const [storeOrderCounts, setStoreOrderCounts] = useState<
        Record<string, { pending: number; preparing: number; ready: number }>
    >({})

    const breveCallbacks = useMemo(() => ({
        transporte: (isBreve: boolean) => {
            setBreveMap(prev => ({ ...prev, transporte: isBreve }))
        },
        motorista: (isBreve: boolean) => {
            setBreveMap(prev => ({ ...prev, motorista: isBreve }))
        },
    }), [])

    // REFS
    const lastSearchedRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // ===== CALCULAR TOTAL DE ITENS DO CARRINHO =====
    const totalCartItems = useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

    // ===== CALCULAR VALOR TOTAL DO CARRINHO =====
    // ===== SACOLA DA HOME: fusão dos itens de todas as lojas =====
    const homeBagItems: HomeBagItem[] = useMemo(() => {
        return Object.entries(itemsByStore).flatMap(([storeSlug, items]) =>
            items.map((item) => ({
                product: item.product,
                quantity: item.quantity,
                storeSlug,
                storeName: storeDetails[storeSlug]?.name || storeSlug,
                storeLogoUrl: storeDetails[storeSlug]?.logo_url || null,
                comment: item.comment,
            }))
        )
    }, [itemsByStore, storeDetails])

    // ===== STATUS ABERTO/FECHADO DAS LOJAS QUE ESTÃO NA SACOLA =====
    const [cartStoreOpenStatus, setCartStoreOpenStatus] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const slugs = Object.keys(itemsByStore)
        if (slugs.length === 0) {
            setCartStoreOpenStatus({})
            return
        }

        let cancelled = false
        supabase
            .from('stores')
            .select('storeSlug, business_hours')
            .in('storeSlug', slugs)
            .then(({ data }) => {
                if (cancelled || !data) return
                const status: Record<string, boolean> = {}
                for (const row of data as any[]) {
                    status[row.storeSlug] = isStoreOpenNow(row.business_hours)
                }
                setCartStoreOpenStatus(status)
            })

        return () => { cancelled = true }
    }, [itemsByStore])

    const handleBagIncrease = (item: HomeBagItem) => {
        const store = storeDetails[item.storeSlug] || { name: item.storeName, logo_url: null }
        addItem(item.storeSlug, store, item.product, item.comment)
    }

    const handleBagDecrease = (item: HomeBagItem) => {
        updateQuantity(item.storeSlug, item.product.id, -1, item.comment)
    }

    const handleBagRemove = (item: HomeBagItem) => {
        removeItem(item.storeSlug, item.product.id, item.comment)
    }

    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)
    const [loadingStatus, setLoadingStatus] = useState(true)

    // ---------- CARREGAR ORDEM DAS SEÇÕES ----------
    useEffect(() => {
        const saved = localStorage.getItem(ORDER_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    const unique = Array.from(new Set(parsed))
                    const hasCategorias = unique.includes('categorias')
                    let filtered = unique.filter(s => s !== 'categorias')
                    const missing = DEFAULT_SECTIONS.filter(s => !filtered.includes(s))
                    const final = hasCategorias ? ['categorias', ...filtered, ...missing] : [...filtered, ...missing]
                    setSections(final)
                }
            } catch {
                // Ignora erros de parse
            }
        }
    }, [])

    // ---------- FUNÇÕES DE MOVIMENTO (subir/descer) ----------
    const moveSection = (id: string, direction: 'up' | 'down') => {
        setSections((prev) => {
            const unique = Array.from(new Set(prev))
            const index = unique.indexOf(id)
            if (index === -1) return unique
            if (id === 'categorias') return unique

            const newIndex = direction === 'up' ? index - 1 : index + 1
            if (newIndex < 0 || newIndex >= unique.length) return unique
            if (direction === 'up' && unique[newIndex] === 'categorias') return unique
            if (direction === 'down' && unique[newIndex] === 'categorias') return unique

            const newArray = [...unique]
            const [removed] = newArray.splice(index, 1)
            newArray.splice(newIndex, 0, removed)
            return newArray
        })
    }

    // ---------- CARREGAR LOCALIZAÇÃO DO PERFIL ----------
    useEffect(() => {
        const fetchLocationFromProfile = async () => {
            try {
                const { data: { user }, error: authError } = await supabase.auth.getUser()
                if (authError || !user) {
                    setSavedLocation(null)
                    return
                }

                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('address, address_number, address_complement, store_lat, store_lng')
                    .eq('id', user.id)
                    .maybeSingle()

                if (error) {
                    if (error.code !== 'PGRST116') {
                        console.warn('[HomePage] Erro ao buscar perfil:', error.message)
                    }
                    setSavedLocation(null)
                    return
                }

                if (profile?.store_lat && profile?.store_lng) {
                    const locationData = {
                        lat: profile.store_lat,
                        lng: profile.store_lng,
                        address: profile.address || 'Local salvo',
                        addressNumber: profile.address_number || '',
                        addressComplement: profile.address_complement || ''
                    }
                    setSavedLocation(locationData)
                } else {
                    setSavedLocation(null)
                }
            } catch (err) {
                console.warn('[HomePage] Erro ao buscar perfil:', err)
                setSavedLocation(null)
            }
        }

        fetchLocationFromProfile()
    }, [profileSlug])

    // ---------- ANIMAÇÃO DO CARRINHO ----------
    useEffect(() => {
        if (totalCartItems > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartItems])

    // ---------- PEDIDOS (comprador) ----------
    useEffect(() => {
        const fetchOrderStatuses = async () => {
            setLoadingStatus(true)
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) {
                    setLoadingStatus(false)
                    return
                }

                const { data: orders } = await supabase
                    .from('orders')
                    .select('status')
                    .eq('buyer_id', user.id)

                if (orders) {
                    setPendingCount(orders.filter(o => o.status === 'pending').length)
                    setPreparingCount(orders.filter(o => o.status === 'preparing').length)
                    setReadyCount(orders.filter(o => o.status === 'ready').length)
                }

                const { data: paidOrders } = await supabase
                    .from('orders')
                    .select('id')
                    .eq('buyer_id', user.id)
                    .eq('status', 'paid')

                if (paidOrders && paidOrders.length > 0) {
                    const orderIds = paidOrders.map(o => o.id)
                    const { data: orderItems } = await supabase
                        .from('order_items')
                        .select('product_id')
                        .in('order_id', orderIds)

                    if (orderItems && orderItems.length > 0) {
                        const productIds = orderItems.map(item => item.product_id)
                        const { data: reviews } = await supabase
                            .from('product_reviews')
                            .select('product_id')
                            .eq('profile_id', user.id)
                            .in('product_id', productIds)

                        const reviewedIds = new Set(reviews?.map(r => r.product_id) || [])
                        const pending = productIds.filter(pid => !reviewedIds.has(pid)).length
                        setPendingReviewsCount(pending)
                    } else {
                        setPendingReviewsCount(0)
                    }
                } else {
                    setPendingReviewsCount(0)
                }
            } catch (err) {
                console.error('[HomePage] Erro ao buscar status dos pedidos:', err)
            } finally {
                setLoadingStatus(false)
            }
        }

        fetchOrderStatuses()
    }, [profileSlug])

    // ---------- LOJAS DO USUÁRIO ----------
    useEffect(() => {
        async function loadStores() {
            setLoadingStores(true)
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user || !profileSlug) {
                setStores([])
                setLoadingStores(false)
                return
            }

            const { data: fetchedStores } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url, business_hours')
                .eq('owner_id', session.user.id)
                .order('created_at', { ascending: true })

            if (fetchedStores) {
                const storesData = fetchedStores.map((s: any) => {
                    let logoUrl: string | null = null
                    if (s.logo_url) {
                        const { data: publicUrlData } = supabase.storage
                            .from('store-logos')
                            .getPublicUrl(s.logo_url)
                        logoUrl = publicUrlData.publicUrl
                    }
                    return {
                        id: s.id,
                        slug: s.storeSlug,
                        logoUrl,
                        name: s.name,
                        business_hours: s.business_hours || null,
                    }
                })
                setStores(storesData)
            } else {
                setStores([])
            }
            setLoadingStores(false)
        }
        loadStores()
    }, [profileSlug])

    // ---------- CONTAGENS DE PEDIDOS DAS LOJAS (dono) ----------
    const fetchStoreOrderCounts = async () => {
        if (!stores || stores.length === 0) return
        const storeIds = stores.map(s => s.id)
        const { data, error } = await supabase
            .from('orders')
            .select('store_id, status')
            .in('store_id', storeIds)
            .in('status', ['pending', 'preparing', 'ready'])

        if (error) {
            console.error('Erro ao buscar contagens de pedidos:', error)
            return
        }

        const counts: Record<string, { pending: number; preparing: number; ready: number }> = {}
        storeIds.forEach(id => {
            counts[id] = { pending: 0, preparing: 0, ready: 0 }
        })
        data?.forEach(order => {
            if (counts[order.store_id]) {
                counts[order.store_id][order.status as 'pending' | 'preparing' | 'ready']++
            }
        })
        setStoreOrderCounts(counts)
    }

    useEffect(() => {
        if (stores.length > 0) {
            fetchStoreOrderCounts()
        }
    }, [stores])

    useEffect(() => {
        if (!stores || stores.length === 0) return
        const storeIds = stores.map(s => s.id)
        const channel = supabase
            .channel('homepage-store-orders')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    filter: `store_id=in.(${storeIds.join(',')})`,
                },
                () => fetchStoreOrderCounts()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [stores])

    // ===== FUNÇÃO PARA ATUALIZAR OS BADGES EM TEMPO REAL =====
    const handleOrderCountsChange = (counts: { pending: number; preparing: number; ready: number }) => {
        setStoreOrderCounts(prev => {
            if (showStoreDashboard) {
                const store = stores.find(s => s.slug === showStoreDashboard.slug)
                if (store) {
                    return {
                        ...prev,
                        [store.id]: counts
                    }
                }
            }
            return prev
        })
    }

    // ---------- SEÇÕES EXIBIDAS (categorias sempre em primeiro) ----------
    const displayedSections = useMemo(() => {
        const uniqueSections = Array.from(new Set(sections))
        if (!uniqueSections.includes('categorias')) {
            return uniqueSections
        }
        const withoutCategorias = uniqueSections.filter(s => s !== 'categorias')
        return ['categorias', ...withoutCategorias]
    }, [sections])

    // ---------- SALVAR ORDEM ----------
    const handleSaveOrder = () => {
        const uniqueSections = Array.from(new Set(sections))
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(uniqueSections))
        setSections(uniqueSections)
        setEditMode(false)
    }

    // ---------- RESTAURAR ORDEM PADRÃO ----------
    const handleRestoreOrder = () => {
        const uniqueDefault = Array.from(new Set(DEFAULT_SECTIONS))
        setSections(uniqueDefault)
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(uniqueDefault))
        setEditMode(false)
    }

    const toggleEditMode = () => {
        setEditMode((prev) => !prev)
    }

    // ---------- SALVAR LOCALIZAÇÃO (APENAS NO BANCO) ----------
    const handleLocationSave = async (location: {
        lat: number;
        lng: number;
        address: string;
        addressNumber?: string;
        addressComplement?: string;
    }) => {
        setIsSavingLocation(true)
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser()
            if (!user) {
                alert('Você precisa estar logado para salvar uma localização!')
                setShowLocationDialog(false)
                setIsSavingLocation(false)
                return
            }

            const { data, error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    address: location.address,
                    address_number: location.addressNumber || null,
                    address_complement: location.addressComplement || null,
                    store_lat: location.lat,
                    store_lng: location.lng,
                }, {
                    onConflict: 'id',
                    ignoreDuplicates: false
                })
                .select('address, address_number, address_complement, store_lat, store_lng')
                .single()

            if (error) {
                alert('Erro ao salvar: ' + error.message)
            } else {
                if (data) {
                    setSavedLocation({
                        lat: data.store_lat,
                        lng: data.store_lng,
                        address: data.address || 'Local salvo',
                        addressNumber: data.address_number || '',
                        addressComplement: data.address_complement || ''
                    })
                }
                alert('Localização salva com sucesso!')
            }
        } catch (err) {
            alert('Erro: ' + (err as Error).message)
        } finally {
            setIsSavingLocation(false)
            setShowLocationDialog(false)
        }
    }

    // ---------- RENDERIZAR SEÇÃO ----------
    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case 'storeList':
                return (
                    <StoreList
                        title="Lojas Mais Visitadas"
                        maxItems={5}
                        onStoreClick={(storeSlug) => {
                            startNavProgress()
                            router.push(`/${storeSlug}`)
                        }}
                    />
                )
            case 'orderSection':
                return (
                    <OrderSection
                        isEditing={editMode}
                        onToggleEdit={toggleEditMode}
                        onSave={handleSaveOrder}
                        onRestore={handleRestoreOrder}
                        disabled={loading}
                        defaultOrder={DEFAULT_SECTIONS}
                    />
                )
            case 'categorias':
                return <CategoriasSection />
            case 'productShowcase':
                return <ProductShowcase />
            case 'publicationShowcase':
                return <FeaturedPublications />
            case 'profileShowcase':
                return <FeaturedProfiles />
            case 'transporte':
                return <LookForAService onBreveStatusChange={breveCallbacks.transporte} />
            case 'motorista':
                return <MotoristaSection onBreveStatusChange={breveCallbacks.motorista} />
            case 'servico':
                return <HireAService />
            case 'settingsSection':
                return <ButtonSettingsHome onClick={() => setShowConfig(true)} />
            default:
                return null
        }
    }

    const showHomeSections = () => {
        setShowConfig(false)
        setShowCreateStore(false)
        setShowLogin(false)
        setShowProfile(false)
        setShowStoreDashboard(null)
    }

    const handleLoginClick = () => {
        setShowLogin(true)
        setShowConfig(false)
        setShowCreateStore(false)
        setShowProfile(false)
        setShowStoreDashboard(null)
    }

    const handleProfileClick = () => {
        if (profileSlug && !loading) {
            setShowProfile(true)
            setShowConfig(false)
            setShowCreateStore(false)
            setShowLogin(false)
            setShowStoreDashboard(null)
        } else {
            handleLoginClick()
        }
    }

    const handleStoreDashboardClick = (storeSlug: string, storeName: string) => {
        setShowStoreDashboard({ slug: storeSlug, name: storeName })
        setShowConfig(false)
        setShowCreateStore(false)
        setShowLogin(false)
        setShowProfile(false)
    }

    const tabs = useMemo(() => {
        const isLoggedIn = !!profileSlug && !loading
        const allTabs: any[] = [
            {
                id: 'perfil',
                label: isLoggedIn ? `@${profileSlug}` : 'Entrar',
                icon: User,
                imageUrl: isLoggedIn ? avatarUrl : null,
                onClick: handleProfileClick,
                isActive: (isLoggedIn && showProfile) || (!isLoggedIn && showLogin),
            },
        ]

        if (loadingStores) {
            return allTabs
        }

        if (stores.length > 0) {
            stores.forEach((s) => {
                const counts = storeOrderCounts[s.id] || { pending: 0, preparing: 0, ready: 0 }
                const hasActive = counts.pending + counts.preparing + counts.ready > 0

                const todaySchedule = getTodaySchedule(s.business_hours)
                const openNow = isOpenNow(todaySchedule)
                const statusColor = openNow ? '#22c55e' : '#ef4444'

                allTabs.push({
                    id: `loja-${s.slug}`,
                    label: s.name,
                    icon: LayoutDashboard,
                    imageUrl: s.logoUrl,
                    onClick: () => handleStoreDashboardClick(s.slug, s.name),
                    isActive: showStoreDashboard?.slug === s.slug,
                    indicator: hasActive ? counts : null,
                    statusColor,
                })
            })
        } else {
            allTabs.push({
                id: 'criar-loja',
                label: 'Cadastrar loja?',
                icon: Store,
                imageUrl: null,
                onClick: isLoggedIn
                    ? () => { startNavProgress(); router.push('/criar-loja') }
                    : () => setShowCreateStore(true),
                isActive: !isLoggedIn && showCreateStore,
            })
        }

        return allTabs
    }, [profileSlug, loading, avatarUrl, showConfig, showCreateStore, showLogin, showProfile, showStoreDashboard, stores, loadingStores, storeOrderCounts, router])

    const showFab = showConfig || showCreateStore || showLogin || showProfile || showStoreDashboard
    const shouldShowSacola = !showProfile && !showStoreDashboard && !showLogin

    // ===== VERIFICAR SE ESTÁ EM TELA DE LOGIN =====
    const isLoginScreen = showLogin || showCreateStore

    // ===== VERIFICAR SE ESTÁ EM DASHBOARD =====
    const isDashboardScreen = showProfile || showStoreDashboard

    // ===== VERIFICAR SE ESTÁ PESQUISANDO =====
    const isSearching = searchQuery.trim().length > 0

    // ===== FUNÇÃO PARA LIMPAR A BUSCA =====
    const clearSearch = () => {
        setSearchQuery('')
        setSearchFocused(false)
        if (searchInputRef.current) {
            searchInputRef.current.blur()
        }
    }

    // ===== FUNÇÃO PARA FOCAR A BUSCA =====
    const handleSearchFocus = () => {
        setHasInteractedWithSearch(true)
        if (!isSearching && !isLoginScreen && !isDashboardScreen) {
            setSearchFocused(true)
        }
    }

    // ===== VERIFICAR SE DEVE MOSTRAR A BUSCA =====
    const shouldShowSearch = !isLoginScreen && !isDashboardScreen

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh pb-28" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="iUser"
                    showBack={false}
                    greeting={`Olá, ${loading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={loading}
                    tabs={tabs}
                    showSearch={shouldShowSearch}
                    searchPlaceholder="Procurar, espetinho, cabeleireiro..."
                    searchValue={searchQuery}
                    searchRef={searchInputRef}
                    onSearch={(query) => {
                        setSearchQuery(query)
                    }}
                    onSearchFocus={handleSearchFocus}
                    onSearchBlur={() => {
                        setTimeout(() => {
                            const activeElement = document.activeElement
                            const isLastSearched = activeElement?.closest?.('.last-searched-container')
                            const isSearchResult = activeElement?.closest?.('.search-result-item')
                            if (!isLastSearched && !isSearchResult) {
                                setSearchFocused(false)
                            }
                        }, 200)
                    }}
                    profileSlug={profileSlug}
                    locationElement={
                        !isLoginScreen && (
                            <button
                                onClick={() => setShowLocationDialog(true)}
                                disabled={isSavingLocation}
                                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-black/10 hover:bg-black/20 transition disabled:opacity-50"
                                style={{ color: colors.textPrimary }}
                            >
                                <MapPin size={14} />
                                {isSavingLocation
                                    ? 'Salvando...'
                                    : savedLocation
                                        ? formatAddress(savedLocation.address, savedLocation.addressNumber)
                                        : 'Definir local'
                                }
                            </button>
                        )
                    }
                />

                {showConfig ? (
                    <ConfiguracoesContent
                        onBack={() => setShowConfig(false)}
                        setBgMode={setBgMode}
                        customBgUrl={customBgUrl}
                        setCustomBgUrl={setCustomBgUrl}
                    />
                ) : showCreateStore ? (
                    <CreateStoreAndRegisterProfile
                        embedded
                        onBack={() => setShowCreateStore(false)}
                    />
                ) : showLogin ? (
                    <LoginAndRegister onLoginSuccess={() => setShowLogin(false)} />
                ) : showProfile ? (
                    <ProfileDashboard
                        profileSlug={profileSlug}
                        onBack={() => setShowProfile(false)}
                        avatarUrl={avatarUrl}
                    />
                ) : showStoreDashboard ? (
                    <StoreDashboard
                        profileSlug={profileSlug || ''}
                        storeSlug={showStoreDashboard.slug}
                        onBack={() => setShowStoreDashboard(null)}
                        onOrderCountsChange={handleOrderCountsChange}
                    />
                ) : (
                    <div className="mt-2 px-4 md:px-6">
                        {isSearching ? (
                            <div className="mb-6">
                                <SearchResultsSection
                                    searchQuery={searchQuery}
                                    onSearchSelect={(query) => {
                                        setSearchQuery(query)
                                        setSearchFocused(false)
                                        searchInputRef.current?.focus()
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                                {searchFocused && !isSearching && hasInteractedWithSearch && (
                                    <div
                                        className="mb-6 last-searched-container"
                                        ref={lastSearchedRef}
                                    >
                                        <LastSearched
                                            onItemClick={(item) => {
                                                if (item.url) {
                                                    setSearchFocused(false)
                                                    setSearchQuery('')
                                                    startNavProgress()
                                                    setTimeout(() => {
                                                        router.push(item.url)
                                                    }, 50)
                                                }
                                            }}
                                            onClearResults={clearSearch}
                                        />
                                    </div>
                                )}

                                {!searchFocused && !isSearching && (
                                    <>
                                        {editMode ? (
                                            <div className="space-y-6">
                                                {Array.from(new Set(sections)).map((sectionId, index) => {
                                                    const section = renderSection(sectionId)
                                                    if (!section) return null
                                                    const uniqueSections = Array.from(new Set(sections))
                                                    const isFirst = index === 0
                                                    const isLast = index === uniqueSections.length - 1
                                                    const isCategorias = sectionId === 'categorias'

                                                    return (
                                                        <SortableSection
                                                            key={sectionId}
                                                            id={sectionId}
                                                            isEditing={editMode}
                                                            onMoveUp={!isCategorias ? (id: string) => moveSection(id, 'up') : undefined}
                                                            onMoveDown={!isCategorias ? (id: string) => moveSection(id, 'down') : undefined}
                                                            isFirst={isFirst}
                                                            isLast={isLast}
                                                        >
                                                            {section}
                                                        </SortableSection>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {displayedSections.map((sectionId) => {
                                                    const section = renderSection(sectionId)
                                                    if (!section) return null
                                                    return <div key={sectionId}>{section}</div>
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ===== BOTÃO FLUTUANTE - RADAR (independente, não disputa espaço com a sacola) ===== */}
                {shouldShowSacola && (
                    <div style={{ position: 'fixed', bottom: 32, left: 24, zIndex: 998 }}>
                        <button
                            onClick={() => { startNavProgress(); router.push('/radar') }}
                            className="flex items-center gap-2 px-5 h-14 rounded-full shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95 flex-shrink-0"
                            style={{
                                background: RADAR_GRADIENT,
                                color: '#ffffff',
                                borderTop: '2px solid #f97316',
                                borderRight: '2px solid #f97316',
                                borderBottom: '2px solid #dc2626',
                                borderLeft: '2px solid #dc2626',
                                boxShadow: `0 8px 24px #dc262640`,
                            }}
                            aria-label="Radar"
                        >
                            <Radar size={22} />
                            <span className="font-semibold text-sm">Radar</span>
                        </button>
                    </div>
                )}

                {/* ===== BOTÕES FLUTUANTES - SACOLA E VOLTAR (container próprio, ancorado só na direita, sem cortar na tela) ===== */}
                <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                    <div className="flex flex-col-reverse sm:flex-row items-end gap-3">
                        {shouldShowSacola && (
                            <div>
                                {loadingStatus ? (
                                    <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl bg-gray-300 animate-pulse">
                                        <ShoppingCart size={24} style={{ color: '#ffffff' }} />
                                    </div>
                                ) : (
                                    <HomeBag
                                        items={homeBagItems}
                                        isExpanded={isBagExpanded}
                                        onToggleExpanded={() => setIsBagExpanded(!isBagExpanded)}
                                        onIncrease={handleBagIncrease}
                                        onDecrease={handleBagDecrease}
                                        onRemove={handleBagRemove}
                                        onCheckout={(storeSlug) => {
                                            setIsBagExpanded(false)
                                            startNavProgress()
                                            router.push(`/${storeSlug}/catalogo`)
                                        }}
                                        statusCounts={{
                                            pending: pendingCount,
                                            preparing: preparingCount,
                                            ready: readyCount,
                                            reviews: pendingReviewsCount,
                                        }}
                                        animate={cartAnimating}
                                        colors={colors}
                                        storeOpenStatus={cartStoreOpenStatus}
                                    />
                                )}
                            </div>
                        )}

                        {showFab && (
                            <button
                                onClick={showHomeSections}
                                className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95 flex-shrink-0"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    borderTop: '2px solid #f97316',
                                    borderRight: '2px solid #f97316',
                                    borderBottom: '2px solid #f97316',
                                    borderLeft: '2px solid #f97316',
                                    boxShadow: `0 8px 24px #f9731660`,
                                }}
                                aria-label="Voltar ao início"
                            >
                                <Home size={24} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ===== LOCATION PICKER - APENAS QUANDO NÃO ESTÁ EM TELA DE LOGIN/REGISTRO ===== */}
                {!isLoginScreen && showLocationDialog && (
                    <LocationPicker
                        initialLocation={savedLocation ? {
                            lat: savedLocation.lat,
                            lng: savedLocation.lng,
                            address: savedLocation.address,
                            addressNumber: savedLocation.addressNumber || '',
                            addressComplement: savedLocation.addressComplement || ''
                        } : null}
                        onSave={handleLocationSave}
                        onClose={() => setShowLocationDialog(false)}
                    />
                )}
            </main>

            <style jsx global>{`
                @keyframes badge-pop {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.5); }
                    100% { transform: scale(1); opacity: 1; }
                }
                .animate-badge-pop { animation: badge-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            `}</style>
        </div>
    )
}