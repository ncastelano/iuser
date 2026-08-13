// src/components/Products.tsx
'use client'

import {
    ShoppingBag,
    Pencil,
    Trash2,
    Clock,
    Plus,
    Minus,
    X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'

interface ProductProps {
    owner: {
        id: string
        name: string
        slug: string
        avatar_url?: string | null
    }
    content: {
        id: string
        name: string
        slug: string
        description?: string | null
        image_url?: string | null
        price?: number
        category?: string
        created_at: string
    }
    ownerSlug: string
    isOwner: boolean
    isInCart: boolean
    productQuantity: number
    onAddToCart: () => void
    onDecrease: () => void
    onIncrease: () => void
    onRemoveAll: () => void
    GRADIENT: string
    router: any
}

export function Products({
    owner,
    content,
    ownerSlug,
    isOwner,
    isInCart,
    productQuantity,
    onAddToCart,
    onDecrease,
    onIncrease,
    onRemoveAll,
    GRADIENT,
    router,
}: ProductProps) {
    const hasImage = content?.image_url

    const formatPostDate = (dateString: string): string => {
        const now = new Date()
        const date = new Date(dateString)
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
        const diffInMinutes = Math.floor(diffInSeconds / 60)
        const diffInHours = Math.floor(diffInMinutes / 60)
        const diffInDays = Math.floor(diffInHours / 24)
        const diffInWeeks = Math.floor(diffInDays / 7)
        const diffInMonths = Math.floor(diffInDays / 30)
        const diffInYears = Math.floor(diffInDays / 365)

        if (diffInSeconds < 60) return 'Agora mesmo'
        if (diffInMinutes < 60) return `${diffInMinutes}m`
        if (diffInHours < 24) return `${diffInHours}h`
        if (diffInDays < 7) return `${diffInDays}d`
        if (diffInWeeks < 4) return `${diffInWeeks}sem`
        if (diffInMonths < 12) return `${diffInMonths}meses`
        return `${diffInYears}anos`
    }

    return (
        <div className="relative h-[calc(100dvh-64px)] w-full overflow-hidden">
            {/* ===== CONTAINER DA IMAGEM ===== */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                {hasImage ? (
                    <div className="w-full h-full relative">
                        <img
                            src={hasImage}
                            alt={content.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                const parent = target.parentElement
                                if (parent) {
                                    const placeholder = document.createElement('div')
                                    placeholder.className = 'w-full h-full flex items-center justify-center text-6xl'
                                    placeholder.style.background = 'rgba(0,0,0,0.5)'
                                    placeholder.textContent = '🛒'
                                    parent.appendChild(placeholder)
                                }
                            }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
                    </div>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/50">
                        <div className="text-center text-white">
                            <div className="text-8xl mb-4">🛒</div>
                            <p className="text-xl font-bold uppercase tracking-widest">Produto</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== OVERLAY DE INFORMAÇÕES ===== */}
            <div className="absolute inset-0 pointer-events-none">
                {/* ===== INFO DO PRODUTO - INFERIOR ESQUERDO ===== */}
                <div className="absolute bottom-32 left-4 md:left-8 pointer-events-auto max-w-[60%]">
                    <div className="text-white space-y-3">
                        <h1 className="text-2xl font-bold">{content.name}</h1>
                        {content.description && (
                            <p className="text-sm text-white/90 line-clamp-3">{content.description}</p>
                        )}
                        {content.price !== undefined && content.price > 0 && (
                            <div className="text-3xl font-black text-orange-400">
                                R$ {content.price.toFixed(2)}
                            </div>
                        )}
                        {content.category && (
                            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase bg-orange-500/30 text-white border border-orange-500/30">
                                {content.category}
                            </span>
                        )}
                    </div>

                    {/* ===== AVATAR E NOME DO VENDEDOR ===== */}
                    <div className="flex items-center gap-3 mt-4">
                        <button
                            onClick={() => router.push(`/${ownerSlug}`)}
                            className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-white/30 hover:scale-105 transition-transform"
                            style={{ background: GRADIENT, padding: '2px' }}
                        >
                            <div className="w-full h-full rounded-full overflow-hidden bg-black/50 flex items-center justify-center">
                                {owner.avatar_url ? (
                                    <img src={owner.avatar_url} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <span className="text-lg font-black text-white">
                                        {owner.name?.charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                        </button>
                        <div>
                            <button
                                onClick={() => router.push(`/${ownerSlug}`)}
                                className="font-bold text-white hover:underline text-base"
                            >
                                {owner.name}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-white/70">
                                <span>@{owner.slug}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatPostDate(content.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ===== BOTÕES DE AÇÃO ===== */}
                    {!isOwner && (
                        <div className="mt-4 pointer-events-auto">
                            {isInCart ? (
                                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full p-2 border border-white/10">
                                    <button
                                        onClick={onDecrease}
                                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg hover:scale-110 transition-transform"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        <Minus size={18} />
                                    </button>
                                    <span className="text-lg font-bold min-w-[40px] text-center text-white">
                                        {productQuantity}
                                    </span>
                                    <button
                                        onClick={onIncrease}
                                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg hover:scale-110 transition-transform"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        <Plus size={18} />
                                    </button>
                                    <button
                                        onClick={onRemoveAll}
                                        className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 transition-transform bg-red-500/80 text-white"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={onAddToCart}
                                    className="px-6 py-3 rounded-full font-bold transition hover:scale-105 flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30"
                                >
                                    <ShoppingBag className="w-4 h-4" />
                                    Adicionar ao carrinho
                                </button>
                            )}
                        </div>
                    )}

                    {isOwner && (
                        <div className="mt-4 flex gap-3 pointer-events-auto">
                            <button
                                onClick={() => router.push(`/${ownerSlug}/${content.slug}/editar-produto`)}
                                className="px-6 py-2 rounded-full font-bold text-sm transition hover:scale-105 flex items-center gap-2 bg-orange-500 text-white"
                            >
                                <Pencil className="w-4 h-4" />
                                Editar
                            </button>
                            <button
                                onClick={async () => {
                                    if (!confirm('Tem certeza que deseja excluir este produto?')) return
                                    const { error } = await supabase
                                        .from('products')
                                        .delete()
                                        .eq('id', content.id)
                                    if (!error) {
                                        toast.success('Removido com sucesso!')
                                        router.push(`/${ownerSlug}`)
                                    } else {
                                        toast.error('Erro ao remover')
                                    }
                                }}
                                className="px-6 py-2 rounded-full font-bold text-sm transition hover:scale-105 flex items-center gap-2 bg-red-500 text-white"
                            >
                                <Trash2 className="w-4 h-4" />
                                Excluir
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}