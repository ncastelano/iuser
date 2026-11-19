// app/(main)/StoreDashboard.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'

import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'
import { handleShareLink } from '@/lib/share'
import Employee from './Employee'
import Publication from './StorePublication'
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog'
import DriverDebtBanner from '@/components/DriverDebtBanner'
import { useProfile } from '@/app/contexts/ProfileContext'
import { callAdminApi } from '@/lib/callAdminApi'
import StoreClubVip from './StoreClubVip'
import StoreSalesExtractDialog, { type ExtractPeriod } from './StoreSalesExtractDialog'
import StoreDashboardSkeleton from './StoreDashboardSkeleton'
import StoreOperatingDays from './StoreOperatingDays'
import StoreDepositEditor from './StoreDepositEditor'
import StoreDeliverySettings from './StoreDeliverySettings'
import StoreFavoriteDrivers from './StoreFavoriteDrivers'
import StorePromotions from './StorePromotions'
import StorePaymentMethods from './StorePaymentMethods'
import StoreWhatsAppBot from './StoreWhatsAppBot'
import PainelLoja from './painel/PainelLoja'
import EditarHub from './painel/EditarHub'
import { parseStoreModel } from '@/lib/storeModel'
import type { PaidOrder } from './painel/SalesChart'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { StoreDescription } from './StoreDescription'
import { checkSlugAvailability } from '@/lib/slugUtils'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import StoreSellerInfo from './StoreSellerInfo'
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

export default function StoreDashboard({
    profileSlug,
    storeSlug,
    onBack,
    onOrderCountsChange,
    onDialogOpenChange,
    infoFirst = false,
    showDebtBanner = true,
    previewLogo,
    previewName,
    view,
}: {
    profileSlug: string
    storeSlug: string
    onBack?: () => void
    onOrderCountsChange?: (counts: { pending: number; preparing: number; ready: number }) => void
    /** Avisa quando um dialog (extrato, excluir loja) abre/fecha, pra esconder os botões flutuantes da página. */
    onDialogOpenChange?: (open: boolean) => void
    /** "Informações da Loja" logo no topo (antes dos pedidos) */
    infoFirst?: boolean
    /** Aviso do pós-pago (valor acumulado) no topo */
    showDebtBanner?: boolean
    /** Logo e nome que a página já conhece: o esqueleto de carregamento (3.0) já mostra em "Informações da loja" */
    previewLogo?: string | null
    previewName?: string | null
    /** `painel`: o "comando do dia" da loja (/painel-loja/<slug>) · `editar`: informações e preferências (/editar-loja/<slug>) */
    view: 'painel' | 'editar'
}) {
    const { colors } = useTheme()

    const { userId } = useProfile()
    // Atendimento automático por WhatsApp: escondido, a menos que o administrador ligue (Admin → WhatsApp Bot)
    const showWhatsAppBot = useFeatureFlag('store_whatsapp_bot')
    const [store, setStore] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    const [metrics, setMetrics] = useState({
        daily: { revenue: 0, orders: 0 },
        weekly: { revenue: 0, orders: 0 },
        monthly: { revenue: 0, orders: 0 },
    })
    const [showDeleteStore, setShowDeleteStore] = useState(false)
    const [extractPeriod, setExtractPeriod] = useState<ExtractPeriod | null>(null)
    const [paidOrders, setPaidOrders] = useState<PaidOrder[]>([])          // pedidos pagos do mês (o gráfico do painel 3.0)

    useEffect(() => {
        onDialogOpenChange?.(!!extractPeriod || showDeleteStore)
    }, [extractPeriod, showDeleteStore, onDialogOpenChange])
    useEffect(() => () => onDialogOpenChange?.(false), [onDialogOpenChange])
    const [, setProducts] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [employeeRoutes, setEmployeeRoutes] = useState<any[]>([])
    const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)

    // ===== ESTADO PARA StoreDescription =====
    const [isStoreDescriptionExpanded, setIsStoreDescriptionExpanded] = usePersistedExpanded('storeDescription', true)
    const [savingDescription, setSavingDescription] = useState(false)

    // ===== ESTADOS PARA StoreDescription =====
    const [name, setName] = useState('')
    const [storeSlugState, setStoreSlugState] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('') // <-- ADICIONADO
    const [preview, setPreview] = useState<string | null>(null)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

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
        try { await loadDashboardInner() } catch (e) { console.error('[painel da loja]', e) } finally { setLoading(false) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeSlug, profileSlug])

    const loadDashboardInner = async () => {

        const { data: storeData } = await supabase.from('my_stores').select('*').ilike('storeSlug', storeSlug).maybeSingle()
        if (!storeData) { toast.error('Loja não encontrada'); setLoading(false); return }

        const logoUrl = storeData.logo_url ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl : null
        // "Quem vende" (migration 082): colunas públicas que a visão my_stores não traz — só para o estado do atalho no Editar loja
        const { data: seller } = await supabase.from('stores').select('seller_name, seller_doc_public').eq('id', storeData.id).maybeSingle()
        setStore({ ...storeData, ...(seller || {}), logo_url: logoUrl })

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
        // Só os PAGOS desde o começo do mês (ou da semana, se ela começou no mês anterior): o banco devolve no máximo 1.000 linhas por
        // consulta, e ler todos os pedidos da loja deixava as vendas recentes de fora numa loja com muitos pedidos.
        const since = [startOfCurrentMonth(), startOfCurrentWeek()].sort()[0]
        const { data: ordersData } = await supabase
            .from('orders')
            .select('total_amount, status, created_at')
            .eq('store_id', storeId)
            .eq('status', 'paid')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(5000)

        const paidOrders = (ordersData || []).filter(o => o.status === 'paid')
        setPaidOrders(paidOrders.map(o => ({ amount: Number(o.total_amount || 0), at: o.created_at as string })))
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
            // Uma consulta só, pelo vínculo com o pedido: antes ia a lista de TODOS os pedidos pagos no endereço (`in.(...)`) e, numa loja com
            // muitos pedidos, o endereço passava do limite, a consulta falhava e o painel ficava carregando para sempre.
            const salesCountMap = new Map()
            const { data: orderItemsSales } = await supabase
                .from('order_items')
                .select('product_id, quantity, orders!inner(store_id, status)')
                .eq('orders.store_id', storeId)
                .eq('orders.status', 'paid')
                .in('product_id', productIds)
            orderItemsSales?.forEach((s: any) => {
                salesCountMap.set(s.product_id, (salesCountMap.get(s.product_id) || 0) + (s.quantity || 1))
            })

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
    }

    useEffect(() => { loadDashboard() }, [loadDashboard])

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

        // Reforço: independente do realtime disparar ou não (depende de a
        // tabela estar habilitada na publicação supabase_realtime, algo que
        // já causou esse mesmo problema antes), recarrega sozinho de tempos
        // em tempos - a seção nunca fica presa indefinidamente numa
        // atribuição feita em outra aba.
        const poll = setInterval(loadEmployeeRoutes, 20000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(poll)
        }
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

    const shareStoreLink = () => {
        if (!storeSlug) return
        const url = `${window.location.origin}/${storeSlug}`
        handleShareLink({
            title: store?.name ? `${store.name} | iUser` : 'iUser',
            text: `Confira ${store?.name || 'minha loja'} no iUser!`,
            url,
        })
    }

    // 3.0: esqueleto com a forma do painel (e a logo da loja, quando a página já sabe); 2.0 mantém o "Carregando"
    if (loading && true) return <StoreDashboardSkeleton logo={previewLogo} name={previewName} slug={storeSlug} />
    if (loading) return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
            <div className="text-center">
                <Spinner size={48} color={colors.accent} className="mx-auto mb-4" />
                <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Carregando painel...</p>
            </div>
        </div>
    )
    if (!store) return null

    // "Informações da Loja" — pode subir pro topo (painel da loja) ou ficar no meio, como sempre
    const descriptionNode = (
        <>
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
                        chatEnabled: store.chat_enabled === true,
                        mutualReviews: store.mutual_reviews === true,
                    }}
                    onShowWhatsappChange={(show) => setStore((prev: any) => ({ ...prev, show_whatsapp: show }))}
                    onChatEnabledChange={(enabled) => setStore((prev: any) => ({ ...prev, chat_enabled: enabled }))}
                    onMutualReviewsChange={(enabled) => setStore((prev: any) => ({ ...prev, mutual_reviews: enabled }))}
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
        </>
    )

    // ===== PAINEL DA 3.0 (/painel-loja/<slug>): o "comando do dia" aprovado no laboratório /painel-teste, com os dados de verdade =====
    if (view === 'painel') return (
        <div className="w-full px-4 md:px-6 pb-28">
            {showDebtBanner && <DriverDebtBanner userId={userId} />}
            <PainelLoja store={store} storeSlug={storeSlug} profileSlug={profileSlug} userId={userId} metrics={metrics} paidOrders={paidOrders}
                onOpenExtract={setExtractPeriod} onShare={shareStoreLink} onOrderCountsChange={onOrderCountsChange} onSaleCompleted={() => { loadDashboardInner().catch(() => {}) }} />
            {extractPeriod && <StoreSalesExtractDialog storeId={store.id} storeName={store.name} period={extractPeriod} onClose={() => setExtractPeriod(null)} />}
        </div>
    )

    // ===== EDITAR LOJA DA 3.0 (/editar-loja/<slug>): a central agrupada do laboratório, com folhas e páginas que reaproveitam os blocos de sempre =====
    const mdl = parseStoreModel(store.store_model)
    const hasServices = mdl === 'services' || mdl === 'mixed' || !!store.allow_scheduling
    return (
        <div className="w-full px-4 md:px-6 pb-28">
            <EditarHub store={store} storeSlug={storeSlug} hasServices={hasServices} whatsapp={showWhatsAppBot}
                onShare={shareStoreLink} onDelete={() => setShowDeleteStore(true)} onStoreChange={(p) => setStore((prev: any) => ({ ...prev, ...p }))}
                blocos={{
                    dados: descriptionNode,
                    vendedor: <StoreSellerInfo storeId={store.id} onSaved={loadDashboard} />,
                    horarios: <StoreOperatingDays storeId={store.id} />,
                    regras: <StoreDepositEditor storeId={store.id} />,
                    entrega: <><StoreDeliverySettings storeId={store.id} onRefresh={loadDashboard} /><div className="mt-4"><StoreFavoriteDrivers storeId={store.id} v3 /></div></>,
                    pagamento: <StorePaymentMethods storeId={store.id} onRefresh={loadDashboard} />,
                    clube: <StoreClubVip storeId={store.id} />,
                    whatsapp: showWhatsAppBot ? <StoreWhatsAppBot storeId={store.id} /> : null,
                    equipe: <Employee employees={employees} employeeRoutes={employeeRoutes} assignmentMap={new Map()} expandedEmployee={expandedEmployee} onToggleExpand={setExpandedEmployee} storeId={store.id} storeName={store.name} onRefresh={loadEmployees} />,
                    publicacoes: <Publication storeId={store.id} />,
                    promocoes: <StorePromotions storeId={store.id} />,
                }} />
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
        </div>
    )
}
