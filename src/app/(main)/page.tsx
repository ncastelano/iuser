// src/app/(main)/page.tsx
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, Settings, Store, Home, MapPin } from 'lucide-react'
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
import LastSearched, { getRecentClicks } from '@/components/LastSearched'
import { supabase } from '@/lib/supabase/client'
import Header from '../Header'
import CreateStoreAndRegisterProfile from './CreateStoreAndRegisterProfile'
import LoginScreen from './LoginScreen'
import ProfileDashboard from './ProfileDashboard'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '../SacolaButton'
import BannerPago from './inicio/sections/BannerPago'
import PainelDaLoja from './StoreDashboard'
import ButtonSettingsHome from './ButtonSettingsHome'
import ButtonCreateStoreHome from './ButtonCreateStoreHome'
import ProductShowcase from './inicio/sections/ProductShowcase'
import PublicationShowcase from './inicio/sections/PublicationShowcase'
import LocationPicker from './LocationPicker'

const DEFAULT_SECTIONS = [
    'compromissosPessoal',
    'compromissosLoja',
    'bannerPago',
    'productShowcase',
    'publicationShowcase',
    'categorias',
    'promocoes',
    'motorista',
    'transporte', 'orderSection',
]

const ORDER_STORAGE_KEY = 'homepage_sections_order'
const LOCATION_STORAGE_KEY = 'user_saved_location'

export interface StoreInfo {
    id: string
    slug: string
    logoUrl: string | null
    name: string
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

    const [sections, setSections] = useState<string[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(ORDER_STORAGE_KEY)
            if (saved) {
                try {
                    const parsed = JSON.parse(saved)
                    if (Array.isArray(parsed) && parsed.length === DEFAULT_SECTIONS.length) {
                        return parsed
                    }
                } catch { }
            }
        }
        return DEFAULT_SECTIONS
    })

    const [showConfig, setShowConfig] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [cartAnimating, setCartAnimating] = useState(false)
    const [allPublicStores, setAllPublicStores] = useState<any[]>([])
    const [stores, setStores] = useState<StoreInfo[]>([])
    const [activeStoreSlug, setActiveStoreSlug] = useState<string | null>(null)
    const [showCreateStore, setShowCreateStore] = useState(false)
    const [showLogin, setShowLogin] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const [hasPersonalAgenda, setHasPersonalAgenda] = useState(false)
    const [hasStoreAgenda, setHasStoreAgenda] = useState(false)

    const [savedLocation, setSavedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null)
    const [showLocationDialog, setShowLocationDialog] = useState(false)

    const lastSearchedRef = useRef<HTMLDivElement>(null)

    const totalCartItems = useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)

    // ---------- CARREGAMENTO DA LOCALIZAÇÃO SALVA (OFFLINE + PERFIL) ----------
    useEffect(() => {
        // 1. Carrega imediatamente do localStorage (cache offline)
        const stored = localStorage.getItem(LOCATION_STORAGE_KEY)
        if (stored) {
            try {
                setSavedLocation(JSON.parse(stored))
            } catch { }
        }

        // 2. Tenta sincronizar com o perfil do Supabase (se logado e online)
        const syncWithProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            try {
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('address, location')
                    .eq('id', user.id)
                    .maybeSingle()

                if (!error && profile?.location) {
                    let lat: number | null = null
                    let lng: number | null = null
                    const loc = profile.location
                    if (
                        typeof loc === 'object' &&
                        loc !== null &&
                        'type' in loc &&
                        loc.type === 'Point' &&
                        Array.isArray(loc.coordinates)
                    ) {
                        lng = loc.coordinates[0]
                        lat = loc.coordinates[1]
                    } else if (typeof loc === 'string') {
                        const match = loc.match(
                            /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i
                        )
                        if (match) {
                            lng = parseFloat(match[1])
                            lat = parseFloat(match[2])
                        }
                    }

                    if (lat !== null && lng !== null) {
                        const newLocation = {
                            lat,
                            lng,
                            address: profile.address || 'Localização salva',
                        }
                        setSavedLocation(newLocation)
                        localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation))
                    }
                }
            } catch {
                // Ignora erros de rede (offline)
            }
        }

        syncWithProfile()
    }, [])

    useEffect(() => {
        if (totalCartItems > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartItems])

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

            const { data: purchases } = await supabase
                .from('store_sales')
                .select('id')
                .eq('buyer_id', user.id)
                .eq('status', 'paid')

            if (purchases) {
                const { data: reviews } = await supabase
                    .from('product_reviews')
                    .select('id')
                    .eq('profile_id', user.id)

                const reviewedIds = new Set(reviews?.map(r => r.id) || [])
                const pending = purchases.filter(p => !reviewedIds.has(p.id)).length
                setPendingReviewsCount(pending)
            }
        }
        fetchOrderStatuses()
    }, [])

    // Lojas do usuário logado
    useEffect(() => {
        async function loadStores() {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user || !profileSlug) return

            const { data: fetchedStores } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')
                .eq('owner_id', session.user.id)
                .order('created_at', { ascending: true })

            if (fetchedStores) {
                const storesData = fetchedStores.map((s) => {
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
                    }
                })
                setStores(storesData)
            }
        }
        loadStores()
    }, [profileSlug])

    useEffect(() => {
        async function checkAgendas() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user || !profileSlug) {
                setHasPersonalAgenda(false)
                setHasStoreAgenda(false)
                return
            }
            const { count: personalCount } = await supabase
                .from('personal_events')
                .select('id', { count: 'exact', head: true })
                .eq('profile_id', user.id)
            setHasPersonalAgenda((personalCount ?? 0) > 0)

            const storeIds = stores.map(s => s.id)
            if (storeIds.length > 0) {
                const { count: storeEventCount } = await supabase
                    .from('store_events')
                    .select('id', { count: 'exact', head: true })
                    .in('store_id', storeIds)
                setHasStoreAgenda((storeEventCount ?? 0) > 0)
            } else {
                setHasStoreAgenda(false)
            }
        }
        checkAgendas()
    }, [profileSlug, stores])

    const displayedSections = useMemo(() => {
        const agendaKeys = ['compromissosPessoal', 'compromissosLoja']
        if (!profileSlug) {
            const withoutAgendas = sections.filter(s => !agendaKeys.includes(s))
            const promocoesIndex = withoutAgendas.indexOf('promocoes')
            if (promocoesIndex >= 0) {
                withoutAgendas.splice(promocoesIndex + 1, 0, ...agendaKeys.filter(k => sections.includes(k)))
            } else {
                withoutAgendas.push(...agendaKeys.filter(k => sections.includes(k)))
            }
            return withoutAgendas
        }
        return sections.filter(s => {
            if (s === 'compromissosPessoal' && !hasPersonalAgenda) return false
            if (s === 'compromissosLoja' && !hasStoreAgenda) return false
            return true
        })
    }, [sections, profileSlug, hasPersonalAgenda, hasStoreAgenda])

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
            } catch { }
        }
        setSections(DEFAULT_SECTIONS)
        setEditMode(false)
    }

    const toggleEditMode = () => {
        setEditMode((prev) => !prev)
    }

    // ---------- HANDLE LOCATION SAVE ----------
    const handleLocationSave = async (location: { lat: number; lng: number; address: string }) => {
        setSavedLocation(location)
        localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location))

        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const point = `SRID=4326;POINT(${location.lng} ${location.lat})`
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    location: point,
                    address: location.address,
                })
                .eq('id', user.id)

            if (updateError) {
                const { error: insertError } = await supabase
                    .from('profiles')
                    .insert({
                        id: user.id,
                        location: point,
                        address: location.address,
                    })
                if (insertError) console.error('Erro ao salvar localização no perfil:', insertError)
            }
        }

        setShowLocationDialog(false)
    }

    const isSearchVisible = !showConfig && !activeStoreSlug && !showCreateStore && !showLogin && !showProfile

    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case 'bannerPago':
                // O BannerPago agora obtém a localização sozinho (navigator.geolocation)
                // e também pode usar a savedLocation internamente se preferir.
                return <BannerPago />
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
                return <TransporteSection />
            case 'motorista':
                return <MotoristaSection />
            case 'promocoes':
                return <PromocoesSection />
            case 'compromissosPessoal':
                return <AtalhoCompromissosPessoal profileSlug={profileSlug} />
            case 'compromissosLoja':
                return <AtalhoCompromissosDaLoja profileSlug={profileSlug} />
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

        if (stores.length > 0) {
            stores.forEach((s) => {
                allTabs.push({
                    id: `loja-${s.slug}-painel`,
                    label: `${s.name} · Painel`,
                    icon: Store,
                    imageUrl: s.logoUrl,
                    onClick: () => handleStoreTabClick(s.slug),
                    isActive: activeStoreSlug === s.slug && !showConfig && !showProfile && !showLogin,
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
    }, [profileSlug, loading, avatarUrl, showConfig, activeStoreSlug, showCreateStore, showLogin, showProfile, stores, router])

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
                            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-black/10 hover:bg-black/20 transition"
                            style={{ color: colors.textPrimary }}
                        >
                            <MapPin size={14} />
                            {savedLocation ? savedLocation.address.slice(0, 20) : 'Definir local'}
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

                        <ButtonCreateStoreHome
                            profileSlug={profileSlug}
                            loading={loading}
                            onClick={() => {
                                if (profileSlug && !loading) {
                                    router.push('/criar-loja')
                                } else {
                                    setShowCreateStore(true)
                                }
                            }}
                        />

                        <ButtonSettingsHome onClick={() => setShowConfig(true)} />
                    </div>
                )}

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

                {showFab && (
                    <button
                        onClick={showHomeSections}
                        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
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
                )}

                {showLocationDialog && (
                    <LocationPicker
                        initialLocation={savedLocation}
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