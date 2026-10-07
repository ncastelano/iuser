//app/(main)/inicio/sections/FeaturePublications.tsx
'use client'

import { useState, useEffect, useMemo, ReactNode } from 'react'
import { Store, ArrowRight, Megaphone } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useRouter } from 'next/navigation'
import { useNavProgressStore } from '@/store/useNavProgressStore'
import { supabase } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { HomeSectionHeader } from './HomeSectionKit'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ---------- Tipos ----------
interface PublicationCard {
    id: string
    slug: string
    imageUrl: string | null
    title: string | null
    ownerName: string
    ownerSlug: string
    ownerImageUrl: string | null
    ownerType: 'profile' | 'store'
    ownerId: string
    isProfileAvatar: boolean
}

// ---------- Props ----------
interface FeaturedPublicationsProps {
    dragHandle?: ReactNode
    title?: string
    maxItems?: number
    className?: string
    onPublicationClick?: (productId: string, slug: string) => void
}

// ---------- Hook de dados ----------
function usePublications() {
    const [publications, setPublications] = useState<PublicationCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchPublications = async () => {
            setLoading(true)
            try {
                const { data: publicationsList, error: pubErr } = await supabase
                    .from('products')
                    .select('id, slug, name, description, image_url, store_id, owner_id, listing_type')
                    .eq('listing_type', 'publication')
                    .eq('is_active', true)
                    .order('view_count', { ascending: false })
                    .limit(30)

                if (pubErr) {
                    console.error('[FeaturedPublications] Erro ao buscar publicações:', pubErr)
                    setLoading(false)
                    return
                }

                if (!publicationsList || publicationsList.length === 0) {
                    console.log('[FeaturedPublications] Nenhuma publicação encontrada')
                    setPublications([])
                    setLoading(false)
                    return
                }

                console.log(`[FeaturedPublications] ${publicationsList.length} publicações encontradas`)

                const withStore = publicationsList.filter(p => p.store_id)
                const withProfile = publicationsList.filter(p => p.owner_id && !p.store_id)

                const storeIds = [...new Set(withStore.map(p => p.store_id).filter(Boolean))] as string[]
                let storeMap = new Map()
                if (storeIds.length > 0) {
                    const { data: storesList } = await supabase
                        .from('stores')
                        .select('id, name, storeSlug, logo_url, owner_id')
                        .in('id', storeIds)

                    if (storesList) {
                        storeMap = new Map(storesList.map(s => [s.id, s]))
                    }
                }

                const profileIds = [...new Set([
                    ...withProfile.map(p => p.owner_id).filter(Boolean),
                    ...withStore.map(p => {
                        const store = storeMap.get(p.store_id)
                        return store?.owner_id
                    }).filter(Boolean)
                ])] as string[]

                let profileMap = new Map()
                if (profileIds.length > 0) {
                    const { data: profilesList } = await supabase
                        .from('profiles')
                        .select('id, name, avatar_url, profileSlug')
                        .in('id', profileIds)

                    if (profilesList) {
                        profileMap = new Map(profilesList.map(p => [p.id, p]))
                    }
                }

                const cards: PublicationCard[] = publicationsList.map(pub => {
                    let ownerType: 'profile' | 'store' = 'profile'
                    let ownerName = 'Usuário'
                    let ownerSlug = '#'
                    let ownerImageUrl: string | null = null
                    let isProfileAvatar = true
                    let ownerId = pub.owner_id || ''

                    if (pub.store_id) {
                        const store = storeMap.get(pub.store_id)
                        if (store) {
                            ownerType = 'store'
                            ownerName = store.name || 'Loja'
                            ownerSlug = store.storeSlug || '#'
                            ownerImageUrl = store.logo_url || null
                            isProfileAvatar = false
                            ownerId = store.owner_id || pub.owner_id || ''
                        } else {
                            if (pub.owner_id) {
                                const profile = profileMap.get(pub.owner_id)
                                if (profile) {
                                    ownerType = 'profile'
                                    ownerName = profile.name || 'Usuário'
                                    ownerSlug = profile.profileSlug || '#'
                                    ownerImageUrl = profile.avatar_url || null
                                    isProfileAvatar = true
                                    ownerId = profile.id
                                }
                            }
                        }
                    } else if (pub.owner_id) {
                        const profile = profileMap.get(pub.owner_id)
                        if (profile) {
                            ownerType = 'profile'
                            ownerName = profile.name || 'Usuário'
                            ownerSlug = profile.profileSlug || '#'
                            ownerImageUrl = profile.avatar_url || null
                            isProfileAvatar = true
                            ownerId = profile.id
                        }
                    }

                    const imageUrl = pub.image_url
                        ? supabase.storage.from('product-images').getPublicUrl(pub.image_url).data.publicUrl
                        : null

                    let finalOwnerImage: string | null = null

                    if (ownerImageUrl) {
                        if (isProfileAvatar) {
                            finalOwnerImage = getAvatarUrl(supabase, ownerImageUrl) || null
                        } else {
                            try {
                                const { data } = supabase.storage.from('store-logos').getPublicUrl(ownerImageUrl)
                                finalOwnerImage = data?.publicUrl || null
                            } catch {
                                finalOwnerImage = null
                            }
                        }
                    }

                    return {
                        id: pub.id,
                        slug: pub.slug || pub.id,
                        imageUrl,
                        title: pub.name || null,
                        ownerName,
                        ownerSlug,
                        ownerImageUrl: finalOwnerImage,
                        ownerType,
                        ownerId,
                        isProfileAvatar
                    }
                })

                console.log('[FeaturedPublications] Cards gerados:', cards.length)
                setPublications(cards)
            } catch (error) {
                console.error('[FeaturedPublications] Erro inesperado:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchPublications()
    }, [])

    return { publications, loading }
}

// ---------- Componente Principal ----------
// Grade 2 colunas no celular (4 cards); no web uma linha só — 4 colunas no
// tablet e 6 no desktop (os 2 últimos só aparecem lá), cards menores; imagem quadrada + rodapé com quem publicou — igual ao
// "Publicações" do /modelodehomepage.
export default function FeaturedPublications({
    dragHandle,
    title = 'Publicações em destaque',
    maxItems,
    className = '',
    onPublicationClick,
}: FeaturedPublicationsProps) {
    const router = useRouter()
    const startNavProgress = useNavProgressStore((s) => s.start)
    const { colors } = useTheme()

    const { publications, loading } = usePublications()

    const displayPublications = useMemo(() => {
        return maxItems && publications.length > maxItems
            ? publications.slice(0, maxItems)
            : publications
    }, [publications, maxItems])

    const hasPublications = displayPublications.length > 0

    const handlePublicationClick = (pub: PublicationCard) => {
        if (onPublicationClick) {
            onPublicationClick(pub.id, pub.slug)
            return
        }
        startNavProgress()
        router.push(`/publicacoes/${pub.slug || pub.id}`)
    }

    const handleViewAll = () => {
        startNavProgress()
        router.push('/publicacoes')
    }

    // ===== LOADING =====
    if (loading) {
        return (
            <div className={`w-full ${className}`}>
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <div className="h-6 rounded w-48 animate-pulse" style={{ background: `${colors.border}60` }} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: `${colors.border}30` }}>
                            <div className="w-full aspect-square" style={{ background: `${colors.border}40` }} />
                            <div className="p-3 h-10" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (!publications.length) return null

    // ===== RENDER =====
    // Grade 2 colunas, igual ao "Publicações" do /modelodehomepage: imagem
    // quadrada em cima, quem publicou num rodapé próprio (em vez de
    // sobrepor texto na imagem).
    return (
        <div className={`relative w-full ${className}`}>
            <HomeSectionHeader
                icon={Megaphone}
                title={title || 'Publicações em destaque'}
                subtitle={`${publications.length} ${publications.length === 1 ? 'publicação' : 'publicações'}`}
                dragHandle={dragHandle}
                action={hasPublications ? (
                    <button
                        onClick={handleViewAll}
                        className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-lg whitespace-nowrap flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                            boxShadow: `0 2px 8px rgba(249, 115, 22, 0.3)`,
                        }}
                    >
                        <span>Ver todas</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                ) : <span />}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {displayPublications.map((pub, index) => (
                    <div
                        key={pub.id}
                        onClick={() => handlePublicationClick(pub)}
                        className={`rounded-2xl overflow-hidden cursor-pointer group ${index >= 4 ? 'hidden lg:block' : ''}`}
                        style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                    >
                        <div className="w-full aspect-square relative overflow-hidden">
                            {pub.imageUrl ? (
                                <img
                                    src={pub.imageUrl}
                                    alt={pub.title || pub.ownerName}
                                    loading="lazy"
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                    <Store size={26} color="#fff" opacity={0.6} />
                                </div>
                            )}
                        </div>
                        <div className="p-2.5 flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                                {pub.ownerImageUrl ? (
                                    <img src={pub.ownerImageUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white font-bold text-[10px]" style={{ background: GRADIENT }}>
                                        {pub.ownerName?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{pub.ownerName}</p>
                                {pub.title && (
                                    <p className="text-[10px] opacity-50 truncate" style={{ color: colors.textPrimary }}>{pub.title}</p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}