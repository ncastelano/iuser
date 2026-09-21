// components/StoreDashboard/StoreSalesExtractDialog.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, MessageCircle, Mail, Receipt } from 'lucide-react'

export type ExtractPeriod = 'daily' | 'weekly' | 'monthly'

interface StoreSalesExtractDialogProps {
    storeId: string
    storeName: string
    period: ExtractPeriod
    onClose: () => void
}

interface OrderRow {
    id: string
    buyer_name: string | null
    buyer_profile_slug: string | null
    total_amount: number
    payment_method: string | null
    delivery_option: string | null
    created_at: string
}

interface OrderItemRow {
    product_name: string
    quantity: number
    total_price: number
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// Intervalo [start, end) do período, já deslocado por `offset` (0 = atual,
// -1 = anterior...). Hoje: o dia. Semana: domingo a sábado. Mês: do dia 1 ao
// último dia do mês.
function periodRange(period: ExtractPeriod, offset: number): { start: Date; end: Date } {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    if (period === 'daily') {
        end.setDate(end.getDate() + 1)
    } else if (period === 'weekly') {
        start.setDate(start.getDate() - start.getDay() + offset * 7)
        end.setTime(start.getTime())
        end.setDate(end.getDate() + 7)
    } else {
        start.setDate(1)
        start.setMonth(start.getMonth() + offset)
        end.setTime(start.getTime())
        end.setMonth(end.getMonth() + 1)
    }
    return { start, end }
}

function periodTitle(period: ExtractPeriod, start: Date, end: Date): string {
    if (period === 'daily') return 'Hoje'
    if (period === 'monthly') return capitalize(start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
    const last = new Date(end)
    last.setDate(last.getDate() - 1)
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
    return `Semana · ${fmt(start)} a ${fmt(last)}`
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const PAYMENT_LABEL: Record<string, string> = {
    pix: 'PIX',
    cartao: 'Cartão',
    credito: 'Crédito',
    debito: 'Débito',
    dinheiro: 'Dinheiro',
}

export default function StoreSalesExtractDialog({ storeId, storeName, period, onClose }: StoreSalesExtractDialogProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [offset, setOffset] = useState(0) // 0 = período atual, -1 = anterior...
    const [selectedDay, setSelectedDay] = useState<number | null>(null) // dia da semana filtrado (0-6)
    const [orders, setOrders] = useState<OrderRow[]>([])
    const { start, end } = periodRange(period, offset)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemRow[]>>({})
    const [loadingItemsFor, setLoadingItemsFor] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase
            .from('orders')
            .select('id, buyer_name, buyer_profile_slug, total_amount, payment_method, delivery_option, created_at')
            .eq('store_id', storeId)
            .eq('status', 'paid')
            .gte('created_at', start.toISOString())
            .lt('created_at', end.toISOString())
            .order('created_at', { ascending: false })
        setOrders((data as OrderRow[]) || [])
        setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId, period, offset])

    useEffect(() => { load() }, [load])
    useEffect(() => { setSelectedDay(null) }, [offset])

    const toggleExpand = async (orderId: string) => {
        if (expandedId === orderId) {
            setExpandedId(null)
            return
        }
        setExpandedId(orderId)
        if (!itemsByOrder[orderId]) {
            setLoadingItemsFor(orderId)
            const { data } = await supabase
                .from('order_items')
                .select('product_name, quantity, total_price')
                .eq('order_id', orderId)
            setItemsByOrder((prev) => ({ ...prev, [orderId]: (data as OrderItemRow[]) || [] }))
            setLoadingItemsFor(null)
        }
    }

    const buildSummaryText = (order: OrderRow) => {
        const items = itemsByOrder[order.id] || []
        const itemsText = items.map((i) => `- ${i.quantity}x ${i.product_name} (R$ ${Number(i.total_price).toFixed(2)})`).join('\n')
        const buyer = order.buyer_name || (order.buyer_profile_slug ? `@${order.buyer_profile_slug}` : 'Cliente')
        return (
            `*Pedido — ${storeName}*\n` +
            `Cliente: ${buyer}\n` +
            `Data: ${new Date(order.created_at).toLocaleString('pt-BR')}\n\n` +
            (itemsText ? `*Itens:*\n${itemsText}\n\n` : '') +
            `*Total: R$ ${Number(order.total_amount).toFixed(2)}*`
        )
    }

    const sendWhatsApp = (order: OrderRow) => {
        const text = buildSummaryText(order)
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    }

    const sendEmail = (order: OrderRow) => {
        const text = buildSummaryText(order).replace(/\*/g, '')
        window.open(`mailto:?subject=${encodeURIComponent(`Pedido — ${storeName}`)}&body=${encodeURIComponent(text)}`, '_blank')
    }

    // Vendas por dia da semana (semana): total e quantidade de cada dia.
    const dayTotals = WEEKDAYS.map((_, i) => {
        const dayOrders = orders.filter((o) => new Date(o.created_at).getDay() === i)
        return { total: dayOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0), count: dayOrders.length }
    })
    const maxDayTotal = Math.max(...dayTotals.map((d) => d.total), 0)
    const visibleOrders = period === 'weekly' && selectedDay !== null
        ? orders.filter((o) => new Date(o.created_at).getDay() === selectedDay)
        : orders
    const totalRevenue = visibleOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
    const title = periodTitle(period, start, end)
    const canNavigate = period !== 'daily'
    const today = new Date()

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
            <div
                className="w-full sm:max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col"
                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <div className="flex items-center justify-between">
                        <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>Extrato</h3>
                        <button onClick={onClose} className="p-2 -mr-2 rounded-full flex-shrink-0" style={{ color: colors.textSecondary }}>
                            <X size={20} />
                        </button>
                    </div>

                    {/* Navegação entre semanas/meses */}
                    <div className="flex items-center justify-between gap-2 mt-2">
                        {canNavigate ? (
                            <button
                                onClick={() => setOffset((o) => o - 1)}
                                aria-label="Período anterior"
                                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                            >
                                <ChevronLeft size={18} />
                            </button>
                        ) : <span className="w-9" />}
                        <div className="text-center min-w-0">
                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{title}</p>
                            <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                {visibleOrders.length} pedido{visibleOrders.length !== 1 ? 's' : ''} · <strong style={{ color: '#f97316' }}>R$ {totalRevenue.toFixed(2)}</strong>
                            </p>
                        </div>
                        {canNavigate ? (
                            <button
                                onClick={() => setOffset((o) => Math.min(0, o + 1))}
                                disabled={offset >= 0}
                                aria-label="Próximo período"
                                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-30"
                                style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                            >
                                <ChevronRight size={18} />
                            </button>
                        ) : <span className="w-9" />}
                    </div>

                    {/* Semana: sempre mostra os 7 dias, com o total de cada um */}
                    {period === 'weekly' && (
                        <div className="grid grid-cols-7 gap-1 mt-3">
                            {WEEKDAYS.map((label, i) => {
                                const day = new Date(start)
                                day.setDate(start.getDate() + i)
                                const isToday = sameDay(day, today)
                                const selected = selectedDay === i
                                const d = dayTotals[i]
                                const barHeight = maxDayTotal > 0 ? Math.max(4, Math.round((d.total / maxDayTotal) * 28)) : 4
                                return (
                                    <button
                                        key={label}
                                        onClick={() => setSelectedDay(selected ? null : i)}
                                        className="flex flex-col items-center gap-1 py-1.5 rounded-xl transition"
                                        style={selected
                                            ? { background: 'linear-gradient(135deg, #f97316, #dc2626)' }
                                            : { background: isToday ? '#f9731615' : 'transparent', border: `1px solid ${isToday ? '#f97316' : 'transparent'}` }}
                                    >
                                        <span className="text-[10px] font-black uppercase" style={{ color: selected ? '#fff' : colors.textSecondary }}>{label}</span>
                                        <span className="text-xs font-black" style={{ color: selected ? '#fff' : colors.textPrimary }}>{day.getDate()}</span>
                                        <div className="h-7 flex items-end">
                                            <div className="w-3 rounded-full" style={{ height: barHeight, background: selected ? 'rgba(255,255,255,0.85)' : d.total > 0 ? '#f97316' : `${colors.border}80` }} />
                                        </div>
                                        <span className="text-[9px] font-bold" style={{ color: selected ? '#fff' : colors.textSecondary }}>
                                            {d.total > 0 ? d.total.toFixed(0) : '–'}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="overflow-y-auto p-4 space-y-2 flex-1">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                        </div>
                    ) : visibleOrders.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <Receipt size={28} style={{ color: colors.textSecondary }} />
                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nenhum pedido nesse período</p>
                        </div>
                    ) : (
                        visibleOrders.map((order) => {
                            const isExpanded = expandedId === order.id
                            const items = itemsByOrder[order.id]
                            return (
                                <div key={order.id} className="rounded-xl overflow-hidden" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, border: `1px solid ${colors.border}` }}>
                                    <button
                                        onClick={() => toggleExpand(order.id)}
                                        className="w-full flex items-center justify-between gap-2 p-3 text-left"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                                {order.buyer_name || (order.buyer_profile_slug ? `@${order.buyer_profile_slug}` : 'Cliente')}
                                            </p>
                                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                                {new Date(order.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                {order.payment_method && ` · ${PAYMENT_LABEL[order.payment_method] || order.payment_method}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="font-black text-sm" style={{ color: '#f97316' }}>R$ {Number(order.total_amount).toFixed(2)}</span>
                                            {isExpanded ? <ChevronUp size={16} style={{ color: colors.textSecondary }} /> : <ChevronDown size={16} style={{ color: colors.textSecondary }} />}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="px-3 pb-3 space-y-2" style={{ borderTop: `1px solid ${colors.border}` }}>
                                            {loadingItemsFor === order.id ? (
                                                <div className="flex justify-center py-3">
                                                    <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                                                </div>
                                            ) : (
                                                <div className="pt-2 space-y-1">
                                                    {(items || []).map((item, i) => (
                                                        <div key={i} className="flex items-center justify-between text-xs">
                                                            <span style={{ color: colors.textPrimary }}>{item.quantity}x {item.product_name}</span>
                                                            <span style={{ color: colors.textSecondary }}>R$ {Number(item.total_price).toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    onClick={() => sendWhatsApp(order)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold"
                                                    style={{ background: '#25D36620', color: '#25D366' }}
                                                >
                                                    <MessageCircle size={13} /> WhatsApp
                                                </button>
                                                <button
                                                    onClick={() => sendEmail(order)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold"
                                                    style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                                                >
                                                    <Mail size={13} /> E-mail
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
