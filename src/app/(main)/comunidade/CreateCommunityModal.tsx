// app/(main)/comunidade/CreateCommunityModal.tsx
//
// Criar comunidade: nome, descrição, foto, ONDE aparece (cidade, estado ou país — o lugar vem do local da pessoa, não é
// digitado), QUEM pode ver (todos da plataforma ou só por link) e COMO entrar (livre ou com senha).
'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { sanitizeSlug } from '@/lib/slugUtils'
import { toast } from 'sonner'
import { X, MessageCircle, ImagePlus, MapPin, Globe, Link2, Lock, Unlock, Check } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const MAX_MB = 6

type Scope = 'city' | 'state' | 'country'

interface CreateCommunityModalProps {
    userId: string
    place: { city: string | null; state: string | null }
    onClose: () => void
    onCreated: (slug: string) => void
}

export async function generateUniqueCommunitySlug(name: string): Promise<string> {
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

export default function CreateCommunityModal({ userId, place, onClose, onCreated }: CreateCommunityModalProps) {
    const { colors } = useTheme()
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [scope, setScope] = useState<Scope>(place.city ? 'city' : 'country')
    const [listed, setListed] = useState(true)
    const [usePassword, setUsePassword] = useState(false)
    const [password, setPassword] = useState('')
    const [photo, setPhoto] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const placeFor = (s: Scope): string | null => s === 'city' ? place.city : s === 'state' ? place.state : 'Brasil'

    const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        if (!file.type.startsWith('image/')) { toast.error('Escolha uma imagem'); return }
        if (file.size > MAX_MB * 1024 * 1024) { toast.error(`A imagem pode ter até ${MAX_MB} MB`); return }
        setPhoto(file)
        setPreview(URL.createObjectURL(file))
    }

    const handleCreate = async () => {
        if (!name.trim()) { toast.error('Dê um nome à comunidade'); return }
        const where = placeFor(scope)
        if (!where) { toast.error('Defina seu local primeiro, ou escolha "Todo o Brasil"'); return }
        if (usePassword && password.trim().length < 4) { toast.error('A senha precisa de pelo menos 4 caracteres'); return }

        setSaving(true)
        try {
            let imageUrl: string | null = null
            if (photo) {
                const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
                const path = `${userId}/new-${Date.now()}.${ext}`
                const { error: upErr } = await supabase.storage.from('community-photos').upload(path, photo, { contentType: photo.type })
                if (upErr) throw upErr
                imageUrl = supabase.storage.from('community-photos').getPublicUrl(path).data.publicUrl
            }

            const { data: slug, error } = await supabase.rpc('create_community', {
                p_name: name.trim(),
                p_description: description.trim() || null,
                p_scope: scope,
                p_place: where,
                p_listed: listed,
                p_password: usePassword ? password.trim() : null,
                p_image_url: imageUrl,
            })
            if (error) throw error

            toast.success('Comunidade criada!')
            onCreated(slug as string)
        } catch (err: any) {
            console.error('[CreateCommunityModal] Erro ao criar comunidade:', err)
            toast.error(err.message || 'Erro ao criar comunidade, tente novamente')
        } finally {
            setSaving(false)
        }
    }

    const field = { background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }
    const label = 'text-xs font-bold uppercase tracking-wide'

    // Cartão de escolha (um entre vários)
    const Option = ({ active, onClick, icon, title, hint, disabled }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; hint?: string; disabled?: boolean }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={saving || disabled}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition disabled:opacity-45"
            style={{ border: `2px solid ${active ? '#f97316' : colors.border}`, background: active ? '#f9731612' : 'transparent' }}
        >
            <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: active ? GRADIENT : `${colors.border}50`, color: active ? '#fff' : colors.textSecondary }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black truncate" style={{ color: colors.textPrimary }}>{title}</span>
                {hint && <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{hint}</span>}
            </span>
            {active && <Check size={16} style={{ color: '#f97316' }} />}
        </button>
    )

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative w-full max-w-md max-h-[92dvh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
            >
                <div className="p-5 flex-shrink-0" style={{ background: GRADIENT }}>
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

                <div className="p-5 space-y-5 overflow-y-auto">
                    {/* Foto + nome */}
                    <div className="flex items-end gap-3">
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={saving}
                            aria-label="Escolher a foto da comunidade"
                            className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 flex flex-col items-center justify-center gap-1 transition hover:scale-105"
                            style={{ border: `2px dashed ${colors.border}`, background: `${colors.border}25`, color: colors.textSecondary }}
                        >
                            {preview ? (
                                <img src={preview} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <ImagePlus size={22} />
                                    <span className="text-[10px] font-bold">Foto</span>
                                </>
                            )}
                        </button>
                        <div className="flex-1 min-w-0">
                            <label className={label} style={{ color: colors.textSecondary }}>Nome da comunidade</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Atualizações do iUser"
                                disabled={saving}
                                maxLength={60}
                                className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
                                style={field}
                            />
                        </div>
                    </div>

                    <div>
                        <label className={label} style={{ color: colors.textSecondary }}>Descrição (opcional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Sobre o que é essa comunidade?"
                            disabled={saving}
                            rows={2}
                            className="w-full mt-1 px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
                            style={field}
                        />
                    </div>

                    {/* Onde aparece */}
                    <div>
                        <label className={label} style={{ color: colors.textSecondary }}>Onde aparece</label>
                        <div className="mt-1.5 flex flex-col gap-2">
                            <Option
                                active={scope === 'city'}
                                onClick={() => setScope('city')}
                                icon={<MapPin size={16} />}
                                title={place.city ? `Só em ${place.city}` : 'Só na minha cidade'}
                                hint={place.city ? 'Aparece pra quem está na sua cidade' : 'Defina seu local pra usar esta opção'}
                                disabled={!place.city}
                            />
                            <Option
                                active={scope === 'state'}
                                onClick={() => setScope('state')}
                                icon={<MapPin size={16} />}
                                title={place.state ? `Todo o estado: ${place.state}` : 'Meu estado todo'}
                                hint={place.state ? 'Aparece pra quem está no seu estado' : 'Defina seu local pra usar esta opção'}
                                disabled={!place.state}
                            />
                            <Option
                                active={scope === 'country'}
                                onClick={() => setScope('country')}
                                icon={<Globe size={16} />}
                                title="Todo o Brasil"
                                hint="Aparece pra o país inteiro"
                            />
                        </div>
                    </div>

                    {/* Quem pode ver */}
                    <div>
                        <label className={label} style={{ color: colors.textSecondary }}>Quem pode ver</label>
                        <div className="mt-1.5 flex flex-col gap-2">
                            <Option
                                active={listed}
                                onClick={() => setListed(true)}
                                icon={<Globe size={16} />}
                                title="Todos da plataforma"
                                hint="Aparece na lista de comunidades"
                            />
                            <Option
                                active={!listed}
                                onClick={() => setListed(false)}
                                icon={<Link2 size={16} />}
                                title="Só quem tem o link"
                                hint="Fica fora da lista; entra quem receber o link"
                            />
                        </div>
                    </div>

                    {/* Como entrar */}
                    <div>
                        <label className={label} style={{ color: colors.textSecondary }}>Como entrar</label>
                        <div className="mt-1.5 flex flex-col gap-2">
                            <Option
                                active={!usePassword}
                                onClick={() => setUsePassword(false)}
                                icon={<Unlock size={16} />}
                                title="Entrada livre"
                                hint="Qualquer pessoa pode entrar"
                            />
                            <Option
                                active={usePassword}
                                onClick={() => setUsePassword(true)}
                                icon={<Lock size={16} />}
                                title="Com senha"
                                hint="Só entra e lê as mensagens quem souber a senha"
                            />
                        </div>
                        {usePassword && (
                            <input
                                type="text"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Escolha uma senha"
                                disabled={saving}
                                className="w-full mt-2 px-4 py-3 rounded-xl text-sm focus:outline-none"
                                style={field}
                            />
                        )}
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
