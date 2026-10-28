// components/StoreDashboard/CallIuserDriverDialog.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'
import { Star, Truck, X } from 'lucide-react'
import { acceptedOnly, fetchStoreFavorites, windowLabel, type FavoritesState } from '@/modules/favorites'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
interface Props {
    /** a loja do pedido: é ela que tem (ou não) motoristas favoritos */
    storeId?: string
    order: { id: string; buyer_name?: string | null; buyer_profile_slug?: string | null; deliveryFee: number; delivery_address?: string | null }
    onClose: () => void
    onDispatched: (orderId: string) => void
}

// Entrega iUser: chama um motorista da plataforma pra levar esse pedido, com
// o frete da Tarifa iUser (a taxa que o cliente pagou). Aparece pros motoristas em /aceitar-corridas.
export default function CallIuserDriverDialog({ storeId, order, onClose, onDispatched }: Props) {
    const { colors } = useTheme()
    const [busy, setBusy] = useState(false)
    // Favoritos: só aparece a escolha se a loja tem favorito aceito; começa no padrão da loja ("favoritos primeiro" ligado ou não)
    const [fav, setFav] = useState<FavoritesState | null>(null)
    const [mode, setMode] = useState<'favorites' | 'all'>('all')
    useEffect(() => {
        if (!storeId) return
        fetchStoreFavorites(storeId).then((f) => { setFav(f); setMode(f.favoritesFirst && acceptedOnly(f.items).length > 0 ? 'favorites' : 'all') }).catch(() => { })
    }, [storeId])
    const hasFavorites = !!fav && acceptedOnly(fav.items).length > 0

    const submit = async () => {
        setBusy(true)
        try {
            const res = await callAdminApi('/api/store-orders/dispatch-driver', { orderId: order.id, ...(hasFavorites ? { mode } : {}) }) as { favoritesFirst?: { available?: boolean } | null } | undefined
            if (hasFavorites && mode === 'favorites') {
                toast.success(res?.favoritesFirst?.available ? `Seus favoritos foram avisados primeiro (${windowLabel(fav!.windowSeconds)}).` : 'Nenhum favorito disponível agora: avisei todos os motoristas.')
            } else toast.success('Motorista chamado! Os motoristas foram avisados.')
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
                        <Truck size={18} /> Chamar motorista
                    </h3>
                    <button onClick={onClose} disabled={busy}><X size={20} style={{ color: colors.textSecondary }} /></button>
                </div>
                <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>
                    Pedido de {order.buyer_profile_slug ? `@${order.buyer_profile_slug}` : order.buyer_name || 'cliente'}
                </p>
                {order.delivery_address && (
                    <p className="text-xs mb-4 font-semibold" style={{ color: colors.textPrimary }}>Entregar em: {order.delivery_address}</p>
                )}

                <div className="rounded-2xl p-3 mb-4 flex items-center justify-between" style={{ background: '#f9731612', border: '1px solid #f9731640' }}>
                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Frete do motorista</span>
                    <span className="text-base font-black" style={{ color: '#f97316' }}>R$ {order.deliveryFee.toFixed(2)}</span>
                </div>
                <p className="text-[11px] mb-4" style={{ color: colors.textSecondary }}>
                    É a taxa de entrega que o cliente pagou, definida pela tarifa do iUser. O primeiro motorista que aceitar fica com a entrega.
                </p>

                {hasFavorites && (
                    <div className="mb-4">
                        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-full" style={{ background: `${colors.border}40` }}>
                            {([['favorites', 'Favoritos primeiro'], ['all', 'Todos']] as const).map(([k, label]) => (
                                <button key={k} type="button" onClick={() => setMode(k)} disabled={busy}
                                    className="h-9 rounded-full text-xs font-black flex items-center justify-center gap-1 transition active:scale-95"
                                    style={mode === k ? { background: '#f97316', color: '#fff' } : { color: colors.textSecondary }}>
                                    {k === 'favorites' && <Star size={12} />}{label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] mt-1.5" style={{ color: colors.textSecondary }}>
                            {mode === 'favorites'
                                ? `Seus ${acceptedOnly(fav!.items).length} favoritos recebem a entrega por ${windowLabel(fav!.windowSeconds)}; se nenhum estiver disponível, vai para todos.`
                                : 'A entrega vai para todos os motoristas do raio ao mesmo tempo.'}
                        </p>
                    </div>
                )}

                <button
                    onClick={submit}
                    disabled={busy || !(order.deliveryFee > 0)}
                    className="w-full py-3 rounded-full text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: GRADIENT }}
                >
                    {busy ? <Spinner size={14} color="#ffffff" /> : 'Chamar motorista'}
                </button>
            </div>
        </div>
    )
}
