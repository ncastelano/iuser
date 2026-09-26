// src/components/CreatePublicationDialog.tsx
//
// Dialog de "Nova Publicação", usado tanto na página da loja (Store.tsx)
// quanto na página de categoria (/lojas/[categoria]) - o mesmo componente,
// o mesmo design, pra quem tem loja poder publicar sem precisar sair de
// onde está. Antes isso só existia expandido dentro da própria página da
// loja; virou dialog pra poder ser reaproveitado em qualquer lugar.
'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Megaphone, ImageIcon, Send } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { generateUniqueGlobalSlug } from '@/lib/slugUtils'

interface CreatePublicationDialogProps {
    open: boolean
    onClose: () => void
    storeId: string
    storeWhatsapp?: string | null
    showWhatsapp?: boolean
    onCreated: () => void
}

export default function CreatePublicationDialog({
    open,
    onClose,
    storeId,
    storeWhatsapp,
    showWhatsapp = true,
    onCreated,
}: CreatePublicationDialogProps) {
    const { colors } = useTheme()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [pubName, setPubName] = useState('')
    const [pubDescription, setPubDescription] = useState('')
    const [pubImageFile, setPubImageFile] = useState<File | null>(null)
    const [pubPreview, setPubPreview] = useState<string | null>(null)
    const [pubSaving, setPubSaving] = useState(false)

    useEffect(() => {
        if (!pubImageFile) return
        const url = URL.createObjectURL(pubImageFile)
        setPubPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [pubImageFile])

    const reset = () => {
        setPubName('')
        setPubDescription('')
        setPubImageFile(null)
        setPubPreview(null)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const handleCreatePublication = async () => {
        if (!pubName.trim()) {
            toast.error('Dê um nome à publicação')
            return
        }

        setPubSaving(true)
        try {
            let imagePath: string | null = null
            if (pubImageFile) {
                const fileExt = pubImageFile.name.split('.').pop()
                const fileName = `${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, pubImageFile)
                if (uploadError) throw uploadError
                imagePath = uploadData?.path ?? null
            }

            const slug = await generateUniqueGlobalSlug(pubName)

            const { error: insertError } = await supabase.from('products').insert({
                name: pubName,
                slug,
                description: pubDescription || null,
                price: 0,
                type: 'physical',
                price_type: 'fixed',
                listing_type: 'publication',
                image_url: imagePath,
                store_id: storeId,
            })

            if (insertError) throw insertError

            toast.success('Publicação criada com sucesso!')
            reset()
            onClose()
            onCreated()
        } catch (err: any) {
            console.error('Erro ao criar publicação:', err)
            toast.error('Erro ao criar: ' + (err.message || 'Tente novamente'))
        } finally {
            setPubSaving(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={handleClose}>
            <div
                className="w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4"
                style={{ background: colors.surface }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black flex items-center gap-2" style={{ color: colors.textPrimary }}>
                        <Megaphone size={18} style={{ color: '#f97316' }} />
                        Nova Publicação
                    </h3>
                    <button onClick={handleClose} className="text-2xl leading-none" style={{ color: colors.textSecondary }}>×</button>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                        Imagem (opcional)
                    </label>
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-24 h-24 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 hover:border-orange-400 flex items-center justify-center cursor-pointer overflow-hidden transition-all group"
                    >
                        {pubPreview ? (
                            <img src={pubPreview} className="w-full h-full object-cover" alt="" />
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
                            if (file) setPubImageFile(file)
                        }}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                        Título da publicação
                    </label>
                    <input
                        type="text"
                        placeholder="Ex: Promoção de verão!"
                        value={pubName}
                        onChange={(e) => setPubName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                        style={{
                            background: colors.background,
                            borderColor: colors.border,
                            color: colors.textPrimary,
                        }}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>
                        Descrição
                    </label>
                    <textarea
                        placeholder="Descreva sua novidade..."
                        value={pubDescription}
                        onChange={(e) => setPubDescription(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
                        style={{
                            background: colors.background,
                            borderColor: colors.border,
                            color: colors.textPrimary,
                        }}
                    />
                </div>

                {showWhatsapp && storeWhatsapp && (
                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50/50 px-3 py-2 rounded-lg">
                        <MessageCircle size={14} />
                        <span>O cliente será direcionado para o WhatsApp da loja: <strong>{storeWhatsapp}</strong></span>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <button
                        onClick={handleClose}
                        className="flex-1 py-2.5 rounded-lg font-bold text-sm border transition-colors"
                        style={{
                            borderColor: colors.border,
                            color: colors.textSecondary,
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCreatePublication}
                        disabled={pubSaving || !pubName.trim()}
                        className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        style={{
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#ffffff',
                        }}
                    >
                        {pubSaving ? (
                            <Spinner size={16} color="#ffffff" />
                        ) : (
                            <>
                                <Send size={14} />
                                Publicar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
