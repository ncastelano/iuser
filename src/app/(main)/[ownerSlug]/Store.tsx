// src/components/owner/Store.tsx
'use client'

import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import {
    AlertTriangle,
    ArrowLeft,
    Calendar,
    Search,
    Clock,
    ExternalLink,
    Star,
    X,
    Plus,
    Shield,
    Eye,
    ShoppingBag,
    Home,
    Store as StoreIcon,
    MapPin,
    MessageCircle,
    Megaphone,
    ImageIcon,
    Send,
    Trash2,
    AlertCircle,
    Info,
} from 'lucide-react'
import { RatingStars } from '@/components/ratings/RatingStars'
import { useCartStore } from '@/store/useCartStore'
import { isStoreOpenNow, getStoreStatusText, getNextOpeningInfo, type BusinessHours } from '@/lib/storeHours'
import { toast } from 'sonner'
import { getAvatarUrl } from '@/lib/avatar'
import StoreSchedule from '../StoreSchedule'

interface StoreProps {
    ownerSlug: string
    colors: any
    bgMode: string
    customBgUrl?: string | null
    loggedUserSlug?: string | null
    onCartUpdate?: (total: number) => void
}

interface OwnerData {
    id: string
    name: string
    slug: string
    type: 'store'
    avatar_url?: string | null
    business_hours?: BusinessHours | null
    description?: string | null
    address?: string | null
    whatsapp?: string | null
    view_count?: number
    ratings_avg?: number
    ratings_count?: number
    allow_scheduling?: boolean
    location?: any
}

type RatingRow = {
    id: string
    rating: number
    profile_id: string
    created_at: string
    comment?: string
    is_anonymous?: boolean
    profiles?: {
        id: string
        name: string | null
        avatar_url: string | null
        profileSlug?: string | null
    } | null
    products?: {
        name: string
    } | null
}

type Publication = {
    id: string
    name: string
    description?: string
    image_url: string | null
    slug: string
    store_id: string
    created_at: string
}

type TabType = 'products' | 'publications' | 'reviews'

export function Store({ ownerSlug, colors, bgMode, customBgUrl, loggedUserSlug, onCartUpdate }: StoreProps) {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [owner, setOwner] = useState<OwnerData | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [followersCount, setFollowersCount] = useState(0)
    const [isFollowing, setIsFollowing] = useState(false)
    const [totalVisitors, setTotalVisitors] = useState(0)
    const [products, setProducts] = useState<any[]>([])
    const [publications, setPublications] = useState<Publication[]>([])
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const [cartAnimating, setCartAnimating] = useState(false)
    const [activeTab, setActiveTab] = useState<TabType>('products')
    const [searchQuery, setSearchQuery] = useState('')
    const [expandedDesc, setExpandedDesc] = useState(false)
    const DESC_LIMIT = 80
    const [showAllHours, setShowAllHours] = useState(false)
    const [showScheduleModal, setShowScheduleModal] = useState(false)
    const [storeWhatsapp, setStoreWhatsapp] = useState<string | null>(null)
    const [showClosedAlert, setShowClosedAlert] = useState(false)

    // ===== MODAL DE DETALHES DO PRODUTO =====
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
    const [showProductModal, setShowProductModal] = useState(false)

    // States para Publicações
    const [isCreatingPublication, setIsCreatingPublication] = useState(false)
    const [pubName, setPubName] = useState('')
    const [pubDescription, setPubDescription] = useState('')
    const [pubImageFile, setPubImageFile] = useState<File | null>(null)
    const [pubPreview, setPubPreview] = useState<string | null>(null)
    const [pubSaving, setPubSaving] = useState(false)
    const [pubLoading, setPubLoading] = useState(false)

    const { itemsByStore, addItem, removeItem, updateQuantity } = useCartStore()

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    // ========== ESTILOS ==========
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
    }
    const surfaceRgb = hexToRgb(colors.surface)

    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
    }

    const primaryButtonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.75rem 1.25rem',
        borderRadius: '1rem',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s ease',
        background: GRADIENT,
        color: '#ffffff',
        border: 'none',
        boxShadow: `0 4px 14px #f9731660`,
        cursor: 'pointer',
    }

    // ========== STATUS (DEFINIDO ANTES DOS CALLBACKS) ==========
    const isStoreOpen = useMemo(() => {
        if (!owner) return false
        return isStoreOpenNow(owner.business_hours)
    }, [owner])

    const statusText = useMemo(() => {
        if (!owner) return ''
        return getStoreStatusText(owner.business_hours)
    }, [owner])

    const nextAvailable = useMemo(() => {
        if (!owner?.business_hours) return null
        const next = getNextOpeningInfo(owner.business_hours)
        if (!next) return null
        return {
            day: next.dayLabel,
            open: next.time,
        }
    }, [owner?.business_hours])

    // ========== CARRINHO ==========
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

    useEffect(() => {
        if (onCartUpdate) {
            onCartUpdate(totalCartQuantity)
        }
    }, [totalCartQuantity, onCartUpdate])

    useEffect(() => {
        setMounted(true)
    }, [])

    // ========== QUANTITY HELPERS ==========
    const getProductQuantity = useCallback(
        (productId: string) => {
            const storeItems = itemsByStore[ownerSlug] || []
            const found = storeItems.find((item) => item.product.id === productId)
            return found ? found.quantity : 0
        },
        [itemsByStore, ownerSlug]
    )

    // ========== INCREASE QUANTITY (com validação de loja aberta) ==========
    const increaseQuantity = useCallback(
        (product: any) => {
            if (!owner) return

            if (!isStoreOpen) {
                setShowClosedAlert(true)
                toast.error('Loja fechada no momento. Não é possível adicionar itens ao carrinho.')
                return
            }

            addItem(ownerSlug, { name: owner.name, logo_url: owner.avatar_url ?? null }, product)
        },
        [owner, ownerSlug, addItem, isStoreOpen]
    )

    const decreaseQuantity = useCallback(
        (productId: string) => {
            updateQuantity(ownerSlug, productId, -1)
        },
        [ownerSlug, updateQuantity]
    )

    const removeAllOfProduct = useCallback(
        (productId: string) => {
            removeItem(ownerSlug, productId)
        },
        [ownerSlug, removeItem]
    )

    // ========== FILTRO ==========
    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const query = searchQuery.toLowerCase()
        return products.filter(p =>
            p.name?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query)
        )
    }, [products, searchQuery])

    // ========== GROUP PRODUCTS ==========
    const groupedProducts = useMemo(() => {
        const groups: Record<string, any[]> = {}
        filteredProducts.forEach(product => {
            const cat = product.category || 'Geral'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(product)
        })
        return groups
    }, [filteredProducts])

    // ========== RATINGS STATS ==========
    const ratingsStats = useMemo(() => {
        if (ratings.length === 0) return null
        const sum = ratings.reduce((acc, r) => acc + r.rating, 0)
        const avg = sum / ratings.length
        return { avg: avg.toFixed(1), count: ratings.length }
    }, [ratings])

    // ========== WHATSAPP ==========
    const whatsappLink = useMemo(() => {
        if (!owner?.whatsapp) return null
        return `https://wa.me/${owner.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi sua loja no iUser e tenho interesse nos seus produtos/serviços.`)}`
    }, [owner])

    // ========== PUBLICATIONS ==========
    const getImageUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    useEffect(() => {
        if (!pubImageFile) return
        const url = URL.createObjectURL(pubImageFile)
        setPubPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [pubImageFile])

    const loadPublications = useCallback(async (storeId: string) => {
        setPubLoading(true)
        try {
            const { data, error } = await supabase
                .from('products')
                .select('id, name, description, image_url, slug, created_at')
                .eq('store_id', storeId)
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })

            if (!error && data) {
                setPublications(data as Publication[])
            }
        } catch (err) {
            console.error('[Store] Erro ao carregar publicações:', err)
        } finally {
            setPubLoading(false)
        }
    }, [])

    const handleCreatePublication = async () => {
        if (!pubName.trim()) {
            toast.error('Dê um nome à publicação')
            return
        }
        if (!owner) return

        setPubSaving(true)
        try {
            let imagePath: string | null = null
            if (pubImageFile) {
                const fileExt = pubImageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, pubImageFile)
                if (uploadError) throw uploadError
                imagePath = uploadData?.path ?? null
            }

            let slug = pubName
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, '')
            let isUnique = false
            while (!isUnique) {
                const { data: existing } = await supabase
                    .from('products')
                    .select('id')
                    .eq('slug', slug)
                    .eq('store_id', owner.id)
                    .maybeSingle()
                if (existing) {
                    slug = slug + '-' + Math.floor(Math.random() * 9999)
                } else {
                    isUnique = true
                }
            }

            const { error: insertError } = await supabase.from('products').insert({
                name: pubName,
                slug,
                description: pubDescription || null,
                price: 0,
                type: 'physical',
                price_type: 'fixed',
                listing_type: 'publication',
                image_url: imagePath,
                store_id: owner.id,
            })

            if (insertError) throw insertError

            toast.success('Publicação criada com sucesso!')
            setPubName('')
            setPubDescription('')
            setPubImageFile(null)
            setPubPreview(null)
            setIsCreatingPublication(false)

            await loadPublications(owner.id)
        } catch (err: any) {
            console.error('Erro ao criar publicação:', err)
            toast.error('Erro ao criar: ' + (err.message || 'Tente novamente'))
        } finally {
            setPubSaving(false)
        }
    }

    const handleDeletePublication = async (id: string) => {
        if (!confirm('Deletar esta publicação?')) return
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (!error) {
            setPublications(prev => prev.filter(p => p.id !== id))
            toast.success('Publicação removida')
        } else {
            toast.error('Erro ao remover')
        }
    }

    // ========== MAPS ==========
    const openGoogleMaps = () => {
        if (!owner) return
        let url = ''
        if (owner.location) {
            try {
                let lat: number | null = null
                let lng: number | null = null
                if (typeof owner.location === 'string') {
                    const match = owner.location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
                    if (match) {
                        lng = parseFloat(match[1])
                        lat = parseFloat(match[2])
                    }
                } else if (owner.location?.type === 'Point' && Array.isArray(owner.location?.coordinates)) {
                    lng = owner.location.coordinates[0]
                    lat = owner.location.coordinates[1]
                }
                if (lat !== null && lng !== null) {
                    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                }
            } catch (e) {
                console.error('Erro ao extrair coordenadas:', e)
            }
        }
        if (!url && owner.address) {
            url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(owner.address)}`
        }
        if (url) {
            window.open(url, '_blank')
        } else {
            toast.error('Localização não disponível')
        }
    }

    // ========== HANDLE PRODUCT CLICK - CORRIGIDO ==========
    const handleProductClick = (product: any, e?: React.MouseEvent) => {
        // Se o clique veio de um botão de ação, não redireciona
        if (e?.target && (e.target as HTMLElement).closest('.product-action-button')) {
            return
        }

        const productIdentifier = product.slug || product.id

        if (!productIdentifier) {
            toast.error('Erro ao acessar este item')
            return
        }

        if (isOwner) {
            router.push(`/${ownerSlug}/${productIdentifier}/editar-produto`)
            return
        }

        const isPublication = product.listing_type === 'publication'
        if (isPublication) {
            router.push(`/${ownerSlug}/${productIdentifier}`)
            return
        }

        // Se a loja estiver fechada, mostra o modal de detalhes
        if (!isStoreOpen) {
            setSelectedProduct(product)
            setShowProductModal(true)
            return
        }

        // Vai para a página do produto
        router.push(`/${ownerSlug}/${productIdentifier}`)
    }

    // ========== CARREGAR DADOS DA LOJA ==========
    const loadStoreData = useCallback(async () => {
        if (!ownerSlug) {
            setError('Parâmetro inválido')
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const { data: store, error: storeError } = await supabase
                .from('stores')
                .select('*')
                .eq('storeSlug', ownerSlug)
                .maybeSingle()

            if (storeError || !store) {
                setError('Loja não encontrada')
                setLoading(false)
                return
            }

            const { data: ratingsData } = await supabase
                .from('product_reviews')
                .select('rating')
                .eq('store_id', store.id)

            let avg = 0
            let count = 0
            if (ratingsData && ratingsData.length > 0) {
                count = ratingsData.length
                avg = ratingsData.reduce((sum, r) => sum + r.rating, 0) / count
            }

            const logoUrl = store.logo_url
                ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                : null

            let storeWhatsapp = store.whatsapp
            if (!storeWhatsapp && store.owner_id) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('whatsapp')
                    .eq('id', store.owner_id)
                    .single()
                storeWhatsapp = profile?.whatsapp
            }

            const ownerData: OwnerData = {
                id: store.id,
                name: store.name,
                slug: store.storeSlug,
                type: 'store',
                avatar_url: logoUrl,
                business_hours: store.business_hours,
                description: store.description,
                address: store.address,
                whatsapp: storeWhatsapp,
                view_count: store.view_count || 0,
                ratings_avg: avg,
                ratings_count: count,
                allow_scheduling: store.allow_scheduling || false,
                location: store.location,
            }

            setOwner(ownerData)
            setTotalVisitors(store.view_count || 0)
            setImageUrl(logoUrl)
            setStoreWhatsapp(storeWhatsapp)

            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
            setIsOwner(user?.id === store.owner_id)

            const { count: followers } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('following_id', store.id)

            setFollowersCount(followers || 0)

            if (user) {
                const { data: followData } = await supabase
                    .from('follows')
                    .select('*')
                    .eq('follower_id', user.id)
                    .eq('following_id', store.id)
                    .maybeSingle()
                setIsFollowing(!!followData)
            }

            const { data: productsData } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', store.id)
                .eq('listing_type', 'sale')
                .order('created_at', { ascending: false })

            const mappedProducts = (productsData || []).map((product: any) => ({
                ...product,
                image_url: product.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
                    : null,
            }))
            setProducts(mappedProducts)

            await loadPublications(store.id)

            const { data: storeRatings } = await supabase
                .from('product_reviews')
                .select('id, rating, comment, is_anonymous, profile_id, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")')
                .eq('store_id', store.id)
                .order('created_at', { ascending: false })

            if (storeRatings) {
                const rows = (storeRatings || []).map((r: any) => ({
                    ...r,
                    profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
                    products: Array.isArray(r.products) ? r.products[0] : r.products,
                })) as RatingRow[]
                setRatings(rows)
            }

        } catch (err: any) {
            console.error('Erro ao carregar loja:', err)
            setError(err.message || 'Erro ao carregar loja')
        } finally {
            setLoading(false)
        }
    }, [ownerSlug, loadPublications])

    useEffect(() => {
        loadStoreData()
    }, [loadStoreData])

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

    // ========== RENDER ==========
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: colors.accent }}></div>
            </div>
        )
    }

    if (error || !owner) {
        return (
            <div className="min-h-[400px] flex items-center justify-center px-4">
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <AlertTriangle className="w-12 h-12" style={{ color: colors.accent }} />
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Loja não encontrada'}
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

    return (
        <div className="px-4 py-4 flex flex-col gap-5 max-w-5xl mx-auto">
            <style jsx global>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-15px) rotate(5deg); }
                }
                @keyframes pulse-glow-open {
                    0%, 100% { box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4), 0 0 0 6px rgba(16, 185, 129, 0.1); }
                    50% { box-shadow: 0 8px 24px rgba(16, 185, 129, 0.6), 0 0 0 12px rgba(16, 185, 129, 0); }
                }
                @keyframes pulse-glow-closed {
                    0%, 100% { box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4), 0 0 0 6px rgba(239, 68, 68, 0.1); }
                    50% { box-shadow: 0 8px 24px rgba(239, 68, 68, 0.6), 0 0 0 12px rgba(239, 68, 68, 0); }
                }
                @keyframes pulse-status {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.03); opacity: 0.85; }
                }
                .animate-pulse-glow-open {
                    animation: pulse-glow-open 2s ease-in-out infinite;
                }
                .animate-pulse-glow-closed {
                    animation: pulse-glow-closed 2s ease-in-out infinite;
                }
                .animate-pulse-status {
                    animation: pulse-status 2s ease-in-out infinite;
                }
                @keyframes slideDownAlert {
                    from {
                        opacity: 0;
                        transform: translateY(-20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                .animate-slide-down-alert {
                    animation: slideDownAlert 0.3s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out;
                }
            `}</style>

            {showScheduleModal && owner && (
                <div
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowScheduleModal(false)}
                >
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
                        <StoreSchedule
                            storeId={owner.id}
                            storeName={owner.name}
                            storeSlug={owner.slug}
                            onClose={() => setShowScheduleModal(false)}
                            onSuccess={() => {
                                loadStoreData()
                            }}
                        />
                    </div>
                </div>
            )}

            {/* ===== MODAL DE DETALHES DO PRODUTO ===== */}
            {showProductModal && selectedProduct && (
                <div
                    className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
                    onClick={() => setShowProductModal(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto"
                        style={{ background: colors.surface }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Detalhes do Produto
                            </h3>
                            <button
                                onClick={() => setShowProductModal(false)}
                                className="p-1 rounded-full hover:bg-black/5 transition"
                                style={{ color: colors.textSecondary }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Imagem */}
                        <div className="w-full aspect-square rounded-xl overflow-hidden mb-4" style={{ background: colors.accentLight }}>
                            {selectedProduct.image_url ? (
                                <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-sm font-medium" style={{ color: colors.textSecondary }}>
                                    Sem imagem
                                </div>
                            )}
                        </div>

                        {/* Nome */}
                        <h4 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                            {selectedProduct.name}
                        </h4>

                        {/* Preço */}
                        <div className="mt-2">
                            <span className="text-2xl font-extrabold" style={{ color: '#f97316' }}>
                                R$ {(selectedProduct.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            {selectedProduct.price_type === 'hourly' && (
                                <span className="text-sm ml-1 opacity-75" style={{ color: colors.textSecondary }}>/h</span>
                            )}
                        </div>

                        {/* Descrição */}
                        {selectedProduct.description && (
                            <div className="mt-3 p-3 rounded-xl" style={{ background: `${colors.surface}66`, border: `1px solid ${colors.border}` }}>
                                <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                                    {selectedProduct.description}
                                </p>
                            </div>
                        )}

                        {/* Info adicional */}
                        <div className="mt-4 space-y-2 text-xs" style={{ color: colors.textSecondary }}>
                            {selectedProduct.category && (
                                <div className="flex justify-between">
                                    <span>Categoria</span>
                                    <span className="font-bold" style={{ color: colors.textPrimary }}>{selectedProduct.category}</span>
                                </div>
                            )}
                            {selectedProduct.type && (
                                <div className="flex justify-between">
                                    <span>Tipo</span>
                                    <span className="font-bold" style={{ color: colors.textPrimary }}>
                                        {selectedProduct.type === 'physical' ? 'Físico' :
                                            selectedProduct.type === 'service' ? 'Serviço' : 'Digital'}
                                    </span>
                                </div>
                            )}
                            {selectedProduct.stock_quantity !== undefined && selectedProduct.stock_quantity !== null && (
                                <div className="flex justify-between">
                                    <span>Estoque</span>
                                    <span className="font-bold" style={{ color: colors.textPrimary }}>
                                        {selectedProduct.stock_quantity > 0 ? `${selectedProduct.stock_quantity} unidades` : 'Indisponível'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Status da loja */}
                        <div className="mt-4 p-3 rounded-xl text-center" style={{ background: 'rgba(239, 68, 68, 0.08)', border: `1px dashed #ef4444` }}>
                            <AlertCircle size={16} style={{ color: '#ef4444' }} className="inline mr-2" />
                            <span className="text-xs font-bold" style={{ color: '#ef4444' }}>
                                Loja fechada no momento
                            </span>
                            {nextAvailable && (
                                <span className="text-xs block mt-1" style={{ color: '#f97316' }}>
                                    Abre {nextAvailable.day} às {nextAvailable.open}
                                </span>
                            )}
                        </div>

                        {/* Botão fechar */}
                        <button
                            onClick={() => setShowProductModal(false)}
                            className="w-full mt-4 py-3 rounded-full font-black uppercase text-sm tracking-wider transition hover:scale-105 active:scale-95"
                            style={{ background: GRADIENT, color: '#ffffff' }}
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}

            {/* ===== ALERTA DE LOJA FECHADA ===== */}
            {showClosedAlert && !isStoreOpen && (
                <div
                    className="rounded-2xl p-4 animate-slide-down-alert"
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '2px solid #ef4444',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    <div className="flex items-start gap-3">
                        <AlertCircle size={20} style={{ color: '#ef4444' }} className="flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-bold" style={{ color: '#ef4444' }}>
                                Loja fechada no momento
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                {statusText}
                                {nextAvailable && (
                                    <span className="block mt-1 font-bold" style={{ color: '#f97316' }}>
                                        Abre {nextAvailable.day} às {nextAvailable.open}
                                    </span>
                                )}
                            </p>
                            <button
                                onClick={() => setShowClosedAlert(false)}
                                className="mt-2 text-[10px] font-bold uppercase hover:underline"
                                style={{ color: colors.textSecondary }}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== CARD DA LOJA ===== */}
            <div className="rounded-2xl p-6 space-y-4" style={cardStyle}>
                <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                        <div
                            className={`w-20 h-20 rounded-2xl p-[4px] ${isStoreOpen ? 'animate-pulse-glow-open' : 'animate-pulse-glow-closed'}`}
                            style={{
                                background: isStoreOpen
                                    ? 'linear-gradient(135deg, #10b981, #059669, #34d399)'
                                    : 'linear-gradient(135deg, #ef4444, #dc2626, #f87171)',
                            }}
                        >
                            <div className="w-full h-full rounded-2xl overflow-hidden bg-white flex items-center justify-center">
                                {imageUrl ? (
                                    <img src={imageUrl} alt={owner.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-2xl font-black" style={{ color: '#f97316' }}>
                                        {owner.name?.charAt(0) || '?'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black tracking-tight" style={{ color: colors.textPrimary }}>{owner.name}</h2>
                        <div className="flex flex-col gap-1 mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                            <div className="flex items-center gap-1">
                                <Eye size={12} />
                                <span className="font-bold">{totalVisitors} visitantes</span>
                            </div>
                            <button
                                onClick={() => {
                                    if (isOwner) {
                                        router.push(`/${ownerSlug}/editar-loja`)
                                    } else {
                                        if (owner.business_hours && Object.keys(owner.business_hours).length > 0) {
                                            setShowAllHours(true)
                                        }
                                    }
                                }}
                                className="flex items-center gap-1 font-bold hover:underline cursor-pointer w-fit"
                                style={{
                                    color: isStoreOpen ? '#10b981' : '#ef4444',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                }}
                            >
                                <Clock className="w-3.5 h-3.5" />
                                <span className="truncate max-w-[200px]">{statusText}</span>
                            </button>
                            {!isStoreOpen && nextAvailable && (
                                <span className="text-[10px] font-bold" style={{ color: '#f97316' }}>
                                    Abre {nextAvailable.day} às {nextAvailable.open}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {owner.description && (
                    <div className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                        {expandedDesc || owner.description.length <= DESC_LIMIT
                            ? owner.description
                            : `${owner.description.slice(0, DESC_LIMIT)}...`}
                        {owner.description.length > DESC_LIMIT && (
                            <button
                                onClick={() => setExpandedDesc(!expandedDesc)}
                                className="ml-1 font-bold text-xs uppercase hover:underline"
                                style={{ color: '#f97316' }}
                            >
                                {expandedDesc ? 'ver menos' : 'ver mais'}
                            </button>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                    {owner.address && (
                        <button
                            onClick={openGoogleMaps}
                            className="flex items-center gap-1 font-bold text-xs uppercase hover:underline"
                            style={{ color: '#f97316' }}
                        >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{owner.address.split(',')[0].trim()}</span>
                        </button>
                    )}

                    {owner.allow_scheduling && (
                        <button
                            onClick={() => {
                                setShowScheduleModal(true)
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold shadow-xl transition-all hover:scale-105 ${nextAvailable ? 'animate-pulse-status' : ''}`}
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                border: `1px solid #f97316`,
                                boxShadow: `0 8px 18px #f9731650`,
                            }}
                        >
                            <Calendar className="w-4 h-4" />
                            <span>
                                {nextAvailable
                                    ? `Agendar · ${nextAvailable.day} ${nextAvailable.open}`
                                    : 'Agendar'}
                            </span>
                        </button>
                    )}

                    {currentUserId && currentUserId !== owner.id && (
                        <button
                            onClick={handleFollowToggle}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 ${isFollowing ? 'border-2' : ''}`}
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

                    {whatsappLink && (
                        <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 flex items-center gap-2"
                            style={{ background: '#25D366', color: '#fff' }}
                        >
                            <MessageCircle className="w-4 h-4" />
                            WhatsApp
                        </a>
                    )}
                </div>

                {!isStoreOpen && (
                    <div
                        className="rounded-xl p-4 text-center"
                        style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: `1px dashed #ef4444`,
                        }}
                    >
                        <AlertCircle size={20} style={{ color: '#ef4444' }} className="mx-auto mb-2" />
                        <p className="text-xs font-bold" style={{ color: '#ef4444' }}>
                            Loja fechada no momento
                        </p>
                        {products.length > 0 ? (
                            <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>
                                Clique em um produto para ver mais detalhes
                            </p>
                        ) : (
                            <p className="text-[10px] mt-0.5" style={{ color: colors.textSecondary }}>
                                Essa loja ainda não possui produtos
                            </p>
                        )}
                        {nextAvailable && (
                            <p className="text-[10px] font-bold mt-1" style={{ color: '#f97316' }}>
                                Abre {nextAvailable.day} às {nextAvailable.open}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ===== TABS ===== */}
            <div className="flex rounded-2xl p-1.5 gap-1" style={cardStyle}>
                {[
                    { id: 'products', label: 'Produtos', count: products.length },
                    { id: 'publications', label: 'Publicações', count: publications.length },
                    { id: 'reviews', label: 'Avaliações', count: ratings.length },
                ].map(tab => {
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as TabType)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 ${isActive ? 'shadow-lg scale-[1.02]' : 'hover:bg-white/5'}`}
                            style={
                                isActive
                                    ? {
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 12px #f9731650`,
                                        border: 'none',
                                    }
                                    : {
                                        background: 'transparent',
                                        color: colors.textSecondary,
                                        border: '1px solid transparent',
                                    }
                            }
                        >
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                                <span className="text-[9px] font-bold opacity-70">({tab.count})</span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* ===== CONTEÚDO DAS TABS ===== */}
            <div className="space-y-4">
                {/* TAB PRODUTOS */}
                {activeTab === 'products' && (
                    <div className="rounded-2xl p-4" style={cardStyle}>
                        <div className="flex items-center gap-2 mb-3">
                            <ShoppingBag size={16} style={{ color: '#f97316' }} />
                            <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>
                                Produtos
                            </h3>
                            {!isStoreOpen && (
                                <span className="text-[8px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#ef444420', color: '#ef4444' }}>
                                    Fechado
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                                <input
                                    type="text"
                                    placeholder="Buscar produtos..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full rounded-xl py-2 pl-9 pr-3 text-sm border focus:outline-none focus:ring-2 transition-all"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                        borderColor: colors.border,
                                        color: colors.textPrimary,
                                        '--tw-ring-color': '#f97316',
                                    } as React.CSSProperties}
                                />
                            </div>
                            {isOwner && (
                                <button
                                    onClick={() => router.push(`/${ownerSlug}/criar-produto`)}
                                    className="flex items-center justify-center w-9 h-9 rounded-xl shadow-md hover:scale-110 transition-transform"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                    title="Adicionar produto"
                                >
                                    <Plus size={18} />
                                </button>
                            )}
                        </div>

                        {filteredProducts.length === 0 ? (
                            isOwner ? (
                                <div className="py-8 text-center rounded-xl" style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px dashed ${colors.border}`,
                                }}>
                                    <StoreIcon className="w-8 h-8 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Sua loja está vazia
                                    </p>
                                    <button
                                        onClick={() => router.push(`/${ownerSlug}/criar-produto`)}
                                        className="mt-3 w-full"
                                        style={primaryButtonStyle}
                                    >
                                        <Plus size={16} /> Adicionar Produto
                                    </button>
                                </div>
                            ) : (
                                <div className="py-8 text-center rounded-xl" style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px dashed ${colors.border}`,
                                }}>
                                    <Search className="w-8 h-8 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Nenhum produto disponível
                                    </p>
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        Esta loja ainda não publicou nada.
                                    </p>
                                </div>
                            )
                        ) : (
                            Object.entries(groupedProducts).map(([category, products]) => (
                                <div key={category} className="space-y-2 mt-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                        {category}
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {products.map(product => {
                                            const isSelected = mounted && cartItems.some((item: any) => item.product.id === product.id)
                                            const quantity = getProductQuantity(product.id)
                                            const isHourly = product.price_type === 'hourly'
                                            const hasImage = !!product.image_url
                                            const productIsDisabled = !isStoreOpen && !isOwner

                                            const handleProductInteraction = (e: React.MouseEvent) => {
                                                e.stopPropagation()
                                                handleProductClick(product, e)
                                            }

                                            if (!hasImage) {
                                                return (
                                                    <div
                                                        key={product.id}
                                                        onClick={(e) => handleProductClick(product, e)}
                                                        className={`col-span-2 rounded-xl overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${productIsDisabled ? 'cursor-pointer' : 'cursor-pointer'}`}
                                                        style={{
                                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                            borderColor: isSelected ? '#22c55e' : colors.border,
                                                        }}
                                                    >
                                                        <div className="p-3 flex flex-col justify-center min-w-0">
                                                            <h4 className="text-xs font-bold line-clamp-1" style={{ color: colors.textPrimary }}>
                                                                {product.name}
                                                            </h4>
                                                            <p className="text-[10px] line-clamp-1 mt-0.5 opacity-75" style={{ color: colors.textSecondary }}>
                                                                {product.description || 'Sem descrição'}
                                                            </p>
                                                            <div className="mt-2">
                                                                <div className="flex items-center">
                                                                    <span className="text-sm font-extrabold" style={{ color: '#f97316' }}>
                                                                        R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                    {isHourly && <span className="text-[10px] ml-1 opacity-75">/h</span>}
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 flex justify-end items-center">
                                                                {isOwner ? (
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); router.push(`/${ownerSlug}/${product.slug || product.id}/editar-produto`) }}
                                                                        className="w-7 h-7 rounded-full border flex items-center justify-center text-xs product-action-button"
                                                                        style={{ borderColor: colors.border, color: '#f97316' }}
                                                                    >
                                                                        <ExternalLink size={12} />
                                                                    </button>
                                                                ) : isSelected ? (
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
                                                                            className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-md hover:scale-110 transition-transform product-action-button"
                                                                            style={{
                                                                                background: GRADIENT,
                                                                                color: '#ffffff'
                                                                            }}
                                                                        >
                                                                            −
                                                                        </button>
                                                                        <span className="text-xs font-bold min-w-[16px] text-center" style={{ color: '#f97316' }}>
                                                                            {quantity}
                                                                        </span>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                increaseQuantity(product)
                                                                            }}
                                                                            className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-md hover:scale-110 transition-transform product-action-button"
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
                                                                            className="w-6 h-6 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform text-xs product-action-button"
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
                                                                        className="w-7 h-7 rounded-full text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform product-action-button"
                                                                        style={{ background: GRADIENT }}
                                                                    >
                                                                        {productIsDisabled ? <Info size={12} /> : <Plus size={12} />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            return (
                                                <div
                                                    key={product.id}
                                                    onClick={(e) => handleProductClick(product, e)}
                                                    className={`relative rounded-xl overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer`}
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        borderColor: isSelected ? '#22c55e' : colors.border,
                                                    }}
                                                >
                                                    <div className="aspect-square relative overflow-hidden" style={{ background: colors.accentLight }}>
                                                        {product.image_url ? (
                                                            <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-xs font-medium" style={{ color: colors.textSecondary }}>
                                                                Sem imagem
                                                            </div>
                                                        )}
                                                        {product.type && (
                                                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase backdrop-blur-md"
                                                                style={{ background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
                                                                {product.type === 'physical' ? 'Físico' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                            </span>
                                                        )}
                                                        {productIsDisabled && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                                                                <span className="text-[8px] font-black uppercase px-2 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(249, 115, 22, 0.9)', color: '#fff' }}>
                                                                    <Info size={10} /> Ver detalhes
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-2">
                                                        <h4 className="text-xs font-bold line-clamp-1" style={{ color: colors.textPrimary }}>
                                                            {product.name}
                                                        </h4>
                                                        <p className="text-[10px] line-clamp-1 mt-0.5 opacity-75" style={{ color: colors.textSecondary }}>
                                                            {product.description || 'Sem descrição'}
                                                        </p>
                                                        <div className="mt-2">
                                                            <div className="flex items-center">
                                                                <span className="text-sm font-extrabold" style={{ color: '#f97316' }}>
                                                                    R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                                {isHourly && <span className="text-[10px] ml-1 opacity-75">/h</span>}
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 flex justify-end items-center">
                                                            {isOwner ? (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); router.push(`/${ownerSlug}/${product.slug || product.id}/editar-produto`) }}
                                                                    className="w-7 h-7 rounded-full border flex items-center justify-center text-xs product-action-button"
                                                                    style={{ borderColor: colors.border, color: '#f97316' }}
                                                                >
                                                                    <ExternalLink size={12} />
                                                                </button>
                                                            ) : isSelected ? (
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
                                                                        className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-md hover:scale-110 transition-transform product-action-button"
                                                                        style={{
                                                                            background: GRADIENT,
                                                                            color: '#ffffff'
                                                                        }}
                                                                    >
                                                                        −
                                                                    </button>
                                                                    <span className="text-xs font-bold min-w-[16px] text-center" style={{ color: '#f97316' }}>
                                                                        {quantity}
                                                                    </span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            increaseQuantity(product)
                                                                        }}
                                                                        className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-md hover:scale-110 transition-transform product-action-button"
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
                                                                        className="w-6 h-6 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform text-xs product-action-button"
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
                                                                    className="w-7 h-7 rounded-full text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform product-action-button"
                                                                    style={{ background: GRADIENT }}
                                                                >
                                                                    {productIsDisabled ? <Info size={12} /> : <Plus size={12} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* TAB PUBLICAÇÕES */}
                {activeTab === 'publications' && (
                    <div className="rounded-2xl p-4" style={cardStyle}>
                        <div className="flex items-center gap-2 mb-3">
                            <Megaphone size={16} style={{ color: '#f97316' }} />
                            <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>
                                Publicações
                            </h3>
                        </div>

                        {pubLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                            </div>
                        ) : publications.length === 0 ? (
                            <div className="py-8 text-center rounded-xl" style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}>
                                <Megaphone className="w-8 h-8 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    Nenhuma publicação ainda
                                </p>
                                {isOwner && (
                                    <button
                                        onClick={() => setIsCreatingPublication(true)}
                                        className="mt-3 w-full"
                                        style={primaryButtonStyle}
                                    >
                                        <Megaphone size={16} /> Criar Publicação
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {publications.map(pub => {
                                        const imgUrl = getImageUrl(pub.image_url)
                                        const pubIdentifier = pub.slug || pub.id

                                        const handleOpenPub = () => {
                                            if (pubIdentifier) {
                                                router.push(`/${ownerSlug}/${pubIdentifier}`)
                                            } else {
                                                toast.error('Erro ao abrir esta publicação')
                                            }
                                        }

                                        return (
                                            <div
                                                key={pub.id}
                                                className="rounded-xl border p-2 flex flex-col gap-2 cursor-pointer hover:opacity-90 transition-all"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                }}
                                                onClick={handleOpenPub}
                                            >
                                                <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
                                                    {imgUrl ? (
                                                        <img src={imgUrl} className="w-full h-full object-cover" alt={pub.name} />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xs font-medium" style={{ color: colors.textSecondary }}>
                                                            Sem imagem
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {pub.name}
                                                </p>
                                                {isOwner && (
                                                    <div className="flex items-center justify-between mt-1" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => {
                                                                const editIdentifier = pub.slug || pub.id
                                                                if (editIdentifier) {
                                                                    router.push(`/${ownerSlug}/${editIdentifier}/editar-produto`)
                                                                }
                                                            }}
                                                            className="p-1 rounded hover:bg-white/10 transition-colors"
                                                            title="Editar"
                                                        >
                                                            <ExternalLink size={12} style={{ color: colors.textSecondary }} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeletePublication(pub.id)}
                                                            className="p-1 rounded hover:bg-red-50 transition-colors"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={12} style={{ color: '#ef4444' }} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {isOwner && !isCreatingPublication && (
                                    <button
                                        onClick={() => setIsCreatingPublication(true)}
                                        className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:bg-white/5 mt-3"
                                        style={{
                                            border: `1px dashed ${colors.border}`,
                                            color: '#f97316',
                                        }}
                                    >
                                        <Plus size={16} />
                                        Nova publicação
                                    </button>
                                )}
                            </>
                        )}

                        {isCreatingPublication && isOwner && (
                            <div
                                className="rounded-xl p-4 border space-y-4 animate-in slide-in-from-top-2 duration-200 mt-3"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    borderColor: colors.border,
                                }}
                            >
                                <h4 className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}>
                                    <Megaphone size={16} style={{ color: '#f97316' }} />
                                    Nova Publicação
                                </h4>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Imagem (opcional)
                                    </label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-24 h-24 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group"
                                    >
                                        {pubPreview ? (
                                            <img src={pubPreview} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <ImageIcon className="text-orange-400 group-hover:scale-110 transition-transform" size={24} />
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) setPubImageFile(file)
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Título da publicação
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Promoção de verão!"
                                        value={pubName}
                                        onChange={(e) => setPubName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Descrição
                                    </label>
                                    <textarea
                                        placeholder="Descreva sua novidade..."
                                        value={pubDescription}
                                        onChange={(e) => setPubDescription(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                </div>

                                {storeWhatsapp && (
                                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50/50 px-3 py-2 rounded-lg">
                                        <MessageCircle size={14} />
                                        <span>O cliente será direcionado para o WhatsApp da loja: <strong>{storeWhatsapp}</strong></span>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => {
                                            setIsCreatingPublication(false)
                                            setPubName('')
                                            setPubDescription('')
                                            setPubImageFile(null)
                                            setPubPreview(null)
                                        }}
                                        className="flex-1 py-2.5 rounded-lg font-bold text-sm border transition-colors"
                                        style={{
                                            borderColor: colors.border,
                                            color: colors.textSecondary,
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleCreatePublication}
                                        disabled={pubSaving || !pubName.trim()}
                                        className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                        style={{
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            color: '#ffffff',
                                        }}
                                    >
                                        {pubSaving ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <Send size={14} />
                                                Publicar
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB AVALIAÇÕES */}
                {activeTab === 'reviews' && (
                    <div className="rounded-2xl p-4" style={cardStyle}>
                        <div className="flex items-center gap-2 mb-3">
                            <Star size={16} style={{ color: '#f97316' }} />
                            <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>
                                Avaliações
                            </h3>
                            {ratingsStats && (
                                <span className="text-xs font-bold ml-auto" style={{ color: '#f97316' }}>
                                    {ratingsStats.avg} ★ ({ratingsStats.count})
                                </span>
                            )}
                        </div>

                        {ratings.length === 0 ? (
                            <div className="py-8 text-center rounded-xl" style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}>
                                <Star className="w-8 h-8 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nenhuma avaliação ainda</p>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Seja o primeiro a avaliar!</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                {ratings.map((rating: any) => {
                                    const avatarUrl = getAvatarUrl(supabase, rating.profiles?.avatar_url)
                                    return (
                                        <div key={rating.id} className="flex gap-3 p-3 rounded-xl border" style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            borderColor: colors.border,
                                        }}>
                                            <div className="w-8 h-8 rounded-xl p-[2px] shrink-0" style={{ background: GRADIENT }}>
                                                <div className="w-full h-full rounded-xl overflow-hidden bg-white flex items-center justify-center">
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="font-bold text-xs" style={{ color: '#f97316' }}>
                                                            {(rating.profiles?.name || '?').slice(0, 1).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                                        {rating.profiles?.name || 'Usuário'}
                                                    </p>
                                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                        {new Date(rating.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5">
                                                    <RatingStars value={rating.rating} size={12} />
                                                    {!rating.is_anonymous && rating.products?.name && (
                                                        <span className="ml-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase" style={{ background: '#f9731620', color: '#f97316' }}>
                                                            {rating.products.name}
                                                        </span>
                                                    )}
                                                </div>
                                                {rating.comment && (
                                                    <p className="text-xs italic mt-1 leading-relaxed" style={{ color: colors.textSecondary }}>
                                                        "{rating.comment}"
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
            </div>

            {/* ===== MODAL DE HORÁRIOS ===== */}
            {showAllHours && owner.business_hours && (
                <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAllHours(false)}>
                    <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" style={{ background: colors.surface }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Horários de Funcionamento</h3>
                            <button onClick={() => setShowAllHours(false)} className="text-2xl" style={{ color: colors.textSecondary }}>×</button>
                        </div>
                        <div className="space-y-2">
                            {[
                                { key: '1', label: 'Segunda-feira' },
                                { key: '2', label: 'Terça-feira' },
                                { key: '3', label: 'Quarta-feira' },
                                { key: '4', label: 'Quinta-feira' },
                                { key: '5', label: 'Sexta-feira' },
                                { key: '6', label: 'Sábado' },
                                { key: '0', label: 'Domingo' },
                            ].map(({ key, label }) => {
                                const weekly = (owner.business_hours as any)?.weekly
                                const dayConfig = weekly?.[key]
                                const todayKey = String(new Date().getDay())
                                const isToday = key === todayKey
                                return (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between py-2 border-b last:border-0"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <span
                                            className="text-sm font-bold"
                                            style={{ color: isToday ? '#f97316' : colors.textPrimary }}
                                        >
                                            {label}{isToday ? ' (hoje)' : ''}
                                        </span>
                                        {dayConfig?.isOpen && dayConfig.start && dayConfig.end ? (
                                            <span className="text-sm" style={{ color: colors.textSecondary }}>
                                                {dayConfig.start.slice(0, 5)} - {dayConfig.end.slice(0, 5)}
                                                {dayConfig.lunchStart && dayConfig.lunchEnd ? (
                                                    <span className="text-xs ml-2 opacity-70">
                                                        (almoço {dayConfig.lunchStart.slice(0, 5)}-{dayConfig.lunchEnd.slice(0, 5)})
                                                    </span>
                                                ) : null}
                                            </span>
                                        ) : (
                                            <span className="text-sm italic" style={{ color: colors.textSecondary }}>Fechado</span>
                                        )}
                                    </div>
                                )
                            })}
                            {((owner.business_hours as any)?.blocked_dates?.length > 0) && (
                                <div className="mt-4 pt-3 border-t" style={{ borderColor: colors.border }}>
                                    <p className="text-xs font-bold mb-2" style={{ color: colors.textSecondary }}>
                                        Datas fechadas:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(owner.business_hours as any).blocked_dates.map((d: string) => {
                                            const [y, mo, day] = d.split('-')
                                            return (
                                                <span
                                                    key={d}
                                                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                                                    style={{ background: '#ef444420', color: '#ef4444' }}
                                                >
                                                    {day}/{mo}/{y}
                                                </span>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}