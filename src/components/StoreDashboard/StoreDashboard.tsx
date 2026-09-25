// app/(main)/StoreDashboard.tsx
'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import { handleShareLink } from '@/lib/share'
import {
    Settings,
    RefreshCw,
    DollarSign,
    Store as StoreIcon,
    Copy,
    ExternalLink,
    Clock,
    Eye,
    Store,
    TrendingUp,
    TrendingDown,
} from 'lucide-react'
import Employee from './Employee'
import ButtonInPersonSale from './ButtonInPersonSale'
import Publication from './StorePublication'
import StoreCatalog from './StoreCatalog'
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
import StoreWhatsAppBot from './StoreWhatsAppBot'

import { isStoreOpenNow, getStoreStatusWithLunch, getNextOpeningInfo } from '@/lib/storeHours'
import StoreSchedule from '@/components/StoreSchedule'
import { StoreDescription } from './StoreDescription'
import { checkSlugAvailability } from '@/lib/slugUtils'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const ROUTE_COLORS = ['#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#eab308']

function startOfDay(date: Date = new Date()): string {
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
}

// Semana atual (domingo a sábado) e mês atual (do dia 1 em diante): os cartões
// de Vendas mostram o período em curso, não "os últimos N dias".
function startOfCurrentWeek(): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - d.getDay())
    return d.toISOString()
}

function startOfCurrentMonth(): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(1)
    return d.toISOString()
}

const CURRENT_MONTH_LABEL = () => {
    const name = new Date().toLocaleDateString('pt-BR', { month: 'long' })
    return name.charAt(0).toUpperCase() + name.slice(1)
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
    onDialogOpenChange,
}: {
    profileSlug: string
    storeSlug: string
    onBack?: () => void
    onOrderCountsChange?: (counts: { pending: number; preparing: number; ready: number }) => void
    /** Avisa quando um dialog (extrato, excluir loja) abre/fecha, pra esconder os botões flutuantes da página. */
    onDialogOpenChange?: (open: boolean) => void
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

    useEffect(() => {
        onDialogOpenChange?.(!!extractPeriod || showDeleteStore)
    }, [extractPeriod, showDeleteStore, onDialogOpenChange])
    useEffect(() => () => onDialogOpenChange?.(false), [onDialogOpenChange])
    const [products, setProducts] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [employeeRoutes, setEmployeeRoutes] = useState<any[]>([])
    const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)
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
            weekly: bucket(startOfCurrentWeek()),
            monthly: bucket(startOfCurrentMonth()),
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

    // Recarrega só os funcionários (sem refazer o resto do dashboard) -
    // Employee.tsx chama isso depois de adicionar/editar/remover, senão a
    // lista mostrada ali fica presa no que foi carregado na abertura da
    // página (o "Atribuir pedidos" parece atualizado só porque StoreOrders
    // tem sua própria busca de funcionários, independente desta).
    const loadEmployees = useCallback(async () => {
        if (!store?.id) return
        const { data } = await supabase.from('employees').select('*').eq('store_id', store.id).eq('is_active', true)
        setEmployees(data || [])
    }, [store?.id])

    // O que cada funcionário está com entregas atribuídas - mostrado embaixo
    // do nome dele em "Funcionários" (contagem por status) e no quadro
    // completo ao expandir (a fazer / fazendo agora / concluídas hoje). O
    // que já foi entregue só entra se foi hoje, pra não acumular histórico
    // pra sempre.
    const loadEmployeeRoutes = useCallback(async () => {
        if (!store?.id) return

        const { data: assignments, error: assignError } = await supabase
            .from('delivery_assignments')
            .select('employee_id, checkout_id, sequence_order, status, picked_up_at, delivered_at')
            .eq('store_id', store.id)
            .order('sequence_order')

        if (assignError) {
            console.error('[StoreDashboard] Erro ao buscar atribuições de entrega:', assignError)
            return
        }
        if (!assignments || assignments.length === 0) {
            setEmployeeRoutes([])
            return
        }

        // Filtra "entregue" pra só contar o de hoje (evita acumular
        // histórico pra sempre) - feito aqui no client pra não depender de
        // sintaxe de filtro combinado (.or()) que pode variar entre versões.
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const relevant = assignments.filter(
            (a) => a.status !== 'delivered' || (a.delivered_at && new Date(a.delivered_at) >= startOfToday)
        )
        if (relevant.length === 0) {
            setEmployeeRoutes([])
            return
        }

        const checkoutIds = [...new Set(relevant.map((a) => a.checkout_id))]
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('checkout_id, delivery_lat, delivery_lng, delivery_address, payment_method, total_amount, delivery_fee, order_items(product_name, quantity)')
            .in('checkout_id', checkoutIds)
        if (ordersError) {
            console.error('[StoreDashboard] Erro ao buscar pedidos das rotas:', ordersError)
        }
        const ordersMap = new Map((orders || []).map((o) => [o.checkout_id, o]))

        const byEmployee = new Map<string, any[]>()
        relevant.forEach((a) => {
            const order = ordersMap.get(a.checkout_id)
            if (!byEmployee.has(a.employee_id)) byEmployee.set(a.employee_id, [])
            byEmployee.get(a.employee_id)!.push({
                lat: order?.delivery_lat ?? null,
                lng: order?.delivery_lng ?? null,
                label: String(a.sequence_order),
                address: order?.delivery_address || '',
                status: a.status,
                pickedUpAt: a.picked_up_at,
                deliveredAt: a.delivered_at,
                payment_method: order?.payment_method || '',
                total_amount: order?.total_amount || 0,
                delivery_fee: order?.delivery_fee || 0,
                items: (order?.order_items || []).map((i: any) => ({ product_name: i.product_name, quantity: i.quantity })),
            })
        })

        const routes = Array.from(byEmployee.entries()).map(([eid, stops], idx) => {
            const emp = employees.find((e) => e.id === eid)
            return {
                employeeId: eid,
                employeeName: emp?.name || 'Entregador',
                color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
                stops,
            }
        })
        setEmployeeRoutes(routes)
    }, [store?.id, employees])

    useEffect(() => { loadEmployeeRoutes() }, [loadEmployeeRoutes])

    // Atualiza sozinho quando um pedido é atribuído/reatribuído na aba de
    // Pedidos (StoreOrders), sem precisar trocar de aba pra ver o reflexo.
    useEffect(() => {
        if (!store?.id) return
        const channel = supabase
            .channel(`store-dashboard-assignments-${store.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'delivery_assignments', filter: `store_id=eq.${store.id}` },
                () => loadEmployeeRoutes()
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [store?.id, loadEmployeeRoutes])

    // Atualiza sozinho quando um funcionário é adicionado/editado/removido -
    // não depende só do onRefresh do próprio diálogo (cobre também qualquer
    // outra aba/dispositivo mexendo na mesma loja ao mesmo tempo).
    useEffect(() => {
        if (!store?.id) return
        const channel = supabase
            .channel(`store-dashboard-employees-${store.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'employees', filter: `store_id=eq.${store.id}` },
                () => loadEmployees()
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [store?.id, loadEmployees])

    const goToPublicStore = () => {
        if (storeSlug) {
            router.push(`/${storeSlug}`)
        }
    }

    const shareStoreLink = () => {
        if (!storeSlug) return
        const url = `${window.location.origin}/${storeSlug}`
        handleShareLink({
            title: store?.name ? `${store.name} | iUser` : 'iUser',
            text: `Confira ${store?.name || 'minha loja'} no iUser!`,
            url,
        })
    }

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
                        onClick={shareStoreLink}
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
                            { label: CURRENT_MONTH_LABEL(), period: 'monthly' as const, data: metrics.monthly },
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

            {/* ===== Produtos e Serviços da Loja ===== */}
            <StoreCatalog storeId={store.id} storeSlug={storeSlug} kind="product" />
            <StoreCatalog storeId={store.id} storeSlug={storeSlug} kind="service" />


            {/* ===== Configurações de Entrega ===== */}
            <div className="mb-6">
                <StoreDeliverySettings
                    storeId={store.id}
                    onRefresh={loadDashboard}
                />
            </div>

            {/* ===== Atendimento automático por WhatsApp ===== */}
            <div className="mb-6">
                <StoreWhatsAppBot storeId={store.id} />
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
                    employeeRoutes={employeeRoutes}
                    assignmentMap={new Map()}
                    expandedEmployee={expandedEmployee}
                    onToggleExpand={setExpandedEmployee}
                    storeId={store.id}
                    storeName={store.name}
                    onRefresh={loadEmployees}
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