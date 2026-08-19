import { Metadata } from 'next'
import { supabase } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'

// ===== INTERFACES =====
interface ProfileData {
    id: string
    name: string
    profileSlug: string
    avatar_url: string | null
    bio: string | null
    phone: string | null
    email: string | null
    created_at: string
}

interface StoreData {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    description: string | null
    address: string | null
    phone: string | null
    email: string | null
    website: string | null
    instagram: string | null
    facebook: string | null
    twitter: string | null
    created_at: string
}

interface ProductData {
    id: string
    name: string
    slug: string
    description: string | null
    price: number | null
    image_url: string | null
    listing_type: string
    created_at: string
}

// ===== FUNÇÕES AUXILIARES =====
function getAvatarUrl(avatarPath: string | null): string | null {
    if (!avatarPath) return null
    try {
        if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
            return avatarPath
        }
        let cleanPath = avatarPath
        if (cleanPath.startsWith('avatars/')) cleanPath = cleanPath.replace('avatars/', '')
        if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1)
        const { data } = supabase.storage.from('avatars').getPublicUrl(cleanPath)
        return data.publicUrl
    } catch {
        return null
    }
}

function getPublicUrl(bucket: string, path: string | null): string | null {
    if (!path) return null
    try {
        if (path.startsWith('http://') || path.startsWith('https://')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data.publicUrl
    } catch {
        return null
    }
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
    })
}

// ===== METADADOS DINÂMICOS =====
export async function generateMetadata({ params }: { params: { ownerSlug: string } }): Promise<Metadata> {
    const { ownerSlug } = params

    try {
        // 1. Tentar buscar perfil
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('name, profileSlug, avatar_url, bio')
            .eq('profileSlug', ownerSlug)
            .single()

        if (profile) {
            let imageUrl = 'https://iuser.com.br/logo.png'
            if (profile.avatar_url) {
                try {
                    const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url)
                    imageUrl = data.publicUrl || 'https://iuser.com.br/logo.png'
                } catch {
                    imageUrl = 'https://iuser.com.br/logo.png'
                }
            }

            const title = `${profile.name || 'Usuário'} | iUser`
            const description = profile.bio || `Conheça o perfil de ${profile.name || 'usuário'} no iUser`

            return {
                title,
                description,
                openGraph: {
                    title,
                    description,
                    url: `https://iuser.com.br/${ownerSlug}`,
                    siteName: 'iUser',
                    images: [{
                        url: imageUrl,
                        width: 400,
                        height: 400,
                        alt: profile.name || 'Perfil',
                    }],
                    type: 'profile',
                },
                twitter: {
                    card: 'summary',
                    title,
                    description,
                    images: [imageUrl],
                },
            }
        }

        // 2. Se não encontrou perfil, tentar buscar loja
        const { data: store, error: storeErr } = await supabase
            .from('stores')
            .select('name, storeSlug, logo_url, description')
            .eq('storeSlug', ownerSlug)
            .single()

        if (store) {
            let imageUrl = 'https://iuser.com.br/logo.png'
            if (store.logo_url) {
                try {
                    const { data } = supabase.storage.from('store-logos').getPublicUrl(store.logo_url)
                    imageUrl = data.publicUrl || 'https://iuser.com.br/logo.png'
                } catch {
                    imageUrl = 'https://iuser.com.br/logo.png'
                }
            }

            const title = `${store.name || 'Loja'} | iUser`
            const description = store.description || `Conheça a loja ${store.name || 'loja'} no iUser`

            return {
                title,
                description,
                openGraph: {
                    title,
                    description,
                    url: `https://iuser.com.br/${ownerSlug}`,
                    siteName: 'iUser',
                    images: [{
                        url: imageUrl,
                        width: 400,
                        height: 400,
                        alt: store.name || 'Loja',
                    }],
                    type: 'website',
                },
                twitter: {
                    card: 'summary',
                    title,
                    description,
                    images: [imageUrl],
                },
            }
        }

        // 3. Não encontrou nada
        return {
            title: 'Perfil não encontrado | iUser',
            description: 'Este perfil ou loja não existe no iUser',
        }

    } catch (error) {
        console.error('[generateMetadata] Erro:', error)
        return {
            title: 'iUser | Perfil',
            description: 'Confira este perfil no iUser',
        }
    }
}

// ===== COMPONENTE PRINCIPAL =====
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Link from 'next/link'
import {
    User,
    Store,
    MapPin,
    Phone,
    Mail,
    Globe,
    Calendar,
    Package,
    ShoppingBag,
    Heart,
    Share2,
    Eye,
    Star,
} from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// Componente de Loading
function OwnerLoading() {
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>
            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Perfil"
                    showBack={true}
                    onBack={() => window.history.back()}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />
                <div className="max-w-7xl mx-auto px-4 py-8">
                    <div className="flex flex-col items-center space-y-4">
                        <div className="w-32 h-32 rounded-full" style={{ background: `${colors.border}30` }} />
                        <div className="h-8 w-48 rounded" style={{ background: `${colors.border}30` }} />
                        <div className="h-4 w-64 rounded" style={{ background: `${colors.border}25` }} />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full mt-8">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="aspect-square rounded-xl" style={{ background: `${colors.border}25` }} />
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

// Componente Principal
export default function OwnerPage({ params }: { params: { ownerSlug: string } }) {
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [store, setStore] = useState<StoreData | null>(null)
    const [products, setProducts] = useState<ProductData[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isProfile, setIsProfile] = useState(false)

    const ownerSlug = params.ownerSlug

    useEffect(() => {
        const fetchOwnerData = async () => {
            setLoading(true)
            setError(null)

            try {
                // 1. Tentar buscar perfil
                const { data: profileData, error: profileErr } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('profileSlug', ownerSlug)
                    .single()

                if (!profileErr && profileData) {
                    setIsProfile(true)
                    setProfile(profileData)

                    // Buscar produtos do perfil
                    const { data: productsData } = await supabase
                        .from('products')
                        .select('*')
                        .eq('owner_id', profileData.id)
                        .is('store_id', null)
                        .eq('is_active', true)
                        .order('created_at', { ascending: false })
                        .limit(12)

                    setProducts(productsData || [])
                    setLoading(false)
                    return
                }

                // 2. Se não encontrou perfil, buscar loja
                const { data: storeData, error: storeErr } = await supabase
                    .from('stores')
                    .select('*')
                    .eq('storeSlug', ownerSlug)
                    .single()

                if (!storeErr && storeData) {
                    setIsProfile(false)
                    setStore(storeData)

                    // Buscar produtos da loja
                    const { data: productsData } = await supabase
                        .from('products')
                        .select('*')
                        .eq('store_id', storeData.id)
                        .eq('is_active', true)
                        .order('created_at', { ascending: false })
                        .limit(12)

                    setProducts(productsData || [])
                    setLoading(false)
                    return
                }

                // 3. Não encontrou nada
                setError('Perfil ou loja não encontrado')

            } catch (error) {
                console.error('[OwnerPage] Erro:', error)
                setError('Erro ao carregar dados')
            } finally {
                setLoading(false)
            }
        }

        if (ownerSlug) {
            fetchOwnerData()
        }
    }, [ownerSlug])

    // Componente de ícone social
    const SocialIcon = ({ platform, url }: { platform: string; url: string | null }) => {
        if (!url) return null

        const getIcon = () => {
            switch (platform) {
                case 'instagram':
                    return (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                        </svg>
                    )
                case 'facebook':
                    return (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                    )
                case 'twitter':
                    return (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                    )
                default:
                    return <Globe size={20} />
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

    // Loading
    if (loading) {
        return <OwnerLoading />
    }

    // Error
    if (error) {
        return (
            <div className="relative min-h-dvh" style={{ background: colors.background }}>
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
                <main className="relative z-10 min-h-dvh">
                    <Header
                        title="Perfil"
                        showBack={true}
                        onBack={() => router.push('/')}
                        greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                        avatarUrl={avatarUrl}
                        loading={profileLoading}
                    />
                    <div className="flex items-center justify-center px-4 py-20">
                        <div className="text-center">
                            <User size={64} className="mx-auto mb-4 opacity-50" style={{ color: colors.textSecondary }} />
                            <h2 className="text-2xl font-bold mb-2" style={{ color: colors.textPrimary }}>
                                {error}
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

    // Dados do perfil/loja
    const name = profile?.name || store?.name || 'Usuário'
    const avatar = profile?.avatar_url ? getAvatarUrl(profile.avatar_url) :
        store?.logo_url ? getPublicUrl('store-logos', store.logo_url) : null
    const bio = profile?.bio || store?.description || null
    const phone = profile?.phone || store?.phone || null
    const email = profile?.email || store?.email || null
    const address = store?.address || null
    const website = store?.website || null
    const instagram = store?.instagram || null
    const facebook = store?.facebook || null
    const twitter = store?.twitter || null
    const createdDate = profile?.created_at || store?.created_at || ''

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title={name}
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <div className="max-w-7xl mx-auto px-4 py-8">
                    {/* Profile/Store Header */}
                    <div className="flex flex-col items-center text-center mb-12">
                        <div className="w-32 h-32 rounded-full overflow-hidden border-4 mb-4" style={{ borderColor: colors.border }}>
                            {avatar ? (
                                <img src={avatar} alt={name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                    {isProfile ? (
                                        <User size={48} className="text-white" />
                                    ) : (
                                        <Store size={48} className="text-white" />
                                    )}
                                </div>
                            )}
                        </div>

                        <h1 className="text-3xl font-bold" style={{ color: colors.textPrimary }}>
                            {name}
                        </h1>

                        {bio && (
                            <p className="mt-2 text-lg max-w-2xl" style={{ color: colors.textSecondary }}>
                                {bio}
                            </p>
                        )}

                        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                            {phone && (
                                <div className="flex items-center gap-1 text-sm" style={{ color: colors.textSecondary }}>
                                    <Phone size={16} />
                                    <span>{phone}</span>
                                </div>
                            )}
                            {email && (
                                <div className="flex items-center gap-1 text-sm" style={{ color: colors.textSecondary }}>
                                    <Mail size={16} />
                                    <span>{email}</span>
                                </div>
                            )}
                            {address && (
                                <div className="flex items-center gap-1 text-sm" style={{ color: colors.textSecondary }}>
                                    <MapPin size={16} />
                                    <span>{address}</span>
                                </div>
                            )}
                            {createdDate && (
                                <div className="flex items-center gap-1 text-sm" style={{ color: colors.textSecondary }}>
                                    <Calendar size={16} />
                                    <span>Membro desde {formatDate(createdDate)}</span>
                                </div>
                            )}
                        </div>

                        {/* Social Links (apenas para lojas) */}
                        {!isProfile && (website || instagram || facebook || twitter) && (
                            <div className="flex gap-2 mt-4">
                                {website && (
                                    <a
                                        href={website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                                        style={{ background: `${colors.border}30`, color: colors.textSecondary }}
                                    >
                                        <Globe size={20} />
                                    </a>
                                )}
                                <SocialIcon platform="instagram" url={instagram} />
                                <SocialIcon platform="facebook" url={facebook} />
                                <SocialIcon platform="twitter" url={twitter} />
                            </div>
                        )}

                        {/* Store stats */}
                        {!isProfile && store && (
                            <div className="flex gap-6 mt-4">
                                <div className="text-center">
                                    <p className="text-2xl font-bold" style={{ color: colors.textPrimary }}>
                                        {products.length}
                                    </p>
                                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                                        Produtos
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Products Grid */}
                    {products.length > 0 ? (
                        <div>
                            <h2 className="text-2xl font-bold mb-6" style={{ color: colors.textPrimary }}>
                                Produtos
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {products.map((product) => {
                                    const productImage = product.image_url ? getPublicUrl('product-images', product.image_url) : null
                                    return (
                                        <Link
                                            key={product.id}
                                            href={`/${ownerSlug}/${product.slug}`}
                                            className="group p-4 rounded-xl transition-all hover:scale-105 hover:shadow-lg"
                                            style={{
                                                background: colors.surface,
                                                border: `1px solid ${colors.border}`
                                            }}
                                        >
                                            <div className="aspect-square rounded-lg overflow-hidden mb-3" style={{ background: colors.background }}>
                                                {productImage ? (
                                                    <img
                                                        src={productImage}
                                                        alt={product.name}
                                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                                        <Package size={32} className="text-white/30" />
                                                    </div>
                                                )}
                                                {product.listing_type === 'sale' && (
                                                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-bold uppercase" style={{ background: GRADIENT, color: '#ffffff' }}>
                                                        Venda
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="font-medium text-sm line-clamp-1" style={{ color: colors.textPrimary }}>
                                                {product.name}
                                            </h3>
                                            <p className="font-bold text-sm" style={{ color: '#f97316' }}>
                                                {formatPrice(product.price)}
                                            </p>
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Package size={64} className="mx-auto mb-4 opacity-30" style={{ color: colors.textSecondary }} />
                            <p className="text-lg" style={{ color: colors.textSecondary }}>
                                {isProfile ? 'Este usuário ainda não tem produtos' : 'Esta loja ainda não tem produtos'}
                            </p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}