'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, Settings, Store, Home } from 'lucide-react'
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

    const [stores, setStores] = useState<StoreInfo[]>([])
    const [activeStoreSlug, setActiveStoreSlug] = useState<string | null>(null)
    const [showCreateStore, setShowCreateStore] = useState(false)
    const [showLogin, setShowLogin] = useState(false)
    const [showProfile, setShowProfile] = useState(false)

    const lastSearchedRef = useRef<HTMLDivElement>(null)

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

    // ══════════════ REMOÇÃO DA ABA "TUDO" ══════════════
    const tabs = useMemo(() => {
        const isLoggedIn = !!profileSlug && !loading

        // Não adicionamos mais a aba "inicio"
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

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
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

                {/* Botão flutuante "Voltar ao início" */}
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
        </div>
    )
}