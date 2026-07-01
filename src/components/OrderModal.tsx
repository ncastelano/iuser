// OrderModal.tsx
'use client'

import { X, CheckCircle2, ChevronRight, Package, Clock, ChefHat, CheckCircle, Ban, MapPin } from 'lucide-react'

export interface GroupedOrder {
    id?: string
    checkout_id: string
    buyer_name: string
    buyer_profile_slug: string
    created_at: string
    status: string
    items: {
        product_id?: string
        product_name: string
        quantity: number
        unit_price?: number
        total_price?: number
        // legado (store_sales)
        price?: number
    }[]
    subtotal?: number
    totalPrice: number       // = total_amount do orders (inclui frete)
    deliveryFee?: number | null
    delivery_address?: string | null
    delivery_lat?: number | null
    delivery_lng?: number | null
    delivery_option?: string | null
    payment_method?: string | null
}

// ----- Haversine (distância em km) -----
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const statusMap = {
    'pending': {
        label: 'Novo Pedido',
        color: 'from-blue-500 to-indigo-500',
        icon: Package,
        next: 'preparing',
        nextLabel: 'Aceitar Pedido',
        nextIcon: CheckCircle2
    },
    'preparing': {
        label: 'Em Preparo',
        color: 'from-yellow-500 to-amber-500',
        icon: ChefHat,
        next: 'ready',
        nextLabel: 'Pedido Pronto',
        nextIcon: Clock
    },
    'ready': {
        label: 'Pronto',
        color: 'from-purple-500 to-pink-500',
        icon: Clock,
        next: 'paid',
        nextLabel: 'Finalizar Venda',
        nextIcon: CheckCircle
    },
    'paid': {
        label: 'Finalizado',
        color: 'from-green-500 to-emerald-500',
        icon: CheckCircle,
        next: null,
        nextLabel: ''
    },
    'rejected': {
        label: 'Recusado',
        color: 'from-red-500 to-rose-500',
        icon: Ban,
        next: null,
        nextLabel: ''
    }
}

interface OrderModalProps {
    order: GroupedOrder
    onClose: () => void
    onAction: (status: string) => void
    storeLat?: number | null
    storeLng?: number | null
}

export function OrderModal({ order, onClose, onAction, storeLat, storeLng }: OrderModalProps) {
    const currentStatus = statusMap[order.status as keyof typeof statusMap] || statusMap['pending']
    const StatusIcon = currentStatus.icon

    // Informações de entrega
    const deliveryAddress = (order as any).delivery_address
    const deliveryLat = (order as any).delivery_lat
    const deliveryLng = (order as any).delivery_lng
    // Valor da taxa de entrega (já incluso no totalPrice do order)
    const deliveryFee = Number((order as any).deliveryFee || 0)

    // Cálculo da distância
    let distanceText = ''
    if (storeLat != null && storeLng != null && deliveryLat != null && deliveryLng != null) {
        const dist = getDistanceKm(storeLat, storeLng, deliveryLat, deliveryLng)
        distanceText = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`
    }

    // Total dos itens (soma de total_price de cada item)
    const itemsTotal = order.items.reduce((sum, item) => {
        // suporta tanto total_price (orders) quanto price (legado)
        return sum + Number(item.total_price ?? item.price ?? 0)
    }, 0)

    // Total final: usa total_amount (já inclui frete) vindo direto do orders
    // Se não existir (pedido legado), recalcula
    const totalPrice = Number(order.totalPrice) || (itemsTotal + deliveryFee)

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

            <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-[2.5rem] shadow-2xl flex flex-col animate-in fade-in zoom-in duration-300 border-0 overflow-hidden">
                {/* Header */}
                <div className="relative p-6 border-b border-orange-100 bg-white shrink-0">
                    <button onClick={onClose} className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                    <div className="flex items-center gap-3 mb-1">
                        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${currentStatus.color} flex items-center justify-center shadow-lg transform -rotate-3`}>
                            <StatusIcon size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black italic text-gray-900 uppercase tracking-tighter">Gerenciar Pedido</h3>
                            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">
                                #{order.checkout_id.slice(0, 8)} • @{order.buyer_profile_slug}
                            </p>
                        </div>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center gap-1 mt-6">
                        {['pending', 'preparing', 'ready', 'paid'].map((s, idx) => {
                            const isActive = order.status === s
                            const isCompleted = ['pending', 'preparing', 'ready', 'paid'].indexOf(order.status) > idx || order.status === 'paid' && s === 'paid'
                            const icons = { pending: Package, preparing: ChefHat, ready: Clock, paid: CheckCircle }
                            const StepIcon = icons[s as keyof typeof icons]
                            return (
                                <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive || isCompleted ? 'bg-orange-500 text-white shadow-md' : 'bg-orange-50 text-orange-200'}`}>
                                        <StepIcon size={14} />
                                    </div>
                                    <span className={`text-[7px] font-black uppercase tracking-wider text-center leading-tight ${isActive || isCompleted ? 'text-orange-600' : 'text-gray-300'}`}>
                                        {s === 'pending' ? 'Novo' : s === 'preparing' ? 'Preparo' : s === 'ready' ? 'Pronto' : 'Pago'}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto bg-gradient-to-b from-orange-50/30 to-white">
                    <div className="p-6 space-y-6">
                        {/* Items */}
                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-1">
                                Resumo dos Itens
                            </p>
                            {order.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-orange-100 shadow-sm hover:shadow-md transition-all group">
                                    <div className="flex-1 min-w-0 mr-3">
                                        <p className="text-sm font-bold text-gray-800 truncate group-hover:text-orange-600 transition-colors">
                                            {item.product_name}
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-bold mt-0.5 uppercase tracking-tight">
                                            {item.quantity} un.
                                            {(item.unit_price ?? (item.price && item.quantity ? item.price / item.quantity : null)) != null &&
                                                ` • R$ ${Number(item.unit_price ?? (item.price! / item.quantity)).toFixed(2)} un.`
                                            }
                                        </p>
                                    </div>
                                    <p className="text-base font-black text-gray-900 shrink-0">
                                        R$ {Number(item.total_price ?? item.price ?? 0).toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Local de Entrega */}
                        {deliveryAddress && (
                            <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100 space-y-2">
                                <div className="flex items-center gap-2">
                                    <MapPin size={16} className="text-orange-500" />
                                    <span className="text-xs font-black uppercase tracking-wider text-orange-600">
                                        Local de Entrega
                                    </span>
                                </div>
                                <p className="text-sm font-bold text-gray-700 leading-snug">{deliveryAddress}</p>
                                {distanceText && (
                                    <div className="flex items-center gap-1 text-xs font-bold text-orange-500 mt-1">
                                        <MapPin size={14} className="text-orange-500" />
                                        Distância da loja: {distanceText}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Resumo financeiro */}
                        <div className="bg-white rounded-2xl border border-orange-100 p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Subtotal (itens)</span>
                                <span className="font-bold text-gray-800">R$ {itemsTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Taxa de entrega</span>
                                {deliveryFee > 0 ? (
                                    <span className="font-bold text-orange-600">R$ {deliveryFee.toFixed(2)}</span>
                                ) : (
                                    <span className="font-bold text-green-600">Grátis</span>
                                )}
                            </div>
                            {order.payment_method && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Pagamento</span>
                                    <span className="font-bold text-gray-700 capitalize">
                                        {order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'cartao' ? 'Cartão' : 'Dinheiro'}
                                    </span>
                                </div>
                            )}
                            {order.delivery_option && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Tipo</span>
                                    <span className="font-bold text-gray-700 capitalize">
                                        {order.delivery_option === 'entrega' ? '🚚 Entrega' : '🏪 Retirada'}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between text-base pt-2 border-t border-gray-100">
                                <span className="font-bold text-gray-800">Total a receber</span>
                                <span className="font-black text-orange-600 text-lg">R$ {totalPrice.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3 pt-2">
                            {currentStatus.next && (
                                <button
                                    onClick={() => onAction(currentStatus.next!)}
                                    className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-black uppercase text-sm tracking-wider hover:shadow-xl hover:scale-[1.02] transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-orange-200"
                                >
                                    {currentStatus.nextLabel}
                                    <ChevronRight size={18} className="shrink-0" />
                                </button>
                            )}
                            {order.status === 'pending' && (
                                <button
                                    onClick={() => onAction('rejected')}
                                    className="w-full py-3.5 bg-white text-red-500 border-2 border-red-50 rounded-2xl font-black uppercase text-xs tracking-wider hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <Ban size={14} /> Recusar Pedido
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="w-full py-2 text-[10px] font-black text-gray-400 hover:text-orange-500 transition-all uppercase tracking-widest"
                            >
                                Voltar ao Painel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}