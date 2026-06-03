'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
    TrendingUp,
    ArrowUpRight,
    Pencil,
    ChevronRight,
    Clock,
    Store as StoreIcon,
    Package,
    CheckCircle2,
    Eye,
    Plus,
    Save,
    Clock3,
    X
} from 'lucide-react'
import { Store, Sale, GroupedOrder } from '../types'
import { OrderModal } from './OrderModal'

interface StoreFlowProps {
    store: Store
    sales: Sale[]
    supabase: any
    onToggleStatus: () => void
    profile: any
    onUpdateOrder: () => void
    onAddProduct?: () => void
    onEditStore?: () => void
    onToggleScheduling?: () => void
    storeViews?: number
    productViews?: number
    onUpdateStore?: (updatedFields: Partial<Store>) => void
}

interface Visitor {
    id: string
    viewer_id: string
    created_at: string
    profiles: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
}

const DAYS_OF_WEEK = [
    { key: 'mon', label: 'Segunda' },
    { key: 'tue', label: 'Terça' },
    { key: 'wed', label: 'Quarta' },
    { key: 'thu', label: 'Quinta' },
    { key: 'fri', label: 'Sexta' },
    { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' },
]

// Horários comuns para sugestão rápida
const COMMON_HOURS = [
    '06:00', '07:00', '08:00', '09:00', '10:00',
    '11:00', '12:00', '13:00', '14:00', '15:00',
    '16:00', '17:00', '18:00', '19:00', '20:00',
    '21:00', '22:00', '23:00', '00:00'
]

export function StoreFlow({
    store,
    sales,
    supabase,
    onToggleStatus,
    profile,
    onUpdateOrder,
    onAddProduct,
    onEditStore,
    onToggleScheduling,
    storeViews,
    productViews,
    onUpdateStore
}: StoreFlowProps) {
    const [selectedOrder, setSelectedOrder] = useState<GroupedOrder | null>(null)

    // Visitantes recentes
    const [visitors, setVisitors] = useState<Visitor[]>([])

    // Horários de funcionamento (por dia)
    const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string }>>(
        store.business_hours || {}
    )
    const [savingSchedule, setSavingSchedule] = useState(false)
    const [showScheduleEditor, setShowScheduleEditor] = useState(false)

    // Controle de personalização para cada dia (mostrar input time)
    const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({})
    const [customClose, setCustomClose] = useState<Record<string, boolean>>({})

    // Sincroniza se a loja mudar (e.g. id diferente)
    const [prevStoreId, setPrevStoreId] = useState(store.id)
    if (store.id !== prevStoreId) {
        setPrevStoreId(store.id)
        setBusinessHours(store.business_hours || {})
    }

    useEffect(() => {
        if (!store?.id) return

        supabase
            .from('store_views')
            .select('id, viewer_id, created_at, profiles(id, avatar_url, name, profileSlug)')
            .eq('store_id', store.id)
            .order('created_at', { ascending: false })
            .limit(50)
            .then(({ data }: { data: any[] }) => {
                if (data) {
                    const uniqueMap = new Map<string, Visitor>()
                    data.forEach((item: any) => {
                        if (item.viewer_id && !uniqueMap.has(item.viewer_id)) {
                            uniqueMap.set(item.viewer_id, {
                                ...item,
                                profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
                            })
                        }
                    })
                    const uniqueVisitors = Array.from(uniqueMap.values()).slice(0, 5)
                    setVisitors(uniqueVisitors)
                }
            })
    }, [store?.id, supabase])

    const handleSaveSchedule = async () => {
        // Validação: horário de abertura não pode ser maior ou igual ao de fechamento
        for (const day of DAYS_OF_WEEK) {
            const { open, close } = businessHours[day.key] || { open: '', close: '' }
            if (open && close && open >= close) {
                toast.error(`Horário inválido para ${day.label}.`)
                return
            }
        }

        setSavingSchedule(true)
        const { error } = await supabase
            .from('stores')
            .update({ business_hours: businessHours })
            .eq('id', store.id)
        if (error) {
            toast.error('Erro ao salvar horários.')
        } else {
            toast.success('Horários salvos com sucesso!')
            setShowScheduleEditor(false)
            if (onUpdateStore) {
                onUpdateStore({ business_hours: businessHours })
            }
        }
        setSavingSchedule(false)
    }

    // Atualiza o horário de abertura ou fechamento para um dia
    const setTimeForDay = (day: string, type: 'open' | 'close', value: string) => {
        setBusinessHours(prev => ({
            ...prev,
            [day]: {
                ...(prev[day] || { open: '', close: '' }),
                [type]: value
            }
        }))
    }

    // Limpa os horários do dia (marca como fechado)
    const clearDay = (day: string) => {
        setBusinessHours(prev => {
            const newHours = { ...prev }
            delete newHours[day]
            return newHours
        })
        setCustomOpen(prev => ({ ...prev, [day]: false }))
        setCustomClose(prev => ({ ...prev, [day]: false }))
    }

    // Alterna a exibição do input time personalizado
    const toggleCustom = (day: string, type: 'open' | 'close') => {
        if (type === 'open') {
            setCustomOpen(prev => ({ ...prev, [day]: !prev[day] }))
        } else {
            setCustomClose(prev => ({ ...prev, [day]: !prev[day] }))
        }
    }

    const groupedOrders = useMemo(() => {
        const groups: Record<string, GroupedOrder> = {}
        sales.forEach(s => {
            if (!groups[s.checkout_id]) {
                groups[s.checkout_id] = {
                    checkout_id: s.checkout_id,
                    buyer_name: s.buyer_name,
                    buyer_profile_slug: s.buyer_profile_slug,
                    created_at: s.created_at,
                    status: s.status,
                    items: [],
                    totalPrice: 0
                }
            }
            groups[s.checkout_id].items.push(s)
            groups[s.checkout_id].totalPrice += s.price
        })
        return Object.values(groups).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
    }, [sales])

    const invites = groupedOrders.filter(o => o.status === 'pending')
    const inPreparo = groupedOrders.filter(o => o.status === 'preparing')
    const forReady = groupedOrders.filter(o => o.status === 'ready')
    const accepted = groupedOrders.filter(o => o.status === 'paid')

    const metrics = useMemo(() => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const filterByDate = (start: number) =>
            sales.filter(
                s =>
                    new Date(s.created_at).getTime() >= start &&
                    (s.status === 'paid' || s.status === 'ready' || s.status === 'preparing')
            )
        const daily = filterByDate(today)
        const calcTotal = (list: Sale[]) => list.reduce((acc, s) => acc + s.price, 0)
        const calcOrders = (list: Sale[]) => new Set(list.map(d => d.checkout_id)).size
        const dailyRev = calcTotal(daily)
        const dailyOrd = calcOrders(daily)
        return {
            daily: {
                revenue: dailyRev,
                orders: dailyOrd,
                avgTicket: dailyOrd > 0 ? dailyRev / dailyOrd : 0
            },
            total: {
                revenue: calcTotal(sales.filter(s => s.status === 'paid')),
                orders: calcOrders(sales.filter(s => s.status === 'paid'))
            }
        }
    }, [sales])

    const topItems = useMemo(() => {
        const counts: Record<string, { count: number; total: number }> = {}
        sales
            .filter(s => s.status === 'paid' || s.status === 'ready')
            .forEach(s => {
                if (!counts[s.product_name]) counts[s.product_name] = { count: 0, total: 0 }
                counts[s.product_name].count += s.quantity
                counts[s.product_name].total += s.price
            })
        return Object.entries(counts)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 3)
    }, [sales])

    const handleAction = async (status: string) => {
        if (!selectedOrder) return

        const { error: salesError } = await supabase
            .from('store_sales')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)

        const { error: ordersError } = await supabase
            .from('orders')
            .update({ status })
            .eq('checkout_id', selectedOrder.checkout_id)

        if (!salesError && !ordersError) {
            setSelectedOrder(null)
            onUpdateOrder()
            toast.success(
                `Pedido ${status === 'preparing'
                    ? 'aceito'
                    : status === 'ready'
                        ? 'marcado como pronto'
                        : 'finalizado'
                }!`
            )
        } else {
            toast.error('Erro ao atualizar pedido')
        }
    }

    const storeUrl = `/${profile?.profileSlug}/${store.storeSlug}`

    return (
        <div className="border-b border-orange-100 last:border-b-0 py-6">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between mb-6">
                <Link href={storeUrl} className="flex items-center gap-4 group">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center overflow-hidden group-hover:shadow-lg transition-all">
                            {store.logo_url ? (
                                <img
                                    src={
                                        supabase.storage
                                            .from('store-logos')
                                            .getPublicUrl(store.logo_url).data.publicUrl
                                    }
                                    className="w-full h-full object-cover"
                                    alt={store.name}
                                />
                            ) : (
                                <StoreIcon className="w-7 h-7 text-orange-500" />
                            )}
                        </div>
                        <div
                            className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${store.is_open ? 'bg-green-500' : 'bg-gray-400'
                                }`}
                        />
                    </div>
                    <div>
                        <h3 className="text-xl font-black italic uppercase tracking-tighter text-gray-900 group-hover:text-orange-600 transition-colors">
                            {store.name}
                        </h3>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider group-hover:text-orange-500 transition-colors">
                            @{store.storeSlug}
                        </p>
                    </div>
                </Link>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onToggleStatus}
                        className={`px-4 py-2 rounded-full font-black uppercase text-[10px] tracking-wider transition-all ${store.is_open
                            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white'
                            : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-lg'
                            }`}
                    >
                        {store.is_open ? 'Fechar Loja' : 'Abrir Loja'}
                    </button>

                    {onEditStore && (
                        <button
                            onClick={onEditStore}
                            className="p-2 bg-orange-50 rounded-full hover:bg-orange-100 transition-all"
                        >
                            <Pencil size={16} className="text-orange-600" />
                        </button>
                    )}

                    <Link
                        href={storeUrl}
                        className="p-2 bg-gradient-to-r from-orange-500 to-red-500 rounded-full hover:shadow-lg transition-all"
                        title="Visitar loja"
                    >
                        <ArrowUpRight size={16} className="text-white" />
                    </Link>
                </div>
            </div>

            {/* AÇÕES ADMINISTRATIVAS */}
            {(onAddProduct || onToggleScheduling) && (
                <div className="flex flex-wrap gap-2 mb-6">
                    {onAddProduct && (
                        <button
                            onClick={onAddProduct}
                            className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-black text-[10px] uppercase shadow-md"
                        >
                            <Plus size={14} className="inline mr-1" /> Produto
                        </button>
                    )}
                    {onToggleScheduling && (
                        <button
                            onClick={onToggleScheduling}
                            className={`flex-1 py-2 rounded-full font-black text-[10px] uppercase border ${store.allow_scheduling
                                ? 'bg-red-50 text-red-600 border-red-200'
                                : 'bg-green-50 text-green-600 border-green-200'
                                }`}
                        >
                            {store.allow_scheduling ? 'Bloquear Agend.' : 'Permitir Agend.'}
                        </button>
                    )}
                </div>
            )}

            {/* MÉTRICAS DE VISITA */}
            {(storeViews !== undefined || productViews !== undefined) && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                    {storeViews !== undefined && (
                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                            <Eye size={18} className="text-orange-500 mb-1" />
                            <p className="text-2xl font-black text-gray-900">{storeViews}</p>
                            <p className="text-[9px] font-black uppercase text-gray-500">
                                Visitas na loja
                            </p>
                            {visitors.length > 0 && (
                                <div className="flex items-center gap-1 mt-2">
                                    {visitors.slice(0, 5).map((v, i) => (
                                        <Link
                                            key={v.id}
                                            href={
                                                v.profiles?.profileSlug
                                                    ? `/${v.profiles.profileSlug}`
                                                    : '#'
                                            }
                                            className="w-6 h-6 rounded-full overflow-hidden border border-white shadow-sm"
                                            title={v.profiles?.name || 'Visitante'}
                                        >
                                            {v.profiles?.avatar_url ? (
                                                <img
                                                    src={
                                                        v.profiles.avatar_url.startsWith('http')
                                                            ? v.profiles.avatar_url
                                                            : supabase.storage
                                                                .from('avatars')
                                                                .getPublicUrl(v.profiles.avatar_url)
                                                                .data.publicUrl
                                                    }
                                                    className="w-full h-full object-cover"
                                                    alt=""
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">
                                                    {v.profiles?.name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </Link>
                                    ))}
                                    {visitors.length > 5 && (
                                        <span className="text-[9px] font-bold text-gray-500 ml-1">
                                            +{visitors.length - 5}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {productViews !== undefined && (
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                            <Eye size={18} className="text-red-500 mb-1" />
                            <p className="text-2xl font-black text-gray-900">{productViews}</p>
                            <p className="text-[9px] font-black uppercase text-gray-500">
                                Visitas em produtos
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* NOVOS CARDS DE MÉTRICAS: Hoje + Visitantes */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Card Hoje (link para loja) */}
                <Link href={storeUrl} className="block">
                    <div className="bg-white/50 rounded-xl p-4 border border-orange-100 hover:border-orange-300 transition-all h-full">
                        <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                            Hoje
                        </p>
                        <p className="text-2xl font-black italic text-gray-900 mt-1">
                            R${' '}
                            {metrics.daily.revenue.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2
                            })}
                        </p>
                        <p className="text-[10px] font-bold text-orange-500 mt-1">
                            {metrics.daily.orders} pedidos
                        </p>
                    </div>
                </Link>

                {/* Card Visitantes (com avatares e link para página de visitantes) */}
                <Link href={`/${profile?.profileSlug}/${store.storeSlug}/visitantes`} className="block">
                    <div className="bg-white/50 rounded-xl p-4 border border-orange-100 hover:border-orange-300 transition-all h-full flex flex-col">
                        <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                            Visitantes
                        </p>
                        {visitors.length > 0 ? (
                            <div className="flex items-center gap-1 mt-2">
                                {visitors.slice(0, 3).map((v, i) => (
                                    <div
                                        key={v.id}
                                        className="w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm"
                                        title={v.profiles?.name || 'Visitante'}
                                    >
                                        {v.profiles?.avatar_url ? (
                                            <img
                                                src={
                                                    v.profiles.avatar_url.startsWith('http')
                                                        ? v.profiles.avatar_url
                                                        : supabase.storage
                                                            .from('avatars')
                                                            .getPublicUrl(v.profiles.avatar_url).data.publicUrl
                                                }
                                                className="w-full h-full object-cover"
                                                alt=""
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                                {v.profiles?.name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {/* Agora usa o total real de visitantes (storeViews) para calcular o "+" */}
                                {storeViews !== undefined && storeViews > 3 && (
                                    <span className="text-[10px] font-bold text-gray-500 ml-1">
                                        +{storeViews - 3}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 mt-2">Nenhum visitante ainda</p>
                        )}
                        <p className="text-[9px] text-orange-500 font-bold mt-auto pt-2 hover:underline">
                            Ver todos →
                        </p>
                    </div>
                </Link>
            </div>

            {/* HORÁRIOS DE FUNCIONAMENTO (NOVO EDITOR VISUAL) */}
            <div className="mb-6">
                <button
                    onClick={() => setShowScheduleEditor(!showScheduleEditor)}
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-orange-600 transition-colors"
                >
                    <Clock3 size={14} />
                    Horários de Funcionamento
                    <ChevronRight
                        size={14}
                        className={`transform transition-transform ${showScheduleEditor ? 'rotate-90' : ''}`}
                    />
                </button>

                {showScheduleEditor && (
                    <div className="mt-3 bg-white/50 rounded-xl p-4 border border-orange-100 space-y-4">
                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                            Defina o horário de funcionamento para cada dia (clique nos horários)
                        </p>

                        {DAYS_OF_WEEK.map(day => {
                            const current = businessHours[day.key] || { open: '', close: '' };
                            const isOpenDefined = current.open && current.close;
                            const showCustomOpen = customOpen[day.key] || false;
                            const showCustomClose = customClose[day.key] || false;

                            return (
                                <div key={day.key} className="border-b border-orange-100 pb-2 last:border-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-gray-700 uppercase w-20">
                                            {day.label}
                                        </span>
                                        <button
                                            onClick={() => clearDay(day.key)}
                                            className="text-[9px] font-bold text-red-400 hover:text-red-600"
                                        >
                                            Fechado
                                        </button>
                                    </div>

                                    {/* Seletor de Abertura */}
                                    <div className="mb-1">
                                        <p className="text-[8px] text-gray-400 mb-1">Abre às</p>
                                        <div className="flex flex-wrap gap-1 items-center">
                                            {COMMON_HOURS.slice(0, 9).map(hour => (
                                                <button
                                                    key={`open-${day.key}-${hour}`}
                                                    onClick={() => {
                                                        setTimeForDay(day.key, 'open', hour);
                                                        setCustomOpen(prev => ({ ...prev, [day.key]: false }));
                                                    }}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors ${current.open === hour
                                                        ? 'bg-orange-500 text-white border-orange-500'
                                                        : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'
                                                        }`}
                                                >
                                                    {hour}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => toggleCustom(day.key, 'open')}
                                                className={`px-2 py-1 text-[10px] font-bold rounded-lg border ${showCustomOpen ? 'bg-gray-200 border-gray-400' : 'bg-white border-dashed border-gray-300 text-gray-500'
                                                    }`}
                                            >
                                                {showCustomOpen ? 'Fechar' : 'Outro'}
                                            </button>
                                        </div>
                                        {showCustomOpen && (
                                            <input
                                                type="time"
                                                value={current.open}
                                                onChange={e => setTimeForDay(day.key, 'open', e.target.value)}
                                                className="mt-1 bg-white border border-orange-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-orange-500"
                                            />
                                        )}
                                    </div>

                                    {/* Seletor de Fechamento */}
                                    <div>
                                        <p className="text-[8px] text-gray-400 mb-1">Fecha às</p>
                                        <div className="flex flex-wrap gap-1 items-center">
                                            {COMMON_HOURS.slice(9).map(hour => (
                                                <button
                                                    key={`close-${day.key}-${hour}`}
                                                    onClick={() => {
                                                        setTimeForDay(day.key, 'close', hour);
                                                        setCustomClose(prev => ({ ...prev, [day.key]: false }));
                                                    }}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors ${current.close === hour
                                                        ? 'bg-orange-500 text-white border-orange-500'
                                                        : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'
                                                        }`}
                                                >
                                                    {hour}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => toggleCustom(day.key, 'close')}
                                                className={`px-2 py-1 text-[10px] font-bold rounded-lg border ${showCustomClose ? 'bg-gray-200 border-gray-400' : 'bg-white border-dashed border-gray-300 text-gray-500'
                                                    }`}
                                            >
                                                {showCustomClose ? 'Fechar' : 'Outro'}
                                            </button>
                                        </div>
                                        {showCustomClose && (
                                            <input
                                                type="time"
                                                value={current.close}
                                                onChange={e => setTimeForDay(day.key, 'close', e.target.value)}
                                                className="mt-1 bg-white border border-orange-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-orange-500"
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        <button
                            onClick={handleSaveSchedule}
                            disabled={savingSchedule}
                            className="w-full py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-black text-[10px] uppercase flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {savingSchedule ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Save size={14} /> Salvar Horários
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* MAIS VENDIDOS */}
            {topItems.length > 0 && (
                <div className="mb-6 bg-orange-50/50 rounded-xl p-4 border border-orange-100">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-orange-600 mb-3 flex items-center gap-2">
                        <TrendingUp size={12} /> Mais Vendidos
                    </h4>
                    <div className="space-y-2">
                        {topItems.map(([name, data], i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-gray-400 w-4">
                                        {i + 1}
                                    </span>
                                    <span className="text-xs font-bold text-gray-700">{name}</span>
                                </div>
                                <span className="text-xs font-black text-gray-900">
                                    {data.count}x
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* LISTA DE PEDIDOS */}
            <div className="space-y-5">
                {invites.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-600 mb-2 flex items-center gap-2">
                            <Clock size={12} /> Novos Pedidos ({invites.length})
                        </h4>
                        {invites.map(order => (
                            <div
                                key={order.checkout_id}
                                onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-4 bg-blue-50/50 rounded-xl mb-2 active:bg-blue-100 cursor-pointer transition-all border border-blue-100"
                            >
                                <div>
                                    <span className="text-base font-black italic text-gray-900">
                                        @{order.buyer_profile_slug}
                                    </span>
                                    <p className="text-[10px] font-bold text-gray-500 mt-0.5">
                                        {order.items.length} itens
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black italic text-gray-900">
                                        R$ {order.totalPrice.toFixed(2)}
                                    </span>
                                    <ChevronRight size={16} className="text-blue-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {inPreparo.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-yellow-600 mb-2 flex items-center gap-2">
                            <Package size={12} /> Em Preparo ({inPreparo.length})
                        </h4>
                        {inPreparo.map(order => (
                            <div
                                key={order.checkout_id}
                                onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-4 bg-yellow-50/50 rounded-xl mb-2 cursor-pointer border border-yellow-100"
                            >
                                <span className="text-base font-black italic text-gray-900">
                                    @{order.buyer_profile_slug}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black italic text-gray-900">
                                        R$ {order.totalPrice.toFixed(2)}
                                    </span>
                                    <ChevronRight size={16} className="text-yellow-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {forReady.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-600 mb-2 flex items-center gap-2">
                            <CheckCircle2 size={12} /> Prontos ({forReady.length})
                        </h4>
                        {forReady.map(order => (
                            <div
                                key={order.checkout_id}
                                onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-4 bg-purple-50/50 rounded-xl mb-2 cursor-pointer border border-purple-100"
                            >
                                <span className="text-base font-black italic text-gray-900">
                                    @{order.buyer_profile_slug}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black italic text-gray-900">
                                        R$ {order.totalPrice.toFixed(2)}
                                    </span>
                                    <ChevronRight size={16} className="text-purple-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {accepted.length > 0 && (
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-green-600 mb-2 flex items-center gap-2">
                            <CheckCircle2 size={12} /> Finalizados ({accepted.length})
                        </h4>
                        {accepted.slice(0, 3).map(order => (
                            <div
                                key={order.checkout_id}
                                onClick={() => setSelectedOrder(order)}
                                className="flex items-center justify-between p-4 bg-green-50/50 rounded-xl mb-2 cursor-pointer border border-green-100"
                            >
                                <span className="text-base font-black italic text-gray-900">
                                    @{order.buyer_profile_slug}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black italic text-gray-900">
                                        R$ {order.totalPrice.toFixed(2)}
                                    </span>
                                    <ChevronRight size={16} className="text-green-600" />
                                </div>
                            </div>
                        ))}
                        {accepted.length > 3 && (
                            <p className="text-[9px] text-center text-gray-500 mt-1">
                                +{accepted.length - 3} finalizados
                            </p>
                        )}
                    </div>
                )}

                {groupedOrders.length === 0 && (
                    <div className="text-center py-8">
                        <Package size={32} className="mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-500 font-bold text-sm">Nenhum pedido ainda</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                            Quando chegar um pedido, aparecerá aqui
                        </p>
                    </div>
                )}

                {groupedOrders.length > 0 && (
                    <div className="pt-2">
                        <Link
                            href={`/${profile?.profileSlug}/${store.storeSlug}/pedidos`}
                            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-gray-500 hover:text-orange-600 transition-colors"
                        >
                            Ver histórico desta loja ({groupedOrders.length}){' '}
                            <ArrowUpRight size={12} />
                        </Link>
                    </div>
                )}
            </div>

            {selectedOrder && (
                <OrderModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onAction={handleAction}
                />
            )}
        </div>
    )
}