// src/components/AddToCartModal.tsx
//
// Etapas ao adicionar um produto ao carrinho: observação/remover algo
// (sempre) e, se a loja tiver habilitado pro produto, escolher adicionais
// (cada um com seu próprio preço, definido pela loja). Usado tanto no
// catálogo quanto na página de produto — mesmo comportamento nos dois.
'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { supabase } from '@/lib/supabase/client'
import type { CartAddon } from '@/store/useCartStore'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export interface AddToCartProduct {
    id: string
    name: string
    price: number
    image_url: string | null
    has_addons?: boolean
}

interface ProductAddonRow {
    id: string
    name: string
    price: number
}

interface AddToCartModalProps {
    product: AddToCartProduct
    onClose: () => void
    onConfirm: (comment: string | undefined, addons: CartAddon[]) => void
    colors: any
    /** Foto da loja: usada como imagem de fallback quando o produto não tem foto própria. */
    storeImageUrl?: string | null
}

export default function AddToCartModal({ product, onClose, onConfirm, colors, storeImageUrl = null }: AddToCartModalProps) {
    const [step, setStep] = useState<'observacao' | 'adicionais'>('observacao')
    const [commentText, setCommentText] = useState('')
    const [productAddons, setProductAddons] = useState<ProductAddonRow[]>([])
    const [loadingAddons, setLoadingAddons] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (!product.has_addons) {
            setProductAddons([])
            return
        }
        let active = true
        setLoadingAddons(true)
        supabase
            .from('product_addons')
            .select('id, name, price')
            .eq('product_id', product.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .then(({ data }) => {
                if (!active) return
                setProductAddons((data || []) as ProductAddonRow[])
                setLoadingAddons(false)
            })
        return () => { active = false }
    }, [product.id, product.has_addons])

    const toggleAddon = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const formatPrice = (price: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)

    const handleConfirm = () => {
        const chosen: CartAddon[] = productAddons
            .filter((a) => selectedIds.has(a.id))
            .map((a) => ({ id: a.id, name: a.name, price: a.price }))
        onConfirm(commentText.trim() || undefined, chosen)
    }

    const textColor = colors.textPrimary

    return (
        <div
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto"
                style={{ background: colors.surface }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div>
                        {product.has_addons && (
                            <p className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: '#f97316' }}>
                                Etapa {step === 'observacao' ? '1' : '2'} de 2 · {step === 'observacao' ? 'Observação' : 'Adicionais'}
                            </p>
                        )}
                        <h3 className="text-lg font-black" style={{ color: textColor }}>
                            Adicionar ao Carrinho
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-black/5 transition"
                        style={{ color: colors.textSecondary }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl mb-4" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : storeImageUrl ? (
                            <img src={storeImageUrl} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: textColor }}>
                            {product.name}
                        </p>
                        <p className="text-sm font-bold" style={{ color: '#f97316' }}>
                            {formatPrice(product.price)}
                        </p>
                    </div>
                </div>

                {step === 'observacao' ? (
                    <>
                        <div className="mb-4">
                            <label className="text-sm font-medium block mb-1" style={{ color: textColor }}>
                                Quer remover algo ou deixar uma observação? (opcional)
                            </label>
                            <textarea
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="Ex: Sem cebola, ponto da carne, etc..."
                                className="w-full p-3 rounded-xl resize-none text-sm"
                                style={{
                                    background: `${colors.surface}44`,
                                    border: `1px solid ${colors.border}`,
                                    color: textColor,
                                    minHeight: 80,
                                    outline: 'none',
                                }}
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => (product.has_addons ? setStep('adicionais') : handleConfirm())}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 14px #f9731660` }}
                            >
                                {product.has_addons ? 'Continuar' : 'Adicionar'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="mb-4">
                            <label className="text-sm font-medium block mb-2" style={{ color: textColor }}>
                                Quer adicionar algum adicional?
                            </label>
                            {loadingAddons ? (
                                <div className="flex justify-center py-6">
                                    <Spinner size={20} color={colors.accent} />
                                </div>
                            ) : productAddons.length === 0 ? (
                                <p className="text-xs py-2" style={{ color: colors.textSecondary }}>
                                    Essa loja ainda não cadastrou adicionais pra esse produto.
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                                    {productAddons.map((addon) => {
                                        const selected = selectedIds.has(addon.id)
                                        return (
                                            <button
                                                key={addon.id}
                                                onClick={() => toggleAddon(addon.id)}
                                                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border-2 text-left transition hover:scale-[1.01] active:scale-95"
                                                style={selected
                                                    ? { borderColor: '#f97316', background: `${colors.accent}10` }
                                                    : { borderColor: colors.border, background: 'transparent' }}
                                            >
                                                {selected ? (
                                                    <CheckCircle2 size={18} style={{ color: '#f97316', flexShrink: 0 }} />
                                                ) : (
                                                    <div className="w-[18px] h-[18px] rounded-full border-2 flex-shrink-0" style={{ borderColor: colors.border }} />
                                                )}
                                                <span className="flex-1 text-sm font-bold truncate" style={{ color: textColor }}>
                                                    {addon.name}
                                                </span>
                                                <span className="text-xs font-black flex-shrink-0" style={{ color: '#f97316' }}>
                                                    + {formatPrice(addon.price)}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('observacao')}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                            >
                                Voltar
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 14px #f9731660` }}
                            >
                                Adicionar
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
