// components/ProfilePublication.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import {
    ChevronDown,
    ChevronUp,
    Plus,
    ImageIcon,
    Send,
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

interface ProfilePublicationProps {
    profileId: string
    profileSlug?: string
    isOwner?: boolean
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

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

export default function ProfilePublication({ profileId, profileSlug, isOwner = true }: ProfilePublicationProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [isExpanded, setIsExpanded] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [publications, setPublications] = useState<Publication[]>([])
    const [loading, setLoading] = useState(false)

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const [profileWhatsapp, setProfileWhatsapp] = useState<string | null>(null)

    useEffect(() => {
        if (!isExpanded || !profileId) return
        let isMounted = true

        const load = async () => {
            setLoading(true)
            try {
                // Buscar publicações do perfil usando owner_id
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, description, image_url, slug, created_at, view_count')
                    .eq('owner_id', profileId)
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
                console.error('[ProfilePublication] Erro ao carregar:', err)
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        load()

        return () => { isMounted = false }
    }, [isExpanded, profileId])

    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    const handleCreate = async () => {
        if (!name.trim()) {
            toast.error('Dê um nome à publicação')
            return
        }
        setSaving(true)
        try {
            let imagePath: string | null = null
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, imageFile)
                if (uploadError) throw uploadError
                imagePath = uploadData?.path ?? null
            }

            let slug = name
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, '')

            let isUnique = false
            let attempts = 0
            while (!isUnique && attempts < 10) {
                const { data: existing } = await supabase
                    .from('products')
                    .select('id')
                    .eq('slug', slug)
                    .eq('owner_id', profileId)
                    .eq('listing_type', 'publication')
                    .maybeSingle()
                if (existing) {
                    slug = slug + '-' + Math.floor(Math.random() * 9999)
                    attempts++
                } else {
                    isUnique = true
                }
            }

            // Usando owner_id (que é o profile_id) e store_id = null
            const { error: insertError } = await supabase.from('products').insert({
                name,
                slug,
                description: description || null,
                price: 0,
                type: 'physical',
                price_type: 'fixed',
                listing_type: 'publication',
                image_url: imagePath,
                owner_id: profileId,
                store_id: null,
                view_count: 0,
            })

            if (insertError) throw insertError

            toast.success('Publicação criada com sucesso!')
            setName('')
            setDescription('')
            setImageFile(null)
            setPreview(null)
            setIsCreating(false)

            const { data: freshData } = await supabase
                .from('products')
                .select('id, name, description, image_url, slug, created_at, view_count')
                .eq('owner_id', profileId)
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })
            if (freshData) setPublications(freshData as Publication[])
        } catch (err: any) {
            console.error('Erro ao criar publicação:', err)
            toast.error('Erro ao criar: ' + (err.message || 'Tente novamente'))
        } finally {
            setSaving(false)
        }
    }

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

    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    // Se não for o dono, mostra apenas as publicações
    if (!isOwner) {
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
                                Publicações
                            </h3>
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                {publications.length} {publications.length === 1 ? 'publicação' : 'publicações'}
                            </p>
                        </div>
                    </div>

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
                                    Nenhuma publicação ainda
                                </p>
                                <p className="text-xs mt-1" style={{ color: textSecondary }}>
                                    Este perfil ainda não fez nenhuma publicação.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {publications.map(pub => {
                                const imgUrl = getImageUrl(pub.image_url)
                                return (
                                    <div
                                        key={pub.id}
                                        className="rounded-2xl border p-3 flex flex-col gap-2 relative group cursor-pointer"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            borderColor: colors.border,
                                        }}
                                        onClick={() => router.push(`/p/${pub.slug}`)}
                                    >
                                        <div className="w-full aspect-square rounded-xl overflow-hidden bg-gray-100">
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
                                        <div className="flex items-center gap-1 text-[10px]" style={{ color: textSecondary }}>
                                            <Eye size={12} />
                                            <span>{pub.view_count || 0}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Versão completa para o dono
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
                            <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                Compartilhe suas ideias, produtos ou serviços
                            </p>
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
                                        Comece compartilhando suas ideias, produtos ou serviços.
                                    </p>
                                </div>
                                {!isCreating && (
                                    <button
                                        onClick={() => setIsCreating(true)}
                                        style={{
                                            ...pillButtonStyle,
                                            padding: '0.625rem 1.5rem',
                                            background: GRADIENT,
                                            color: '#ffffff',
                                            boxShadow: `0 4px 12px #f9731640`,
                                        }}
                                        className="hover:scale-105 transition-transform"
                                    >
                                        <Plus size={16} />
                                        Publicar
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
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
                                                    onClick={() => router.push(`/p/${pub.slug}`)}
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
                                                    <div className="flex items-center gap-1 text-[10px]" style={{ color: textSecondary }}>
                                                        <Eye size={12} />
                                                        <span>{pub.view_count || 0}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => router.push(`/p/${pub.slug}/editar`)}
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
                                            </div>
                                        )
                                    })}
                                </div>

                                {!isCreating && (
                                    <button
                                        onClick={() => setIsCreating(true)}
                                        style={{
                                            ...pillButtonStyle,
                                            width: '100%',
                                            padding: '0.75rem',
                                            background: 'transparent',
                                            border: `1px dashed ${colors.border}`,
                                            color: '#f97316',
                                        }}
                                        className="hover:bg-white/5 transition-colors"
                                    >
                                        <Plus size={16} />
                                        Nova publicação
                                    </button>
                                )}
                            </>
                        )}

                        {isCreating && (
                            <div
                                className="rounded-2xl p-4 border space-y-4 animate-in slide-in-from-top-2 duration-200"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    borderColor: colors.border,
                                }}
                            >
                                <h4 className="text-sm font-black flex items-center gap-2" style={{ color: textPrimary }}>
                                    <Send size={16} style={{ color: '#f97316' }} />
                                    Nova Publicação
                                </h4>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>
                                        Imagem (opcional)
                                    </label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group"
                                    >
                                        {preview ? (
                                            <img src={preview} className="w-full h-full object-cover" alt="" />
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
                                            if (file) setImageFile(file)
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>
                                        Título da publicação
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Minha nova ideia!"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-full border text-sm focus:outline-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: textPrimary,
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>
                                        Descrição
                                    </label>
                                    <textarea
                                        placeholder="Descreva sua novidade..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-2xl border text-sm focus:outline-none resize-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: textPrimary,
                                        }}
                                    />
                                </div>

                                {profileWhatsapp && (
                                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50/50 px-3 py-2 rounded-full">
                                        <MessageCircle size={14} />
                                        <span>Contato para interessados: <strong>{profileWhatsapp}</strong></span>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => {
                                            setIsCreating(false)
                                            setName('')
                                            setDescription('')
                                            setImageFile(null)
                                            setPreview(null)
                                        }}
                                        style={{
                                            ...pillButtonStyle,
                                            flex: 1,
                                            background: 'transparent',
                                            border: `2px solid ${colors.border}`,
                                            color: textSecondary,
                                        }}
                                        className="hover:opacity-70 transition-opacity"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={saving || !name.trim()}
                                        style={{
                                            ...pillButtonStyle,
                                            flex: 1,
                                            background: GRADIENT,
                                            color: '#ffffff',
                                            opacity: saving || !name.trim() ? 0.5 : 1,
                                        }}
                                        className="hover:opacity-80 transition-opacity"
                                    >
                                        {saving ? (
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
            </div>
        </div>
    )
}