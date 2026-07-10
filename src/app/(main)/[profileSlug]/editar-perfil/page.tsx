//app/(main)/(profileSlug)/editar-perfil
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    ArrowLeft,
    Camera,
    Save,
    MapPinned,
    Eye,
    EyeOff,
    Store as StoreIcon,
    User,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import Header from '@/app/Header'
import type { Tab } from '@/app/Header'
import { toast } from 'sonner'

export default function EditarPerfilPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const {
        avatarUrl: loggedUserAvatarUrl,
        profileSlug: loggedUserSlug,
        bgMode,
        customBgUrl,
        loading: profileLoading,
    } = useProfile()

    const [profile, setProfile] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    // Form
    const [name, setName] = useState('')
    const [profileSlug, setProfileSlug] = useState('')
    const [address, setAddress] = useState('')
    const [showLocation, setShowLocation] = useState(true)
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [previewAvatar, setPreviewAvatar] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    // Endereço
    const [manualAddress, setManualAddress] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)

    // Slug
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [slugSuggestions, setSlugSuggestions] = useState<string[]>([])

    // ---------- Buscar perfil do usuário logado ----------
    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/?login=true')
                return
            }

            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (!profileData) {
                toast.error('Perfil não encontrado')
                router.push('/')
                return
            }

            setProfile(profileData)
            setName(profileData.name || '')
            setProfileSlug(profileData.profileSlug || '')
            setAddress(profileData.address || '')
            setManualAddress(profileData.address || '')
            setShowLocation(profileData.show_location ?? true)
            setLoading(false)
        }
        load()
    }, [])

    // Avatar preview local
    useEffect(() => {
        if (!avatarFile) return
        const url = URL.createObjectURL(avatarFile)
        setPreviewAvatar(url)
        return () => URL.revokeObjectURL(url)
    }, [avatarFile])

    // Verificar slug
    useEffect(() => {
        if (!profileSlug || !profile) return
        if (profileSlug === profile.profileSlug) {
            setSlugStatus('idle')
            setSlugSuggestions([])
            return
        }
        const check = async () => {
            setSlugStatus('checking')
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('profileSlug', profileSlug)
                .neq('id', profile.id)
                .maybeSingle()
            if (data) {
                setSlugStatus('taken')
                const base = profileSlug.replace(/-?\d+$/, '')
                setSlugSuggestions([1, 2, 3].map(n => `${base}-${n}`))
            } else {
                setSlugStatus('available')
                setSlugSuggestions([])
            }
        }
        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [profileSlug, profile])

    // Autocomplete endereço
    useEffect(() => {
        const delay = setTimeout(() => {
            if (manualAddress.length < 4) return
            fetchSuggestions(manualAddress)
        }, 500)
        return () => clearTimeout(delay)
    }, [manualAddress])

    const fetchSuggestions = async (query: string) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&country=BR&limit=5`
            )
            const data = await res.json()
            setSuggestions(data.features || [])
        } catch (e) {
            console.error(e)
        }
    }

    const selectSuggestion = (feature: any) => {
        const [lng, lat] = feature.center
        setSelectedLocation({ lat, lng })
        setManualAddress(feature.place_name)
        setAddress(feature.place_name)
        setSuggestions([])
    }

    // Salvar
    const handleSave = async () => {
        if (!name || !profileSlug) {
            toast.error('Nome e @username são obrigatórios')
            return
        }
        if (slugStatus === 'taken' || slugStatus === 'checking') {
            toast.error('Escolha um @username disponível')
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
                const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
                avatarUrl = data.publicUrl
            }

            const updateData: any = {
                name,
                profileSlug,
                avatar_url: avatarUrl,
                address,
                show_location: showLocation,
            }

            if (selectedLocation) {
                updateData.location = `POINT(${selectedLocation.lng} ${selectedLocation.lat})`
            }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', profile.id)

            if (error) throw error

            toast.success('Perfil atualizado!')
            router.push(`/${profileSlug || profile.profileSlug}`)
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    // ---------- Abas do Header ----------
    const [loggedUserStores, setLoggedUserStores] = useState<any[]>([])
    useEffect(() => {
        if (!loggedUserSlug || profileLoading) return
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: storesData } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')
                .eq('owner_id', user.id)
                .order('created_at', { ascending: true })
            if (storesData) {
                setLoggedUserStores(
                    storesData.map((s: any) => ({
                        id: s.id,
                        slug: s.storeSlug,
                        name: s.name,
                        logoUrl: s.logo_url
                            ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                            : null,
                    }))
                )
            }
        }
        load()
    }, [loggedUserSlug, profileLoading])

    const finalTabs: Tab[] = useMemo(() => {
        const isLoggedIn = !!loggedUserSlug && !profileLoading
        const tabs: Tab[] = [
            {
                id: 'inicio',
                label: 'Início',
                icon: User as any,
                imageUrl: '/logo.png',
                onClick: () => router.push('/'),
                isActive: false,
            },
            {
                id: 'perfil',
                label: isLoggedIn ? `@${loggedUserSlug}` : 'Entrar',
                icon: User as any,
                imageUrl: isLoggedIn ? loggedUserAvatarUrl : null,
                onClick: () => router.push(`/${loggedUserSlug}`),
                isActive: false,
            },
        ]

        if (loggedUserStores.length > 0) {
            loggedUserStores.forEach(store => {
                tabs.push({
                    id: `loja-${store.slug}`,
                    label: store.name,
                    icon: StoreIcon as any,
                    imageUrl: store.logoUrl,
                    onClick: () => router.push(`/${loggedUserSlug}/${store.slug}`),
                    isActive: false,
                })
            })
        } else if (isLoggedIn) {
            tabs.push({
                id: 'criar-loja',
                label: 'Criar loja',
                icon: StoreIcon as any,
                imageUrl: null,
                onClick: () => router.push('/criar-loja'),
                isActive: false,
            })
        }

        return tabs
    }, [loggedUserSlug, profileLoading, loggedUserAvatarUrl, loggedUserStores, router])

    const getAvatarUrl = (path: string | null) => {
        if (!path) return undefined
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    if (loading) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <main className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <Header
                title="Editar Perfil"
                showBack={false}
                greeting={`Olá, ${loggedUserSlug ? `@${loggedUserSlug}` : 'Visitante'}`}
                avatarUrl={loggedUserAvatarUrl}
                loading={profileLoading}
                tabs={finalTabs}
                showSearch={false}
                searchPlaceholder=""
                onSearch={() => { }}
                profileSlug={loggedUserSlug}
            />

            <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 pb-24">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 mb-6 text-sm font-bold hover:underline"
                    style={{ color: colors.accent }}
                >
                    <ArrowLeft size={18} />
                    Voltar
                </button>

                <h1 className="text-2xl font-black mb-8" style={{ color: colors.textPrimary }}>
                    Editar Perfil
                </h1>

                <div className="space-y-8">
                    {/* Avatar */}
                    <div className="flex flex-col items-center gap-4">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-32 h-32 rounded-full overflow-hidden cursor-pointer group border-2"
                            style={{ borderColor: colors.border }}
                        >
                            {previewAvatar || profile?.avatar_url ? (
                                <img
                                    src={previewAvatar || getAvatarUrl(profile.avatar_url)}
                                    className="w-full h-full object-cover"
                                    alt="Avatar"
                                />
                            ) : (
                                <div
                                    className="w-full h-full flex items-center justify-center text-4xl font-black"
                                    style={{ background: colors.background, color: colors.textSecondary }}
                                >
                                    {name?.charAt(0) || '?'}
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Camera className="w-8 h-8 text-white" />
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) setAvatarFile(file)
                            }}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs font-bold underline"
                            style={{ color: colors.accent }}
                        >
                            Alterar foto
                        </button>
                    </div>

                    {/* Nome */}
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                            Nome
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border text-sm font-bold focus:outline-none transition"
                            style={{
                                background: colors.surface,
                                borderColor: colors.border,
                                color: colors.textPrimary,
                            }}
                            placeholder="Seu nome completo"
                        />
                    </div>

                    {/* Slug */}
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                            @username
                        </label>
                        <div
                            className="flex items-center rounded-xl overflow-hidden border"
                            style={{ borderColor: colors.border }}
                        >
                            <span
                                className="px-3 py-3 text-xs font-bold"
                                style={{ background: colors.background, color: colors.textSecondary }}
                            >
                                @
                            </span>
                            <input
                                type="text"
                                value={profileSlug}
                                onChange={(e) =>
                                    setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                                }
                                className="flex-1 px-3 py-3 text-sm font-mono font-bold bg-transparent outline-none"
                                style={{ color: colors.textPrimary }}
                                placeholder="seu-nome"
                            />
                        </div>
                        {slugStatus === 'checking' && (
                            <p className="text-xs text-gray-400">Verificando...</p>
                        )}
                        {slugStatus === 'available' && (
                            <p className="text-xs text-green-500">Disponível ✓</p>
                        )}
                        {slugStatus === 'taken' && (
                            <p className="text-xs text-red-500">Indisponível ✗</p>
                        )}
                        {slugSuggestions.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {slugSuggestions.map(sug => (
                                    <button
                                        key={sug}
                                        onClick={() => {
                                            setProfileSlug(sug)
                                            setSlugSuggestions([])
                                        }}
                                        className="px-3 py-1 rounded-full text-xs font-bold border"
                                        style={{
                                            background: `${colors.accent}11`,
                                            borderColor: colors.accent,
                                            color: colors.accent,
                                        }}
                                    >
                                        {sug}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Endereço */}
                    <div className="space-y-2">
                        <label
                            className="text-xs font-black uppercase tracking-wider flex items-center gap-2"
                            style={{ color: colors.textSecondary }}
                        >
                            <MapPinned size={14} /> Localização
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={manualAddress}
                                onChange={(e) => setManualAddress(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border text-sm font-bold focus:outline-none transition"
                                style={{
                                    background: colors.surface,
                                    borderColor: colors.border,
                                    color: colors.textPrimary,
                                }}
                                placeholder="Digite seu endereço"
                            />
                            {suggestions.length > 0 && (
                                <div
                                    className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden shadow-lg z-50"
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                                >
                                    {suggestions.map((s, i) => (
                                        <div
                                            key={i}
                                            onClick={() => selectSuggestion(s)}
                                            className="p-3 hover:bg-white/10 cursor-pointer border-b last:border-0"
                                            style={{ borderColor: colors.border }}
                                        >
                                            <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>
                                                {s.place_name}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Toggle visibilidade */}
                    <div
                        className="flex items-center justify-between p-4 rounded-xl border"
                        style={{ borderColor: colors.border }}
                    >
                        <div>
                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                Mostrar localização no perfil
                            </p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                                Outros usuários poderão ver seu endereço
                            </p>
                        </div>
                        <button
                            onClick={() => setShowLocation(!showLocation)}
                            className="p-2 rounded-lg"
                            style={{ background: colors.background }}
                        >
                            {showLocation ? (
                                <Eye size={20} style={{ color: colors.accent }} />
                            ) : (
                                <EyeOff size={20} style={{ color: colors.textSecondary }} />
                            )}
                        </button>
                    </div>

                    {/* Botão salvar */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-4 rounded-xl font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        style={{
                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                            color: colors.accentText,
                            boxShadow: `0 8px 24px ${colors.accent}40`,
                        }}
                    >
                        {saving ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={18} />
                                Salvar alterações
                            </>
                        )}
                    </button>
                </div>
            </div>
        </main>
    )
}