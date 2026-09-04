//app/(main)/[ownerSlug]/[slug]/ProductClientPage.tsx

'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
    ArrowLeft,
    Store,
    Calendar,
    Eye,
    User,
    Share2,
    ShoppingCart,
    Plus,
    Minus,
    Check
} from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import { handleShareLink } from '@/lib/share'
import { toast } from 'sonner'
import { useCartStore } from '@/store/useCartStore'

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

    const {
        itemsByStore,
        addItem,
        updateQuantity,
        removeItem
    } = useCartStore()

    const [loading, setLoading] = useState(true)
    const [product, setProduct] = useState<ProductWithStore | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [addingToCart, setAddingToCart] = useState(false)
    const [addedToCart, setAddedToCart] = useState(false)

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
    const getStoreDisplay = () => {
        if (!product?.store) {
            return {
                name: 'Loja',
                imageUrl: null,
                type: 'unknown'
            }
        }

        if (product.store.profile) {
            return {
                name: product.store.profile.name || product.store.name,
                imageUrl: product.store.profile.avatar_url || product.store.logo_url,
                type: 'store'
            }
        }

        return {
            name: product.store.name,
            imageUrl: product.store.logo_url,
            type: 'store'
        }
    }

    const storeDisplay = getStoreDisplay()

    const storeImageUrl = storeDisplay.imageUrl
        ? supabase.storage.from('store-logos').getPublicUrl(storeDisplay.imageUrl).data.publicUrl
        : null

    const finalStoreImage = storeImageUrl || storeDisplay.imageUrl || null

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
        return <LoadingSpinner message="Carregando produto..." background={colors.background} />
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

    return (
        <div className="relative min-h-dvh">
            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Produto"
                    showBack={true}
                    onBack={() => router.back()}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl || null}
                    loading={profileLoading}
                />

                <div className="w-full px-4 md:px-6 py-6">
                    <div className="rounded-2xl overflow-hidden border" style={{
                        background: colors.surface,
                        borderColor: colors.border,
                    }}>
                        {/* Imagem: se o produto não tem foto, usa a imagem da loja */}
                        {(imageUrl || finalStoreImage) ? (
                            <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                                <img
                                    src={imageUrl || finalStoreImage || ''}
                                    alt={product.name || 'Produto'}
                                    className={`w-full h-full ${imageUrl ? 'object-cover' : 'object-contain p-8'}`}
                                />
                            </div>
                        ) : (
                            <div className="w-full flex items-center justify-center py-16" style={{
                                background: `${colors.border}50`
                            }}>
                                <Store size={64} style={{ color: colors.textSecondary }} />
                            </div>
                        )}

                        {/* Conteúdo */}
                        <div className="p-6 space-y-4">
                            {/* Cabeçalho - Loja */}
                            <div
                                className="flex items-center gap-3 cursor-pointer group"
                                onClick={goToStore}
                            >
                                <div
                                    className="w-12 h-12 rounded-full overflow-hidden border-2 flex-shrink-0 transition-all duration-300 group-hover:scale-105"
                                    style={{ borderColor: colors.border }}
                                >
                                    {finalStoreImage ? (
                                        <img
                                            src={finalStoreImage}
                                            alt={storeDisplay.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ background: colors.border }}>
                                            <Store size={20} style={{ color: colors.textSecondary }} />
                                        </div>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <h3
                                        className="font-bold truncate transition-colors duration-300 group-hover:text-opacity-70"
                                        style={{ color: colors.textPrimary }}
                                    >
                                        {storeDisplay.name}
                                        <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{
                                            background: `${colors.accent}20`,
                                            color: colors.accent
                                        }}>
                                            Loja
                                        </span>
                                        <span className="ml-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            →
                                        </span>
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: colors.textSecondary }}>
                                        <span className="flex items-center gap-1">
                                            <Calendar size={14} />
                                            {formattedDate}
                                        </span>
                                        {product.view_count !== null && product.view_count !== undefined && product.view_count > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Eye size={14} />
                                                {product.view_count} visualizações
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <User size={18} style={{ color: colors.accent }} />
                                </div>
                            </div>

                            {/* Título e Preço */}
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <h1 className="text-2xl font-bold flex-1" style={{ color: colors.textPrimary }}>
                                    {product.name || 'Sem título'}
                                </h1>
                                <span className="text-2xl font-black" style={{ color: colors.accent }}>
                                    {formattedPrice}
                                </span>
                            </div>

                            {/* Descrição */}
                            {product.description && (
                                <div className="p-4 rounded-xl" style={{ background: `${colors.border}30` }}>
                                    <p style={{ color: colors.textSecondary, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                                        {product.description}
                                    </p>
                                </div>
                            )}

                            {/* Quantidade e Adicionar ao Carrinho */}
                            <div className="pt-4 border-t" style={{ borderColor: colors.border }}>
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                            Quantidade:
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleQuantityChange(quantity - 1)}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:scale-105"
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: `1px solid ${colors.border}`,
                                                    color: colors.textPrimary,
                                                }}
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <span
                                                className="w-12 text-center font-bold"
                                                style={{ color: colors.textPrimary }}
                                            >
                                                {quantity}
                                            </span>
                                            <button
                                                onClick={() => handleQuantityChange(quantity + 1)}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:scale-105"
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: `1px solid ${colors.border}`,
                                                    color: colors.textPrimary,
                                                }}
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleAddToCart}
                                        disabled={addingToCart || addedToCart}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all hover:scale-105 disabled:opacity-50"
                                        style={{
                                            background: addedToCart ? '#22c55e' : colors.accent,
                                            color: '#ffffff',
                                            boxShadow: addedToCart ? '0 4px 14px rgba(34, 197, 94, 0.4)' : `0 4px 14px ${colors.accent}40`,
                                        }}
                                    >
                                        {addedToCart ? (
                                            <>
                                                <Check size={18} />
                                                Adicionado!
                                            </>
                                        ) : addingToCart ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                                                Adicionando...
                                            </>
                                        ) : (
                                            <>
                                                <ShoppingCart size={18} />
                                                Adicionar ao Carrinho
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Botões de ação */}
                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={goToStore}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition hover:scale-105"
                                    style={{
                                        background: colors.surface,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                >
                                    <Store size={18} />
                                    Visitar Loja
                                </button>

                                <button
                                    onClick={() => handleShareLink({
                                        title: `${product.name || 'Produto'} | ${storeDisplay.name}`,
                                        text: product.description || 'Confira no iUser!'
                                    })}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition hover:scale-105"
                                    style={{
                                        background: colors.surface,
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textPrimary,
                                    }}
                                >
                                    <Share2 size={18} />
                                    Compartilhar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}