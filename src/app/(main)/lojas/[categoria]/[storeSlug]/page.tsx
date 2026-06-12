// app/(main)/lojas/[categoria]/[storeSlug]/page.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    ArrowLeft,
    Star,
    Clock,
    ShoppingBag,
    MessageCircle,
    Share2,
    MapPin,
    Store as StoreIcon,
    ChevronRight,
} from 'lucide-react'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { dadosMockados, type Store } from '@/app/(main)/inicio/dadoDeLojas'
import { dadosDosProdutos, type Product } from '@/app/(main)/inicio/dadoDeProdutos'
import { agendamentosMockados, type Appointment } from '@/app/(main)/inicio/dadosDeAgendamentos'
import { supabase } from '@/lib/supabase/client'

type BgMode = 'animated' | 'black' | 'custom'

const categoriasInfo: Record<string, { titulo: string; cor: string; bgGradient: string }> = {
    restaurantes: { titulo: 'Restaurante', cor: '#F97316', bgGradient: 'from-orange-500 to-red-500' },
    mercados: { titulo: 'Mercado', cor: '#10B981', bgGradient: 'from-green-500 to-emerald-600' },
    farmacias: { titulo: 'Farmácia', cor: '#3B82F6', bgGradient: 'from-blue-500 to-indigo-600' },
    petshops: { titulo: 'Pet Shop', cor: '#EC4899', bgGradient: 'from-pink-500 to-rose-500' },
    fitness: { titulo: 'Fitness', cor: '#8B5CF6', bgGradient: 'from-purple-500 to-violet-600' },
    roupas: { titulo: 'Roupas', cor: '#F59E0B', bgGradient: 'from-yellow-500 to-amber-600' },
    entregas: { titulo: 'Entregas', cor: '#06B6D4', bgGradient: 'from-cyan-500 to-blue-600' },
}

function findStore(categoria: string, slug: string): Store | undefined {
    const stores = dadosMockados[categoria] || []
    return stores.find((store) => store.storeSlug === slug)
}

export default function StorePage() {
    const params = useParams<{ categoria: string; storeSlug: string }>()
    const router = useRouter()
    const categoria = params.categoria
    const storeSlug = params.storeSlug

    const store = findStore(categoria, storeSlug)
    const info = categoriasInfo[categoria]
    const products: Product[] = dadosDosProdutos[storeSlug] ?? []
    const appointments: Appointment[] = agendamentosMockados
    const storeAppointments = appointments.filter((a) => a.store_slug === storeSlug)

    // Fundo e avatar do usuário logado
    const [bgMode, setBgMode] = useState<BgMode>('black')
    const [customBgUrl, setCustomBgUrl] = useState<string | null>(null)
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                supabase
                    .from('profiles')
                    .select('avatar_url, background_mode, background_image_url')
                    .eq('id', session.user.id)
                    .single()
                    .then(({ data }) => {
                        if (data) {
                            if (data.avatar_url) {
                                // URL pública
                                const publicUrl = data.avatar_url.startsWith('http')
                                    ? data.avatar_url
                                    : supabase.storage.from('avatars').getPublicUrl(data.avatar_url).data.publicUrl
                                setAvatarUrl(publicUrl)
                            }
                            if (data.background_mode) setBgMode(data.background_mode)
                            if (data.background_image_url) setCustomBgUrl(data.background_image_url)
                        }
                    })
            }
        })
    }, [])

    if (!store || !info) {
        return (
            <div className="relative min-h-screen flex items-center justify-center bg-black text-white">
                <AnimatedBackgroundiUser bgMode="black" />
                <div className="relative z-10 text-center">
                    <h1 className="text-2xl font-black mb-4">Loja não encontrada</h1>
                    <button onClick={() => router.back()} className="text-purple-400 font-bold hover:underline">
                        <ArrowLeft className="w-5 h-5 inline mr-1" /> Voltar
                    </button>
                </div>
            </div>
        )
    }

    const isOpen = store.is_open
    const prepTimeStr =
        store.prep_time_min != null
            ? store.prep_time_max != null && store.prep_time_max > 0
                ? `${store.prep_time_min}–${store.prep_time_max} min`
                : store.prep_time_min === 0
                    ? 'Presencial'
                    : `${store.prep_time_min} min`
            : 'Indisponível'

    return (
        <div className="relative min-h-dvh" style={{ background: '#000' }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh pb-24" style={{ overscrollBehavior: 'none' }}>
                {/* HEADER STICKY */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #000000, #000000)',
                        padding: '20px 24px',
                        color: '#ffffff',
                        borderBottomLeftRadius: 36,
                        borderBottomRightRadius: 36,
                        boxShadow: '0 10px 40px rgba(255,255,255,0.25)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        overflow: 'hidden',
                    }}
                >
                    {/* Avatar do usuário logado como imagem decorativa */}
                    <div
                        style={{
                            position: 'absolute',
                            right: -20,
                            top: -20,
                            opacity: 0.4,
                            transform: 'rotate(10deg)',
                            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                        }}
                    >
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="" style={{ width: 280, height: 280, objectFit: 'cover' }} />
                        ) : (
                            <img src="/logotransparente.png" alt="Logo" style={{ width: 280, height: 280, objectFit: 'contain' }} />
                        )}
                    </div>

                    <div className="relative z-10">
                        {/* Botão voltar + nome da loja */}
                        <div className="flex items-center gap-3 mb-1">
                            <button
                                onClick={() => router.back()}
                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: 'none', cursor: 'pointer' }}
                            >
                                <ArrowLeft size={20} color="#fff" />
                            </button>
                            <h2 className="text-lg font-semibold opacity-90 truncate">{store.name}</h2>
                        </div>

                        {/* Badge da categoria */}
                        <span
                            className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mt-2"
                            style={{ background: `${info.cor}20`, color: info.cor }}
                        >
                            {info.titulo}
                        </span>
                    </div>
                </div>

                <div className="px-4 pt-6 space-y-6">
                    {/* HERO DA LOJA */}
                    <div className="rounded-3xl overflow-hidden shadow-xl relative">
                        <div className={`absolute inset-0 bg-gradient-to-r ${info.bgGradient} opacity-90`} />
                        <div className="relative p-6 text-white">
                            <div className="flex items-start gap-4">
                                {store.logo_url && (
                                    <img
                                        src={store.logo_url}
                                        alt={store.name}
                                        className="w-16 h-16 rounded-xl object-cover border-2 border-white/30 shrink-0"
                                    />
                                )}
                                <div className="flex-1">
                                    <h1 className="text-2xl font-black">{store.name}</h1>
                                    <div className="flex items-center gap-2 mt-1 text-sm">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isOpen ? 'bg-green-500' : 'bg-red-500'}`}>
                                            {isOpen ? 'Aberto agora' : 'Fechado'}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                            {store.ratings_avg} ({store.ratings_count})
                                        </span>
                                    </div>
                                    <p className="text-sm opacity-90 mt-2">{store.description}</p>
                                </div>
                                <ShoppingBag className="w-8 h-8 opacity-80 hidden sm:block" />
                            </div>

                            {/* Botões de ação */}
                            <div className="flex flex-wrap gap-2 mt-4">
                                <button className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 hover:bg-white/30 transition">
                                    <MessageCircle size={14} />
                                    WhatsApp
                                </button>
                                <button className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 hover:bg-white/30 transition">
                                    <StoreIcon size={14} />
                                    Seguir loja
                                </button>
                                <button className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 hover:bg-white/30 transition">
                                    <Share2 size={14} />
                                    Compartilhar
                                </button>
                                {store.address && (
                                    <button className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 hover:bg-white/30 transition">
                                        <MapPin size={14} />
                                        {store.address}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* CARDS DE INFO (Avaliação, Tempo, Preço) */}
                    <div className="grid grid-cols-3 gap-3">
                        <div
                            className="rounded-2xl p-4 text-center border"
                            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.1)' }}
                        >
                            <Star size={20} className="mx-auto text-yellow-400 fill-yellow-400" />
                            <p className="text-lg font-black text-white mt-1">{store.ratings_avg}</p>
                            <p className="text-[10px] font-bold uppercase text-white/40">Avaliações</p>
                        </div>
                        <div
                            className="rounded-2xl p-4 text-center border"
                            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.1)' }}
                        >
                            <Clock size={20} className="mx-auto text-purple-400" />
                            <p className="text-lg font-black text-white mt-1">{prepTimeStr}</p>
                            <p className="text-[10px] font-bold uppercase text-white/40">Tempo</p>
                        </div>
                        <div
                            className="rounded-2xl p-4 text-center border"
                            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.1)' }}
                        >
                            <ShoppingBag size={20} className="mx-auto text-green-400" />
                            <p className="text-lg font-black text-white mt-1">
                                R$ {store.price_min?.toFixed(0) ?? '?'}+
                            </p>
                            <p className="text-[10px] font-bold uppercase text-white/40">A partir</p>
                        </div>
                    </div>

                    {/* PRODUTOS */}
                    <section>
                        <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                            <ShoppingBag size={20} className="text-purple-400" />
                            Produtos
                        </h2>
                        {products.length === 0 ? (
                            <div
                                className="rounded-2xl p-6 text-center border border-dashed"
                                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)' }}
                            >
                                <p className="text-sm font-bold text-white/50">Nenhum produto disponível</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {products.map((product) => (
                                    <div
                                        key={product.id}
                                        className="rounded-2xl overflow-hidden border hover:scale-[1.02] transition-transform"
                                        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.1)' }}
                                    >
                                        <div className="h-32 bg-white/10">
                                            {product.image_url && (
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <h3 className="font-black text-white text-sm truncate">{product.name}</h3>
                                            <p className="text-[11px] text-white/60 line-clamp-2 mt-1">{product.description}</p>
                                            <p className="text-green-400 font-black mt-2">R$ {product.price.toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* AGENDAMENTOS */}
                    <section>
                        <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                            <Clock size={20} className="text-purple-400" />
                            Agendamentos
                        </h2>
                        {storeAppointments.length === 0 ? (
                            <div
                                className="rounded-2xl p-6 text-center border border-dashed"
                                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)' }}
                            >
                                <p className="text-sm font-bold text-white/50">Nenhum agendamento nesta loja</p>
                            </div>
                        ) : (
                            <div
                                className="rounded-2xl p-4 space-y-4 border"
                                style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.1)' }}
                            >
                                {storeAppointments.map((appt) => (
                                    <div key={appt.id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={appt.customer_avatar_url}
                                                alt=""
                                                className="w-10 h-10 rounded-full object-cover border border-white/20"
                                            />
                                            <div>
                                                <p className="text-sm font-bold text-white">@{appt.customer_slug}</p>
                                                <p className="text-[10px] text-white/50">
                                                    {appt.date} • {appt.time} • {appt.people_count > 1 ? `${appt.people_count} pessoas` : 'sozinho'}
                                                </p>
                                            </div>
                                        </div>
                                        <span
                                            className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${appt.status === 'confirmed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                                }`}
                                        >
                                            {appt.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    )
}