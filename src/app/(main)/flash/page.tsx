'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Clock, ArrowUpRight, ShoppingBag, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

export default function FlashPage() {
    const [posts, setPosts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [activeId, setActiveId] = useState<string | null>(null)
    const supabase = createClient()

    useEffect(() => {
        const fetchPosts = async () => {
            const { data, error } = await supabase
                .from('flash_posts_with_stores')
                .select('*')
                .order('created_at', { ascending: false })

            if (!error && data) {
                setPosts(data)
                if (data.length > 0) setActiveId(data[0].id)
            }
            setLoading(false)
        }

        fetchPosts()
    }, [])

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

                            {/* Content Bottom Area */}
                            <div className="mt-auto p-6 pb-24 space-y-4 relative z-10">
                                {/* Tag */}
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

                                {/* Information */}
                                <div className="flex items-end justify-between gap-4">
                                    <div className="flex-1 space-y-1">
                                        <Link href={`/${post.profileSlug}/${post.storeSlug}`} className="inline-flex items-center group">
                                            <span className="text-white font-black text-sm uppercase tracking-tighter opacity-70 group-hover:opacity-100 transition-opacity">
                                                @{post.storeSlug}
                                            </span>
                                        </Link>
                                        <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-[0.9] drop-shadow-2xl">
                                            {post.title}
                                        </h2>
                                        {post.content && (
                                            <p className="text-neutral-300 text-xs font-medium max-w-[80%] line-clamp-2 mt-2 leading-relaxed">
                                                {post.content}
                                            </p>
                                        )}

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

                                    {/* Small Store Logo in Bottom Right (for edited/all) */}
                                    <Link
                                        href={`/${post.profileSlug}/${post.storeSlug}`}
                                        className="relative group shrink-0"
                                    >
                                        <div className="w-16 h-16 rounded-2xl p-[2px] bg-gradient-to-tr from-yellow-500 to-yellow-200 rotate-3 group-hover:rotate-0 transition-transform duration-500 shadow-2xl">
                                            <div className="w-full h-full rounded-[14px] overflow-hidden bg-black border border-white/10">
                                                {post.store_logo ? (
                                                    <img
                                                        src={supabase.storage.from('store-logos').getPublicUrl(post.store_logo).data.publicUrl}
                                                        className="w-full h-full object-cover"
                                                        alt={post.store_name}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white text-xl font-black italic">
                                                        {post.store_name?.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {/* Activity dot */}
                                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-4 border-black rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                    </Link>
                                </div>
                            </div>

                            {/* View Details Button Overlay */}
                            <div className="absolute bottom-6 left-6 right-6 flex gap-3 z-20">
                                <Link
                                    href={`/${post.profileSlug}/${post.storeSlug}${post.product_slug ? `/${post.product_slug}` : ''}`}
                                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-white hover:bg-yellow-500 text-black rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] transition-all transform active:scale-95 shadow-xl shadow-black/20 group"
                                >
                                    Comprar <ShoppingCart className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </Link>
                                <button
                                    className="w-14 h-14 bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center rounded-2xl text-white hover:bg-white/20 transition-all"
                                    onClick={() => {
                                        if (navigator.share) {
                                            navigator.share({
                                                title: post.title,
                                                text: `Confira este produto de ${post.store_name} no Flash!`,
                                                url: window.location.origin + `/${post.profileSlug}/${post.storeSlug}${post.product_slug ? `/${post.product_slug}` : ''}`,
                                            })
                                        }
                                    }}
                                >
                                    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2C10.89 2 10 2.89 10 4V12H4C2.89 12 2 12.89 2 14V20C2 21.11 2.89 22 4 22H20C21.11 22 22 21.11 22 20V4C22 2.89 21.11 2 20 2H12ZM12 4H20V20H4V14H12V4ZM12 4V12H14V4H12Z" style={{ display: 'none' }} />
                                        <path d="M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.97 12.48 9 12.24 9 12C9 11.76 8.97 11.52 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5C21 3.34 19.66 2 18 2C16.34 2 15 3.34 15 5C15 5.24 15.03 5.48 15.09 5.7L8.04 9.81C7.5 9.31 6.79 9 6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C6.79 15 7.5 14.69 8.04 14.19L15.16 18.35C15.11 18.53 15.09 18.73 15.09 18.92C15.09 20.48 16.44 21.84 18 21.84C19.56 21.84 20.91 20.48 20.91 18.92C20.91 17.36 19.56 16.08 18 16.08Z" />
                                    </svg>
                                </button>
                            </div>
                        </section>
                    ))}
                </main>
            )}

            {/* Bottom Nav Spacer for Mobile Browsers */}
            <div className="h-[72px] bg-black shrink-0" />

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
