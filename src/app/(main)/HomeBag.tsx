// src/app/(main)/HomeBag.tsx
'use client'

import { ShoppingBag, Minus, Plus, Trash2, Clock, ChefHat, CheckCircle2, Star } from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Um item da sacola já identificado com a loja de origem, já que aqui as
// lojas estão todas fundidas na mesma lista.
export interface HomeBagItem {
    product: any
    quantity: number
    storeSlug: string
    storeName: string
    storeLogoUrl?: string | null
    comment?: string
}

interface StoreGroup {
    storeSlug: string
    storeName: string
    storeLogoUrl?: string | null
    items: HomeBagItem[]
}

interface StatusCounts {
    pending: number
    preparing: number
    ready: number
    reviews: number
}

interface HomeBagProps {
    items: HomeBagItem[]
    isExpanded: boolean
    onToggleExpanded: () => void
    onIncrease: (item: HomeBagItem) => void
    onDecrease: (item: HomeBagItem) => void
    onRemove: (item: HomeBagItem) => void
    onCheckout: (storeSlug: string) => void
    statusCounts?: StatusCounts
    animate?: boolean
    colors: any
    storeOpenStatus?: Record<string, boolean>
}

// ===== Sacola flutuante da home: mesmo desenho do CatalogBag, mas juntando
// os itens de todas as lojas em uma lista só, separados por loja =====
export default function HomeBag({
    items,
    isExpanded,
    onToggleExpanded,
    onIncrease,
    onDecrease,
    onRemove,
    onCheckout,
    statusCounts,
    animate = false,
    colors,
    storeOpenStatus,
}: HomeBagProps) {
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
    const totalValue = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)

    const textColor = colors.textPrimary
    const cardBackground = colors.surface

    // Agrupa os itens por loja pra mostrar cada uma separada, com seu
    // próprio subtotal e botão de finalizar.
    const storeGroups: StoreGroup[] = []
    for (const item of items) {
        let group = storeGroups.find((g) => g.storeSlug === item.storeSlug)
        if (!group) {
            group = { storeSlug: item.storeSlug, storeName: item.storeName, storeLogoUrl: item.storeLogoUrl, items: [] }
            storeGroups.push(group)
        }
        group.items.push(item)
    }

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(price)
    }

    const handleCheckout = (storeSlug: string) => {
        onCheckout(storeSlug)
    }

    const showStatus =
        statusCounts &&
        (statusCounts.pending > 0 ||
            statusCounts.preparing > 0 ||
            statusCounts.ready > 0 ||
            statusCounts.reviews > 0)

    return (
        <div className="relative">
            <div
                className="rounded-2xl shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden"
                style={{
                    background: cardBackground,
                    border: `2px solid ${totalItems > 0 ? colors.accent : colors.border}`,
                    boxShadow: totalItems > 0 ? `0 8px 32px rgba(0,0,0,0.15)` : `0 4px 16px rgba(0,0,0,0.08)`,
                    minWidth: isExpanded ? 280 : 'auto',
                    maxWidth: isExpanded ? 'min(360px, calc(100vw - 48px))' : 'auto',
                }}
            >
                <div
                    className="flex flex-col gap-1 p-2"
                    onClick={onToggleExpanded}
                >
                    <div className="flex items-center gap-2">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: totalItems > 0 ? GRADIENT : `${colors.border}50`, color: totalItems > 0 ? '#ffffff' : colors.textSecondary }}
                        >
                            <ShoppingBag size={18} />
                        </div>

                        <div className="flex items-center gap-2">
                            {totalItems > 0 ? (
                                <>
                                    <span
                                        className="font-bold text-sm"
                                        style={{
                                            color: textColor,
                                            display: 'inline-block',
                                            transform: animate ? 'scale(1.3)' : 'scale(1)',
                                            transition: 'transform 0.2s ease',
                                        }}
                                    >
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
                                className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? '' : 'rotate-180'}`}
                                style={{ color: colors.textSecondary }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    {/* Card mais detalhado: logo de cada loja presente na sacola, em lista horizontal */}
                    {!isExpanded && storeGroups.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto pl-12 pr-1 scrollbar-hide">
                            {storeGroups.map((group) => (
                                <div
                                    key={group.storeSlug}
                                    title={group.storeName}
                                    className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                                    style={{ background: `${colors.border}60` }}
                                >
                                    {group.storeLogoUrl ? (
                                        <img src={group.storeLogoUrl} alt={group.storeName} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                                            {group.storeSlug.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {isExpanded && (
                    <div className="border-t px-2 py-2 max-h-80 overflow-y-auto" style={{ borderColor: colors.border }}>
                        {items.length === 0 ? (
                            <p className="text-xs text-center py-4" style={{ color: colors.textSecondary }}>
                                Nenhum item na sacola
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {storeGroups.map((group) => {
                                    const groupTotal = group.items.reduce(
                                        (sum, item) => sum + item.product.price * item.quantity,
                                        0
                                    )
                                    return (
                                        <div
                                            key={group.storeSlug}
                                            className="rounded-xl p-2"
                                            style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}
                                        >
                                            <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
                                                <div className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: `${colors.border}60` }}>
                                                    {group.storeLogoUrl ? (
                                                        <img src={group.storeLogoUrl} alt={group.storeName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-[7px] font-bold" style={{ color: colors.textSecondary }}>
                                                            {group.storeSlug.charAt(0).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                                <p
                                                    className="text-[10px] font-black uppercase tracking-wide"
                                                    style={{ color: colors.accent }}
                                                >
                                                    {group.storeName}
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                {group.items.map((item) => (
                                                    <div
                                                        key={`${item.storeSlug}:${item.product.id}:${item.comment || ''}`}
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
                                                            ) : item.storeLogoUrl ? (
                                                                <img
                                                                    src={item.storeLogoUrl}
                                                                    alt={item.storeName}
                                                                    className="w-full h-full object-contain p-1"
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
                                                        </div>

                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    if (item.quantity <= 1) {
                                                                        onRemove(item)
                                                                    } else {
                                                                        onDecrease(item)
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
                                                                    onIncrease(item)
                                                                }}
                                                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold hover:scale-110 transition-transform"
                                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                                            >
                                                                <Plus size={10} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    onRemove(item)
                                                                }}
                                                                className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                                                style={{ background: '#ef4444', color: '#ffffff' }}
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-2 mt-2 border-t flex items-center justify-between" style={{ borderColor: colors.border }}>
                                                <span className="text-xs font-bold" style={{ color: textColor }}>
                                                    Total: {formatPrice(groupTotal)}
                                                </span>
                                                {storeOpenStatus?.[group.storeSlug] === false ? (
                                                    <span
                                                        className="px-4 py-1.5 rounded-full text-xs font-bold"
                                                        style={{ background: '#ef444422', color: '#ef4444' }}
                                                    >
                                                        Loja fechada
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleCheckout(group.storeSlug)
                                                        }}
                                                        className="px-4 py-1.5 rounded-full text-xs font-bold transition hover:scale-105 active:scale-95"
                                                        style={{ background: GRADIENT, color: '#ffffff' }}
                                                    >
                                                        Finalizar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Contadores de pedidos */}
            {!isExpanded && showStatus && statusCounts && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginTop: 4,
                        display: 'flex',
                        gap: 4,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {statusCounts.pending > 0 && (
                        <span style={{
                            background: '#3b82f6', color: 'white', borderRadius: '9999px', padding: '2px 10px',
                            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, lineHeight: '16px',
                            borderTop: '2px solid #ffffff', borderRight: '2px solid #ffffff', borderBottom: '2px solid #ffffff', borderLeft: '2px solid #ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                            <Clock size={10} /> {statusCounts.pending}
                        </span>
                    )}
                    {statusCounts.preparing > 0 && (
                        <span style={{
                            background: '#eab308', color: 'white', borderRadius: '9999px', padding: '2px 10px',
                            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, lineHeight: '16px',
                            borderTop: '2px solid #ffffff', borderRight: '2px solid #ffffff', borderBottom: '2px solid #ffffff', borderLeft: '2px solid #ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                            <ChefHat size={10} /> {statusCounts.preparing}
                        </span>
                    )}
                    {statusCounts.ready > 0 && (
                        <span style={{
                            background: '#a855f7', color: 'white', borderRadius: '9999px', padding: '2px 10px',
                            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, lineHeight: '16px',
                            borderTop: '2px solid #ffffff', borderRight: '2px solid #ffffff', borderBottom: '2px solid #ffffff', borderLeft: '2px solid #ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                            <CheckCircle2 size={10} /> {statusCounts.ready}
                        </span>
                    )}
                    {statusCounts.reviews > 0 && (
                        <span style={{
                            background: '#000000ff', color: '#ffffff', borderRadius: '9999px', padding: '2px 10px',
                            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, lineHeight: '16px',
                            borderTop: '2px solid #ffffff', borderRight: '2px solid #ffffff', borderBottom: '2px solid #ffffff', borderLeft: '2px solid #ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                            <Star size={10} color="#ffe600ff" /> {statusCounts.reviews}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}
