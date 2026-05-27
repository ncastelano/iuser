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
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-[2.5rem] shadow-2xl flex flex-col animate-in fade-in zoom-in duration-300 border-0 overflow-hidden">

                {/* Header */}
                <div className="relative p-6 border-b border-orange-100 bg-white shrink-0">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} className="text-gray-400" />
                    </button>
                    
                    <div className="flex items-center gap-3 mb-1">
                         <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${currentStatus.color} flex items-center justify-center shadow-lg transform -rotate-3`}>
                            <StatusIcon size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black italic text-gray-900 uppercase tracking-tighter">Gerenciar Pedido</h3>
                            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">#{order.checkout_id.slice(0, 8)} • @{order.buyer_profile_slug}</p>
                        </div>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center gap-1 mt-6">
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
                                <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive || isCompleted
                                            ? 'bg-orange-500 text-white shadow-md'
                                            : 'bg-orange-50 text-orange-200'
                                        }`}>
                                        <StepIcon size={14} />
                                    </div>
                                    <span className={`text-[7px] font-black uppercase tracking-wider text-center leading-tight ${isActive || isCompleted ? 'text-orange-600' : 'text-gray-300'
                                        }`}>
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
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-4 bg-white rounded-2xl border border-orange-100 shadow-sm hover:shadow-md transition-all group"
                                >
                                    <div className="flex-1 min-w-0 mr-3">
                                        <p className="text-sm font-bold text-gray-800 truncate group-hover:text-orange-600 transition-colors">
                                            {item.product_name}
                                        </p>
                                        <p className="text-[10px] text-gray-500 font-bold mt-0.5 uppercase tracking-tight">
                                            {item.quantity} unidade(s) • R$ {(item.price / item.quantity).toFixed(2)} un.
                                        </p>
                                    </div>
                                    <p className="text-base font-black text-gray-900 shrink-0">
                                        R$ {item.price.toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Total */}
                        <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl p-5 flex items-center justify-between shadow-lg text-white">
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-80">
                                    Valor Total
                                </span>
                                <span className="text-2xl font-black">
                                    R$ {order.totalPrice.toFixed(2)}
                                </span>
                            </div>
                            <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-2xl">
                                <span className="text-[10px] font-black uppercase">{order.items.length} itens</span>
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
                                    <Ban size={14} />
                                    Recusar Pedido
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