'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Store as StoreIcon,
    Star,
    ArrowLeft,
    ShoppingBag,
    MapPin,
    MapPinned,
    X,
    Pencil,
    Clock,
    CalendarDays,
    Calendar,
    Camera,
    Search,
    User,
} from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import EditarPerfil from './EditarPerfil'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import type { Tab } from '@/app/Header'

type ProfileTab = 'compras' | 'agenda'

export default function ProfilePage() {
    const params = useParams()
    const router = useRouter()
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { colors } = useTheme()

    const {
        avatarUrl: loggedUserAvatarUrl,
        profileSlug: loggedUserSlug,
        bgMode,
        customBgUrl,
        loading: profileLoading,
    } = useProfile()

    const [profile, setProfile] = useState<any>(null)
    const [stores, setStores] = useState<any[]>([])
    const [purchases, setPurchases] = useState<any[]>([])
    const [appointmentsToday, setAppointmentsToday] = useState<any[]>([])
    const [allAppointments, setAllAppointments] = useState<any[]>([])
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [activeTab, setActiveTab] = useState<ProfileTab>('compras')
    const [loading, setLoading] = useState(true)
    const [profileNotFound, setProfileNotFound] = useState(false)
    const [editMode, setEditMode] = useState(false)

    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [isFollowing, setIsFollowing] = useState(false)
    const [isOwner, setIsOwner] = useState(false)

    const [showLocationModal, setShowLocationModal] = useState(false)
    const [manualAddress, setManualAddress] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [tempAddress, setTempAddress] = useState('')

    // === CARREGAMENTO DOS DADOS DO PERFIL VISITADO ===
    useEffect(() => {
        const load = async () => {
            if (!profileSlug) {
                setLoading(false)
                setProfileNotFound(true)
                return
            }
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUser(user)

            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('profileSlug', profileSlug)
                .single()

            if (profileError || !profileData) {
                setLoading(false)
                setProfileNotFound(true)
                return
            }

            setProfile(profileData)
            setIsOwner(user?.id === profileData.id)

            const [storesRes, salesRes, followersRes, followingRes, checkFollowRes] = await Promise.all([
                supabase.from('stores').select('*').eq('owner_id', profileData.id),
                supabase.from('store_sales').select('*, stores(name, logo_url, storeSlug)').eq('buyer_id', profileData.id).order('created_at', { ascending: false }),
                supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileData.id),
                supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileData.id),
                user ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', profileData.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
            ])

            setStores(storesRes.data || [])
            setFollowersCount(followersRes.count || 0)
            setFollowingCount(followingRes.count || 0)
            setIsFollowing(!!checkFollowRes.data)

            const uniquePurchases = (salesRes.data || []).reduce((acc: any[], cur: any) => {
                if (!acc.find(item => item.store_id === cur.store_id)) acc.push(cur)
                return acc
            }, [])
            setPurchases(uniquePurchases)

            const todayStr = new Date().toISOString().split('T')[0]
            try {
                const { data: todayAppts } = await supabase
                    .from('appointments')
                    .select('*, profiles:customer_id(name, avatar_url, profileSlug)')
                    .eq('provider_profile_id', profileData.id)
                    .eq('date', todayStr)
                    .neq('status', 'declined')
                    .order('time', { ascending: true })
                setAppointmentsToday(todayAppts || [])

                const { data: allAppts } = await supabase
                    .from('appointments')
                    .select('*, profiles:customer_id(name, avatar_url, profileSlug)')
                    .eq('provider_profile_id', profileData.id)
                    .gte('date', todayStr)
                    .neq('status', 'declined')
                    .order('date', { ascending: true })
                    .order('time', { ascending: true })
                setAllAppointments(allAppts || [])
            } catch {
                setAppointmentsToday([])
                setAllAppointments([])
            }

            setLoading(false)
            setProfileNotFound(false)
        }
        load()
    }, [profileSlug])

    // === ABAS DO HEADER (idênticas às da HomePage) ===
    const tabs: Tab[] = useMemo(() => {
        const isLoggedIn = !!loggedUserSlug && !profileLoading
        const allTabs: Tab[] = [
            // Aba Início
            {
                id: 'inicio',
                label: 'Início',
                icon: User as any,
                imageUrl: '/logo.png',
                onClick: () => router.push('/'),
                isActive: false, // nunca ativo, pois é outra página
            },
            // Aba Perfil
            {
                id: 'perfil',
                label: isLoggedIn ? `@${loggedUserSlug}` : 'Entrar',
                icon: User as any,
                imageUrl: isLoggedIn ? loggedUserAvatarUrl : null,
                onClick: () => {
                    if (isLoggedIn) {
                        // Abre o perfil no dashboard embutido da HomePage usando query param
                        router.push('/?perfil=true')
                    } else {
                        router.push('/?login=true')
                    }
                },
                isActive: false,
            },
        ]

        // Buscar as lojas do usuário logado para exibir como abas
        // (usaremos um estado separado, mas vamos carregar junto com o perfil)
        // Vamos adicionar um estado para as lojas do usuário logado
        // ... faremos isso fora do useMemo com um useEffect separado

        // Como a lista de lojas do usuário logado não está disponível aqui, 
        // faremos uma busca paralela. Mas para simplificar, vamos apenas 
        // deixar as abas de loja vazias (elas serão carregadas depois).
        // Na prática, a HomePage carrega as lojas do contexto. Aqui não temos.
        // Solução: buscar as lojas do usuário logado em um useEffect e armazenar em estado.

        return allTabs
    }, [loggedUserSlug, profileLoading, loggedUserAvatarUrl, router])

    // Estado para armazenar as lojas do usuário logado (para as abas)
    const [loggedUserStores, setLoggedUserStores] = useState<any[]>([])
    useEffect(() => {
        if (!loggedUserSlug || profileLoading) return
        const loadLoggedStores = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: storesData } = await supabase
                .from('stores')
                .select('id, name, storeSlug, logo_url')
                .eq('owner_id', user.id)
                .order('created_at', { ascending: true })
            if (storesData) {
                const mapped = storesData.map((s: any) => ({
                    id: s.id,
                    slug: s.storeSlug,
                    name: s.name,
                    logoUrl: s.logo_url
                        ? supabase.storage.from('store-logos').getPublicUrl(s.logo_url).data.publicUrl
                        : null,
                }))
                setLoggedUserStores(mapped)
            }
        }
        loadLoggedStores()
    }, [loggedUserSlug, profileLoading])

    // Reconstruir as abas incluindo as lojas do usuário logado e Criar loja
    const finalTabs: Tab[] = useMemo(() => {
        const isLoggedIn = !!loggedUserSlug && !profileLoading
        const allTabs: Tab[] = [
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
                onClick: () => {
                    if (isLoggedIn) {
                        router.push('/?perfil=true')
                    } else {
                        router.push('/?login=true')
                    }
                },
                isActive: false,
            },
        ]

        if (loggedUserStores.length > 0) {
            loggedUserStores.forEach((store) => {
                allTabs.push({
                    id: `loja-${store.slug}`,
                    label: store.name,
                    icon: StoreIcon as any,
                    imageUrl: store.logoUrl,
                    onClick: () => router.push(`/${loggedUserSlug}/${store.slug}`),
                    isActive: false,
                })
            })
        } else if (isLoggedIn) {
            // Nenhuma loja ainda → aba "Criar loja"
            allTabs.push({
                id: 'criar-loja',
                label: 'Criar loja',
                icon: StoreIcon as any,
                imageUrl: null,
                onClick: () => router.push('/criar-loja'),
                isActive: false,
            })
        } else {
            // Não logado → "Criar loja" leva para o fluxo combinado
            allTabs.push({
                id: 'criar-loja',
                label: 'Criar loja',
                icon: StoreIcon as any,
                imageUrl: null,
                onClick: () => router.push('/criar-loja-com-cadastro'),
                isActive: false,
            })
        }

        return allTabs
    }, [loggedUserSlug, profileLoading, loggedUserAvatarUrl, loggedUserStores, router])

    // Ações do perfil visitado
    const handleFollowToggle = async () => {
        if (!currentUser || !profile) return
        if (isFollowing) {
            setIsFollowing(false)
            setFollowersCount(prev => prev - 1)
            await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', profile.id)
        } else {
            setIsFollowing(true)
            setFollowersCount(prev => prev + 1)
            await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: profile.id })
        }
    }

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !profile) return
        setUploadingAvatar(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${profile.id}-${Date.now()}.${fileExt}`
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true })
            if (uploadError) throw uploadError
            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
            const publicUrl = data.publicUrl
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', profile.id)
            if (updateError) throw updateError
            setProfile({ ...profile, avatar_url: publicUrl })
        } catch (err: any) {
            alert('Erro ao enviar foto: ' + err.message)
        } finally {
            setUploadingAvatar(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const fetchSuggestions = useCallback(async (query: string) => {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&country=BR&limit=5`
            )
            const data = await res.json()
            setSuggestions(data.features || [])
        } catch (e) { console.error(e) }
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (manualAddress.length >= 4) fetchSuggestions(manualAddress)
        }, 500)
        return () => clearTimeout(timer)
    }, [manualAddress, fetchSuggestions])

    const selectSuggestion = (feature: any) => {
        const [lng, lat] = feature.center
        setSelectedLocation({ lat, lng })
        setTempAddress(feature.place_name)
        setManualAddress(feature.place_name)
        setSuggestions([])
    }

    const saveLocation = async () => {
        if (!tempAddress || !selectedLocation || !profile) return
        const { error } = await supabase.from('profiles').update({
            address: tempAddress,
            location: `POINT(${selectedLocation.lng} ${selectedLocation.lat})`,
            show_location: true,
        }).eq('id', profile.id)
        if (!error) {
            setProfile({ ...profile, address: tempAddress, show_location: true })
            setShowLocationModal(false)
        }
    }

    const toggleLocationVisibility = async () => {
        if (!profile || !isOwner) return
        const next = !profile.show_location
        setProfile({ ...profile, show_location: next })
        await supabase.from('profiles').update({ show_location: next }).eq('id', profile.id)
    }

    useEffect(() => {
        if (profile?.id) {
            const recordView = async () => {
                const { data: { user } } = await supabase.auth.getUser()
                if (user?.id === profile.id) return
                await supabase.from('profile_views').insert({ profile_id: profile.id, visitor_id: user?.id || null })
            }
            recordView()
        }
    }, [profile?.id])

    const getAvatarUrl = (path: string | null) => {
        if (!path) return undefined
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const getLogoUrl = (path: string | null) => {
        if (!path) return null
        return supabase.storage.from('store-logos').getPublicUrl(path).data.publicUrl
    }

    const formatShortAddress = (addr: string) => {
        if (!addr) return ''
        const parts = addr.split(',')
        const street = parts[0]?.trim() || ''
        const num = parts[1]?.trim()?.split('-')[0] || ''
        const city = parts[2]?.trim()?.split('-')[0] || ''
        return `${street}${num ? `, ${num}` : ''}${city ? `, ${city}` : ''}`
    }

    const formatDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-')
        return `${day}/${month}/${year}`
    }

    return (
        <main className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            {/* Header idêntico ao da HomePage */}
            <Header
                title="iUser"
                showBack={false}
                greeting={`Olá, ${profileLoading ? '...' : loggedUserSlug ? `@${loggedUserSlug}` : 'Visitante'}`}
                avatarUrl={loggedUserAvatarUrl}
                loading={loading || profileLoading}
                tabs={finalTabs}
                showSearch={false}
                searchPlaceholder="Buscar..."
                onSearch={() => { }}
                profileSlug={loggedUserSlug}
            />

            {/* Conteúdo do perfil visitado */}
            <div className="relative z-10 max-w-5xl mx-auto px-4 pt-8 pb-24">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                        <p className="text-sm font-bold mt-4 animate-pulse" style={{ color: colors.textSecondary }}>
                            Carregando...
                        </p>
                    </div>
                )}

                {!loading && profileNotFound && (
                    <div className="flex flex-col items-center text-center py-20">
                        <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Perfil não encontrado</h1>
                        <button onClick={() => router.push('/')} className="flex items-center gap-2 mt-4 font-bold hover:underline" style={{ color: colors.accent }}>
                            <ArrowLeft className="w-5 h-5" /> Voltar para o Início
                        </button>
                    </div>
                )}

                {!loading && profile && !editMode && (
                    <>
                        {/* Card do perfil */}
                        <div className="flex flex-col md:flex-row items-center gap-8 mb-12 p-6 rounded-3xl"
                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, backdropFilter: 'blur(12px)' }}>
                            <div className="relative flex-shrink-0">
                                <div className="w-32 h-32 md:w-44 md:h-44 rounded-full overflow-hidden p-1 shadow-xl"
                                    style={{ background: colors.surface }}>
                                    {profile.avatar_url ? (
                                        <img src={getAvatarUrl(profile.avatar_url)!} className="w-full h-full object-cover rounded-full" alt={profile.name} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-4xl font-black" style={{ color: colors.textSecondary }}>
                                            {profile.name?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                {isOwner && (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingAvatar}
                                        className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-50"
                                        style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.accentText }}
                                    >
                                        {uploadingAvatar ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Camera size={14} />
                                        )}
                                    </button>
                                )}
                                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" style={{ display: 'none' }} />
                            </div>

                            <div className="flex-1 text-center md:text-left space-y-3">
                                <h1 className="text-3xl md:text-5xl font-black italic" style={{ color: colors.textPrimary }}>{profile.name}</h1>
                                <div className="flex flex-wrap justify-center md:justify-start gap-2">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                                        style={{ background: `${colors.accent}22`, color: colors.accent }}>Verificado iUser</span>
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                                        style={{ background: colors.background, color: colors.textSecondary }}>/{profile.profileSlug}</span>
                                </div>

                                <div className="flex justify-center md:justify-start gap-8 pt-2">
                                    <div className="text-center">
                                        <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{followersCount}</p>
                                        <p className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Seguidores</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-black" style={{ color: colors.textPrimary }}>{followingCount}</p>
                                        <p className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Seguindo</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2">
                                    {currentUser?.id !== profile.id ? (
                                        <button onClick={handleFollowToggle}
                                            className={`px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${isFollowing ? 'border-2 hover:bg-white/10' : 'hover:scale-105 shadow-lg'}`}
                                            style={isFollowing ? { borderColor: colors.accent, color: colors.accent, background: 'transparent' } : { background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.accentText }}>
                                            {isFollowing ? 'Seguindo' : 'Seguir'}
                                        </button>
                                    ) : (
                                        <>
                                            {profile.address && !profile.address.toLowerCase().includes('rua tal') ? (
                                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                                                    style={{ background: colors.background }}>
                                                    <MapPin size={14} style={{ color: colors.accent }} />
                                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{formatShortAddress(profile.address)}</span>
                                                    <button onClick={toggleLocationVisibility}
                                                        className="ml-2 px-2 py-1 rounded-lg text-[10px] font-bold"
                                                        style={{ background: `${colors.accent}22`, color: colors.accent }}>
                                                        {profile.show_location ? 'Ocultar' : 'Mostrar'}
                                                    </button>
                                                    <button onClick={() => setShowLocationModal(true)} className="p-1 rounded-lg hover:bg-white/10">
                                                        <Pencil size={12} style={{ color: colors.accent }} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setShowLocationModal(true)}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase border border-dashed"
                                                    style={{ borderColor: colors.border, color: colors.textSecondary }}>
                                                    <MapPinned size={14} /> Localização não definida
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Agenda de Hoje (dono) */}
                        {isOwner && appointmentsToday.length > 0 && (
                            <div className="w-full max-w-2xl mx-auto mt-8 space-y-4">
                                <div className="flex items-center gap-4 px-2">
                                    <div className="h-px flex-1" style={{ background: colors.border }} />
                                    <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: colors.accent }}>
                                        <CalendarDays size={16} /> Agenda de Hoje
                                    </h3>
                                    <div className="h-px flex-1" style={{ background: colors.border }} />
                                </div>
                                <div className="flex overflow-x-auto pb-4 gap-4 snap-x">
                                    {appointmentsToday.map((appt, i) => (
                                        <div key={appt.id || i}
                                            onClick={() => appt.profiles?.profileSlug && router.push(`/${appt.profiles.profileSlug}`)}
                                            className="flex-shrink-0 w-[240px] snap-start rounded-3xl p-5 flex items-center gap-4 hover:shadow-lg transition cursor-pointer"
                                            style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                            <div className="w-12 h-12 rounded-2xl overflow-hidden" style={{ background: colors.background }}>
                                                {appt.profiles?.avatar_url ? (
                                                    <img src={getAvatarUrl(appt.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xs font-black" style={{ color: colors.accent }}>
                                                        {appt.profiles?.name?.charAt(0) || 'U'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold" style={{ color: colors.accent }}>{appt.time}</p>
                                                <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{appt.profiles?.name || 'Cliente'}</p>
                                                <p className="text-xs font-bold truncate" style={{ color: colors.textSecondary }}>{appt.service_name || 'Agendamento'}</p>
                                            </div>
                                            <Clock className="w-4 h-4" style={{ color: colors.textSecondary }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isOwner && appointmentsToday.length === 0 && (
                            <div className="w-full max-w-2xl mx-auto mt-8">
                                <div className="rounded-3xl p-6 text-center border border-dashed" style={{ background: colors.surface, borderColor: colors.border }}>
                                    <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                                    <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>Você não tem agendamentos para hoje.</p>
                                </div>
                            </div>
                        )}

                        {/* Lojas do perfil visitado */}
                        {stores.length > 0 && (
                            <div className="mt-12">
                                <h3 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: colors.accent }}>
                                    <StoreIcon size={16} /> Lojas
                                </h3>
                                <div className="flex overflow-x-auto gap-3 pb-4 snap-x snap-mandatory">
                                    {stores.map((store) => (
                                        <button key={store.id} onClick={() => router.push(`/${profileSlug}/${store.storeSlug}`)}
                                            className="flex-shrink-0 w-[140px] snap-start rounded-2xl p-3 flex flex-col items-center gap-2 hover:scale-105 transition-transform"
                                            style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                            <div className="w-12 h-12 rounded-full overflow-hidden" style={{ background: colors.background }}>
                                                {store.logo_url ? (
                                                    <img src={getLogoUrl(store.logo_url)!} className="w-full h-full object-cover" alt={store.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: colors.textSecondary }}>
                                                        {store.name?.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-xs font-bold truncate w-full text-center" style={{ color: colors.textPrimary }}>/{store.storeSlug}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tabs Compras / Agenda */}
                        <div className="flex justify-center mt-12 mb-8">
                            <div className="rounded-3xl p-2 flex gap-2 shadow-lg" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                {[
                                    { id: 'compras', label: 'Compras', icon: ShoppingBag, count: purchases.length },
                                    { id: 'agenda', label: 'Agenda', icon: CalendarDays, count: allAppointments.length },
                                ].map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id as ProfileTab)}
                                        className={`px-6 py-4 rounded-2xl flex items-center gap-3 transition-all ${activeTab === tab.id ? 'text-white shadow-lg' : 'hover:bg-white/10'}`}
                                        style={activeTab === tab.id ? { background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` } : { color: colors.textSecondary }}>
                                        <tab.icon size={18} />
                                        <span className="text-xs font-black uppercase hidden sm:inline">{tab.label}</span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: 'rgba(255,255,255,0.2)' }}>{tab.count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Conteúdo das abas */}
                        <div className="space-y-12">
                            {activeTab === 'compras' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {purchases.length === 0 ? (
                                        <div className="col-span-full py-24 text-center rounded-3xl border border-dashed"
                                            style={{ background: colors.surface, borderColor: colors.border }}>
                                            <ShoppingBag className="w-16 h-16 mx-auto mb-6" style={{ color: colors.textSecondary }} />
                                            <p className="font-bold uppercase" style={{ color: colors.textSecondary }}>Ainda não realizou compras</p>
                                        </div>
                                    ) : (
                                        purchases.map((purchase) => (
                                            <div key={purchase.id}
                                                onClick={() => router.push(`/${purchase.stores?.profileSlug || profileSlug}/${purchase.stores?.storeSlug}`)}
                                                className="group rounded-3xl p-6 flex items-center gap-5 hover:shadow-lg transition cursor-pointer"
                                                style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                                <div className="w-16 h-16 rounded-2xl overflow-hidden" style={{ background: colors.background }}>
                                                    {purchase.stores?.logo_url ? (
                                                        <img src={getLogoUrl(purchase.stores.logo_url)!} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: colors.textSecondary }}>
                                                            {purchase.stores?.name?.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-black uppercase mb-1" style={{ color: colors.accent }}>Cliente desta Loja</p>
                                                    <h3 className="text-xl font-black truncate" style={{ color: colors.textPrimary }}>{purchase.stores?.name}</h3>
                                                    <p className="text-xs font-bold mt-1" style={{ color: colors.textSecondary }}>/{purchase.stores?.storeSlug}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'agenda' && (
                                <div className="space-y-8">
                                    {allAppointments.length === 0 ? (
                                        <div className="py-24 text-center rounded-3xl border border-dashed"
                                            style={{ background: colors.surface, borderColor: colors.border }}>
                                            <Calendar className="w-16 h-16 mx-auto mb-6" style={{ color: colors.textSecondary }} />
                                            <p className="font-bold uppercase" style={{ color: colors.textSecondary }}>Nenhum compromisso na agenda</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {allAppointments.map((appt) => (
                                                <div key={appt.id}
                                                    className="rounded-3xl p-6 flex gap-5 items-center hover:shadow-lg transition"
                                                    style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: colors.background }}>
                                                        <CalendarDays size={28} style={{ color: colors.textSecondary }} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 text-xs font-black mb-1" style={{ color: colors.accent }}>
                                                            <Calendar size={12} />{formatDate(appt.date)}
                                                            <span style={{ color: colors.textSecondary }}>|</span>
                                                            <Clock size={12} />{appt.time}
                                                        </div>
                                                        <h3 className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>{appt.service_name}</h3>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="w-5 h-5 rounded-full overflow-hidden" style={{ background: colors.background }}>
                                                                {appt.profiles?.avatar_url ? (
                                                                    <img src={getAvatarUrl(appt.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-[8px] font-black" style={{ color: colors.textSecondary }}>
                                                                        {appt.profiles?.name?.charAt(0) || 'C'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <p className="text-xs font-bold" style={{ color: colors.textSecondary }}>{appt.profiles?.name || 'Cliente'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Modo Edição */}
                {!loading && profile && editMode && (
                    <EditarPerfil profile={profile} onUpdate={(updated: any) => setProfile(updated)} />
                )}
            </div>

            {/* Modal de Localização */}
            {showLocationModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="w-full max-w-xl rounded-3xl p-8 shadow-2xl space-y-6" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Sua Localidade</h2>
                            <button onClick={() => setShowLocationModal(false)} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition" style={{ background: colors.background }}>
                                <X className="w-5 h-5" style={{ color: colors.textSecondary }} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <input type="text" placeholder="Digite seu endereço" value={manualAddress} onChange={(e) => setManualAddress(e.target.value)}
                                className="w-full rounded-xl py-4 px-5 text-sm font-bold focus:outline-none transition"
                                style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                            {suggestions.length > 0 && (
                                <div className="rounded-2xl overflow-hidden shadow-lg" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                    {suggestions.map((s, i) => (
                                        <div key={i} onClick={() => selectSuggestion(s)} className="p-4 hover:bg-white/10 cursor-pointer" style={{ borderBottom: `1px solid ${colors.border}` }}>
                                            <p className="text-xs font-bold mb-1" style={{ color: colors.textSecondary }}>Sugestão</p>
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{s.place_name}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button onClick={saveLocation} disabled={!tempAddress}
                                className="w-full py-4 rounded-xl font-black uppercase text-sm tracking-widest shadow-lg hover:scale-105 transition disabled:opacity-50"
                                style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.accentText }}>
                                Confirmar Endereço
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}