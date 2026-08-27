// app/(main)/ProfileDashboard.tsx
'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { RatingStars } from '@/components/ratings/RatingStars'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '../ButtonSacola'
import { toast } from 'sonner'
import {
    Eye,
    Settings,
    X,
    DollarSign,
    ShoppingCart,
    Package,
    Pencil,
    Phone,
    User,
    Calendar,
    Store,
    Heart,
    Star,
    Home,
    Copy,
    ExternalLink,
    AlertCircle,
    Check,
    Loader2,
    BarChart3,
} from 'lucide-react'
import StoreAddress from './StoreAddress'
import AtalhoCompromissosPessoal from './compromissos/AtalhoCompromissosPessoal'
import ProfileVisitors from './ProfileVisitors'
import PublicationProfile from './ProfilePublication'
import ProfileOperatingDays from './ProfileOperatingDays'
import Commission from './Commission'
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns'
import { ptBR as ptBRLocale } from 'date-fns/locale'

// ===== IMPORTAR DO PROFILEHOURS (com suporte a intervalo) =====
import { isProfileOpenNow, getProfileStatusWithLunch } from '@/lib/profileHours'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

const pillButtonFullStyle = {
    ...pillButtonStyle,
    flex: 1,
    padding: '0.75rem 1.25rem',
    fontSize: '0.875rem',
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

export default function ProfileDashboard({
    profileSlug,
    onBack,
    avatarUrl,
}: {
    profileSlug: string | null
    onBack?: () => void
    avatarUrl?: string | null
}) {
    const router = useRouter()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const { itemsByStore } = useCartStore()
    const [profile, setProfile] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    const [orders, setOrders] = useState<any[]>([])
    const [metrics, setMetrics] = useState({
        daily: { spent: 0, orders: 0 },
        total: { spent: 0, orders: 0, stores: 0 },
    })

    const [dailySpendingData, setDailySpendingData] = useState<{ date: string; amount: number }[]>([])
    const [spendingPeriod, setSpendingPeriod] = useState<'7days' | '30days'>('7days')
    const [totalPeriodSpent, setTotalPeriodSpent] = useState(0)

    const [favoriteStores, setFavoriteStores] = useState<any[]>([])
    const [favoriteStoresNotOwned, setFavoriteStoresNotOwned] = useState<any[]>([])
    const [recentViews, setRecentViews] = useState<any[]>([])
    const [reviews, setReviews] = useState<any[]>([])
    const [upcomingSchedules, setUpcomingSchedules] = useState<any[]>([])

    const [pendingCount, setPendingCount] = useState(0)
    const [preparingCount, setPreparingCount] = useState(0)
    const [readyCount, setReadyCount] = useState(0)
    const [pendingReviewsCount, setPendingReviewsCount] = useState(0)
    const [cartAnimating, setCartAnimating] = useState(false)

    // Estado para o aviso de WhatsApp
    const [showWhatsAppAlert, setShowWhatsAppAlert] = useState(true)
    const [whatsAppInput, setWhatsAppInput] = useState('')
    const [savingWhatsApp, setSavingWhatsApp] = useState(false)

    // Tab controle
    const [activeTab, setActiveTab] = useState<'compras' | 'favoritas' | 'avaliacoes'>('compras')

    const intervalRef = useRef<any>(null)

    // ===== CALCULAR TOTAL DE ITENS DO CARRINHO =====
    const totalCartItems = React.useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

    // ===== CALCULAR VALOR TOTAL DO CARRINHO =====
    const totalCartValue = React.useMemo(() => {
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

    // ===== USANDO AS FUNÇÕES DO PROFILEHOURS (com suporte a intervalo) =====
    const isProfileOpen = useMemo(() => {
        if (!profile) return false
        return isProfileOpenNow(profile.business_hours)
    }, [profile])

    const profileStatusText = useMemo(() => {
        if (!profile) return ''
        const status = getProfileStatusWithLunch(profile.business_hours)
        return status.text
    }, [profile])

    React.useEffect(() => {
        if (totalCartItems > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartItems])

    React.useEffect(() => {
        const fetchOrderStatuses = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: ordersData } = await supabase
                .from('orders')
                .select('status')
                .eq('buyer_id', user.id)

            if (ordersData) {
                setPendingCount(ordersData.filter(o => o.status === 'pending').length)
                setPreparingCount(ordersData.filter(o => o.status === 'preparing').length)
                setReadyCount(ordersData.filter(o => o.status === 'ready').length)
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

                    const { data: reviewsData } = await supabase
                        .from('product_reviews')
                        .select('product_id')
                        .eq('profile_id', user.id)
                        .in('product_id', productIds)

                    const reviewedIds = new Set(reviewsData?.map(r => r.product_id) || [])
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

    // Função para salvar WhatsApp
    const handleSaveWhatsApp = async () => {
        if (!profile || !profileSlug) return

        const cleanPhone = whatsAppInput.replace(/\s/g, '').replace(/[()\-]/g, '')

        if (cleanPhone.length < 10) {
            toast.error('Digite um número de telefone válido (mínimo 10 dígitos)')
            return
        }

        setSavingWhatsApp(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ whatsapp: cleanPhone })
                .eq('id', profile.id)

            if (error) throw error

            setProfile({ ...profile, whatsapp: cleanPhone })
            setShowWhatsAppAlert(false)
            toast.success('WhatsApp adicionado com sucesso! 🎉')
            loadDashboard()
        } catch (error: any) {
            toast.error('Erro ao salvar WhatsApp: ' + error.message)
        } finally {
            setSavingWhatsApp(false)
        }
    }

    const loadDashboard = useCallback(async () => {
        if (!profileSlug) return
        setLoading(true)

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .ilike('profileSlug', profileSlug)
            .maybeSingle()

        if (profileError || !profileData) {
            toast.error('Perfil não encontrado')
            setLoading(false)
            return
        }

        const finalAvatarUrl = avatarUrl || (profileData.avatar_url
            ? supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url).data.publicUrl
            : null)

        setProfile({ ...profileData, avatar_url: finalAvatarUrl })

        if (profileData.whatsapp) {
            setShowWhatsAppAlert(false)
        } else {
            setShowWhatsAppAlert(true)
        }

        const profileId = profileData.id

        // Buscar lojas do usuário para saber quais são dele
        const { data: userStores } = await supabase
            .from('stores')
            .select('storeSlug')
            .eq('owner_id', profileId)

        const userStoreSlugs = new Set(userStores?.map(s => s.storeSlug) || [])

        const { data: ordersData } = await supabase
            .from('orders')
            .select(`
                id,
                checkout_id,
                store_id,
                total_amount,
                delivery_fee,
                delivery_option,
                payment_method,
                delivery_address,
                status,
                created_at,
                stores:store_id (
                    name,
                    storeSlug,
                    logo_url
                ),
                order_items (
                    id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    total_price
                )
            `)
            .eq('buyer_id', profileId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (ordersData) {
            const formattedOrders = ordersData.map((order: any) => {
                const items = order.order_items || []
                const subtotal = items.reduce((acc: number, i: any) => acc + Number(i.total_price || 0), 0)
                const deliveryFee = Number(order.delivery_fee || 0)

                const storeData = Array.isArray(order.stores) ? order.stores[0] : order.stores

                let storeLogo = null
                if (storeData?.logo_url) {
                    storeLogo = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                }

                return {
                    id: order.id,
                    checkout_id: order.checkout_id,
                    store_name: storeData?.name || 'Loja',
                    store_slug: storeData?.storeSlug || '',
                    store_logo: storeLogo,
                    created_at: order.created_at,
                    status: order.status,
                    delivery_address: order.delivery_address,
                    items,
                    subtotal,
                    deliveryFee,
                    totalPrice: Number(order.total_amount || subtotal + deliveryFee),
                }
            })

            setOrders(formattedOrders)

            const todayStart = startOfDay(new Date()).toISOString()
            const dailyOrders = formattedOrders.filter((o: any) =>
                new Date(o.created_at).getTime() >= new Date(todayStart).getTime() &&
                o.status === 'paid'
            )
            const dailySpent = dailyOrders.reduce((acc: number, o: any) => acc + o.totalPrice, 0)

            const paidOrders = formattedOrders.filter((o: any) => o.status === 'paid')
            const totalSpent = paidOrders.reduce((acc: number, o: any) => acc + o.totalPrice, 0)
            const uniqueStores = new Set(paidOrders.map((o: any) => o.store_slug)).size

            setMetrics(prev => ({
                ...prev,
                daily: { spent: dailySpent, orders: dailyOrders.length },
                total: { spent: totalSpent, orders: paidOrders.length, stores: uniqueStores },
            }))

            // --- Dados para o gráfico de gastos diários ---
            const endDate = new Date()
            const startDate = spendingPeriod === '7days' ? subDays(endDate, 6) : subDays(endDate, 29)
            const startISO = startDate.toISOString()
            const endISO = endDate.toISOString()

            const { data: dailySpending } = await supabase
                .from('orders')
                .select('created_at, total_amount')
                .eq('buyer_id', profileId)
                .eq('status', 'paid')
                .gte('created_at', startISO)
                .lte('created_at', endISO)

            const dayMap = new Map<string, number>()
            let periodTotal = 0
            dailySpending?.forEach(order => {
                const day = format(new Date(order.created_at), 'yyyy-MM-dd')
                const amount = Number(order.total_amount) || 0
                dayMap.set(day, (dayMap.get(day) || 0) + amount)
                periodTotal += amount
            })
            setTotalPeriodSpent(periodTotal)

            const dateRange = eachDayOfInterval({ start: startDate, end: endDate })
            const chartData = dateRange.map(date => {
                const key = format(date, 'yyyy-MM-dd')
                return {
                    date: format(date, 'dd/MM'),
                    amount: dayMap.get(key) || 0,
                }
            })
            setDailySpendingData(chartData)

            const storeCounts = new Map<string, number>()
            ordersData.forEach((order: any) => {
                const storeData = Array.isArray(order.stores) ? order.stores[0] : order.stores
                if (storeData) {
                    const key = storeData.storeSlug
                    storeCounts.set(key, (storeCounts.get(key) || 0) + 1)
                }
            })

            if (storeCounts.size > 0) {
                const sortedStores = Array.from(storeCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)

                const favoriteStoresData = sortedStores.map(([slug, count]) => {
                    const order = ordersData.find((o: any) => {
                        const storeData = Array.isArray(o.stores) ? o.stores[0] : o.stores
                        return storeData?.storeSlug === slug
                    })

                    const storeData = order ? (Array.isArray(order.stores) ? order.stores[0] : order.stores) : null

                    let logoUrl = null
                    if (storeData?.logo_url) {
                        logoUrl = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                    }

                    const isOwned = userStoreSlugs.has(slug)

                    return {
                        name: storeData?.name || slug,
                        slug: slug,
                        logo_url: logoUrl,
                        orderCount: count,
                        isOwned,
                    }
                })

                setFavoriteStores(favoriteStoresData)
                setFavoriteStoresNotOwned(favoriteStoresData.filter(s => !s.isOwned))
            }
        }

        const { data: viewsData } = await supabase
            .from('product_views')
            .select(`
                product_id,
                created_at,
                products:product_id (
                    name,
                    price,
                    image_url,
                    slug,
                    stores:store_id (
                        name,
                        storeSlug
                    )
                )
            `)
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(10)

        if (viewsData) {
            const recentViewsData = viewsData.map((v: any) => {
                const productData = Array.isArray(v.products) ? v.products[0] : v.products
                const storeData = productData?.stores
                const storeInfo = Array.isArray(storeData) ? storeData[0] : storeData

                return {
                    product_name: productData?.name || 'Produto',
                    product_slug: productData?.slug || '',
                    price: productData?.price || 0,
                    image_url: productData?.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
                        : null,
                    store_name: storeInfo?.name || 'Loja',
                    store_slug: storeInfo?.storeSlug || '',
                    viewed_at: v.created_at,
                }
            })
            setRecentViews(recentViewsData)
        }

        const { data: reviewsData } = await supabase
            .from('product_reviews')
            .select(`
                id,
                rating,
                comment,
                created_at,
                products:product_id (
                    name,
                    slug,
                    stores:store_id (
                        name,
                        storeSlug
                    )
                )
            `)
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(10)

        if (reviewsData) {
            const formattedReviews = reviewsData.map((r: any) => {
                const productData = Array.isArray(r.products) ? r.products[0] : r.products
                const storeData = productData?.stores
                const storeInfo = Array.isArray(storeData) ? storeData[0] : storeData

                return {
                    id: r.id,
                    rating: r.rating,
                    comment: r.comment,
                    product_name: productData?.name || 'Produto',
                    product_slug: productData?.slug || '',
                    store_name: storeInfo?.name || 'Loja',
                    store_slug: storeInfo?.storeSlug || '',
                    created_at: r.created_at,
                }
            })
            setReviews(formattedReviews)
        }

        const now = new Date().toISOString()
        const { data: schedulesData } = await supabase
            .from('schedules')
            .select(`
                id,
                store_id,
                schedule_date,
                schedule_time,
                service_type,
                notes,
                status,
                stores:store_id (
                    name,
                    storeSlug,
                    logo_url
                )
            `)
            .eq('profile_id', profileId)
            .gte('schedule_date', now.split('T')[0])
            .order('schedule_date', { ascending: true })
            .limit(10)

        if (schedulesData) {
            const formattedSchedules = schedulesData.map((s: any) => {
                const storeData = Array.isArray(s.stores) ? s.stores[0] : s.stores

                let storeLogo = null
                if (storeData?.logo_url) {
                    storeLogo = supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                }

                return {
                    id: s.id,
                    store_name: storeData?.name || 'Loja',
                    store_slug: storeData?.storeSlug || '',
                    store_logo: storeLogo,
                    date: s.schedule_date,
                    time: s.schedule_time,
                    service_type: s.service_type,
                    notes: s.notes,
                    status: s.status,
                }
            })
            setUpcomingSchedules(formattedSchedules)
        }

        setLoading(false)
    }, [profileSlug, avatarUrl, spendingPeriod])

    useEffect(() => {
        if (!profile?.id) return
        const ordersChannel = supabase
            .channel(`painel-orders-${profile.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${profile.id}` },
                () => loadDashboard()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(ordersChannel)
            clearInterval(intervalRef.current)
        }
    }, [profile?.id, loadDashboard])

    useEffect(() => { loadDashboard() }, [loadDashboard, spendingPeriod])

    const goToPublicProfile = () => {
        if (profileSlug) {
            router.push(`/${profileSlug}`)
        }
    }

    const copyStoreLink = () => {
        if (profileSlug) {
            const url = `${window.location.origin}/${profileSlug}`
            navigator.clipboard.writeText(url)
            toast.success('Link copiado!')
        }
    }

    const formatStatus = (status: string) => {
        const statusMap: Record<string, { label: string; color: string }> = {
            pending: { label: 'Pendente', color: '#3b82f6' },
            preparing: { label: 'Preparando', color: '#f59e0b' },
            ready: { label: 'Pronto', color: '#8b5cf6' },
            in_transit: { label: 'Em trânsito', color: '#06b6d4' },
            delivered: { label: 'Entregue', color: '#22c55e' },
            paid: { label: 'Finalizado', color: '#10b981' },
            cancelled: { label: 'Cancelado', color: '#ef4444' },
        }
        return statusMap[status] || { label: status, color: '#6b7280' }
    }

    // Calcular máximo para o gráfico
    const maxAmount = Math.max(...dailySpendingData.map(d => d.amount), 1)

    // Função para agrupar dados de 30 dias em semanas
    const getWeeklyData = () => {
        const weeks: { week: string; days: { date: string; amount: number }[] }[] = []
        for (let i = 0; i < dailySpendingData.length; i += 7) {
            const weekData = dailySpendingData.slice(i, i + 7)
            const weekLabel = `${weekData[0]?.date || ''} - ${weekData[weekData.length - 1]?.date || ''}`
            weeks.push({ week: weekLabel, days: weekData })
        }
        return weeks
    }

    if (loading) return <LoadingSpinner message="Carregando perfil..." />
    if (!profile) return null

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
            {/* Header - Avatar e Nome clicáveis */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 cursor-pointer" onClick={goToPublicProfile}>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                        {profile.avatar_url ? (
                            <img src={profile.avatar_url} className="w-full h-full object-cover" alt={profile.name} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-bold" style={{ color: colors.textPrimary }}>
                                {profile.name?.charAt(0) || '@'}
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black hover:underline transition-all" style={{ color: colors.textPrimary }}>
                            {profile.name || `@${profileSlug}`}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
                            <span className={`w-2 h-2 rounded-full ${isProfileOpen ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-bold" style={{ color: isProfileOpen ? '#10b981' : '#ef4444' }}>
                                {isProfileOpen ? 'Aberto' : 'Fechado'}
                            </span>
                            <span>•</span>
                            <span className="font-medium">{profileStatusText}</span>
                            <span>•</span>
                            <span>@{profileSlug}</span>
                            {profile.whatsapp && (
                                <>
                                    <span>•</span>
                                    <Phone size={12} />
                                    <span>{profile.whatsapp}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== CARD DE AVISO - WHATSAPP ===== */}
            {showWhatsAppAlert && (
                <div className="mb-6 mt-4">
                    <div
                        className="rounded-2xl p-4 flex flex-col gap-3 relative"
                        style={{
                            background: `rgba(255, 165, 0, 0.08)`,
                            backdropFilter: 'blur(12px)',
                            border: `2px solid #f97316`,
                            boxShadow: `0 4px 20px rgba(249, 115, 22, 0.15)`,
                        }}
                    >
                        <div className="flex items-start gap-3">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: '#ffffff',
                                }}
                            >
                                <AlertCircle size={16} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-black" style={{ color: '#f97316' }}>
                                    Adicione seu WhatsApp
                                </h4>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    Receba pedidos e notificações diretamente
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                <input
                                    type="tel"
                                    className="w-full pl-8 pr-3 py-2 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                        border: `2px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                        '--tw-ring-color': '#f97316',
                                    } as React.CSSProperties}
                                    placeholder="(00) 00000-0000"
                                    value={whatsAppInput}
                                    onChange={(e) => setWhatsAppInput(e.target.value)}
                                    disabled={savingWhatsApp}
                                />
                            </div>
                            <button
                                onClick={handleSaveWhatsApp}
                                disabled={savingWhatsApp || !whatsAppInput.trim()}
                                className="px-4 py-2 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] disabled:opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: '#ffffff',
                                    boxShadow: `0 4px 12px #f9731640`,
                                }}
                            >
                                {savingWhatsApp ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
                            </button>
                        </div>

                        <button
                            onClick={() => setShowWhatsAppAlert(false)}
                            className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 transition-colors"
                            style={{ color: colors.textSecondary }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* ===== Botões do Perfil - PILL ===== */}
            <div className="mb-6 mt-4">
                <div className="flex gap-2">
                    <button
                        onClick={goToPublicProfile}
                        style={{
                            ...pillButtonFullStyle,
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                        }}
                        className="hover:scale-105 transition-transform"
                    >
                        <ExternalLink size={18} />
                        Perfil
                    </button>
                    <button
                        onClick={copyStoreLink}
                        style={{
                            ...pillButtonFullStyle,
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                        }}
                        className="hover:scale-105 transition-transform"
                    >
                        <Copy size={18} />
                        Copiar
                    </button>
                    <button
                        onClick={() => router.push(`/${profileSlug}/editar-perfil`)}
                        style={{
                            ...pillButtonFullStyle,
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 4px 12px #f9731640`,
                        }}
                        className="hover:scale-105 transition-transform"
                    >
                        <Pencil size={18} />
                        Editar
                    </button>
                </div>
            </div>

            {/* ===== CARD PRINCIPAL - GASTOS ===== */}
            <div className="mb-6">
                <div
                    className="rounded-2xl p-5"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    {/* Gastos Hoje - Destaque */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                }}
                            >
                                <DollarSign size={20} />
                            </div>
                            <div>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Gastos Hoje</p>
                                <p className="text-2xl font-black" style={{ color: '#f97316' }}>
                                    R$ {metrics.daily.spent.toFixed(2)}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                                {spendingPeriod === '7days' ? 'Últimos 7 dias' : 'Últimos 30 dias'}
                            </p>
                            <p className="text-xl font-black" style={{ color: '#10b981' }}>
                                R$ {totalPeriodSpent.toFixed(2)}
                            </p>
                        </div>
                    </div>

                    {/* Gráfico de gastos diários */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                <BarChart3 size={14} style={{ color: '#f97316' }} />
                                {spendingPeriod === '7days' ? 'Gastos de 7 dias' : 'Gastos de 30 dias'}
                            </div>
                            <div className="flex gap-1">
                                {(['7days', '30days'] as const).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setSpendingPeriod(p)}
                                        style={{
                                            ...pillButtonStyle,
                                            padding: '0.15rem 0.5rem',
                                            fontSize: '0.55rem',
                                            background: spendingPeriod === p ? GRADIENT : 'transparent',
                                            color: spendingPeriod === p ? '#ffffff' : colors.textSecondary,
                                            border: `1px solid ${spendingPeriod === p ? 'transparent' : colors.border}`,
                                        }}
                                        className="hover:scale-105 transition-transform"
                                    >
                                        {p === '7days' ? '7 dias' : '30 dias'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {spendingPeriod === '7days' ? (
                            // Gráfico de barras para 7 dias
                            <div className="flex items-end gap-1 h-16">
                                {dailySpendingData.map((item, idx) => {
                                    const height = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center">
                                            <div
                                                className="w-full rounded-t transition-all duration-300"
                                                style={{
                                                    height: `${Math.max(height, 2)}%`,
                                                    background: item.amount > 0 ? GRADIENT : `${'#f97316'}30`,
                                                    minHeight: item.amount > 0 ? '8px' : '4px',
                                                }}
                                            />
                                            <span className="text-[7px] mt-0.5" style={{ color: colors.textSecondary }}>
                                                {item.date}
                                            </span>
                                            {item.amount > 0 && (
                                                <span className="text-[7px] font-bold" style={{ color: '#f97316' }}>
                                                    R${item.amount.toFixed(0)}
                                                </span>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            // Grid para 30 dias (agrupado por semanas)
                            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                {getWeeklyData().map((week, weekIdx) => (
                                    <div key={weekIdx}>
                                        <p className="text-[8px] font-bold mb-1" style={{ color: colors.textSecondary }}>
                                            Semana {weekIdx + 1}: {week.week}
                                        </p>
                                        <div className="flex items-end gap-1">
                                            {week.days.map((day, dayIdx) => {
                                                const height = maxAmount > 0 ? (day.amount / maxAmount) * 100 : 0
                                                return (
                                                    <div key={dayIdx} className="flex-1 flex flex-col items-center">
                                                        <div
                                                            className="w-full rounded-t transition-all duration-300"
                                                            style={{
                                                                height: `${Math.max(height, 2)}%`,
                                                                background: day.amount > 0 ? GRADIENT : `${'#f97316'}30`,
                                                                minHeight: day.amount > 0 ? '8px' : '4px',
                                                            }}
                                                        />
                                                        <span className="text-[6px] mt-0.5" style={{ color: colors.textSecondary }}>
                                                            {day.date}
                                                        </span>
                                                        {day.amount > 0 && (
                                                            <span className="text-[6px] font-bold" style={{ color: '#f97316' }}>
                                                                R${day.amount.toFixed(0)}
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ===== TABS: Compras Recentes | Lojas Favoritas | Avaliações ===== */}
            <div className="mb-6">
                <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    {/* Tabs Header */}
                    <div className="flex border-b" style={{ borderColor: colors.border }}>
                        <button
                            onClick={() => setActiveTab('compras')}
                            className="flex-1 py-2.5 text-[10px] font-bold transition-all relative"
                            style={{
                                color: activeTab === 'compras' ? '#f97316' : colors.textSecondary,
                            }}
                        >
                            <div className="flex items-center justify-center gap-1.5">
                                <Package size={14} />
                                Compras
                                {orders.length > 0 && (
                                    <span
                                        className="px-1.5 py-0.5 rounded-full text-[8px]"
                                        style={{
                                            background: '#f9731620',
                                            color: '#f97316',
                                        }}
                                    >
                                        {orders.length}
                                    </span>
                                )}
                            </div>
                            {activeTab === 'compras' && (
                                <div
                                    className="absolute bottom-0 left-0 right-0 h-0.5"
                                    style={{ background: GRADIENT }}
                                />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('favoritas')}
                            className="flex-1 py-2.5 text-[10px] font-bold transition-all relative"
                            style={{
                                color: activeTab === 'favoritas' ? '#f97316' : colors.textSecondary,
                            }}
                        >
                            <div className="flex items-center justify-center gap-1.5">
                                <Heart size={14} />
                                Favoritas
                                {favoriteStoresNotOwned.length > 0 && (
                                    <span
                                        className="px-1.5 py-0.5 rounded-full text-[8px]"
                                        style={{
                                            background: '#22c55e20',
                                            color: '#22c55e',
                                        }}
                                    >
                                        {favoriteStoresNotOwned.length}
                                    </span>
                                )}
                            </div>
                            {activeTab === 'favoritas' && (
                                <div
                                    className="absolute bottom-0 left-0 right-0 h-0.5"
                                    style={{ background: GRADIENT }}
                                />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('avaliacoes')}
                            className="flex-1 py-2.5 text-[10px] font-bold transition-all relative"
                            style={{
                                color: activeTab === 'avaliacoes' ? '#f97316' : colors.textSecondary,
                            }}
                        >
                            <div className="flex items-center justify-center gap-1.5">
                                <Star size={14} />
                                Avaliações
                                {reviews.length > 0 && (
                                    <span
                                        className="px-1.5 py-0.5 rounded-full text-[8px]"
                                        style={{
                                            background: '#f59e0b20',
                                            color: '#f59e0b',
                                        }}
                                    >
                                        {reviews.length}
                                    </span>
                                )}
                            </div>
                            {activeTab === 'avaliacoes' && (
                                <div
                                    className="absolute bottom-0 left-0 right-0 h-0.5"
                                    style={{ background: GRADIENT }}
                                />
                            )}
                        </button>
                    </div>

                    {/* Conteúdo da Tab */}
                    <div className="p-4">
                        {activeTab === 'compras' ? (
                            orders.length === 0 ? (
                                <div className="py-8 text-center">
                                    <ShoppingCart size={32} style={{ color: colors.textSecondary, margin: '0 auto 8px' }} />
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                                        Nenhuma compra ainda
                                    </p>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        Suas compras aparecerão aqui
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {orders.slice(0, 10).map((order: any) => {
                                        const status = formatStatus(order.status)
                                        return (
                                            <div
                                                key={order.checkout_id}
                                                className="flex items-center justify-between p-2 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                    border: `1px solid ${colors.border}`,
                                                }}
                                                onClick={() => router.push(`/${profileSlug}/${order.store_slug}`)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                                                        {order.store_logo ? (
                                                            <img src={order.store_logo} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                                                                {order.store_name?.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                            {order.store_name}
                                                        </p>
                                                        <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                            {order.items?.length || 0} itens • R$ {order.totalPrice.toFixed(2)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-[8px] font-bold flex-shrink-0"
                                                    style={{ background: `${status.color}20`, color: status.color }}
                                                >
                                                    {status.label}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        ) : activeTab === 'favoritas' ? (
                            favoriteStoresNotOwned.length === 0 ? (
                                <div className="py-8 text-center">
                                    <Heart size={32} style={{ color: colors.textSecondary, margin: '0 auto 8px' }} />
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                                        Nenhuma loja favorita
                                    </p>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        Suas lojas favoritas aparecerão aqui
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-3">
                                    {favoriteStoresNotOwned.map((store: any, idx: number) => (
                                        <div
                                            key={idx}
                                            className="text-center cursor-pointer hover:scale-105 transition-transform p-2 rounded-xl"
                                            style={{
                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                border: `1px solid ${colors.border}`,
                                            }}
                                            onClick={() => router.push(`/${profileSlug}/${store.slug}`)}
                                        >
                                            <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 mx-auto mb-1 relative">
                                                {store.logo_url ? (
                                                    <img src={store.logo_url} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xl font-bold">
                                                        {store.name?.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] font-bold truncate" style={{ color: colors.textPrimary }}>
                                                {store.name}
                                            </p>
                                            <p className="text-[8px]" style={{ color: colors.textSecondary }}>
                                                {store.orderCount} pedidos
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : (
                            reviews.length === 0 ? (
                                <div className="py-8 text-center">
                                    <Star size={32} style={{ color: colors.textSecondary, margin: '0 auto 8px' }} />
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                                        Nenhuma avaliação ainda
                                    </p>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        Suas avaliações aparecerão aqui
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {reviews.map((review: any) => (
                                        <div
                                            key={review.id}
                                            className="p-2 rounded-xl"
                                            style={{
                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                border: `1px solid ${colors.border}`,
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {review.product_name}
                                                </p>
                                                <RatingStars value={review.rating} size={10} />
                                            </div>
                                            <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                {review.store_name}
                                            </p>
                                            {review.comment && (
                                                <p className="text-[10px] mt-0.5" style={{ color: colors.textPrimary }}>
                                                    "{review.comment}"
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* ===== Informações do Perfil ===== */}
            <StoreAddress address={profile.address} whatsapp={profile.whatsapp} />

            {/* ===== Agendamentos ===== */}
            <AtalhoCompromissosPessoal
                profileSlug={profileSlug}
                userAvatarUrl={profile.avatar_url}
            />

            {/* ===== Dias de funcionamento ===== */}
            <ProfileOperatingDays profileId={profile.id} />

            {/* ===== Publicações ===== */}
            <PublicationProfile
                profileId={profile.id}
                profileSlug={profileSlug || ''}
            />

            {/* ===== SISTEMA DE COMISSÕES ===== */}
            {profile && (
                <div className="mb-6">
                    <Commission userId={profile.id} />
                </div>
            )}

            {/* ===== Visitantes ===== */}
            <ProfileVisitors key={profile.id} profileId={profile.id} />

            {/* ===== Produtos Visualizados ===== */}
            {recentViews.length > 0 && (
                <div className="mb-6">
                    <div
                        className="rounded-2xl p-5"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            backdropFilter: 'blur(12px)',
                            border: `1px solid ${colors.border}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <Eye size={18} style={{ color: '#f97316' }} />
                            <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                Vistos Recentemente
                            </h3>
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {recentViews.map((view: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="flex-shrink-0 w-28 rounded-xl p-2 cursor-pointer hover:scale-105 transition-transform"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px solid ${colors.border}`,
                                    }}
                                    onClick={() => router.push(`/${profileSlug}/${view.store_slug}/${view.product_slug}`)}
                                >
                                    <div className="w-full h-16 rounded-lg overflow-hidden bg-gray-100 mb-1">
                                        {view.image_url ? (
                                            <img src={view.image_url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                                        )}
                                    </div>
                                    <p className="text-[9px] font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {view.product_name}
                                    </p>
                                    <p className="text-[8px]" style={{ color: colors.textSecondary }}>
                                        R$ {Number(view.price).toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Agendamentos Futuros ===== */}
            {upcomingSchedules.length > 0 && (
                <div className="mb-6">
                    <div
                        className="rounded-2xl p-5"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            backdropFilter: 'blur(12px)',
                            border: `1px solid ${colors.border}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <Calendar size={18} style={{ color: '#f97316' }} />
                            <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                Próximos Agendamentos
                            </h3>
                        </div>

                        <div className="space-y-2">
                            {upcomingSchedules.slice(0, 5).map((schedule: any) => (
                                <div
                                    key={schedule.id}
                                    className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                        border: `1px solid ${colors.border}`,
                                    }}
                                    onClick={() => router.push(`/${profileSlug}/${schedule.store_slug}`)}
                                >
                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                                        {schedule.store_logo ? (
                                            <img src={schedule.store_logo} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                                                {schedule.store_name?.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {schedule.store_name}
                                        </p>
                                        <p className="text-[9px]" style={{ color: colors.textSecondary }}>
                                            {new Date(schedule.date).toLocaleDateString('pt-BR')} às {schedule.time}
                                        </p>
                                    </div>
                                    <span
                                        className="px-2 py-0.5 rounded-full text-[8px] font-bold"
                                        style={{
                                            background: schedule.status === 'confirmed' ? '#22c55e20' : '#f59e0b20',
                                            color: schedule.status === 'confirmed' ? '#22c55e' : '#f59e0b',
                                        }}
                                    >
                                        {schedule.status === 'confirmed' ? '✓' : '⏳'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Ações rápidas ===== */}
            <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                    onClick={goToPublicProfile}
                    style={{
                        ...pillButtonFullStyle,
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                    }}
                    className="hover:opacity-70 transition-opacity"
                >
                    <User size={16} /> Ver Perfil
                </button>
                <button
                    onClick={() => router.push(`/${profileSlug}/configuracoes`)}
                    style={{
                        ...pillButtonFullStyle,
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                    }}
                    className="hover:opacity-70 transition-opacity"
                >
                    <Settings size={16} /> Config
                </button>
            </div>

            {/* ===== SACOLA + HOME ===== */}
            <div style={{ position: 'fixed', bottom: 32, right: 24, display: 'flex', gap: 12, zIndex: 998 }}>
                <SacolaButton
                    totalItems={totalCartItems}
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
                    onClick={onBack}
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                    style={{
                        background: GRADIENT,
                        color: '#ffffff',
                        border: `2px solid #f97316`,
                        boxShadow: `0 8px 24px #f9731660`,
                    }}
                    aria-label="Voltar ao início"
                >
                    <Home size={24} />
                </button>
            </div>
        </div>
    )
}