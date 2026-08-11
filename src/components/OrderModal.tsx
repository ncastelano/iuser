// components/OrderModal.tsx
'use client'

import { X, CheckCircle2, ChevronRight, Package, Clock, ChefHat, CheckCircle, Ban, MapPin, Truck, Globe, Store, ShoppingBag, CreditCard, Coins, Calendar, User, Phone } from 'lucide-react'

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
        price?: number // legado
    }[]
    subtotal?: number
    totalPrice: number
    deliveryFee?: number | null
    delivery_address?: string | null
    delivery_lat?: number | null
    delivery_lng?: number | null
    delivery_option?: string | null
    payment_method?: string | null
}

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
        color: '#3b82f6',
        gradient: 'from-blue-500 to-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-600',
        icon: Package,
        next: 'preparing',
        nextLabel: 'Aceitar Pedido',
        nextIcon: CheckCircle2
    },
    'preparing': {
        label: 'Em Preparo',
        color: '#f59e0b',
        gradient: 'from-amber-500 to-yellow-500',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-600',
        icon: ChefHat,
        next: 'ready',
        nextLabel: 'Pedido Pronto',
        nextIcon: Clock
    },
    'ready': {
        label: 'Pronto para Entrega',
        color: '#8b5cf6',
        gradient: 'from-purple-500 to-violet-500',
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-600',
        icon: Clock,
        next: 'paid',
        nextLabel: 'Finalizar Venda',
        nextIcon: CheckCircle
    },
    'paid': {
        label: 'Finalizado',
        color: '#22c55e',
        gradient: 'from-green-500 to-emerald-500',
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-600',
        icon: CheckCircle,
        next: null,
        nextLabel: ''
    },
    'rejected': {
        label: 'Recusado',
        color: '#ef4444',
        gradient: 'from-red-500 to-rose-500',
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-600',
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
    assignmentInfo?: {
        employeeName: string
        status: string
    }
}

const formatAssignmentStatus = (status: string) => {
    switch (status) {
        case 'pending': return 'Pendente'
        case 'in_transit': return 'A caminho'
        case 'delivered': return 'Entregue'
        default: return status
    }
}

export function OrderModal({ order, onClose, onAction, storeLat, storeLng, assignmentInfo }: OrderModalProps) {
    const currentStatus = statusMap[order.status as keyof typeof statusMap] || statusMap['pending']
    const StatusIcon = currentStatus.icon

    const deliveryAddress = order.delivery_address
    const deliveryLat = order.delivery_lat
    const deliveryLng = order.delivery_lng
    const deliveryFee = Number(order.deliveryFee || 0)

    let distanceText = ''
    if (storeLat != null && storeLng != null && deliveryLat != null && deliveryLng != null) {
        const dist = getDistanceKm(storeLat, storeLng, deliveryLat, deliveryLng)
        distanceText = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`
    }

    const itemsTotal = order.items.reduce((sum, item) => {
        return sum + Number(item.total_price ?? item.price ?? 0)
    }, 0)

    const totalPrice = Number(order.totalPrice) || (itemsTotal + deliveryFee)

    // Identifica o canal de venda
    const isInPerson = !order.buyer_profile_slug
    const channelLabel = isInPerson ? 'Venda Presencial' : 'Venda Online'
    const ChannelIcon = isInPerson ? Store : Globe
    const channelColor = isInPerson
        ? { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' }
        : { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' }

    // Formata data
    const formattedDate = order.created_at ? new Date(order.created_at).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : ''

    // Mapeia método de pagamento
    const getPaymentLabel = (method: string) => {
        const map: Record<string, string> = {
            'pix': 'PIX',
            'cartao': 'Cartão',
            'dinheiro': 'Dinheiro',
            'credito': 'Cartão de Crédito',
            'debito': 'Cartão de Débito'
        }
        return map[method] || method
    }

    const getPaymentIcon = (method: string) => {
        const map: Record<string, React.ReactNode> = {
            'pix': <CreditCard size={14} />,
            'cartao': <CreditCard size={14} />,
            'dinheiro': <Coins size={14} />,
            'credito': <CreditCard size={14} />,
            'debito': <CreditCard size={14} />
        }
        return map[method] || <CreditCard size={14} />
    }

    const getDeliveryOptionLabel = (option: string) => {
        const map: Record<string, string> = {
            'entrega': '🚚 Entrega',
            'pickup': '🏪 Retirada / Presencial'
        }
        return map[option] || option
    }

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

            <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-[2.5rem] shadow-2xl flex flex-col animate-in fade-in zoom-in duration-300 border-0 overflow-hidden">
                {/* Header com cor do status */}
                <div className={`relative p-6 border-b ${currentStatus.border} bg-gradient-to-r ${currentStatus.bg} shrink-0`}>
                    <button onClick={onClose} className="absolute right-4 top-4 p-2 hover:bg-white/50 rounded-full transition-colors z-10">
                        <X size={20} className="text-gray-400" />
                    </button>

                    <div className="flex items-center gap-3 mb-1">
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${currentStatus.gradient} flex items-center justify-center shadow-lg transform -rotate-3`}>
                            <StatusIcon size={24} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">
                                {currentStatus.label}
                            </h3>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                Pedido #{order.checkout_id.slice(0, 8)}
                            </p>
                        </div>
                    </div>

                    {/* Status badge e canal de venda */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${currentStatus.bg} ${currentStatus.text} border ${currentStatus.border}`}>
                            {currentStatus.label}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${channelColor.bg} ${channelColor.text} flex items-center gap-1.5`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${channelColor.dot}`} />
                            <ChannelIcon size={12} />
                            {channelLabel}
                        </span>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center gap-1 mt-5">
                        {['pending', 'preparing', 'ready', 'paid'].map((s, idx) => {
                            const statusKeys = ['pending', 'preparing', 'ready', 'paid']
                            const isActive = order.status === s
                            const isCompleted = statusKeys.indexOf(order.status) > idx || (order.status === 'paid' && s === 'paid')
                            const icons = { pending: Package, preparing: ChefHat, ready: Clock, paid: CheckCircle }
                            const StepIcon = icons[s as keyof typeof icons]
                            const stepColors = {
                                pending: 'from-blue-500 to-blue-600',
                                preparing: 'from-amber-500 to-yellow-500',
                                ready: 'from-purple-500 to-violet-500',
                                paid: 'from-green-500 to-emerald-500'
                            }
                            return (
                                <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive || isCompleted
                                        ? `bg-gradient-to-br ${stepColors[s as keyof typeof stepColors]} text-white shadow-md`
                                        : 'bg-gray-100 text-gray-300'
                                        }`}>
                                        <StepIcon size={14} />
                                    </div>
                                    <span className={`text-[7px] font-black uppercase tracking-wider text-center leading-tight ${isActive || isCompleted ? 'text-gray-700' : 'text-gray-300'
                                        }`}>
                                        {s === 'pending' ? 'Novo' : s === 'preparing' ? 'Preparo' : s === 'ready' ? 'Pronto' : 'Finalizado'}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-gray-50/50">
                    <div className="p-6 space-y-5">
                        {/* Informações do cliente e pedido */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <User size={12} className="text-gray-400" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Cliente</span>
                                </div>
                                <p className="text-sm font-bold text-gray-800 truncate">
                                    {isInPerson ? order.buyer_name || 'Presencial' : `@${order.buyer_profile_slug}`}
                                </p>
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Calendar size={12} className="text-gray-400" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Data</span>
                                </div>
                                <p className="text-xs font-bold text-gray-700">{formattedDate}</p>
                            </div>
                        </div>

                        {/* Informação do entregador (se existir) */}
                        {assignmentInfo && (
                            <div className={`rounded-xl p-3 border ${currentStatus.border} ${currentStatus.bg}`}>
                                <div className="flex items-center gap-2">
                                    <Truck size={14} className={currentStatus.text} />
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${currentStatus.text}`}>
                                        Entregador
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-sm font-bold text-gray-800">{assignmentInfo.employeeName}</p>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${currentStatus.bg} ${currentStatus.text}`}>
                                        {formatAssignmentStatus(assignmentInfo.status)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Items */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <ShoppingBag size={14} className="text-gray-400" />
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                                    Itens do Pedido
                                </p>
                                <span className="ml-auto text-[10px] font-bold text-gray-400">
                                    {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                                        <div className="flex-1 min-w-0 mr-3">
                                            <p className="text-sm font-bold text-gray-800 truncate group-hover:text-orange-600 transition-colors">
                                                {item.product_name}
                                            </p>
                                            <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                                                {item.quantity}x
                                                {(item.unit_price ?? (item.price && item.quantity ? item.price / item.quantity : null)) != null &&
                                                    ` • R$ ${Number(item.unit_price ?? (item.price! / item.quantity)).toFixed(2)}`
                                                }
                                            </p>
                                        </div>
                                        <p className="text-sm font-black text-gray-900 shrink-0">
                                            R$ {Number(item.total_price ?? item.price ?? 0).toFixed(2)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Local de Entrega (apenas para entregas) */}
                        {deliveryAddress && (
                            <div className={`rounded-xl p-3 border ${currentStatus.border} ${currentStatus.bg}`}>
                                <div className="flex items-center gap-2">
                                    <MapPin size={14} className={currentStatus.text} />
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${currentStatus.text}`}>
                                        Local de Entrega
                                    </span>
                                </div>
                                <p className="text-sm font-bold text-gray-700 leading-snug mt-1">{deliveryAddress}</p>
                                {distanceText && (
                                    <div className={`flex items-center gap-1 text-xs font-bold ${currentStatus.text} mt-1`}>
                                        <MapPin size={12} className={currentStatus.text} />
                                        Distância: {distanceText} da loja
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Resumo financeiro */}
                        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-3">
                                Resumo Financeiro
                            </p>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Subtotal</span>
                                    <span className="font-bold text-gray-800">R$ {itemsTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Entrega</span>
                                    {deliveryFee > 0 ? (
                                        <span className="font-bold text-orange-600">R$ {deliveryFee.toFixed(2)}</span>
                                    ) : (
                                        <span className="font-bold text-green-600">Grátis</span>
                                    )}
                                </div>
                                {order.payment_method && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Pagamento</span>
                                        <span className={`font-bold flex items-center gap-1 ${currentStatus.text}`}>
                                            {getPaymentIcon(order.payment_method)}
                                            {getPaymentLabel(order.payment_method)}
                                        </span>
                                    </div>
                                )}
                                {order.delivery_option && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Tipo</span>
                                        <span className="font-bold text-gray-700">
                                            {getDeliveryOptionLabel(order.delivery_option)}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between text-base pt-2 border-t border-gray-100">
                                    <span className="font-bold text-gray-800">Total</span>
                                    <span className={`font-black text-lg ${currentStatus.text}`}>
                                        R$ {totalPrice.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2 pt-1">
                            {currentStatus.next && (
                                <button
                                    onClick={() => onAction(currentStatus.next!)}
                                    className={`w-full py-3.5 bg-gradient-to-r ${currentStatus.gradient} text-white rounded-xl font-black uppercase text-sm tracking-wider hover:shadow-lg hover:scale-[1.02] transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg`}
                                    style={{
                                        boxShadow: `0 4px 14px ${currentStatus.color}40`
                                    }}
                                >
                                    {currentStatus.nextLabel}
                                    <ChevronRight size={18} className="shrink-0" />
                                </button>
                            )}
                            {order.status === 'pending' && (
                                <button
                                    onClick={() => onAction('rejected')}
                                    className="w-full py-3 bg-white text-red-500 border-2 border-red-100 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-red-50 transition-all flex items-center justify-center gap-2"
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