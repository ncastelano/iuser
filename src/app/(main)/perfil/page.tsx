'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface StoreStats {
    ratings_count: number
    ratings_avg: number
}

interface Store {
    id: string
    name: string
    storeSlug: string
    logo_url: string | null
    is_open: boolean
    store_stats: StoreStats
}

export default function MyProfile() {
    const supabase = createClient()
    const router = useRouter()

    const [stores, setStores] = useState<Store[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchMyStores = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data } = await supabase
                .from('stores')
                .select(`id, name, storeSlug, logo_url, is_open, store_stats(*)`)
                .eq('owner_id', user.id)

            const mapped = (data || []).map(store => ({
                ...store,
                store_stats: store.store_stats?.[0] || {
                    ratings_count: 0,
                    ratings_avg: 0
                }
            }))

            setStores(mapped)
            setLoading(false)
        }

        fetchMyStores()
    }, [])

    const getLogoUrl = (logoPath: string | null) =>
        logoPath
            ? supabase.storage.from('store-logos').getPublicUrl(logoPath).data.publicUrl
            : ''

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-black text-white">Carregando...</div>

    return (
        <div className="p-4 md:p-8 bg-black text-white min-h-screen">

            <h1 className="text-3xl font-extrabold mb-8 tracking-tight">Meu Perfil</h1>

            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                <span className="w-2 h-6 bg-orange-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)]"></span>
                Minhas Lojas
            </h2>

            {stores.length === 0 ? (
                <div className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl p-8 text-center">
                    <p className="text-neutral-400 font-medium">Você ainda não criou nenhuma loja.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {stores.map(store => (
                        <div
                            key={store.id}
                            onClick={() => router.push(`/${store.storeSlug}`)}
                            className="glass-glow-card cursor-pointer hover:scale-105 hover:shadow-[0_10px_30px_rgba(249,115,22,0.1)] hover:border-orange-500/50 transition-all duration-300 group"
                        >
                            {store.logo_url ? (
                                <img
                                    src={getLogoUrl(store.logo_url)}
                                    className="w-full h-44 object-cover border-b border-neutral-800 group-hover:scale-105 transition-transform duration-700"
                                />
                            ) : (
                                <div className="w-full h-44 bg-neutral-950 border-b border-neutral-800 flex items-center justify-center">
                                    <span className="text-neutral-600 font-medium text-sm">Sem Logo</span>
                                </div>
                            )}

                            <div className="p-5 flex flex-col gap-2 relative">
                                <span className={`absolute -top-4 right-4 text-xs font-bold px-3 py-1.5 rounded-lg border shadow-lg backdrop-blur-md ${store.is_open ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-500 border-red-500/30'
                                    }`}>
                                    {store.is_open ? 'Aberto' : 'Fechado'}
                                </span>

                                <h3 className="font-bold text-lg text-white">{store.name}</h3>

                                <div className="flex items-center text-orange-500 text-sm mt-1">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <span key={i}>
                                            {i < Math.round(store.store_stats.ratings_avg) ? '★' : '☆'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
