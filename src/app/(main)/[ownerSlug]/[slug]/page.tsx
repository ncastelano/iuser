// src/app/(app)/[ownerSlug]/[slug]/page.tsx
'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useTheme } from '@/app/theme'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import {
    AlertTriangle,
    ArrowLeft,
    Home,
    ShoppingBag,
    Megaphone,
    Pencil,
    Trash2,
    Clock,
    Star,
    MapPin,
    MessageCircle,
    Calendar,
    Eye,
    User,
    Store,
    ChevronRight,
    Plus,
    Minus,
    X,
} from 'lucide-react'
import { RatingStars } from '@/components/ratings/RatingStars'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '@/app/ButtonSacola'
import Header from '@/app/Header'
import { toast } from 'sonner'
import { getAvatarUrl } from '@/lib/avatar'

type OwnerType = 'profile' | 'store'
type ContentType = 'product' | 'publication'

interface OwnerData {
    id: string
    name: string
    slug: string
    type: OwnerType
    avatar_url?: string | null
    description?: string | null
    address?: string | null
    whatsapp?: string | null
}

interface ContentData {
    id: string
    name: string
    slug: string
    description?: string | null
    image_url?: string | null
    price?: number
    listing_type: 'sale' | 'publication'
    type: ContentType
    owner_id: string
    store_id?: string | null
    category?: string
    created_at: string
    profiles?: {
        name: string
        profileSlug: string
    }
}

export default function SlugPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { bgMode, customBgUrl, profileSlug: loggedUserSlug, avatarUrl: loggedUserAvatarUrl } = useProfile()

    const ownerSlug = Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug
    const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [owner, setOwner] = useState<OwnerData | null>(null)
    const [content, setContent] = useState<ContentData | null>(null)
    const [ownerType, setOwnerType] = useState<OwnerType | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [cartAnimating, setCartAnimating] = useState(false)
    const [productQuantity, setProductQuantity] = useState(0)

    // Cart
    const { itemsByStore, addItem, removeItem, updateQuantity } = useCartStore()

    // ===== CALCULAR TOTAL DE ITENS DO CARRINHO =====
    const totalCartItems = useMemo(() => {
        return Object.values(itemsByStore).reduce((acc, items) => acc + items.length, 0)
    }, [itemsByStore])

    // ===== CALCULAR VALOR TOTAL DO CARRINHO =====
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

    // ===== VERIFICAR SE O PRODUTO ESTÁ NO CARRINHO =====
    const getProductQuantity = useCallback(() => {
        if (!content) return 0
        let total = 0
        Object.values(itemsByStore).forEach(storeItems => {
            const found = storeItems.find((item: any) => item.product.id === content.id)
            if (found) {
                total += found.quantity
            }
        })
        return total
    }, [itemsByStore, content])

    // ========== DETECTAR OWNER ==========
    const detectOwner = useCallback(async (slug: string) => {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, name, profileSlug, avatar_url, description, address, whatsapp')
            .eq('profileSlug', slug)
            .maybeSingle()

        if (profile && !profileError) {
            return {
                data: {
                    id: profile.id,
                    name: profile.name,
                    slug: profile.profileSlug,
                    type: 'profile' as OwnerType,
                    avatar_url: getAvatarUrl(supabase, profile.avatar_url),
                    description: profile.description,
                    address: profile.address,
                    whatsapp: profile.whatsapp,
                },
                type: 'profile' as OwnerType
            }
        }

        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url, owner_id, description, address, whatsapp')
            .eq('storeSlug', slug)
            .maybeSingle()

        if (store && !storeError) {
            let storeWhatsapp = store.whatsapp
            if (!storeWhatsapp && store.owner_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('whatsapp')
                    .eq('id', store.owner_id)
                    .single()
                storeWhatsapp = profile?.whatsapp
            }

            return {
                data: {
                    id: store.id,
                    name: store.name,
                    slug: store.storeSlug,
                    type: 'store' as OwnerType,
                    avatar_url: store.logo_url
                        ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                        : null,
                    description: store.description,
                    address: store.address,
                    whatsapp: storeWhatsapp,
                },
                type: 'store' as OwnerType
            }
        }

        return null
    }, [])

    // ========== DETECTAR CONTEÚDO ==========
    const detectContent = useCallback(async (slug: string, ownerId: string, ownerType: OwnerType) => {
        const ownerField = ownerType === 'profile' ? 'owner_id' : 'store_id'

        const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('slug', slug)
            .eq(ownerField, ownerId)
            .maybeSingle()

        if (product && !productError) {
            let imageUrl = product.image_url
            if (imageUrl) {
                if (!imageUrl.startsWith('http')) {
                    imageUrl = supabase.storage.from('product-images').getPublicUrl(imageUrl).data.publicUrl
                }
            }

            return {
                data: {
                    id: product.id,
                    name: product.name,
                    slug: product.slug,
                    description: product.description,
                    image_url: imageUrl,
                    price: product.price || 0,
                    listing_type: product.listing_type,
                    type: product.listing_type === 'sale' ? 'product' as ContentType : 'publication' as ContentType,
                    owner_id: product.owner_id,
                    store_id: product.store_id,
                    category: product.category,
                    created_at: product.created_at,
                },
                type: product.listing_type === 'sale' ? 'product' as ContentType : 'publication' as ContentType
            }
        }

        return null
    }, [])

    // ========== CARREGAR DADOS ==========
    const loadData = useCallback(async () => {
        if (!ownerSlug || !slug) {
            setError('Parâmetros inválidos')
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const ownerResult = await detectOwner(ownerSlug)
            if (!ownerResult) {
                setError('Perfil ou loja não encontrado')
                setLoading(false)
                return
            }

            setOwner(ownerResult.data)
            setOwnerType(ownerResult.type)

            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
            setIsOwner(user?.id === ownerResult.data.id)

            const contentResult = await detectContent(slug, ownerResult.data.id, ownerResult.type)
            if (!contentResult) {
                setError('Produto ou publicação não encontrado')
                setLoading(false)
                return
            }

            setContent(contentResult.data)

        } catch (err: any) {
            console.error('Erro ao carregar dados:', err)
            setError(err.message || 'Erro ao carregar página')
        } finally {
            setLoading(false)
        }
    }, [ownerSlug, slug, detectOwner, detectContent])

    useEffect(() => {
        loadData()
    }, [loadData])

    useEffect(() => {
        setMounted(true)
    }, [])

    // ========== ATUALIZAR QUANTIDADE DO PRODUTO ==========
    useEffect(() => {
        if (content) {
            setProductQuantity(getProductQuantity())
        }
    }, [content, getProductQuantity])

    // ========== ANIMAÇÃO DO CARRINHO ==========
    useEffect(() => {
        if (totalCartItems > 0) {
            setCartAnimating(true)
            const timer = setTimeout(() => setCartAnimating(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [totalCartItems])

    // ========== FUNÇÃO PARA CONVERTER CONTENT PARA CART PRODUCT ==========
    const contentToCartProduct = useCallback((contentData: ContentData) => {
        return {
            id: contentData.id,
            name: contentData.name,
            price: contentData.price || 0,
            image_url: contentData.image_url || null,
            price_type: 'fixed',
            type: contentData.type === 'product' ? 'physical' : 'digital',
            slug: contentData.slug,
            description: contentData.description || '',
            category: contentData.category || '',
        }
    }, [])

    // ========== CART FUNCTIONS ==========
    const handleAddToCart = useCallback(() => {
        if (!owner || !content) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        const cartProduct = contentToCartProduct(content)
        addItem(storeKey as string, { name: owner.name, logo_url: owner.avatar_url ?? null }, cartProduct)
        setProductQuantity(prev => prev + 1)
        setCartAnimating(true)
        setTimeout(() => setCartAnimating(false), 500)
        toast.success('Adicionado ao carrinho!')
    }, [owner, content, ownerType, ownerSlug, addItem, contentToCartProduct])

    const handleDecreaseQuantity = useCallback(() => {
        if (!content) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        if (productQuantity <= 1) {
            Object.keys(itemsByStore).forEach(key => {
                const storeItems = itemsByStore[key]
                const found = storeItems.find((item: any) => item.product.id === content.id)
                if (found) {
                    removeItem(key, content.id)
                }
            })
            setProductQuantity(0)
        } else {
            updateQuantity(storeKey as string, content.id, -1)
            setProductQuantity(prev => prev - 1)
        }
    }, [content, productQuantity, ownerType, ownerSlug, itemsByStore, removeItem, updateQuantity])

    const handleIncreaseQuantity = useCallback(() => {
        if (!owner || !content) return

        const storeKey = ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
        const cartProduct = contentToCartProduct(content)
        addItem(storeKey as string, { name: owner.name, logo_url: owner.avatar_url ?? null }, cartProduct)
        setProductQuantity(prev => prev + 1)
        setCartAnimating(true)
        setTimeout(() => setCartAnimating(false), 500)
    }, [owner, content, ownerType, ownerSlug, addItem, contentToCartProduct])

    const handleRemoveAll = useCallback(() => {
        if (!content) return

        Object.keys(itemsByStore).forEach(key => {
            const storeItems = itemsByStore[key]
            const found = storeItems.find((item: any) => item.product.id === content.id)
            if (found) {
                removeItem(key, content.id)
            }
        })
        setProductQuantity(0)
        toast.info('Produto removido do carrinho')
    }, [content, itemsByStore, removeItem])

    // ========== RENDER ==========
    if (loading) {
        return <LoadingSpinner message="Carregando..." background={colors.background} />
    }

    if (error || !owner || !content) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <AlertTriangle className="w-12 h-12" style={{ color: colors.accent }} />
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Conteúdo não encontrado'}
                    </h2>
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Voltar ao início
                    </button>
                </div>
            </div>
        )
    }

    const isProduct = content.type === 'product'
    const isPublication = content.type === 'publication'
    const isProfileOwner = ownerType === 'profile'
    const hasImage = content.image_url
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
    const isInCart = productQuantity > 0

    return (
        <div className="min-h-screen relative" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <div className="relative z-10">
                <Header
                    title="iUser"
                    showBack={false}
                    greeting={owner.name}
                    avatarUrl={owner.avatar_url || null}
                    loading={loading}
                    tabs={[]}
                    showSearch={false}
                    searchPlaceholder="Buscar..."
                    onSearch={() => { }}
                    profileSlug={loggedUserSlug}
                />

                <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
                    {/* ===== BREADCRUMB ===== */}
                    <div className="flex items-center gap-2 text-sm mb-6" style={{ color: colors.textSecondary }}>
                        <button
                            onClick={() => router.push('/')}
                            className="hover:underline flex items-center gap-1"
                            style={{ color: colors.textSecondary }}
                        >
                            <Home className="w-3.5 h-3.5" />
                            Início
                        </button>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <button
                            onClick={() => router.push(`/${ownerSlug}`)}
                            className="hover:underline font-bold"
                            style={{ color: colors.textPrimary }}
                        >
                            {isProfileOwner ? '@' : ''}{ownerSlug}
                        </button>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span className="font-bold" style={{ color: colors.textPrimary }}>
                            {slug}
                        </span>
                        {isProduct && (
                            <>
                                <ChevronRight className="w-3.5 h-3.5" />
                                <span className="font-bold" style={{ color: colors.textPrimary }}>
                                    Produto
                                </span>
                            </>
                        )}
                        {isPublication && (
                            <>
                                <ChevronRight className="w-3.5 h-3.5" />
                                <span className="font-bold" style={{ color: colors.textPrimary }}>
                                    Publicação
                                </span>
                            </>
                        )}
                    </div>

                    {/* Card do conteúdo */}
                    <div className="rounded-3xl overflow-hidden border" style={{
                        background: `rgba(255, 255, 255, 0.06)`,
                        borderColor: `rgba(255,255,255,0.12)`,
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                    }}>
                        {/* Imagem ou placeholder */}
                        {hasImage ? (
                            <div className="w-full aspect-video bg-gray-100 relative">
                                <img
                                    src={hasImage}
                                    alt={content.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement
                                        target.style.display = 'none'
                                        const parent = target.parentElement
                                        if (parent) {
                                            const placeholder = document.createElement('div')
                                            placeholder.className = 'w-full h-full flex items-center justify-center text-6xl'
                                            placeholder.style.background = 'rgba(255,255,255,0.03)'
                                            placeholder.textContent = isProduct ? '🛒' : '📢'
                                            parent.appendChild(placeholder)
                                        }
                                    }}
                                />
                                <div className="absolute top-4 left-4 flex gap-2">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase backdrop-blur-md flex items-center gap-1" style={{
                                        background: 'rgba(0,0,0,0.4)',
                                        color: '#fff'
                                    }}>
                                        {isProduct ? <ShoppingBag className="w-3 h-3" /> : <Megaphone className="w-3 h-3" />}
                                        {isProduct ? 'Produto' : 'Publicação'}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full aspect-video flex items-center justify-center" style={{
                                background: `rgba(255,255,255,0.03)`
                            }}>
                                <div className="text-center">
                                    <div className="text-6xl mb-4">
                                        {isProduct ? '🛒' : '📢'}
                                    </div>
                                    <p className="text-sm font-bold uppercase tracking-widest" style={{ color: colors.textSecondary }}>
                                        {isProduct ? 'Produto' : 'Publicação'}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="p-6 space-y-4">
                            {/* Owner info - AGORA CLICÁVEL */}
                            <button
                                onClick={() => router.push(`/${ownerSlug}`)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl transition hover:scale-[1.02] hover:shadow-lg text-left"
                                style={{
                                    background: `rgba(255,255,255,0.03)`,
                                    border: `1px solid transparent`,
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.3)'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'transparent'
                                }}
                            >
                                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0" style={{
                                    background: GRADIENT,
                                    padding: '2px'
                                }}>
                                    <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                        {owner.avatar_url ? (
                                            <img src={owner.avatar_url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <span className="text-lg font-black" style={{ color: '#f97316' }}>
                                                {owner.name?.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        {owner.name}
                                    </p>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        {isProfileOwner ? 'Perfil' : 'Loja'} • @{owner.slug}
                                    </p>
                                </div>
                                <ChevronRight className="w-4 h-4 opacity-50" style={{ color: colors.textSecondary }} />
                            </button>

                            {/* Título */}
                            <h1 className="text-3xl font-black" style={{ color: colors.textPrimary }}>
                                {content.name}
                            </h1>

                            {/* Categoria */}
                            {content.category && (
                                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase" style={{
                                    background: `rgba(249, 115, 22, 0.15)`,
                                    color: '#f97316'
                                }}>
                                    {content.category}
                                </span>
                            )}

                            {/* Preço (apenas produtos) */}
                            {isProduct && content.price !== undefined && content.price > 0 && (
                                <div className="text-3xl font-black" style={{ color: '#f97316' }}>
                                    R$ {content.price.toFixed(2)}
                                </div>
                            )}

                            {/* Descrição */}
                            {content.description && (
                                <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: colors.textSecondary }}>
                                    {content.description}
                                </div>
                            )}

                            {/* Data de criação */}
                            <div className="text-xs" style={{ color: colors.textSecondary }}>
                                Publicado em {new Date(content.created_at).toLocaleDateString('pt-BR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                })}
                            </div>

                            {/* Botões de ação */}
                            <div className="flex flex-wrap gap-3 pt-4 border-t" style={{ borderColor: `rgba(255,255,255,0.06)` }}>
                                {isOwner ? (
                                    <>
                                        <button
                                            onClick={() => router.push(`/${ownerSlug}/${slug}/editar-produto`)}
                                            className="flex-1 px-6 py-3 rounded-xl font-bold text-center transition hover:scale-105 flex items-center justify-center gap-2"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            <Pencil className="w-4 h-4" />
                                            Editar
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!confirm(`Tem certeza que deseja excluir esta ${isProduct ? 'produto' : 'publicação'}?`)) return
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
                                            className="px-6 py-3 rounded-xl font-bold text-center transition hover:scale-105 flex items-center justify-center gap-2"
                                            style={{
                                                background: '#ef4444',
                                                color: '#fff'
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Excluir
                                        </button>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-3 w-full flex-wrap">
                                        {isProduct ? (
                                            isInCart ? (
                                                <div className="flex items-center gap-2 flex-1">
                                                    <button
                                                        onClick={handleDecreaseQuantity}
                                                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-md hover:scale-110 transition-transform flex-shrink-0"
                                                        style={{
                                                            background: GRADIENT,
                                                            color: '#ffffff'
                                                        }}
                                                    >
                                                        <Minus size={18} />
                                                    </button>
                                                    <span className="text-lg font-bold min-w-[40px] text-center" style={{ color: '#f97316' }}>
                                                        {productQuantity}
                                                    </span>
                                                    <button
                                                        onClick={handleIncreaseQuantity}
                                                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-md hover:scale-110 transition-transform flex-shrink-0"
                                                        style={{
                                                            background: GRADIENT,
                                                            color: '#ffffff'
                                                        }}
                                                    >
                                                        <Plus size={18} />
                                                    </button>
                                                    <button
                                                        onClick={handleRemoveAll}
                                                        className="w-10 h-10 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform flex-shrink-0"
                                                        style={{
                                                            background: '#ef4444',
                                                            color: '#ffffff'
                                                        }}
                                                        title="Remover todos"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={handleAddToCart}
                                                    className="flex-1 px-6 py-3 rounded-xl font-bold text-center transition hover:scale-105 flex items-center justify-center gap-2"
                                                    style={{ background: GRADIENT, color: '#fff' }}
                                                >
                                                    <ShoppingBag className="w-4 h-4" />
                                                    Adicionar ao carrinho
                                                </button>
                                            )
                                        ) : null}

                                        {owner.whatsapp && (
                                            <a
                                                href={`https://wa.me/${owner.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi seu ${isProduct ? 'produto' : 'conteúdo'} no iUser e tenho interesse.`)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-6 py-3 rounded-xl font-bold text-center transition hover:scale-105 flex items-center justify-center gap-2"
                                                style={{ background: '#25D366', color: '#fff' }}
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                                WhatsApp
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== BOTÕES FLUTUANTES ===== */}
            <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998, display: 'flex', gap: 12 }}>
                {/* Sacola Button */}
                <SacolaButton
                    totalItems={totalCartItems}
                    totalValue={totalCartValue}
                    statusCounts={{ pending: 0, preparing: 0, ready: 0, reviews: 0 }}
                    animate={cartAnimating}
                />

                {/* Botão Home */}
                <button
                    onClick={() => router.push('/')}
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 active:scale-95"
                    style={{
                        background: GRADIENT,
                        color: '#ffffff',
                        borderTop: '2px solid #f97316',
                        borderRight: '2px solid #f97316',
                        borderBottom: '2px solid #f97316',
                        borderLeft: '2px solid #f97316',
                        boxShadow: `0 8px 24px #f9731660`,
                    }}
                    aria-label="Voltar ao início"
                >
                    <Home size={24} />
                </button>
            </div>
        </div>
    )
}