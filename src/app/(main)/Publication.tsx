// components/Publication.tsx
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
    ShoppingBag,
    MessageCircle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Publication {
    id: string
    name: string
    description?: string
    image_url: string | null
    slug: string
    store_id: string
    created_at: string
    view_count?: number
}

interface PublicationProps {
    storeId: string
}

export default function Publication({ storeId }: PublicationProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [isExpanded, setIsExpanded] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [publications, setPublications] = useState<Publication[]>([])
    const [loading, setLoading] = useState(false)

    // Formulário de criação
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    // WhatsApp da loja (para exibir no rodapé)
    const [storeWhatsapp, setStoreWhatsapp] = useState<string | null>(null)

    // Buscar publicações ao expandir
    useEffect(() => {
        if (!isExpanded || !storeId) return
        const load = async () => {
            setLoading(true)
            const { data, error } = await supabase
                .from('products')
                .select('id, name, description, image_url, slug, created_at')
                .eq('store_id', storeId)
                .eq('listing_type', 'publication')
                .order('created_at', { ascending: false })
            if (!error && data) {
                setPublications(data as Publication[])
            }
            // Buscar WhatsApp da loja
            const { data: storeData } = await supabase
                .from('stores')
                .select('whatsapp, final_whatsapp')
                .eq('id', storeId)
                .single()
            if (storeData) {
                setStoreWhatsapp(storeData.final_whatsapp || storeData.whatsapp || null)
            }
            setLoading(false)
        }
        load()
    }, [isExpanded, storeId])

    // Preview da imagem
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

            // Gerar slug único
            let slug = name
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, '')
            let isUnique = false
            while (!isUnique) {
                const { data: existing } = await supabase
                    .from('products')
                    .select('id')
                    .eq('slug', slug)
                    .eq('store_id', storeId)
                    .maybeSingle()
                if (existing) {
                    slug = slug + '-' + Math.floor(Math.random() * 9999)
                } else {
                    isUnique = true
                }
            }

            const { error: insertError } = await supabase.from('products').insert({
                name,
                slug,
                description: description || null,
                price: 0,
                type: 'physical',
                price_type: 'fixed',
                listing_type: 'publication',
                image_url: imagePath,
                store_id: storeId,
            })

            if (insertError) throw insertError

            toast.success('Publicação criada com sucesso!')
            // Limpar formulário
            setName('')
            setDescription('')
            setImageFile(null)
            setPreview(null)
            setIsCreating(false)
            // Recarregar lista
            const { data: freshData } = await supabase
                .from('products')
                .select('id, name, description, image_url, slug, created_at')
                .eq('store_id', storeId)
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

    return (
        <div className="mb-6">
            {/* Cabeçalho colapsável */}
            <div
                className="rounded-2xl border"
                style={{
                    background: colors.surface,
                    borderColor: colors.border,
                }}
            >
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between p-4 text-left"
                >
                    <span className="text-lg font-black" style={{ color: colors.textPrimary }}>
                        📢 Publicações
                    </span>
                    <div className="flex items-center gap-2">
                        {publications.length > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: colors.accentLight, color: colors.accent }}>
                                {publications.length}
                            </span>
                        )}
                        {isExpanded ? (
                            <ChevronUp size={22} style={{ color: colors.textSecondary }} />
                        ) : (
                            <ChevronDown size={22} style={{ color: colors.textSecondary }} />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    <div className="px-4 pb-6">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                            </div>
                        ) : publications.length === 0 ? (
                            /* Estado vazio */
                            <div className="text-center py-8 space-y-4">
                                <div
                                    className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
                                    style={{ background: colors.accentLight }}
                                >
                                    <MessageCircle size={28} style={{ color: colors.accent }} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                        Você ainda não fez nenhuma publicação
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                        Comece divulgando sua loja, um produto ou um serviço. <br />
                                        <span className="italic">“Sua vitrine merece brilhar!” ✨</span>
                                    </p>
                                </div>
                                {!isCreating && (
                                    <button
                                        onClick={() => setIsCreating(true)}
                                        className="px-6 py-2.5 rounded-full font-black text-sm uppercase tracking-wider flex items-center gap-2 mx-auto transition-all hover:scale-105"
                                        style={{
                                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                                            color: colors.accentText,
                                            boxShadow: `0 4px 14px ${colors.accent}40`,
                                        }}
                                    >
                                        <Plus size={16} />
                                        Publicar
                                    </button>
                                )}
                            </div>
                        ) : (
                            /* Lista de publicações existentes */
                            <div className="space-y-4">
                                <div className="flex overflow-x-auto gap-3 pb-2">
                                    {publications.map(pub => {
                                        const imgUrl = getImageUrl(pub.image_url)
                                        return (
                                            <div
                                                key={pub.id}
                                                className="flex-shrink-0 w-[160px] rounded-xl border p-3 flex flex-col gap-2 relative group"
                                                style={{
                                                    background: colors.surface,
                                                    borderColor: colors.border,
                                                }}
                                            >
                                                <div
                                                    className="w-full h-24 rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
                                                    onClick={() => router.push(`/${pub.slug}`)} // ajuste a rota conforme necessário
                                                >
                                                    {imgUrl ? (
                                                        <img src={imgUrl} className="w-full h-full object-cover" alt={pub.name} />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: colors.textSecondary }}>
                                                            <MessageCircle size={24} />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {pub.name}
                                                </p>
                                                <div className="flex items-center justify-between mt-1">
                                                    <button
                                                        onClick={() => router.push(`/${pub.slug}/editar-produto`)} // ou editar-publicacao
                                                        className="p-1 rounded hover:bg-white/10"
                                                        title="Editar"
                                                    >
                                                        <ExternalLink size={12} style={{ color: colors.textSecondary }} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(pub.id)}
                                                        className="p-1 rounded hover:bg-red-50"
                                                        title="Excluir"
                                                    >
                                                        <Trash2 size={12} style={{ color: '#ef4444' }} />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                {!isCreating && (
                                    <button
                                        onClick={() => setIsCreating(true)}
                                        className="w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:bg-white/5"
                                        style={{
                                            border: `1px dashed ${colors.border}`,
                                            color: colors.accent,
                                        }}
                                    >
                                        <Plus size={16} />
                                        Nova publicação
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Formulário de criação (expansão secundária) */}
                        {isCreating && (
                            <div className="mt-4 p-4 rounded-xl border space-y-4 animate-in slide-in-from-top-2 duration-200"
                                style={{
                                    background: colors.surface,
                                    borderColor: colors.border,
                                }}
                            >
                                <h4 className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}>
                                    <Send size={16} style={{ color: colors.accent }} />
                                    Nova Publicação
                                </h4>

                                {/* Imagem */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Imagem (opcional)
                                    </label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-24 h-24 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group"
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

                                {/* Nome */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Título da publicação
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Promoção de verão!"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                </div>

                                {/* Descrição */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                                        Descrição
                                    </label>
                                    <textarea
                                        placeholder="Descreva sua novidade..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                    />
                                </div>

                                {/* WhatsApp da loja (informativo) */}
                                {storeWhatsapp && (
                                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                                        <MessageCircle size={14} />
                                        <span>O cliente será direcionado para o WhatsApp da loja: <strong>{storeWhatsapp}</strong></span>
                                    </div>
                                )}

                                {/* Ações */}
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => {
                                            setIsCreating(false)
                                            setName('')
                                            setDescription('')
                                            setImageFile(null)
                                            setPreview(null)
                                        }}
                                        className="flex-1 py-2.5 rounded-lg font-bold text-sm border transition-colors"
                                        style={{
                                            borderColor: colors.border,
                                            color: colors.textSecondary,
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={saving || !name.trim()}
                                        className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                        style={{
                                            background: `linear-gradient(135deg, #22c55e, #16a34a)`,
                                            color: '#ffffff',
                                        }}
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