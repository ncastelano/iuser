// src/app/(app)/[ownerSlug]/page.tsx
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
    Store,
    User,
    ShoppingBag,
    Megaphone,
    Clock,
    Star,
    MapPin,
    MessageCircle,
    Pencil,
    Plus,
    Search,
    Eye,
    ChevronRight,
} from 'lucide-react'
import { RatingStars } from '@/components/ratings/RatingStars'
import { useCartStore } from '@/store/useCartStore'
import SacolaButton from '@/app/ButtonSacola'
import Header from '@/app/Header'
import { isProfileOpenNow, getProfileStatusText } from '@/lib/profileHours'
import { isStoreOpenNow, getStoreStatusText } from '@/lib/storeHours'
import { toast } from 'sonner'

type OwnerType = 'profile' | 'store'

interface OwnerData {
    id: string
    name: string
    slug: string
    type: OwnerType
    avatar_url?: string | null
    business_hours?: any
    description?: string | null
    address?: string | null
    whatsapp?: string | null
    view_count?: number
    ratings_avg?: number
    ratings_count?: number
}

// ========== FUNÇÃO PARA GERAR URL DA IMAGEM ==========
const getImageUrl = (url: string | null | undefined, type: 'profile' | 'store'): string | null => {
    if (!url) return null

    // Se já é uma URL completa (http), retorna ela mesma
    if (url.startsWith('http')) {
        return url
    }

    // Se for loja, constrói a URL do bucket de logos
    if (type === 'store') {
        const { data } = supabase.storage
            .from('store-logos')
            .getPublicUrl(url)
        return data.publicUrl
    }

    // Se for perfil, constrói a URL do bucket de avatares
    if (type === 'profile') {
        const { data } = supabase.storage
            .from('avatars')
            .getPublicUrl(url)
        return data.publicUrl
    }

    return null
}

export default function OwnerPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { bgMode, customBgUrl, profileSlug: loggedUserSlug, avatarUrl: loggedUserAvatarUrl } = useProfile()

    const ownerSlug = Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [owner, setOwner] = useState<OwnerData | null>(null)
    const [ownerType, setOwnerType] = useState<OwnerType | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [followersCount, setFollowersCount] = useState(0)
    const [isFollowing, setIsFollowing] = useState(false)
    const [totalVisitors, setTotalVisitors] = useState(0)
    const [products, setProducts] = useState<any[]>([])
    const [publications, setPublications] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState<'products' | 'publications' | 'reviews'>('products')
    const [searchQuery, setSearchQuery] = useState('')
    const [ratings, setRatings] = useState<any[]>([])
    const [mounted, setMounted] = useState(false)
    const [cartAnimating, setCartAnimating] = useState(false)

    // ========== CART ==========
    const { itemsByStore, addItem, removeItem, updateQuantity } = useCartStore()

    const storeKey = useMemo(() => {
        if (!ownerSlug) return ''
        return ownerType === 'store' ? ownerSlug : `profile_${ownerSlug}`
    }, [ownerType, ownerSlug])

    const cartItems = useMemo(() => {
        if (!storeKey) return []
        return itemsByStore[storeKey] || []
    }, [itemsByStore, storeKey])

    const totalCartQuantity = useMemo(
        () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
        [cartItems]
    )

    // ========== GERAR URL DA IMAGEM (MOVIDO PARA CIMA) ==========
    const imageUrl = useMemo(() => {
        if (!owner?.avatar_url) return null

        // Se for loja, usa o bucket de logos
        if (ownerType === 'store') {
            return getImageUrl(owner.avatar_url, 'store')
        }

        // Se for perfil
        return getImageUrl(owner.avatar_url, 'profile')
    }, [owner?.avatar_url, ownerType])

    // ========== DETECTAR OWNER ==========
    const detectOwner = useCallback(async (slug: string) => {
        // Tenta encontrar como perfil
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, name, profileSlug, avatar_url, business_hours, description, address, whatsapp, view_count')
            .eq('profileSlug', slug)
            .maybeSingle()

        if (profile && !profileError) {
            // Buscar ratings do perfil
            const { data: ratings } = await supabase
                .from('product_reviews')
                .select('rating')
                .eq('store_id', null as any)

            let avg = 0
            let count = 0
            if (ratings && ratings.length > 0) {
                count = ratings.length
                avg = ratings.reduce((sum, r) => sum + r.rating, 0) / count
            }

            return {
                data: {
                    id: profile.id,
                    name: profile.name,
                    slug: profile.profileSlug,
                    type: 'profile' as OwnerType,
                    avatar_url: profile.avatar_url,
                    business_hours: profile.business_hours,
                    description: profile.description,
                    address: profile.address,
                    whatsapp: profile.whatsapp,
                    view_count: profile.view_count || 0,
                    ratings_avg: avg,
                    ratings_count: count,
                },
                type: 'profile' as OwnerType
            }
        }

        // Se não for perfil, tenta como loja
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('id, name, storeSlug, logo_url, owner_id, business_hours, description, address, whatsapp, view_count')
            .eq('storeSlug', slug)
            .maybeSingle()

        if (store && !storeError) {
            // Buscar ratings da loja
            const { data: ratings } = await supabase
                .from('product_reviews')
                .select('rating')
                .eq('store_id', store.id)

            let avg = 0
            let count = 0
            if (ratings && ratings.length > 0) {
                count = ratings.length
                avg = ratings.reduce((sum, r) => sum + r.rating, 0) / count
            }

            return {
                data: {
                    id: store.id,
                    name: store.name,
                    slug: store.storeSlug,
                    type: 'store' as OwnerType,
                    avatar_url: store.logo_url,
                    business_hours: store.business_hours,
                    description: store.description,
                    address: store.address,
                    whatsapp: store.whatsapp,
                    view_count: store.view_count || 0,
                    ratings_avg: avg,
                    ratings_count: count,
                },
                type: 'store' as OwnerType
            }
        }

        return null
    }, [])

    // ========== CARREGAR DADOS ==========
    const loadData = useCallback(async () => {
        if (!ownerSlug) {
            setError('Parâmetro inválido')
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            // 1. Detectar owner (perfil ou loja)
            const ownerResult = await detectOwner(ownerSlug)
            if (!ownerResult) {
                setError('Perfil ou loja não encontrado')
                setLoading(false)
                return
            }

            setOwner(ownerResult.data)
            setOwnerType(ownerResult.type)
            setTotalVisitors(ownerResult.data.view_count || 0)

            // 2. Pegar usuário atual
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
            setIsOwner(user?.id === ownerResult.data.id)

            // 3. Buscar seguidores
            const { count: followers } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('following_id', ownerResult.data.id)

            setFollowersCount(followers || 0)

            // 4. Verificar se está seguindo
            if (user) {
                const { data: followData } = await supabase
                    .from('follows')
                    .select('*')
                    .eq('follower_id', user.id)
                    .eq('following_id', ownerResult.data.id)
                    .maybeSingle()
                setIsFollowing(!!followData)
            }

            // 5. Buscar produtos (sale) e publicações
            const ownerField = ownerResult.type === 'profile' ? 'owner_id' : 'store_id'
            const ownerFieldValue = ownerResult.data.id

            // Produtos
            const { data: productsData } = await supabase
                .from('products')
                .select('*')
                .eq(ownerField, ownerFieldValue)
                .eq('listing_type', 'sale')
                .order('created_at', { ascending: false })

            setProducts(productsData || [])

            // Publicações
            const { data: publicationsData } = await supabase
                .from('products')
                .select('*')
                .eq(ownerField, ownerFieldValue)
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })

            setPublications(publicationsData || [])

            // 6. Buscar ratings
            const ratingsQuery = ownerResult.type === 'profile'
                ? supabase.from('product_reviews').select('*').is('store_id', null)
                : supabase.from('product_reviews').select('*').eq('store_id', ownerResult.data.id)

            const { data: ratingsData } = await ratingsQuery.order('created_at', { ascending: false })
            setRatings(ratingsData || [])

        } catch (err: any) {
            console.error('Erro ao carregar dados:', err)
            setError(err.message || 'Erro ao carregar página')
        } finally {
            setLoading(false)
        }
    }, [ownerSlug, detectOwner])

    useEffect(() => {
        loadData()
    }, [loadData])

    useEffect(() => {
        setMounted(true)
    }, [])

    // ========== FOLLOW ==========
    const handleFollowToggle = async () => {
        if (!currentUserId || !owner) return
        if (isFollowing) {
            setIsFollowing(false)
            setFollowersCount(prev => prev - 1)
            await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', owner.id)
        } else {
            setIsFollowing(true)
            setFollowersCount(prev => prev + 1)
            await supabase.from('follows').insert({ follower_id: currentUserId, following_id: owner.id })
        }
    }

    // ========== STATUS ==========
    const isOpen = useMemo(() => {
        if (!owner) return false
        if (ownerType === 'profile') {
            return isProfileOpenNow(owner.business_hours)
        }
        return isStoreOpenNow(owner.business_hours)
    }, [owner, ownerType])

    const statusText = useMemo(() => {
        if (!owner) return ''
        if (ownerType === 'profile') {
            return getProfileStatusText(owner.business_hours)
        }
        return getStoreStatusText(owner.business_hours)
    }, [owner, ownerType])

    // ========== FILTRO ==========
    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const query = searchQuery.toLowerCase()
        return products.filter(p =>
            p.name?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query)
        )
    }, [products, searchQuery])

    // ========== RENDER ==========
    if (loading) {
        return <LoadingSpinner message="Carregando..." background={colors.background} />
    }

    if (error || !owner) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <AlertTriangle className="w-12 h-12" style={{ color: colors.accent }} />
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Perfil não encontrado'}
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

    const isProfileOwner = ownerType === 'profile'
    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

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
                    avatarUrl={imageUrl || null}
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
                        <span className="font-bold" style={{ color: colors.textPrimary }}>
                            {isProfileOwner ? '@' : ''}{owner.slug}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span className="font-bold" style={{ color: colors.textPrimary }}>
                            {isProfileOwner ? 'Perfil' : 'Loja'}
                        </span>
                    </div>

                    {/* Card do perfil/loja */}
                    <div className="rounded-3xl overflow-hidden border p-6 mb-6" style={{
                        background: `rgba(255, 255, 255, 0.06)`,
                        borderColor: `rgba(255,255,255,0.12)`,
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                    }}>
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden p-1" style={{
                                    background: GRADIENT,
                                }}>
                                    <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                                        {imageUrl ? (
                                            <img
                                                src={imageUrl}
                                                className="w-full h-full object-cover"
                                                alt={owner.name}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none'
                                                }}
                                            />
                                        ) : (
                                            <span className="text-3xl font-black" style={{ color: '#f97316' }}>
                                                {owner.name?.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isOwner && (
                                    <button
                                        onClick={() => router.push(`/${ownerSlug}/editar`)}
                                        className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 text-center md:text-left">
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                                    <h1 className="text-2xl md:text-3xl font-black" style={{ color: colors.textPrimary }}>
                                        {owner.name}
                                    </h1>
                                    <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase" style={{
                                        background: `rgba(249, 115, 22, 0.15)`,
                                        color: '#f97316'
                                    }}>
                                        {isProfileOwner ? 'Perfil' : 'Loja'}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2">
                                    <div className="flex items-center gap-1 text-xs" style={{ color: colors.textSecondary }}>
                                        <span className="font-bold">@{owner.slug}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs">
                                        <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <span className="font-bold" style={{ color: isOpen ? '#10b981' : '#ef4444' }}>
                                            {isOpen ? 'Aberto' : 'Fechado'}
                                        </span>
                                        <span style={{ color: colors.textSecondary }}>•</span>
                                        <span style={{ color: colors.textSecondary }}>{statusText}</span>
                                    </div>
                                </div>

                                {owner.description && (
                                    <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                                        {owner.description}
                                    </p>
                                )}

                                {/* Métricas */}
                                <div className="flex flex-wrap justify-center md:justify-start gap-6 mt-4">
                                    <div className="text-center">
                                        <p className="text-xl font-black" style={{ color: colors.textPrimary }}>{followersCount}</p>
                                        <p className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Seguidores</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl font-black" style={{ color: colors.textPrimary }}>{totalVisitors}</p>
                                        <p className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Visitas</p>
                                    </div>
                                    {owner.ratings_count && owner.ratings_count > 0 && (
                                        <div className="text-center">
                                            <div className="flex items-center gap-1 justify-center">
                                                <RatingStars value={owner.ratings_avg || 0} size={14} />
                                                <span className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                                    {owner.ratings_avg?.toFixed(1)}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                                {owner.ratings_count} avaliações
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Botões de ação */}
                                <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-4">
                                    {currentUserId && currentUserId !== owner.id && (
                                        <button
                                            onClick={handleFollowToggle}
                                            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition hover:scale-105 ${isFollowing ? 'border-2' : ''
                                                }`}
                                            style={isFollowing ? {
                                                borderColor: '#f97316',
                                                color: '#f97316',
                                                background: 'transparent'
                                            } : {
                                                background: GRADIENT,
                                                color: '#fff'
                                            }}
                                        >
                                            {isFollowing ? 'Seguindo' : 'Seguir'}
                                        </button>
                                    )}

                                    {owner.whatsapp && (
                                        <a
                                            href={`https://wa.me/${owner.whatsapp.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition hover:scale-105 flex items-center gap-2"
                                            style={{ background: '#25D366', color: '#fff' }}
                                        >
                                            <MessageCircle className="w-4 h-4" />
                                            WhatsApp
                                        </a>
                                    )}

                                    {owner.address && (
                                        <button
                                            onClick={() => {
                                                const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(owner.address!)}`
                                                window.open(url, '_blank')
                                            }}
                                            className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition hover:scale-105 flex items-center gap-2"
                                            style={{
                                                background: `rgba(255,255,255,0.08)`,
                                                color: colors.textSecondary
                                            }}
                                        >
                                            <MapPin className="w-4 h-4" />
                                            Localização
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex rounded-2xl p-1.5 border mb-6" style={{
                        background: `rgba(255,255,255,0.03)`,
                        borderColor: `rgba(255,255,255,0.06)`
                    }}>
                        <button
                            onClick={() => setActiveTab('products')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition ${activeTab === 'products' ? 'shadow-lg scale-[1.02]' : ''
                                }`}
                            style={activeTab === 'products' ? {
                                background: GRADIENT,
                                color: '#fff'
                            } : {
                                color: colors.textSecondary,
                                background: 'transparent'
                            }}
                        >
                            Produtos ({products.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('publications')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition ${activeTab === 'publications' ? 'shadow-lg scale-[1.02]' : ''
                                }`}
                            style={activeTab === 'publications' ? {
                                background: GRADIENT,
                                color: '#fff'
                            } : {
                                color: colors.textSecondary,
                                background: 'transparent'
                            }}
                        >
                            Publicações ({publications.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('reviews')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition ${activeTab === 'reviews' ? 'shadow-lg scale-[1.02]' : ''
                                }`}
                            style={activeTab === 'reviews' ? {
                                background: GRADIENT,
                                color: '#fff'
                            } : {
                                color: colors.textSecondary,
                                background: 'transparent'
                            }}
                        >
                            Avaliações ({ratings.length})
                        </button>
                    </div>

                    {/* Conteúdo das Tabs */}
                    {activeTab === 'products' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar produtos..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full rounded-2xl py-3 pl-10 pr-4 text-sm border focus:outline-none focus:ring-2 transition"
                                        style={{
                                            background: `rgba(255,255,255,0.05)`,
                                            borderColor: `rgba(255,255,255,0.1)`,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                </div>
                                {isOwner && (
                                    <button
                                        onClick={() => router.push(`/${ownerSlug}/criar-produto`)}
                                        className="w-10 h-10 rounded-xl flex items-center justify-center transition hover:scale-110"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                )}
                            </div>

                            {filteredProducts.length === 0 ? (
                                <div className="py-16 text-center rounded-2xl border border-dashed" style={{
                                    background: `rgba(255,255,255,0.03)`,
                                    borderColor: `rgba(255,255,255,0.06)`,
                                }}>
                                    <ShoppingBag className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                    <p className="font-bold" style={{ color: colors.textPrimary }}>
                                        {isOwner ? 'Você ainda não tem produtos' : 'Nenhum produto disponível'}
                                    </p>
                                    {isOwner && (
                                        <button
                                            onClick={() => router.push(`/${ownerSlug}/criar-produto`)}
                                            className="mt-4 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition hover:scale-105"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            <Plus className="w-4 h-4 inline mr-1" />
                                            Adicionar Produto
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {filteredProducts.map(product => {
                                        // Gerar URL da imagem do produto
                                        const productImageUrl = product.image_url
                                            ? supabase.storage
                                                .from('product-images')
                                                .getPublicUrl(product.image_url)
                                                .data.publicUrl
                                            : null

                                        return (
                                            <div
                                                key={product.id}
                                                onClick={() => router.push(`/${ownerSlug}/${product.slug || product.id}`)}
                                                className="rounded-2xl overflow-hidden border cursor-pointer transition hover:scale-[1.02] hover:shadow-xl"
                                                style={{
                                                    background: `rgba(255,255,255,0.04)`,
                                                    borderColor: `rgba(255,255,255,0.08)`,
                                                }}
                                            >
                                                {productImageUrl && (
                                                    <div className="aspect-square bg-gray-100">
                                                        <img
                                                            src={productImageUrl}
                                                            className="w-full h-full object-cover"
                                                            alt={product.name}
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = 'none'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                                <div className="p-3">
                                                    <h4 className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                                        {product.name}
                                                    </h4>
                                                    {product.price > 0 && (
                                                        <p className="text-sm font-black mt-1" style={{ color: '#f97316' }}>
                                                            R$ {product.price.toFixed(2)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'publications' && (
                        <div className="grid grid-cols-2 gap-3">
                            {publications.length === 0 ? (
                                <div className="col-span-2 py-16 text-center rounded-2xl border border-dashed" style={{
                                    background: `rgba(255,255,255,0.03)`,
                                    borderColor: `rgba(255,255,255,0.06)`,
                                }}>
                                    <Megaphone className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                    <p className="font-bold" style={{ color: colors.textPrimary }}>
                                        {isOwner ? 'Você ainda não tem publicações' : 'Nenhuma publicação disponível'}
                                    </p>
                                    {isOwner && (
                                        <button
                                            onClick={() => router.push(`/${ownerSlug}/criar-publicacao`)}
                                            className="mt-4 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition hover:scale-105"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            <Plus className="w-4 h-4 inline mr-1" />
                                            Criar Publicação
                                        </button>
                                    )}
                                </div>
                            ) : (
                                publications.map(pub => {
                                    const pubImageUrl = pub.image_url
                                        ? supabase.storage
                                            .from('product-images')
                                            .getPublicUrl(pub.image_url)
                                            .data.publicUrl
                                        : null

                                    return (
                                        <div
                                            key={pub.id}
                                            onClick={() => router.push(`/${ownerSlug}/${pub.slug || pub.id}`)}
                                            className="rounded-2xl overflow-hidden border cursor-pointer transition hover:scale-[1.02] hover:shadow-xl"
                                            style={{
                                                background: `rgba(255,255,255,0.04)`,
                                                borderColor: `rgba(255,255,255,0.08)`,
                                            }}
                                        >
                                            {pubImageUrl && (
                                                <div className="aspect-square bg-gray-100">
                                                    <img
                                                        src={pubImageUrl}
                                                        className="w-full h-full object-cover"
                                                        alt={pub.name}
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).style.display = 'none'
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <div className="p-3">
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Megaphone className="w-3 h-3" style={{ color: '#f97316' }} />
                                                    <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: '#f97316' }}>
                                                        Publicação
                                                    </span>
                                                </div>
                                                <h4 className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {pub.name}
                                                </h4>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {activeTab === 'reviews' && (
                        <div className="space-y-3">
                            {ratings.length === 0 ? (
                                <div className="py-16 text-center rounded-2xl border border-dashed" style={{
                                    background: `rgba(255,255,255,0.03)`,
                                    borderColor: `rgba(255,255,255,0.06)`,
                                }}>
                                    <Star className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                    <p className="font-bold" style={{ color: colors.textPrimary }}>Nenhuma avaliação ainda</p>
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>Seja o primeiro a avaliar!</p>
                                </div>
                            ) : (
                                ratings.map(rating => (
                                    <div key={rating.id} className="rounded-2xl p-4 border" style={{
                                        background: `rgba(255,255,255,0.04)`,
                                        borderColor: `rgba(255,255,255,0.08)`,
                                    }}>
                                        <div className="flex items-center gap-3">
                                            <RatingStars value={rating.rating} size={14} />
                                            <span className="text-xs" style={{ color: colors.textSecondary }}>
                                                {new Date(rating.created_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>
                                        {rating.comment && (
                                            <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                                                "{rating.comment}"
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Botão do carrinho */}
            <div style={{ position: 'fixed', bottom: 32, right: 24, zIndex: 998 }}>
                <SacolaButton
                    totalItems={totalCartQuantity}
                    statusCounts={{ pending: 0, preparing: 0, ready: 0, reviews: 0 }}
                    animate={cartAnimating}
                />
            </div>
        </div>
    )
}