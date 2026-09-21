// src/components/AddToCartModal.tsx
//
// Etapas ao adicionar um produto ao carrinho: observação/remover algo
// (sempre) e, se a loja tiver habilitado pro produto, escolher adicionais
// (cada um com seu próprio preço, definido pela loja). Usado tanto no
// catálogo quanto na página de produto — mesmo comportamento nos dois.
//
// Quando são várias unidades de uma vez (ex: 2 x-tudo), primeiro pergunta se
// a personalização vale pra todas (mesmas etapas de quando é 1 só) ou se
// cada unidade tem a sua (uma rodada de etapas por unidade).
'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { supabase } from '@/lib/supabase/client'
import type { CartAddon } from '@/store/useCartStore'
import FallbackImage from '@/components/FallbackImage'

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

export interface AddToCartUnit {
    comment: string | undefined
    addons: CartAddon[]
}

interface AddToCartModalProps {
    product: AddToCartProduct
    onClose: () => void
    /** Personalização única, vale pra todas as unidades. */
    onConfirm: (comment: string | undefined, addons: CartAddon[]) => void
    /** Uma personalização por unidade (só usado quando quantity > 1). */
    onConfirmEach?: (units: AddToCartUnit[]) => void
    /** Quantas unidades estão sendo adicionadas de uma vez. */
    quantity?: number
    colors: any
    /** Foto da loja: usada como imagem de fallback quando o produto não tem foto própria. */
    storeImageUrl?: string | null
    /** Nome da loja: usado pra mostrar a inicial dela quando não há foto do produto nem logo da loja. */
    storeName?: string
}

interface UnitDraft {
    comment: string
    ids: string[]
}

export default function AddToCartModal({ product, onClose, onConfirm, onConfirmEach, quantity = 1, colors, storeImageUrl = null, storeName = '' }: AddToCartModalProps) {
    const qty = Math.max(1, quantity)
    // Só oferece "cada um" se quem chamou sabe tratar (onConfirmEach).
    const canCustomizeEach = qty > 1 && !!onConfirmEach
    const [mode, setMode] = useState<'all' | 'each'>('all')
    const [step, setStep] = useState<'modo' | 'observacao' | 'adicionais'>(canCustomizeEach ? 'modo' : 'observacao')
    const [unit, setUnit] = useState(0)
    const [units, setUnits] = useState<UnitDraft[]>(() => Array.from({ length: qty }, () => ({ comment: '', ids: [] })))
    const current = units[unit]
    const commentText = current.comment
    const setCommentText = (comment: string) => setUnits((prev) => prev.map((u, i) => (i === unit ? { ...u, comment } : u)))
    const [productAddons, setProductAddons] = useState<ProductAddonRow[]>([])
    const [loadingAddons, setLoadingAddons] = useState(false)
    const selectedIds = new Set(current.ids)

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
        setUnits((prev) => prev.map((u, i) => {
            if (i !== unit) return u
            const ids = u.ids.includes(id) ? u.ids.filter((x) => x !== id) : [...u.ids, id]
            return { ...u, ids }
        }))
    }

    const formatPrice = (price: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)

    const toAddons = (ids: string[]): CartAddon[] =>
        productAddons.filter((a) => ids.includes(a.id)).map((a) => ({ id: a.id, name: a.name, price: a.price }))

    const handleConfirm = () => {
        if (mode === 'each' && onConfirmEach) {
            onConfirmEach(units.map((u) => ({ comment: u.comment.trim() || undefined, addons: toAddons(u.ids) })))
            return
        }
        onConfirm(commentText.trim() || undefined, toAddons(current.ids))
    }

    const isLastUnit = mode !== 'each' || unit === qty - 1

    // Fecha a rodada da unidade atual: no modo "cada um" vai pra próxima
    // unidade (já começando igual à anterior, só ajustar o que muda); na
    // última, ou no modo "todos", confirma.
    const finishUnit = () => {
        if (isLastUnit) {
            handleConfirm()
            return
        }
        setUnits((prev) => prev.map((u, i) => (i === unit + 1 && !u.comment && u.ids.length === 0 ? { ...prev[unit] } : u)))
        setUnit(unit + 1)
        setStep('observacao')
    }

    const goBack = () => {
        if (step === 'adicionais') {
            setStep('observacao')
        } else if (mode === 'each' && unit > 0) {
            setUnit(unit - 1)
            setStep(product.has_addons ? 'adicionais' : 'observacao')
        } else if (canCustomizeEach) {
            setStep('modo')
        } else {
            onClose()
        }
    }

    const chooseMode = (m: 'all' | 'each') => {
        setMode(m)
        setUnit(0)
        setStep('observacao')
    }

    const stepsPerUnit = product.has_addons ? 2 : 1
    const stepNumber = step === 'adicionais' ? 2 : 1
    const unitNoun = qty > 1 ? `${qty} unidades` : ''
    const stepLabel = step === 'adicionais' ? 'Adicionais' : 'Observação'

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
                        {step !== 'modo' && (product.has_addons || mode === 'each') && (
                            <p className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: '#f97316' }}>
                                {mode === 'each' ? `Produto ${unit + 1} de ${qty} · ` : ''}
                                {stepsPerUnit > 1 ? `Etapa ${stepNumber} de ${stepsPerUnit} · ` : ''}{stepLabel}
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
                        <FallbackImage
                            srcs={[product.image_url, storeImageUrl]}
                            alt={product.name}
                            name={storeName}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: textColor }}>
                            {product.name}
                        </p>
                        <p className="text-sm font-bold" style={{ color: '#f97316' }}>
                            {formatPrice(product.price)}{qty > 1 ? ` cada · ${unitNoun}` : ''}
                        </p>
                    </div>
                    {qty > 1 && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-black flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                            {mode === 'each' ? `${unit + 1}/${qty}` : `×${qty}`}
                        </span>
                    )}
                </div>

                {step === 'modo' && (
                    <>
                        <p className="text-sm font-bold mb-1" style={{ color: textColor }}>
                            Você está adicionando {qty} × {product.name}
                        </p>
                        <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                            Como você quer personalizar?
                        </p>
                        <div className="space-y-2 mb-4">
                            <button
                                onClick={() => chooseMode('all')}
                                className="w-full p-3 rounded-xl border-2 text-left transition hover:scale-[1.01] active:scale-95"
                                style={{ borderColor: '#f97316', background: `${colors.accent}10` }}
                            >
                                <p className="text-sm font-black" style={{ color: textColor }}>Igual para todos</p>
                                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                    Uma observação e os mesmos adicionais valem para os {qty} {product.name}.
                                </p>
                            </button>
                            <button
                                onClick={() => chooseMode('each')}
                                className="w-full p-3 rounded-xl border-2 text-left transition hover:scale-[1.01] active:scale-95"
                                style={{ borderColor: colors.border, background: 'transparent' }}
                            >
                                <p className="text-sm font-black" style={{ color: textColor }}>Personalizar cada um</p>
                                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                    Cada {product.name} tem a sua observação e os seus adicionais, um de cada vez.
                                </p>
                            </button>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-full py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                            style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                        >
                            Cancelar
                        </button>
                    </>
                )}

                {step === 'modo' ? null : step === 'observacao' ? (
                    <>
                        <div className="mb-4">
                            <label className="text-sm font-medium block mb-1" style={{ color: textColor }}>
                                {mode === 'each'
                                    ? `Quer remover algo ou deixar uma observação no produto ${unit + 1}? (opcional)`
                                    : qty > 1
                                        ? `Observação para os ${qty} produtos (opcional)`
                                        : 'Quer remover algo ou deixar uma observação? (opcional)'}
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
                                onClick={goBack}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                            >
                                {canCustomizeEach || (mode === 'each' && unit > 0) ? 'Voltar' : 'Cancelar'}
                            </button>
                            <button
                                onClick={() => (product.has_addons ? setStep('adicionais') : finishUnit())}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 14px #f9731660` }}
                            >
                                {product.has_addons ? 'Continuar' : isLastUnit ? 'Adicionar' : `Próximo produto (${unit + 2}/${qty})`}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="mb-4">
                            <label className="text-sm font-medium block mb-2" style={{ color: textColor }}>
                                {mode === 'each' ? `Adicionar algo a mais no produto ${unit + 1}?` : qty > 1 ? `Adicionar algo a mais nos ${qty} produtos?` : 'Adicionar algo a mais?'}
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
                                onClick={goBack}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                            >
                                Voltar
                            </button>
                            <button
                                onClick={finishUnit}
                                className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 14px #f9731660` }}
                            >
                                {isLastUnit ? (qty > 1 && mode === 'all' ? `Adicionar ${qty}` : 'Adicionar') : `Próximo produto (${unit + 2}/${qty})`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
