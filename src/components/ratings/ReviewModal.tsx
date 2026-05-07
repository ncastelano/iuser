'use client'

import { useState } from 'react'
import { Star, X, Loader2, User, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface ReviewModalProps {
    isOpen: boolean
    onClose: () => void
    orderId: string
    productId: string
    productName: string
    storeId: string
    onSuccess?: () => void
}

export function ReviewModal({ isOpen, onClose, orderId, productId, productName, storeId, onSuccess }: ReviewModalProps) {
    const [rating, setRating] = useState(5)
    const [comment, setComment] = useState('')
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    if (!isOpen) return null

    const handleSubmit = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            toast.error('Você precisa estar logado para avaliar.')
            setLoading(false)
            return
        }

        const { error } = await supabase.from('product_reviews').insert({
            store_id: storeId,
            product_id: productId,
            profile_id: user.id,
            order_id: orderId,
            rating,
            comment,
            is_anonymous: false
        })

        if (error) {
            if (error.code === '23505') {
                toast.error('Você já avaliou este produto nesta compra.')
            } else {
                toast.error('Erro ao enviar avaliação: ' + error.message)
            }
        } else {
            toast.success('Avaliação enviada com sucesso!')
            if (onSuccess) onSuccess()
            onClose()
        }
        setLoading(false)
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="relative p-6 border-b border-orange-100">
                    <button 
                        onClick={onClose}
                        className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} className="text-gray-400" />
                    </button>
                    <h3 className="text-xl font-black italic text-gray-900 uppercase tracking-tighter">Avaliar Produto</h3>
                    <p className="text-xs font-bold text-orange-500 mt-1 uppercase tracking-wider">{productName}</p>
                </div>

                <div className="p-6 space-y-6">
                    {/* Stars */}
                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => setRating(star)}
                                className="transition-transform active:scale-90"
                            >
                                <Star
                                    size={36}
                                    className={`${
                                        star <= rating 
                                            ? 'fill-orange-500 text-orange-500' 
                                            : 'text-gray-200'
                                    } transition-colors`}
                                />
                            </button>
                        ))}
                    </div>

                    {/* Comment */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">O que você achou?</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Conte sua experiência..."
                            className="w-full bg-orange-50/50 border-2 border-orange-100 rounded-2xl p-4 text-sm focus:outline-none focus:border-orange-500 min-h-[120px] transition-all"
                        />
                    </div>

                </div>

                <div className="p-6 pt-0">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : 'Enviar Avaliação'}
                    </button>
                </div>
            </div>
        </div>
    )
}
