// components/ButtonInPersonSale.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import {
    ShoppingCart,
    X,
    Plus,
    Minus,
    Search,
    DollarSign,
    CreditCard,
    Banknote,
    Smartphone,
    Package,
    Tag,
} from 'lucide-react'
import { validateCampaignCode, calculateCampaignDiscountAmount, consumeCampaignCode, type CampaignDiscount } from '@/lib/campaignRedemption'

interface Product {
    id: string
    name: string
    price: number
    image_url: string | null
    slug?: string
}

interface CartItem {
    product: Product
    quantity: number
}

interface ButtonInPersonSaleProps {
    storeId: string
    storeName: string
    storeSlug: string
    profileSlug: string
    onSaleCompleted: () => void
}

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const PAYMENT_METHODS = [
    { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
    { id: 'pix', label: 'PIX', icon: Smartphone },
    { id: 'credito', label: 'Crédito', icon: CreditCard },
    { id: 'debito', label: 'Débito', icon: CreditCard },
]

export default function ButtonInPersonSale({
    storeId,
    storeName,
    storeSlug,
    profileSlug,
    onSaleCompleted,
}: ButtonInPersonSaleProps) {
    const { colors } = useTheme()
    const [products, setProducts] = useState<Product[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [cart, setCart] = useState<CartItem[]>([])
    const [paymentMethod, setPaymentMethod] = useState('dinheiro')
    const [loading, setLoading] = useState(false)
    const [buyerName, setBuyerName] = useState('')
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Código de resgate do Club VIP — quem atende digita o código que o
    // cliente mostra (não tem buyer_id numa venda presencial pra achar o
    // membro de outro jeito).
    const [redemptionCode, setRedemptionCode] = useState('')
    const [appliedDiscount, setAppliedDiscount] = useState<CampaignDiscount | null>(null)
    const [applyingCode, setApplyingCode] = useState(false)

    useEffect(() => {
        if (!storeId) return
        const loadProducts = async () => {
            const { data } = await supabase
                .from('products')
                .select('id, name, price, image_url, slug')
                .eq('store_id', storeId)
                .eq('is_active', true)
                .eq('listing_type', 'sale')
                .order('name')
            if (data) setProducts(data as Product[])
        }
        loadProducts()
    }, [storeId])

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id)
            if (existing) {
                return prev.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            }
            return [...prev, { product, quantity: 1 }]
        })
    }

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(item => item.product.id !== productId))
    }

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev =>
            prev
                .map(item =>
                    item.product.id === productId
                        ? { ...item, quantity: Math.max(0, item.quantity + delta) }
                        : item
                )
                .filter(item => item.quantity > 0)
        )
    }

    const cartSubtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
    const discountAmount = appliedDiscount
        ? calculateCampaignDiscountAmount(appliedDiscount, cart.map((item) => ({ productId: item.product.id, lineTotal: item.product.price * item.quantity })))
        : 0
    const totalAmount = Math.max(0, cartSubtotal - discountAmount)

    const handleApplyRedemptionCode = async () => {
        const code = redemptionCode.trim()
        if (!code) return
        setApplyingCode(true)
        try {
            const discount = await validateCampaignCode(code)
            if (discount.storeId !== storeId) throw new Error('Esse código não é dessa loja')
            setAppliedDiscount(discount)
            toast.success('Código VIP aplicado!')
        } catch (err: any) {
            setAppliedDiscount(null)
            toast.error(err.message || 'Código inválido')
        } finally {
            setApplyingCode(false)
        }
    }

    const handleFinalizeSale = async () => {
        if (cart.length === 0) {
            toast.error('Adicione pelo menos um produto')
            return
        }
        setLoading(true)
        try {
            const checkoutId = crypto.randomUUID()
            const finalBuyerName = buyerName.trim() || 'Cliente presencial'

            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    checkout_id: checkoutId,
                    store_id: storeId,
                    buyer_name: finalBuyerName,
                    buyer_profile_slug: '',
                    total_amount: totalAmount,
                    delivery_fee: 0,
                    delivery_option: 'pickup',
                    payment_method: paymentMethod,
                    delivery_address: '',
                    delivery_lat: null,
                    delivery_lng: null,
                    status: 'paid',
                })
                .select('id')
                .single()

            if (orderError) throw orderError

            const items = cart.map(item => ({
                order_id: orderData.id,
                product_id: item.product.id,
                product_name: item.product.name,
                quantity: item.quantity,
                unit_price: item.product.price,
                total_price: item.product.price * item.quantity,
            }))

            const { error: itemsError } = await supabase.from('order_items').insert(items)
            if (itemsError) throw itemsError

            if (appliedDiscount) {
                await consumeCampaignCode(redemptionCode.trim(), orderData.id, 'in_person')
            }

            toast.success(`Venda de R$ ${totalAmount.toFixed(2)} finalizada!`)
            setCart([])
            setBuyerName('')
            setPaymentMethod('dinheiro')
            setRedemptionCode('')
            setAppliedDiscount(null)
            onSaleCompleted()
        } catch (err: any) {
            console.error('[Venda Presencial] Erro:', err)
            toast.error('Erro ao finalizar venda: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const qtyInCart = (productId: string) => cart.find((i) => i.product.id === productId)?.quantity || 0
    const itemsCount = cart.reduce((sum, i) => sum + i.quantity, 0)
    const inputStyle = { background: `${colors.surface}88`, borderColor: colors.border, color: colors.textPrimary }

    return (
        <div
            className="mb-6 rounded-3xl border overflow-hidden"
            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            {/* Cabeçalho: sempre aberto, sem botão de abrir/fechar */}
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: GRADIENT }}>
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <ShoppingCart size={20} color="#ffffff" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black uppercase tracking-wider text-white">Venda presencial</h3>
                    <p className="text-[11px] text-white/80">Toque nos produtos para montar a venda do balcão</p>
                </div>
                {itemsCount > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-white text-xs font-black" style={{ color: '#dc2626' }}>
                        {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                    </span>
                )}
            </div>

            <div className="p-4 space-y-4">
                {/* Busca */}
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Buscar produto..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2"
                        style={{ ...inputStyle, '--tw-ring-color': '#f97316' } as React.CSSProperties}
                    />
                </div>

                {/* Produtos em grade */}
                {filteredProducts.length === 0 ? (
                    <p className="text-xs text-center py-6" style={{ color: colors.textSecondary }}>
                        {products.length === 0 ? 'Nenhum produto cadastrado.' : 'Nenhum produto encontrado.'}
                    </p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-0.5">
                        {filteredProducts.map(product => {
                            const qty = qtyInCart(product.id)
                            return (
                                <button
                                    key={product.id}
                                    onClick={() => addToCart(product)}
                                    className="relative text-left rounded-2xl border overflow-hidden transition-all hover:scale-[1.02] active:scale-95"
                                    style={{ borderColor: qty > 0 ? '#f97316' : colors.border, background: qty > 0 ? '#f9731610' : 'transparent' }}
                                >
                                    <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center">
                                        {product.image_url ? (
                                            <img
                                                src={supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl}
                                                alt={product.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Package size={22} style={{ color: colors.textSecondary }} />
                                        )}
                                    </div>
                                    <div className="p-2.5">
                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{product.name}</p>
                                        <p className="text-xs font-black mt-0.5" style={{ color: '#f97316' }}>R$ {product.price.toFixed(2)}</p>
                                    </div>
                                    {qty > 0 ? (
                                        <span className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: GRADIENT }}>
                                            {qty}
                                        </span>
                                    ) : (
                                        <span className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center bg-white/90" style={{ color: '#f97316' }}>
                                            <Plus size={14} />
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}

                {cart.length > 0 && (
                    <>
                        {/* Carrinho */}
                        <div className="rounded-2xl border p-3.5" style={{ borderColor: colors.border }}>
                            <h4 className="text-[11px] font-black uppercase tracking-wider mb-2.5" style={{ color: colors.textSecondary }}>
                                Carrinho
                            </h4>
                            <div className="space-y-2.5 max-h-44 overflow-y-auto">
                                {cart.map(item => (
                                    <div key={item.product.id} className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{item.product.name}</p>
                                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                                R$ {item.product.price.toFixed(2)} × {item.quantity} = <strong style={{ color: colors.textPrimary }}>R$ {(item.product.price * item.quantity).toFixed(2)}</strong>
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => updateQuantity(item.product.id, -1)}
                                                className="w-8 h-8 rounded-full flex items-center justify-center"
                                                style={{ background: '#f9731620', color: '#f97316' }}
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="w-7 text-center font-black text-sm" style={{ color: colors.textPrimary }}>{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.product.id, 1)}
                                                className="w-8 h-8 rounded-full flex items-center justify-center"
                                                style={{ background: '#f9731620', color: '#f97316' }}
                                            >
                                                <Plus size={14} />
                                            </button>
                                            <button
                                                onClick={() => removeFromCart(item.product.id)}
                                                className="w-8 h-8 rounded-full flex items-center justify-center ml-0.5"
                                                style={{ background: '#ef444420', color: '#ef4444' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Código de resgate do Club VIP (opcional) */}
                            <div className="pt-3 mt-3 border-t" style={{ borderColor: colors.border }}>
                                {appliedDiscount ? (
                                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: '#22c55e15', border: '1px solid #22c55e40' }}>
                                        <span className="font-bold flex items-center gap-1.5" style={{ color: '#22c55e' }}>
                                            <Tag size={12} /> Código VIP aplicado · -R$ {discountAmount.toFixed(2)}
                                        </span>
                                        <button
                                            onClick={() => { setAppliedDiscount(null); setRedemptionCode('') }}
                                            className="text-[10px] font-bold underline"
                                            style={{ color: '#22c55e' }}
                                        >
                                            Remover
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Código de resgate VIP do cliente"
                                            value={redemptionCode}
                                            onChange={(e) => setRedemptionCode(e.target.value)}
                                            className="flex-1 min-w-0 px-3 py-2 rounded-xl border text-xs focus:outline-none"
                                            style={inputStyle}
                                        />
                                        <button
                                            onClick={handleApplyRedemptionCode}
                                            disabled={applyingCode || !redemptionCode.trim()}
                                            className="px-3.5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 flex-shrink-0"
                                            style={{ background: '#f9731620', color: '#f97316' }}
                                        >
                                            Aplicar
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-end mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
                                <span className="font-black text-sm uppercase tracking-wider" style={{ color: colors.textSecondary }}>Total</span>
                                <span className="font-black text-2xl" style={{ color: '#f97316' }}>R$ {totalAmount.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Nome do cliente (opcional) */}
                        <div>
                            <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: colors.textSecondary }}>
                                Nome do cliente (opcional)
                            </label>
                            <input
                                type="text"
                                placeholder="Cliente presencial"
                                value={buyerName}
                                onChange={e => setBuyerName(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2"
                                style={{ ...inputStyle, '--tw-ring-color': '#f97316' } as React.CSSProperties}
                            />
                        </div>

                        {/* Pagamento */}
                        <div>
                            <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: colors.textSecondary }}>
                                Pagamento
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {PAYMENT_METHODS.map(method => {
                                    const Icon = method.icon
                                    const isSelected = paymentMethod === method.id
                                    return (
                                        <button
                                            key={method.id}
                                            onClick={() => setPaymentMethod(method.id)}
                                            className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-xs font-black transition-all"
                                            style={isSelected
                                                ? { background: GRADIENT, borderColor: 'transparent', color: '#ffffff', boxShadow: '0 4px 12px #f9731640' }
                                                : { background: 'transparent', borderColor: colors.border, color: colors.textSecondary }}
                                        >
                                            <Icon size={16} />
                                            {method.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Finalizar */}
                        <button
                            onClick={handleFinalizeSale}
                            disabled={loading || cart.length === 0}
                            className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50"
                            style={{ background: GRADIENT, color: '#ffffff', boxShadow: '0 8px 18px #f9731650' }}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <DollarSign size={18} />
                                    Finalizar venda · R$ {totalAmount.toFixed(2)}
                                </>
                            )}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
