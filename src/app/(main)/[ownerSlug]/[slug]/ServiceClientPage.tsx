// app/(main)/[ownerSlug]/[slug]/ServiceClientPage.tsx
//
// Página de um serviço publicado por um perfil (products.listing_type =
// 'service_offer'), no mesmo molde das páginas de publicação e de produto:
// /<perfil>/<slug-do-serviço>.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, MapPin, Share2, Calendar, Pencil, Navigation, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getAvatarUrl } from '@/lib/avatar'
import { getServiceIcon, getServiceLabel } from '@/lib/serviceTypes'
import { handleShareLink } from '@/lib/share'
import { getWhatsAppLink } from '@/lib/whatsapp'
import EditProductDialog from '@/components/EditProductDialog'
import { Spinner } from '@/components/Spinner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import PlanAvatarRing from '@/components/PlanAvatarRing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface ServiceData {
    id: string
    name: string
    slug: string
    description: string | null
    image_url: string | null
    view_count: number | null
    created_at: string
    owner_id: string | null
    service_type: string | null
    address: string | null
    lat: number | null
    lng: number | null
}

interface Provider {
    name: string | null
    profileSlug: string
    avatarUrl: string | undefined
    whatsapp: string | null
}

interface OtherService {
    id: string
    name: string
    slug: string
    image_url: string | null
}

interface ServiceClientPageProps {
    ownerSlug: string
    colors: any
    initialService: ServiceData
}

export function ServiceClientPage({ ownerSlug, colors, initialService }: ServiceClientPageProps) {
    const router = useRouter()
    const { userId } = useProfile()

    const [service, setService] = useState<ServiceData>(initialService)
    const [provider, setProvider] = useState<Provider | null>(null)
    const [others, setOthers] = useState<OtherService[]>([])
    const [loadingProvider, setLoadingProvider] = useState(true)
    const [showEdit, setShowEdit] = useState(false)

    const isOwner = !!userId && userId === service.owner_id

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            if (!service.owner_id) { setLoadingProvider(false); return }
            const [{ data: profile }, { data: more }] = await Promise.all([
                supabase.from('profiles').select('name, profileSlug, avatar_url, whatsapp').eq('id', service.owner_id).maybeSingle(),
                supabase
                    .from('products')
                    .select('id, name, slug, image_url')
                    .eq('owner_id', service.owner_id)
                    .eq('listing_type', 'service_offer')
                    .eq('is_active', true)
                    .neq('id', service.id)
                    .order('created_at', { ascending: false })
                    .limit(6),
            ])
            if (cancelled) return
            if (profile) {
                setProvider({
                    name: profile.name,
                    profileSlug: profile.profileSlug,
                    avatarUrl: getAvatarUrl(supabase, profile.avatar_url),
                    whatsapp: profile.whatsapp,
                })
            }
            setOthers((more || []) as OtherService[])
            setLoadingProvider(false)
        }
        load()
        return () => { cancelled = true }
    }, [service.id, service.owner_id])

    // Conta a visita (não conta o próprio dono olhando o serviço dele).
    useEffect(() => {
        if (userId === undefined || isOwner) return
        supabase.rpc('increment_product_view_count', { p_product_id: service.id }).then(
            () => { },
            () => { }
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [service.id, isOwner])

    const imageUrl = service.image_url
        ? (service.image_url.startsWith('http')
            ? service.image_url
            : supabase.storage.from('product-images').getPublicUrl(service.image_url).data.publicUrl)
        : null

    const Icon = getServiceIcon(service.service_type || 'outro')
    const typeLabel = service.service_type ? getServiceLabel(service.service_type) : 'Serviço'
    const providerName = provider?.name || `@${ownerSlug}`
    const views = service.view_count || 0

    const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
    const whatsappLink = provider?.whatsapp
        ? getWhatsAppLink(
            provider.whatsapp,
            encodeURIComponent(`Olá! Vi seu serviço "${service.name}" no iUser e gostaria de mais informações.\n${pageUrl}`)
        )
        : null
    const mapsLink = service.lat != null && service.lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${service.lat},${service.lng}`
        : null

    const card = { background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }

    return (
        <div className="relative min-h-dvh pb-10">
            {/* Barra do topo */}
            <div
                className="sticky top-0 z-30"
                style={{ background: colors.background, borderBottom: `1px solid ${colors.border}`, paddingTop: 'env(safe-area-inset-top)' }}
            >
                <div className="flex items-center gap-2 px-4 py-3 max-w-3xl mx-auto">
                    <button
                        onClick={() => router.push(`/${ownerSlug}`)}
                        aria-label="Voltar"
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition hover:scale-105"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="flex-1 min-w-0 truncate text-base font-black" style={{ color: colors.textPrimary }}>{service.name}</h1>
                    <button
                        onClick={() => handleShareLink({ title: service.name, text: `${service.name} — ${providerName} no iUser`, url: pageUrl })}
                        aria-label="Compartilhar"
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition hover:scale-105"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                    >
                        <Share2 size={18} />
                    </button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 pt-4 flex flex-col gap-4">
                {/* Capa */}
                <div className="relative w-full h-[28vh] min-h-[200px] max-h-[360px] rounded-3xl overflow-hidden">
                    {imageUrl ? (
                        <img src={imageUrl} alt={service.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT, opacity: 0.35 }}>
                            <Icon size={72} color="#fff" />
                        </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }} />
                    <span
                        className="absolute left-3 bottom-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wide text-white"
                        style={{ background: GRADIENT }}
                    >
                        <Icon size={12} />
                        {typeLabel}
                    </span>
                </div>

                {/* Título + números */}
                <div>
                    <h2 className="text-xl font-black leading-tight" style={{ color: colors.textPrimary }}>{service.name}</h2>
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs" style={{ color: colors.textSecondary }}>
                        <span className="flex items-center gap-1">
                            <Eye size={13} />
                            {views === 0 ? 'Ninguém viu ainda' : `${views} ${views === 1 ? 'pessoa viu' : 'pessoas viram'}`}
                        </span>
                        <span className="flex items-center gap-1">
                            <Calendar size={13} />
                            publicado {formatDistanceToNow(new Date(service.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                    </div>
                </div>

                {/* Quem oferece */}
                <button
                    onClick={() => router.push(`/${ownerSlug}`)}
                    className="rounded-2xl p-3 flex items-center gap-3 text-left transition hover:scale-[1.01]"
                    style={card}
                >
                    <PlanAvatarRing userId={service.owner_id}>
                    {provider?.avatarUrl ? (
                        <img src={provider.avatarUrl} className="w-12 h-12 rounded-full object-cover flex-shrink-0" alt="" />
                    ) : (
                        <span className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-base font-black text-white" style={{ background: GRADIENT }}>
                            {loadingProvider ? '' : providerName.replace('@', '').charAt(0).toUpperCase()}
                        </span>
                    )}
                    </PlanAvatarRing>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Quem oferece</p>
                        <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{providerName}</p>
                        <p className="text-xs truncate" style={{ color: colors.textSecondary }}>@{ownerSlug} · ver perfil</p>
                    </div>
                </button>

                {/* Sobre o serviço */}
                {service.description && (
                    <div className="rounded-2xl p-4" style={card}>
                        <h3 className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: colors.textSecondary }}>Sobre o serviço</h3>
                        <p className="text-sm whitespace-pre-line" style={{ color: colors.textPrimary }}>{service.description}</p>
                    </div>
                )}

                {/* Onde atende */}
                {service.address && (
                    <div className="rounded-2xl p-4 flex items-start gap-3" style={card}>
                        <MapPin size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                        <div className="min-w-0 flex-1">
                            <h3 className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: colors.textSecondary }}>Onde atende</h3>
                            <p className="text-sm" style={{ color: colors.textPrimary }}>{service.address}</p>
                        </div>
                        {mapsLink && (
                            <a
                                href={mapsLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black flex-shrink-0"
                                style={{ background: `${colors.accent}15`, color: colors.accent, border: `1px solid ${colors.border}` }}
                            >
                                <Navigation size={12} />
                                Ver no mapa
                            </a>
                        )}
                    </div>
                )}

                {/* Ações */}
                <div className="flex flex-col gap-2">
                    {whatsappLink && !isOwner && (
                        <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3.5 rounded-full font-black text-sm flex items-center justify-center gap-2 text-white transition hover:scale-[1.02] active:scale-95"
                            style={{ background: 'linear-gradient(135deg, #075e54, #25D366)' }}
                        >
                            <MessageCircle size={18} />
                            Chamar no WhatsApp
                        </a>
                    )}
                    {isOwner && (
                        <button
                            onClick={() => setShowEdit(true)}
                            className="w-full py-3.5 rounded-full font-black text-sm flex items-center justify-center gap-2 text-white transition hover:scale-[1.02] active:scale-95"
                            style={{ background: GRADIENT }}
                        >
                            <Pencil size={16} />
                            Editar meu serviço
                        </button>
                    )}
                </div>

                {/* Outros serviços de quem oferece */}
                {others.length > 0 && (
                    <div>
                        <h3 className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>Outros serviços de {providerName}</h3>
                        <div className="flex gap-3 overflow-x-auto pb-1">
                            {others.map((o) => {
                                const thumb = o.image_url
                                    ? (o.image_url.startsWith('http') ? o.image_url : supabase.storage.from('product-images').getPublicUrl(o.image_url).data.publicUrl)
                                    : null
                                return (
                                    <button
                                        key={o.id}
                                        onClick={() => router.push(`/${ownerSlug}/${o.slug}`)}
                                        className="flex-shrink-0 w-36 rounded-2xl overflow-hidden text-left transition hover:scale-[1.03]"
                                        style={card}
                                    >
                                        <div className="h-24 w-full" style={{ background: thumb ? undefined : `${colors.border}40` }}>
                                            {thumb && <img src={thumb} className="w-full h-full object-cover" alt="" />}
                                        </div>
                                        <p className="text-xs font-bold p-2 line-clamp-2" style={{ color: colors.textPrimary }}>{o.name}</p>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {loadingProvider && (
                    <div className="flex justify-center py-2"><Spinner size={18} color={colors.textSecondary} /></div>
                )}
            </div>

            {showEdit && (
                <EditProductDialog
                    productId={service.id}
                    colors={colors}
                    onClose={() => setShowEdit(false)}
                    onSaved={(updated) => {
                        setShowEdit(false)
                        if (updated?.slug && updated.slug !== service.slug) {
                            router.replace(`/${ownerSlug}/${updated.slug}`)
                        } else {
                            setService((prev) => ({ ...prev, ...updated }))
                        }
                    }}
                    onDeleted={() => router.push(`/${ownerSlug}`)}
                />
            )}
        </div>
    )
}
