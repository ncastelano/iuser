'use client'

import { X, CheckCircle2, ChevronRight } from 'lucide-react'
import { GroupedOrder } from '../types'

const statusMap = {
    'pending': { label: 'Novo Pedido', color: 'from-blue-500 to-indigo-500', next: 'preparing', nextLabel: 'Aceitar Pedido' },
    'preparing': { label: 'Em Preparo', color: 'from-yellow-500 to-amber-500', next: 'ready', nextLabel: 'Pedido Pronto' },
    'ready': { label: 'Pronto', color: 'from-purple-500 to-pink-500', next: 'paid', nextLabel: 'Finalizar Venda' },
    'paid': { label: 'Finalizado', color: 'from-green-500 to-emerald-500', next: null, nextLabel: '' },
    'rejected': { label: 'Recusado', color: 'from-red-500 to-rose-500', next: null, nextLabel: '' }
}

interface OrderModalProps {
    order: GroupedOrder
    onClose: () => void
    onAction: (status: string) => void
}

export function OrderModal({ order, onClose, onAction }: OrderModalProps) {
    const currentStatus = statusMap[order.status as keyof typeof statusMap] || statusMap['pending']

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[90vh] flex flex-col">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5 text-white">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-black opacity-80 uppercase tracking-wider">#{order.checkout_id.slice(0, 8)}</p>
                            <h2 className="text-2xl font-black italic tracking-tighter">@{order.buyer_profile_slug}</h2>
                        </div>
                        <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                            {currentStatus.label}
                        </div>
                    </div>

                    <div className="flex justify-between mt-4">
                        {['pending', 'preparing', 'ready', 'paid'].map((s, idx) => {
                            const isActive = order.status === s;
                            const isCompleted = ['pending', 'preparing', 'ready', 'paid'].indexOf(order.status) > idx;
                            return (
                                <div key={s} className="flex flex-col items-center gap-1 flex-1">
                                    <div className={`w-2 h-2 rounded-full transition-all ${isActive || isCompleted ? 'bg-white scale-110' : 'bg-white/30'}`} />
                                    <span className={`text-[8px] font-black uppercase tracking-wider ${isActive || isCompleted ? 'text-white' : 'text-white/50'}`}>
                                        {s === 'pending' ? 'Novo' : s === 'preparing' ? 'Prep' : s === 'ready' ? 'Pronto' : 'Pago'}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-orange-50/30">
                    <div className="space-y-3">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-orange-100">
                                <div className="flex-1">
                                    <p className="text-sm font-black uppercase tracking-tight text-gray-800">{item.product_name}</p>
                                    <p className="text-[10px] text-gray-500 font-bold mt-1">{item.quantity}x • R$ {(item.price / item.quantity).toFixed(2)}</p>
                                </div>
                                <p className="text-lg font-black italic text-gray-900">R$ {item.price.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-orange-200 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Total do Pedido</span>
                        <span className="text-2xl font-black italic text-gray-900">R$ {order.totalPrice.toFixed(2)}</span>
                    </div>

                    <div className="space-y-3">
                        {currentStatus.next && (
                            <button
                                onClick={() => onAction(currentStatus.next!)}
                                className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-sm tracking-wider hover:shadow-lg transition-all active:scale-98"
                            >
                                {currentStatus.nextLabel}
                            </button>
                        )}

                        {order.status === 'pending' && (
                            <button
                                onClick={() => onAction('rejected')}
                                className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-black uppercase text-[10px] tracking-wider hover:bg-red-600 hover:text-white transition-all"
                            >
                                Recusar Pedido
                            </button>
                        )}

                        <button onClick={onClose} className="w-full py-3 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-all">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}