// src/app/(app)/[ownerSlug]/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import SacolaButton from '@/app/ButtonSacola'
import { useCartStore } from '@/store/useCartStore'
import { User, Store as StoreIcon, LayoutDashboard, Home, Newspaper } from 'lucide-react'
import type { Tab } from '@/app/Header'
import ProfileDashboard from '../ProfileDashboard'
import StoreDashboard from '../StoreDashboard'
import { Profile } from './Profile'
import { Store } from './Store'
import { usePublicationsStore } from '@/store/usePublicationStore'
import { PublicationsListView } from '../PublicationsListView'

type OwnerType = 'profile' | 'store'

// GRADIENTE FIXO
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

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

export default function OwnerPage() {
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
    const { itemsByStore } = useCartStore()
    const publicationsStore = usePublicationsStore()

    const ownerSlug = Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug

    const [loading, setLoading] = useState(true)
    const [ownerType, setOwnerType] = useState<OwnerType | null>(null)
    const [ownerId, setOwnerId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [cartAnimating, setCartAnimating] = useState(false)
    const [stores, setStores] = useState<StoreInfo[]>([])
    const [loadingStores, setLoadingStores] = useState(true)
    const [storeOrderCounts, setStoreOrderCounts] = useState<
        Record<string, { pending: number; preparing: number; ready: number }>
    >({})
    const [showProfile, setShowProfile] = useState(false)
    const [showStoreDashboard, setShowStoreDashboard] = useState<{ slug: string; name: string } | null>(null)
    const [showPublications, setShowPublications] = useState(false)

    // ===== STATUS DOS PEDIDOS DO USUÁRIO (COMPRADOR) =====
    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)

    // ========== FUNÇÃO PARA ABRIR PUBLICAÇÕES ==========
    const handleOpenPublications = useCallback((publications: any[], initialIndex: number, storeSlug: string) => {
        // Definir as publicações na store antes de abrir
        publicationsStore.setPublicationFeed(publications, initialIndex, undefined, storeSlug)

        // Abrir o overlay de publicações
        setShowPublications(true)
        setShowProfile(false)
        setShowStoreDashboard(null)
    }, [publicationsStore])

    // ========== DETECTAR OWNER ==========
    const detectOwnerType = async (slug: string) => {
        if (!slug) return null

        // Tenta encontrar como perfil
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('profileSlug', slug)
            .maybeSingle()

        if (profile && !profileError) {
            return { type: 'profile' as OwnerType, id: profile.id }
        }

        // Tenta encontrar como loja
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('id')
            .eq('storeSlug', slug)
            .maybeSingle()

        if (store && !storeError) {
            return { type: 'store' as OwnerType, id: store.id }
        }

        return null
    }

    // ========== CARREGAR LOJAS DO USUÁRIO LOGADO ==========
    useEffect(() => {
        async function loadStores() {
            setLoadingStores(true)
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user || !loggedUserSlug) {
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
    }, [loggedUserSlug])

    // ========== CONTAGENS DE PEDIDOS DAS LOJAS ==========
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
            .channel('ownerpage-store-orders')
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

    // ========== BUSCAR STATUS DOS PEDIDOS DO USUÁRIO ==========
    useEffect(() => {
        const fetchOrderStatuses = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Buscar pedidos do usuário
            const { data: orders } = await supabase
                .from('orders')
                .select('status')
                .eq('buyer_id', user.id)

            if (orders) {
                setPendingCount(orders.filter(o => o.status === 'pending').length)
                setPreparingCount(orders.filter(o => o.status === 'preparing').length)
                setReadyCount(orders.filter(o => o.status === 'ready').length)
            }

            // Buscar pedidos pagos para avaliações pendentes
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

    // ========== TABS DO HEADER ==========
    const handleProfileClick = () => {
        setShowProfile(true)
        setShowStoreDashboard(null)
        setShowPublications(false)
    }

    const handleStoreDashboardClick = (storeSlug: string, storeName: string) => {
        setShowStoreDashboard({ slug: storeSlug, name: storeName })
        setShowProfile(false)
        setShowPublications(false)
    }

    const handleShowPublications = () => {
        setShowPublications(true)
        setShowProfile(false)
        setShowStoreDashboard(null)
    }

    const showMainContent = () => {
        setShowProfile(false)
        setShowStoreDashboard(null)
        setShowPublications(false)
        // Voltar para a URL base quando fechar
        router.replace(`/${ownerSlug}`, { scroll: false })
    }

    const tabs = useMemo(() => {
        const isLoggedIn = !!loggedUserSlug && !profileLoading
        const allTabs: Tab[] = [
            {
                id: 'perfil',
                label: isLoggedIn ? `@${loggedUserSlug}` : 'Entrar',
                icon: User as any,
                imageUrl: isLoggedIn ? loggedUserAvatarUrl : null,
                onClick: () => {
                    if (isLoggedIn) {
                        handleProfileClick()
                    } else {
                        router.push('/login')
                    }
                },
                isActive: showProfile || (!isLoggedIn && !loggedUserSlug),
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
                    icon: LayoutDashboard as any,
                    imageUrl: s.logoUrl,
                    onClick: () => handleStoreDashboardClick(s.slug, s.name),
                    isActive: showStoreDashboard?.slug === s.slug,
                    indicator: hasActive ? counts : null,
                    statusColor,
                })
            })
        } else if (isLoggedIn) {
            allTabs.push({
                id: 'criar-loja',
                label: 'Quer criar uma loja?',
                icon: StoreIcon as any,
                imageUrl: null,
                onClick: () => router.push('/criar-loja'),
                isActive: false,
            })
        } else {
            allTabs.push({
                id: 'criar-loja',
                label: 'Criar loja',
                icon: StoreIcon as any,
                imageUrl: null,
                onClick: () => router.push('/criar-loja-com-cadastro'),
                isActive: false,
            })
        }

        return allTabs
    }, [loggedUserSlug, profileLoading, loggedUserAvatarUrl, stores, loadingStores, storeOrderCounts, showProfile, showStoreDashboard, router])

    // ========== CARREGAR DADOS ==========
    useEffect(() => {
        const loadOwner = async () => {
            if (!ownerSlug) {
                setError('Parâmetro inválido')
                setLoading(false)
                return
            }

            setLoading(true)
            setError(null)

            try {
                const result = await detectOwnerType(ownerSlug)
                if (!result) {
                    setError('Perfil ou loja não encontrado')
                    setLoading(false)
                    return
                }

                setOwnerType(result.type)
                setOwnerId(result.id)
            } catch (err: any) {
                console.error('Erro ao detectar owner:', err)
                setError(err.message || 'Erro ao carregar página')
            } finally {
                setLoading(false)
            }
        }

        loadOwner()
    }, [ownerSlug])

    useEffect(() => {
        setMounted(true)
    }, [])

    // ========== CALCULAR TOTAL DO CARRINHO ==========
    const storeKey = useMemo(() => {
        if (!ownerSlug) return ''
        return ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
    }, [ownerType, ownerSlug])

    const cartItems = useMemo(() => {
        if (!storeKey) return []
        return itemsByStore[storeKey] || []
    }, [itemsByStore, storeKey])

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

    useEffect(() => {
        if (totalCartQuantity > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartQuantity])

    // ========== RENDER ==========
    if (loading) {
        return <LoadingSpinner message="Carregando..." background={colors.background} />
    }

    if (error || !ownerType || !ownerSlug) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">🔍</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Não encontrado'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        O perfil ou loja que você está procurando não existe.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        Voltar ao início
                    </button>
                </div>
            </div>
        )
    }

    const greeting = `Olá, ${profileLoading ? '...' : loggedUserSlug ? `@${loggedUserSlug}` : 'Visitante'}`

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            {/* Background animado */}
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            {/* Conteúdo principal com z-index */}
            <main className="relative z-10 min-h-dvh pb-28" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="iUser"
                    showBack={false}
                    greeting={greeting}
                    avatarUrl={loggedUserAvatarUrl || null}
                    loading={loading || profileLoading || loadingStores}
                    tabs={tabs}
                    showSearch={false}
                    searchPlaceholder="Buscar..."
                    onSearch={() => { }}
                    profileSlug={loggedUserSlug}
                />

                {/* ===== RENDERIZAR CONTEÚDO ===== */}
                {showProfile ? (
                    <div className="max-w-4xl mx-auto px-4 py-6">
                        <ProfileDashboard
                            profileSlug={loggedUserSlug || ''}
                            onBack={showMainContent}
                            avatarUrl={loggedUserAvatarUrl || undefined}
                        />
                    </div>
                ) : showStoreDashboard ? (
                    <div className="max-w-4xl mx-auto px-4 py-6">
                        <StoreDashboard
                            profileSlug={loggedUserSlug || ''}
                            storeSlug={showStoreDashboard.slug}
                            onBack={showMainContent}
                            onOrderCountsChange={(counts) => {
                                setStoreOrderCounts(prev => {
                                    const store = stores.find(s => s.slug === showStoreDashboard.slug)
                                    if (store) {
                                        return {
                                            ...prev,
                                            [store.id]: counts
                                        }
                                    }
                                    return prev
                                })
                            }}
                        />
                    </div>
                ) : showPublications ? (
                    <PublicationsListView
                        ownerSlug={ownerSlug}
                        storeSlug={ownerType === 'store' ? ownerSlug : undefined}
                        onClose={showMainContent}
                    />
                ) : (
                    <>
                        {ownerType === 'profile' ? (
                            <Profile
                                ownerSlug={ownerSlug}
                                colors={colors}
                                bgMode={bgMode}
                                customBgUrl={customBgUrl}
                                loggedUserSlug={loggedUserSlug}
                            />
                        ) : (
                            <Store
                                ownerSlug={ownerSlug}
                                colors={colors}
                                bgMode={bgMode}
                                customBgUrl={customBgUrl}
                                loggedUserSlug={loggedUserSlug}
                                onCartUpdate={(total) => {
                                    // Atualiza o estado do carrinho se necessário
                                }}
                                onOpenPublications={handleOpenPublications}
                            />
                        )}
                    </>
                )}

                {/* ===== BOTÃO FLUTUANTE DE PUBLICAÇÕES ===== */}
                {!showProfile && !showStoreDashboard && !showPublications && (
                    <div style={{
                        position: 'fixed',
                        bottom: 100,
                        right: 24,
                        zIndex: 998
                    }}>
                        <button
                            onClick={handleShowPublications}
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                borderTop: '2px solid #f97316',
                                borderRight: '2px solid #f97316',
                                borderBottom: '2px solid #f97316',
                                borderLeft: '2px solid #f97316',
                                boxShadow: `0 8px 24px #f9731660`,
                            }}
                            aria-label="Ver publicações"
                        >
                            <Newspaper size={24} />
                        </button>
                    </div>
                )}

                {/* ===== BOTÕES FLUTUANTES ===== */}
                {!showProfile && !showStoreDashboard && !showPublications && (
                    <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                        <SacolaButton
                            totalItems={totalCartQuantity}
                            totalValue={totalCartValue}
                            statusCounts={{
                                pending: pendingCount,
                                preparing: preparingCount,
                                ready: readyCount,
                                reviews: pendingReviewsCount,
                            }}
                            animate={cartAnimating}
                        />

                        <button
                            onClick={() => router.push('/')}
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
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
                    </div>
                )}

                {/* Botão Home - visível quando está em um dashboard */}
                {(showProfile || showStoreDashboard || showPublications) && (
                    <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                        <button
                            onClick={showMainContent}
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                borderTop: '2px solid #f97316',
                                borderRight: '2px solid #f97316',
                                borderBottom: '2px solid #f97316',
                                borderLeft: '2px solid #f97316',
                                boxShadow: `0 8px 24px #f9731660`,
                            }}
                            aria-label="Voltar ao conteúdo"
                        >
                            <Home size={24} />
                        </button>
                    </div>
                )}
            </main>
        </div>
    )
}