// app/(main)/publicacoes/[slug]/page.tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ArrowLeft, Store, Calendar, Eye, User } from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'

// ===== TIPO PARA PUBLICAÇÃO COMPLETA =====
interface PublicationWithStore {
    id: string
    name: string
    slug: string
    description: string | null
    image_url: string | null
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

export default function PublicationDetailPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug

    const [loading, setLoading] = useState(true)
    const [publication, setPublication] = useState<PublicationWithStore | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchPublication = async () => {
            if (!slug) return

            setLoading(true)
            setError(null)

            try {
                // Primeiro, tenta buscar a publicação pelo slug
                let { data: pubData, error: pubErr } = await supabase
                    .from('products')
                    .select(`
                        id,
                        name,
                        slug,
                        description,
                        image_url,
                        view_count,
                        created_at,
                        store_id
                    `)
                    .eq('slug', slug)
                    .eq('listing_type', 'publication')
                    .maybeSingle()

                // Se não encontrou pelo slug, tenta pelo ID
                if (pubErr || !pubData) {
                    const { data: pubById, error: byIdErr } = await supabase
                        .from('products')
                        .select(`
                            id,
                            name,
                            slug,
                            description,
                            image_url,
                            view_count,
                            created_at,
                            store_id
                        `)
                        .eq('id', slug)
                        .eq('listing_type', 'publication')
                        .maybeSingle()

                    if (byIdErr || !pubById) {
                        throw new Error('Publicação não encontrada')
                    }

                    pubData = pubById
                }

                // Agora busca os dados da loja separadamente
                let publicationWithStore: PublicationWithStore = {
                    ...pubData,
                    store: null
                }

                if (pubData && pubData.store_id) {
                    const { data: storeData, error: storeErr } = await supabase
                        .from('stores')
                        .select(`
                            id,
                            name,
                            storeSlug,
                            logo_url,
                            owner_id
                        `)
                        .eq('id', pubData.store_id)
                        .maybeSingle()

                    if (!storeErr && storeData) {
                        // Busca o perfil do dono da loja
                        let profileData = null
                        if (storeData.owner_id) {
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('id, name, avatar_url, profileSlug')
                                .eq('id', storeData.owner_id)
                                .maybeSingle()
                            profileData = profile
                        }

                        publicationWithStore = {
                            ...pubData,
                            store: {
                                ...storeData,
                                profile: profileData
                            }
                        }
                    }
                }

                setPublication(publicationWithStore)

                // Incrementa contagem de visualizações (opcional)
                if (pubData?.id) {
                    await supabase
                        .from('products')
                        .update({ view_count: (pubData.view_count || 0) + 1 })
                        .eq('id', pubData.id)
                }

            } catch (err: any) {
                console.error('Erro ao carregar publicação:', err)
                setError(err.message || 'Publicação não encontrada')
            } finally {
                setLoading(false)
            }
        }

        fetchPublication()
    }, [slug])

    // ===== FUNÇÃO PARA IR PARA A LOJA =====
    const goToStore = () => {
        if (!publication?.store) return

        // Se a loja tem storeSlug, usa ele
        if (publication.store.storeSlug) {
            router.push(`/${publication.store.storeSlug}`)
            return
        }

        // Se a loja tem um perfil associado, usa o profileSlug
        if (publication.store.profile?.profileSlug) {
            router.push(`/${publication.store.profile.profileSlug}`)
            return
        }

        // Fallback: usa o ID da loja
        if (publication.store.id) {
            router.push(`/loja/${publication.store.id}`)
        }
    }

    // ===== DETERMINA O NOME E IMAGEM PARA EXIBIR =====
    const getStoreDisplayInfo = () => {
        if (!publication?.store) {
            return {
                name: 'Loja desconhecida',
                imageUrl: null,
                slug: null
            }
        }

        // Se tem profile, usa os dados do profile (prioridade)
        if (publication.store.profile) {
            return {
                name: publication.store.profile.name || publication.store.name,
                imageUrl: publication.store.profile.avatar_url || publication.store.logo_url,
                slug: publication.store.profile.profileSlug || publication.store.storeSlug
            }
        }

        // Se não tem profile, usa os dados da loja
        return {
            name: publication.store.name,
            imageUrl: publication.store.logo_url,
            slug: publication.store.storeSlug
        }
    }

    const storeDisplay = getStoreDisplayInfo()

    // ===== URL DA IMAGEM DA LOJA =====
    const storeImageUrl = storeDisplay.imageUrl
        ? supabase.storage.from('store-logos').getPublicUrl(storeDisplay.imageUrl).data.publicUrl
        : null

    // Se não tem imagem no storage, verifica se é uma URL direta (avatar_url pode ser URL completa)
    const finalStoreImage = storeImageUrl || storeDisplay.imageUrl || null

    if (loading) {
        return <LoadingSpinner message="Carregando publicação..." background={colors.background} />
    }

    if (error || !publication) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">🔍</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Publicação não encontrada'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        A publicação que você está procurando não existe ou foi removida.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={() => router.push('/publicacoes')}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                            style={{ background: colors.accent, color: '#fff' }}
                        >
                            Ver todas as publicações
                        </button>
                        <button
                            onClick={() => router.push('/')}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                            style={{ background: colors.border, color: colors.textPrimary }}
                        >
                            Voltar ao início
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const imageUrl = publication.image_url
        ? supabase.storage.from('product-images').getPublicUrl(publication.image_url).data.publicUrl
        : null

    const formattedDate = publication.created_at
        ? new Date(publication.created_at).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
        : ''

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Publicação"
                    showBack={true}
                    onBack={() => router.push('/publicacoes')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <div className="max-w-4xl mx-auto px-4 py-8">
                    <div className="rounded-2xl overflow-hidden border" style={{
                        background: colors.surface,
                        borderColor: colors.border,
                    }}>
                        {/* Imagem */}
                        {imageUrl ? (
                            <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                                <img
                                    src={imageUrl}
                                    alt={publication.name || 'Publicação'}
                                    className="w-full h-full object-cover"
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
                            {/* Cabeçalho - CLICÁVEL */}
                            <div
                                className="flex items-center gap-3 cursor-pointer group"
                                onClick={goToStore}
                            >
                                {/* Avatar da loja/perfil */}
                                <div
                                    className="w-12 h-12 rounded-full overflow-hidden border-2 flex-shrink-0 transition-all duration-300 group-hover:scale-105"
                                    style={{
                                        borderColor: colors.border,
                                    }}
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

                                {/* Nome da loja/perfil */}
                                <div className="min-w-0 flex-1">
                                    <h3
                                        className="font-bold truncate transition-colors duration-300 group-hover:text-opacity-70"
                                        style={{ color: colors.textPrimary }}
                                    >
                                        {storeDisplay.name}
                                        <span className="ml-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            →
                                        </span>
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: colors.textSecondary }}>
                                        <span className="flex items-center gap-1">
                                            <Calendar size={14} />
                                            {formattedDate}
                                        </span>
                                        {publication.view_count !== null && publication.view_count !== undefined && publication.view_count > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Eye size={14} />
                                                {publication.view_count} visualizações
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Ícone de redirecionamento */}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <User size={18} style={{ color: colors.accent }} />
                                </div>
                            </div>

                            {/* Título */}
                            <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>
                                {publication.name || 'Sem título'}
                            </h1>

                            {/* Descrição */}
                            {publication.description && (
                                <div className="p-4 rounded-xl" style={{ background: `${colors.border}30` }}>
                                    <p style={{ color: colors.textSecondary, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                                        {publication.description}
                                    </p>
                                </div>
                            )}

                            {/* Botões de ação */}
                            <div className="pt-4 flex flex-wrap gap-3">
                                <button
                                    onClick={() => router.push('/publicacoes')}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition hover:scale-105"
                                    style={{
                                        background: colors.border,
                                        color: colors.textPrimary,
                                    }}
                                >
                                    <ArrowLeft size={18} />
                                    Voltar para publicações
                                </button>

                                <button
                                    onClick={goToStore}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition hover:scale-105"
                                    style={{
                                        background: colors.accent,
                                        color: '#fff',
                                    }}
                                >
                                    <Store size={18} />
                                    Visitar {storeDisplay.name}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}