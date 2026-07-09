// components/ButtonInPersonSale.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
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
    ChevronDown,
    ChevronUp,
    Package,
} from 'lucide-react'

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
    const [isOpen, setIsOpen] = useState(false)
    const [products, setProducts] = useState<Product[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [cart, setCart] = useState<CartItem[]>([])
    const [paymentMethod, setPaymentMethod] = useState('dinheiro')
    const [loading, setLoading] = useState(false)
    const [buyerName, setBuyerName] = useState('')
    const searchInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isOpen || !storeId) return
        const loadProducts = async () => {
            const { data } = await supabase
                .from('products')
                .select('id, name, price, image_url, slug')
                .eq('store_id', storeId)
                .eq('is_active', true)
                .order('name')
            if (data) setProducts(data as Product[])
        }
        loadProducts()
    }, [isOpen, storeId])

    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 100)
        }
    }, [isOpen])

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

    const totalAmount = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

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

            toast.success(`Venda de R$ ${totalAmount.toFixed(2)} finalizada!`)
            setCart([])
            setBuyerName('')
            setPaymentMethod('dinheiro')
            setIsOpen(false)
            onSaleCompleted()
        } catch (err: any) {
            console.error('[Venda Presencial] Erro:', err)
            toast.error('Erro ao finalizar venda: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="mb-6">
            {/* Botão principal */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:shadow-lg"
                style={{
                    background: isOpen
                        ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                        : 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: '#ffffff',
                    border: isOpen ? '1px solid #ef4444' : '1px solid #22c55e',
                    boxShadow: isOpen
                        ? '0 8px 18px #ef444450'
                        : '0 8px 18px #22c55e50',
                }}
            >
                <ShoppingCart size={18} />
                {isOpen ? 'Não executar venda' : 'Vender Presencial'}
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {/* Área expansível (restante inalterado) */}
            {isOpen && (
                <div
                    className="mt-3 rounded-2xl border p-4 space-y-4 animate-in slide-in-from-top-2 duration-200"
                    style={{
                        background: colors.surface,
                        borderColor: colors.border,
                    }}
                >
                    {/* Busca de produtos */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar produto..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2"
                            style={{
                                background: `${colors.surface}88`,
                                borderColor: colors.border,
                                color: colors.textPrimary,
                            }}
                        />
                    </div>

                    {/* Lista de produtos */}
                    <div className="max-h-48 overflow-y-auto space-y-2">
                        {filteredProducts.length === 0 ? (
                            <p className="text-xs text-center py-4" style={{ color: colors.textSecondary }}>
                                {products.length === 0 ? 'Nenhum produto cadastrado.' : 'Nenhum produto encontrado.'}
                            </p>
                        ) : (
                            filteredProducts.map(product => (
                                <div
                                    key={product.id}
                                    className="flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-white/5 transition-colors"
                                    style={{ borderColor: colors.border }}
                                    onClick={() => addToCart(product)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                            {product.image_url ? (
                                                <img
                                                    src={supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Package size={16} style={{ color: colors.textSecondary }} />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                {product.name}
                                            </p>
                                            <p className="text-xs font-bold" style={{ color: colors.accent }}>
                                                R$ {product.price.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                    <Plus size={18} style={{ color: colors.accent }} />
                                </div>
                            ))
                        )}
                    </div>

                    {/* Carrinho */}
                    {cart.length > 0 && (
                        <>
                            <div className="border-t pt-3" style={{ borderColor: colors.border }}>
                                <h4 className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textPrimary }}>
                                    Carrinho
                                </h4>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {cart.map(item => (
                                        <div key={item.product.id} className="flex items-center justify-between text-sm">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {item.product.name}
                                                </p>
                                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                                    R$ {item.product.price.toFixed(2)} x {item.quantity}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 ml-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        updateQuantity(item.product.id, -1)
                                                    }}
                                                    className="w-7 h-7 rounded-full flex items-center justify-center"
                                                    style={{ background: `${colors.accent}20`, color: colors.accent }}
                                                >
                                                    <Minus size={14} />
                                                </button>
                                                <span className="w-8 text-center font-bold" style={{ color: colors.textPrimary }}>
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        updateQuantity(item.product.id, 1)
                                                    }}
                                                    className="w-7 h-7 rounded-full flex items-center justify-center"
                                                    style={{ background: `${colors.accent}20`, color: colors.accent }}
                                                >
                                                    <Plus size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        removeFromCart(item.product.id)
                                                    }}
                                                    className="w-7 h-7 rounded-full flex items-center justify-center ml-1"
                                                    style={{ background: '#ef444420', color: '#ef4444' }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between items-center mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
                                    <span className="font-black text-sm" style={{ color: colors.textPrimary }}>Total</span>
                                    <span className="font-black text-lg" style={{ color: colors.accent }}>
                                        R$ {totalAmount.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Nome do cliente (opcional) */}
                            <div>
                                <label className="text-xs font-bold block mb-1" style={{ color: colors.textSecondary }}>
                                    Nome do cliente (opcional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Cliente presencial"
                                    value={buyerName}
                                    onChange={e => setBuyerName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2"
                                    style={{
                                        background: `${colors.surface}88`,
                                        borderColor: colors.border,
                                        color: colors.textPrimary,
                                    }}
                                />
                            </div>

                            {/* Método de pagamento */}
                            <div>
                                <label className="text-xs font-bold block mb-2" style={{ color: colors.textSecondary }}>
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
                                                className="flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all"
                                                style={{
                                                    background: isSelected ? `${colors.accent}20` : 'transparent',
                                                    borderColor: isSelected ? colors.accent : colors.border,
                                                    color: isSelected ? colors.accent : colors.textSecondary,
                                                }}
                                            >
                                                <Icon size={16} />
                                                {method.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Botão finalizar */}
                            <button
                                onClick={handleFinalizeSale}
                                disabled={loading || cart.length === 0}
                                className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                style={{
                                    background: `linear-gradient(135deg, #22c55e, #16a34a)`,
                                    color: '#ffffff',
                                    boxShadow: '0 8px 18px #22c55e50',
                                }}
                            >
                                {loading ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <DollarSign size={18} />
                                        Finalizar Venda (R$ {totalAmount.toFixed(2)})
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}