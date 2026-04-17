'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Store as StoreIcon, Star, ArrowLeft, Users, Globe, ShoppingBag, Zap, Heart, MessageCircle } from 'lucide-react'
import { setReferralCookieAndRedirect } from '@/app/actions/cookies'
import { MuralPost } from '@/components/MuralPost'

type Tab = 'lojas' | 'mural' | 'compras' | 'flash'

export default function ProfilePage() {
    const params = useParams()
    const router = useRouter()
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug

    const [profile, setProfile] = useState<any>(null)
    const [stores, setStores] = useState<any[]>([])
    const [muralPosts, setMuralPosts] = useState<any[]>([])
    const [purchases, setPurchases] = useState<any[]>([])
    const [flashPosts, setFlashPosts] = useState<any[]>([])
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [activeTab, setActiveTab] = useState<Tab>('lojas')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadInitialData = async () => {
            const supabase = createClient()
            
            // 1. Fetch current user
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUser(user)

            // 2. Fetch target profile
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

            // 3. Fetch all related data in parallel
            const [storesRes, muralRes, salesRes] = await Promise.all([
                supabase.from('stores').select('*').eq('owner_id', profileData.id),
                supabase.from('mural_posts').select('*, profiles(name, profileSlug, avatar_url)').eq('profile_id', profileData.id).order('created_at', { ascending: false }),
                supabase.from('store_sales').select('*, stores(name, logo_url, storeSlug)').eq('buyer_id', profileData.id).order('created_at', { ascending: false })
            ])

            setStores(storesRes.data || [])
            setMuralPosts(muralRes.data || [])
            
            // Filter unique stores from purchases
            const uniqueStorePurchases = (salesRes.data || []).reduce((acc: any[], current: any) => {
                const x = acc.find(item => item.store_id === current.store_id);
                if (!x) return acc.concat([current]);
                else return acc;
            }, []);
            setPurchases(uniqueStorePurchases)

            // 4. Fetch flash posts for owned stores
            if (storesRes.data && storesRes.data.length > 0) {
                const storeIds = storesRes.data.map(s => s.id)
                const { data: flashData } = await supabase
                    .from('flash_posts')
                    .select('*, stores(name, storeSlug, logo_url, profileSlug:profiles(profileSlug))')
                    .in('store_id', storeIds)
                    .order('created_at', { ascending: false })
                
                setFlashPosts(flashData || [])
            }

            setLoading(false)
        }

        if (profileSlug) {
            loadInitialData()
        }
    }, [profileSlug])

    useEffect(() => {
        if (profile?.id) {
            const recordView = async () => {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (user?.id === profile.id) return
                await supabase.from('profile_views').insert({
                    profile_id: profile.id,
                    visitor_id: user?.id || null
                })
            }
            recordView()
        }
    }, [profile?.id])

    const getAvatarUrl = (path: string | null) => {
        if (!path) return undefined
        if (path.startsWith('http')) return path
        const supabase = createClient()
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const getLogoUrl = (path: string | null) => {
        if (!path) return null
        const supabase = createClient()
        return supabase.storage.from('store-logos').getPublicUrl(path).data.publicUrl
    }

    const getFlashImageUrl = (path: string | null) => {
        if (!path) return null
        const supabase = createClient()
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 italic">Sincronizando Perfil...</p>
            </div>
        )
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

    const tabs: { id: Tab; label: string; icon: any; count: number }[] = [
        { id: 'lojas', label: 'Lojas', icon: StoreIcon, count: stores.length },
        { id: 'mural', label: 'Mural', icon: Globe, count: muralPosts.length },
        { id: 'compras', label: 'Compras', icon: ShoppingBag, count: purchases.length },
        { id: 'flash', label: 'Flash', icon: Zap, count: flashPosts.length },
    ]

    return (
        <div className="relative w-full max-w-5xl mx-auto py-12 md:py-20 animate-fade-in text-white selection:bg-white selection:text-black min-h-screen pb-40">
            {/* Header Identity */}
            <div className="flex flex-col items-center text-center mb-16 space-y-8">
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

            {/* Tabs Navigation */}
            <div className="flex justify-center mb-12">
                <div className="bg-card/40 backdrop-blur-2xl border border-border rounded-[32px] p-2 flex gap-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-4 rounded-[24px] flex items-center gap-3 transition-all ${activeTab === tab.id ? 'bg-white text-black shadow-xl ring-4 ring-white/10' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}
                        >
                            <tab.icon size={18} />
                            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">{tab.label}</span>
                            <span className="bg-neutral-500/20 px-2 py-0.5 rounded-full text-[8px] font-black">{tab.count}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {activeTab === 'lojas' && (
                    <div className="space-y-12">
                        {stores.length === 0 ? (
                            <div className="py-24 text-center rounded-[40px] border border-dashed border-white/5 bg-white/[0.01]">
                                <StoreIcon className="w-16 h-16 text-neutral-800 mx-auto mb-6" />
                                <p className="text-neutral-500 text-xl font-bold uppercase italic tracking-wider">Nenhuma vitrine comercial ativa</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {stores.map(store => (
                                    <div
                                        key={store.id}
                                        onClick={() => router.push(`/${profile.profileSlug}/${store.storeSlug}`)}
                                        className="group relative flex flex-col bg-neutral-900/40 border border-white/5 rounded-[40px] overflow-hidden transition-all duration-500 hover:border-white/10 hover:-translate-y-2 cursor-pointer shadow-xl"
                                    >
                                        <div className="relative h-48 bg-neutral-950 overflow-hidden">
                                            {store.logo_url ? (
                                                <img src={getLogoUrl(store.logo_url)!} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" alt={store.name} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-neutral-800 text-4xl font-black italic">{store.name?.charAt(0)}</div>
                                            )}
                                        </div>
                                        <div className="p-8 space-y-6">
                                            <div className="space-y-2">
                                                <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white truncate">{store.name}</h3>
                                                <div className="flex items-center gap-4 font-black uppercase text-[10px] tracking-widest text-neutral-500">
                                                    <span className="flex items-center gap-1.5 text-yellow-500">
                                                        <Star size={14} className="fill-current" /> {store.ratings_avg?.toFixed(1) || '0.0'}
                                                    </span>
                                                    <span>{store.ratings_count || 0} Avaliações</span>
                                                </div>
                                            </div>
                                            <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-white">Ver Loja &rarr;</span>
                                                <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center transform group-hover:rotate-12 transition-all">
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

                {activeTab === 'mural' && (
                    <div className="max-w-2xl mx-auto space-y-8">
                        {muralPosts.length === 0 ? (
                            <div className="py-24 text-center rounded-[40px] border border-dashed border-white/5">
                                <Globe className="w-16 h-16 text-neutral-800 mx-auto mb-6" />
                                <p className="text-neutral-500 text-xl font-bold uppercase italic tracking-wider">Ainda não postou no mural</p>
                            </div>
                        ) : (
                            muralPosts.map(post => (
                                <MuralPost key={post.id} post={post} currentUserId={currentUser?.id} />
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'compras' && (
                    <div className="space-y-12">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {purchases.length === 0 ? (
                                <div className="col-span-full py-24 text-center rounded-[40px] border border-dashed border-white/5">
                                    <ShoppingBag className="w-16 h-16 text-neutral-800 mx-auto mb-6" />
                                    <p className="text-neutral-500 text-xl font-bold uppercase italic tracking-wider">Ainda não realizou compras</p>
                                </div>
                            ) : (
                                purchases.map(purchase => (
                                    <div
                                        key={purchase.id}
                                        onClick={() => router.push(`/${purchase.stores?.profileSlug || profileSlug}/${purchase.stores?.storeSlug}`)}
                                        className="group bg-card/40 border border-white/5 p-8 rounded-[40px] flex items-center gap-6 hover:border-white/10 transition-all cursor-pointer"
                                    >
                                        <div className="w-20 h-20 rounded-[28px] bg-neutral-900 overflow-hidden border border-white/5 flex-shrink-0">
                                            {purchase.stores?.logo_url ? (
                                                <img src={getLogoUrl(purchase.stores.logo_url)!} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-2xl font-black italic">{purchase.stores?.name?.charAt(0)}</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Cliente desta Loja</p>
                                            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white truncate">{purchase.stores?.name}</h3>
                                            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mt-1">/{purchase.stores?.storeSlug}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                         </div>
                    </div>
                )}

                {activeTab === 'flash' && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {flashPosts.length === 0 ? (
                             <div className="col-span-full py-24 text-center rounded-[40px] border border-dashed border-white/5">
                                <Zap className="w-16 h-16 text-neutral-800 mx-auto mb-6" />
                                <p className="text-neutral-500 text-xl font-bold uppercase italic tracking-wider">Nenhuma promoção flash ativa</p>
                            </div>
                        ) : (
                            flashPosts.map(post => (
                                <Link 
                                    href={`/${post.stores?.profileSlug?.profileSlug || profile.profileSlug}/${post.stores?.storeSlug}`}
                                    key={post.id} 
                                    className="group relative h-[400px] rounded-[48px] overflow-hidden border border-white/5 bg-neutral-950 shadow-2xl block"
                                >
                                    {post.image_url ? (
                                        <img src={getFlashImageUrl(post.image_url)!} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-all duration-700" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/5 text-9xl font-black italic">FLASH</div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                                    <div className="absolute bottom-8 left-8 right-8 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="px-3 py-1 bg-primary text-background rounded-lg text-[9px] font-black uppercase tracking-widest shadow-xl">Flash Update</div>
                                            <div className="text-[10px] font-black text-white/60 uppercase tracking-widest">{post.stores?.name}</div>
                                        </div>
                                        <h3 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-none">{post.title}</h3>
                                        <div className="flex items-center justify-between pt-4">
                                            <p className="text-2xl font-black italic tracking-tighter text-primary">R$ {post.new_price?.toFixed(2).replace('.', ',')}</p>
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 group-hover:text-white transition-colors">Ver Detalhes &rarr;</span>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        )}
                     </div>
                )}
            </div>
            
            <div className="pb-24" />
        </div>
    )
}
