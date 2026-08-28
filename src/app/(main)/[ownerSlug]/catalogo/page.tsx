// app/src/app/(main)/[ownerSlug]/catalogo/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useCartStore } from '@/store/useCartStore'
import { Plus, X, Info, Search, Clock, Tag, Package, Calendar, ShoppingBag, Minus, Trash2, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import { isStoreOpenNow, getNextOpeningInfo, type BusinessHours } from '@/lib/storeHours'
import { toast } from 'sonner'
import ButtonSearch from '@/app/ButtonSearch'

interface Product {
    id: string
    name: string
    description: string | null
    price: number
    image_url: string | null
    category: string | null
    stock: number | null
    store_id: string
    type?: string
    price_type?: string
    slug?: string
    created_at?: string
}

interface StoreInfo {
    id: string
    name: string
    slug: string
    logo_url: string | null
    banner_url: string | null
    business_hours?: BusinessHours | null
}

interface CartItemWithComment {
    product: any
    quantity: number
    comment?: string
}

export default function CatalogoPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const {
        bgMode,
        customBgUrl,
        profileSlug: loggedUserSlug,
        avatarUrl: loggedUserAvatarUrl,
        loading: profileLoading
    } = useProfile()
    const { itemsByStore, addItem, removeItem, updateQuantity } = useCartStore()

    const ownerSlug = Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug

    const [loading, setLoading] = useState(true)
    const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
    const [products, setProducts] = useState<Product[]>([])
    const [cartAnimating, setCartAnimating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
    const [showProductModal, setShowProductModal] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos')
    const [searchExpanded, setSearchExpanded] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // ===== NOVOS STATES PARA O BUTTON SHOPPING BAG =====
    const [isBagExpanded, setIsBagExpanded] = useState(false)
    const [bagItems, setBagItems] = useState<CartItemWithComment[]>([])
    const [showAddCommentModal, setShowAddCommentModal] = useState(false)
    const [commentProduct, setCommentProduct] = useState<any | null>(null)
    const [commentText, setCommentText] = useState('')
    const [pendingProduct, setPendingProduct] = useState<any | null>(null)

    // ========== STATUS DA LOJA ==========
    const isStoreOpen = useMemo(() => {
        if (!storeInfo) return false
        return isStoreOpenNow(storeInfo.business_hours)
    }, [storeInfo])

    const nextAvailable = useMemo(() => {
        if (!storeInfo?.business_hours) return null
        const next = getNextOpeningInfo(storeInfo.business_hours)
        if (!next) return null
        return {
            day: next.dayLabel,
            open: next.time,
        }
    }, [storeInfo?.business_hours])

    // ========== GRADIENTES ==========
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
    const GRADIENT_DARK = 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(220, 38, 38, 0.15))'
    const GRADIENT_DARKER = 'linear-gradient(135deg, rgba(249, 115, 22, 0.25), rgba(220, 38, 38, 0.25))'

    // ========== CORES DO HEADER ==========
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        }
    }
    const surfaceRgb = hexToRgb(colors.surface)

    const gradientBg = `linear-gradient(to bottom, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 1) 0%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.95) 20%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.8) 40%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.5) 60%,
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2) 80%,
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0) 100%)`

    // ========== CARREGAR DADOS DA LOJA ==========
    useEffect(() => {
        async function loadStoreData() {
            if (!ownerSlug) {
                setError('Loja não encontrada')
                setLoading(false)
                return
            }

            try {
                const { data: store, error: storeError } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, logo_url, banner_url, business_hours')
                    .eq('storeSlug', ownerSlug)
                    .maybeSingle()

                if (storeError || !store) {
                    setError('Loja não encontrada')
                    setLoading(false)
                    return
                }

                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select('*')
                    .eq('store_id', store.id)
                    .eq('listing_type', 'sale')
                    .order('created_at', { ascending: false })

                if (productsError) {
                    console.error('Erro ao buscar produtos:', productsError)
                }

                const productsWithUrls = (productsData || []).map((p: any) => {
                    let imageUrl: string | null = null
                    if (p.image_url) {
                        const { data: publicUrlData } = supabase.storage
                            .from('product-images')
                            .getPublicUrl(p.image_url)
                        imageUrl = publicUrlData.publicUrl
                    }
                    return {
                        ...p,
                        image_url: imageUrl,
                    }
                })

                let logoUrl: string | null = null
                if (store.logo_url) {
                    const { data: logoData } = supabase.storage
                        .from('store-logos')
                        .getPublicUrl(store.logo_url)
                    logoUrl = logoData.publicUrl
                }

                let bannerUrl: string | null = null
                if (store.banner_url) {
                    const { data: bannerData } = supabase.storage
                        .from('store-banners')
                        .getPublicUrl(store.banner_url)
                    bannerUrl = bannerData.publicUrl
                }

                setStoreInfo({
                    id: store.id,
                    name: store.name,
                    slug: store.storeSlug,
                    logo_url: logoUrl,
                    banner_url: bannerUrl,
                    business_hours: store.business_hours,
                })

                setProducts(productsWithUrls)
            } catch (err: any) {
                console.error('Erro ao carregar dados:', err)
                setError('Erro ao carregar página')
            } finally {
                setLoading(false)
            }
        }

        loadStoreData()
    }, [ownerSlug])

    useEffect(() => {
        setMounted(true)
    }, [])

    // ========== FUNÇÕES DO CARRINHO (integrado com o bag) ==========
    const storeKey = useMemo(() => {
        if (!ownerSlug) return ''
        return ownerSlug
    }, [ownerSlug])

    const cartItems = useMemo(() => {
        if (!storeKey) return []
        return itemsByStore[storeKey] || []
    }, [itemsByStore, storeKey])

    // Sincroniza o bag com o cart
    useEffect(() => {
        const items = cartItems.map(item => ({
            product: item.product,
            quantity: item.quantity,
            comment: (item as any).comment || ''
        }))
        setBagItems(items)
    }, [cartItems])

    const totalCartQuantity = useMemo(
        () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
        [cartItems]
    )

    const totalCartValue = useMemo(() => {
        let total = 0
        Object.values(itemsByStore).forEach(items => {
            items.forEach(item => {
                const price = item.product?.price || 0
                const quantity = item.quantity || 1
                total += Number(price) * quantity
            })
        })
        return total
    }, [itemsByStore])

    const getProductQuantity = useCallback(
        (productId: string) => {
            if (!ownerSlug) return 0
            const storeItems = itemsByStore[ownerSlug] || []
            const found = storeItems.find((item) => item.product.id === productId)
            return found ? found.quantity : 0
        },
        [itemsByStore, ownerSlug]
    )

    // ===== NOVA FUNÇÃO: Adicionar com comentário =====
    const handleAddWithComment = (product: any) => {
        if (!storeInfo || !ownerSlug) return

        if (!isStoreOpen) {
            toast.error('Loja fechada no momento. Não é possível adicionar itens ao carrinho.')
            return
        }

        setPendingProduct(product)
        setCommentText('')
        setShowAddCommentModal(true)
    }

    const confirmAddWithComment = () => {
        if (!pendingProduct || !storeInfo || !ownerSlug) return

        const storeDetails = {
            name: storeInfo.name,
            logo_url: storeInfo.logo_url ?? null,
        }

        const cartProduct = {
            id: pendingProduct.id,
            name: pendingProduct.name,
            price: pendingProduct.price || 0,
            image_url: pendingProduct.image_url || null,
            slug: pendingProduct.slug,
            description: pendingProduct.description || undefined,
            category: pendingProduct.category || undefined,
        }

        // Adiciona com comentário
        addItem(ownerSlug, storeDetails, cartProduct as any)

        // Atualiza o item com comentário
        setTimeout(() => {
            const storeItems = itemsByStore[ownerSlug] || []
            const found = storeItems.find((item: any) => item.product.id === pendingProduct.id)
            if (found) {
                // Atualiza o comentário via store
                const updatedItems = storeItems.map((item: any) => {
                    if (item.product.id === pendingProduct.id) {
                        return { ...item, comment: commentText.trim() || undefined }
                    }
                    return item
                })
                // Atualiza o estado do bag
                const items = updatedItems.map(item => ({
                    product: item.product,
                    quantity: item.quantity,
                    comment: (item as any).comment || ''
                }))
                setBagItems(items)
            }
        }, 100)

        toast.success(`Produto adicionado${commentText.trim() ? ' com observação!' : '!'}`)
        setShowAddCommentModal(false)
        setPendingProduct(null)
        setCommentText('')
    }

    const increaseQuantity = useCallback(
        (product: any) => {
            if (!storeInfo || !ownerSlug) return

            if (!isStoreOpen) {
                toast.error('Loja fechada no momento. Não é possível adicionar itens ao carrinho.')
                return
            }

            addItem(ownerSlug, { name: storeInfo.name, logo_url: storeInfo.logo_url ?? null }, product)
        },
        [storeInfo, ownerSlug, addItem, isStoreOpen]
    )

    const decreaseQuantity = useCallback(
        (productId: string) => {
            if (!ownerSlug) return
            updateQuantity(ownerSlug, productId, -1)
        },
        [ownerSlug, updateQuantity]
    )

    const removeAllOfProduct = useCallback(
        (productId: string) => {
            if (!ownerSlug) return
            removeItem(ownerSlug, productId)
            // Remove do bag também
            setBagItems(prev => prev.filter(item => item.product.id !== productId))
        },
        [ownerSlug, removeItem]
    )

    // ===== HANDLE PRODUCT CLICK =====
    const handleProductClick = (product: any, e?: React.MouseEvent) => {
        if (e?.target && (e.target as HTMLElement).closest('.product-action-button')) {
            return
        }

        if (!ownerSlug) return

        setSelectedProduct(product)
        setShowProductModal(true)
    }

    // ========== FILTRO DE PRODUTOS ==========
    const filteredProducts = useMemo(() => {
        let result = products

        if (selectedCategory !== 'Todos') {
            result = result.filter(p => p.category === selectedCategory)
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            result = result.filter(p =>
                p.name?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query) ||
                p.category?.toLowerCase().includes(query)
            )
        }

        return result
    }, [products, searchQuery, selectedCategory])

    // ========== CATEGORIAS PARA TABS COM CONTAGENS ==========
    const categories = useMemo(() => {
        const cats = new Map<string, number>()
        products.forEach(p => {
            if (p.category) {
                cats.set(p.category, (cats.get(p.category) || 0) + 1)
            }
        })
        return [
            { name: 'Todos', count: products.length },
            ...Array.from(cats.entries()).map(([name, count]) => ({ name, count }))
        ]
    }, [products])

    // ========== VOLTAR PARA A PÁGINA DA LOJA ==========
    const handleGoBack = () => {
        if (!ownerSlug) {
            router.push('/')
            return
        }
        router.push(`/${ownerSlug}`)
    }

    const handleHome = () => {
        router.push('/')
    }

    // ========== FORMATAR PREÇO ==========
    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(price)
    }

    // ========== RENDER ==========
    if (loading) {
        return <LoadingSpinner message="Carregando catálogo..." background={colors.background} />
    }

    if (error || !storeInfo || !ownerSlug) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">📦</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Catálogo não encontrado'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Não foi possível carregar o catálogo desta loja.
                    </p>
                    <button
                        onClick={handleGoBack}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        Voltar à loja
                    </button>
                </div>
            </div>
        )
    }

    // Cor padrão para os textos
    const textColor = colors.textPrimary
    const cardBackground = colors.surface

    // ===== COMPONENTE BUTTON SHOPPING BAG EMBUTIDO =====
    const ButtonShoppingBag = () => {
        const totalItems = bagItems.reduce((sum, item) => sum + item.quantity, 0)
        const totalValue = bagItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)

        return (
            <div className="relative">
                {/* Botão principal - sempre visível com informações */}
                <div
                    className="rounded-2xl shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden"
                    style={{
                        background: cardBackground,
                        border: `2px solid ${totalItems > 0 ? colors.accent : colors.border}`,
                        boxShadow: totalItems > 0 ? `0 8px 32px rgba(0,0,0,0.15)` : `0 4px 16px rgba(0,0,0,0.08)`,
                        minWidth: isBagExpanded ? 280 : 56,
                        maxWidth: isBagExpanded ? 360 : 56,
                    }}
                >
                    {/* Header do botão - sempre visível com informações */}
                    <div
                        className="flex items-center gap-2 p-2"
                        onClick={() => setIsBagExpanded(!isBagExpanded)}
                    >
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: totalItems > 0 ? GRADIENT : `${colors.border}50`, color: totalItems > 0 ? '#ffffff' : colors.textSecondary }}
                        >
                            <ShoppingBag size={18} />
                        </div>

                        {!isBagExpanded ? (
                            // Estado recolhido - mostra informações resumidas com o valor total
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
                        ) : (
                            // Estado expandido - mostra mais detalhes
                            <div className="flex-1 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm" style={{ color: textColor }}>
                                        Sacola
                                    </span>
                                    <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                                        ({totalItems} {totalItems === 1 ? 'item' : 'itens'})
                                    </span>
                                </div>
                                <span className="text-sm font-bold" style={{ color: '#f97316' }}>
                                    {formatPrice(totalValue)}
                                </span>
                            </div>
                        )}

                        {isBagExpanded && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsBagExpanded(false)
                                }}
                                className="p-1 rounded-full hover:bg-black/5 transition"
                                style={{ color: colors.textSecondary }}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Conteúdo expandido */}
                    {isBagExpanded && (
                        <div className="border-t px-2 py-2 max-h-64 overflow-y-auto" style={{ borderColor: colors.border }}>
                            {bagItems.length === 0 ? (
                                <p className="text-xs text-center py-4" style={{ color: colors.textSecondary }}>
                                    Nenhum item na sacola
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {bagItems.map((item) => (
                                        <div
                                            key={item.product.id}
                                            className="flex items-center gap-2 p-1.5 rounded-lg"
                                            style={{ background: `${colors.surface}66` }}
                                        >
                                            {/* Imagem mini */}
                                            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                                                {item.product.image_url ? (
                                                    <img
                                                        src={item.product.image_url}
                                                        alt={item.product.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-lg">
                                                        📦
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
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
                                                    {item.comment && (
                                                        <span className="text-[10px] flex items-center gap-0.5" style={{ color: colors.textSecondary }}>
                                                            <MessageCircle size={10} />
                                                            {item.comment.length > 15 ? item.comment.slice(0, 15) + '...' : item.comment}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Ações rápidas */}
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (item.quantity <= 1) {
                                                            removeAllOfProduct(item.product.id)
                                                        } else {
                                                            decreaseQuantity(item.product.id)
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
                                                        increaseQuantity(item.product)
                                                    }}
                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold hover:scale-110 transition-transform"
                                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                                >
                                                    <Plus size={10} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        removeAllOfProduct(item.product.id)
                                                    }}
                                                    className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                                    style={{ background: '#ef4444', color: '#ffffff' }}
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Total e botão de finalizar */}
                                    <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: colors.border }}>
                                        <span className="text-xs font-bold" style={{ color: textColor }}>
                                            Total: {formatPrice(totalValue)}
                                        </span>
                                        <button
                                            onClick={() => router.push('/sacola')}
                                            className="px-4 py-1.5 rounded-full text-xs font-bold transition hover:scale-105 active:scale-95"
                                            style={{ background: GRADIENT, color: '#ffffff' }}
                                        >
                                            Finalizar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh pb-32">
                {/* ===== HEADER EMBUTIDO ===== */}
                <div
                    style={{
                        color: colors.textPrimary,
                        padding: '8px 12px 0 12px',
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        overflow: 'hidden',
                        background: gradientBg,
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                        minHeight: 120,
                    }}
                    className="sm:px-6 sm:pt-5"
                >
                    {/* Marca d'água */}
                    <div
                        style={{
                            position: 'absolute',
                            right: storeInfo.logo_url ? -15 : -5,
                            top: storeInfo.logo_url ? -15 : -5,
                            width: storeInfo.logo_url ? 130 : 90,
                            height: storeInfo.logo_url ? 130 : 90,
                            opacity: storeInfo.logo_url ? 0.45 : 0.35,
                            transform: 'rotate(6deg)',
                            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0) 75%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0) 75%)',
                            pointerEvents: 'none',
                            background: storeInfo.logo_url ? 'transparent' : colors.accent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1,
                        }}
                    >
                        {storeInfo.logo_url ? (
                            <img
                                src={storeInfo.logo_url}
                                alt=""
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '50%',
                                }}
                            />
                        ) : (
                            <img
                                src="/logotransparente.png"
                                alt="headerimage"
                                style={{ width: 45, height: 45, objectFit: 'contain' }}
                            />
                        )}
                    </div>

                    {/* Conteúdo do Header */}
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <button
                                onClick={handleHome}
                                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                            >
                                <img src="/logo.png" alt="iUser" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" />
                            </button>
                            <button
                                onClick={handleHome}
                                className="text-sm sm:text-lg font-semibold opacity-90 bg-transparent border-none cursor-pointer"
                                style={{ color: colors.textPrimary }}
                            >
                                iUser
                            </button>
                        </div>

                        <div className="flex items-center gap-3 mt-1">
                            {storeInfo.logo_url && (
                                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2" style={{ borderColor: colors.accent }}>
                                    <img src={storeInfo.logo_url} alt={storeInfo.name} className="w-full h-full object-cover" />
                                </div>
                            )}
                            <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight break-words" style={{ color: colors.textPrimary }}>
                                {storeInfo.name}
                            </h1>
                        </div>

                        {categories.length > 1 && (
                            <div
                                className="flex gap-1.5 mt-2 overflow-x-auto scroll-smooth pb-1 pt-1 scrollbar-hide px-1"
                                style={{
                                    overflowY: 'visible',
                                    paddingLeft: '4px',
                                    paddingRight: '4px',
                                }}
                            >
                                {categories.map((cat) => {
                                    const isActive = selectedCategory === cat.name
                                    return (
                                        <button
                                            key={cat.name}
                                            onClick={() => setSelectedCategory(cat.name)}
                                            className="relative flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap flex-shrink-0 hover:scale-105"
                                            style={{
                                                background: isActive
                                                    ? GRADIENT
                                                    : 'transparent',
                                                color: textColor,
                                                boxShadow: isActive ? `0 2px 12px #f9731650` : 'none',
                                                border: isActive ? 'none' : `1px solid ${colors.border}44`,
                                                ...(isActive ? {
                                                    fontWeight: 'bold',
                                                    transform: 'scale(1.05)',
                                                } : {}),
                                            }}
                                        >
                                            <div
                                                className="h-7 w-7 sm:h-9 sm:w-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
                                                style={{
                                                    background: isActive
                                                        ? 'linear-gradient(135deg, #f97316, #dc2626)'
                                                        : colors.surface,
                                                    color: textColor,
                                                    border: isActive ? 'none' : `1px solid ${colors.border}33`,
                                                }}
                                            >
                                                {cat.count}
                                            </div>
                                            <span className="ml-1.5 sm:ml-2">{cat.name}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Banner da loja */}
                {storeInfo.banner_url && (
                    <div className="w-full h-96 md:h-[32rem] relative overflow-hidden">
                        <Image
                            src={storeInfo.banner_url}
                            alt={storeInfo.name}
                            fill
                            className="object-cover"
                            style={{
                                maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 60%, rgba(0,0,0,0.8) 75%, rgba(0,0,0,0.4) 90%, rgba(0,0,0,0) 100%)',
                                WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 60%, rgba(0,0,0,0.8) 75%, rgba(0,0,0,0.4) 90%, rgba(0,0,0,0) 100%)',
                            }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    </div>
                )}

                {/* Status da loja */}
                {!isStoreOpen && (
                    <div className="max-w-7xl mx-auto px-4 pt-4">
                        <div
                            className="rounded-xl p-3 text-center"
                            style={{
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: `1px dashed #ef4444`,
                            }}
                        >
                            <Info size={16} style={{ color: '#ef4444' }} className="inline mr-2" />
                            <span className="text-xs font-bold" style={{ color: '#ef4444' }}>
                                Loja fechada no momento
                            </span>
                            {nextAvailable && (
                                <span className="text-xs ml-2" style={{ color: '#f97316' }}>
                                    Abre {nextAvailable.day} às {nextAvailable.open}
                                </span>
                            )}
                            <span className="text-xs ml-2" style={{ color: textColor }}>
                                Clique no produto para ver detalhes
                            </span>
                        </div>
                    </div>
                )}

                {/* Catálogo de produtos */}
                <div className="max-w-7xl mx-auto px-1 py-1">
                    {filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="text-6xl mb-4">🛍️</div>
                            <h3 className="text-xl font-semibold" style={{ color: textColor }}>
                                {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}
                            </h3>
                            <p className="text-sm mt-2" style={{ color: textColor }}>
                                {searchQuery ? 'Tente buscar com outro termo' : 'Esta loja ainda não possui produtos em seu catálogo.'}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {filteredProducts.map((product) => {
                                const isSelected = mounted && cartItems.some((item: any) => item.product.id === product.id)
                                const quantity = getProductQuantity(product.id)
                                const isHourly = product.price_type === 'hourly'
                                const productIsDisabled = !isStoreOpen

                                const handleProductInteraction = (e: React.MouseEvent) => {
                                    e.stopPropagation()
                                    if (productIsDisabled) {
                                        handleProductClick(product, e)
                                    } else {
                                        // Abre o modal de comentário em vez de adicionar direto
                                        handleAddWithComment(product)
                                    }
                                }

                                return (
                                    <div
                                        key={product.id}
                                        onClick={(e) => handleProductClick(product, e)}
                                        className={`group rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl cursor-pointer border-4 flex flex-row`}
                                        style={{
                                            background: cardBackground,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                            borderColor: isSelected ? '#22c55e' : 'transparent',
                                        }}
                                    >
                                        <div className="w-32 sm:w-40 md:w-48 flex-shrink-0 relative bg-gray-100 overflow-hidden" style={{ minHeight: '140px', height: 'auto' }}>
                                            {product.image_url ? (
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                                    style={{ minHeight: '140px' }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200" style={{ minHeight: '140px' }}>
                                                    <span className="text-3xl opacity-50">📦</span>
                                                </div>
                                            )}
                                            {product.type && (
                                                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase backdrop-blur-md"
                                                    style={{ background: 'rgba(0,0,0,0.3)', color: '#ffffff' }}>
                                                    {product.type === 'physical' ? 'Físico' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                </span>
                                            )}
                                            {product.stock !== null && product.stock <= 0 && (
                                                <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                                    Esgotado
                                                </div>
                                            )}
                                            {productIsDisabled && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                                                    <span className="text-[8px] font-black uppercase px-2 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(249, 115, 22, 0.9)', color: '#ffffff' }}>
                                                        <Info size={10} /> Ver detalhes
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0">
                                            <div>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold text-sm truncate" style={{ color: textColor }}>
                                                            {product.name}
                                                        </h3>
                                                        {product.category && (
                                                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: '#f9731620', color: '#f97316' }}>
                                                                {product.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex-shrink-0 text-right">
                                                        <span className="text-base sm:text-lg font-bold" style={{ color: '#f97316' }}>
                                                            {formatPrice(product.price)}
                                                        </span>
                                                        {isHourly && <span className="text-xs ml-0.5" style={{ color: textColor }}>/h</span>}
                                                    </div>
                                                </div>
                                                {product.description && (
                                                    <p className="text-xs mt-1 line-clamp-2" style={{ color: textColor }}>
                                                        {product.description}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="mt-2 flex justify-end items-center">
                                                {isSelected ? (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                if (quantity <= 1) {
                                                                    removeAllOfProduct(product.id)
                                                                } else {
                                                                    decreaseQuantity(product.id)
                                                                }
                                                            }}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-md hover:scale-110 transition-transform product-action-button"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff'
                                                            }}
                                                        >
                                                            −
                                                        </button>
                                                        <span className="text-xs font-bold min-w-[20px] text-center" style={{ color: '#f97316' }}>
                                                            {quantity}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleAddWithComment(product)
                                                            }}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-md hover:scale-110 transition-transform product-action-button"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff'
                                                            }}
                                                        >
                                                            +
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                removeAllOfProduct(product.id)
                                                            }}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform text-xs product-action-button"
                                                            style={{
                                                                background: '#ef4444',
                                                                color: '#ffffff'
                                                            }}
                                                            title="Remover todos"
                                                        >
                                                            <X className="w-3 h-3 text-white" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={handleProductInteraction}
                                                        className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform product-action-button"
                                                        style={{ background: GRADIENT }}
                                                    >
                                                        {productIsDisabled ? <Info size={14} /> : <Plus size={14} />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* ===== BOTÕES FLUTUANTES ===== */}
                {/* Busca */}
                <div style={{ position: 'fixed', bottom: 32, left: 24, zIndex: 998 }}>
                    <ButtonSearch
                        placeholder="Buscar produtos..."
                        onSearch={(value) => setSearchQuery(value)}
                        initialValue={searchQuery}
                        inputRef={searchInputRef}
                        maxWidth={320}
                    />
                </div>

                {/* ButtonShoppingBag - novo componente */}
                <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                    <ButtonShoppingBag />
                </div>

                {/* ===== MODAL DE DETALHES DO PRODUTO ===== */}
                {showProductModal && selectedProduct && (
                    <div
                        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setShowProductModal(false)}
                    >
                        <div
                            className="w-full max-w-3xl rounded-2xl p-5 animate-fade-in max-h-[80vh] overflow-y-auto"
                            style={{ background: cardBackground }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-black" style={{ color: textColor }}>
                                    Detalhes do Produto
                                </h3>
                                <button
                                    onClick={() => setShowProductModal(false)}
                                    className="p-1.5 rounded-full hover:bg-black/5 transition"
                                    style={{ color: textColor }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="sm:w-2/5">
                                    <div className="w-full aspect-square rounded-xl overflow-hidden" style={{ background: colors.accentLight }}>
                                        {selectedProduct.image_url ? (
                                            <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-sm font-medium" style={{ color: textColor }}>
                                                Sem imagem
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col">
                                    <div>
                                        <h4 className="text-lg font-black truncate" style={{ color: textColor }}>
                                            {selectedProduct.name}
                                        </h4>
                                        {selectedProduct.category && (
                                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#f9731620', color: '#f97316' }}>
                                                {selectedProduct.category}
                                            </span>
                                        )}
                                        <div className="mt-1">
                                            <span className="text-xl font-extrabold" style={{ color: '#f97316' }}>
                                                {formatPrice(selectedProduct.price || 0)}
                                            </span>
                                            {selectedProduct.price_type === 'hourly' && (
                                                <span className="text-xs ml-0.5 opacity-75" style={{ color: textColor }}>/hora</span>
                                            )}
                                        </div>
                                    </div>

                                    {selectedProduct.description && (
                                        <div className="mt-2 p-2.5 rounded-lg flex-1" style={{ background: `${colors.surface}66`, border: `1px solid ${colors.border}` }}>
                                            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: textColor }}>
                                                {selectedProduct.description}
                                            </p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        {selectedProduct.type && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Package size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Tipo</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: textColor }}>
                                                    {selectedProduct.type === 'physical' ? 'Físico' :
                                                        selectedProduct.type === 'service' ? 'Serviço' : 'Digital'}
                                                </p>
                                            </div>
                                        )}
                                        {selectedProduct.stock !== null && selectedProduct.stock !== undefined && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Tag size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Estoque</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: selectedProduct.stock > 0 ? '#22c55e' : '#ef4444' }}>
                                                    {selectedProduct.stock > 0 ? `${selectedProduct.stock} un.` : 'Esgotado'}
                                                </p>
                                            </div>
                                        )}
                                        {selectedProduct.price_type && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Modalidade</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: textColor }}>
                                                    {selectedProduct.price_type === 'fixed' ? 'Fixo' :
                                                        selectedProduct.price_type === 'hourly' ? 'Por hora' : 'Negociável'}
                                                </p>
                                            </div>
                                        )}
                                        {selectedProduct.created_at && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: textColor }}>Adicionado</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: textColor }}>
                                                    {new Date(selectedProduct.created_at).toLocaleDateString('pt-BR', {
                                                        day: '2-digit',
                                                        month: 'short'
                                                    })}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {!isStoreOpen && (
                                        <div className="mt-2 p-2 rounded-lg text-center" style={{ background: 'rgba(239, 68, 68, 0.08)', border: `1px dashed #ef4444` }}>
                                            <Info size={14} style={{ color: '#ef4444' }} className="inline mr-1.5" />
                                            <span className="text-[10px] font-bold" style={{ color: '#ef4444' }}>
                                                Loja fechada
                                            </span>
                                            {nextAvailable && (
                                                <span className="text-[10px] ml-1.5" style={{ color: '#f97316' }}>
                                                    Abre {nextAvailable.day} às {nextAvailable.open}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                        {isStoreOpen ? (
                                            <>
                                                {cartItems.some((item: any) => item.product.id === selectedProduct.id) ? (
                                                    <div className="flex items-center gap-2 w-full">
                                                        <button
                                                            onClick={() => {
                                                                const qty = getProductQuantity(selectedProduct.id)
                                                                if (qty <= 1) {
                                                                    removeAllOfProduct(selectedProduct.id)
                                                                } else {
                                                                    decreaseQuantity(selectedProduct.id)
                                                                }
                                                            }}
                                                            className="flex-1 py-2 rounded-full font-bold text-xs transition hover:scale-105 active:scale-95"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff',
                                                                boxShadow: `0 4px 14px #f9731660`,
                                                            }}
                                                        >
                                                            Remover
                                                        </button>
                                                        <span className="text-base font-bold min-w-[32px] text-center" style={{ color: '#f97316' }}>
                                                            {getProductQuantity(selectedProduct.id)}
                                                        </span>
                                                        <button
                                                            onClick={() => handleAddWithComment(selectedProduct)}
                                                            className="flex-1 py-2 rounded-full font-bold text-xs transition hover:scale-105 active:scale-95"
                                                            style={{
                                                                background: GRADIENT,
                                                                color: '#ffffff',
                                                                boxShadow: `0 4px 14px #f9731660`,
                                                            }}
                                                        >
                                                            Adicionar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAddWithComment(selectedProduct)}
                                                        className="w-full py-2 rounded-full font-bold text-xs transition hover:scale-105 active:scale-95"
                                                        style={{
                                                            background: GRADIENT,
                                                            color: '#ffffff',
                                                            boxShadow: `0 4px 14px #f9731660`,
                                                        }}
                                                    >
                                                        Adicionar ao carrinho
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => setShowProductModal(false)}
                                                className="w-full py-2 rounded-full font-bold text-xs transition hover:scale-105 active:scale-95"
                                                style={{
                                                    background: GRADIENT,
                                                    color: '#ffffff',
                                                    boxShadow: `0 4px 14px #f9731660`,
                                                }}
                                            >
                                                Fechar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== MODAL DE COMENTÁRIO ===== */}
                {showAddCommentModal && pendingProduct && (
                    <div
                        className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => {
                            setShowAddCommentModal(false)
                            setPendingProduct(null)
                            setCommentText('')
                        }}
                    >
                        <div
                            className="w-full max-w-md rounded-2xl p-6 animate-fade-in"
                            style={{ background: cardBackground }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-black" style={{ color: textColor }}>
                                    Adicionar à Sacola
                                </h3>
                                <button
                                    onClick={() => {
                                        setShowAddCommentModal(false)
                                        setPendingProduct(null)
                                        setCommentText('')
                                    }}
                                    className="p-1.5 rounded-full hover:bg-black/5 transition"
                                    style={{ color: colors.textSecondary }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-xl mb-4" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                                    {pendingProduct.image_url ? (
                                        <img src={pendingProduct.image_url} alt={pendingProduct.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate" style={{ color: textColor }}>
                                        {pendingProduct.name}
                                    </p>
                                    <p className="text-sm font-bold" style={{ color: '#f97316' }}>
                                        {formatPrice(pendingProduct.price)}
                                    </p>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="text-sm font-medium block mb-1" style={{ color: textColor }}>
                                    Observação (opcional)
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
                                    onClick={() => {
                                        setShowAddCommentModal(false)
                                        setPendingProduct(null)
                                        setCommentText('')
                                    }}
                                    className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                    style={{
                                        background: 'transparent',
                                        border: `2px solid ${colors.border}`,
                                        color: colors.textSecondary
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmAddWithComment}
                                    className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:scale-105 active:scale-95"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731660`,
                                    }}
                                >
                                    Adicionar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    )
}