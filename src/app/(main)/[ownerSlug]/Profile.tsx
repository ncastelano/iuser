// src/components/owner/Profile.tsx
'use client'

import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import {
    AlertTriangle,
    ArrowLeft,
    ShoppingBag,
    Megaphone,
    Star,
    MapPin,
    MessageCircle,
    Pencil,
    Plus,
    Search,
    X,
    Store,
    Clock,
    Trash2,
    Eye,
    Share2,
} from 'lucide-react'
import { RatingStars } from '@/components/ratings/RatingStars'
import { isProfileOpenNow, getProfileStatusText } from '@/lib/profileHours'
import { toast } from 'sonner'
import { getAvatarUrl } from '@/lib/avatar'
import { usePublicationsStore } from '@/store/usePublicationStore'
import { handleShareLink } from '@/lib/share'

interface ProfileProps {
    ownerSlug: string
    colors: any
    bgMode: string
    customBgUrl?: string | null
    loggedUserSlug?: string | null
}

interface OwnerData {
    id: string
    name: string
    slug: string
    type: 'profile'
    avatar_url?: string | null
    business_hours?: any
    description?: string | null
    address?: string | null
    whatsapp?: string | null
    view_count?: number
    ratings_avg?: number
    ratings_count?: number
    show_location?: boolean
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

type ProfileTab = 'products' | 'publications' | 'reviews'

export function Profile({ ownerSlug, colors, bgMode, customBgUrl, loggedUserSlug }: ProfileProps) {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [owner, setOwner] = useState<OwnerData | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [isFollowing, setIsFollowing] = useState(false)
    const [totalVisitors, setTotalVisitors] = useState(0)
    const [products, setProducts] = useState<any[]>([])
    const [publications, setPublications] = useState<any[]>([])
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const [stores, setStores] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState<ProfileTab>('products')
    const [searchQuery, setSearchQuery] = useState('')
    const [mounted, setMounted] = useState(false)
    const [showLocationModal, setShowLocationModal] = useState(false)
    const [manualAddress, setManualAddress] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [tempAddress, setTempAddress] = useState('')
    const [expandedDesc, setExpandedDesc] = useState(false)
    const DESC_LIMIT = 80

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

    const glassBg = 'rgba(255, 255, 255, 0.08)'
    const glassBgLight = 'rgba(255, 255, 255, 0.06)'

    useEffect(() => {
        setMounted(true)
    }, [])

    // ========== CARREGAR DADOS DO PERFIL ==========
    const loadProfileData = useCallback(async () => {
        if (!ownerSlug) {
            setError('Parâmetro inválido')
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            // Buscar perfil
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('profileSlug', ownerSlug)
                .maybeSingle()

            if (profileError || !profile) {
                setError('Perfil não encontrado')
                setLoading(false)
                return
            }

            // Buscar ratings do perfil
            const { data: ratingsData } = await supabase
                .from('product_reviews')
                .select('rating')
                .is('store_id', null)

            let avg = 0
            let count = 0
            if (ratingsData && ratingsData.length > 0) {
                count = ratingsData.length
                avg = ratingsData.reduce((sum, r) => sum + r.rating, 0) / count
            }

            const ownerData: OwnerData = {
                id: profile.id,
                name: profile.name,
                slug: profile.profileSlug,
                type: 'profile',
                avatar_url: profile.avatar_url,
                business_hours: profile.business_hours,
                description: profile.description,
                address: profile.address,
                whatsapp: profile.whatsapp,
                view_count: profile.view_count || 0,
                ratings_avg: avg,
                ratings_count: count,
                show_location: profile.show_location || false,
                location: profile.location,
            }

            setOwner(ownerData)
            setTotalVisitors(profile.view_count || 0)

            // Gerar URL da imagem
            if (profile.avatar_url) {
                const avatarUrl = getAvatarUrl(supabase, profile.avatar_url)
                setImageUrl(avatarUrl || null)
            }

            // Pegar usuário atual
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUserId(user?.id || null)
            setIsOwner(user?.id === profile.id)

            // Buscar seguidores e seguindo
            const [followersRes, followingRes, checkFollowRes] = await Promise.all([
                supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
                supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
                user ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', profile.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
            ])

            setFollowersCount(followersRes.count || 0)
            setFollowingCount(followingRes.count || 0)
            setIsFollowing(!!checkFollowRes.data)

            // Buscar lojas do perfil
            const { data: storesData } = await supabase
                .from('stores')
                .select('*')
                .eq('owner_id', profile.id)

            setStores(storesData || [])

            // Buscar produtos
            const { data: productsData } = await supabase
                .from('products')
                .select('*')
                .eq('owner_id', profile.id)
                .is('store_id', null)
                .eq('listing_type', 'sale')
                .order('created_at', { ascending: false })

            const mappedProducts = (productsData || []).map((product: any) => ({
                ...product,
                image_url: product.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
                    : null,
            }))
            setProducts(mappedProducts)

            // Buscar publicações
            const { data: publicationsData } = await supabase
                .from('products')
                .select('*')
                .eq('owner_id', profile.id)
                .is('store_id', null)
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })

            const mappedPublications = (publicationsData || []).map((pub: any) => ({
                ...pub,
                image_url: pub.image_url
                    ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                    : null,
            }))
            setPublications(mappedPublications)

            // Buscar ratings
            const { data: profileRatings } = await supabase
                .from('product_reviews')
                .select('id, rating, comment, is_anonymous, profile_id, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")')
                .is('store_id', null)
                .order('created_at', { ascending: false })

            if (profileRatings) {
                const rows = (profileRatings || []).map((r: any) => ({
                    ...r,
                    profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
                    products: Array.isArray(r.products) ? r.products[0] : r.products,
                })) as RatingRow[]
                setRatings(rows)
            }

        } catch (err: any) {
            console.error('Erro ao carregar perfil:', err)
            setError(err.message || 'Erro ao carregar perfil')
        } finally {
            setLoading(false)
        }
    }, [ownerSlug])

    useEffect(() => {
        loadProfileData()
    }, [loadProfileData])

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

    // ========== AVATAR ==========
    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !owner) return
        setUploadingAvatar(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${owner.id}-${Date.now()}.${fileExt}`
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true })
            if (uploadError) throw uploadError
            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
            const publicUrl = data.publicUrl
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', owner.id)
            if (updateError) throw updateError
            setImageUrl(publicUrl)
            setOwner({ ...owner, avatar_url: publicUrl })
            toast.success('Foto atualizada com sucesso!')
        } catch (err: any) {
            toast.error('Erro ao enviar foto: ' + err.message)
        } finally {
            setUploadingAvatar(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // ========== STATUS ==========
    const isOpen = useMemo(() => {
        if (!owner) return false
        return isProfileOpenNow(owner.business_hours)
    }, [owner])

    const statusText = useMemo(() => {
        if (!owner) return ''
        return getProfileStatusText(owner.business_hours)
    }, [owner])

    // ========== FILTRO ==========
    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const query = searchQuery.toLowerCase()
        return products.filter(p =>
            p.name?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query)
        )
    }, [products, searchQuery])

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
        return `https://wa.me/${owner.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi seu perfil no iUser e tenho interesse nos seus produtos/serviços.`)}`
    }, [owner])

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

    // ========== LOCALIZAÇÃO ==========
    const fetchSuggestions = useCallback(async (query: string) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&country=BR&limit=5`
            )
            const data = await res.json()
            setSuggestions(data.features || [])
        } catch (e) { console.error(e) }
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (manualAddress.length >= 4) fetchSuggestions(manualAddress)
        }, 500)
        return () => clearTimeout(timer)
    }, [manualAddress, fetchSuggestions])

    const selectSuggestion = (feature: any) => {
        const [lng, lat] = feature.center
        setSelectedLocation({ lat, lng })
        setTempAddress(feature.place_name)
        setManualAddress(feature.place_name)
        setSuggestions([])
    }

    const saveLocation = async () => {
        if (!tempAddress || !selectedLocation || !owner) return
        const { error } = await supabase.from('profiles').update({
            address: tempAddress,
            location: `POINT(${selectedLocation.lng} ${selectedLocation.lat})`,
            show_location: true,
        }).eq('id', owner.id)
        if (!error) {
            setOwner({ ...owner, address: tempAddress, show_location: true })
            setShowLocationModal(false)
            toast.success('Localização atualizada!')
        } else {
            toast.error('Erro ao salvar localização')
        }
    }

    const toggleLocationVisibility = async () => {
        if (!owner || !isOwner) return
        const next = !owner.show_location
        setOwner({ ...owner, show_location: next })
        await supabase.from('profiles').update({ show_location: next }).eq('id', owner.id)
    }

    const formatShortAddress = (addr: string) => {
        if (!addr) return ''
        const parts = addr.split(',')
        const street = parts[0]?.trim() || ''
        const num = parts[1]?.trim()?.split('-')[0] || ''
        const city = parts[2]?.trim()?.split('-')[0] || ''
        return `${street}${num ? `, ${num}` : ''}${city ? `, ${city}` : ''}`
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
            `}</style>

            {/* ===== CARD DO PERFIL (TUDO ACIMA DAS TABS) ===== */}
            <div className="rounded-2xl p-6 space-y-4" style={cardStyle}>
                {/* HEADER DO PERFIL */}
                <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 relative">
                        <div
                            className={`w-20 h-20 rounded-2xl p-[4px] ${isOpen ? 'animate-pulse-glow-open' : 'animate-pulse-glow-closed'}`}
                            style={{
                                background: isOpen
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

                        <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" style={{ display: 'none' }} />
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
                                        router.push(`/${ownerSlug}/editar`)
                                    }
                                }}
                                className="flex items-center gap-1 font-bold hover:underline cursor-pointer w-fit"
                                style={{
                                    color: isOpen ? '#10b981' : '#ef4444',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                }}
                            >
                                <Clock className="w-3.5 h-3.5" />
                                <span className="truncate max-w-[200px]">{isOpen ? 'Aberto' : 'Fechado'} • {statusText}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* DESCRIÇÃO */}
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

                {/* AÇÕES */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                    {owner.address && (
                        <button
                            onClick={() => {
                                const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(owner.address!)}`
                                window.open(url, '_blank')
                            }}
                            className="flex items-center gap-1 font-bold text-xs uppercase hover:underline"
                            style={{ color: '#f97316' }}
                        >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{formatShortAddress(owner.address)}</span>
                        </button>
                    )}

                    {currentUserId && currentUserId !== owner.id && (
                        <button
                            onClick={handleFollowToggle}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 ${isFollowing ? 'border-2' : ''
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

                    <button
                        onClick={() => handleShareLink({
                            title: owner.name,
                            text: owner.description || `Confira o perfil de ${owner.name} no iUser!`
                        })}
                        className="px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 flex items-center gap-2"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            border: 'none',
                            boxShadow: `0 4px 14px #f9731660`,
                        }}
                    >
                        <Share2 className="w-4 h-4" />
                        Compartilhar
                    </button>

                    {isOwner && (
                        <button
                            onClick={() => router.push(`/${ownerSlug}/editar`)}
                            className="px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 flex items-center gap-2"
                            style={{
                                background: glassBg,
                                color: colors.textSecondary,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <Pencil size={14} />
                            Editar
                        </button>
                    )}
                </div>
            </div>

            {/* ===== LOJAS DO PERFIL ===== */}
            {stores.length > 0 && (
                <div className="rounded-2xl p-4" style={cardStyle}>
                    <div className="flex items-center gap-2 mb-3">
                        <Store size={16} style={{ color: '#f97316' }} />
                        <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>
                            Minhas Lojas
                        </h3>
                    </div>
                    <div className="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory">
                        {stores.map((store) => (
                            <button
                                key={store.id}
                                onClick={() => router.push(`/${store.storeSlug}`)}
                                className="flex-shrink-0 w-[100px] snap-start rounded-xl p-3 flex flex-col items-center gap-2 hover:scale-105 transition-transform"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                <div className="w-10 h-10 rounded-full overflow-hidden" style={{ background: glassBgLight }}>
                                    {store.logo_url ? (
                                        <img src={supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl} className="w-full h-full object-cover" alt={store.name} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-sm font-black" style={{ color: colors.textSecondary }}>
                                            {store.name?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] font-bold truncate w-full text-center" style={{ color: colors.textPrimary }}>
                                    {store.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ===== TABS ===== */}
            <div className="flex rounded-2xl p-1.5 gap-1" style={cardStyle}>
                {[
                    { id: 'products', label: 'Produtos', count: products.length },
                    { id: 'publications', label: 'Publicações', count: publications.length },
                    { id: 'reviews', label: 'Avaliações', count: ratings.length },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as ProfileTab)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 ${activeTab === tab.id ? 'shadow-lg scale-[1.02]' : 'hover:bg-white/5'
                            }`}
                        style={
                            activeTab === tab.id
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
                ))}
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
                            <div className="py-8 text-center rounded-xl" style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}>
                                <ShoppingBag className="w-8 h-8 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    {isOwner ? 'Você ainda não tem produtos' : 'Nenhum produto disponível'}
                                </p>
                                {isOwner && (
                                    <button
                                        onClick={() => router.push(`/${ownerSlug}/criar-produto`)}
                                        className="mt-3 w-full"
                                        style={primaryButtonStyle}
                                    >
                                        <Plus size={16} /> Adicionar Produto
                                    </button>
                                )}
                            </div>
                        ) : (
                            Object.entries(groupedProducts).map(([category, products]) => (
                                <div key={category} className="space-y-2 mt-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f97316' }}>
                                        {category}
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {products.map(product => {
                                            return (
                                                <div
                                                    key={product.id}
                                                    onClick={() => router.push(`/${ownerSlug}/${product.slug || product.id}`)}
                                                    className="rounded-xl overflow-hidden border cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        borderColor: colors.border,
                                                    }}
                                                >
                                                    <div className="aspect-square relative overflow-hidden" style={{ background: colors.accentLight }}>
                                                        {product.image_url ? (
                                                            <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-3xl font-black" style={{ color: '#f97316' }}>
                                                                {product.name?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                        {product.type && (
                                                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase backdrop-blur-md"
                                                                style={{ background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
                                                                {product.type === 'physical' ? 'Físico' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="p-2">
                                                        <h4 className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                            {product.name}
                                                        </h4>
                                                        {product.price > 0 && (
                                                            <p className="text-xs font-black mt-0.5" style={{ color: '#f97316' }}>
                                                                R$ {product.price.toFixed(2)}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="px-2 pb-2 flex items-center justify-end gap-1">
                                                        {isOwner ? (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    router.push(`/${ownerSlug}/${product.slug || product.id}/editar`)
                                                                }}
                                                                className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                                                                style={{
                                                                    background: glassBg,
                                                                    color: colors.textSecondary,
                                                                    border: `1px solid ${colors.border}`,
                                                                }}
                                                            >
                                                                Editar
                                                            </button>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleShareLink({
                                                                            title: product.name,
                                                                            text: product.description || `Confira ${product.name} no iUser!`
                                                                        })
                                                                    }}
                                                                    className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                                                                    style={{
                                                                        background: GRADIENT,
                                                                        color: '#ffffff',
                                                                        border: 'none',
                                                                        boxShadow: `0 2px 8px #f9731660`,
                                                                    }}
                                                                >
                                                                    Compartilhar
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        router.push(`/${ownerSlug}/${product.slug || product.id}`)
                                                                    }}
                                                                    className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                                                                    style={{
                                                                        background: glassBg,
                                                                        color: colors.textSecondary,
                                                                        border: `1px solid ${colors.border}`,
                                                                    }}
                                                                >
                                                                    Ver
                                                                </button>
                                                            </>
                                                        )}
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

                        {publications.length === 0 ? (
                            <div className="py-8 text-center rounded-xl" style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px dashed ${colors.border}`,
                            }}>
                                <Megaphone className="w-8 h-8 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    {isOwner ? 'Você ainda não tem publicações' : 'Nenhuma publicação disponível'}
                                </p>
                                {isOwner && (
                                    <button
                                        onClick={() => router.push(`/${ownerSlug}/fazer-divulgacao`)}
                                        className="mt-3 w-full"
                                        style={primaryButtonStyle}
                                    >
                                        <Megaphone size={16} /> Fazer Publicação
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {publications.map((pub, idx) => (
                                    <div
                                        key={pub.id}
                                        className="rounded-xl border p-2 flex flex-col gap-2 cursor-pointer hover:opacity-90 transition-all"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            borderColor: colors.border,
                                        }}
                                        onClick={() => {
                                            if (!owner) return
                                            const feed = publications.map(p => ({
                                                id: p.id,
                                                name: p.name,
                                                slug: p.slug,
                                                description: p.description,
                                                image_url: p.image_url,
                                                listing_type: p.listing_type || 'publication',
                                                owner_id: owner.id,
                                                created_at: p.created_at,
                                                owner: {
                                                    id: owner.id,
                                                    name: owner.name,
                                                    slug: owner.slug,
                                                    avatar_url: imageUrl,
                                                },
                                                profiles: {
                                                    name: owner.name,
                                                    profileSlug: owner.slug,
                                                    avatar_url: imageUrl,
                                                }
                                            }))
                                            usePublicationsStore.getState().setPublicationFeed(feed, idx, ownerSlug)
                                            router.push(`/${ownerSlug}/${pub.slug}`)
                                        }}
                                    >
                                        <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100 relative">
                                            {pub.image_url ? (
                                                <img src={pub.image_url} className="w-full h-full object-cover" alt={pub.name} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center" style={{ color: colors.textSecondary }}>
                                                    <Megaphone size={24} />
                                                </div>
                                            )}
                                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-green-500 text-white shadow-md">
                                                Divulgação
                                            </span>
                                        </div>
                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {pub.name}
                                        </p>
                                        {isOwner ? (
                                            <div className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => router.push(`/${ownerSlug}/${pub.slug || pub.id}/editar`)}
                                                    className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                                                    style={{
                                                        background: glassBg,
                                                        color: colors.textSecondary,
                                                        border: `1px solid ${colors.border}`,
                                                    }}
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm('Deletar esta publicação?')) return
                                                        const { error } = await supabase.from('products').delete().eq('id', pub.id)
                                                        if (!error) {
                                                            setPublications(prev => prev.filter(p => p.id !== pub.id))
                                                            toast.success('Publicação removida')
                                                        } else {
                                                            toast.error('Erro ao remover')
                                                        }
                                                    }}
                                                    className="p-1 rounded hover:bg-red-50 transition-colors"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={12} style={{ color: '#ef4444' }} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleShareLink({
                                                        title: pub.name,
                                                        text: pub.description || `Confira ${pub.name} no iUser!`
                                                    })
                                                }}
                                                className="mt-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all hover:scale-105 w-fit"
                                                style={{
                                                    background: GRADIENT,
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    boxShadow: `0 2px 8px #f9731660`,
                                                }}
                                            >
                                                Compartilhar
                                            </button>
                                        )}
                                    </div>
                                ))}
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

            {/* ===== MODAL DE LOCALIZAÇÃO ===== */}
            {showLocationModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4" style={cardStyle}>
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>Sua Localidade</h2>
                            <button onClick={() => setShowLocationModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 transition" style={{ background: glassBgLight }}>
                                <X size={18} style={{ color: colors.textSecondary }} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Digite seu endereço"
                                value={manualAddress}
                                onChange={(e) => setManualAddress(e.target.value)}
                                className="w-full rounded-xl py-3 px-4 text-sm font-bold focus:outline-none transition"
                                style={{
                                    background: glassBgLight,
                                    border: `1px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                            />
                            {suggestions.length > 0 && (
                                <div className="rounded-xl overflow-hidden shadow-lg" style={cardStyle}>
                                    {suggestions.map((s, i) => (
                                        <div key={i} onClick={() => selectSuggestion(s)} className="p-3 hover:bg-white/10 cursor-pointer" style={{ borderBottom: `1px solid ${colors.border}` }}>
                                            <p className="text-[10px] font-bold mb-0.5" style={{ color: colors.textSecondary }}>Sugestão</p>
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{s.place_name}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button onClick={saveLocation} disabled={!tempAddress}
                                className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:scale-105 transition disabled:opacity-50"
                                style={{ background: GRADIENT, color: '#ffffff' }}>
                                Confirmar Endereço
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}