// src/app/(app)/[ownerSlug]/[slug]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Star,
    MapPin,
    Package,
    Eye,
    Timer,
    ArrowLeft,
    Share2,
    Heart,
    ShoppingBag,
    Phone,
    Mail,
    Globe,
    ChevronRight,
    Store,
    Calendar,
    User,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'

// ===== GRADIENTE =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ---------- Tipos ----------
interface ProductData {
    id: string
    name: string
    slug: string
    description: string | null
    price: number | null
    duration_minutes: number | null
    view_count: number
    image_url: string | null
    listing_type: string
    created_at: string
    updated_at: string
    owner_id: string
    store_id: string | null
    category: string | null
    specifications: Record<string, any> | null
    is_active: boolean
    stock_quantity: number | null
}

interface StoreData {
    id: string
    name: string
    storeSlug: string
    address: string | null
    logo_url: string | null
    phone: string | null
    email: string | null
    website: string | null
    instagram: string | null
    facebook: string | null
    twitter: string | null
    description: string | null
    owner_id: string
}

interface ProfileData {
    id: string
    name: string
    profileSlug: string
    avatar_url: string | null
    bio: string | null
    phone: string | null
    email: string | null
}

interface ReviewData {
    id: string
    rating: number
    comment: string | null
    created_at: string
    user_id: string
    user_name: string
    user_avatar: string | null
}

interface ProductPageData {
    product: ProductData
    store: StoreData | null
    profile: ProfileData | null
    reviews: ReviewData[]
    averageRating: number
    reviewCount: number
    relatedProducts: ProductData[]
    isProfileProduct: boolean
    ownerName: string
    ownerSlug: string
    ownerAvatar: string | null
}

// ---------- Função para obter URL pública ----------
function getPublicUrl(bucket: string, path: string | null): string | null {
    if (!path) return null

    try {
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path
        }

        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data.publicUrl
    } catch (error) {
        console.error('[getPublicUrl] Erro:', error)
        return null
    }
}

function getAvatarUrl(avatarPath: string | null): string | null {
    if (!avatarPath) return null

    try {
        if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
            return avatarPath
        }

        let cleanPath = avatarPath
        if (cleanPath.startsWith('avatars/')) {
            cleanPath = cleanPath.replace('avatars/', '')
        }
        if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.substring(1)
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(cleanPath)
        return data.publicUrl
    } catch (error) {
        console.error('[getAvatarUrl] Erro:', error)
        return null
    }
}

// ---------- Helpers ----------
const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
}

const formatPrice = (price: number | null) => {
    if (price == null) return 'Preço sob consulta'
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

// ---------- Componente de Loading ----------
function ProductLoading() {
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>
            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Produto"
                    showBack={true}
                    onBack={() => window.history.back()}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />
                <div className="max-w-7xl mx-auto px-4 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="aspect-square rounded-xl" style={{ background: `${colors.border}30` }} />
                        <div className="space-y-4">
                            <div className="h-8 rounded w-3/4" style={{ background: `${colors.border}30` }} />
                            <div className="h-6 rounded w-1/2" style={{ background: `${colors.border}30` }} />
                            <div className="space-y-2">
                                <div className="h-4 rounded w-full" style={{ background: `${colors.border}25` }} />
                                <div className="h-4 rounded w-full" style={{ background: `${colors.border}25` }} />
                                <div className="h-4 rounded w-3/4" style={{ background: `${colors.border}25` }} />
                            </div>
                            <div className="flex gap-2">
                                <div className="h-10 rounded w-32" style={{ background: `${colors.border}30` }} />
                                <div className="h-10 rounded w-32" style={{ background: `${colors.border}30` }} />
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

// ---------- Componente Principal ----------
export default function ProductPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [data, setData] = useState<ProductPageData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showFullDescription, setShowFullDescription] = useState(false)

    const ownerSlugParam = params.ownerSlug as string
    const slug = params.slug as string

    useEffect(() => {
        const fetchProductData = async () => {
            setLoading(true)
            setError(null)

            try {
                // 1. Buscar produto pelo slug
                const { data: product, error: productErr } = await supabase
                    .from('products')
                    .select('*')
                    .eq('slug', slug)
                    .single()

                if (productErr || !product) {
                    setError('Produto não encontrado')
                    setLoading(false)
                    return
                }

                // 2. Verificar se é produto de perfil ou loja
                const isProfileProduct = !product.store_id && !!product.owner_id

                let store: StoreData | null = null
                let profile: ProfileData | null = null
                let ownerName = ''
                let ownerSlug = ''
                let ownerAvatar: string | null = null

                // 3. Buscar informações do dono (perfil)
                const { data: profileData, error: profileErr } = await supabase
                    .from('profiles')
                    .select('id, name, profileSlug, avatar_url, bio, phone, email')
                    .eq('id', product.owner_id)
                    .single()

                if (profileErr) {
                    console.error('[ProductPage] Erro ao buscar perfil:', profileErr)
                } else if (profileData) {
                    profile = profileData
                    ownerName = profileData.name || 'Usuário'
                    ownerSlug = profileData.profileSlug || ''
                    ownerAvatar = getAvatarUrl(profileData.avatar_url)
                }

                // 4. Se tiver store_id, buscar loja
                if (product.store_id) {
                    const { data: storeData, error: storeErr } = await supabase
                        .from('stores')
                        .select('*')
                        .eq('id', product.store_id)
                        .single()

                    if (storeErr) {
                        console.error('[ProductPage] Erro ao buscar loja:', storeErr)
                    } else if (storeData) {
                        store = storeData
                        if (storeData.name) ownerName = storeData.name
                        if (storeData.storeSlug) ownerSlug = storeData.storeSlug
                        if (storeData.logo_url) {
                            ownerAvatar = getPublicUrl('store-logos', storeData.logo_url)
                        }
                    }
                }

                // 5. Buscar avaliações do produto
                const { data: reviewsData, error: reviewsErr } = await supabase
                    .from('product_reviews')
                    .select(`
                        id,
                        rating,
                        comment,
                        created_at,
                        user_id,
                        profiles:user_id (
                            name,
                            avatar_url
                        )
                    `)
                    .eq('product_id', product.id)
                    .order('created_at', { ascending: false })

                if (reviewsErr) {
                    console.error('[ProductPage] Erro ao buscar avaliações:', reviewsErr)
                }

                // 6. Processar avaliações
                const reviews: ReviewData[] = (reviewsData || []).map((r: any) => ({
                    id: r.id,
                    rating: r.rating,
                    comment: r.comment,
                    created_at: r.created_at,
                    user_id: r.user_id,
                    user_name: r.profiles?.name || 'Usuário',
                    user_avatar: r.profiles?.avatar_url ? getAvatarUrl(r.profiles.avatar_url) : null,
                }))

                const totalReviews = reviews.length
                const avgRating = totalReviews > 0
                    ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
                    : 0

                // 7. Buscar produtos relacionados
                let relatedProducts: ProductData[] = []
                const { data: relatedData, error: relatedErr } = await supabase
                    .from('products')
                    .select('*')
                    .neq('id', product.id)
                    .eq('listing_type', 'sale')
                    .or(`owner_id.eq.${product.owner_id},category.eq.${product.category || 'none'}`)
                    .limit(8)

                if (!relatedErr && relatedData) {
                    relatedProducts = relatedData
                }

                // 8. Incrementar view_count
                await supabase
                    .from('products')
                    .update({ view_count: (product.view_count || 0) + 1 })
                    .eq('id', product.id)

                // 9. Montar dados finais
                setData({
                    product,
                    store,
                    profile,
                    reviews,
                    averageRating: Number(avgRating.toFixed(1)),
                    reviewCount: totalReviews,
                    relatedProducts,
                    isProfileProduct,
                    ownerName,
                    ownerSlug,
                    ownerAvatar,
                })

            } catch (error) {
                console.error('[ProductPage] Erro geral:', error)
                setError('Erro ao carregar produto')
            } finally {
                setLoading(false)
            }
        }

        if (slug) {
            fetchProductData()
        }
    }, [slug])

    // Loading
    if (loading) {
        return <ProductLoading />
    }

    // Error
    if (error || !data) {
        return (
            <div className="relative min-h-dvh" style={{ background: colors.background }}>
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
                <main className="relative z-10 min-h-dvh">
                    <Header
                        title="Produto"
                        showBack={true}
                        onBack={() => router.push('/')}
                        greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                        avatarUrl={avatarUrl}
                        loading={profileLoading}
                    />
                    <div className="flex items-center justify-center px-4 py-20">
                        <div className="text-center">
                            <Package size={64} className="mx-auto mb-4 opacity-50" style={{ color: colors.textSecondary }} />
                            <h2 className="text-2xl font-bold mb-2" style={{ color: colors.textPrimary }}>
                                {error || 'Produto não encontrado'}
                            </h2>
                            <button
                                onClick={() => router.back()}
                                className="mt-4 px-6 py-2 rounded-lg font-bold transition-all hover:scale-105"
                                style={{ background: GRADIENT, color: '#ffffff' }}
                            >
                                Voltar
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        )
    }

    const { product, store, profile, reviews, averageRating, reviewCount, relatedProducts, isProfileProduct, ownerName, ownerSlug, ownerAvatar } = data
    const productImage = product.image_url ? getPublicUrl('product-images', product.image_url) : null
    const isDescriptionLong = (product.description?.length || 0) > 300

    // Componente de ícone social genérico
    const SocialIcon = ({ platform, url }: { platform: string; url: string | null }) => {
        if (!url) return null

        const getIcon = () => {
            switch (platform) {
                case 'instagram':
                    return (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                        </svg>
                    )
                case 'facebook':
                    return (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                    )
                case 'twitter':
                    return (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                    )
                default:
                    return <Globe size={16} />
            }
        }

        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                style={{ background: `${colors.border}30`, color: colors.textSecondary }}
            >
                {getIcon()}
            </a>
        )
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title={product.name}
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <div className="max-w-7xl mx-auto px-4 py-8">
                    {/* Product Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Left - Images */}
                        <div className="space-y-4">
                            <div className="aspect-square rounded-xl overflow-hidden relative" style={{
                                background: colors.surface,
                                border: `1px solid ${colors.border}`
                            }}>
                                {productImage ? (
                                    <img
                                        src={productImage}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                        <Package size={80} className="text-white/50" />
                                    </div>
                                )}
                                {product.view_count > 0 && (
                                    <div className="absolute top-4 right-4 flex items-center gap-1 text-xs font-bold text-white bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm">
                                        <Eye size={14} />
                                        {product.view_count}
                                    </div>
                                )}
                                {product.listing_type === 'sale' && (
                                    <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold uppercase backdrop-blur-sm" style={{ background: GRADIENT, color: '#ffffff' }}>
                                        À venda
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right - Product Info */}
                        <div className="space-y-6">
                            {/* Owner info - Clicável como no design das publicações */}
                            <div
                                className="flex items-center gap-3 p-4 rounded-xl cursor-pointer group transition-all duration-300 hover:shadow-lg"
                                style={{
                                    background: colors.surface,
                                    border: `1px solid ${colors.border}`
                                }}
                                onClick={() => router.push(`/${ownerSlug}`)}
                            >
                                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 transition-all duration-300 group-hover:scale-105" style={{ borderColor: colors.border }}>
                                    {ownerAvatar ? (
                                        <img src={ownerAvatar} alt={ownerName} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                            <User size={24} className="text-white" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                                        {isProfileProduct ? 'Oferecido por' : 'Loja'}
                                    </p>
                                    <h3 className="font-bold truncate transition-colors duration-300 group-hover:text-opacity-70" style={{ color: colors.textPrimary }}>
                                        {ownerName}
                                        <span className="ml-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            →
                                        </span>
                                    </h3>
                                    {store?.address && (
                                        <div className="flex items-center gap-1 text-xs" style={{ color: colors.textSecondary }}>
                                            <MapPin size={12} />
                                            <span>{store.address}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <Store size={18} style={{ color: colors.accent }} />
                                </div>
                            </div>

                            {/* Product title */}
                            <h1 className="text-3xl font-bold" style={{ color: colors.textPrimary }}>
                                {product.name}
                            </h1>

                            {/* Price & Rating */}
                            <div className="flex flex-wrap items-center gap-4">
                                <span className="text-3xl font-black" style={{ color: '#f97316' }}>
                                    {formatPrice(product.price)}
                                </span>
                                {averageRating > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{
                                        background: colors.surface,
                                        border: `1px solid ${colors.border}`
                                    }}>
                                        <div className="flex items-center gap-0.5">
                                            <Star size={16} className="fill-yellow-400 text-yellow-400" />
                                            <span className="font-bold">{averageRating.toFixed(1)}</span>
                                        </div>
                                        <span className="text-sm" style={{ color: colors.textSecondary }}>
                                            ({reviewCount} {reviewCount === 1 ? 'avaliação' : 'avaliações'})
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Duration */}
                            {product.duration_minutes && (
                                <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
                                    <Timer size={18} />
                                    <span>Duração: {formatDuration(product.duration_minutes)}</span>
                                </div>
                            )}

                            {/* Description */}
                            {product.description && (
                                <div className="space-y-2">
                                    <h3 className="font-bold" style={{ color: colors.textPrimary }}>Descrição</h3>
                                    <div className="p-4 rounded-xl" style={{
                                        background: `${colors.border}30`,
                                        color: colors.textSecondary,
                                        lineHeight: 1.8,
                                    }}>
                                        <p className="whitespace-pre-wrap">
                                            {showFullDescription || !isDescriptionLong
                                                ? product.description
                                                : `${product.description.slice(0, 300)}...`}
                                        </p>
                                        {isDescriptionLong && (
                                            <button
                                                onClick={() => setShowFullDescription(!showFullDescription)}
                                                className="text-sm font-medium hover:underline mt-2"
                                                style={{ color: '#f97316' }}
                                            >
                                                {showFullDescription ? 'Ver menos' : 'Ver mais'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Specifications */}
                            {product.specifications && Object.keys(product.specifications).length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="font-bold" style={{ color: colors.textPrimary }}>Especificações</h3>
                                    <div className="grid grid-cols-2 gap-2 p-4 rounded-xl" style={{
                                        background: colors.surface,
                                        border: `1px solid ${colors.border}`
                                    }}>
                                        {Object.entries(product.specifications).map(([key, value]) => (
                                            <div key={key} className="text-sm">
                                                <span className="font-medium" style={{ color: colors.textPrimary }}>{key}:</span>
                                                <span className="ml-1" style={{ color: colors.textSecondary }}>{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Store info (if store product) */}
                            {store && !isProfileProduct && (
                                <div className="space-y-2 p-4 rounded-xl" style={{
                                    background: colors.surface,
                                    border: `1px solid ${colors.border}`
                                }}>
                                    <h3 className="font-bold" style={{ color: colors.textPrimary }}>Informações da Loja</h3>
                                    <div className="space-y-1 text-sm" style={{ color: colors.textSecondary }}>
                                        {store.phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone size={14} />
                                                <span>{store.phone}</span>
                                            </div>
                                        )}
                                        {store.email && (
                                            <div className="flex items-center gap-2">
                                                <Mail size={14} />
                                                <span>{store.email}</span>
                                            </div>
                                        )}
                                        {store.website && (
                                            <div className="flex items-center gap-2">
                                                <Globe size={14} />
                                                <a href={store.website} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: '#f97316' }}>
                                                    {store.website}
                                                </a>
                                            </div>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                            <SocialIcon platform="instagram" url={store.instagram} />
                                            <SocialIcon platform="facebook" url={store.facebook} />
                                            <SocialIcon platform="twitter" url={store.twitter} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    className="flex-1 min-w-[140px] px-6 py-3 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <ShoppingBag size={20} />
                                    Comprar
                                </button>
                                <button
                                    className="px-6 py-3 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                                    style={{
                                        background: colors.surface,
                                        border: `2px solid ${colors.border}`,
                                        color: colors.textPrimary
                                    }}
                                >
                                    <Heart size={20} />
                                    Favoritar
                                </button>
                                <button
                                    className="px-6 py-3 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                                    style={{
                                        background: colors.surface,
                                        border: `2px solid ${colors.border}`,
                                        color: colors.textPrimary
                                    }}
                                >
                                    <Share2 size={20} />
                                    Compartilhar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Reviews Section */}
                    {reviews.length > 0 && (
                        <div className="mt-12">
                            <h2 className="text-2xl font-bold mb-4" style={{ color: colors.textPrimary }}>
                                Avaliações ({reviewCount})
                            </h2>
                            <div className="space-y-4">
                                {reviews.slice(0, 5).map((review) => (
                                    <div key={review.id} className="p-4 rounded-xl" style={{
                                        background: colors.surface,
                                        border: `1px solid ${colors.border}`
                                    }}>
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ background: GRADIENT }}>
                                                {review.user_avatar ? (
                                                    <img src={review.user_avatar} alt={review.user_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">
                                                        {review.user_name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium" style={{ color: colors.textPrimary }}>{review.user_name}</p>
                                                <p className="text-xs" style={{ color: colors.textSecondary }}>{formatDate(review.created_at)}</p>
                                            </div>
                                            <div className="ml-auto flex items-center gap-0.5">
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                    <Star key={i} size={16} className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
                                                ))}
                                            </div>
                                        </div>
                                        {review.comment && (
                                            <p className="text-sm" style={{ color: colors.textSecondary }}>{review.comment}</p>
                                        )}
                                    </div>
                                ))}
                                {reviews.length > 5 && (
                                    <button className="text-sm font-medium hover:underline" style={{ color: '#f97316' }}>
                                        Ver todas as {reviewCount} avaliações
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Related Products */}
                    {relatedProducts.length > 0 && (
                        <div className="mt-12">
                            <h2 className="text-2xl font-bold mb-4" style={{ color: colors.textPrimary }}>
                                Produtos Relacionados
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {relatedProducts.slice(0, 4).map((related) => {
                                    const relatedImage = related.image_url ? getPublicUrl('product-images', related.image_url) : null
                                    return (
                                        <Link
                                            key={related.id}
                                            href={`/${ownerSlug}/${related.slug}`}
                                            className="group p-4 rounded-xl transition-all hover:scale-105 hover:shadow-lg"
                                            style={{
                                                background: colors.surface,
                                                border: `1px solid ${colors.border}`
                                            }}
                                        >
                                            <div className="aspect-square rounded-lg overflow-hidden mb-3" style={{ background: colors.background }}>
                                                {relatedImage ? (
                                                    <img src={relatedImage} alt={related.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                                        <Package size={32} className="text-white/30" />
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="font-medium text-sm line-clamp-1" style={{ color: colors.textPrimary }}>{related.name}</h3>
                                            <p className="font-bold text-sm" style={{ color: '#f97316' }}>{formatPrice(related.price)}</p>
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}