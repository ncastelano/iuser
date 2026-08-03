// app/(main)/publicacoes/[slug]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Store,
    Eye,
    Calendar,
    User,
    Heart,
    Share2,
    Clock,
    MapPin,
    Loader2,
    AlertCircle,
    ArrowRight,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'

// ===== GRADIENTE =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== TIPOS =====
interface PublicationDetail {
    id: string
    name: string
    description: string | null
    image_url: string | null
    view_count: number
    created_at: string
    price: number | null
    listing_type: string
    store: {
        id: string
        name: string
        storeSlug: string
        logo_url: string | null
        address: string | null
        business_hours: any
        whatsapp: string | null
    }
}

// ===== COMPONENTE =====
export default function PublicationPage({ params }: { params: { slug: string } }) {
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [publication, setPublication] = useState<PublicationDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isLiked, setIsLiked] = useState(false)
    const [isSharing, setIsSharing] = useState(false)

    // ===== BUSCAR PUBLICAÇÃO =====
    useEffect(() => {
        // Verifica se params e slug existem
        if (!params || !params.slug) {
            setError('Publicação não encontrada')
            setLoading(false)
            return
        }

        const fetchPublication = async () => {
            setLoading(true)
            setError(null)

            try {
                const slug = params.slug
                console.log('🔍 Buscando publicação com ID:', slug)

                // Busca a publicação pelo ID
                const { data: productData, error: productError } = await supabase
                    .from('products')
                    .select(`
                        id,
                        name,
                        description,
                        image_url,
                        view_count,
                        created_at,
                        price,
                        listing_type,
                        store_id,
                        is_active
                    `)
                    .eq('id', slug)
                    .single()

                if (productError) {
                    console.error('❌ Erro ao buscar produto:', productError)
                    throw new Error('Publicação não encontrada')
                }

                if (!productData) {
                    throw new Error('Publicação não encontrada')
                }

                console.log('✅ Produto encontrado:', productData)

                // Verifica se é uma publicação
                if (productData.listing_type !== 'publication') {
                    throw new Error('Este produto não é uma publicação')
                }

                // Busca os dados da loja
                const { data: storeData, error: storeError } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, logo_url, address, business_hours, whatsapp')
                    .eq('id', productData.store_id)
                    .single()

                if (storeError) {
                    console.warn('⚠️ Erro ao buscar loja:', storeError)
                }

                // Incrementa visualização
                try {
                    await supabase
                        .from('products')
                        .update({ view_count: (productData.view_count || 0) + 1 })
                        .eq('id', productData.id)
                    console.log('✅ Visualização incrementada')
                } catch (viewErr) {
                    console.warn('⚠️ Erro ao incrementar visualização:', viewErr)
                }

                // Formata os dados
                const formattedPublication: PublicationDetail = {
                    ...productData,
                    image_url: productData.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl
                        : null,
                    store: storeData ? {
                        ...storeData,
                        logo_url: storeData.logo_url
                            ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
                            : null,
                    } : {
                        id: '',
                        name: 'Loja não encontrada',
                        storeSlug: '#',
                        logo_url: null,
                        address: null,
                        business_hours: null,
                        whatsapp: null,
                    }
                }

                setPublication(formattedPublication)
            } catch (err: any) {
                console.error('❌ Erro ao carregar publicação:', err)
                setError(err.message || 'Erro ao carregar publicação')
                toast.error(err.message || 'Erro ao carregar publicação')
            } finally {
                setLoading(false)
            }
        }

        fetchPublication()
    }, [params?.slug]) // ← CORRIGIDO: usando params?.slug

    // ===== FORMATAR DATA =====
    const formattedDate = publication?.created_at
        ? new Date(publication.created_at).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
        : ''

    // ===== HANDLE BACK =====
    const handleBack = () => {
        router.back()
    }

    // ===== HANDLE STORE CLICK =====
    const handleStoreClick = () => {
        if (publication?.store?.storeSlug && publication.store.storeSlug !== '#') {
            router.push(`/${publication.store.storeSlug}`)
        }
    }

    // ===== HANDLE SHARE =====
    const handleShare = async () => {
        setIsSharing(true)
        try {
            if (navigator.share) {
                await navigator.share({
                    title: publication?.name || 'Publicação',
                    text: publication?.description || '',
                    url: window.location.href,
                })
            } else {
                await navigator.clipboard.writeText(window.location.href)
                toast.success('Link copiado para a área de transferência!')
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                console.error('Erro ao compartilhar:', err)
            }
        } finally {
            setIsSharing(false)
        }
    }

    // ===== LOADING =====
    if (loading) {
        return (
            <div className="relative min-h-dvh" style={{ background: colors.background }}>
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
                <main className="relative z-10 min-h-dvh">
                    <Header
                        title="Publicação"
                        showBack={true}
                        onBack={handleBack}
                        profileSlug={profileSlug || undefined}
                    />
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.accent || '#f97316' }} />
                    </div>
                </main>
            </div>
        )
    }

    // ===== ERROR =====
    if (error || !publication) {
        return (
            <div className="relative min-h-dvh" style={{ background: colors.background }}>
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
                <main className="relative z-10 min-h-dvh">
                    <Header
                        title="Publicação"
                        showBack={true}
                        onBack={handleBack}
                        profileSlug={profileSlug || undefined}
                    />
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
                        <AlertCircle className="w-16 h-16" style={{ color: '#ef4444' }} />
                        <h2 className="text-xl font-bold" style={{ color: colors.textPrimary }}>
                            Oops! Algo deu errado
                        </h2>
                        <p className="text-sm max-w-md" style={{ color: colors.textSecondary }}>
                            {error || 'Publicação não encontrada'}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold transition hover:scale-105"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                }}
                            >
                                Tentar novamente
                            </button>
                            <button
                                onClick={handleBack}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold transition hover:scale-105"
                                style={{
                                    background: 'transparent',
                                    color: colors.textSecondary,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                Voltar
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        )
    }

    // ===== RENDER =====
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Publicação"
                    showBack={true}
                    onBack={handleBack}
                    profileSlug={profileSlug || undefined}
                />

                <article className="max-w-4xl mx-auto px-4 md:px-6 py-6">
                    {/* Imagem principal */}
                    <div className="relative rounded-2xl overflow-hidden mb-6 shadow-xl"
                        style={{ aspectRatio: '16/9' }}>
                        {publication.image_url ? (
                            <img
                                src={publication.image_url}
                                alt={publication.name}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center"
                                style={{ background: GRADIENT, opacity: 0.3 }}>
                                <Store className="w-20 h-20 opacity-30" style={{ color: colors.textPrimary }} />
                            </div>
                        )}

                        {/* Badge de visualizações */}
                        {publication.view_count > 0 && (
                            <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full text-[10px] font-medium flex items-center gap-1.5 backdrop-blur-sm"
                                style={{
                                    background: 'rgba(0,0,0,0.6)',
                                    color: '#fff',
                                }}
                            >
                                <Eye className="w-3.5 h-3.5" />
                                {publication.view_count} visualizações
                            </div>
                        )}

                        {/* Badge de data */}
                        {formattedDate && (
                            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-[10px] font-medium flex items-center gap-1.5 backdrop-blur-sm"
                                style={{
                                    background: 'rgba(0,0,0,0.6)',
                                    color: '#fff',
                                }}
                            >
                                <Calendar className="w-3.5 h-3.5" />
                                {formattedDate}
                            </div>
                        )}
                    </div>

                    {/* Conteúdo */}
                    <div className="space-y-6">
                        {/* Título e ações */}
                        <div className="flex items-start justify-between gap-4">
                            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: colors.textPrimary }}>
                                {publication.name}
                            </h1>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={() => setIsLiked(!isLiked)}
                                    className="p-2 rounded-full transition-all hover:scale-110"
                                    style={{
                                        background: isLiked ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                        color: isLiked ? '#ef4444' : colors.textSecondary,
                                    }}
                                >
                                    <Heart className="w-5 h-5" fill={isLiked ? '#ef4444' : 'none'} />
                                </button>
                                <button
                                    onClick={handleShare}
                                    disabled={isSharing}
                                    className="p-2 rounded-full transition-all hover:scale-110 disabled:opacity-50"
                                    style={{ color: colors.textSecondary }}
                                >
                                    <Share2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Informações da loja */}
                        {publication.store && publication.store.id && (
                            <div
                                onClick={handleStoreClick}
                                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${publication.store.storeSlug !== '#' ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'}`}
                                style={{
                                    background: `${colors.surface}66`,
                                    border: `1px solid ${colors.border}`,
                                }}
                            >
                                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2"
                                    style={{ borderColor: colors.border }}>
                                    {publication.store.logo_url ? (
                                        <img src={publication.store.logo_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center"
                                            style={{ background: colors.border }}>
                                            <Store size={18} style={{ color: colors.textSecondary }} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                                        {publication.store.name}
                                    </p>
                                    {publication.store.address && (
                                        <p className="text-[10px] flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                            <MapPin className="w-3 h-3" />
                                            {publication.store.address.split(',')[0]}
                                        </p>
                                    )}
                                </div>
                                {publication.store.storeSlug !== '#' && (
                                    <div className="text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1"
                                        style={{
                                            background: GRADIENT,
                                            color: '#ffffff',
                                        }}>
                                        Ver loja
                                        <ArrowRight className="w-3 h-3" />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Descrição */}
                        {publication.description && (
                            <div className="prose prose-sm max-w-none" style={{ color: colors.textPrimary }}>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                    {publication.description}
                                </p>
                            </div>
                        )}

                        {/* Rodapé da publicação */}
                        <div className="pt-4 border-t" style={{ borderColor: colors.border }}>
                            <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: colors.textSecondary }}>
                                <span className="flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    {publication.store.name || 'Autor desconhecido'}
                                </span>
                                {publication.created_at && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" />
                                        Publicado em {formattedDate}
                                    </span>
                                )}
                                {publication.view_count > 0 && (
                                    <span className="flex items-center gap-1">
                                        <Eye className="w-3.5 h-3.5" />
                                        {publication.view_count} visualizações
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </article>
            </main>
        </div>
    )
}