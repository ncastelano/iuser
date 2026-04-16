'use client'

import { useState } from 'react'
import { Zap, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface FlashPostModalProps {
    isOpen: boolean
    onClose: () => void
    storeId: string
    productId?: string
    type: 'new_product' | 'price_change' | 'manual'
    title: string
    content: string
    oldPrice?: number
    newPrice?: number
    imageUrl?: string | null
}

export function FlashPostModal({
    isOpen,
    onClose,
    storeId,
    productId,
    type,
    title,
    content,
    oldPrice,
    newPrice,
    imageUrl
}: FlashPostModalProps) {
    const [loading, setLoading] = useState(false)
    const [posted, setPosted] = useState(false)
    const supabase = createClient()

    if (!isOpen) return null

    const handlePost = async () => {
        setLoading(true)
        try {
            const { error } = await supabase.from('flash_posts').insert({
                store_id: storeId,
                product_id: productId,
                type,
                title,
                content,
                old_price: oldPrice,
                new_price: newPrice,
                image_url: imageUrl
            })

            if (error) throw error

            setPosted(true)
            setTimeout(() => {
                onClose()
            }, 2000)
        } catch (error) {
            console.error('Error posting to flash:', error)
            alert('Erro ao postar no Flash')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[200] p-4">
            <div className="bg-neutral-900 border border-white/10 rounded-[40px] max-w-md w-full p-8 shadow-2xl relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full" />
                
                {!posted ? (
                    <>
                        <div className="flex justify-between items-start mb-8 relative z-10">
                            <div className="w-16 h-16 bg-yellow-500 text-black rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                                <Zap className="w-8 h-8 fill-black" />
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4 mb-10 relative z-10">
                            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">Postar no Flash?</h2>
                            <p className="text-neutral-400 text-sm leading-relaxed">
                                {type === 'new_product' 
                                    ? "Acabamos de detectar um novo produto incrível. Quer compartilhar com todos na aba Flash?" 
                                    : "Uma mudança de preço merece destaque! Quer avisar seus clientes sobre essa novidade?"}
                            </p>
                        </div>

                        <div className="bg-black/40 border border-white/5 p-5 rounded-3xl mb-10 space-y-3">
                            <h4 className="font-bold text-yellow-500 text-xs uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                                Preview do Post
                            </h4>
                            <div className="flex items-center gap-4">
                                {imageUrl && (
                                    <img src={supabase.storage.from('product-images').getPublicUrl(imageUrl).data.publicUrl} className="w-12 h-12 rounded-xl object-cover" alt="" />
                                )}
                                <div className="min-w-0">
                                    <p className="text-white font-bold truncate">{title}</p>
                                    <p className="text-neutral-500 text-[10px] uppercase font-black">{type === 'price_change' ? 'Alteração de Preço' : 'Novo Produto'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 relative z-10">
                            <button
                                onClick={handlePost}
                                disabled={loading}
                                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] transition-all shadow-xl disabled:opacity-50"
                            >
                                {loading ? 'Publicando...' : 'Sim, Postar Agora!'}
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full py-4 text-neutral-500 hover:text-white font-black uppercase text-[10px] tracking-widest transition-colors"
                            >
                                Agora não
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                        <div className="w-20 h-20 bg-green-500 text-black rounded-full flex items-center justify-center animate-bounce shadow-[0_0_40px_rgba(34,197,94,0.3)]">
                            <Check size={40} strokeWidth={4} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black italic uppercase tracking-tighter">Publicado!</h3>
                            <p className="text-neutral-400 text-sm uppercase font-black tracking-widest">Seu post já está no Flash</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
