// components/PublicationProfile.tsx
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import {
    ChevronDown,
    ChevronUp,
    Plus,
    Trash2,
    ExternalLink,
    MessageCircle,
    Megaphone,
    Eye,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Publication {
    id: string
    name: string
    description?: string
    image_url: string | null
    slug: string
    owner_id: string
    created_at: string
    view_count?: number
}

interface PublicationProfileProps {
    profileId: string
    profileSlug: string
}

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

const pillButtonFullStyle = {
    ...pillButtonStyle,
    width: '100%',
    padding: '0.75rem 1.25rem',
    fontSize: '0.875rem',
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

export default function PublicationProfile({ profileId, profileSlug }: PublicationProfileProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const router = useRouter()

    const [isExpanded, setIsExpanded] = useState(false)
    const [publications, setPublications] = useState<Publication[]>([])
    const [loading, setLoading] = useState(false)
    const [profileWhatsapp, setProfileWhatsapp] = useState<string | null>(null)

    useEffect(() => {
        if (!isExpanded || !profileId) return
        let isMounted = true

        const load = async () => {
            setLoading(true)
            try {
                // Buscar publicações do perfil (sem store_id)
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, description, image_url, slug, created_at')
                    .eq('owner_id', profileId)
                    .is('store_id', null)
                    .eq('listing_type', 'publication')
                    .order('created_at', { ascending: false })

                if (!error && data && isMounted) {
                    setPublications(data as Publication[])
                }

                // Buscar WhatsApp do perfil
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('whatsapp')
                    .eq('id', profileId)
                    .single()

                if (profileData && isMounted) {
                    setProfileWhatsapp(profileData.whatsapp || null)
                }
            } catch (err) {
                console.error('[PublicationProfile] Erro ao carregar:', err)
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        load()

        return () => { isMounted = false }
    }, [isExpanded, profileId])

    const handleDelete = async (id: string) => {
        if (!confirm('Deletar esta publicação?')) return
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (!error) {
            setPublications(prev => prev.filter(p => p.id !== id))
            toast.success('Publicação removida')
        } else {
            toast.error('Erro ao remover')
        }
    }

    const getImageUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    return (
        <div className="mb-6 mt-4">
            <div
                className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                {/* Cabeçalho com toggle - PILL */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                    style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '9999px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                            }}
                        >
                            <Megaphone size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                Minhas Publicações
                            </h3>
                            <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: textSecondary }}>
                                <span>{publications.length} publicação{publications.length !== 1 ? 'ões' : ''}</span>
                                {!profileWhatsapp && (
                                    <>
                                        <span>•</span>
                                        <span className="text-red-500 flex items-center gap-1">
                                            <Eye size={12} />
                                            WhatsApp não configurado
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {publications.length > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                {publications.length}
                            </span>
                        )}
                        {isExpanded ? (
                            <ChevronUp size={22} style={{ color: textSecondary }} />
                        ) : (
                            <ChevronDown size={22} style={{ color: textSecondary }} />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    <div className="flex flex-col gap-5">
                        {/* Botão Criar Publicação - PILL */}
                        <button
                            onClick={() => router.push(`/${profileSlug}/fazer-divulgacao`)}
                            style={{
                                ...pillButtonFullStyle,
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                            className="hover:scale-[1.02] transition-transform"
                        >
                            <Plus size={16} />
                            Criar Publicação
                        </button>

                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                            </div>
                        ) : publications.length === 0 ? (
                            <div
                                className="rounded-2xl p-6 text-center flex flex-col items-center gap-4"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px dashed ${colors.border}`,
                                }}
                            >
                                <div
                                    className="w-16 h-16 rounded-full flex items-center justify-center"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <MessageCircle size={28} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold" style={{ color: textPrimary }}>
                                        Você ainda não fez nenhuma publicação
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: textSecondary }}>
                                        Comece divulgando seus produtos ou serviços.
                                    </p>
                                </div>
                                {!profileWhatsapp && (
                                    <p className="text-xs text-red-500 flex items-center gap-1">
                                        <Eye size={12} />
                                        Configure seu WhatsApp no perfil para criar publicações.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {publications.map(pub => {
                                    const imgUrl = getImageUrl(pub.image_url)
                                    return (
                                        <div
                                            key={pub.id}
                                            className="rounded-2xl border p-3 flex flex-col gap-2 relative group"
                                            style={{
                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                borderColor: colors.border,
                                            }}
                                        >
                                            <div
                                                className="w-full aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer"
                                                onClick={() => router.push(`/${profileSlug}/${pub.slug}`)}
                                            >
                                                {imgUrl ? (
                                                    <img src={imgUrl} className="w-full h-full object-cover" alt={pub.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-4xl" style={{ color: textSecondary }}>
                                                        <MessageCircle size={32} />
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xs font-bold truncate" style={{ color: textPrimary }}>
                                                {pub.name}
                                            </p>
                                            <div className="flex items-center justify-between mt-auto">
                                                <button
                                                    onClick={() => router.push(`/${profileSlug}/${pub.slug}/editar-produto`)}
                                                    className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                                                    title="Editar"
                                                >
                                                    <ExternalLink size={14} style={{ color: textSecondary }} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(pub.id)}
                                                    className="p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={14} style={{ color: '#ef4444' }} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}