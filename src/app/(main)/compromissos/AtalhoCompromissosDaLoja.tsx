// components/AtalhoCompromissosDaLoja.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { Store, Megaphone, Plus, Sparkles, Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'

interface AtalhoCompromissosDaLojaProps {
    dragHandle?: ReactNode
    profileSlug?: string | null
}

interface StoreCard {
    id: string
    name: string
    logoUrl: string | null
    slug: string
    upcoming_appointments: number
}

function StoreAvatar({
    url,
    name,
    size = 48,
}: {
    url: string | null
    name: string
    size?: number
}) {
    const hasValidUrl = url && url.trim().length > 0

    if (hasValidUrl) {
        return (
            <img
                src={url}
                alt={name}
                style={{ width: size, height: size, borderRadius: 12, objectFit: 'cover' }}
                className="shadow-md"
                onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null
                    if (fallback) fallback.style.display = 'flex'
                }}
            />
        )
    }

    return (
        <div
            className="flex items-center justify-center text-white font-extrabold shadow-md"
            style={{
                width: size,
                height: size,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #f97316, #fbbf24)',
                fontSize: size * 0.35,
                display: hasValidUrl ? 'none' : 'flex',
            }}
        >
            {name?.charAt(0)?.toUpperCase() || '?'}
        </div>
    )
}

const shareStoreLink = async (profileSlug: string, storeSlug: string, storeName: string) => {
    const storeUrl = `${window.location.origin}/${profileSlug}/${storeSlug}`
    const shareText = `Conheça ${storeName} no iUser! Agende agora: ${storeUrl}`

    if (navigator.share) {
        try {
            await navigator.share({
                title: `Agende em ${storeName}`,
                text: shareText,
                url: storeUrl,
            })
        } catch (err) {
            console.log('Erro ao compartilhar:', err)
        }
    } else {
        const encoded = encodeURIComponent(shareText)
        const choice = window.confirm(
            `Deseja compartilhar o link da loja?\n\n"OK" para WhatsApp\n"Cancelar" para Facebook`
        )
        if (choice) {
            window.open(`https://wa.me/?text=${encoded}`, '_blank')
        } else {
            window.open(
                `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storeUrl)}`,
                '_blank'
            )
        }
    }
}

export default function AtalhoCompromissosDaLoja({
    dragHandle,
    profileSlug,
}: AtalhoCompromissosDaLojaProps) {
    const { colors } = useTheme()
    const [userId, setUserId] = useState<string | null>(null)
    const [stores, setStores] = useState<StoreCard[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const { data: sessionData } = await supabase.auth.getSession()
                const user = sessionData?.session?.user
                if (!user) {
                    setUserId(null)
                    setStores([])
                    setLoading(false)
                    return
                }
                setUserId(user.id)

                const { data: storeData, error: storeError } = await supabase
                    .from('stores')
                    .select('id, name, storeSlug, logo_url')
                    .eq('owner_id', user.id)

                if (storeError || !storeData || storeData.length === 0) {
                    setStores([])
                    setLoading(false)
                    return
                }

                const storeIds = storeData.map((s) => s.id)
                let countByStore: Record<string, number> = {}
                if (storeIds.length > 0) {
                    const today = new Date().toISOString().split('T')[0]
                    const { data: appointments, error: apptError } = await supabase
                        .from('appointments')
                        .select('store_id')
                        .in('store_id', storeIds)
                        .eq('status', 'confirmed')
                        .gte('date', today)

                    if (!apptError && appointments) {
                        appointments.forEach((a) => {
                            countByStore[a.store_id] = (countByStore[a.store_id] || 0) + 1
                        })
                    }
                }

                const enhancedStores: StoreCard[] = storeData.map((s) => {
                    let publicLogoUrl: string | null = null
                    if (s.logo_url) {
                        const { data } = supabase.storage
                            .from('store-logos')
                            .getPublicUrl(s.logo_url)
                        publicLogoUrl = data.publicUrl
                    }
                    return {
                        id: s.id,
                        name: s.name,
                        logoUrl: publicLogoUrl,
                        slug: s.storeSlug,
                        upcoming_appointments: countByStore[s.id] || 0,
                    }
                })

                setStores(enhancedStores)
            } catch (err) {
                console.error('Erro geral:', err)
                setStores([])
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '')
        const bigint = parseInt(clean, 16)
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        }
    }

    const surfaceRgb = hexToRgb(colors.surface)
    const cardBg = `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`

    const hasAnyAppointments = stores.some((s) => s.upcoming_appointments > 0)

    if (loading) {
        return (
            <section>
                <div className="flex items-center gap-2 mb-4">
                    {dragHandle}
                    <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                        Agenda das suas lojas
                    </h2>
                </div>
                <div className="flex flex-col gap-3">
                    {[1, 2].map((i) => (
                        <div
                            key={i}
                            className="h-24 rounded-xl animate-pulse w-full"
                            style={{ background: cardBg }}
                        />
                    ))}
                </div>
            </section>
        )
    }

    return (
        <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    {dragHandle}
                    <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>
                        Agenda das suas lojas
                    </h2>
                </div>
                {stores.length > 0 && hasAnyAppointments && (
                    <Link
                        href="/lojas"
                        className="text-xs font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
                        style={{
                            background: colors.accentLight,
                            color: colors.accent,
                        }}
                    >
                        Ver todas
                    </Link>
                )}
            </div>

            {stores.length === 0 ? (
                <div
                    className="rounded-2xl p-6 flex flex-row items-center gap-4"
                    style={{
                        background: cardBg,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${colors.border}`,
                    }}
                >
                    <Store className="w-8 h-8 flex-shrink-0" style={{ color: colors.textSecondary }} />
                    <p className="text-sm font-medium flex-1" style={{ color: colors.textSecondary }}>
                        Você ainda não cadastrou nenhuma loja.
                    </p>
                    <Link
                        href="/lojas/nova"
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm transition-colors shadow-lg"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <Plus size={16} /> Criar loja
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {stores.map((store) => {
                        const logoSource = store.logoUrl

                        if (store.upcoming_appointments > 0) {
                            return (
                                <div
                                    key={store.id}
                                    className="flex items-center gap-4 p-4 rounded-2xl border transition-all hover:shadow-xl"
                                    style={{
                                        background: cardBg,
                                        backdropFilter: 'blur(12px)',
                                        WebkitBackdropFilter: 'blur(12px)',
                                        borderColor: colors.border,
                                        boxShadow: colors.shadow,
                                    }}
                                >
                                    <StoreAvatar url={logoSource} name={store.name} size={48} />
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-base truncate" style={{ color: colors.textPrimary }}>
                                            {store.name}
                                        </h3>
                                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                            <Sparkles size={12} style={{ color: colors.accent }} />
                                            {store.upcoming_appointments} agendamento(s) futuro(s)
                                        </p>
                                    </div>
                                    <Link
                                        href={`/lojas/${store.id}/promover`}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-xs transition-all shadow-md whitespace-nowrap"
                                        style={{ background: colors.accent, color: colors.accentText }}
                                    >
                                        <Megaphone size={14} />
                                        Divulgar
                                    </Link>
                                </div>
                            )
                        }

                        return (
                            <div
                                key={store.id}
                                className="rounded-2xl p-5 border transition-all hover:shadow-xl"
                                style={{
                                    background: cardBg,
                                    backdropFilter: 'blur(12px)',
                                    WebkitBackdropFilter: 'blur(12px)',
                                    borderColor: colors.border,
                                    boxShadow: colors.shadow,
                                }}
                            >
                                <div className="flex items-start gap-4 mb-3">
                                    <StoreAvatar url={logoSource} name={store.name} size={48} />
                                    <div className="flex-1">
                                        <h3 className="font-bold text-base" style={{ color: colors.textPrimary }}>
                                            {store.name}
                                        </h3>
                                        <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                                            Nenhum agendamento ainda
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                                    🚀 Sua loja está pronta para decolar!<br />
                                    Compartilhe o link da sua loja e comece a receber clientes agora mesmo.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => {
                                            if (!profileSlug) {
                                                alert(
                                                    'Complete seu perfil público antes de compartilhar. Acesse Configurações > Perfil.'
                                                )
                                                return
                                            }
                                            shareStoreLink(profileSlug, store.slug, store.name)
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-xs transition-all shadow-md"
                                        style={{ background: colors.accent, color: colors.accentText }}
                                    >
                                        <Share2 size={14} />
                                        Compartilhar loja
                                    </button>
                                    <Link
                                        href={`/lojas/${store.id}/promover`}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-xs transition-all shadow-md"
                                        style={{
                                            background: 'transparent',
                                            border: `1px solid ${colors.accent}`,
                                            color: colors.accent,
                                        }}
                                    >
                                        <Megaphone size={14} />
                                        Ver dicas
                                    </Link>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}