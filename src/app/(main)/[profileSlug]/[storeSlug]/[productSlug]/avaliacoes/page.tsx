'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { RatingStars } from '@/components/ratings/RatingStars'
import { getAvatarUrl } from '@/lib/avatar'

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

export default function ProductRatingsPage() {
    const params = useParams()
    const router = useRouter()
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const productSlug = Array.isArray(params.productSlug) ? params.productSlug[0] : params.productSlug
    const [supabase] = useState(() => createClient())

    const [product, setProduct] = useState<any | null>(null)
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const { data: storeData } = await supabase.from('stores').select('id').ilike('storeSlug', storeSlug || '').maybeSingle()
            if (!storeData) {
                setLoading(false)
                return
            }

            const { data: productData } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', storeData.id)
                .eq('slug', productSlug)
                .maybeSingle()

            if (!productData) {
                setLoading(false)
                return
            }

            const imageUrl = productData.image_url ? supabase.storage.from('product-images').getPublicUrl(productData.image_url).data.publicUrl : null
            const { data: reviewsData } = await supabase
                .from('product_reviews')
                .select('id, rating, comment, is_anonymous, created_at, profiles(id, name, avatar_url, "profileSlug")')
                .eq('product_id', productData.id)
                .eq('is_anonymous', false)
                .order('created_at', { ascending: false })

            setProduct({ ...productData, image_url: imageUrl })
            const rows = (reviewsData || []).map((r: any) => ({
                ...r,
                profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
            }))
            setRatings(rows)
            setLoading(false)
        }

        load()
    }, [productSlug, storeSlug, supabase])

    if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Carregando avaliações...</div>

    return (
        <div className="min-h-screen bg-black text-white px-4 py-6">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center gap-4 mb-6">
                    <button onClick={() => router.push(`/${profileSlug}/${storeSlug}/${productSlug}`)} className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold">Avaliações do item</h1>
                        <p className="text-neutral-400 text-sm">{product?.name}</p>
                    </div>
                </div>

                {product && (
                    <div className="mb-6 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 flex flex-col md:flex-row items-center gap-5">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-800 shrink-0">
                            {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : null}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{product.name}</h2>
                            <div className="flex items-center gap-3 mt-2">
                                <RatingStars value={Number(product.ratings_avg || 0)} size={18} />
                                <span className="font-semibold">{Number(product.ratings_avg || 0).toFixed(1)}</span>
                                <span className="text-neutral-400">{product.ratings_count ?? 0} avaliações</span>
                            </div>
                        </div>
                    </div>
                )}

                {ratings.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-neutral-800 p-10 text-center text-neutral-400">
                        Ninguém avaliou este item ainda.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {ratings.map((rating: any) => {
                            const avatarUrl = getAvatarUrl(supabase, rating.profiles?.avatar_url)
                            const isAnonymous = rating.is_anonymous
                            return (
                                <div key={rating.id} className="rounded-3xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col hover:border-orange-500/30 transition-all group">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 border border-neutral-700 shadow-inner">
                                                {isAnonymous || !avatarUrl ? (
                                                    <div className="w-full h-full flex items-center justify-center font-black text-neutral-500 bg-neutral-800">
                                                        {isAnonymous ? '?' : (rating.profiles?.name || '?').slice(0, 1).toUpperCase()}
                                                    </div>
                                                ) : (
                                                    <img src={avatarUrl} alt={rating.profiles?.name || 'Avaliador'} className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-black text-sm">{isAnonymous ? 'Consumidor Anônimo' : (rating.profiles?.name || 'Usuário')}</p>
                                                <p className="text-[10px] text-neutral-500 font-bold">{new Date(rating.created_at).toLocaleDateString('pt-BR')}</p>
                                            </div>
                                        </div>
                                        <div className="px-2 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                                            <span className="text-[7px] font-black uppercase text-green-500">Verificada</span>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <RatingStars value={rating.rating} size={14} />
                                    </div>

                                    {rating.comment && (
                                        <p className="text-sm text-neutral-300 italic leading-relaxed">
                                            "{rating.comment}"
                                        </p>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
