'use client'

import { useState } from 'react'
import { Star, X, Loader2 } from 'lucide-react'
import { createClient } from '../lib/supabase/client'

interface RatingModalProps {
    isOpen: boolean
    onClose: () => void
    storeId?: string
    productId?: string
    itemName: string
    onRatingComplete?: () => void
}

export default function RatingModal({ isOpen, onClose, storeId, productId, itemName, onRatingComplete }: RatingModalProps) {
    const [rating, setRating] = useState(0)
    const [hover, setHover] = useState(0)
    const [comment, setComment] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    if (!isOpen) return null

    const handleSubmit = async () => {
        if (rating === 0) {
            setError('Por favor, selecione uma nota de 1 a 5 estrelas.')
            return
        }

        setLoading(true)
        setError(null)

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            setError('Você precisa estar logado para avaliar.')
            setLoading(false)
            return
        }

        const { error: ratingError } = await supabase
            .from('ratings')
            .upsert({
                user_id: user.id,
                store_id: storeId || null,
                product_id: productId || null,
                rating: rating,
                comment: comment,
            })

        if (ratingError) {
            console.error('Erro ao enviar avaliação:', ratingError)
            if (ratingError.code === '23505') {
                setError('Você já avaliou este item.')
            } else {
                setError('Erro ao enviar avaliação. Tente novamente.')
            }
            setLoading(false)
            return
        }

        setSuccess(true)
        setLoading(false)
        if (onRatingComplete) onRatingComplete()
        
        setTimeout(() => {
            onClose()
            setSuccess(false)
            setRating(0)
            setComment('')
        }, 2000)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white">Avaliar {itemName}</h2>
                        <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {success ? (
                        <div className="text-center py-8 flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                                <Star className="w-8 h-8 text-green-500 fill-green-500" />
                            </div>
                            <h3 className="text-lg font-bold text-white">Obrigado!</h3>
                            <p className="text-neutral-400">Sua avaliação foi enviada com sucesso.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            className="transition-transform active:scale-90"
                                            onMouseEnter={() => setHover(star)}
                                            onMouseLeave={() => setHover(0)}
                                            onClick={() => setRating(star)}
                                        >
                                            <Star
                                                className={`w-10 h-10 transition-colors ${
                                                    (hover || rating) >= star
                                                        ? 'text-yellow-400 fill-yellow-400'
                                                        : 'text-neutral-700'
                                                }`}
                                            />
                                        </button>
                                    ))}
                                </div>
                                <p className="text-sm font-medium text-neutral-400 h-5">
                                    {hover === 1 || (!hover && rating === 1) ? 'Muito ruim' :
                                     hover === 2 || (!hover && rating === 2) ? 'Ruim' :
                                     hover === 3 || (!hover && rating === 3) ? 'Bom' :
                                     hover === 4 || (!hover && rating === 4) ? 'Muito bom' :
                                     hover === 5 || (!hover && rating === 5) ? 'Excelente' : ''}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest px-1">
                                    Comentário (opcional)
                                </label>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Conte-nos o que achou..."
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl p-4 text-white text-sm focus:border-white/20 focus:ring-1 focus:ring-white/20 transition-all outline-none min-h-[100px] resize-none"
                                />
                            </div>

                            {error && (
                                <p className="text-red-500 text-xs text-center font-medium bg-red-500/10 py-2 rounded-lg">
                                    {error}
                                </p>
                            )}

                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                                Enviar Avaliação
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
