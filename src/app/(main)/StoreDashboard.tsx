// app/(main)/StoreDashboard.tsx
'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
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
} from 'lucide-react'
import Employee from './Employee'
import ButtonInPersonSale from './ButtonInPersonSale'
import Publication from './StorePublication'
import StoreVisitors from './StoreVisitors'
import StoreOperatingDays from './StoreOperatingDays'
import StoreAddress from './StoreAddress'
import AtalhoCompromissosDaLoja from './compromissos/AtalhoCompromissosDaLoja'
import StoreOrders from './StoreOrders'
import StoreDeliverySettings from './StoreDeliverySettings'
import StorePaymentMethods from './StorePaymentMethods'

import { isStoreOpenNow, getStoreStatusWithLunch, getNextOpeningInfo } from '@/lib/storeHours'
import StoreSchedule from './StoreSchedule'
import { StoreDescription } from './StoreDesciption'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function startOfDay(date: Date = new Date()): string {
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
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

    const [store, setStore] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const [metrics, setMetrics] = useState({ daily: { revenue: 0, orders: 0 } })
    const [products, setProducts] = useState<any[]>([])
    const [sortBy, setSortBy] = useState<'mostSold' | 'leastSold' | 'mostExpensive' | 'cheapest'>('mostSold')
    const [employees, setEmployees] = useState<any[]>([])
    const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)
    const [isProductsExpanded, setIsProductsExpanded] = useState(false)
    const [showScheduleModal, setShowScheduleModal] = useState(false)

    // ===== ESTADO PARA StoreDescription =====
    const [isStoreDescriptionExpanded, setIsStoreDescriptionExpanded] = useState(false)
    const [savingDescription, setSavingDescription] = useState(false)

    // ===== ESTADOS PARA StoreDescription =====
    const [name, setName] = useState('')
    const [storeSlugState, setStoreSlugState] = useState('')
    const [description, setDescription] = useState('')
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

    // ===== FUNÇÃO PARA NAVEGAR PARA EDITAR LOJA (via StoreDescription) =====
    const handleEditStore = () => {
        router.push(`/${storeSlug}/editar-loja`)
    }

    // ===== VERIFICAÇÃO DE SLUG ÚNICO =====
    useEffect(() => {
        if (!storeSlugState || storeSlugState === storeSlug) {
            setSlugStatus('idle')
            return
        }
        const check = async () => {
            setSlugStatus('checking')
            const { data } = await supabase.from('stores').select('id').eq('storeSlug', storeSlugState).neq('id', store?.id).limit(1).maybeSingle()
            setSlugStatus(data ? 'taken' : 'available')
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
            setPreview(store.logo_url || null)
        }
        setImageFile(null)
        setIsStoreDescriptionExpanded(false)
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
        setPreview(logoUrl)

        const storeId = storeData.id

        // Buscar métricas de vendas do dia
        const todayStart = startOfDay()
        const { data: ordersData } = await supabase
            .from('orders')
            .select('total_amount, status, created_at')
            .eq('store_id', storeId)

        const dailyOrders = (ordersData || []).filter(o =>
            new Date(o.created_at).getTime() >= new Date(todayStart).getTime() &&
            o.status === 'paid'
        )
        const dailyRev = dailyOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
        setMetrics({ daily: { revenue: dailyRev, orders: dailyOrders.length } })

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

            const { data: orderIdsData } = await supabase
                .from('orders')
                .select('id')
                .eq('store_id', storeId)
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

    if (loading) return <LoadingSpinner message="Carregando painel..." />
    if (!store) return null

    return (
        <div className="px-4 pb-28 max-w-2xl mx-auto w-full">
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

            {/* Header com status */}
            <div className="flex items-center justify-between mb-6">
                <div
                    onClick={onBack}
                    className="flex items-center gap-3 hover:opacity-70 transition cursor-pointer"
                    style={{ color: colors.textPrimary }}
                >
                    <div
                        className={`w-12 h-12 rounded-full overflow-hidden bg-gray-200 ${isStoreOpen ? 'ring-2 ring-green-500' : 'ring-2 ring-red-500'}`}
                    >
                        {store.logo_url ? <img src={store.logo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl font-bold">{store.name?.charAt(0)}</div>}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>{store.name}</h2>
                        <div
                            onClick={(e) => {
                                e.stopPropagation()
                                if (store.business_hours && Object.keys(store.business_hours).length > 0) {
                                    setShowScheduleModal(true)
                                }
                            }}
                            className="flex items-center gap-1 text-xs font-bold hover:underline cursor-pointer w-fit"
                            style={{ color: isStoreOpen ? '#22c55e' : '#ef4444' }}
                        >
                            <Clock size={12} />
                            <span>{statusText}</span>
                        </div>
                    </div>
                </div>
                <button onClick={handleRefresh} className="p-2 rounded-full" style={{ background: 'transparent', border: `1px solid ${colors.border}` }}>
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* ===== STORE DESCRIPTION COMPONENT ===== */}
            <div className="mb-6 mt-4">
                <StoreDescription
                    name={name}
                    storeSlug={storeSlugState}
                    description={description}
                    preview={preview}
                    onNameChange={setName}
                    onSlugChange={setStoreSlugState}
                    onDescriptionChange={setDescription}
                    onImageChange={(file) => setImageFile(file)}
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
            <div className="mb-6 mt-4">
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
            <div className="mb-6 mt-4">
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
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Vendas Hoje
                            </h3>
                            <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                <span className="text-2xl font-black" style={{ color: '#f97316' }}>
                                    R$ {metrics.daily.revenue.toFixed(2)}
                                </span>
                                <span>•</span>
                                <span>
                                    <span className="font-bold" style={{ color: '#10b981' }}>
                                        {metrics.daily.orders}
                                    </span>{' '}
                                    pedidos finalizados
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== Venda Presencial ===== */}
            <div className="mb-6 mt-4">
                <ButtonInPersonSale
                    storeId={store.id}
                    storeName={store.name}
                    storeSlug={storeSlug}
                    profileSlug={profileSlug}
                    onSaleCompleted={() => loadDashboard()}
                />
            </div>

            {/* ===== StoreOrders ===== */}
            <div className="mb-6 mt-4">
                <StoreOrders
                    storeId={store.id}
                    storeName={store.name}
                    onOrderCountsChange={onOrderCountsChange}
                />
            </div>

            {/* ===== Produtos ===== */}
            <div className="mb-6 mt-4">
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
                                                        router.push(`/${storeSlug}/${prod.slug || prod.id}/editar-produto`)
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
                                                        <span>🛒 {prod.inCart} na sacola</span>
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
            <div className="mb-6 mt-4">
                <StoreDeliverySettings
                    storeId={store.id}
                    onRefresh={loadDashboard}
                />
            </div>

            {/* ===== Formas de Pagamento ===== */}
            <div className="mb-6 mt-4">
                <StorePaymentMethods
                    storeId={store.id}
                    onRefresh={loadDashboard}
                />
            </div>

            {/* ===== Funcionários ===== */}
            <div className="mb-6 mt-4">
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

            {/* ===== Informações da Loja ===== */}
            <StoreAddress address={store.address} whatsapp={store.whatsapp} />

            {/* ===== Agendamentos ===== */}
            <AtalhoCompromissosDaLoja profileSlug={profileSlug} />

            {/* ===== Dias de funcionamento ===== */}
            <StoreOperatingDays storeId={store.id} />

            {/* ===== Publicações ===== */}
            <Publication storeId={store.id} />

            {/* ===== Visitantes ===== */}
            <StoreVisitors storeId={store.id} />


        </div>
    )
}