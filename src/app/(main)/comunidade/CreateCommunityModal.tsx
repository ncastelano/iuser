// app/(main)/comunidade/CreateCommunityModal.tsx
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { sanitizeSlug } from '@/lib/slugUtils'
import { toast } from 'sonner'
import { X, MessageCircle } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const MAX_COMMUNITIES_PER_USER = 3

interface CreateCommunityModalProps {
    userId: string
    defaultCity?: string | null
    onClose: () => void
    onCreated: (slug: string) => void
}

async function generateUniqueCommunitySlug(name: string): Promise<string> {
    const base = sanitizeSlug(name) || 'comunidade'

    for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
        const { data } = await supabase
            .from('communities')
            .select('id')
            .eq('slug', candidate)
            .maybeSingle()
        if (!data) return candidate
    }

    return `${base}-${Date.now()}`
}

export default function CreateCommunityModal({ userId, defaultCity, onClose, onCreated }: CreateCommunityModalProps) {
    const { colors } = useTheme()
    const [name, setName] = useState('')
    const [city, setCity] = useState(defaultCity || '')
    const [description, setDescription] = useState('')
    const [saving, setSaving] = useState(false)

    const handleCreate = async () => {
        if (!name.trim()) {
            toast.error('Dê um nome à comunidade')
            return
        }
        if (!city.trim()) {
            toast.error('Informe a cidade da comunidade')
            return
        }

        setSaving(true)
        try {
            const { count } = await supabase
                .from('communities')
                .select('*', { count: 'exact', head: true })
                .eq('creator_id', userId)

            if ((count || 0) >= MAX_COMMUNITIES_PER_USER) {
                toast.error(`Você já criou o máximo de ${MAX_COMMUNITIES_PER_USER} comunidades`)
                setSaving(false)
                return
            }

            const slug = await generateUniqueCommunitySlug(name)

            const { data: community, error } = await supabase
                .from('communities')
                .insert({
                    slug,
                    name: name.trim(),
                    city: city.trim(),
                    description: description.trim() || null,
                    creator_id: userId,
                })
                .select('id, slug')
                .single()

            if (error) throw error

            await supabase.from('community_members').insert({
                community_id: community.id,
                profile_id: userId,
            })

            toast.success('Comunidade criada!')
            onCreated(community.slug)
        } catch (err: any) {
            console.error('[CreateCommunityModal] Erro ao criar comunidade:', err)
            toast.error('Erro ao criar comunidade: ' + (err.message || 'tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
            >
                <div className="p-5" style={{ background: GRADIENT }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-white" />
                            <h3 className="text-xl font-bold text-white">Criar Comunidade</h3>
                        </div>
                        <button onClick={onClose} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                            Nome da comunidade
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Amigos de Porto Velho"
                            disabled={saving}
                            className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
                            style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                            Cidade
                        </label>
                        <input
                            type="text"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="Ex: Porto Velho"
                            disabled={saving}
                            className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
                            style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                            Descrição (opcional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Sobre o que é essa comunidade?"
                            disabled={saving}
                            rows={3}
                            className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
                            style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                        />
                    </div>

                    <button
                        onClick={handleCreate}
                        disabled={saving}
                        className="w-full py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
                        style={{ background: GRADIENT, color: '#ffffff' }}
                    >
                        {saving ? <Spinner size={18} /> : 'Criar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
