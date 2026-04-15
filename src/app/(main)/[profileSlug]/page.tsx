'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Store as StoreIcon, Star, ArrowLeft, Users } from 'lucide-react'
import { setReferralCookieAndRedirect } from '@/app/actions/cookies'

export default function ProfilePage() {
    const params = useParams()
    const router = useRouter()
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug

    const [profile, setProfile] = useState<any>(null)
    const [stores, setStores] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadProfile = async () => {
            const supabase = createClient()

            // Busca o perfil pelo slug
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

            // Busca as lojas ativas desse usuário
            const { data: storesData } = await supabase
                .from('stores')
                .select('*')
                .eq('owner_id', profileData.id)
                .eq('is_open', true)

            setStores(storesData || [])
            setLoading(false)
        }

        if (profileSlug) {
            loadProfile()
        }
    }, [profileSlug])

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">Carregando...</div>
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-4">
                <h1 className="text-2xl font-bold mb-4">Perfil não encontrado</h1>
                <button onClick={() => router.push('/')} className="flex items-center gap-2 text-neutral-400 hover:text-white transition">
                    <ArrowLeft className="w-5 h-5" /> Voltar para o Início
                </button>
            </div>
        )
    }

    const getAvatarUrl = (avatarPath: string | null) => {
        if (!avatarPath) return null
        if (avatarPath.startsWith('http')) return avatarPath
        const supabase = createClient()
        return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
    }

    const getLogoUrl = (logoPath: string | null) => {
        if (!logoPath) return null
        const supabase = createClient()
        return supabase.storage.from('store-logos').getPublicUrl(logoPath).data.publicUrl
    }

    return (
        <div className="relative w-full max-w-5xl mx-auto py-12 md:py-20 animate-fade-in text-white selection:bg-white selection:text-black">
            {/* Header Identity */}
            <div className="flex flex-col items-center text-center mb-24 space-y-8">
                <div className="relative group">
                    <div className="w-32 h-32 md:w-44 md:h-44 rounded-[48px] overflow-hidden bg-black p-1 border border-white/10 shadow-2xl relative">
                        {profile.avatar_url ? (
                            <img src={getAvatarUrl(profile.avatar_url)!} className="w-full h-full object-cover rounded-[44px] grayscale-[0.3] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" alt={profile.name} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-800 text-6xl font-black italic">{profile.name?.charAt(0)}</div>
                        )}
                    </div>
                </div>
                
                <div className="space-y-4">
                    <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter text-white leading-none">
                        {profile.name}
                    </h1>
                    <div className="flex items-center justify-center gap-4">
                         <span className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400">Verificado iUser</span>
                         <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.3em]">/{profile.profileSlug}</span>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                    <button
                        onClick={() => setReferralCookieAndRedirect(profile.profileSlug)}
                        className="px-10 py-5 bg-white text-black rounded-[24px] font-black uppercase text-xs tracking-[0.2em] transition-all hover:bg-neutral-200 active:scale-95 shadow-2xl hover:shadow-white/20 flex items-center gap-3"
                    >
                        <Users className="w-5 h-5" />
                        Fazer Parte da Rede
                    </button>
                    <button onClick={() => router.push('/')} className="px-10 py-5 bg-neutral-900 border border-neutral-800 rounded-[24px] font-black uppercase text-xs tracking-[0.2em] text-neutral-400 hover:text-white hover:border-white/20 transition-all flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> Vitrine
                    </button>
                </div>
            </div>

            {/* Stores Section */}
            <div className="space-y-12">
                <h2 className="text-xs font-black uppercase tracking-[0.5em] text-neutral-600 flex items-center gap-6">
                    Ecossistema de Lojas <div className="h-px flex-1 bg-white/5" />
                </h2>

                {stores.length === 0 ? (
                    <div className="py-24 text-center rounded-[40px] border border-dashed border-white/5 bg-white/[0.01]">
                        <StoreIcon className="w-16 h-16 text-neutral-800 mx-auto mb-6" />
                        <p className="text-neutral-500 text-xl font-bold uppercase italic tracking-wider">O perfil ainda não ativou vitrines comerciais</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {stores.map(store => (
                                <div
                                key={store.id}
                                onClick={() => router.push(`/${profile.profileSlug}/${store.storeSlug}`)}
                                className="group relative flex flex-col bg-neutral-900/20 border border-white/5 rounded-[40px] overflow-hidden transition-all duration-500 hover:border-white/10 hover:-translate-y-2 cursor-pointer shadow-xl"
                            >
                                <div className="relative h-48 bg-neutral-950 overflow-hidden">
                                    {store.logo_url ? (
                                        <img src={getLogoUrl(store.logo_url)!} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" alt={store.name} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-neutral-800 text-4xl font-black italic">{store.name?.charAt(0)}</div>
                                    )}
                                    <div className="absolute top-6 left-6 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl z-20">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white">Live</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="space-y-2">
                                        <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white group-hover:text-neutral-200 transition-colors truncate">{store.name}</h3>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                                                <span className="text-sm font-black text-white italic">{store.ratings_avg?.toFixed(1) || '0.0'}</span>
                                            </div>
                                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-600">{store.ratings_count || 0} Avaliações</div>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-white transition-colors">Entrar na Vitrine &rarr;</span>
                                        <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center transform group-hover:rotate-12 transition-all">
                                            <StoreIcon className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="pb-24" />
        </div>
    )
}
