'use client'

import { X, CheckCircle2, ChevronRight, Package, Clock, ChefHat, CheckCircle, Ban } from 'lucide-react'
import { GroupedOrder } from '../types'

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
}

export function OrderModal({ order, onClose, onAction }: OrderModalProps) {
    const currentStatus = statusMap[order.status as keyof typeof statusMap] || statusMap['pending']
    const StatusIcon = currentStatus.icon

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full sm:max-w-lg max-h-[85vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300 border-0">

                {/* Header */}
                <div className="relative bg-gradient-to-r from-orange-500 to-red-500 px-5 py-4 rounded-t-3xl shrink-0">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-all"
                    >
                        <X size={16} className="text-white" />
                    </button>

                    {/* Order Info */}
                    <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center shrink-0">
                            <StatusIcon size={20} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-white/80 uppercase tracking-wider">
                                Pedido #{order.checkout_id.slice(0, 8)}
                            </p>
                            <h2 className="text-lg font-black text-white truncate">
                                @{order.buyer_profile_slug}
                            </h2>
                        </div>
                        <div className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full shrink-0">
                            <span className="text-[9px] font-black uppercase tracking-wider text-white">
                                {currentStatus.label}
                            </span>
                        </div>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center gap-1 mt-4">
                        {['pending', 'preparing', 'ready', 'paid'].map((s, idx) => {
                            const isActive = order.status === s
                            const isCompleted = ['pending', 'preparing', 'ready', 'paid'].indexOf(order.status) > idx || order.status === 'paid' && s === 'paid'

                            const icons = {
                                pending: Package,
                                preparing: ChefHat,
                                ready: Clock,
                                paid: CheckCircle
                            }
                            const StepIcon = icons[s as keyof typeof icons]

                            return (
                                <div key={s} className="flex-1 flex flex-col items-center gap-1">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isActive || isCompleted
                                            ? 'bg-white shadow-lg'
                                            : 'bg-white/20'
                                        }`}>
                                        <StepIcon size={12} className={
                                            isActive || isCompleted ? 'text-orange-600' : 'text-white/60'
                                        } />
                                    </div>
                                    <span className={`text-[7px] font-black uppercase tracking-wider text-center leading-tight ${isActive || isCompleted ? 'text-white' : 'text-white/50'
                                        }`}>
                                        {s === 'pending' ? 'Novo' : s === 'preparing' ? 'Preparo' : s === 'ready' ? 'Pronto' : 'Pago'}
                                    </span>
                                    {idx < 3 && (
                                        <div className={`h-0.5 flex-1 w-full mt-1 rounded ${isCompleted ? 'bg-white' : 'bg-white/20'
                                            }`} />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto bg-gradient-to-b from-orange-50 to-white">
                    <div className="p-4 space-y-4">
                        {/* Items */}
                        <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 px-1">
                                Itens do Pedido
                            </p>
                            {order.items.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-orange-100 shadow-sm hover:shadow-md transition-all"
                                >
                                    <div className="flex-1 min-w-0 mr-3">
                                        <p className="text-sm font-bold text-gray-800 truncate">
                                            {item.product_name}
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                            {item.quantity}x • R$ {(item.price / item.quantity).toFixed(2)} cada
                                        </p>
                                    </div>
                                    <p className="text-base font-black text-gray-900 shrink-0">
                                        R$ {item.price.toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Total */}
                        <div className="bg-white rounded-2xl border-2 border-orange-200 p-4 flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-gray-600">
                                Total
                            </span>
                            <span className="text-xl font-black text-gray-900">
                                R$ {order.totalPrice.toFixed(2)}
                            </span>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2 pt-2">
                            {currentStatus.next && (
                                <button
                                    onClick={() => onAction(currentStatus.next!)}
                                    className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-black uppercase text-sm tracking-wider hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    {currentStatus.nextLabel}
                                    <ChevronRight size={18} className="shrink-0" />
                                </button>
                            )}

                            {order.status === 'pending' && (
                                <button
                                    onClick={() => onAction('rejected')}
                                    className="w-full py-3 bg-red-50 text-red-600 border-2 border-red-200 rounded-2xl font-black uppercase text-xs tracking-wider hover:bg-red-600 hover:text-white hover:border-red-600 transition-all flex items-center justify-center gap-2"
                                >
                                    <Ban size={14} />
                                    Recusar Pedido
                                </button>
                            )}

                            <button
                                onClick={onClose}
                                className="w-full py-3 text-xs font-bold text-gray-400 hover:text-gray-600 transition-all uppercase tracking-wider"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}