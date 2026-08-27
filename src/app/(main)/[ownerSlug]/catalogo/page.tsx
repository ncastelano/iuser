// app/src/app/(main)/[ownerSlug]/catalogo/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import SacolaButton from '@/app/ButtonSacola'
import { useCartStore } from '@/store/useCartStore'
import { Plus, X, Info, Search, Clock, Tag, Package, Calendar } from 'lucide-react'
import Image from 'next/image'
import { isStoreOpenNow, getNextOpeningInfo, type BusinessHours } from '@/lib/storeHours'
import { toast } from 'sonner'

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
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.9) 0%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.7) 40%, 
    rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4) 70%, 
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

    // ========== FUNÇÕES DO CARRINHO ==========
    const storeKey = useMemo(() => {
        if (!ownerSlug) return ''
        return ownerSlug
    }, [ownerSlug])

    const cartItems = useMemo(() => {
        if (!storeKey) return []
        return itemsByStore[storeKey] || []
    }, [itemsByStore, storeKey])

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
        },
        [ownerSlug, removeItem]
    )

    useEffect(() => {
        if (totalCartQuantity > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartQuantity])

    // ========== HANDLE PRODUCT CLICK ==========
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
                    {/* Marca d'água - MAIS VISÍVEL */}
                    <div
                        style={{
                            position: 'absolute',
                            right: storeInfo.logo_url ? -20 : -10,
                            top: storeInfo.logo_url ? -20 : -10,
                            width: storeInfo.logo_url ? 140 : 100,
                            height: storeInfo.logo_url ? 140 : 100,
                            opacity: storeInfo.logo_url ? 0.25 : 0.2,
                            transform: 'rotate(8deg)',
                            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.9) 20%, rgba(0,0,0,0) 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.9) 20%, rgba(0,0,0,0) 70%)',
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
                                style={{ width: 50, height: 50, objectFit: 'contain' }}
                            />
                        )}
                    </div>

                    {/* Conteúdo do Header */}
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            {/* Logo sem círculo laranja/vermelho */}
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

                        {/* Greeting com nome da loja e logo */}
                        <div className="flex items-center gap-3 mt-1">
                            {storeInfo.logo_url && (
                                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2" style={{ borderColor: colors.accent }}>
                                    <img src={storeInfo.logo_url} alt={storeInfo.name} className="w-full h-full object-cover" />
                                </div>
                            )}
                            <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight break-words">
                                {storeInfo.name}
                            </h1>
                        </div>

                        {/* Tabs de categorias - COM PADDING MAIOR NAS LATERAIS */}
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
                                                color: isActive ? '#ffffff' : colors.textSecondary,
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
                                                    color: isActive ? '#ffffff' : colors.textSecondary,
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
                    <div className="w-full h-48 md:h-64 relative overflow-hidden">
                        <Image
                            src={storeInfo.banner_url}
                            alt={storeInfo.name}
                            fill
                            className="object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    </div>
                )}

                {/* Status da loja - alerta se fechada */}
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
                            <span className="text-xs ml-2" style={{ color: colors.textSecondary }}>
                                Clique no produto para ver detalhes
                            </span>
                        </div>
                    </div>
                )}

                {/* Catálogo de produtos */}
                <div className="max-w-7xl mx-auto px-1 py-1">

                    {/* Grade de produtos - cards horizontais */}
                    {filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="text-6xl mb-4">🛍️</div>
                            <h3 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>
                                {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}
                            </h3>
                            <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
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
                                        increaseQuantity(product)
                                    }
                                }

                                return (
                                    <div
                                        key={product.id}
                                        onClick={(e) => handleProductClick(product, e)}
                                        className={`group rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl cursor-pointer border-4 flex flex-row`}
                                        style={{
                                            background: '#ffffff',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                            borderColor: isSelected ? '#22c55e' : 'transparent',
                                        }}
                                    >
                                        {/* Imagem do produto - lado esquerdo */}
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
                                                    style={{ background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
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
                                                    <span className="text-[8px] font-black uppercase px-2 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(249, 115, 22, 0.9)', color: '#fff' }}>
                                                        <Info size={10} /> Ver detalhes
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Informações do produto - lado direito */}
                                        <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0">
                                            <div>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold text-sm truncate" style={{ color: colors.textPrimary }}>
                                                            {product.name}
                                                        </h3>
                                                        {product.category && (
                                                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: '#f9731620', color: '#f97316' }}>
                                                                {product.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex-shrink-0 text-right">
                                                        <span className="text-base sm:text-lg font-bold" style={{ color: colors.accent || '#f97316' }}>
                                                            {formatPrice(product.price)}
                                                        </span>
                                                        {isHourly && <span className="text-xs ml-0.5" style={{ color: colors.textSecondary }}>/h</span>}
                                                    </div>
                                                </div>
                                                {product.description && (
                                                    <p className="text-xs mt-1 line-clamp-2" style={{ color: colors.textSecondary }}>
                                                        {product.description}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Botões de ação do carrinho */}
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
                                                                increaseQuantity(product)
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
                {/* Busca expansível - lado esquerdo */}
                <div style={{ position: 'fixed', bottom: 32, left: 24, zIndex: 998 }}>
                    <div
                        className={`flex items-center rounded-full transition-all duration-300 overflow-hidden shadow-2xl`}
                        style={{
                            background: searchExpanded ? '#ffffff' : 'transparent',
                            boxShadow: searchExpanded ? '0 8px 32px rgba(0,0,0,0.15)' : 'none',
                            width: searchExpanded ? '280px' : '56px',
                            border: searchExpanded ? `2px solid ${colors.border}` : 'none',
                        }}
                    >
                        <button
                            onClick={() => {
                                setSearchExpanded(!searchExpanded)
                                if (!searchExpanded) {
                                    setTimeout(() => {
                                        searchInputRef.current?.focus()
                                    }, 100)
                                } else {
                                    setSearchQuery('')
                                }
                            }}
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 8px 24px #f9731660`,
                            }}
                            aria-label="Buscar produtos"
                        >
                            <Search size={22} />
                        </button>
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar produtos..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`flex-1 px-3 py-2 text-sm outline-none bg-transparent transition-all duration-300 ${searchExpanded ? 'opacity-100 w-full' : 'opacity-0 w-0'}`}
                            style={{
                                color: colors.textPrimary,
                                minWidth: searchExpanded ? '200px' : '0',
                                width: searchExpanded ? '200px' : '0',
                            }}
                        />
                        {searchExpanded && searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('')
                                    setSearchExpanded(false)
                                }}
                                className="mr-3 p-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                                style={{ color: colors.textSecondary }}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Carrinho - lado direito */}
                <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                    <SacolaButton
                        totalItems={totalCartQuantity}
                        totalValue={totalCartValue}
                        statusCounts={{
                            pending: 0,
                            preparing: 0,
                            ready: 0,
                            reviews: 0,
                        }}
                        animate={cartAnimating}
                    />
                </div>

                {/* ===== MODAL DE DETALHES DO PRODUTO ===== */}
                {showProductModal && selectedProduct && (
                    <div
                        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setShowProductModal(false)}
                    >
                        <div
                            className="w-full max-w-3xl rounded-2xl p-5 animate-fade-in max-h-[80vh] overflow-y-auto"
                            style={{ background: colors.surface }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-black" style={{ color: colors.textPrimary }}>
                                    Detalhes do Produto
                                </h3>
                                <button
                                    onClick={() => setShowProductModal(false)}
                                    className="p-1.5 rounded-full hover:bg-black/5 transition"
                                    style={{ color: colors.textSecondary }}
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
                                            <div className="w-full h-full flex items-center justify-center text-sm font-medium" style={{ color: colors.textSecondary }}>
                                                Sem imagem
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col">
                                    <div>
                                        <h4 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>
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
                                                <span className="text-xs ml-0.5 opacity-75" style={{ color: colors.textSecondary }}>/hora</span>
                                            )}
                                        </div>
                                    </div>

                                    {selectedProduct.description && (
                                        <div className="mt-2 p-2.5 rounded-lg flex-1" style={{ background: `${colors.surface}66`, border: `1px solid ${colors.border}` }}>
                                            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: colors.textSecondary }}>
                                                {selectedProduct.description}
                                            </p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        {selectedProduct.type && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Package size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Tipo</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: colors.textPrimary }}>
                                                    {selectedProduct.type === 'physical' ? 'Físico' :
                                                        selectedProduct.type === 'service' ? 'Serviço' : 'Digital'}
                                                </p>
                                            </div>
                                        )}
                                        {selectedProduct.stock !== null && selectedProduct.stock !== undefined && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Tag size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Estoque</span>
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
                                                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Modalidade</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: colors.textPrimary }}>
                                                    {selectedProduct.price_type === 'fixed' ? 'Fixo' :
                                                        selectedProduct.price_type === 'hourly' ? 'Por hora' : 'Negociável'}
                                                </p>
                                            </div>
                                        )}
                                        {selectedProduct.created_at && (
                                            <div className="p-2 rounded-lg" style={{ background: `${colors.surface}44`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={13} style={{ color: '#f97316' }} />
                                                    <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>Adicionado</span>
                                                </div>
                                                <p className="text-xs font-semibold mt-0.5" style={{ color: colors.textPrimary }}>
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
                                                            onClick={() => increaseQuantity(selectedProduct)}
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
                                                        onClick={() => increaseQuantity(selectedProduct)}
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