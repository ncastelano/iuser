// app/(main)/StoreDashboard.tsx
'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import {
    Settings,
    Plus,
    RefreshCw,
    DollarSign,
    Package,
    ArrowUpDown,
    Pencil,
    Store as StoreIcon,
    Copy,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    Clock,
    Eye,
    Store,
    TrendingUp,
    TrendingDown,
} from 'lucide-react'
import Employee from './Employee'
import ButtonInPersonSale from './ButtonInPersonSale'
import Publication from './StorePublication'
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog'
import DriverDebtBanner from '@/components/DriverDebtBanner'
import { useProfile } from '@/app/contexts/ProfileContext'
import { callAdminApi } from '@/lib/callAdminApi'
import StoreClubVip from './StoreClubVip'
import StoreSalesExtractDialog, { type ExtractPeriod } from './StoreSalesExtractDialog'
import StoreVisitors from './StoreVisitors'
import StoreOperatingDays from './StoreOperatingDays'
import AtalhoCompromissosDaLoja from '@/app/(main)/compromissos/AtalhoCompromissosDaLoja'
import StoreOrders from './StoreOrders'
import StoreDeliverySettings from './StoreDeliverySettings'
import StorePaymentMethods from './StorePaymentMethods'

import { isStoreOpenNow, getStoreStatusWithLunch, getNextOpeningInfo } from '@/lib/storeHours'
import StoreSchedule from '@/components/StoreSchedule'
import { StoreDescription } from './StoreDescription'
import { checkSlugAvailability } from '@/lib/slugUtils'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function startOfDay(date: Date = new Date()): string {
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
}

function startOfPeriod(daysAgo: number): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString()
}

const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
}

const pillButtonFullStyle = {
    ...pillButtonStyle,
    flex: 1,
}

export default function StoreDashboard({
    profileSlug,
    storeSlug,
    onBack,
    onOrderCountsChange,
}: {
    profileSlug: string
    storeSlug: string
    onBack?: () => void
    onOrderCountsChange?: (counts: { pending: number; preparing: number; ready: number }) => void
}) {
    const router = useRouter()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const { userId } = useProfile()
    const [store, setStore] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const [metrics, setMetrics] = useState({
        daily: { revenue: 0, orders: 0 },
        weekly: { revenue: 0, orders: 0 },
        monthly: { revenue: 0, orders: 0 },
    })
    const [showDeleteStore, setShowDeleteStore] = useState(false)
    const [extractPeriod, setExtractPeriod] = useState<ExtractPeriod | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [sortBy, setSortBy] = useState<'mostSold' | 'leastSold' | 'mostExpensive' | 'cheapest'>('mostSold')
    const [employees, setEmployees] = useState<any[]>([])
    const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)
    const [isProductsExpanded, setIsProductsExpanded] = useState(true)
    const [showScheduleModal, setShowScheduleModal] = useState(false)

    // ===== ESTADO PARA StoreDescription =====
    const [isStoreDescriptionExpanded, setIsStoreDescriptionExpanded] = useState(true)
    const [savingDescription, setSavingDescription] = useState(false)

    // ===== ESTADOS PARA StoreDescription =====
    const [name, setName] = useState('')
    const [storeSlugState, setStoreSlugState] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('') // <-- ADICIONADO
    const [preview, setPreview] = useState<string | null>(null)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

    const intervalRef = useRef<any>(null)

    const isStoreOpen = useMemo(() => {
        if (!store) return false
        return isStoreOpenNow(store.business_hours)
    }, [store])

    const statusText = useMemo(() => {
        if (!store) return ''
        const status = getStoreStatusWithLunch(store.business_hours)
        return status.text
    }, [store])

    // ===== FUNÇÃO PARA NAVEGAR PARA EDITAR PERFIL =====
    const handleEditProfile = () => {
        router.push(`/${profileSlug}/editar-perfil`)
    }

    // ===== VERIFICAÇÃO DE SLUG ÚNICO GLOBAL =====
    useEffect(() => {
        if (!storeSlugState || storeSlugState === storeSlug) {
            setSlugStatus('idle')
            return
        }
        const check = async () => {
            setSlugStatus('checking')
            const result = await checkSlugAvailability(storeSlugState, { excludeStoreId: store?.id, skipProductCheck: true })
            setSlugStatus(result.available ? 'available' : 'taken')
        }
        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [storeSlugState, storeSlug, store?.id])

    // ===== SALVAR DESCRIÇÃO =====
    const handleSaveDescription = async () => {
        if (!store?.id || !name.trim() || !storeSlugState.trim()) {
            toast.error('Preencha todos os campos obrigatórios')
            return
        }
        if (slugStatus === 'taken') {
            toast.error('O endereço da loja já está em uso')
            return
        }

        setSavingDescription(true)

        try {
            let logoPath: string | undefined = undefined
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data, error } = await supabase.storage.from('store-logos').upload(fileName, imageFile)
                if (!error && data) logoPath = data.path
            }

            const updateData: any = {
                name: name.trim(),
                storeSlug: storeSlugState.trim(),
                description: description.trim() || null,
                category: category || null, // <-- ADICIONADO
            }

            if (logoPath) updateData.logo_url = logoPath

            const { error } = await supabase
                .from('stores')
                .update(updateData)
                .eq('id', store.id)

            if (error) {
                toast.error('Erro ao salvar: ' + error.message)
                setSavingDescription(false)
                return
            }

            toast.success('Informações da loja atualizadas!')

            // Atualiza a store local
            setStore((prev: any) => ({
                ...prev,
                ...updateData,
                logo_url: logoPath ? supabase.storage.from('store-logos').getPublicUrl(logoPath).data.publicUrl : prev.logo_url,
            }))

            // Limpa o arquivo de imagem
            setImageFile(null)

            if (logoPath) {
                const newPreview = supabase.storage.from('store-logos').getPublicUrl(logoPath).data.publicUrl
                setPreview(newPreview)
            }

            // Recarrega o dashboard
            loadDashboard()

        } catch (err: any) {
            toast.error('Erro inesperado: ' + err.message)
        } finally {
            setSavingDescription(false)
        }
    }

    // ===== CANCELAR EDIÇÃO DA DESCRIÇÃO =====
    const handleCancelDescription = () => {
        // Restaura os valores do store
        if (store) {
            setName(store.name || '')
            setStoreSlugState(store.storeSlug || '')
            setDescription(store.description || '')
            setCategory(store.category || '') // <-- ADICIONADO
            setPreview(store.logo_url || null)
        }
        setImageFile(null)
        setIsStoreDescriptionExpanded(true)
        setSlugStatus('idle')
    }

    const loadDashboard = useCallback(async () => {
        if (!storeSlug || !profileSlug) return
        setLoading(true)

        const { data: storeData } = await supabase.from('stores').select('*').ilike('storeSlug', storeSlug).maybeSingle()
        if (!storeData) { toast.error('Loja não encontrada'); setLoading(false); return }

        const logoUrl = storeData.logo_url ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl : null
        setStore({ ...storeData, logo_url: logoUrl })

        // Atualiza os estados do StoreDescription
        setName(storeData.name || '')
        setStoreSlugState(storeData.storeSlug || '')
        setDescription(storeData.description || '')
        setCategory(storeData.category || '') // <-- ADICIONADO
        setPreview(logoUrl)

        const storeId = storeData.id

        // Buscar métricas de vendas (hoje/semana/mês) — uma query só, os 3
        // baldes são filtrados no cliente em cima do mesmo resultado.
        const todayStart = startOfDay()
        const { data: ordersData } = await supabase
            .from('orders')
            .select('total_amount, status, created_at')
            .eq('store_id', storeId)

        const paidOrders = (ordersData || []).filter(o => o.status === 'paid')
        const bucket = (sinceISO: string) => {
            const orders = paidOrders.filter(o => new Date(o.created_at).getTime() >= new Date(sinceISO).getTime())
            return { revenue: orders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0), orders: orders.length }
        }
        setMetrics({
            daily: bucket(todayStart),
            weekly: bucket(startOfPeriod(7)),
            monthly: bucket(startOfPeriod(30)),
        })

        // Buscar produtos
        const { data: productsData } = await supabase
            .from('products')
            .select('id, name, price, image_url, slug')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })
            .limit(12)

        if (productsData && productsData.length > 0) {
            const productIds = productsData.map(p => p.id)
            const todayStartISO = startOfDay()

            const { data: viewsToday } = await supabase.from('product_views')
                .select('product_id').in('product_id', productIds).gte('created_at', todayStartISO)
            const viewsTodayMap = new Map()
            viewsToday?.forEach(v => viewsTodayMap.set(v.product_id, (viewsTodayMap.get(v.product_id) || 0) + 1))

            const { data: viewsTotal } = await supabase.from('product_views')
                .select('product_id').in('product_id', productIds)
            const viewsTotalMap = new Map()
            viewsTotal?.forEach(v => viewsTotalMap.set(v.product_id, (viewsTotalMap.get(v.product_id) || 0) + 1))

            // Só pedido pago conta como "vendido" — antes essa contagem
            // incluía pendente/cancelado, o que inflava "mais vendido"
            // com pedido que nunca virou venda de verdade.
            const { data: orderIdsData } = await supabase
                .from('orders')
                .select('id')
                .eq('store_id', storeId)
                .eq('status', 'paid')
            const orderIds = orderIdsData?.map(o => o.id) || []
            const salesCountMap = new Map()
            if (orderIds.length > 0) {
                const { data: orderItemsSales } = await supabase
                    .from('order_items')
                    .select('product_id, quantity')
                    .in('order_id', orderIds)
                    .in('product_id', productIds)
                orderItemsSales?.forEach(s => {
                    salesCountMap.set(s.product_id, (salesCountMap.get(s.product_id) || 0) + (s.quantity || 1))
                })
            }

            const combined = productsData.map(p => ({
                ...p,
                viewsToday: viewsTodayMap.get(p.id) || 0,
                viewsTotal: viewsTotalMap.get(p.id) || 0,
                inCart: 0,
                salesCount: salesCountMap.get(p.id) || 0,
            }))
            setProducts(combined)
        } else {
            setProducts([])
        }

        // Buscar funcionários
        const { data: empData } = await supabase.from('employees').select('*').eq('store_id', storeId).eq('is_active', true)
        setEmployees(empData || [])

        setLoading(false)
    }, [storeSlug, profileSlug])

    useEffect(() => { loadDashboard() }, [loadDashboard])

    const handleRefresh = () => { setRefreshing(true); loadDashboard().finally(() => setRefreshing(false)) }

    const goToPublicStore = () => {
        if (storeSlug) {
            router.push(`/${storeSlug}`)
        }
    }

    const copyStoreLink = () => {
        if (storeSlug) {
            const url = `${window.location.origin}/${storeSlug}`
            navigator.clipboard.writeText(url)
            toast.success('Link copiado!')
        }
    }

    const sortedProducts = [...products].sort((a, b) => {
        switch (sortBy) {
            case 'mostSold': return b.salesCount - a.salesCount
            case 'leastSold': return a.salesCount - b.salesCount
            case 'mostExpensive': return b.price - a.price
            case 'cheapest': return a.price - b.price
            default: return 0
        }
    })

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
            <div className="text-center">
                <Spinner size={48} color={colors.accent} className="mx-auto mb-4" />
                <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Carregando painel...</p>
            </div>
        </div>
    )
    if (!store) return null

    return (
        <div className="w-full px-4 md:px-6 pb-28">
            {/* ===== MODAL DE HORÁRIOS ===== */}
            {showScheduleModal && store && (
                <div
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowScheduleModal(false)}
                >
                    <div
                        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <StoreSchedule
                            storeId={store.id}
                            storeName={store.name}
                            storeSlug={store.storeSlug}
                            onClose={() => setShowScheduleModal(false)}
                            onSuccess={loadDashboard}
                        />
                    </div>
                </div>
            )}

            <DriverDebtBanner userId={userId} />

            {/* ===== StoreOrders NO TOPO - é a primeira coisa que a loja precisa ver ===== */}
            <div className="mb-6">
                <StoreOrders
                    storeId={store.id}
                    storeName={store.name}
                    onOrderCountsChange={onOrderCountsChange}
                />
            </div>

            {/* ===== Venda Presencial (logo abaixo dos Pedidos) ===== */}
            <div className="mb-6">
                <ButtonInPersonSale
                    storeId={store.id}
                    storeName={store.name}
                    storeSlug={storeSlug}
                    profileSlug={profileSlug}
                    onSaleCompleted={() => loadDashboard()}
                />
            </div>

            {/* ===== STORE OPERATING DAYS ===== */}
            <div className="mb-4">
                <StoreOperatingDays storeId={store.id} />
            </div>

            {/* ===== STORE DESCRIPTION COMPONENT ===== */}
            <div className="mb-6">


                <StoreDescription
                    location={{
                        storeId: store.id,
                        address: store.address ?? null,
                        addressNumber: store.address_number ?? null,
                        addressComplement: store.address_complement ?? null,
                        lat: store.store_lat ?? null,
                        lng: store.store_lng ?? null,
                        whatsapp: store.whatsapp ?? null,
                        showWhatsapp: store.show_whatsapp ?? true,
                    }}
                    onShowWhatsappChange={(show) => setStore((prev: any) => ({ ...prev, show_whatsapp: show }))}
                    onLocationSaved={(loc) => setStore((prev: any) => ({
                        ...prev,
                        address: loc.address,
                        address_number: loc.addressNumber || null,
                        address_complement: loc.addressComplement || null,
                        store_lat: loc.lat,
                        store_lng: loc.lng,
                    }))}
                    name={name}
                    storeSlug={storeSlugState}
                    description={description}
                    preview={preview}
                    category={category}
                    onNameChange={setName}
                    onSlugChange={setStoreSlugState}
                    onDescriptionChange={setDescription}
                    onCategoryChange={(cat: string) => setCategory(cat)}
                    onImageChange={(file: File) => setImageFile(file)}
                    slugStatus={slugStatus}
                    disabled={savingDescription}
                    isExpanded={isStoreDescriptionExpanded}
                    onToggleExpand={() => setIsStoreDescriptionExpanded(!isStoreDescriptionExpanded)}
                    onSave={handleSaveDescription}
                    onCancel={handleCancelDescription}
                    saving={savingDescription}
                />
            </div>

            {/* ===== Botões da Loja ===== */}
            <div className="mb-6">
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={goToPublicStore}
                        style={{
                            ...pillButtonFullStyle,
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 4px 12px #f9731640`,
                        }}
                        className="hover:scale-105 transition-transform"
                    >
                        <Store size={18} />
                        Ver minha Loja
                    </button>
                    <button
                        onClick={copyStoreLink}
                        style={{
                            ...pillButtonFullStyle,
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 4px 12px #f9731640`,
                        }}
                        className="hover:scale-105 transition-transform"
                    >
                        <Copy size={18} />
                        Compartilhar Link
                    </button>

                </div>
            </div>

            {/* ===== Vendas do dia ===== */}
            <div className="mb-6">
                <div
                    className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                        >
                            <DollarSign size={24} />
                        </div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                            Vendas
                        </h3>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { label: 'Hoje', period: 'daily' as const, data: metrics.daily },
                            { label: 'Semana', period: 'weekly' as const, data: metrics.weekly },
                            { label: 'Mês', period: 'monthly' as const, data: metrics.monthly },
                        ]).map(({ label, period, data }) => (
                            <button
                                key={label}
                                onClick={() => setExtractPeriod(period)}
                                className="rounded-xl p-3 text-center transition-transform hover:scale-[1.03] active:scale-95"
                                style={{ background: `${colors.border}20` }}
                            >
                                <p className="text-lg font-black" style={{ color: '#f97316' }}>R$ {data.revenue.toFixed(2)}</p>
                                <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                    <span className="font-bold" style={{ color: '#10b981' }}>{data.orders}</span> pedido{data.orders !== 1 ? 's' : ''}
                                </p>
                                <p className="text-[9px] uppercase font-bold mt-1" style={{ color: colors.textSecondary }}>{label}</p>
                            </button>
                        ))}
                    </div>

                    {products.length > 0 && (() => {
                        const withSales = products.filter(p => p.salesCount > 0)
                        const best = withSales.length > 0 ? [...withSales].sort((a, b) => b.salesCount - a.salesCount)[0] : null
                        const worst = withSales.length > 1 ? [...withSales].sort((a, b) => a.salesCount - b.salesCount)[0] : null
                        if (!best) return null
                        return (
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl p-3" style={{ background: '#22c55e15', border: '1px solid #22c55e40' }}>
                                    <p className="text-[9px] uppercase font-bold flex items-center gap-1" style={{ color: '#22c55e' }}>
                                        <TrendingUp size={11} /> Mais vendido
                                    </p>
                                    <p className="text-xs font-bold truncate mt-1" style={{ color: colors.textPrimary }}>{best.name}</p>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>{best.salesCount} vendido{best.salesCount !== 1 ? 's' : ''}</p>
                                </div>
                                {worst && (
                                    <div className="rounded-xl p-3" style={{ background: '#ef444415', border: '1px solid #ef444440' }}>
                                        <p className="text-[9px] uppercase font-bold flex items-center gap-1" style={{ color: '#ef4444' }}>
                                            <TrendingDown size={11} /> Menos vendido
                                        </p>
                                        <p className="text-xs font-bold truncate mt-1" style={{ color: colors.textPrimary }}>{worst.name}</p>
                                        <p className="text-[10px]" style={{ color: colors.textSecondary }}>{worst.salesCount} vendido{worst.salesCount !== 1 ? 's' : ''}</p>
                                    </div>
                                )}
                            </div>
                        )
                    })()}
                </div>
            </div>

            {/* ===== Produtos ===== */}
            <div className="mb-6">
                <div
                    className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    <button
                        onClick={() => setIsProductsExpanded(!isProductsExpanded)}
                        className="w-full flex items-center justify-between text-left"
                        style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '9999px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                }}
                            >
                                <Package size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    Produtos
                                </h3>
                                <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                    <span>{products.length} cadastrados</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {products.length > 0 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                    {products.length}
                                </span>
                            )}
                            {isProductsExpanded ? (
                                <ChevronUp size={22} style={{ color: colors.textSecondary }} />
                            ) : (
                                <ChevronDown size={22} style={{ color: colors.textSecondary }} />
                            )}
                        </div>
                    </button>

                    {isProductsExpanded && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 text-xs" style={{ color: colors.textSecondary }}>
                                        <ArrowUpDown size={14} />
                                        <select
                                            value={sortBy}
                                            onChange={e => setSortBy(e.target.value as any)}
                                            className="bg-transparent border rounded-full px-3 py-1 text-xs"
                                            style={{ borderColor: colors.border, color: colors.textPrimary }}
                                        >
                                            <option value="mostSold">Mais vendidos</option>
                                            <option value="leastSold">Menos vendidos</option>
                                            <option value="mostExpensive">Mais caro</option>
                                            <option value="cheapest">Mais barato</option>
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(`/${storeSlug}/criar-produto`)}
                                    style={{
                                        ...pillButtonStyle,
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 12px #f9731640`,
                                    }}
                                    className="hover:scale-105 transition-transform"
                                >
                                    <Plus size={14} /> Adicionar
                                </button>
                            </div>

                            {products.length === 0 ? (
                                <div
                                    className="rounded-xl p-6 text-center"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px dashed ${colors.border}`,
                                    }}
                                >
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                                        Nenhum produto cadastrado.
                                    </p>
                                    <button
                                        onClick={() => router.push(`/${storeSlug}/criar-produto`)}
                                        style={{
                                            ...pillButtonStyle,
                                            background: GRADIENT,
                                            color: '#ffffff',
                                        }}
                                        className="mx-auto hover:opacity-80 transition-opacity"
                                    >
                                        <Plus size={14} /> Criar primeiro produto
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-400">
                                    {sortedProducts.map(prod => {
                                        const imgUrl = prod.image_url ? supabase.storage.from('product-images').getPublicUrl(prod.image_url).data.publicUrl : null
                                        return (
                                            <div
                                                key={prod.id}
                                                className="flex-shrink-0 w-40 rounded-2xl border p-3 flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow relative"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, borderColor: colors.border }}
                                                onClick={() => router.push(`/${storeSlug}/${prod.slug || prod.id}`)}
                                            >
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        router.push(`/${storeSlug}/${prod.slug || prod.id}/editar`)
                                                    }}
                                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-colors z-10"
                                                    title="Editar produto"
                                                >
                                                    <Pencil size={14} color="white" />
                                                </button>

                                                <div className="w-full h-28 rounded-xl overflow-hidden bg-gray-100">
                                                    {imgUrl ? <img src={imgUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: colors.textSecondary }}>📦</div>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{prod.name}</p>
                                                    <p className="text-xs font-bold mt-1" style={{ color: '#f97316' }}>R$ {Number(prod.price).toFixed(2)}</p>
                                                    <div className="flex flex-col text-[10px] mt-1 space-y-0.5" style={{ color: colors.textSecondary }}>
                                                        <span>👁 {prod.viewsToday} hoje</span>
                                                        <span>🛒 {prod.inCart} no carrinho</span>
                                                        <span>📊 {prod.viewsTotal} views</span>
                                                        <span>💰 {prod.salesCount} vendas</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ===== Configurações de Entrega ===== */}
            <div className="mb-6">
                <StoreDeliverySettings
                    storeId={store.id}
                    onRefresh={loadDashboard}
                />
            </div>

            {/* ===== Formas de Pagamento ===== */}
            <div className="mb-6">
                <StorePaymentMethods
                    storeId={store.id}
                    onRefresh={loadDashboard}
                />
            </div>

            {/* ===== Funcionários ===== */}
            <div className="mb-6">
                <Employee
                    employees={employees}
                    employeeRoutes={[]}
                    assignmentMap={new Map()}
                    expandedEmployee={expandedEmployee}
                    onToggleExpand={setExpandedEmployee}
                    storeId={store.id}
                    onRefresh={() => { }}
                />
            </div>

            {/* ===== Agendamentos ===== */}
            <AtalhoCompromissosDaLoja profileSlug={profileSlug} />

            {/* ===== Publicações ===== */}
            <Publication storeId={store.id} />

            {/* ===== Club VIP ===== */}
            <StoreClubVip storeId={store.id} />

            {/* ===== Visitantes ===== */}
            <StoreVisitors storeId={store.id} />

            {/* ===== Excluir loja (no final, mesmo design do Excluir conta) ===== */}
            <button
                onClick={() => setShowDeleteStore(true)}
                style={{
                    ...pillButtonFullStyle,
                    background: 'transparent',
                    color: '#ef4444',
                    border: '1px solid #ef444460',
                    width: '100%',
                }}
                className="hover:scale-105 transition-transform active:scale-95"
            >
                Excluir loja
            </button>

            {showDeleteStore && (
                <DeleteConfirmDialog
                    title={`Excluir ${store.name}`}
                    description="Isso apaga a loja, produtos, pedidos, publicações e tudo o que está ligado a ela. Não dá pra desfazer."
                    confirmLabel="Excluir loja"
                    onConfirm={async (password) => {
                        await callAdminApi('/api/stores/delete', { storeId: store.id, password })
                        window.location.href = `/${profileSlug}`
                    }}
                    onClose={() => setShowDeleteStore(false)}
                />
            )}

            {extractPeriod && (
                <StoreSalesExtractDialog
                    storeId={store.id}
                    storeName={store.name}
                    period={extractPeriod}
                    onClose={() => setExtractPeriod(null)}
                />
            )}
        </div>
    )
}