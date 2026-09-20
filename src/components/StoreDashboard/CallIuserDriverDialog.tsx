// components/StoreDashboard/CallIuserDriverDialog.tsx
'use client'

import { useState } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { Truck, X } from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const VEHICLES = [
    { id: 'moto', label: 'Moto' },
    { id: 'carro', label: 'Carro' },
    { id: 'bicicleta', label: 'Bicicleta' },
] as const

interface Props {
    order: { id: string; buyer_name?: string | null; buyer_profile_slug?: string | null; deliveryFee: number; delivery_address?: string | null }
    onClose: () => void
    onDispatched: (orderId: string) => void
}

// Entrega iUser: chama um motorista da plataforma pra levar esse pedido, com
// o frete que a loja definir. Aparece pros motoristas em /aceitar-corridas.
export default function CallIuserDriverDialog({ order, onClose, onDispatched }: Props) {
    const { colors } = useTheme()
    const [vehicle, setVehicle] = useState<'moto' | 'carro' | 'bicicleta'>('moto')
    const [freight, setFreight] = useState(order.deliveryFee > 0 ? order.deliveryFee.toFixed(2) : '')
    const [busy, setBusy] = useState(false)

    const submit = async () => {
        setBusy(true)
        try {
            await callAdminApi('/api/store-orders/dispatch-driver', { orderId: order.id, vehicleType: vehicle, freight: Number(freight) })
            toast.success('Motorista chamado! Os motoristas foram avisados.')
            onDispatched(order.id)
            onClose()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao chamar motorista')
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={busy ? undefined : onClose}>
            <div className="w-full max-w-sm rounded-3xl p-6 shadow-2xl" style={{ background: colors.surface }} onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-black flex items-center gap-2" style={{ color: colors.textPrimary }}>
                        <Truck size={18} /> Entrega iUser
                    </h3>
                    <button onClick={onClose} disabled={busy}><X size={20} style={{ color: colors.textSecondary }} /></button>
                </div>
                <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>
                    Pedido de {order.buyer_profile_slug ? `@${order.buyer_profile_slug}` : order.buyer_name || 'cliente'}
                </p>
                {order.delivery_address && (
                    <p className="text-xs mb-3 font-semibold" style={{ color: colors.textPrimary }}>Entregar em: {order.delivery_address}</p>
                )}

                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Veículo</p>
                <div className="flex gap-1.5 mb-3">
                    {VEHICLES.map((v) => (
                        <button
                            key={v.id}
                            onClick={() => setVehicle(v.id)}
                            className="flex-1 py-2 rounded-full text-xs font-black"
                            style={vehicle === v.id ? { background: GRADIENT, color: '#fff' } : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>

                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Valor do frete (R$)</p>
                <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={freight}
                    onChange={(e) => setFreight(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none mb-4"
                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                />

                <button
                    onClick={submit}
                    disabled={busy || !(Number(freight) > 0)}
                    className="w-full py-3 rounded-full text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: GRADIENT }}
                >
                    {busy ? <Spinner size={14} color="#ffffff" /> : 'Chamar motorista'}
                </button>
            </div>
        </div>
    )
}
