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
        <div className="max-w-4xl mx-auto p-4 md:p-8 animate-fade-in text-white relative z-10 w-full">
            <div className="flex flex-col items-center text-center mb-12 mt-8">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/20 mb-4 bg-neutral-900 flex items-center justify-center">
                    {profile.avatar_url ? (
                        <img src={getAvatarUrl(profile.avatar_url)!} className="w-full h-full object-cover" alt={profile.name} />
                    ) : (
                        <span className="text-3xl font-bold text-neutral-500">{profile.name?.charAt(0)}</span>
                    )}
                </div>
                <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                    {profile.name}
                </h1>
                <p className="text-neutral-400 mt-2">@{profile.profileSlug}</p>

                <button 
                    onClick={() => setReferralCookieAndRedirect(profile.profileSlug)} 
                    className="mt-6 flex items-center gap-2 bg-white text-black px-8 py-3 rounded-full font-extrabold hover:bg-neutral-200 transition shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95"
                >
                    <Users className="w-5 h-5" />
                    Fazer Parte da Rede
                </button>
            </div>

            <div className="mb-8">
                <h2 className="text-xl font-bold flex items-center gap-3 mb-6">
                    <span className="w-2 h-6 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></span>
                    Lojas de {profile.name}
                </h2>

                {stores.length === 0 ? (
                    <div className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl p-8 text-center text-neutral-400">
                        Nenhuma loja ativa no momento.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        {stores.map(store => (
                            <div
                                key={store.id}
                                onClick={() => router.push(`/${profile.profileSlug}/${store.storeSlug}`)}
                                className="bg-neutral-900/60 rounded-2xl overflow-hidden cursor-pointer hover:scale-105 hover:shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:border-white/50 transition-all duration-300 group border border-neutral-800"
                            >
                                <div className="w-full h-40 bg-neutral-950 flex items-center justify-center border-b border-neutral-800">
                                    {store.logo_url ? (
                                        <img src={getLogoUrl(store.logo_url)!} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={store.name} />
                                    ) : (
                                        <StoreIcon className="w-8 h-8 text-neutral-600" />
                                    )}
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-lg text-white mb-1 truncate">{store.name}</h3>
                                    <div className="flex items-center text-sm gap-1">
                                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                                        <span className="text-yellow-400 font-bold">{store.ratings_avg?.toFixed(1) || '0.0'}</span>
                                        <span className="text-neutral-500">({store.ratings_count || 0})</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
