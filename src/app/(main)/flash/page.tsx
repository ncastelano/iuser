'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Clock, ArrowUpRight, ShoppingBag, ShoppingCart, Share2, MapPin } from 'lucide-react'
import Link from 'next/link'
import { calcDistanceKm, formatDistance } from '@/lib/geo'

export default function FlashPage() {
    const [posts, setPosts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const supabase = createClient()

    useEffect(() => {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    })
                },
                (err) => console.log('Erro ao obter localização:', err),
                { enableHighAccuracy: true }
            )
        }
    }, [])

    useEffect(() => {
        const fetchPosts = async () => {
            const { data, error } = await supabase
                .from('flash_posts')
                .select(`
                    *,
                    stores (
                        name, 
                        storeSlug, 
                        logo_url, 
                        location,
                        profiles (profileSlug)
                    ),
                    products (slug)
                `)
                .order('created_at', { ascending: false })

            if (!error && data) {
                const formattedData = data.map((item: any) => ({
                    ...item,
                    store_name: item.stores?.name,
                    storeSlug: item.stores?.storeSlug,
                    store_logo: item.stores?.logo_url,
                    store_location: item.stores?.location,
                    profileSlug: item.stores?.profiles?.profileSlug,
                    product_slug: item.products?.slug
                }))
                setPosts(formattedData)
                if (data.length > 0) setActiveId(data[0].id)
            }
            setLoading(false)
        }

        fetchPosts()
    }, [supabase])

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#070707] text-white">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin"></div>
                    <Zap className="w-6 h-6 text-yellow-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="mt-4 font-black uppercase tracking-[0.3em] text-[10px] text-neutral-500">Sincronizando feed...</p>
            </div>
        )
    }

    return (
        <div className="h-[100dvh] bg-black overflow-hidden flex flex-col">
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 z-50 p-6 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none">
                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="w-11 h-11 bg-yellow-500 text-black rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(234,179,8,0.3)] rotate-3">
                        <Zap className="w-7 h-7 fill-black" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white leading-none">Flash<span className="text-yellow-500">.</span></h1>
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-yellow-500/80 mt-0.5">Promoções temporárias, aproveite!</p>
                    </div>
                </div>
            </div>

            {posts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
                    <div className="w-24 h-24 bg-neutral-900 border border-white/5 rounded-[32px] flex items-center justify-center mb-6">
                        <Zap className="w-10 h-10 text-neutral-800" />
                    </div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-2">Silêncio no Radar</h2>
                    <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.2em] max-w-[200px]">Nenhuma novidade disponível no momento.</p>
                </div>
            ) : (
                <main className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-hide">
                    {posts.map((post) => (
                        <section
                            key={post.id}
                            className="relative h-full w-full snap-start overflow-hidden flex flex-col"
                        >
                            {/* Background Image (Product) */}
                            <div className="absolute inset-0 bg-neutral-900">
                                {post.image_url ? (
                                    <img
                                        src={supabase.storage.from('product-images').getPublicUrl(post.image_url).data.publicUrl}
                                        className="w-full h-full object-cover opacity-80"
                                        alt={post.title}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-900 to-black">
                                        <ShoppingBag className="w-20 h-20 text-neutral-800" />
                                    </div>
                                )}
                                {/* Overlays for readability */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40" />
                            </div>

                            {/* Share Button - Top Right */}
                            <button
                                className="absolute top-20 right-6 z-20 w-12 h-12 bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center rounded-2xl text-white hover:bg-white/20 transition-all"
                                onClick={() => {
                                    if (navigator.share) {
                                        const productPath = `/${post.profileSlug}/${post.storeSlug}/${post.product_slug || ''}`
                                        navigator.share({
                                            title: post.title,
                                            text: `Confira este post de ${post.store_name} no iUser!`,
                                            url: window.location.origin + productPath,
                                        }).catch(() => { })
                                    }
                                }}
                            >
                                <Share2 className="w-5 h-5" />
                            </button>

                            {/* Content Bottom Area */}
                            <div className="mt-auto p-6 pb-40 space-y-4 relative z-10">
                                {/* Tag and Time Row */}
                                <div className="flex items-center gap-2">
                                    <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${post.type === 'new_product' ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' :
                                        post.type === 'price_change' ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.5)]' :
                                            'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]'
                                        }`}>
                                        {post.type === 'new_product' ? 'Novo' : post.type === 'price_change' ? 'Editado' : 'Aviso'}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-white/50 text-[10px] font-black uppercase tracking-widest bg-black/40 backdrop-blur-md px-3 py-1 rounded-lg border border-white/5">
                                        <Clock className="w-3 h-3" />
                                        {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>

                                {/* Store Info - Avatar + Name together */}
                                <Link
                                    href={`/${post.profileSlug}/${post.storeSlug}`}
                                    className="inline-flex items-center gap-3 group"
                                >
                                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-black border border-white/10 shadow-lg">
                                        {post.store_logo ? (
                                            <img
                                                src={supabase.storage.from('store-logos').getPublicUrl(post.store_logo).data.publicUrl}
                                                className="w-full h-full object-cover"
                                                alt={post.store_name}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white text-lg font-black italic">
                                                {post.store_name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-white font-black text-sm uppercase tracking-tighter opacity-70 group-hover:opacity-100 transition-opacity">
                                            @{post.storeSlug}
                                        </span>
                                        <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-yellow-500/60">
                                            {userLocation && post.store_location ? (
                                                <>
                                                    <MapPin className="w-2.5 h-2.5" />
                                                    {formatDistance(calcDistanceKm(userLocation.lat, userLocation.lng, post.store_location))}
                                                </>
                                            ) : (
                                                <span>{post.store_name}</span>
                                            )}
                                        </div>
                                    </div>
                                </Link>

                                {/* Product Title */}
                                <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-[0.9] drop-shadow-2xl">
                                    {post.title}
                                </h2>

                                {/* Content */}
                                {post.content && (
                                    <p className="text-neutral-300 text-xs font-medium max-w-[80%] line-clamp-2 mt-2 leading-relaxed">
                                        {post.content}
                                    </p>
                                )}

                                {/* Price */}
                                {post.new_price && (
                                    <div className="mt-4 flex flex-col">
                                        {post.old_price && (
                                            <span className="text-[10px] font-bold text-neutral-500 line-through tracking-wider">
                                                De R$ {post.old_price.toFixed(2).replace('.', ',')}
                                            </span>
                                        )}
                                        <span className="text-3xl font-black italic tracking-tighter text-yellow-500 shadow-black drop-shadow-lg">
                                            R$ {post.new_price.toFixed(2).replace('.', ',')}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Small Store Logo Bottom Right - User request */}
                            <div className="absolute bottom-40 right-6 z-20 group">
                                <Link href={`/${post.profileSlug}/${post.storeSlug}`} className="block">
                                    <div className="w-14 h-14 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 p-1 shadow-2xl transition-all group-hover:scale-110 group-hover:border-yellow-500/50">
                                        {post.store_logo ? (
                                            <img
                                                src={supabase.storage.from('store-logos').getPublicUrl(post.store_logo).data.publicUrl}
                                                className="w-full h-full object-cover rounded-xl grayscale-[0.5] group-hover:grayscale-0 transition-all"
                                                alt={post.store_name}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/40 text-sm font-black italic">
                                                {post.store_name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-1 text-right">
                                        <span className="text-[7px] font-black uppercase tracking-widest text-white/30 bg-black/40 px-2 py-0.5 rounded-full border border-white/5">iUser Verified</span>
                                    </div>
                                </Link>
                            </div>

                            {/* View Details Button */}
                            <div className="absolute bottom-28 left-6 right-6 z-20">
                                <Link
                                    href={`/${post.profileSlug}/${post.storeSlug}/${post.product_slug || ''}`}
                                    className="w-full flex items-center justify-center gap-2 py-4 bg-white hover:bg-yellow-500 text-black rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] transition-all transform active:scale-95 shadow-xl shadow-black/20 group"
                                >
                                    Comprar <ShoppingCart className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </Link>
                            </div>
                        </section>
                    ))}
                </main>
            )}

            <style jsx global>{`
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    )
}