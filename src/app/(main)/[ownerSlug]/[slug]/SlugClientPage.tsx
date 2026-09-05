// app/(main)/[ownerSlug]/[slug]/SlugClientPage.tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { Spinner } from '@/components/Spinner'
import { useProfile } from '@/app/contexts/ProfileContext'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { ProductClientPage } from './ProductClientPage'
import { PublicationClientPage } from './PublicationClientePage'

type ItemType = 'publication' | 'product' | null

export default function SlugClientPage() {
    const params = useParams()
    const router = useRouter()
    const { colors } = useTheme()
    const { avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const ownerSlug = (Array.isArray(params.ownerSlug) ? params.ownerSlug[0] : params.ownerSlug) ?? ''
    const slug = (Array.isArray(params.slug) ? params.slug[0] : params.slug) ?? ''

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [itemType, setItemType] = useState<ItemType>(null)
    const [itemData, setItemData] = useState<any>(null)
    const [storeData, setStoreData] = useState<any>(null)

    useEffect(() => {
        const detectItemType = async () => {
            if (!slug || !ownerSlug) {
                setError('Parâmetros inválidos')
                setLoading(false)
                return
            }

            setLoading(true)
            setError(null)

            try {
                // Busca já com todos os campos que o ProductClientPage precisa,
                // pra não ter que refazer essa mesma query lá.
                const columns = 'id, name, slug, description, image_url, price, view_count, created_at, store_id, owner_id, listing_type'

                // Primeiro, tenta buscar pelo slug
                let { data: item, error: itemError } = await supabase
                    .from('products')
                    .select(columns)
                    .eq('slug', slug)
                    .maybeSingle()

                // Se não encontrou pelo slug, tenta pelo ID
                if (itemError || !item) {
                    const { data: itemById, error: byIdErr } = await supabase
                        .from('products')
                        .select(columns)
                        .eq('id', slug)
                        .maybeSingle()

                    if (byIdErr || !itemById) {
                        throw new Error('Item não encontrado')
                    }
                    item = itemById
                }

                let store: any = null

                // Verifica se o item pertence ao ownerSlug correto
                // Se for produto de loja, verifica se a loja pertence ao ownerSlug
                if (item.listing_type === 'sale' && item.store_id) {
                    const { data: storeRow, error: storeErr } = await supabase
                        .from('stores')
                        .select('id, name, storeSlug, logo_url, owner_id')
                        .eq('id', item.store_id)
                        .maybeSingle()

                    if (storeErr || !storeRow || storeRow.storeSlug !== ownerSlug) {
                        throw new Error('Produto não pertence a esta loja')
                    }
                    store = storeRow
                }
                // Se for publicação, verifica se o perfil pertence ao ownerSlug
                else if (item.listing_type === 'publication' && item.owner_id) {
                    const { data: profile, error: profileErr } = await supabase
                        .from('profiles')
                        .select('profileSlug')
                        .eq('id', item.owner_id)
                        .maybeSingle()

                    if (profileErr || !profile || profile.profileSlug !== ownerSlug) {
                        throw new Error('Publicação não pertence a este perfil')
                    }
                }

                setItemType(item.listing_type === 'publication' ? 'publication' : 'product')
                setItemData(item)
                setStoreData(store)

            } catch (err: any) {
                console.error('Erro ao detectar tipo do item:', err)
                setError(err.message || 'Item não encontrado')
            } finally {
                setLoading(false)
            }
        }

        detectItemType()
    }, [slug, ownerSlug])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: colors.background }}>
                <div className="text-center">
                    <Spinner size={48} color={colors.accent} className="mx-auto mb-4" />
                    <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Carregando...</p>
                </div>
            </div>
        )
    }

    if (error || !itemType || !itemData) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.background }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                    <div className="text-6xl">🔍</div>
                    <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>
                        {error || 'Item não encontrado'}
                    </h2>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                        O item que você está procurando não existe ou foi removido.
                    </p>
                    <button
                        onClick={() => router.push(`/${ownerSlug}`)}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition hover:scale-105"
                        style={{ background: colors.accent, color: '#fff' }}
                    >
                        Voltar para {ownerSlug}
                    </button>
                </div>
            </div>
        )
    }

    // Renderiza o componente correto baseado no tipo
    if (itemType === 'publication') {
        return (
            <div className="relative min-h-dvh" style={{ background: colors.background }}>
                {/* Background animado - igual ao OwnerClientPage */}
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>

                {/* Conteúdo com z-index */}
                <div className="relative z-10 min-h-dvh">
                    <PublicationClientPage
                        ownerSlug={ownerSlug}
                        slug={slug}
                        colors={colors}
                        bgMode={bgMode}
                        customBgUrl={customBgUrl}
                        profileSlug={profileSlug}
                        avatarUrl={avatarUrl}
                        profileLoading={profileLoading}
                    />
                </div>
            </div>
        )
    }

    if (itemType === 'product') {
        return (
            <div className="relative min-h-dvh" style={{ background: colors.background }}>

                {/* Background animado */}
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>


                {/* Conteúdo com z-index */}
                <div className="relative z-10 min-h-dvh">
                    <ProductClientPage
                        ownerSlug={ownerSlug}
                        slug={slug}
                        colors={colors}
                        bgMode={bgMode}
                        customBgUrl={customBgUrl}
                        profileSlug={profileSlug}
                        avatarUrl={avatarUrl}
                        profileLoading={profileLoading}
                        initialProduct={itemData}
                        initialStore={storeData}
                    />
                </div>
            </div>
        )
    }

    return null
}