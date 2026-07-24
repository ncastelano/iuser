// src/app/(main)/page.tsx
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, Store, Home, MapPin } from 'lucide-react'
import {
    DndContext,
    closestCenter,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable'

import CategoriasSection from './inicio/sections/CanIhelp'
import TransporteSection from './inicio/sections/TransporteSection'
import MotoristaSection from './inicio/sections/MotoristaSection'
import PromocoesSection from './inicio/sections/PromocoesSection'
import SortableSection from './inicio/sections/SortableSection'
import AtalhoCompromissosDaLoja from './compromissos/AtalhoCompromissosDaLoja'
import AtalhoCompromissosPessoal from './compromissos/AtalhoCompromissosPessoal'
import ConfiguracoesContent from './ButtonSettingsHeader'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '../contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import OrderSection from '@/components/OrderSection'
import SearchResultsSection from '@/app/SearchResultsSection'
import LastSearched from '@/components/LastSearched'
import { supabase } from '@/lib/supabase/client'
import Header from '../Header'
import CreateStoreAndRegisterProfile from './CreateStoreAndRegisterProfile'
import LoginScreen from './LoginScreen'
import ProfileDashboard from './ProfileDashboard'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '../ButtonSacola'
import ButtonSettingsHome from './ButtonSettingsHome'
import ButtonCreateStoreHome from './ButtonCreateStoreHome'
import ProductShowcase from './inicio/sections/ProductShowcase'
import PublicationShowcase from './inicio/sections/PublicationShowcase'
import LocationPicker from './LocationPicker'
import PainelDaLoja from './StoreDashboard'  // ✅ IMPORT CORRETO
import StoreList from './inicio/sections/StoresBanner'

const DEFAULT_SECTIONS = ['storeList',

    'compromissosPessoal',
    'compromissosLoja',

    'productShowcase',
    'publicationShowcase',
    'categorias',
    'promocoes',
    'motorista',
    'transporte',
    'createStore',
    'settingsSection',
    'orderSection',
]

const ORDER_STORAGE_KEY = 'homepage_sections_order'
const LOCATION_STORAGE_KEY = 'user_saved_location'

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
    const { itemsByStore } = useCartStore()

    const [sections, setSections] = useState<string[]>(DEFAULT_SECTIONS)
    const [showConfig, setShowConfig] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [cartAnimating, setCartAnimating] = useState(false)
    const [stores, setStores] = useState<StoreInfo[]>([])
    const [activeStoreSlug, setActiveStoreSlug] = useState<string | null>(null)
    const [showCreateStore, setShowCreateStore] = useState(false)
    const [showLogin, setShowLogin] = useState(false)
    const [showProfile, setShowProfile] = useState(false)

    const [savedLocation, setSavedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null)
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

    const lastSearchedRef = useRef<HTMLDivElement>(null)

    const totalCartItems = useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)

    // ---------- CARREGAR ORDEM DAS SEÇÕES ----------
    useEffect(() => {
        const saved = localStorage.getItem(ORDER_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    const missing = DEFAULT_SECTIONS.filter(s => !parsed.includes(s))
                    setSections([...parsed, ...missing])
                }
            } catch {
                // Ignora erros de parse
            }
        }
    }, [])

    // ---------- CARREGAR LOCALIZAÇÃO SALVA ----------
    useEffect(() => {
        try {
            const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed && parsed.lat && parsed.lng) {
                    setSavedLocation(parsed)
                    console.log('[HomePage] ✅ Localização carregada do localStorage:', parsed.address)
                }
            }
        } catch (e) {
            console.warn('[HomePage] localStorage inválido, ignorando')
        }

        const fetchLocationFromProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('address, store_lat, store_lng')
                    .eq('id', user.id)
                    .maybeSingle()

                if (error) {
                    if (error.code !== 'PGRST116') {
                        console.warn('[HomePage] Erro ao buscar perfil:', error.message)
                    }
                    return
                }

                if (profile?.store_lat && profile?.store_lng) {
                    const locationData = {
                        lat: profile.store_lat,
                        lng: profile.store_lng,
                        address: profile.address || 'Local salvo'
                    }
                    setSavedLocation(locationData)
                    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(locationData))
                    console.log('[HomePage] ✅ Localização atualizada do perfil:', locationData.address)
                }
            } catch (err) {
                console.warn('[HomePage] Não foi possível buscar perfil:', err)
            }
        }

        if (profileSlug) {
            fetchLocationFromProfile()
        }
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
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

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
        }

        fetchOrderStatuses()
    }, [])

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

    // ---------- SEÇÕES EXIBIDAS ----------
    const displayedSections = useMemo(() => {
        const agendaKeys = ['compromissosPessoal', 'compromissosLoja']

        const baseSections = !profileSlug
            ? sections.filter(s => !agendaKeys.includes(s))
            : sections

        const normal: string[] = []
        const breve: string[] = []

        baseSections.forEach(s => {
            if (breveMap[s]) {
                breve.push(s)
                return
            }
            normal.push(s)
        })

        return [...normal, ...breve]
    }, [sections, profileSlug, breveMap])

    // ---------- DRAG AND DROP ----------
    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        setSections((items) => {
            const oldIndex = items.indexOf(active.id as string)
            const newIndex = items.indexOf(over.id as string)
            return arrayMove(items, oldIndex, newIndex)
        })
    }

    const handleSaveOrder = () => {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(sections))
        setEditMode(false)
    }

    const handleRestoreOrder = () => {
        const saved = localStorage.getItem(ORDER_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed) && parsed.length === DEFAULT_SECTIONS.length) {
                    setSections(parsed)
                    setEditMode(false)
                    return
                }
            } catch {
                // Ignora erros
            }
        }
        setSections(DEFAULT_SECTIONS)
        setEditMode(false)
    }

    const toggleEditMode = () => {
        setEditMode((prev) => !prev)
    }

    // ---------- SALVAR LOCALIZAÇÃO ----------
    const handleLocationSave = async (location: {
        lat: number;
        lng: number;
        address: string;
        addressNumber?: string;
        addressComplement?: string;
    }) => {
        setIsSavingLocation(true)
        console.log('🔵 INICIANDO SALVAMENTO')

        try {
            const locationData = {
                lat: location.lat,
                lng: location.lng,
                address: location.address,
            }
            setSavedLocation(locationData)
            localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(locationData))
            console.log('✅ localStorage OK')

            const { data: { user }, error: authError } = await supabase.auth.getUser()
            console.log('🔵 Auth:', user?.id || 'NÃO LOGADO', authError || '')

            if (!user) {
                console.log('⚠️ Não autenticado')
                setShowLocationDialog(false)
                setIsSavingLocation(false)
                return
            }

            console.log('🔵 Tentando upsert...')
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

            console.log('🔵 Resultado:', { data, error })

            if (error) {
                console.error('❌ Erro no upsert:', error)
                alert('Erro ao salvar: ' + error.message)
            } else {
                console.log('✅ Salvo com sucesso:', data)
                alert('Localização salva!')
            }
        } catch (err) {
            console.error('❌ Erro inesperado:', err)
            alert('Erro: ' + (err as Error).message)
        } finally {
            setIsSavingLocation(false)
            setShowLocationDialog(false)
        }
    }

    const isSearchVisible = !showConfig && !activeStoreSlug && !showCreateStore && !showLogin && !showProfile

    // ---------- RENDERIZAR SEÇÃO ----------
    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case 'storeList':
                return (
                    <StoreList
                        title="Lojas em Destaque"
                        maxItems={8}
                        showArrows={true}
                        onStoreClick={(storeSlug) => {
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
                    />
                )
            case 'categorias':
                return <CategoriasSection />
            case 'productShowcase':
                return <ProductShowcase />
            case 'publicationShowcase':
                return <PublicationShowcase />
            case 'transporte':
                return <TransporteSection onBreveStatusChange={breveCallbacks.transporte} />
            case 'motorista':
                return <MotoristaSection onBreveStatusChange={breveCallbacks.motorista} />
            case 'promocoes':
                return <PromocoesSection />
            case 'compromissosPessoal':
                return <AtalhoCompromissosPessoal profileSlug={profileSlug} />
            case 'compromissosLoja':
                return <AtalhoCompromissosDaLoja profileSlug={profileSlug} />
            case 'createStore':
                return (
                    <ButtonCreateStoreHome
                        profileSlug={profileSlug}
                        loading={loading}
                        onClick={() => {
                            if (!profileSlug || loading) setShowCreateStore(true)
                        }}
                    />
                )
            case 'settingsSection':
                return <ButtonSettingsHome onClick={() => setShowConfig(true)} />
            default:
                return null
        }
    }

    const showHomeSections = () => {
        setShowConfig(false)
        setActiveStoreSlug(null)
        setShowCreateStore(false)
        setShowLogin(false)
        setShowProfile(false)
    }

    const handleStoreTabClick = (storeSlug: string) => {
        setShowConfig(false)
        setActiveStoreSlug(storeSlug)
        setShowCreateStore(false)
        setShowLogin(false)
        setShowProfile(false)
    }

    const handleLoginClick = () => {
        setShowLogin(true)
        setShowConfig(false)
        setActiveStoreSlug(null)
        setShowCreateStore(false)
        setShowProfile(false)
    }

    const handleSwitchToRegister = () => {
        setShowLogin(false)
        setShowCreateStore(true)
    }

    const handleProfileClick = () => {
        if (profileSlug && !loading) {
            setShowProfile(true)
            setShowConfig(false)
            setActiveStoreSlug(null)
            setShowCreateStore(false)
            setShowLogin(false)
        } else {
            handleLoginClick()
        }
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

                const isActive = activeStoreSlug === s.slug && !showConfig && !showProfile && !showLogin

                allTabs.push({
                    id: `loja-${s.slug}-painel`,
                    label: `${s.name} · Painel`,
                    icon: Store,
                    imageUrl: s.logoUrl,
                    onClick: () => handleStoreTabClick(s.slug),
                    isActive,
                    indicator: !isActive && hasActive ? counts : null,
                    statusColor,
                })
            })
        } else {
            allTabs.push({
                id: 'criar-loja',
                label: 'Criar loja',
                icon: Store,
                imageUrl: null,
                onClick: isLoggedIn
                    ? () => router.push('/criar-loja')
                    : () => setShowCreateStore(true),
                isActive: !isLoggedIn && showCreateStore,
            })
        }

        return allTabs
    }, [profileSlug, loading, avatarUrl, showConfig, activeStoreSlug, showCreateStore, showLogin, showProfile, stores, loadingStores, storeOrderCounts, router])

    const showFab = showConfig || showCreateStore || showLogin || showProfile || activeStoreSlug
    const showHomeFab = !showConfig && !activeStoreSlug && !showCreateStore && !showLogin && !showProfile

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
                    showSearch={isSearchVisible}
                    searchPlaceholder="Buscar restaurantes, mercados..."
                    onSearch={setSearchQuery}
                    onSearchFocus={() => setSearchFocused(true)}
                    onSearchBlur={(e) => {
                        if (lastSearchedRef.current?.contains(e.relatedTarget as Node)) {
                            return
                        }
                        setSearchFocused(false)
                    }}
                    profileSlug={profileSlug}
                    locationElement={
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
                                    ? formatAddress(savedLocation.address)
                                    : 'Definir local'
                            }
                        </button>
                    }
                />

                {showConfig ? (
                    <ConfiguracoesContent
                        onBack={() => setShowConfig(false)}
                        bgMode={bgMode}
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
                    <LoginScreen
                        embedded
                        onBack={() => setShowLogin(false)}
                        onSwitchToRegister={handleSwitchToRegister}
                    />
                ) : showProfile ? (
                    <ProfileDashboard
                        profileSlug={profileSlug}
                        onBack={() => setShowProfile(false)}
                    />
                ) : activeStoreSlug ? (
                    <PainelDaLoja
                        profileSlug={profileSlug!}
                        storeSlug={activeStoreSlug}
                    />
                ) : (
                    <div className="mt-2 px-4 md:px-6">
                        {(searchFocused || searchQuery.trim()) && (
                            <div className="mb-6">
                                {searchQuery.trim() ? (
                                    <SearchResultsSection
                                        searchQuery={searchQuery}
                                        onSearchSelect={setSearchQuery}
                                    />
                                ) : (
                                    <div ref={lastSearchedRef}>
                                        <LastSearched />
                                    </div>
                                )}
                            </div>
                        )}

                        {editMode ? (
                            <DndContext
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={sections}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="space-y-6">
                                        {sections.map((sectionId) => {
                                            const section = renderSection(sectionId)
                                            if (!section) return null
                                            return (
                                                <SortableSection key={sectionId} id={sectionId}>
                                                    {section}
                                                </SortableSection>
                                            )
                                        })}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        ) : (
                            <div className="space-y-6">
                                {displayedSections.map((sectionId) => {
                                    const section = renderSection(sectionId)
                                    if (!section) return null
                                    return <div key={sectionId}>{section}</div>
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Home - apenas SacolaButton (lado direito) */}
                {showHomeFab && (
                    <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                        <SacolaButton
                            totalItems={totalCartItems}
                            statusCounts={{
                                pending: pendingCount,
                                preparing: preparingCount,
                                ready: readyCount,
                                reviews: pendingReviewsCount,
                            }}
                            animate={cartAnimating}
                        />
                    </div>
                )}

                {/* StoreDashboard - SacolaButton + Home (lado direito, agrupados) */}
                {activeStoreSlug && (
                    <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                        <SacolaButton
                            totalItems={totalCartItems}
                            statusCounts={{
                                pending: pendingCount,
                                preparing: preparingCount,
                                ready: readyCount,
                                reviews: pendingReviewsCount,
                            }}
                            animate={cartAnimating}
                        />
                        <button
                            onClick={showHomeSections}
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                color: colors.accentText,
                                border: `2px solid ${colors.border}`,
                                boxShadow: `0 8px 24px ${colors.accent}60`,
                            }}
                            aria-label="Voltar ao início"
                        >
                            <Home size={24} />
                        </button>
                    </div>
                )}

                {/* Outras telas (Config, CreateStore, Login, Profile) - SacolaButton + Home */}
                {showFab && !activeStoreSlug && (
                    <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                        <SacolaButton
                            totalItems={totalCartItems}
                            statusCounts={{
                                pending: pendingCount,
                                preparing: preparingCount,
                                ready: readyCount,
                                reviews: pendingReviewsCount,
                            }}
                            animate={cartAnimating}
                        />
                        <button
                            onClick={showHomeSections}
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                color: colors.accentText,
                                border: `2px solid ${colors.border}`,
                                boxShadow: `0 8px 24px ${colors.accent}60`,
                            }}
                            aria-label="Voltar ao início"
                        >
                            <Home size={24} />
                        </button>
                    </div>
                )}

                {showLocationDialog && (
                    <LocationPicker
                        initialLocation={savedLocation ? {
                            lat: savedLocation.lat,
                            lng: savedLocation.lng,
                            address: savedLocation.address,
                            addressNumber: '',
                            addressComplement: ''
                        } : null}
                        onSave={async (location) => {
                            setIsSavingLocation(true)

                            try {
                                const locationData = {
                                    lat: location.lat,
                                    lng: location.lng,
                                    address: location.address,
                                }
                                setSavedLocation(locationData)
                                localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(locationData))

                                const { data: { user }, error: authError } = await supabase.auth.getUser()

                                if (!user) {
                                    console.log('⚠️ Usuário não autenticado. Salvando apenas localmente.')
                                    setShowLocationDialog(false)
                                    setIsSavingLocation(false)
                                    return
                                }

                                const { error } = await supabase
                                    .from('profiles')
                                    .upsert({
                                        id: user.id,
                                        address: location.address,
                                        address_number: location.addressNumber,
                                        address_complement: location.addressComplement,
                                        store_lat: location.lat,
                                        store_lng: location.lng,
                                    }, {
                                        onConflict: 'id',
                                        ignoreDuplicates: false
                                    })

                                if (error) {
                                    console.error('❌ Erro ao salvar no perfil:', error)
                                    alert('Erro ao salvar: ' + error.message)
                                } else {
                                    console.log('✅ Localização salva com sucesso!')
                                }
                            } catch (err) {
                                console.error('❌ Erro inesperado:', err)
                                alert('Erro: ' + (err as Error).message)
                            } finally {
                                setIsSavingLocation(false)
                                setShowLocationDialog(false)
                            }
                        }}
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