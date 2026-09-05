// src/app/(main)/[ownerSlug]/catalogo/CatalogBag.tsx
'use client'

import { ReactNode } from 'react'
import { ShoppingBag, Minus, Plus, Trash2, MessageCircle, MapPin } from 'lucide-react'
import { toast } from 'sonner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export interface CartItemWithComment {
    product: any
    quantity: number
    comment?: string
}

interface CatalogBagProps {
    bagItems: CartItemWithComment[]
    isExpanded: boolean
    onToggleExpanded: () => void
    onIncrease: (product: any, comment?: string) => void
    onDecrease: (productId: string, comment?: string) => void
    onRemove: (productId: string, comment?: string) => void
    onCheckout: () => void
    colors: any
    isStoreOpen?: boolean
    deliveryFeeType?: 'free' | 'fixed' | 'distance' | 'none'
    deliveryFee?: number
    deliveryFeeIsEstimate?: boolean
    deliveryDistanceKm?: number | null
    deliveryOrigin?: string | null
    deliveryDestination?: string | null
    deliveryBaseDistanceKm?: number | null
    deliveryBaseFee?: number | null
    deliveryFeePerKm?: number | null
    /** Quando presente, substitui a lista de itens pelo passo de finalização (recebimento/pagamento) embutido na sacola. */
    checkoutContent?: ReactNode | null
}

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 28 ? firstPart.substring(0, 26) + '...' : firstPart
}

// ===== Sacola flutuante do catálogo: mostra os produtos adicionados ao carrinho =====
export default function CatalogBag({
    bagItems,
    isExpanded,
    onToggleExpanded,
    onIncrease,
    onDecrease,
    onRemove,
    onCheckout,
    colors,
    isStoreOpen = true,
    deliveryFeeType = 'none',
    deliveryFee = 0,
    deliveryFeeIsEstimate = false,
    deliveryDistanceKm = null,
    deliveryOrigin = null,
    deliveryDestination = null,
    deliveryBaseDistanceKm = null,
    deliveryBaseFee = null,
    deliveryFeePerKm = null,
    checkoutContent = null,
}: CatalogBagProps) {
    const totalItems = bagItems.reduce((sum, item) => sum + item.quantity, 0)
    const totalValue = bagItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)
    const showDelivery = deliveryFeeType !== 'none'
    // Por distância sem endereço conhecido: não dá pra calcular o frete de
    // verdade, então pede a localização em vez de chutar um valor.
    const needsLocation = deliveryFeeType === 'distance' && deliveryFeeIsEstimate
    const showRoute = showDelivery && !!deliveryOrigin && !!deliveryDestination
    const finalTotal = totalValue + (showDelivery && !needsLocation ? deliveryFee : 0)

    const textColor = colors.textPrimary
    const cardBackground = colors.surface

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(price)
    }

    // Explica como cada loja calculou o frete, pra pessoa entender e poder
    // comparar o valor real cobrado por serviço em serviço.
    const deliveryBreakdown = (() => {
        if (deliveryFeeType === 'fixed') return 'valor fixo da loja'
        if (deliveryFeeType !== 'distance' || needsLocation || deliveryDistanceKm == null || deliveryBaseDistanceKm == null || deliveryBaseFee == null || deliveryFeePerKm == null) {
            return null
        }
        const distTxt = `${deliveryDistanceKm.toFixed(1)} km`
        if (deliveryDistanceKm <= deliveryBaseDistanceKm) {
            return `${distTxt}, dentro dos ${deliveryBaseDistanceKm}km por ${formatPrice(deliveryBaseFee)}`
        }
        const extraKm = deliveryDistanceKm - deliveryBaseDistanceKm
        return `${distTxt}: ${formatPrice(deliveryBaseFee)} (até ${deliveryBaseDistanceKm}km) + ${extraKm.toFixed(1)}km × ${formatPrice(deliveryFeePerKm)}/km`
    })()

    const handleCheckout = () => {
        if (totalItems === 0) {
            toast.info('Sua sacola está vazia')
            return
        }
        onCheckout()
    }

    return (
        <div className="relative">
            <div
                className="rounded-2xl shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden"
                style={{
                    background: cardBackground,
                    border: `2px solid ${totalItems > 0 ? colors.accent : colors.border}`,
                    boxShadow: totalItems > 0 ? `0 8px 32px rgba(0,0,0,0.15)` : `0 4px 16px rgba(0,0,0,0.08)`,
                    minWidth: isExpanded ? 280 : 'auto',
                    maxWidth: isExpanded ? (checkoutContent ? 380 : 360) : 'auto',
                }}
            >
                <div
                    className="flex items-center gap-2 p-2"
                    onClick={onToggleExpanded}
                >
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: totalItems > 0 ? GRADIENT : `${colors.border}50`, color: totalItems > 0 ? '#ffffff' : colors.textSecondary }}
                    >
                        <ShoppingBag size={18} />
                    </div>

                    <div className="flex items-center gap-2">
                        {totalItems > 0 ? (
                            <>
                                <span className="font-bold text-sm" style={{ color: textColor }}>
                                    {totalItems}
                                </span>
                                <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                                    {totalItems === 1 ? 'item' : 'itens'}
                                </span>
                                <span className="text-xs font-bold ml-1" style={{ color: '#f97316' }}>
                                    {formatPrice(totalValue)}
                                </span>
                            </>
                        ) : (
                            <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                                Vazio
                            </span>
                        )}
                    </div>

                    <div className="ml-auto flex items-center">
                        <svg
                            className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                            style={{ color: colors.textSecondary }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                {isExpanded && checkoutContent && (
                    <div className="border-t p-3 max-h-[75vh] overflow-y-auto" style={{ borderColor: colors.border }}>
                        {checkoutContent}
                    </div>
                )}

                {isExpanded && !checkoutContent && (
                    <div className="border-t px-2 py-2 max-h-64 overflow-y-auto" style={{ borderColor: colors.border }}>
                        {bagItems.length === 0 ? (
                            <p className="text-xs text-center py-4" style={{ color: colors.textSecondary }}>
                                Nenhum item na sacola
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {bagItems.map((item) => (
                                    <div
                                        key={`${item.product.id}::${item.comment || ''}`}
                                        className="flex items-center gap-2 p-1.5 rounded-lg"
                                        style={{ background: `${colors.surface}66` }}
                                    >
                                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                                            {item.product.image_url ? (
                                                <img
                                                    src={item.product.image_url}
                                                    alt={item.product.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-lg">📦</div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate" style={{ color: textColor }}>
                                                {item.product.name}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold" style={{ color: '#f97316' }}>
                                                    {formatPrice(item.product.price)}
                                                </span>
                                                <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                    x{item.quantity}
                                                </span>
                                            </div>
                                            {item.comment && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <MessageCircle size={10} style={{ color: colors.textSecondary }} />
                                                    <span className="text-[9px] italic truncate" style={{ color: colors.textSecondary }}>
                                                        {item.comment}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (item.quantity <= 1) {
                                                        onRemove(item.product.id, item.comment)
                                                    } else {
                                                        onDecrease(item.product.id, item.comment)
                                                    }
                                                }}
                                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold hover:scale-110 transition-transform"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                <Minus size={10} />
                                            </button>
                                            <span className="text-xs font-bold min-w-[16px] text-center" style={{ color: '#f97316' }}>
                                                {item.quantity}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onIncrease(item.product, item.comment)
                                                }}
                                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold hover:scale-110 transition-transform"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                <Plus size={10} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onRemove(item.product.id, item.comment)
                                                }}
                                                className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                                style={{ background: '#ef4444', color: '#ffffff' }}
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <div className="pt-2 border-t space-y-1" style={{ borderColor: colors.border }}>
                                    {showDelivery && (
                                        needsLocation ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onCheckout()
                                                }}
                                                className="w-full flex items-center gap-1.5 text-[11px] font-bold underline text-left"
                                                style={{ color: '#f97316' }}
                                            >
                                                <MapPin size={11} className="flex-shrink-0" />
                                                Adicionar localização para calcular o frete
                                            </button>
                                        ) : (
                                            <div>
                                                <div className="flex items-center justify-between text-[11px]" style={{ color: colors.textSecondary }}>
                                                    <span>Frete</span>
                                                    <span className="font-bold" style={{ color: deliveryFee === 0 ? '#22c55e' : colors.textSecondary }}>
                                                        {deliveryFee === 0 ? 'Grátis' : formatPrice(deliveryFee)}
                                                    </span>
                                                </div>
                                                {deliveryBreakdown && (
                                                    <p className="text-[9px] leading-tight mt-0.5" style={{ color: colors.textSecondary, opacity: 0.75 }}>
                                                        {deliveryBreakdown}
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    )}
                                    {showRoute && (
                                        <div className="flex items-center gap-1 text-[10px]" style={{ color: colors.textSecondary }}>
                                            <MapPin size={10} className="flex-shrink-0" />
                                            <span className="truncate">
                                                {shortAddress(deliveryOrigin!)} → {shortAddress(deliveryDestination!)}
                                                {deliveryDistanceKm != null && ` · ${deliveryDistanceKm.toFixed(1)} km`}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold" style={{ color: textColor }}>
                                            Total: {formatPrice(finalTotal)}{needsLocation ? ' + frete' : ''}
                                        </span>
                                        {!isStoreOpen ? (
                                            <span
                                                className="px-4 py-1.5 rounded-full text-xs font-bold"
                                                style={{ background: '#ef444422', color: '#ef4444' }}
                                            >
                                                Loja fechada
                                            </span>
                                        ) : (
                                            <button
                                                onClick={handleCheckout}
                                                className="px-4 py-1.5 rounded-full text-xs font-bold transition hover:scale-105 active:scale-95"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                Finalizar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
