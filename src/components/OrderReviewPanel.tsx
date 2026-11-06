// src/components/OrderReviewPanel.tsx
//
// Troca de avaliações em uma compra, quando a LOJA ligou isso: depois do pedido concluído a loja avalia o cliente e os
// dois lados veem a avaliação um do outro (a do cliente pra loja é a de product_reviews). Fica escondido se a loja
// não quis mostrar. Serve tanto no painel da loja (OrderModal) quanto em "Meus pedidos".
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { Spinner } from '@/components/Spinner'

interface State {
    enabled: boolean
    role: 'store' | 'buyer'
    paid: boolean
    store_name: string
    can_review: boolean
    store_review: { rating: number; comment: string | null } | null
    buyer_review: { rating: number; comment: string | null } | null
}

const Stars = ({ value }: { value: number }) => (
    <span className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} className={n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />)}
    </span>
)

export default function OrderReviewPanel({ orderId, className = '' }: { orderId?: string | null; className?: string }) {
    const [state, setState] = useState<State | null>(null)
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState('')
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        if (!orderId) return
        const { data } = await supabase.rpc('get_order_review_state', { p_order: orderId })
        setState((data as State | null) || null)
    }, [orderId])

    useEffect(() => { load() }, [load])

    if (!state || !state.enabled || !state.paid) return null

    const send = async () => {
        if (rating < 1 || !orderId) { toast.error('Escolha de 1 a 5 estrelas'); return }
        setBusy(true)
        const { error } = await supabase.rpc('review_customer', { p_order: orderId, p_rating: rating, p_comment: comment.trim() || null })
        setBusy(false)
        if (error) { toast.error(error.message); return }
        toast.success('Avaliação enviada')
        await load()
    }

    const isStore = state.role === 'store'

    return (
        <div className={`rounded-xl border p-3 flex flex-col gap-2.5 ${className}`} style={{ borderColor: '#eab30855', background: '#eab30812' }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-yellow-600">Troca de avaliações</p>

            {/* A avaliação que a loja deu pro cliente */}
            {state.store_review ? (
                <div>
                    <p className="text-[11px] font-bold opacity-70">{isStore ? 'Sua avaliação do cliente' : `${state.store_name} avaliou você`}</p>
                    <Stars value={state.store_review.rating} />
                    {state.store_review.comment && <p className="text-xs mt-0.5 break-words">“{state.store_review.comment}”</p>}
                </div>
            ) : isStore && state.can_review ? (
                <div className="flex flex-col gap-2">
                    <p className="text-xs font-black">Avalie este cliente</p>
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} onClick={() => setRating(n)} aria-label={`${n} estrelas`}>
                                <Star size={24} className={n <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Como foi atender esse cliente? (opcional)"
                        className="w-full resize-none rounded-lg px-3 py-2 text-sm border focus:outline-none bg-transparent"
                    />
                    <button
                        onClick={send}
                        disabled={busy || rating < 1}
                        className="w-full py-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                        style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                    >
                        {busy ? <Spinner size={14} color="#fff" /> : 'Enviar avaliação'}
                    </button>
                </div>
            ) : (
                <p className="text-[11px] opacity-70">{isStore ? 'Sem avaliação do cliente ainda.' : `${state.store_name} ainda não avaliou esta compra.`}</p>
            )}

            {/* A avaliação que o cliente deu pra loja */}
            {state.buyer_review && (
                <div>
                    <p className="text-[11px] font-bold opacity-70">{isStore ? 'O cliente avaliou a loja' : 'Sua avaliação da loja'}</p>
                    <Stars value={state.buyer_review.rating} />
                    {state.buyer_review.comment && <p className="text-xs mt-0.5 break-words">“{state.buyer_review.comment}”</p>}
                </div>
            )}
        </div>
    )
}
