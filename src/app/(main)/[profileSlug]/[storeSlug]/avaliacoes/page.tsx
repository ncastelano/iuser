'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Star, Shield, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { RatingStars } from '@/components/ratings/RatingStars'
import AnimatedBackground from '@/components/AnimatedBackground'
import { LoadingSpinner } from '@/components/vitrine/LoadingSpinner'

type RatingRow = {
    id: string
    rating: number
    created_at: string
    profiles?: {
        id: string
        name: string | null
        avatar_url: string | null
    } | null
}

export default function StoreRatingsPage() {
    const params = useParams()
    const router = useRouter()
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const [supabase] = useState(() => createClient())

    const [store, setStore] = useState<any | null>(null)
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const { data: storeData } = await supabase.from('stores').select('*').ilike('storeSlug', storeSlug || '').maybeSingle()
            if (!storeData) {
                setLoading(false)
                return
            }

            const logoUrl = storeData.logo_url ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl : null

            const { data: reviewsData } = await supabase
                .from('product_reviews')
                .select('id, rating, comment, is_anonymous, created_at, products(name), profiles(id, name, avatar_url, "profileSlug")')
                .eq('store_id', storeData.id)
                .order('created_at', { ascending: false })

            const rows = (reviewsData || []).map((r: any) => ({
                ...r,
                products: Array.isArray(r.products) ? r.products[0] : r.products,
                profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
            }))

            const count = rows.length
            const avg = count > 0 ? rows.reduce((acc, r) => acc + r.rating, 0) / count : 0

            setStore({
                ...storeData,
                logo_url: logoUrl,
                ratings_avg: avg,
                ratings_count: count
            })
            setRatings(rows)

            if (avg !== storeData.ratings_avg || count !== storeData.ratings_count) {
                await supabase
                    .from('stores')
                    .update({ ratings_avg: avg, ratings_count: count })
                    .eq('id', storeData.id)
            }

            setLoading(false)
        }

        load()
    }, [storeSlug, supabase])

    if (loading) {
        return <LoadingSpinner message="Carregando avaliações..." />
    }

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <AnimatedBackground />

            <div className="relative z-10 max-w-3xl mx-auto px-4 py-8 w-full">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8 animate-slide-in">
                    <button
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}`)}
                        className="w-12 h-12 rounded-2xl bg-white/80 backdrop-blur-sm border border-orange-200 flex items-center justify-center hover:bg-white hover:border-orange-400 hover:shadow-lg transition-all group"
                    >
                        <ArrowLeft className="w-5 h-5 text-orange-600 group-hover:text-orange-700 transition-colors" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                            Avaliações da Loja
                        </h1>
                        <p className="text-orange-400 text-sm font-bold mt-1">{store?.name}</p>
                    </div>
                </div>

                {/* Store Info */}
                {store && (
                    <div className="mb-10 text-center animate-slide-in">
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden bg-gradient-to-br from-orange-500 to-red-500 p-[3px] shadow-xl">
                            <div className="w-full h-full rounded-full overflow-hidden bg-white">
                                {store.logo_url ? (
                                    <img src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Star className="w-10 h-10 text-orange-300" />
                                    </div>
                                )}
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">{store.name}</h2>
                        <div className="flex items-center justify-center gap-3">
                            <div className="flex items-center gap-2">
                                <RatingStars value={Number(store.ratings_avg || 0)} size={20} />
                                <span className="text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                                    {Number(store.ratings_avg || 0).toFixed(1)}
                                </span>
                            </div>
                            <span className="text-orange-300 font-bold">•</span>
                            <div className="flex items-center gap-2 text-orange-400">
                                <Star className="w-4 h-4 fill-orange-400" />
                                <span className="font-bold text-sm">{store.ratings_count ?? 0} avaliações</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Reviews List */}
                {ratings.length === 0 ? (
                    <div className="text-center py-16 animate-slide-in">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/80 border-2 border-dashed border-orange-300 flex items-center justify-center">
                            <Star className="w-10 h-10 text-orange-300" />
                        </div>
                        <p className="text-orange-400 font-bold text-lg">
                            Nenhuma avaliação ainda
                        </p>
                        <p className="text-orange-300 text-sm font-medium mt-2">
                            Seja o primeiro a avaliar esta loja ✨
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {ratings.map((rating: any, index) => {
                            const avatarUrl = getAvatarUrl(supabase, rating.profiles?.avatar_url)
                            const isAnonymous = rating.is_anonymous
                            return (
                                <div
                                    key={rating.id}
                                    className="animate-slide-in group"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    <div className="flex gap-4 p-5 rounded-2xl bg-white/80 backdrop-blur-sm border border-orange-200/50 hover:border-orange-400 hover:shadow-lg transition-all duration-300">
                                        {/* Avatar */}
                                        <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-orange-400 to-red-400 p-[2px] shrink-0">
                                            <div className="w-full h-full rounded-full overflow-hidden bg-white">
                                                {isAnonymous || !avatarUrl ? (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
                                                        {isAnonymous ? (
                                                            <User className="w-5 h-5 text-orange-400" />
                                                        ) : (
                                                            <span className="font-bold text-orange-600">
                                                                {(rating.profiles?.name || '?').slice(0, 1).toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <img src={avatarUrl} alt={rating.profiles?.name || 'Avaliador'} className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <div>
                                                    <p className="font-bold text-sm text-gray-900">
                                                        {isAnonymous ? 'Consumidor Anônimo' : (rating.profiles?.name || 'Usuário')}
                                                    </p>
                                                    <p className="text-xs text-orange-400 font-medium mt-0.5">
                                                        {new Date(rating.created_at).toLocaleDateString('pt-BR', {
                                                            day: 'numeric',
                                                            month: 'long',
                                                            year: 'numeric'
                                                        })}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 px-2 py-1 bg-green-100 border border-green-300 rounded-full">
                                                    <Shield className="w-3 h-3 text-green-600" />
                                                    <span className="text-[10px] font-black text-green-600 uppercase">Verificada</span>
                                                </div>
                                            </div>

                                            <div className="mb-3">
                                                <RatingStars value={rating.rating} size={14} />
                                                {rating.products?.name && (
                                                    <span className="ml-3 text-[11px] font-black text-orange-500 uppercase tracking-wider bg-orange-100 px-2 py-0.5 rounded-full">
                                                        {rating.products.name}
                                                    </span>
                                                )}
                                            </div>

                                            {rating.comment && (
                                                <div className="relative">
                                                    <span className="text-orange-300 text-lg leading-none absolute -top-1 -left-1">"</span>
                                                    <p className="text-sm text-gray-600 italic leading-relaxed pl-4">
                                                        {rating.comment}
                                                    </p>
                                                    <span className="text-orange-300 text-lg leading-none absolute -bottom-1 right-0">"</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}