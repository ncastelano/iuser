// src/app/(main)/page.tsx
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, Settings, Store, ShoppingCart, Clock, ChefHat, CheckCircle2, Star, Home } from 'lucide-react'
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
import ConfiguracoesContent from './Configuracoes'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '../contexts/ProfileContext'
import { useTheme } from '../theme'
import OrderSection from '@/components/OrderSection'
import SearchResultsSection from '@/app/SearchResultsSection'
import LastSearched, { getRecentClicks } from '@/components/LastSearched'
import { supabase } from '@/lib/supabase/client'
import Header from '../Header'
import StoreDashboard from './StoreDashboard'
import CreateStoreAndRegisterProfile from './CreateStoreAndRegisterProfile'
import LoginScreen from './LoginScreen'
import ProfileDashboard from './ProfileDashboard'
import { useCartStore } from '@/store/useCartStore'

const DEFAULT_SECTIONS = [
    'categorias',
    'transporte',
    'motorista',
    'promocoes',
    'compromissosPessoal',
    'compromissosLoja',
    'orderSection',
]

const ORDER_STORAGE_KEY = 'homepage_sections_order'

export interface StoreInfo {
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

    const [stores, setStores] = useState<StoreInfo[]>([])
    const [activeStoreSlug, setActiveStoreSlug] = useState<string | null>(null)
    const [showCreateStore, setShowCreateStore] = useState(false)
    const [showLogin, setShowLogin] = useState(false)
    const [showProfile, setShowProfile] = useState(false)

    const lastSearchedRef = useRef<HTMLDivElement>(null)

    const totalCartItems = useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

    // Estados dos pedidos (buscados do Supabase)
    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)

    useEffect(() => {
        if (totalCartItems > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartItems])

    // Busca os pedidos do usuário para contar status
    useEffect(() => {
        const fetchOrderStatuses = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Buscar pedidos da tabela orders
            const { data: orders } = await supabase
                .from('orders')
                .select('status')
                .eq('buyer_id', user.id)

            if (orders) {
                setPendingCount(orders.filter(o => o.status === 'pending').length)
                setPreparingCount(orders.filter(o => o.status === 'preparing').length)
                setReadyCount(orders.filter(o => o.status === 'ready').length)
            }

            // Avaliações pendentes (produtos comprados sem review)
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

    const toggleEditMode = () => setEditMode((prev) => !prev)

    const isSearchVisible = !showConfig && !activeStoreSlug && !showCreateStore && !showLogin && !showProfile

    const renderSection = (sectionId: string) => {
        switch (sectionId) {
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
                if (!isSearchVisible) return <CategoriasSection />

                if (searchFocused && !searchQuery.trim()) {
                    const recentItems = getRecentClicks()
                    if (recentItems.length > 0) {
                        return (
                            <div ref={lastSearchedRef}>
                                <LastSearched />
                            </div>
                        )
                    }
                    return <CategoriasSection />
                }

                if (searchQuery.trim()) {
                    return (
                        <SearchResultsSection
                            searchQuery={searchQuery}
                            onSearchSelect={setSearchQuery}
                        />
                    )
                }

                return <CategoriasSection />

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
                    id: `loja-${s.slug}`,
                    label: s.name,
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
    }

    const primaryButtonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '1rem',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s',
        background: colors.accent,
        color: colors.accentText,
        border: `1px solid ${colors.accent}`,
        boxShadow: `0 4px 12px ${colors.accent}40`,
        cursor: 'pointer',
    }

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
                    <StoreDashboard
                        profileSlug={profileSlug}
                        storeSlug={activeStoreSlug}
                        onBack={showHomeSections}
                    />
                ) : (
                    <div className="mt-2 px-4 md:px-6">
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
                                {sections.map((sectionId) => {
                                    const section = renderSection(sectionId)
                                    if (!section) return null
                                    return <div key={sectionId}>{section}</div>
                                })}
                            </div>
                        )}

                        {/* Seção Criar Loja */}
                        <div className="mt-6 rounded-2xl p-5 flex flex-col gap-1" style={cardStyle}>
                            <div className="flex items-center gap-2 mb-1">
                                <Store size={20} style={{ color: colors.accent }} />
                                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                                    Criar Loja
                                </h2>
                            </div>
                            <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                                Crie uma nova loja para vender seus produtos ou serviços.
                            </p>
                            <button
                                onClick={() => {
                                    if (profileSlug && !loading) {
                                        router.push('/criar-loja')
                                    } else {
                                        setShowCreateStore(true)
                                    }
                                }}
                                className="group flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold transition-all duration-200"
                                style={primaryButtonStyle}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.filter = 'brightness(0.95)'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.filter = 'brightness(1)'
                                }}
                            >
                                <Store size={18} />
                                {profileSlug ? 'Criar nova loja' : 'Criar loja e perfil'}
                            </button>
                        </div>

                        {/* Seção Configurações */}
                        <div className="mt-6 rounded-2xl p-5 flex flex-col gap-1" style={cardStyle}>
                            <div className="flex items-center gap-2 mb-1">
                                <Settings size={20} style={{ color: colors.accent }} />
                                <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                                    Configurações
                                </h2>
                            </div>
                            <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                                Personalize sua experiência, altere o fundo e muito mais.
                            </p>
                            <button
                                onClick={() => setShowConfig(true)}
                                className="group flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold transition-all duration-200"
                                style={primaryButtonStyle}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.filter = 'brightness(0.95)'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.filter = 'brightness(1)'
                                }}
                            >
                                <Settings size={18} />
                                Acessar Configurações
                            </button>
                        </div>
                    </div>
                )}

                {/* Botão Sacola (tela principal) */}
                {showHomeFab && (
                    <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                        <button
                            onClick={() => router.push('/sacola')}
                            style={{
                                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}dd)`,
                                color: colors.accentText,
                                border: 'none',
                                borderRadius: 32,
                                padding: '16px 28px',
                                fontWeight: 800,
                                fontSize: 18,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                boxShadow: `0 12px 40px ${colors.accent}80`,
                                cursor: 'pointer',
                                transition: 'transform 0.2s',
                                position: 'relative',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                        >
                            <ShoppingCart size={24} />
                            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                Sacola
                                {/* Indicadores de status compactos */}
                                <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                    {pendingCount > 0 && (
                                        <span style={{
                                            background: '#3b82f6',
                                            color: 'white',
                                            borderRadius: 999,
                                            padding: '0 4px',
                                            fontSize: 9,
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            lineHeight: '14px',
                                        }}>
                                            <Clock size={9} />{pendingCount}
                                        </span>
                                    )}
                                    {preparingCount > 0 && (
                                        <span style={{
                                            background: '#eab308',
                                            color: 'white',
                                            borderRadius: 999,
                                            padding: '0 4px',
                                            fontSize: 9,
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            lineHeight: '14px',
                                        }}>
                                            <ChefHat size={9} />{preparingCount}
                                        </span>
                                    )}
                                    {readyCount > 0 && (
                                        <span style={{
                                            background: '#a855f7',
                                            color: 'white',
                                            borderRadius: 999,
                                            padding: '0 4px',
                                            fontSize: 9,
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            lineHeight: '14px',
                                        }}>
                                            <CheckCircle2 size={9} />{readyCount}
                                        </span>
                                    )}
                                    {pendingReviewsCount > 0 && (
                                        <span style={{
                                            background: '#facc15',
                                            color: '#000',
                                            borderRadius: 999,
                                            padding: '0 4px',
                                            fontSize: 9,
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            lineHeight: '14px',
                                        }}>
                                            <Star size={9} />{pendingReviewsCount}
                                        </span>
                                    )}
                                </span>
                                {/* Badge de itens no carrinho */}
                                {totalCartItems > 0 && (
                                    <span
                                        className="absolute"
                                        style={{
                                            top: -8,
                                            right: -18,
                                            minWidth: 20,
                                            height: 20,
                                            borderRadius: 999,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            background: colors.accentText,
                                            color: colors.accent,
                                            border: `2px solid ${colors.accent}`,
                                            boxShadow: `0 2px 6px rgba(0,0,0,0.15)`,
                                            transform: cartAnimating ? 'scale(1.3)' : 'scale(1)',
                                            transition: 'transform 0.2s ease',
                                            padding: '0 4px',
                                        }}
                                    >
                                        {totalCartItems}
                                    </span>
                                )}
                            </span>
                        </button>
                    </div>
                )}

                {/* Botão flutuante "Voltar ao início" (subpáginas) */}
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