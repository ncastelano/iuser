'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Store, ShoppingBag, ArrowUpRight, Clock, MapPin } from 'lucide-react'
import Link from 'next/link'

export default function FlashPage() {
    const [posts, setPosts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        const fetchPosts = async () => {
            const { data, error } = await supabase
                .from('flash_posts_with_stores')
                .select('*')
                .order('created_at', { ascending: false })

            if (!error && data) {
                setPosts(data)
            }
            setLoading(false)
        }

        fetchPosts()
    }, [])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )
    }

    return (
        <div className="relative min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black overflow-x-hidden">
            {/* Background Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-yellow-600/5 blur-[130px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 sm:py-12">
                <header className="flex items-center justify-between mb-12">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-yellow-500 text-black rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.2)]">
                                <Zap className="w-8 h-8 fill-black" />
                            </div>
                            <h1 className="text-5xl md:text-7xl font-black tracking-tighter italic uppercase text-white leading-none">
                                Flash<span className="text-yellow-500">.</span>
                            </h1>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500 ml-1">Feed de novidades em tempo real</p>
                    </div>
                </header>

                {posts.length === 0 ? (
                    <div className="py-32 text-center rounded-[40px] border border-dashed border-white/5 bg-white/[0.01]">
                        <Zap className="w-16 h-16 text-neutral-800 mx-auto mb-6" />
                        <p className="text-neutral-500 text-xl font-bold uppercase italic tracking-wider">Nada no radar por enquanto...</p>
                        <p className="text-neutral-600 text-xs mt-2 font-black uppercase tracking-widest">Fique atento para as próximas promoções e novidades!</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {posts.map((post) => (
                            <div key={post.id} className="group relative bg-neutral-900/30 border border-white/5 rounded-[40px] overflow-hidden hover:border-white/10 transition-all duration-500 hover:-translate-y-1 shadow-2xl">
                                <div className="p-8">
                                    <div className="flex items-start justify-between mb-6">
                                        <Link href={`/${post.profileSlug}/${post.storeSlug}`} className="flex items-center gap-4 group/store">
                                            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-black border border-white/10 shadow-xl">
                                                {post.store_logo ? (
                                                    <img src={supabase.storage.from('store-logos').getPublicUrl(post.store_logo).data.publicUrl} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-neutral-800 text-xl font-black italic">{post.store_name?.charAt(0)}</div>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white group-hover/store:text-yellow-500 transition-colors uppercase italic tracking-tighter">{post.store_name}</h3>
                                                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-600 uppercase tracking-widest">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </Link>

                                        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            post.type === 'new_product' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                                            post.type === 'price_change' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                                            'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                        }`}>
                                            {post.type === 'new_product' ? 'Novidade' : post.type === 'price_change' ? 'Promoção' : 'Aviso'}
                                        </div>
                                    </div>

                                    <div className="space-y-4 mb-8">
                                        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white leading-tight">{post.title}</h2>
                                        <p className="text-neutral-400 leading-relaxed text-sm">{post.content}</p>
                                    </div>

                                    {post.product_id && (
                                        <div className="relative aspect-video rounded-3xl overflow-hidden mb-8 bg-neutral-950 border border-white/5 group/img">
                                            {post.image_url ? (
                                                <img src={supabase.storage.from('product-images').getPublicUrl(post.image_url).data.publicUrl} className="w-full h-full object-cover grayscale-[0.3] group-hover/img:grayscale-0 transition-all duration-700" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-neutral-900 text-6xl font-black italic">PRODUTO</div>
                                            )}
                                            
                                            {post.new_price && (
                                                <div className="absolute bottom-6 right-6 px-6 py-3 bg-white text-black rounded-2xl shadow-2xl flex flex-col items-end">
                                                    {post.old_price && (
                                                        <span className="text-[10px] font-black uppercase text-neutral-400 line-through tracking-widest">De R$ {post.old_price.toFixed(2).replace('.', ',')}</span>
                                                    )}
                                                    <span className="text-2xl font-black italic tracking-tighter">R$ {post.new_price.toFixed(2).replace('.', ',')}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <Link 
                                        href={`/${post.profileSlug}/${post.storeSlug}${post.product_slug ? `/${post.product_slug}` : ''}`}
                                        className="flex items-center justify-center gap-2 w-full py-5 bg-white/5 hover:bg-white text-white hover:text-black border border-white/10 hover:border-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] transition-all group/btn"
                                    >
                                        Ver detalhes <ArrowUpRight className="w-4 h-4 group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
