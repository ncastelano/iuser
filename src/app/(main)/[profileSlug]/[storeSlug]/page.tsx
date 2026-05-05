// src/app/(app)/[profileSlug]/[storeSlug]/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
    AlertTriangle,
    ArrowLeft,
    Check,
    CheckCircle2,
    Copy,
    Calendar,
    MessageCircle,
    Plus,
    Search,
    Share2,
    Trash2,
    Clock,
    MapPin,
    ExternalLink,
    Settings,
    ArrowDown,
    ArrowUp,
    Sparkles,
    Store,
    Zap,
    ShoppingBag
} from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleModal } from '@/components/ScheduleModal'
import { useCartStore } from '@/store/useCartStore'
import { getAvatarUrl } from '@/lib/avatar'
import AnimatedBackground from '@/components/AnimatedBackground'
import { RatingStars } from '@/components/ratings/RatingStars'

type RatingRow = {
    id: string
    rating: number
    profile_id: string
    created_at: string
    profiles?: {
        id: string
        name: string | null
        avatar_url: string | null
        profileSlug?: string | null
    } | null
}

type SaleType = {
    id: string
    buyer_id: string
    buyer_name: string
    product_id: string
    product_name: string
    store_id: string
    created_at: string
    profiles?: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
}

type AppointmentType = {
    id: string
    start_time: string
    service_name: string
    status: string
    client_id: string
    store_id: string
    profiles?: {
        avatar_url: string | null
        name: string | null
        profileSlug: string | null
    } | null
}

type StoreType = {
    id: string
    name: string
    storeSlug: string
    description?: string | null
    address?: string | null
    is_open: boolean
    logo_url?: string | null
    ratings_avg?: number | null
    ratings_count?: number | null
    owner_id: string
    final_whatsapp?: string | null
    whatsapp?: string | null
    category_order?: string[] | null
    allow_scheduling?: boolean
}

const formatAddress = (fullAddress: string | null | undefined): string => {
    if (!fullAddress) return 'Endereço não informado'
    const parts = fullAddress.split(',').map(p => p.trim())
    if (parts.length >= 2) {
        const streetWithNumber = parts[0]
        let city = ''
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i]
            if (!/^[A-Z]{2}$/.test(part) &&
                part.toLowerCase() !== 'brasil' &&
                part.length > 2 &&
                !part.includes('CEP')) {
                city = part
                break
            }
        }
        const result = city ? `${streetWithNumber}, ${city}` : streetWithNumber
        return result.length > 30 ? result.substring(0, 27) + '...' : result
    }
    return fullAddress.length > 30 ? fullAddress.substring(0, 27) + '...' : fullAddress
}

export default function StorePage() {
    const params = useParams()
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    const router = useRouter()

    const [store, setStore] = useState<StoreType | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [ratings, setRatings] = useState<RatingRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isOwner, setIsOwner] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [showShareMenu, setShowShareMenu] = useState(false)
    const [copied, setCopied] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [myRating, setMyRating] = useState(0)
    const [ratingLoading, setRatingLoading] = useState(false)
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
    const [recentSales, setRecentSales] = useState<SaleType[]>([])
    const [appointmentsToday, setAppointmentsToday] = useState<AppointmentType[]>([])
    const [cartAnimating, setCartAnimating] = useState(false)
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
    const [categoryOrder, setCategoryOrder] = useState<string[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const { itemsByStore, addItem, removeItem } = useCartStore()
    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const [supabase] = useState(() => createClient())

    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const query = searchQuery.toLowerCase()
        return products.filter((p) =>
            p.name?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query)
        )
    }, [products, searchQuery])

    const groupedProducts = useMemo(() => {
        const groups: Record<string, any[]> = {}
        filteredProducts.forEach(product => {
            const cat = product.category || 'Geral'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(product)
        })
        const sortedGroups: Record<string, any[]> = {}
        const allCats = Object.keys(groups)
        const sortedCats = [...allCats].sort((a, b) => {
            const indexA = categoryOrder.indexOf(a)
            const indexB = categoryOrder.indexOf(b)
            if (indexA === -1 && indexB === -1) return a.localeCompare(b)
            if (indexA === -1) return 1
            if (indexB === -1) return -1
            return indexA - indexB
        })
        sortedCats.forEach(cat => { sortedGroups[cat] = groups[cat] })
        return sortedGroups
    }, [filteredProducts, categoryOrder])

    const toggleCategory = (cat: string) => {
        const newCollapsed = new Set(collapsedCategories)
        if (newCollapsed.has(cat)) newCollapsed.delete(cat)
        else newCollapsed.add(cat)
        setCollapsedCategories(newCollapsed)
    }

    const moveCategory = async (cat: string, direction: 'up' | 'down') => {
        if (!store) return
        const allCats = Object.keys(groupedProducts)
        const index = allCats.indexOf(cat)
        if (index === -1) return
        const newOrder = [...allCats]
        if (direction === 'up' && index > 0) [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]]
        else if (direction === 'down' && index < newOrder.length - 1) [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
        else return
        setCategoryOrder(newOrder)
        await supabase.from('stores').update({ category_order: newOrder }).eq('id', store.id)
    }

    const toggleScheduling = async () => {
        if (!store) return
        const newStatus = !store.allow_scheduling
        const { error } = await supabase.from('stores').update({ allow_scheduling: newStatus }).eq('id', store.id)
        if (error) { toast.error('Erro ao atualizar permissão de agendamentos.'); return }
        setStore(prev => prev ? { ...prev, allow_scheduling: newStatus } : null)
        toast.success(newStatus ? 'Agendamentos permitidos!' : 'Agendamentos cancelados.')
    }

    useEffect(() => { setMounted(true) }, [])

    const storeUrl = useMemo(() => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        return `${baseUrl}/${profileSlug}/${storeSlug}`
    }, [profileSlug, storeSlug])

    const loadRatings = useCallback(async (storeId: string, userId: string | null) => {
        const { data, error: ratingsError } = await supabase
            .from('store_ratings')
            .select('id, rating, profile_id, created_at, profiles(id, name, avatar_url, "profileSlug")')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })
        if (ratingsError) return
        const rows = (data || []).map((r: any) => ({
            ...r,
            profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        })) as RatingRow[]
        setRatings(rows)
        if (rows.length > 0) {
            const sum = rows.reduce((acc, r) => acc + r.rating, 0)
            const avg = sum / rows.length
            setStore((prev: StoreType | null) => prev ? { ...prev, ratings_avg: avg, ratings_count: rows.length } : null)
        }
        setMyRating(rows.find((rating) => rating.profile_id === userId)?.rating ?? 0)
    }, [supabase])

    const loadStore = useCallback(async () => {
        if (!storeSlug) return
        setLoading(true)
        setError(null)
        const { data: foundStore, error: storeError } = await supabase
            .from('stores').select('*').ilike('storeSlug', storeSlug).maybeSingle()
        if (storeError) { setError(`Erro ao buscar loja: ${storeError.message}`); setLoading(false); return }
        if (!foundStore) { setLoading(false); return }

        const logoUrl = foundStore.logo_url
            ? supabase.storage.from('store-logos').getPublicUrl(foundStore.logo_url).data.publicUrl : null
        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id ?? null
        setCurrentUserId(userId)
        setIsOwner(userId === foundStore.owner_id)

        if (userId && userId !== foundStore.owner_id) {
            supabase.from('store_views').insert({ store_id: foundStore.id, viewer_id: userId })
                .then(({ error: viewError }) => { if (viewError) console.warn('[StorePage] View:', viewError.message) })
        }

        const { data: productsData } = await supabase.from('products').select('*').eq('store_id', foundStore.id).order('created_at', { ascending: false })
        const mappedProducts = (productsData || []).map((product) => ({
            ...product,
            image_url: product.image_url ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl : null,
        }))

        let storeWhatsapp = foundStore.whatsapp
        if (!storeWhatsapp && foundStore.owner_id) {
            const { data: profile } = await supabase.from('profiles').select('whatsapp').eq('id', foundStore.owner_id).single()
            storeWhatsapp = profile?.whatsapp
        }

        setStore({ ...foundStore, logo_url: logoUrl, final_whatsapp: storeWhatsapp })
        setCategoryOrder(foundStore.category_order || [])
        setProducts(mappedProducts)
        await loadRatings(foundStore.id, userId)

        // Appointments
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString()
        const { data: todayData } = await supabase
            .from('appointments').select('*, profiles:client_id(avatar_url, name, "profileSlug")')
            .eq('store_id', foundStore.id).gte('start_time', startOfDay).lte('start_time', endOfDay)
            .neq('status', 'declined').order('start_time', { ascending: true })
        setAppointmentsToday((todayData || []).map((item: any) => ({
            ...item, profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
        })))

        // Sales
        const { data: salesData } = await supabase
            .from('store_sales').select('*, profiles:buyer_id(avatar_url, name, "profileSlug")')
            .eq('store_id', foundStore.id).order('created_at', { ascending: false }).limit(10)
        setRecentSales((salesData || []).map((item: any) => ({
            ...item, profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
        })))

        setLoading(false)
    }, [loadRatings, storeSlug, supabase])

    useEffect(() => { loadStore() }, [loadStore])

    const submitRating = async (rating: number) => {
        if (!store) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { toast.info('Entre na sua conta para avaliar.'); router.push('/login'); return }
        setRatingLoading(true)
        const { error: upsertError } = await supabase.from('store_ratings').upsert({
            store_id: store.id, profile_id: user.id, rating,
        }, { onConflict: 'store_id,profile_id' })
        if (upsertError) { toast.error('Não foi possível salvar sua avaliação.'); setRatingLoading(false); return }

        const { data: allRatings } = await supabase.from('store_ratings').select('rating').eq('store_id', store.id)
        if (allRatings?.length) {
            const count = allRatings.length
            const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / count
            await supabase.from('stores').update({ ratings_avg: avg, ratings_count: count }).eq('id', store.id)
        }
        setMyRating(rating)
        await loadStore()
        setRatingLoading(false)
        toast.success('Avaliação enviada!')
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-orange-600 text-sm font-bold">Carregando loja...</p>
            </div>
        </div>
    )

    if (error || !store) return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 px-4 text-center">
            <div className="flex flex-col gap-4 max-w-sm items-center">
                {error ? <AlertTriangle className="w-12 h-12 text-red-500" /> : <Search className="w-12 h-12 text-orange-300" />}
                <h2 className="text-2xl font-black text-gray-800">{error ? 'Erro ao carregar' : 'Loja não encontrada'}</h2>
                <p className="text-gray-600 text-sm">{error || `Nenhuma loja com /${storeSlug} foi encontrada.`}</p>
                <button onClick={() => router.push('/')} className="text-orange-500 hover:text-orange-600 font-bold mt-2">Voltar</button>
            </div>
        </div>
    )

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-28">
            <AnimatedBackground />
            <style jsx global>{`@keyframes float{0%,100%{transform:translateY(0px) rotate(0deg)}50%{transform:translateY(-15px) rotate(5deg)}}`}</style>

            {store && <ScheduleModal isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} onSuccess={loadStore}
                store={{ id: store.id, name: store.name, storeSlug: store.storeSlug }} />}

            {/* Header Compacto */}
            <header className="sticky top-0 z-50 px-3 py-2.5 border-b border-orange-200/30 bg-white/70 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button onClick={() => router.push('/')}
                            className="flex w-9 h-9 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm flex-shrink-0">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-sm font-black text-gray-800 truncate">{store.name}</h1>
                            <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${store.is_open ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                                <span className="text-[8px] font-black uppercase tracking-wider text-gray-400">
                                    {store.is_open ? 'Aberto' : 'Fechado'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isOwner && (
                            <button onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/editar-loja`)}
                                className="flex w-8 h-8 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:border-orange-500 transition-all shadow-sm">
                                <Settings className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                        )}
                        <button onClick={() => {
                            if (navigator.share) navigator.share({ title: store.name, url: storeUrl }).catch(() => { })
                            else setShowShareMenu(true)
                        }} className="flex w-8 h-8 items-center justify-center bg-white/80 border border-orange-200 rounded-xl hover:border-orange-500 transition-all shadow-sm">
                            <Share2 className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 px-3 py-4 flex flex-col gap-4">
                {/* Logo + Nome + Badges */}
                <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg flex-shrink-0 border-2 border-white">
                        {store.logo_url ? (
                            <img src={store.logo_url} className="w-full h-full object-cover rounded-full" alt="" />
                        ) : (
                            <span className="text-xl font-black text-white">{store.name?.charAt(0)}</span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent truncate">
                            {store.name}
                        </h2>
                        {store.description && <p className="text-[11px] text-gray-500 line-clamp-1">{store.description}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <div className="flex items-center gap-1 text-[10px] font-black text-orange-500">
                                <Zap className="w-2.5 h-2.5" />
                                {Number(store.ratings_avg || 0).toFixed(1)}
                                <span className="text-gray-300">({store.ratings_count ?? 0})</span>
                            </div>
                            <RatingStars value={Number(store.ratings_avg || 0)} size={10} onChange={!isOwner ? submitRating : undefined} />
                        </div>
                    </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center gap-2 flex-wrap">
                    {store.address && (
                        <button onClick={() => {
                            if (store.address) {
                                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`, '_blank')
                            }
                        }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-red-50 border border-red-200 hover:bg-red-500 hover:text-white transition-all group shadow-sm">
                            <MapPin className="w-3 h-3 text-red-500 group-hover:text-white" />
                            <span className="text-[9px] font-black uppercase text-red-500 group-hover:text-white truncate max-w-[120px]">
                                {formatAddress(store.address)}
                            </span>
                        </button>
                    )}

                    {store.allow_scheduling && (
                        <button onClick={() => setIsScheduleModalOpen(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-[9px] uppercase shadow-md">
                            <Calendar className="w-3 h-3" /> Agendar
                        </button>
                    )}

                    {isOwner && (
                        <button onClick={toggleScheduling}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border font-black text-[9px] uppercase ${store.allow_scheduling ? 'bg-red-50 border-red-200 text-red-500' : 'bg-green-50 border-green-200 text-green-500'}`}>
                            {store.allow_scheduling ? 'Bloquear' : 'Permitir'}
                        </button>
                    )}
                </div>

                {/* Ratings + Avatares */}
                {ratings.length > 0 && (
                    <div className="flex items-center justify-between bg-white/50 rounded-xl p-2.5 border border-orange-100">
                        <div className="flex items-center gap-2">
                            <RatingStars value={Number(store.ratings_avg || 0)} size={12} onChange={!isOwner ? submitRating : undefined} />
                            <span className="text-xs font-black text-gray-700">{Number(store.ratings_avg || 0).toFixed(1)}</span>
                            <button onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/avaliacoes`)}
                                className="text-[9px] font-bold text-orange-500">({store.ratings_count ?? 0})</button>
                            {myRating > 0 && (
                                <span className="text-[8px] font-black text-green-500 bg-green-50 px-1.5 py-0.5 rounded-full">✓</span>
                            )}
                        </div>
                        <div className="flex -space-x-1.5">
                            {ratings.slice(0, 3).map((r, i) => (
                                <div key={i} className="w-6 h-6 rounded-full ring-1 ring-white border border-orange-200 bg-white overflow-hidden">
                                    {r.profiles?.avatar_url ? (
                                        <img src={getAvatarUrl(supabase, r.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[7px] font-bold text-gray-400">
                                            {r.profiles?.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}



                {/* Agendamentos Hoje - NOVO DESIGN PREMIUM */}
                {appointmentsToday.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
                                <Clock className="w-3 h-3 text-blue-500" />
                                <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 whitespace-nowrap">
                                    Agendados Hoje
                                </h3>
                            </div>
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {appointmentsToday.slice(0, 4).map((appt, i) => (
                                <div
                                    key={appt.id || i}
                                    onClick={() => appt.profiles?.profileSlug && router.push(`/${appt.profiles.profileSlug}`)}
                                    className="group bg-white/70 backdrop-blur-sm border border-blue-100 rounded-2xl p-3 hover:border-blue-300 hover:bg-white hover:shadow-lg transition-all duration-300 cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="relative">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-md ring-2 ring-blue-100">
                                                {appt.profiles?.avatar_url ? (
                                                    <img
                                                        src={getAvatarUrl(supabase, appt.profiles.avatar_url)!}
                                                        className="w-full h-full object-cover rounded-full"
                                                        alt=""
                                                    />
                                                ) : (
                                                    <span className="text-xs font-black text-white">
                                                        {appt.profiles?.name?.charAt(0) || '?'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 bg-orange-500 rounded-full px-1.5 py-0.5 ring-2 ring-white flex items-center">
                                                <Clock className="w-2 h-2 text-white mr-0.5" />
                                                <span className="text-[6px] font-black text-white">
                                                    {new Date(appt.start_time).toLocaleTimeString('pt-BR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-gray-800 truncate leading-tight">
                                                {appt.profiles?.name || 'Cliente'}
                                            </p>
                                            <p className="text-[8px] font-black text-blue-500 uppercase tracking-wider">
                                                Agendado
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-2 border border-blue-100/50">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                                                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                                            </div>
                                            <p className="text-[9px] font-bold text-gray-700 truncate leading-tight">
                                                {appt.service_name || 'Agendamento'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Botão Adicionar Produto (dono) */}
                {isOwner && (
                    <button onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/criar-produto`)}
                        className="w-full py-2 rounded-xl text-[10px] font-black uppercase bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md">
                        <Plus className="w-3 h-3 inline mr-1" /> Adicionar Produto
                    </button>
                )}

                {/* Cardápio */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-orange-200 pb-2">
                        <h3 className="text-base font-black italic text-gray-800">Cardápio</h3>
                        <span className="text-[10px] font-black text-orange-500">{filteredProducts.length} itens</span>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-400" />
                        <input type="text" placeholder="procurar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-orange-200 rounded-xl py-2 pl-8 pr-3 text-xs text-gray-800 placeholder:text-orange-300 focus:outline-none focus:border-orange-500 transition-all" />
                    </div>

                    {filteredProducts.length === 0 ? (
                        <div className="py-8 text-center rounded-xl border border-dashed border-orange-200 bg-white/50">
                            <Search className="w-6 h-6 text-orange-300 mx-auto mb-1" />
                            <p className="text-gray-400 font-bold text-[10px] uppercase">Nenhum produto</p>
                        </div>
                    ) : (
                        Object.entries(groupedProducts).map(([category, products], catIndex) => {
                            const isCollapsed = collapsedCategories.has(category)
                            return (
                                <div key={category} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-[8px] font-black uppercase tracking-[0.3em] bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent flex-1">{category}</h4>
                                        <div className="flex items-center gap-1">
                                            {isOwner && (
                                                <div className="flex items-center gap-0.5">
                                                    <button disabled={catIndex === 0} onClick={() => moveCategory(category, 'up')}
                                                        className="p-0.5 hover:bg-orange-100 rounded text-gray-400 disabled:opacity-20"><ArrowUp className="w-2.5 h-2.5" /></button>
                                                    <button disabled={catIndex === Object.keys(groupedProducts).length - 1} onClick={() => moveCategory(category, 'down')}
                                                        className="p-0.5 hover:bg-orange-100 rounded text-gray-400 disabled:opacity-20"><ArrowDown className="w-2.5 h-2.5" /></button>
                                                </div>
                                            )}
                                            <button onClick={() => toggleCategory(category)}
                                                className="w-5 h-5 flex items-center justify-center bg-white border border-orange-200 rounded-lg hover:border-orange-400 transition-all">
                                                {isCollapsed ? <Plus className="w-2.5 h-2.5 text-orange-500" /> : <div className="w-2 h-0.5 bg-orange-500" />}
                                            </button>
                                        </div>
                                    </div>

                                    {!isCollapsed && (
                                        <div className="space-y-2">
                                            {products.map((product) => (
                                                <div key={product.id}
                                                    onClick={() => {
                                                        if (isOwner) router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`)
                                                        else {
                                                            addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url ?? null }, product)
                                                            setCartAnimating(true)
                                                            setTimeout(() => setCartAnimating(false), 500)
                                                        }
                                                    }}
                                                    className="flex items-center gap-3 bg-white/70 border border-orange-100 rounded-xl p-2.5 hover:border-orange-300 hover:bg-white transition-all cursor-pointer shadow-sm"
                                                >
                                                    <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-orange-100 to-red-100 overflow-hidden flex-shrink-0 border border-orange-200">
                                                        {product.image_url ? (
                                                            <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-orange-300 text-[8px] font-bold">Sem foto</div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-bold text-gray-800 line-clamp-1">{product.name}</h4>
                                                        <p className="text-[10px] text-gray-400 line-clamp-1">{product.description || "Sem descrição"}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <p className="text-sm font-black text-orange-600">
                                                                R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </p>
                                                            {product.type && (
                                                                <span className="text-[7px] font-bold uppercase text-orange-400 bg-orange-50 px-1.5 py-0.5 rounded-full">
                                                                    {product.type === 'physical' ? 'Produto' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex-shrink-0">
                                                        {isOwner ? (
                                                            <button onClick={(e) => { e.stopPropagation(); router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`) }}
                                                                className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase bg-white border border-orange-200 text-orange-500 hover:bg-orange-500 hover:text-white transition-all">
                                                                Editar
                                                            </button>
                                                        ) : mounted && cartItems.some((item: any) => item.product.id === product.id) ? (
                                                            <div className="flex items-center gap-1">
                                                                <button onClick={(e) => { e.stopPropagation(); router.push('/sacola') }}
                                                                    className="w-7 h-7 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white flex items-center justify-center shadow-md">
                                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); removeItem(storeSlug as string, product.id) }}
                                                                    className="w-7 h-7 rounded-full bg-red-50 border border-red-200 text-red-500 flex items-center justify-center">
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button onClick={(e) => { e.stopPropagation(); router.push(`/${profileSlug}/${store.storeSlug}/${product.slug || product.id}`) }}
                                                                className="w-7 h-7 rounded-full bg-white border border-orange-200 text-orange-500 hover:bg-orange-500 hover:text-white transition-all flex items-center justify-center shadow-sm">
                                                                <ExternalLink className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
                {/* Vendas Recentes - NOVO DESIGN PREMIUM */}
                {recentSales.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-full border border-orange-100">
                                <Sparkles className="w-3 h-3 text-orange-500" />
                                <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-600 whitespace-nowrap">
                                    Compraram aqui
                                </h3>
                            </div>
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {recentSales.slice(0, 4).map((sale, i) => (
                                <div
                                    key={sale.id || i}
                                    className="group bg-white/70 backdrop-blur-sm border border-orange-100 rounded-2xl p-3 hover:border-orange-300 hover:bg-white hover:shadow-lg transition-all duration-300"
                                >
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="relative">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shadow-md ring-2 ring-orange-100">
                                                {sale.profiles?.avatar_url ? (
                                                    <img
                                                        src={getAvatarUrl(supabase, sale.profiles.avatar_url)!}
                                                        className="w-full h-full object-cover rounded-full"
                                                        alt=""
                                                    />
                                                ) : (
                                                    <span className="text-xs font-black text-white">
                                                        {sale.buyer_name?.charAt(0) || '?'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center ring-2 ring-white">
                                                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-gray-800 truncate leading-tight">
                                                {sale.buyer_name || 'Alguém'}
                                            </p>
                                            <p className="text-[8px] font-black text-orange-500 uppercase tracking-wider">
                                                Nova compra
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-2 border border-orange-100/50">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                                                <ShoppingBag className="w-3.5 h-3.5 text-orange-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-bold text-gray-700 truncate leading-tight">
                                                    {sale.product_name}
                                                </p>
                                                <p className="text-[7px] text-gray-400 font-medium">
                                                    {new Date(sale.created_at).toLocaleDateString('pt-BR', {
                                                        day: '2-digit',
                                                        month: 'short'
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {recentSales.length > 4 && (
                            <button
                                onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/clientes`)}
                                className="w-full py-2 text-[10px] font-bold text-orange-500 hover:text-orange-600 transition-colors flex items-center justify-center gap-1"
                            >
                                Ver mais {recentSales.length - 4} compras
                                <ExternalLink className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                )}
                {/* Mensagem final */}
                <div className="pt-4 border-t border-orange-200/30">
                    <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-orange-100">
                        <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                            ✨ <span className="font-black text-orange-600">Mostre ao mundo</span> o que você tem de melhor.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}