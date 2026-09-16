// src/components/ProfileDashboard/ProfileInfo.tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, User, Link as LinkIcon, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Copy, Sparkles } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import { supabase } from '@/lib/supabase/client'
import { checkSlugAvailability } from '@/lib/slugUtils'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL ===== (mesmo padrão de StoreDescription/StoreDashboard)
const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
}

const pillButtonFullStyle = { ...pillButtonStyle, flex: 1 }

interface ProfileInfoData {
    id: string
    name: string | null
    profileSlug: string
    avatar_url: string | null
    description: string | null
}

interface ProfileInfoProps {
    profile: ProfileInfoData
    onProfileUpdate: (updates: Partial<ProfileInfoData>) => void
}

interface ActivePlanBadge {
    name: string
    daysLeft: number | null
}

function daysLeft(iso: string | null): number | null {
    if (!iso) return null
    const diff = new Date(iso).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

export function ProfileInfo({ profile, onProfileUpdate }: ProfileInfoProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const surfaceRgb = hexToRgb(colors.surface)

    const [isExpanded, setIsExpanded] = useState(false)
    const [name, setName] = useState(profile.name || '')
    const [slug, setSlug] = useState(profile.profileSlug || '')
    const [description, setDescription] = useState(profile.description || '')
    const [preview, setPreview] = useState<string | null>(profile.avatar_url)
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [saving, setSaving] = useState(false)
    const [activePlans, setActivePlans] = useState<ActivePlanBadge[]>([])

    useEffect(() => {
        setName(profile.name || '')
        setSlug(profile.profileSlug || '')
        setDescription(profile.description || '')
        setPreview(profile.avatar_url)
    }, [profile.id, profile.name, profile.profileSlug, profile.description, profile.avatar_url])

    // Checagem de disponibilidade da URL, com debounce — mesmo padrão do StoreDashboard.
    useEffect(() => {
        if (!slug || slug === profile.profileSlug) {
            setSlugStatus('idle')
            return
        }
        setSlugStatus('checking')
        const timer = setTimeout(async () => {
            const result = await checkSlugAvailability(slug, { excludeProfileId: profile.id, skipProductCheck: true })
            setSlugStatus(result.available ? 'available' : 'taken')
        }, 600)
        return () => clearTimeout(timer)
    }, [slug, profile.profileSlug, profile.id])

    useEffect(() => {
        let cancelled = false
        const loadPlans = async () => {
            const { data } = await supabase
                .from('subscriptions')
                .select('current_period_end, plans(name)')
                .eq('user_id', profile.id)
                .eq('status', 'active')
            if (cancelled) return
            const badges = (data || []).map((s: any) => ({
                name: (Array.isArray(s.plans) ? s.plans[0]?.name : s.plans?.name) || 'Plano',
                daysLeft: daysLeft(s.current_period_end),
            }))
            setActivePlans(badges)
        }
        loadPlans()
        return () => { cancelled = true }
    }, [profile.id])

    const handleImageClick = () => fileInputRef.current?.click()

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) {
            toast.error('A imagem deve ter no máximo 5MB')
            return
        }
        setAvatarFile(file)
        setPreview(URL.createObjectURL(file))
    }

    const goToPublicProfile = () => router.push(`/${profile.profileSlug}`)

    const copyProfileLink = () => {
        const url = `${window.location.origin}/${profile.profileSlug}`
        navigator.clipboard.writeText(url)
        toast.success('Link copiado!')
    }

    const handleCancel = () => {
        setName(profile.name || '')
        setSlug(profile.profileSlug || '')
        setDescription(profile.description || '')
        setPreview(profile.avatar_url)
        setAvatarFile(null)
        setSlugStatus('idle')
        setIsExpanded(false)
    }

    const handleSave = async () => {
        if (!name.trim() || !slug.trim()) {
            toast.error('Preencha nome e URL')
            return
        }
        if (slugStatus === 'taken') {
            toast.error('Esse endereço já está em uso')
            return
        }
        setSaving(true)
        try {
            let avatarUrl = profile.avatar_url
            if (avatarFile) {
                const fileExt = avatarFile.name.split('.').pop()
                const fileName = `${profile.id}-${Date.now()}.${fileExt}`
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, avatarFile, { upsert: true })
                if (uploadError) throw uploadError
                avatarUrl = supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl
            }

            const cleanSlug = slug.trim().toLowerCase()
            const updates = {
                name: name.trim(),
                profileSlug: cleanSlug,
                description: description.trim() || null,
                avatar_url: avatarUrl,
            }

            const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id)
            if (error) throw error

            toast.success('Perfil atualizado!')
            setAvatarFile(null)
            setIsExpanded(false)
            onProfileUpdate(updates)

            if (cleanSlug !== profile.profileSlug) {
                router.replace(`/${cleanSlug}`)
            }
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + (err.message || 'tente novamente'))
        } finally {
            setSaving(false)
        }
    }

    const slugStatusInfo = slugStatus === 'checking'
        ? { text: 'Verificando...', color: colors.textSecondary }
        : slugStatus === 'available'
            ? { text: 'Disponível', color: '#22c55e' }
            : slugStatus === 'taken'
                ? { text: 'Já está em uso', color: '#ef4444' }
                : null

    const saveDisabled = saving || slugStatus === 'taken' || !name.trim() || !slug.trim()

    return (
        <div className="flex flex-col gap-3">
            <div
                className="rounded-2xl p-6 flex flex-col gap-5 relative"
                style={{
                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${colors.border}`,
                    boxShadow: colors.shadow,
                }}
            >
                {/* Cabeçalho com toggle - PILL (mesmo padrão de StoreDescription) */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between text-left"
                    style={{ padding: '0.5rem 0.75rem', borderRadius: '9999px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: GRADIENT, color: '#ffffff' }}
                        >
                            <User size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Informações do Perfil
                            </h3>
                            <div className="flex items-start gap-2 text-xs mt-1" style={{ color: colors.textSecondary }}>
                                {preview ? (
                                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-orange-200">
                                        <img src={preview} className="w-full h-full object-cover" alt="Avatar" />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-orange-100">
                                        <User size={14} className="text-orange-400" />
                                    </div>
                                )}
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-bold text-sm" style={{ color: colors.textPrimary }}>
                                        {name || 'Sem nome'}
                                    </span>
                                    <span className="text-[10px]">@{slug || 'sem-slug'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {isExpanded ? (
                        <ChevronUp size={22} style={{ color: colors.textSecondary }} />
                    ) : (
                        <ChevronDown size={22} style={{ color: colors.textSecondary }} />
                    )}
                </button>

                {/* Plano(s) ativo(s) + dias restantes */}
                {activePlans.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {activePlans.map((p, i) => (
                            <span
                                key={i}
                                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full"
                                style={{ background: '#22c55e18', color: '#16a34a', border: '1px solid #22c55e40' }}
                            >
                                <Sparkles size={11} />
                                {p.name}
                                {p.daysLeft != null && ` · ${p.daysLeft} dia${p.daysLeft === 1 ? '' : 's'} restante${p.daysLeft === 1 ? '' : 's'}`}
                            </span>
                        ))}
                    </div>
                )}

                {isExpanded && (
                    <>
                        <div className="space-y-4">
                            {/* Foto */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                    Foto do perfil
                                </label>
                                <div
                                    onClick={handleImageClick}
                                    className="relative w-32 h-32 mx-auto rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 group cursor-pointer hover:border-orange-500 transition-all duration-500 shadow-lg"
                                >
                                    {preview ? (
                                        <img src={preview} className="w-full h-full object-cover" alt="Avatar" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-orange-300 text-3xl font-black">
                                            {name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                        <Camera className="w-8 h-8 text-white" />
                                    </div>
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                                </div>
                                <p className="text-[8px] text-center font-medium" style={{ color: colors.textSecondary }}>
                                    Clique para alterar a foto (max. 5MB)
                                </p>
                            </div>

                            {/* Nome */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                    Nome *
                                </label>
                                <div
                                    className="flex items-center gap-2 px-4 py-3 rounded-xl transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20"
                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`, border: `2px solid ${colors.border}` }}
                                >
                                    <User size={16} className="text-orange-400 flex-shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Seu nome"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="flex-1 bg-transparent text-sm outline-none"
                                        style={{ color: colors.textPrimary }}
                                    />
                                </div>
                            </div>

                            {/* URL/slug */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                    URL do perfil *
                                </label>
                                <div
                                    className="flex rounded-xl overflow-hidden transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20"
                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`, border: `2px solid ${colors.border}` }}
                                >
                                    <span
                                        className="flex items-center px-3 text-[10px] font-bold flex-shrink-0"
                                        style={{ background: `${colors.border}30`, color: colors.textSecondary }}
                                    >
                                        <LinkIcon size={12} className="mr-1.5" />
                                        iuser.com.br/
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="seu-nome"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                        className="w-full px-4 py-3 bg-transparent text-sm outline-none"
                                        style={{ color: colors.textPrimary }}
                                    />
                                </div>
                                {slugStatusInfo && (
                                    <div className="flex items-center gap-1.5 text-[9px] font-bold" style={{ color: slugStatusInfo.color }}>
                                        {slugStatus === 'available' && <CheckCircle2 size={12} />}
                                        {slugStatus === 'taken' && <AlertCircle size={12} />}
                                        {slugStatusInfo.text}
                                    </div>
                                )}
                            </div>

                            {/* Descrição */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                    Descrição
                                </label>
                                <textarea
                                    placeholder="Conte um pouco sobre você..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                                    rows={4}
                                    className="w-full px-4 py-3 rounded-xl text-sm resize-none transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`, border: `2px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                                <p className="text-[8px] font-medium" style={{ color: colors.textSecondary }}>
                                    {description.length}/500 caracteres
                                </p>
                            </div>
                        </div>

                        {/* Botões de ação - PILL */}
                        <div className="flex gap-3 mt-2">
                            <button
                                onClick={handleCancel}
                                disabled={saving}
                                style={{
                                    ...pillButtonStyle,
                                    flex: 1,
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                    border: `2px solid ${colors.border}`,
                                    color: colors.textSecondary,
                                }}
                                className="hover:opacity-70 transition-opacity"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saveDisabled}
                                style={{
                                    ...pillButtonStyle,
                                    flex: 1,
                                    background: saveDisabled ? colors.border : GRADIENT,
                                    color: saveDisabled ? colors.textSecondary : '#ffffff',
                                    opacity: saveDisabled ? 0.5 : 1,
                                    cursor: saveDisabled ? 'not-allowed' : 'pointer',
                                }}
                                className="hover:opacity-80 transition-opacity"
                            >
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ===== Botões "Ver meu Perfil" / "Compartilhar Link" — mesmo design da loja ===== */}
            <div className="flex gap-2">
                <button
                    onClick={goToPublicProfile}
                    style={{ ...pillButtonFullStyle, background: GRADIENT, color: '#ffffff', boxShadow: '0 4px 12px #f9731640' }}
                    className="hover:scale-105 transition-transform"
                >
                    <User size={18} />
                    Ver meu Perfil
                </button>
                <button
                    onClick={copyProfileLink}
                    style={{ ...pillButtonFullStyle, background: GRADIENT, color: '#ffffff', boxShadow: '0 4px 12px #f9731640' }}
                    className="hover:scale-105 transition-transform"
                >
                    <Copy size={18} />
                    Compartilhar Link
                </button>
            </div>
        </div>
    )
}
