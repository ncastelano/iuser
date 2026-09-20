// components/StoreDashboard/StoreSalesExtractDialog.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { X, ChevronDown, ChevronUp, MessageCircle, Mail, Receipt } from 'lucide-react'

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

const PERIOD_LABEL: Record<ExtractPeriod, string> = {
    daily: 'Hoje',
    weekly: 'Últimos 7 dias',
    monthly: 'Últimos 30 dias',
}

function periodStart(period: ExtractPeriod): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    if (period === 'weekly') d.setDate(d.getDate() - 7)
    if (period === 'monthly') d.setDate(d.getDate() - 30)
    return d.toISOString()
}

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
    const [orders, setOrders] = useState<OrderRow[]>([])
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
            .gte('created_at', periodStart(period))
            .order('created_at', { ascending: false })
        setOrders((data as OrderRow[]) || [])
        setLoading(false)
    }, [storeId, period])

    useEffect(() => { load() }, [load])

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

    const totalRevenue = orders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
            <div
                className="w-full sm:max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col"
                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <div>
                        <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>
                            Extrato · {PERIOD_LABEL[period]}
                        </h3>
                        <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                            {orders.length} pedido{orders.length !== 1 ? 's' : ''} · R$ {totalRevenue.toFixed(2)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full flex-shrink-0" style={{ color: colors.textSecondary }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto p-4 space-y-2 flex-1">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <Receipt size={28} style={{ color: colors.textSecondary }} />
                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nenhum pedido nesse período</p>
                        </div>
                    ) : (
                        orders.map((order) => {
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
