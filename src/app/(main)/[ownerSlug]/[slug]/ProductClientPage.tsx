//app/(main)/[ownerSlug]/[slug]/ProductClientPage.tsx

'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import {
    ArrowLeft,
    Store,
    Calendar,
    Eye,
    EyeOff,
    Share2,
    ShoppingCart,
    ShoppingBag,
    Plus,
    Minus,
    Check,
    ChevronRight,
    Trash2,
    X,
    Truck,
    Search,
    MapPin,
    Home,
    CheckCircle2,
    QrCode,
    CreditCard,
    Banknote,
    User,
    Camera,
} from 'lucide-react'
import { handleShareLink } from '@/lib/share'
import { toast } from 'sonner'
import { useCartStore } from '@/store/useCartStore'
import { useStoreCheckout } from './useStoreCheckout'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== TIPOS =====
interface ProductWithStore {
    id: string
    name: string
    slug: string
    description: string | null
    image_url: string | null
    price: number | null
    view_count: number | null
    created_at: string
    store_id: string
    store?: {
        id: string
        name: string
        storeSlug: string
        logo_url: string | null
        owner_id: string
        profile?: {
            id: string
            name: string
            avatar_url: string | null
            profileSlug: string
        } | null
    } | null
}

// Dados já buscados pelo SlugClientPage - evita refazer as mesmas queries aqui.
interface InitialProductRow {
    id: string
    name: string
    slug: string
    description: string | null
    image_url: string | null
    price: number | null
    view_count: number | null
    created_at: string
    store_id: string
}

interface InitialStoreRow {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    owner_id: string | null
}

interface ProductClientPageProps {
    ownerSlug: string
    slug: string
    colors: any
    bgMode: string
    customBgUrl?: string | null
    profileSlug?: string | null
    avatarUrl?: string | null
    profileLoading?: boolean
    initialProduct: InitialProductRow
    initialStore: InitialStoreRow | null
}

export function ProductClientPage({
    ownerSlug,
    slug,
    colors,
    bgMode,
    customBgUrl,
    profileSlug,
    avatarUrl,
    profileLoading = false,
    initialProduct,
    initialStore,
}: ProductClientPageProps) {
    const router = useRouter()

    const { itemsByStore, addItem, updateQuantity, removeItem } = useCartStore()
    const [showStoreCart, setShowStoreCart] = useState(false)
    const storeCartItems = itemsByStore[ownerSlug] || []
    const checkout = useStoreCheckout(ownerSlug, storeCartItems)

    const [loading, setLoading] = useState(true)
    const [product, setProduct] = useState<ProductWithStore | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [addingToCart, setAddingToCart] = useState(false)
    const [addedToCart, setAddedToCart] = useState(false)
    const [otherProducts, setOtherProducts] = useState<{
        id: string
        name: string
        slug: string
        image_url: string | null
        price: number | null
    }[]>([])

    // ========== CARREGAR PRODUTO ==========
    // O produto e a loja já vêm prontos do SlugClientPage (que os buscou pra
    // detectar o tipo do item), então aqui só falta o perfil do dono da loja.
    useEffect(() => {
        const fetchProduct = async () => {
            setLoading(true)
            setError(null)

            try {
                let productWithStore: ProductWithStore = {
                    ...initialProduct,
                    store: null,
                }

                if (initialStore) {
                    let profileData = null
                    if (initialStore.owner_id) {
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('id, name, avatar_url, profileSlug')
                            .eq('id', initialStore.owner_id)
                            .maybeSingle()
                        profileData = profile
                    }

                    productWithStore = {
                        ...initialProduct,
                        store: {
                            ...initialStore,
                            owner_id: initialStore.owner_id || '',
                            profile: profileData,
                        },
                    }
                }

                setProduct(productWithStore)

                // Não bloqueia a renderização: a página já pode aparecer
                // enquanto essa contagem é atualizada em segundo plano.
                supabase
                    .from('products')
                    .update({ view_count: (initialProduct.view_count || 0) + 1 })
                    .eq('id', initialProduct.id)
                    .then(({ error: viewErr }) => {
                        if (viewErr) console.error('Erro ao atualizar visualizações:', viewErr)
                    })

            } catch (err: any) {
                console.error('Erro ao carregar produto:', err)
                setError(err.message || 'Produto não encontrado')
            } finally {
                setLoading(false)
            }
        }

        fetchProduct()
    }, [initialProduct, initialStore])

    // ===== OUTROS PRODUTOS DA MESMA LOJA =====
    useEffect(() => {
        const storeId = product?.store_id
        const currentProductId = product?.id
        if (!storeId || !currentProductId) {
            setOtherProducts([])
            return
        }

        let isMounted = true

        supabase
            .from('products')
            .select('id, name, slug, image_url, price')
            .eq('store_id', storeId)
            .eq('listing_type', 'sale')
            .neq('id', currentProductId)
            .order('created_at', { ascending: false })
            .limit(12)
            .then(({ data }) => {
                if (isMounted) setOtherProducts(data || [])
            })

        return () => { isMounted = false }
    }, [product?.store_id, product?.id])

    // ===== FUNÇÃO PARA IR PARA A LOJA =====
    const goToStore = () => {
        if (!product?.store) return

        if (product.store.storeSlug) {
            router.push(`/${product.store.storeSlug}`)
            return
        }

        if (product.store.profile?.profileSlug) {
            router.push(`/${product.store.profile.profileSlug}`)
            return
        }

        if (product.store.id) {
            router.push(`/loja/${product.store.id}`)
        }
    }

    // ===== DETERMINA O NOME E IMAGEM PARA EXIBIR =====
    // Sempre os dados da própria loja (nome/logo) - o perfil do dono é só
    // metadado interno, não o que deve aparecer como "de onde é esse produto".
    const getStoreDisplay = () => {
        if (!product?.store) {
            return {
                name: 'Loja',
                imageUrl: null,
                type: 'unknown'
            }
        }

        return {
            name: product.store.name,
            imageUrl: product.store.logo_url,
            type: 'store'
        }
    }

    const storeDisplay = getStoreDisplay()

    const finalStoreImage = storeDisplay.imageUrl
        ? supabase.storage.from('store-logos').getPublicUrl(storeDisplay.imageUrl).data.publicUrl
        : null

    // ===== FUNÇÕES DO CARRINHO =====
    const handleAddToCart = () => {
        if (!product) return

        setAddingToCart(true)

        try {
            // Verifica se já existe no carrinho
            const existingItems = itemsByStore[ownerSlug] || []
            const existingItem = existingItems.find(item => item.product.id === product.id)

            const storeDetails = {
                name: product.store?.name || ownerSlug,
                logo_url: product.store?.logo_url || null,
            }

            if (existingItem) {
                // Atualiza quantidade (updateQuantity usa delta)
                updateQuantity(ownerSlug, product.id, quantity)
                toast.success(`Quantidade atualizada no carrinho!`)
            } else {
                // Adiciona novo item
                const cartProduct = {
                    id: product.id,
                    name: product.name,
                    price: product.price || 0,
                    image_url: product.image_url,
                    slug: product.slug,
                }
                for (let i = 0; i < quantity; i++) {
                    addItem(ownerSlug, storeDetails, cartProduct)
                }
                toast.success(`${product.name} adicionado ao carrinho!`)
            }

            setAddedToCart(true)
            setTimeout(() => setAddedToCart(false), 3000)
        } catch (error: any) {
            toast.error('Erro ao adicionar ao carrinho: ' + error.message)
        } finally {
            setAddingToCart(false)
        }
    }

    const handleQuantityChange = (newQuantity: number) => {
        if (newQuantity < 1) return
        setQuantity(newQuantity)
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
                <div className="text-center">
                    <Spinner size={48} color={colors.accent} className="mx-auto mb-4" />
                    <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Carregando produto...</p>
                </div>
            </div>
        )
    }

    if (error || !product) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">🔍</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Produto não encontrado'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        O produto que você está procurando não existe ou foi removido.
                    </p>
                    <button
                        onClick={() => router.push(`/${ownerSlug}`)}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        Voltar para a loja
                    </button>
                </div>
            </div>
        )
    }

    const imageUrl = product.image_url
        ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
        : null

    const formattedDate = product.created_at
        ? new Date(product.created_at).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
        : ''

    const formattedPrice = product.price !== null && product.price !== undefined
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)
        : 'Preço sob consulta'

    const totalPrice = product.price !== null && product.price !== undefined
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price * quantity)
        : null

    const cartControls = (
        <>
            <div
                className="flex items-center gap-1 rounded-full p-1 flex-shrink-0"
                style={{ border: `1px solid ${colors.border}` }}
            >
                <button
                    onClick={() => handleQuantityChange(quantity - 1)}
                    aria-label="Diminuir quantidade"
                    className="w-9 h-9 rounded-full flex items-center justify-center transition hover:scale-105"
                    style={{ color: colors.textPrimary }}
                >
                    <Minus size={16} />
                </button>
                <span className="w-6 text-center font-black" style={{ color: colors.textPrimary }}>
                    {quantity}
                </span>
                <button
                    onClick={() => handleQuantityChange(quantity + 1)}
                    aria-label="Aumentar quantidade"
                    className="w-9 h-9 rounded-full flex items-center justify-center transition hover:scale-105"
                    style={{ color: colors.textPrimary }}
                >
                    <Plus size={16} />
                </button>
            </div>

            <button
                onClick={handleAddToCart}
                disabled={addingToCart || addedToCart}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold transition-all hover:scale-[1.01] disabled:opacity-60"
                style={{
                    background: addedToCart ? '#22c55e' : GRADIENT,
                    color: '#ffffff',
                    boxShadow: addedToCart ? '0 4px 14px rgba(34, 197, 94, 0.4)' : '0 4px 14px rgba(249, 115, 22, 0.4)',
                }}
            >
                {addedToCart ? (
                    <>
                        <Check size={18} />
                        Adicionado ao carrinho!
                    </>
                ) : addingToCart ? (
                    <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                        Adicionando...
                    </>
                ) : (
                    <>
                        <ShoppingCart size={18} />
                        Adicionar{totalPrice ? ` · ${totalPrice}` : ''}
                    </>
                )}
            </button>
        </>
    )

    // ===== SACOLA DA LOJA =====
    // Só os itens desta loja (cada loja tem sua própria sacola) - some
    // quando o último item dela é removido, e aparece (com animação) assim
    // que o primeiro item é adicionado.
    const formatPrice = (price: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
    const storeCartCount = storeCartItems.reduce((sum, item) => sum + item.quantity, 0)
    const storeCartTotal = storeCartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
    const formattedStoreCartTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(storeCartTotal)

    const storeCartBar = storeCartCount > 0 ? (
        <div className="animate-slide-in" style={{ borderTop: `1px solid ${colors.border}` }}>
            <button
                onClick={() => setShowStoreCart((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 transition hover:opacity-80"
            >
                <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: GRADIENT }}
                >
                    <ShoppingBag size={16} color="#ffffff" />
                </div>
                <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                        Sacola de {storeDisplay.name}
                    </p>
                    <p className="text-xs" style={{ color: colors.textSecondary, opacity: 0.75 }}>
                        {storeCartCount} {storeCartCount === 1 ? 'item' : 'itens'} · {formattedStoreCartTotal}
                    </p>
                </div>
                <ChevronRight
                    size={18}
                    style={{
                        color: colors.textSecondary,
                        opacity: 0.5,
                        transform: showStoreCart ? 'rotate(90deg)' : undefined,
                        transition: 'transform 0.2s',
                    }}
                />
            </button>

            {showStoreCart && checkout.checkoutStep === 'delivery' && (
                <div className="px-4 pb-3 max-h-[70vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                            Etapa 1 de 2 · Recebimento
                        </p>
                        <button
                            onClick={() => checkout.setCheckoutStep(null)}
                            className="p-1 rounded-full hover:bg-black/5 transition"
                            style={{ color: colors.textSecondary }}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="mb-3">
                        <p className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>
                            Como você quer receber seu pedido?
                        </p>

                        {checkout.canChooseReceivingMethod ? (
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    {
                                        value: 'retirada' as const,
                                        icon: Store,
                                        label: 'Retirar na loja',
                                        desc: 'Busque no balcão',
                                        priceLine: (
                                            <span className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                                {formatPrice(checkout.getStoreTotals().itemsTotal)}
                                            </span>
                                        ),
                                    },
                                    {
                                        value: 'entrega' as const,
                                        icon: Truck,
                                        label: 'Receber em casa',
                                        desc: 'Entregamos no endereço',
                                        priceLine: checkout.bagDeliveryEstimate.isEstimate ? (
                                            <span className="text-[10px] font-medium" style={{ color: colors.textSecondary, opacity: 0.7 }}>
                                                Frete a calcular
                                            </span>
                                        ) : (
                                            <>
                                                <span className="text-[9px] font-bold" style={{ color: checkout.bagDeliveryEstimate.fee === 0 ? '#22c55e' : colors.textSecondary }}>
                                                    {checkout.bagDeliveryEstimate.fee === 0 ? 'Frete grátis' : `+ ${formatPrice(checkout.bagDeliveryEstimate.fee)} frete`}
                                                </span>
                                                <span className="text-sm font-black" style={{ color: colors.textPrimary }}>
                                                    {formatPrice(checkout.getStoreTotals().itemsTotal + checkout.bagDeliveryEstimate.fee)}
                                                </span>
                                            </>
                                        ),
                                    },
                                ]).map((opt) => {
                                    const selected = checkout.deliveryOption === opt.value
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => checkout.setDeliveryOption(opt.value)}
                                            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 text-center transition hover:scale-[1.02] active:scale-95"
                                            style={selected
                                                ? { borderColor: '#f97316', background: `${colors.accent}10` }
                                                : { borderColor: colors.border, background: 'transparent' }}
                                        >
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                                style={selected ? { background: GRADIENT, color: '#ffffff' } : { background: `${colors.surface}88`, color: colors.textSecondary }}
                                            >
                                                <opt.icon size={18} />
                                            </div>
                                            <span className="text-xs font-bold" style={{ color: selected ? '#f97316' : colors.textPrimary }}>
                                                {opt.label}
                                            </span>
                                            <span className="text-[9px]" style={{ color: colors.textSecondary }}>
                                                {opt.desc}
                                            </span>
                                            <div className="w-full flex flex-col items-center gap-0.5 pt-1.5 mt-0.5 border-t" style={{ borderColor: colors.border }}>
                                                {opt.priceLine}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        ) : checkout.onlyPickupAvailable ? (
                            <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: `${colors.surface}66`, border: `1px dashed ${colors.border}` }}>
                                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                                    <Store size={18} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>Essa loja não tem entrega</p>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>Seu pedido será retirado no balcão</p>
                                </div>
                            </div>
                        ) : checkout.onlyDeliveryAvailable ? (
                            <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: `${colors.surface}66`, border: `1px dashed ${colors.border}` }}>
                                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                                    <Truck size={18} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>Essa loja não faz retirada no local</p>
                                    <p className="text-[10px]" style={{ color: colors.textSecondary }}>Seu pedido será entregue no seu endereço</p>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {checkout.deliveryOption === 'entrega' && (
                        <div className="mb-3">
                            <p className="text-[10px] font-bold uppercase mb-2" style={{ color: colors.textSecondary }}>Endereço de Entrega</p>

                            {checkout.deliveryAddress && !checkout.isEditingAddress ? (
                                <div className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#ffffff' }}>
                                        <MapPin size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {checkout.deliveryAddress}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => { checkout.setIsEditingAddress(true); checkout.setShowAddressSearch(false) }}
                                        className="text-[10px] font-bold underline flex-shrink-0"
                                        style={{ color: '#f97316' }}
                                    >
                                        Alterar
                                    </button>
                                </div>
                            ) : checkout.userAddress && checkout.userLocation && !checkout.showAddressSearch ? (
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={checkout.useSavedAddress}
                                        className="w-full p-3 rounded-xl border-2 border-green-500/30 hover:bg-green-50 transition flex items-center gap-2.5 text-left"
                                        style={{ background: 'rgba(16,185,129,0.05)' }}
                                    >
                                        <Home size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                                        <span className="flex-1 text-xs min-w-0" style={{ color: colors.textPrimary }}>
                                            <span className="font-bold">Usar endereço salvo:</span> {checkout.userAddress}
                                        </span>
                                        <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                                    </button>
                                    <button
                                        onClick={() => checkout.setShowAddressSearch(true)}
                                        className="w-full py-2 rounded-xl border-2 text-xs font-bold transition hover:scale-[1.01]"
                                        style={{ borderColor: colors.border, color: colors.textSecondary }}
                                    >
                                        Alterar
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: colors.border }}>
                                        <Search size={14} style={{ color: colors.textSecondary }} />
                                        <input
                                            type="text"
                                            value={checkout.locationSearchQuery}
                                            onChange={(e) => checkout.setLocationSearchQuery(e.target.value)}
                                            placeholder="Buscar endereço..."
                                            className="flex-1 bg-transparent outline-none text-sm min-w-0"
                                            style={{ color: colors.textPrimary }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') checkout.searchLocation() }}
                                        />
                                    </div>
                                    <button
                                        onClick={checkout.searchLocation}
                                        disabled={checkout.isSearchingLocation}
                                        className="px-3 py-1.5 rounded-full text-xs font-bold text-white disabled:opacity-50 flex-shrink-0"
                                        style={{ background: GRADIENT }}
                                    >
                                        {checkout.isSearchingLocation ? '...' : 'Buscar'}
                                    </button>
                                    {(checkout.deliveryAddress || (checkout.userAddress && checkout.userLocation)) && (
                                        <button
                                            onClick={() => { checkout.setIsEditingAddress(false); checkout.setShowAddressSearch(false) }}
                                            className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
                                            style={{ border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                                        >
                                            Cancelar
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={() => checkout.setCheckoutStep(null)}
                            className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95"
                            style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                        >
                            Voltar
                        </button>
                        <button
                            onClick={() => checkout.setCheckoutStep('payment')}
                            disabled={!checkout.deliveryOption || (checkout.deliveryOption === 'entrega' && !checkout.deliveryAddress.trim())}
                            className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95 disabled:opacity-50"
                            style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 14px #f9731660` }}
                        >
                            {!checkout.deliveryOption ? 'Escolha como receber' :
                                (checkout.deliveryOption === 'entrega' && !checkout.deliveryAddress.trim()) ? 'Informe o endereço' :
                                    'Continuar'}
                        </button>
                    </div>
                </div>
            )}

            {showStoreCart && checkout.checkoutStep === 'payment' && (
                <div className="px-4 pb-3 max-h-[70vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                            Etapa 2 de 2 · Pagamento
                        </p>
                        <button
                            onClick={() => checkout.setCheckoutStep(null)}
                            className="p-1 rounded-full hover:bg-black/5 transition"
                            style={{ color: colors.textSecondary }}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="mb-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                        <div className="max-h-36 overflow-y-auto divide-y" style={{ borderColor: colors.border }}>
                            {storeCartItems.map((item) => (
                                <div
                                    key={`${item.product.id}::${item.comment || ''}`}
                                    className="flex items-center justify-between gap-2 px-3 py-2"
                                    style={{ borderColor: colors.border }}
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {item.product.name}
                                        </p>
                                        <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                            {item.quantity}x {formatPrice(item.product.price)}
                                        </p>
                                    </div>
                                    <span className="text-xs font-black flex-shrink-0" style={{ color: '#f97316' }}>
                                        {formatPrice(item.product.price * item.quantity)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mb-3">
                        <p className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>
                            Como você quer pagar?
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { value: 'pix' as const, icon: QrCode, label: 'Pix', enabled: checkout.storeConfig?.accepts_pix },
                                { value: 'cartao' as const, icon: CreditCard, label: 'Cartão', enabled: checkout.storeConfig?.accepts_card },
                                { value: 'dinheiro' as const, icon: Banknote, label: 'Dinheiro', enabled: checkout.storeConfig?.accepts_cash },
                            ]).filter(opt => opt.enabled).map((opt) => {
                                const selected = checkout.paymentMethod === opt.value
                                return (
                                    <button
                                        key={opt.value}
                                        onClick={() => {
                                            checkout.setPaymentMethod(opt.value)
                                            if (opt.value !== 'dinheiro') checkout.setCashChangeFor('')
                                            if (opt.value !== 'cartao') checkout.setCardIsContactless(null)
                                        }}
                                        className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border-2 text-center transition hover:scale-[1.02] active:scale-95"
                                        style={selected
                                            ? { borderColor: '#f97316', background: `${colors.accent}10` }
                                            : { borderColor: colors.border, background: 'transparent' }}
                                    >
                                        <div
                                            className="w-9 h-9 rounded-full flex items-center justify-center"
                                            style={selected ? { background: GRADIENT, color: '#ffffff' } : { background: `${colors.surface}88`, color: colors.textSecondary }}
                                        >
                                            <opt.icon size={16} />
                                        </div>
                                        <span className="text-[11px] font-bold" style={{ color: selected ? '#f97316' : colors.textPrimary }}>
                                            {opt.label}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        {checkout.paymentMethod === 'dinheiro' && (
                            <input
                                type="text"
                                inputMode="decimal"
                                value={checkout.cashChangeFor}
                                onChange={(e) => checkout.setCashChangeFor(e.target.value.replace(/[^0-9,.]/g, ''))}
                                placeholder="Precisa de troco para quanto? (opcional)"
                                className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />
                        )}

                        {checkout.paymentMethod === 'cartao' && (
                            <div className="mt-2">
                                <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Seu cartão tem aproximação?</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => checkout.setCardIsContactless(true)}
                                        className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                                        style={checkout.cardIsContactless === true ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                    >
                                        Sim
                                    </button>
                                    <button
                                        onClick={() => checkout.setCardIsContactless(false)}
                                        className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                                        style={checkout.cardIsContactless === false ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                    >
                                        Não
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="border-t pt-2.5" style={{ borderColor: colors.border }}>
                        {checkout.deliveryOption === 'entrega' && (
                            <div className="flex justify-between text-xs mb-1">
                                <span style={{ color: colors.textSecondary }}>Taxa de entrega</span>
                                {checkout.getStoreTotals().isCalculating ? (
                                    <span className="italic animate-pulse" style={{ color: colors.textSecondary }}>Calculando...</span>
                                ) : checkout.getStoreTotals().deliveryFee === 0 ? (
                                    <span className="font-bold text-green-500">Grátis</span>
                                ) : (
                                    <span className="font-bold" style={{ color: '#f97316' }}>
                                        {formatPrice(checkout.getStoreTotals().deliveryFee)}
                                    </span>
                                )}
                            </div>
                        )}
                        <div className="flex justify-between text-sm font-bold">
                            <span style={{ color: colors.textPrimary }}>Total</span>
                            {checkout.getStoreTotals().isCalculating ? (
                                <span className="italic" style={{ color: colors.textSecondary }}>Calculando...</span>
                            ) : (
                                <span style={{ color: '#f97316' }}>{formatPrice(checkout.getStoreTotals().finalTotal)}</span>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={() => checkout.setCheckoutStep('delivery')}
                            className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95"
                            style={{ background: 'transparent', border: `2px solid ${colors.border}`, color: colors.textSecondary }}
                        >
                            Voltar
                        </button>
                        <button
                            onClick={checkout.handleFinalizeOrder}
                            disabled={checkout.checkoutLoading || checkout.getStoreTotals().isCalculating || !checkout.paymentMethod}
                            className="flex-1 py-2.5 rounded-xl font-bold text-xs transition hover:scale-105 active:scale-95 disabled:opacity-50"
                            style={{ background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 14px #f9731660` }}
                        >
                            {checkout.checkoutLoading ? 'Finalizando...' :
                                checkout.getStoreTotals().isCalculating ? 'Calculando...' :
                                    !checkout.paymentMethod ? 'Escolha o pagamento' :
                                        'Confirmar Pedido'}
                        </button>
                    </div>
                </div>
            )}

            {showStoreCart && !checkout.checkoutStep && (
                <div className="px-4 pb-3 space-y-2 max-h-64 overflow-y-auto">
                    {storeCartItems.map((item) => {
                        const itemImageUrl = item.product.image_url
                            ? supabase.storage.from('product-images').getPublicUrl(item.product.image_url).data.publicUrl
                            : null
                        return (
                            <div
                                key={`${item.product.id}::${item.comment || ''}`}
                                className="flex items-center gap-2 p-2 rounded-xl"
                                style={{ background: colors.surface }}
                            >
                                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: `${colors.accentLight}20` }}>
                                    {itemImageUrl ? (
                                        <img src={itemImageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Store size={16} style={{ color: colors.textSecondary }} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {item.product.name}
                                    </p>
                                    <p className="text-xs font-bold" style={{ color: colors.accent }}>
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.product.price)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                        onClick={() => updateQuantity(ownerSlug, item.product.id, -1, item.comment)}
                                        className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                        style={{ background: GRADIENT, color: '#ffffff' }}
                                    >
                                        <Minus size={10} />
                                    </button>
                                    <span className="text-xs font-bold min-w-[16px] text-center" style={{ color: colors.textPrimary }}>
                                        {item.quantity}
                                    </span>
                                    <button
                                        onClick={() => updateQuantity(ownerSlug, item.product.id, 1, item.comment)}
                                        className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                        style={{ background: GRADIENT, color: '#ffffff' }}
                                    >
                                        <Plus size={10} />
                                    </button>
                                    <button
                                        onClick={() => removeItem(ownerSlug, item.product.id, item.comment)}
                                        className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                        style={{ background: '#ef4444', color: '#ffffff' }}
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            </div>
                        )
                    })}

                    <button
                        onClick={checkout.startCheckout}
                        disabled={!checkout.isStoreOpen}
                        className="w-full py-2.5 rounded-xl font-bold text-sm transition hover:scale-[1.01] disabled:opacity-60"
                        style={{ background: GRADIENT, color: '#ffffff' }}
                    >
                        {checkout.isStoreOpen ? 'Finalizar' : 'Loja fechada no momento'}
                    </button>
                </div>
            )}
        </div>
    ) : null

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            {/* Header flutuante sobre a imagem (mobile) */}
            <div className="md:hidden absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-4">
                <button
                    onClick={() => router.back()}
                    aria-label="Voltar"
                    className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition hover:scale-105"
                    style={{ background: 'rgba(17,17,17,0.4)' }}
                >
                    <ArrowLeft size={20} color="#ffffff" />
                </button>
                <button
                    onClick={() => handleShareLink({
                        title: `${product.name || 'Produto'} | ${storeDisplay.name}`,
                        text: product.description || 'Confira no iUser!'
                    })}
                    aria-label="Compartilhar"
                    className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition hover:scale-105"
                    style={{ background: 'rgba(17,17,17,0.4)' }}
                >
                    <Share2 size={18} color="#ffffff" />
                </button>
            </div>

            {/* Header no fluxo normal (web) */}
            <div className="hidden md:flex items-center gap-3 max-w-6xl mx-auto px-6 pt-6">
                <button
                    onClick={() => router.back()}
                    aria-label="Voltar"
                    className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full text-sm font-medium transition hover:scale-105"
                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                >
                    <ArrowLeft size={16} />
                    Voltar
                </button>
            </div>

            <div className={`${storeCartBar ? 'pb-48' : 'pb-32'} md:pb-0 md:max-w-6xl md:mx-auto md:px-6 md:pt-6`}>
                <div className="md:grid md:grid-cols-2 md:gap-10 md:items-start">
                    {/* Imagem em destaque, tipo capa de produto */}
                    <div className="relative w-full h-[38vh] min-h-[260px] max-h-[400px] md:h-auto md:aspect-square md:rounded-3xl md:overflow-hidden md:sticky md:top-6">
                        {(imageUrl || finalStoreImage) ? (
                            <img
                                src={imageUrl || finalStoreImage || ''}
                                alt={product.name || 'Produto'}
                                className={`w-full h-full ${imageUrl ? 'object-cover' : 'object-contain p-12'}`}
                                style={!imageUrl ? { background: `${colors.accentLight}25` } : undefined}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: `${colors.accentLight}25` }}>
                                <Store size={72} style={{ color: colors.accent, opacity: 0.5 }} />
                            </div>
                        )}

                        {/* Compartilhar - flutua sobre a imagem também no web */}
                        <button
                            onClick={() => handleShareLink({
                                title: `${product.name || 'Produto'} | ${storeDisplay.name}`,
                                text: product.description || 'Confira no iUser!'
                            })}
                            aria-label="Compartilhar"
                            className="hidden md:flex absolute top-4 right-4 w-10 h-10 rounded-full items-center justify-center backdrop-blur-md transition hover:scale-105"
                            style={{ background: 'rgba(17,17,17,0.4)' }}
                        >
                            <Share2 size={18} color="#ffffff" />
                        </button>
                    </div>

                    {/* Sheet de conteúdo (mobile: sobreposto à imagem / web: coluna ao lado) */}
                    <main className="relative z-10 -mt-5 rounded-t-[28px] md:mt-0 md:rounded-none" style={{ background: colors.background }}>
                        <div className="flex justify-center pt-2.5 pb-1 md:hidden">
                            <div className="w-10 h-1 rounded-full" style={{ background: colors.border }} />
                        </div>

                        <div className="px-5 pt-3 md:px-0 md:pt-0 space-y-5">
                            {/* Título e preço */}
                            <div>
                                <h1 className="text-[26px] md:text-3xl leading-tight font-black" style={{ color: colors.textPrimary }}>
                                    {product.name || 'Sem título'}
                                </h1>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-2xl md:text-3xl font-black" style={{ color: colors.accent }}>
                                        {formattedPrice}
                                    </span>
                                    {product.view_count !== null && product.view_count !== undefined && product.view_count > 0 && (
                                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: colors.textSecondary, opacity: 0.7 }}>
                                            <Eye size={13} />
                                            {product.view_count}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Cabeçalho - Loja */}
                            <button
                                className="w-full flex items-center gap-3 p-3 rounded-2xl transition hover:scale-[1.01]"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                                onClick={goToStore}
                            >
                                <div
                                    className="w-11 h-11 rounded-full overflow-hidden border-2 flex-shrink-0"
                                    style={{ borderColor: colors.background }}
                                >
                                    {finalStoreImage ? (
                                        <img
                                            src={finalStoreImage}
                                            alt={storeDisplay.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ background: colors.border }}>
                                            <Store size={18} style={{ color: colors.textSecondary }} />
                                        </div>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1 text-left">
                                    <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                        {storeDisplay.name}
                                    </p>
                                    <div className="flex items-center gap-2 text-[11px]" style={{ color: colors.textSecondary, opacity: 0.75 }}>
                                        <span className="flex items-center gap-1">
                                            <Calendar size={11} />
                                            {formattedDate}
                                        </span>
                                    </div>
                                </div>

                                <ChevronRight size={18} style={{ color: colors.textSecondary, opacity: 0.5 }} />
                            </button>

                            {/* Descrição */}
                            {product.description && (
                                <div>
                                    <h2 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textSecondary, opacity: 0.6 }}>
                                        Sobre o produto
                                    </h2>
                                    <p style={{ color: colors.textSecondary, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                        {product.description}
                                    </p>
                                </div>
                            )}

                            {/* Quantidade e adicionar ao carrinho (web: inline na coluna) */}
                            <div className="hidden md:flex items-center gap-3 pt-2">
                                {cartControls}
                            </div>

                            {/* Sacola da loja (web: cartão abaixo dos controles) */}
                            {storeCartBar && (
                                <div className="hidden md:block rounded-2xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                                    {storeCartBar}
                                </div>
                            )}
                        </div>
                    </main>
                </div>

                {/* Outros produtos da loja */}
                {otherProducts.length > 0 && (
                    <div className="px-5 md:px-0 mt-5 md:mt-10">
                        <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary, opacity: 0.6 }}>
                            Você também pode gostar
                        </h2>
                        <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 md:mx-0 md:px-0 scrollbar-hide">
                            {otherProducts.map((other) => {
                                const otherImageUrl = other.image_url
                                    ? supabase.storage.from('product-images').getPublicUrl(other.image_url).data.publicUrl
                                    : finalStoreImage

                                const otherPrice = other.price !== null && other.price !== undefined
                                    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(other.price)
                                    : 'Sob consulta'

                                return (
                                    <button
                                        key={other.id}
                                        onClick={() => router.push(`/${ownerSlug}/${other.slug}`)}
                                        className="text-left rounded-2xl overflow-hidden flex-shrink-0 w-36 md:w-44 transition-transform hover:scale-[1.02]"
                                        style={{
                                            background: colors.surface,
                                            border: `1px solid ${colors.border}`,
                                            boxShadow: colors.shadow,
                                        }}
                                    >
                                        <div className="w-full aspect-square" style={{ background: `${colors.accentLight}20` }}>
                                            {otherImageUrl ? (
                                                <img
                                                    src={otherImageUrl}
                                                    alt={other.name}
                                                    className={`w-full h-full ${other.image_url ? 'object-cover' : 'object-contain p-4'}`}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Store size={24} style={{ color: colors.textSecondary }} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2.5">
                                            <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                {other.name}
                                            </p>
                                            <p className="text-xs font-black mt-0.5" style={{ color: colors.accent }}>
                                                {otherPrice}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Barra fixa (mobile): controles de quantidade em cima, sacola da loja
                embaixo — ao adicionar o primeiro item, a sacola aparece por baixo
                e "empurra" os controles de quantidade pra cima. */}
            <div
                className="md:hidden fixed bottom-0 inset-x-0 z-20"
                style={{
                    background: colors.background,
                    borderTop: `1px solid ${colors.border}`,
                    boxShadow: '0 -8px 24px rgba(0,0,0,0.08)',
                }}
            >
                <div
                    className="flex items-center gap-3 px-4 pt-3"
                    style={{ paddingBottom: storeCartBar ? 12 : 'calc(env(safe-area-inset-bottom) + 12px)' }}
                >
                    {cartControls}
                </div>

                {storeCartBar && (
                    <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom))' }}>
                        {storeCartBar}
                    </div>
                )}
            </div>

            {/* ===== MODAL DE AUTENTICAÇÃO (login/cadastro antes de finalizar) ===== */}
            {checkout.checkoutStep === 'auth' && (
                <div
                    className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                    onClick={() => { if (!checkout.authLoading) checkout.setCheckoutStep(null) }}
                >
                    <div
                        className="w-full max-w-md rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto"
                        style={{ background: colors.surface }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                {checkout.authMode === 'login' ? 'Entrar' : 'Criar Conta'}
                            </h3>
                            <button
                                onClick={() => checkout.setCheckoutStep(null)}
                                className="p-1.5 rounded-full hover:bg-black/5 transition"
                                style={{ color: colors.textSecondary }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                            {checkout.authMode === 'login' ? 'Entre para finalizar seu pedido' : 'Crie sua conta e finalize seu pedido'}
                        </p>

                        {checkout.authError && (
                            <div className="p-3 border rounded-full text-[8px] font-black uppercase text-center mb-3"
                                style={{ background: '#f9731620', borderColor: '#f97316', color: '#f97316' }}>
                                ⚠️ {checkout.authError}
                            </div>
                        )}

                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => checkout.setAuthMode('login')}
                                className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase transition-all ${checkout.authMode === 'login' ? 'shadow-sm' : ''}`}
                                style={checkout.authMode === 'login' ? { background: GRADIENT, color: '#ffffff' } : { background: colors.background, color: colors.textSecondary, border: `2px solid ${colors.border}` }}
                            >
                                Entrar
                            </button>
                            <button
                                onClick={() => checkout.setAuthMode('register')}
                                className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase transition-all ${checkout.authMode === 'register' ? 'shadow-sm' : ''}`}
                                style={checkout.authMode === 'register' ? { background: GRADIENT, color: '#ffffff' } : { background: colors.background, color: colors.textSecondary, border: `2px solid ${colors.border}` }}
                            >
                                Criar Conta
                            </button>
                        </div>

                        {checkout.authMode === 'login' ? (
                            <form onSubmit={checkout.handleLogin} className="space-y-3">
                                <input
                                    type="email"
                                    placeholder="seu@email.com"
                                    className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                    value={checkout.authEmail}
                                    onChange={(e) => checkout.setAuthEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                                <div className="relative">
                                    <input
                                        type={checkout.showPassword ? 'text' : 'password'}
                                        placeholder="sua senha"
                                        className="w-full border-2 rounded-full px-4 py-2.5 text-sm pr-10"
                                        style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                        value={checkout.authPassword}
                                        onChange={(e) => checkout.setAuthPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => checkout.setShowPassword(!checkout.showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2"
                                        style={{ color: colors.textSecondary }}
                                    >
                                        {checkout.showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <button
                                    type="submit"
                                    disabled={checkout.authLoading}
                                    className="w-full py-2.5 rounded-full font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    {checkout.authLoading ? 'Entrando...' : 'Entrar'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={checkout.handleRegister} className="space-y-3">
                                <div className="flex flex-col items-center gap-1.5 pb-1">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-full p-[2px]" style={{ background: GRADIENT }}>
                                            <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                                {checkout.authAvatarPreview ? (
                                                    <img src={checkout.authAvatarPreview} alt="Foto de perfil" className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-6 h-6" style={{ color: '#f97316', opacity: 0.4 }} />
                                                )}
                                            </div>
                                        </div>
                                        <input
                                            type="file"
                                            ref={checkout.authAvatarInputRef}
                                            onChange={checkout.handleAuthAvatarChange}
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => checkout.authAvatarInputRef.current?.click()}
                                            disabled={checkout.authLoading}
                                            className="absolute -bottom-1 -right-1 p-1.5 rounded-full transition-all hover:scale-110"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            <Camera size={12} />
                                        </button>
                                    </div>
                                    <span className="text-[9px] font-bold" style={{ color: colors.textSecondary }}>
                                        Foto de perfil (obrigatória)
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Nome Completo"
                                    className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                    value={checkout.authName}
                                    onChange={(e) => checkout.setAuthName(e.target.value)}
                                    required
                                    autoComplete="name"
                                />
                                <div className="flex items-center gap-1 border-2 rounded-full px-3" style={{ background: colors.background, borderColor: colors.border }}>
                                    <span className="text-[9px] font-black" style={{ color: colors.textSecondary }}>iuser.com.br/</span>
                                    <input
                                        type="text"
                                        placeholder="seu-perfil"
                                        className="flex-1 py-2.5 bg-transparent text-sm outline-none"
                                        style={{ color: colors.textPrimary }}
                                        value={checkout.authProfileSlug}
                                        onChange={(e) => checkout.setAuthProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                        required
                                        autoComplete="off"
                                    />
                                    {checkout.isSlugAvailable !== null && (
                                        <span className={`text-[9px] font-black ${checkout.isSlugAvailable ? 'text-green-500' : 'text-red-500'}`}>
                                            {checkout.isSlugAvailable ? '✓' : '✗'}
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="email"
                                    placeholder="seu@email.com"
                                    className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                    value={checkout.authEmail}
                                    onChange={(e) => checkout.setAuthEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                                <input
                                    type={checkout.showPassword ? 'text' : 'password'}
                                    placeholder="Senha"
                                    className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                    value={checkout.authPassword}
                                    onChange={(e) => checkout.setAuthPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                />
                                <input
                                    type={checkout.showPassword ? 'text' : 'password'}
                                    placeholder="Confirmar senha"
                                    className="w-full border-2 rounded-full px-4 py-2.5 text-sm"
                                    style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                    value={checkout.authConfirmPassword}
                                    onChange={(e) => checkout.setAuthConfirmPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                />
                                <button
                                    type="submit"
                                    disabled={checkout.authLoading || checkout.isSlugAvailable === false || !checkout.authAvatarFile}
                                    className="w-full py-2.5 rounded-full font-black uppercase text-[9px] tracking-wider transition-all disabled:opacity-50"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    {checkout.authLoading ? 'Criando...' : 'Criar Conta'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}