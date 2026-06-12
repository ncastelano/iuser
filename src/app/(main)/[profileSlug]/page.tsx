// app/(main)/[profileSlug]/page.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
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
    User,
    Scissors,
    Camera,
} from 'lucide-react'
import AnimatedBackground from '@/components/AnimatedBackground'

type Tab = 'lojas' | 'compras' | 'agenda'

export default function ProfilePage() {
    const params = useParams()
    const router = useRouter()
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [profile, setProfile] = useState<any>(null)
    const [stores, setStores] = useState<any[]>([])
    const [purchases, setPurchases] = useState<any[]>([])
    const [appointmentsToday, setAppointmentsToday] = useState<any[]>([])
    const [allAppointments, setAllAppointments] = useState<any[]>([])
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [activeTab, setActiveTab] = useState<Tab>('lojas')
    const [loading, setLoading] = useState(true)

    // Avatar upload
    const [uploadingAvatar, setUploadingAvatar] = useState(false)

    // Social
    const [followersCount, setFollowersCount] = useState(0)
    const [followingCount, setFollowingCount] = useState(0)
    const [isFollowing, setIsFollowing] = useState(false)
    const [isOwner, setIsOwner] = useState(false)

    // Location
    const [showLocationModal, setShowLocationModal] = useState(false)
    const [manualAddress, setManualAddress] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [tempAddress, setTempAddress] = useState('')

    useEffect(() => {
        const load = async () => {
            if (!profileSlug) return
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUser(user)

            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('profileSlug', profileSlug)
                .single()

            if (profileError || !profileData) {
                setLoading(false)
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
        }
        load()
    }, [profileSlug])

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

    // Upload do avatar
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

    if (loading) {
        return (
            <main style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AnimatedBackground />
                <div className="relative z-10 text-center">
                    <div className="w-12 h-12 border-4 border-white/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm font-bold text-white/70">Carregando perfil...</p>
                </div>
            </main>
        )
    }

    if (!profile) {
        return (
            <main style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AnimatedBackground />
                <div className="relative z-10 text-center">
                    <h1 className="text-2xl font-black text-white mb-4">Perfil não encontrado</h1>
                    <button onClick={() => router.push('/')} className="flex items-center gap-2 text-purple-400 font-bold hover:underline">
                        <ArrowLeft className="w-5 h-5" /> Voltar para o Início
                    </button>
                </div>
            </main>
        )
    }

    const tabs: { id: Tab; label: string; icon: any; count: number }[] = [
        { id: 'lojas', label: 'Lojas', icon: StoreIcon, count: stores.length },
        { id: 'compras', label: 'Compras', icon: ShoppingBag, count: purchases.length },
        { id: 'agenda', label: 'Agenda', icon: CalendarDays, count: allAppointments.length },
    ]

    return (
        <main style={{ minHeight: '100vh', background: '#000', paddingBottom: 40, position: 'relative' }}>
            <AnimatedBackground />
            <div className="relative z-10 max-w-5xl mx-auto py-12 md:py-20 px-4">
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-16 space-y-8">
                    {/* Avatar com botão de upload */}
                    <div className="relative group">
                        <div className="w-32 h-32 md:w-44 md:h-44 rounded-[48px] overflow-hidden p-1 shadow-xl"
                            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {profile.avatar_url ? (
                                <img
                                    src={getAvatarUrl(profile.avatar_url)!}
                                    className="w-full h-full object-cover rounded-[44px] group-hover:scale-110 transition-transform duration-700"
                                    alt={profile.name}
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center rounded-[44px]"
                                    style={{ background: 'rgba(255,255,255,0.06)' }}>
                                    <Camera className="w-8 h-8 text-white/30" />
                                    <span className="text-[8px] font-black uppercase mt-1 text-white/40">Sem foto</span>
                                </div>
                            )}
                        </div>

                        {isOwner && (
                            <>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleAvatarChange}
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    id="avatar-upload-input"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingAvatar}
                                    className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-wait"
                                    style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
                                    title={profile.avatar_url ? 'Trocar foto' : 'Adicionar foto'}
                                >
                                    {uploadingAvatar ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Pencil size={16} />
                                    )}
                                </button>
                            </>
                        )}
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-5xl md:text-7xl font-black italic text-white">{profile.name}</h1>
                        <div className="flex items-center justify-center gap-4">
                            <span className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest"
                                style={{ background: 'rgba(124,58,237,0.2)', color: '#c084fc' }}>
                                Verificado iUser
                            </span>
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                /{profile.profileSlug}
                            </span>
                        </div>
                    </div>

                    {/* Social Stats */}
                    <div className="flex items-center gap-12">
                        <div className="text-center">
                            <p className="text-3xl font-black text-white">{followersCount}</p>
                            <p className="text-[10px] font-bold uppercase text-white/40">Seguidores</p>
                        </div>
                        <div className="w-px h-8" style={{ background: 'rgba(255,255,255,0.1)' }} />
                        <div className="text-center">
                            <p className="text-3xl font-black text-white">{followingCount}</p>
                            <p className="text-[10px] font-bold uppercase text-white/40">Seguindo</p>
                        </div>
                    </div>

                    {/* Follow / Location */}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        {currentUser?.id !== profile.id ? (
                            <button
                                onClick={handleFollowToggle}
                                className={`px-12 py-5 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${isFollowing
                                    ? 'bg-transparent border-2 text-purple-400 hover:bg-white/10'
                                    : 'text-white hover:scale-105 shadow-lg'
                                    }`}
                                style={!isFollowing ? { background: 'linear-gradient(135deg, #7c3aed, #a855f7)' } : { borderColor: 'rgba(168,85,247,0.5)' }}
                            >
                                {isFollowing ? 'Seguindo' : 'Seguir Perfil'}
                            </button>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                {profile.address && !profile.address.toLowerCase().includes('rua tal') ? (
                                    <div className="flex items-center gap-3 px-8 py-4 rounded-2xl shadow-md"
                                        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <MapPin size={16} className="text-purple-400" />
                                        <span className="text-sm font-bold text-white">{formatShortAddress(profile.address)}</span>
                                        <button onClick={toggleLocationVisibility} className="ml-2 px-3 py-1 rounded-lg text-xs font-bold hover:bg-white/20 transition"
                                            style={{ background: 'rgba(124,58,237,0.2)', color: '#c084fc' }}>
                                            {profile.show_location ? 'Ocultar' : 'Mostrar'}
                                        </button>
                                        <button onClick={() => setShowLocationModal(true)} className="p-1.5 rounded-lg hover:bg-white/10 transition">
                                            <Pencil size={14} className="text-purple-400" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowLocationModal(true)}
                                        className="flex items-center gap-3 px-8 py-4 rounded-2xl font-bold uppercase text-xs hover:border-purple-400 transition-all"
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '2px dashed rgba(255,255,255,0.2)', color: '#94a3b8' }}>
                                        <MapPinned size={16} /> Localização não definida
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Resumo da Agenda de Hoje */}
                    {isOwner && appointmentsToday.length > 0 && (
                        <div className="w-full max-w-2xl mx-auto mt-12 space-y-4">
                            <div className="flex items-center gap-4 px-2">
                                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
                                <h3 className="text-xs font-black uppercase text-purple-400 tracking-widest flex items-center gap-2">
                                    <CalendarDays size={16} />
                                    Agenda de Hoje
                                </h3>
                                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
                            </div>
                            <div className="flex overflow-x-auto pb-4 gap-4 snap-x">
                                {appointmentsToday.map((appt, i) => (
                                    <div
                                        key={appt.id || i}
                                        onClick={() => appt.profiles?.profileSlug && router.push(`/${appt.profiles.profileSlug}`)}
                                        className="flex-shrink-0 w-[240px] snap-start rounded-3xl p-5 flex items-center gap-4 hover:shadow-lg transition cursor-pointer"
                                        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <div className="w-12 h-12 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                            {appt.profiles?.avatar_url ? (
                                                <img src={getAvatarUrl(appt.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs font-black text-purple-400">
                                                    {appt.profiles?.name?.charAt(0) || 'U'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-purple-400">{appt.time}</p>
                                            <p className="text-sm font-bold text-white truncate">{appt.profiles?.name || 'Cliente'}</p>
                                            <p className="text-xs text-white/40 font-bold truncate">{appt.service_name || 'Agendamento'}</p>
                                        </div>
                                        <Clock className="w-4 h-4 text-white/30" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {isOwner && appointmentsToday.length === 0 && (
                        <div className="w-full max-w-2xl mx-auto mt-8">
                            <div className="rounded-3xl p-6 text-center"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.2)' }}>
                                <CalendarDays className="w-10 h-10 text-white/30 mx-auto mb-3" />
                                <p className="text-sm font-bold text-white/40">Você não tem agendamentos para hoje.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex justify-center mb-12">
                    <div className="rounded-3xl p-2 flex gap-2 shadow-lg"
                        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-6 py-4 rounded-2xl flex items-center gap-3 transition-all ${activeTab === tab.id
                                    ? 'text-white shadow-lg'
                                    : 'text-white/50 hover:bg-white/10'
                                    }`}
                                style={activeTab === tab.id ? { background: 'linear-gradient(135deg, #7c3aed, #a855f7)' } : {}}
                            >
                                <tab.icon size={18} />
                                <span className="text-xs font-black uppercase hidden sm:inline">{tab.label}</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                                    style={{ background: 'rgba(255,255,255,0.2)' }}>{tab.count}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="space-y-12">
                    {activeTab === 'lojas' && (
                        <div className="space-y-12">
                            {stores.length === 0 ? (
                                <div className="py-24 text-center rounded-3xl border border-dashed"
                                    style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)' }}>
                                    <StoreIcon className="w-16 h-16 text-white/30 mx-auto mb-6" />
                                    <p className="text-white/50 font-bold uppercase">Nenhuma vitrine ativa</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {stores.map(store => (
                                        <div
                                            key={store.id}
                                            onClick={() => router.push(`/${profile.profileSlug}/${store.storeSlug}`)}
                                            className="group rounded-3xl overflow-hidden hover:shadow-xl transition cursor-pointer"
                                            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
                                        >
                                            <div className="h-48 relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                                {store.logo_url ? (
                                                    <img src={getLogoUrl(store.logo_url)!} className="w-full h-full object-cover group-hover:scale-110 transition duration-700" alt={store.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-4xl font-black text-white/30">{store.name?.charAt(0)}</div>
                                                )}
                                            </div>
                                            <div className="p-6 space-y-4">
                                                <div>
                                                    <h3 className="text-2xl font-black text-white truncate">{store.name}</h3>
                                                    <div className="flex items-center gap-3 text-xs font-bold text-white/40 mt-2">
                                                        <span className="flex items-center gap-1 text-yellow-400">
                                                            <Star size={14} className="fill-current" /> {store.ratings_avg?.toFixed(1) || '0.0'}
                                                        </span>
                                                        <span>{store.ratings_count || 0} Avaliações</span>
                                                    </div>
                                                </div>
                                                <div className="pt-4 flex justify-between items-center" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <span className="text-xs font-black text-purple-400 group-hover:text-purple-300 transition-colors">Ver Loja →</span>
                                                    <div className="w-10 h-10 rounded-xl text-white flex items-center justify-center transform group-hover:rotate-12 transition-all"
                                                        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
                                                        <StoreIcon size={20} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'compras' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {purchases.length === 0 ? (
                                <div className="col-span-full py-24 text-center rounded-3xl border border-dashed"
                                    style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)' }}>
                                    <ShoppingBag className="w-16 h-16 text-white/30 mx-auto mb-6" />
                                    <p className="text-white/50 font-bold uppercase">Ainda não realizou compras</p>
                                </div>
                            ) : (
                                purchases.map(purchase => (
                                    <div
                                        key={purchase.id}
                                        onClick={() => router.push(`/${purchase.stores?.profileSlug || profileSlug}/${purchase.stores?.storeSlug}`)}
                                        className="group rounded-3xl p-6 flex items-center gap-5 hover:shadow-lg transition cursor-pointer"
                                        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <div className="w-16 h-16 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                            {purchase.stores?.logo_url ? (
                                                <img src={getLogoUrl(purchase.stores.logo_url)!} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xl font-black text-white/40">
                                                    {purchase.stores?.name?.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black text-purple-400 uppercase mb-1">Cliente desta Loja</p>
                                            <h3 className="text-xl font-black text-white truncate">{purchase.stores?.name}</h3>
                                            <p className="text-xs font-bold text-white/40 mt-1">/{purchase.stores?.storeSlug}</p>
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
                                    style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)' }}>
                                    <Calendar className="w-16 h-16 text-white/30 mx-auto mb-6" />
                                    <p className="text-white/50 font-bold uppercase">Nenhum compromisso na agenda</p>
                                    {isOwner && (
                                        <p className="text-xs text-white/40 mt-2">Configure seus serviços para receber agendamentos.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {allAppointments.map(appt => (
                                        <div
                                            key={appt.id}
                                            className="rounded-3xl p-6 flex gap-5 items-center hover:shadow-lg transition"
                                            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
                                        >
                                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                                                style={{ background: 'rgba(255,255,255,0.1)' }}>
                                                <CalendarDays size={28} className="text-white/40" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 text-xs font-black text-purple-400 mb-1">
                                                    <Calendar size={12} />
                                                    {formatDate(appt.date)}
                                                    <span className="text-white/20">|</span>
                                                    <Clock size={12} />
                                                    {appt.time}
                                                </div>
                                                <h3 className="text-lg font-black text-white truncate">{appt.service_name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="w-5 h-5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                                        {appt.profiles?.avatar_url ? (
                                                            <img src={getAvatarUrl(appt.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-white/40">
                                                                {appt.profiles?.name?.charAt(0) || 'C'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-bold text-white/50">{appt.profiles?.name || 'Cliente'}</p>
                                                </div>
                                                {appt.duration_minutes && (
                                                    <p className="text-xs text-white/40 mt-1">
                                                        <Scissors size={12} className="inline mr-1" />
                                                        {appt.duration_minutes} min
                                                    </p>
                                                )}
                                            </div>
                                            {appt.profiles?.profileSlug && (
                                                <button
                                                    onClick={() => router.push(`/${appt.profiles.profileSlug}`)}
                                                    className="px-4 py-2 rounded-xl text-xs font-black transition hover:bg-white/20"
                                                    style={{ background: 'rgba(124,58,237,0.2)', color: '#c084fc' }}>
                                                    Ver Cliente
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Location Modal */}
                {showLocationModal && (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="w-full max-w-xl rounded-3xl p-8 shadow-2xl space-y-6"
                            style={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-black text-white">Sua Localidade</h2>
                                <button onClick={() => setShowLocationModal(false)} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition"
                                    style={{ background: 'rgba(255,255,255,0.1)' }}>
                                    <X className="w-5 h-5 text-white/70" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <input
                                    type="text"
                                    placeholder="Digite seu endereço"
                                    value={manualAddress}
                                    onChange={(e) => setManualAddress(e.target.value)}
                                    className="w-full rounded-xl py-4 px-5 text-sm font-bold focus:outline-none transition"
                                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
                                />
                                {suggestions.length > 0 && (
                                    <div className="rounded-2xl overflow-hidden shadow-lg"
                                        style={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        {suggestions.map((s, i) => (
                                            <div
                                                key={i}
                                                onClick={() => selectSuggestion(s)}
                                                className="p-4 hover:bg-white/10 cursor-pointer"
                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                <p className="text-xs font-bold text-white/50 mb-1">Sugestão</p>
                                                <p className="text-sm font-bold text-white">{s.place_name}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={saveLocation}
                                    disabled={!tempAddress}
                                    className="w-full py-4 rounded-xl font-black uppercase text-sm tracking-widest shadow-lg hover:scale-105 transition disabled:opacity-50"
                                    style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}>
                                    Confirmar Endereço
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}