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
    ShoppingCart,
    Trash2,
    Clock,
    Star,
    MapPin,
    ExternalLink,
    Settings,
    Pencil
} from 'lucide-react'
import { ScheduleModal } from '@/components/ScheduleModal'
import { useCartStore } from '@/store/useCartStore'
import { RatingStars } from '@/components/ratings/RatingStars'
import { getAvatarUrl } from '@/lib/avatar'

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
    const [upcomingAppointments, setUpcomingAppointments] = useState<AppointmentType[]>([])
    const [appointmentsToday, setAppointmentsToday] = useState<AppointmentType[]>([])
    const [recentSales, setRecentSales] = useState<SaleType[]>([])
    const [cartAnimating, setCartAnimating] = useState(false)

    const [searchQuery, setSearchQuery] = useState('')
    const { itemsByStore, addItem, removeItem } = useCartStore()
    const cartItems = typeof storeSlug === 'string' ? (itemsByStore[storeSlug] || []) : []
    const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0)
    const totalPrice = cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
    const [supabase] = useState(() => createClient())

    // Product filtering
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
        return groups
    }, [filteredProducts])


    useEffect(() => {
        setMounted(true)
    }, [])

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

        if (ratingsError) {
            console.error('[StorePage] Erro ao buscar avaliações:', ratingsError)
            return
        }

        const rows = (data || []).map((r: any) => ({
            ...r,
            profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        })) as RatingRow[]
        setRatings(rows)

        // Recalculate average manually to ensure immediate UI update
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
            .from('stores')
            .select('*')
            .ilike('storeSlug', storeSlug)
            .maybeSingle()

        if (storeError) {
            setError(`Erro ao buscar loja: ${storeError.message}`)
            setLoading(false)
            return
        }

        if (!foundStore) {
            setLoading(false)
            return
        }

        const logoUrl = foundStore.logo_url
            ? supabase.storage.from('store-logos').getPublicUrl(foundStore.logo_url).data.publicUrl
            : null

        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id ?? null
        setCurrentUserId(userId)
        setIsOwner(userId === foundStore.owner_id)

        if (userId && userId !== foundStore.owner_id) {
            supabase.from('store_views').insert({
                store_id: foundStore.id,
                viewer_id: userId,
            }).then(({ error: viewError }) => {
                if (viewError) console.error('[StorePage] Erro ao registrar view:', viewError)
            })
        }

        const { data: productsData, error: productsError } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', foundStore.id)
            .order('created_at', { ascending: false })

        if (productsError) {
            console.error('[StorePage] Erro ao buscar produtos:', productsError)
        }

        const mappedProducts = (productsData || []).map((product) => ({
            ...product,
            image_url: product.image_url
                ? supabase.storage.from('product-images').getPublicUrl(product.image_url).data.publicUrl
                : null,
        }))

        // Fetch owner WhatsApp as fallback if store doesn't have one
        let storeWhatsapp = foundStore.whatsapp
        if (!storeWhatsapp && foundStore.owner_id) {
            const { data: profile } = await supabase.from('profiles').select('whatsapp').eq('id', foundStore.owner_id).single()
            storeWhatsapp = profile?.whatsapp
        }

        setStore({ ...foundStore, logo_url: logoUrl, final_whatsapp: storeWhatsapp })
        setProducts(mappedProducts)
        await loadRatings(foundStore.id, userId)

        // Load today's appointments for social proof
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString()

        const { data: todayData } = await supabase
            .from('appointments')
            .select('*, profiles:client_id(avatar_url, name, "profileSlug")')
            .eq('store_id', foundStore.id)
            .gte('start_time', startOfDay)
            .lte('start_time', endOfDay)
            .neq('status', 'declined')
            .order('start_time', { ascending: true })

        // Mapear os dados para o tipo AppointmentType
        const mappedTodayAppointments: AppointmentType[] = (todayData || []).map((item: any) => ({
            id: item.id,
            start_time: item.start_time,
            service_name: item.service_name,
            status: item.status,
            client_id: item.client_id,
            store_id: item.store_id,
            profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
        }))
        setAppointmentsToday(mappedTodayAppointments)

        // Keep upcoming logic if needed elsewhere, but today is the priority here
        const { data: upcomingData } = await supabase
            .from('appointments')
            .select('*, profiles:client_id(avatar_url, name, "profileSlug")')
            .eq('store_id', foundStore.id)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(5)

        const mappedUpcomingAppointments: AppointmentType[] = (upcomingData || []).map((item: any) => ({
            id: item.id,
            start_time: item.start_time,
            service_name: item.service_name,
            status: item.status,
            client_id: item.client_id,
            store_id: item.store_id,
            profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
        }))
        setUpcomingAppointments(mappedUpcomingAppointments)

        // Load recent sales
        const { data: salesData } = await supabase
            .from('store_sales')
            .select('*, profiles:buyer_id(avatar_url, name, "profileSlug")')
            .eq('store_id', foundStore.id)
            .order('created_at', { ascending: false })
            .limit(10)

        const mappedSales: SaleType[] = (salesData || []).map((item: any) => ({
            id: item.id,
            buyer_id: item.buyer_id,
            buyer_name: item.buyer_name,
            product_id: item.product_id,
            product_name: item.product_name,
            store_id: item.store_id,
            created_at: item.created_at,
            profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
        }))
        setRecentSales(mappedSales)

        setLoading(false)
    }, [loadRatings, storeSlug, supabase])

    useEffect(() => {
        if (!store?.id) return

        // Subscribe to real-time sales
        const salesChannel = supabase
            .channel(`public:store_sales:store_id=eq.${store.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'store_sales',
                    filter: `store_id=eq.${store.id}`
                },
                (payload) => {
                    console.log('Nova venda detectada!', payload.new)
                    const newSale = payload.new as any
                    const mappedNewSale: SaleType = {
                        id: newSale.id,
                        buyer_id: newSale.buyer_id,
                        buyer_name: newSale.buyer_name,
                        product_id: newSale.product_id,
                        product_name: newSale.product_name,
                        store_id: newSale.store_id,
                        created_at: newSale.created_at,
                        profiles: null
                    }
                    setRecentSales((prev: SaleType[]) => [mappedNewSale, ...prev].slice(0, 10))
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(salesChannel)
        }
    }, [store?.id, supabase])

    useEffect(() => {
        loadStore()
    }, [loadStore])

    const submitRating = async (rating: number) => {
        if (!store) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            alert('Entre na sua conta para avaliar esta loja.')
            router.push('/login')
            return
        }

        setRatingLoading(true)
        const { error: upsertError } = await supabase
            .from('store_ratings')
            .upsert({
                store_id: store.id,
                profile_id: user.id,
                rating,
            }, { onConflict: 'store_id,profile_id' })

        if (upsertError) {
            console.error('[StorePage] Erro ao salvar avaliação:', upsertError)
            alert('Não foi possível salvar sua avaliação agora.')
            setRatingLoading(false)
            return
        }

        setMyRating(rating)
        await loadStore()
        setRatingLoading(false)
    }

    const toggleStoreStatus = async () => {
        if (!store || !isOwner) return
        const nextIsOpen = !store.is_open

        if (!window.confirm(nextIsOpen ? 'Você quer abrir a loja?' : 'Você quer fechar a loja?')) return

        setStore({ ...store, is_open: nextIsOpen })

        const { error: updateError } = await supabase
            .from('stores')
            .update({ is_open: nextIsOpen })
            .eq('id', store.id)

        if (updateError) {
            console.error('[StorePage] Erro ao atualizar status:', updateError)
            alert('Erro ao alterar o status da loja.')
            setStore({ ...store, is_open: !nextIsOpen })
        }
    }

    const latestRatings = ratings.slice(0, 6)

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground text-sm">Carregando loja...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4 text-center">
                <div className="flex flex-col gap-4 max-w-sm items-center">
                    <AlertTriangle className="w-12 h-12 text-foreground" />
                    <h2 className="text-2xl font-bold">Erro ao carregar</h2>
                    <p className="text-muted-foreground text-sm">{error}</p>
                    <button onClick={() => router.push('/')} className="text-muted-foreground hover:text-foreground hover:underline mt-2">
                        Voltar para a vitrine
                    </button>
                </div>
            </div>
        )
    }

    if (!store) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4 text-center">
                <div className="flex flex-col gap-4 max-w-sm items-center">
                    <Search className="w-12 h-12 text-muted-foreground" />
                    <h2 className="text-2xl font-bold">Loja não encontrada</h2>
                    <p className="text-muted-foreground text-sm">
                        Nenhuma loja com o endereço <span className="text-foreground font-mono">/{storeSlug}</span> foi encontrada.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="relative min-h-screen pb-20 overflow-hidden bg-background text-foreground font-sans selection:bg-primary selection:text-white">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-secondary/20 blur-[100px] rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
            </div>

            {store && (
                <ScheduleModal
                    isOpen={isScheduleModalOpen}
                    onClose={() => setIsScheduleModalOpen(false)}
                    onSuccess={loadStore}
                    store={{
                        id: store.id,
                        name: store.name,
                        storeSlug: store.storeSlug
                    }}
                />
            )}

            {/* Sticky Navigation Header */}
            <header className="sticky top-0 z-50 px-4 py-4 md:px-8 border-b border-border bg-background/60 backdrop-blur-xl transition-all duration-300">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <button
                            onClick={() => router.push('/')}
                            className="group flex w-11 h-11 items-center justify-center bg-secondary/50 border border-border rounded-2xl hover:bg-foreground hover:text-background transition-all duration-300"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div className="min-w-0 flex flex-col">
                            <h1 className="text-xl font-bold truncate tracking-tight">{store.name}</h1>
                            <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${store.is_open ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    {store.is_open ? 'Aberto Agora' : 'Fechado no Momento'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isOwner && (
                            <button
                                onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/editar-loja`)}
                                className="flex w-11 h-11 items-center justify-center bg-secondary border border-border rounded-2xl hover:border-foreground transition-all duration-300 group"
                            >
                                <Settings className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                            </button>
                        )}
                        <button
                            onClick={() => {
                                if (navigator.share) {
                                    navigator.share({ title: store.name, text: store.storeSlug, url: storeUrl }).catch(() => { })
                                } else {
                                    setShowShareMenu(true)
                                }
                            }}
                            className="flex w-11 h-11 items-center justify-center bg-secondary border border-border rounded-2xl hover:border-muted-foreground transition-all duration-300"
                        >
                            <Share2 className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                        </button>
                    </div>
                </div>

                {/* Share Menu */}
                {showShareMenu && (
                    <div className="max-w-7xl mx-auto relative h-0">
                        <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} />
                        <div className="absolute right-0 mt-4 w-72 bg-card border border-border rounded-3xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="p-4 border-b border-border bg-muted/50">
                                <h3 className="font-bold text-sm text-foreground">Compartilhar Loja</h3>
                            </div>
                            <button
                                onClick={() => {
                                    const text = `✨ *${store.name}* ✨\n\n${store.storeSlug}\n\n🔗 ${storeUrl}`
                                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                                    setShowShareMenu(false)
                                }}
                                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted transition-colors"
                            >
                                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                                    <MessageCircle className="w-5 h-5 text-green-500" />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-foreground uppercase tracking-wider">WhatsApp</p>
                                    <p className="text-xs text-muted-foreground">Enviar convite no chat</p>
                                </div>
                            </button>
                            <button
                                onClick={async () => {
                                    await navigator.clipboard.writeText(storeUrl)
                                    setCopied(true)
                                    setTimeout(() => setCopied(false), 2000)
                                    setTimeout(() => setShowShareMenu(false), 1500)
                                }}
                                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted transition-colors border-t border-border"
                            >
                                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                                    {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-foreground uppercase tracking-wider">{copied ? 'Copiado!' : 'Copiar Link'}</p>
                                    <p className="text-xs text-muted-foreground">{copied ? 'Endereço pronto para colar' : 'Copiar URL única da loja'}</p>
                                </div>
                            </button>
                        </div>
                    </div>
                )}
            </header>

            <main className="max-w-7xl mx-auto px-4 md:px-8 pt-8 flex flex-col gap-10">
                {/* Hero Section */}
                <section className="relative flex flex-col md:flex-row items-center md:items-start gap-8 p-8 md:p-12 rounded-[40px] border border-border bg-gradient-to-br from-card/40 to-card/10 backdrop-blur-md shadow-2xl shadow-black/5 dark:shadow-none overflow-hidden group">
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-foreground/5 blur-3xl rounded-full group-hover:bg-foreground/10 transition-colors duration-700" />
                    <div className="w-40 h-40 md:w-56 md:h-56 rounded-[32px] bg-background p-1 flex items-center justify-center border border-border shadow-[0_0_50px_rgba(0,0,0,0.1)] dark:shadow-[0_0_50_rgba(0,0,0,0.5)] overflow-hidden flex-shrink-0 relative">
                        {store.logo_url ? (
                            <img src={store.logo_url} className="w-full h-full object-cover rounded-[28px]" alt={`Logo ${store.name}`} />
                        ) : (
                            <span className="text-muted-foreground/30 text-6xl font-black italic">{store.name?.charAt(0)}</span>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent pointer-events-none" />
                    </div>

                    <div className="flex flex-col gap-6 text-center md:text-left flex-1 items-center md:items-start">
                        <div className="space-y-3">
                            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-foreground uppercase italic">{store.name}</h2>
                            {store.description && <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-2xl">{store.description}</p>}
                        </div>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-6">
                            <div className="flex flex-col gap-1">
                                <div
                                    className={`flex items-center gap-4 p-4 rounded-3xl transition-all duration-300 border ${myRating > 0
                                        ? 'bg-neutral-900 border-primary/50 shadow-xl'
                                        : 'bg-secondary/40 border-border hover:border-foreground/10'
                                        }`}
                                >
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <RatingStars
                                                value={myRating > 0 ? myRating : Number(store.ratings_avg || 0)}
                                                size={18}
                                                onChange={!isOwner ? submitRating : undefined}
                                            />
                                            <span className="text-xl font-extrabold text-foreground">{Number(store.ratings_avg || 0).toFixed(1)}</span>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/${profileSlug}/${store.storeSlug}/avaliacoes`)
                                            }}
                                            className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors text-left"
                                        >
                                            {store.ratings_count ?? 0} AVALIAÇÕES &rarr;
                                        </button>
                                    </div>
                                    {myRating > 0 && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                                            <CheckCircle2 className="w-3 h-3 text-primary" />
                                            <span className="text-[9px] font-black text-primary uppercase tracking-widest">AVALIADO</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="h-10 w-px bg-border hidden sm:block" />
                            <div className="flex items-center gap-3">
                                <div className="flex -space-x-3 overflow-hidden">
                                    {ratings.slice(0, 3).map((r, i) => (
                                        <div key={i} className="inline-block h-10 w-10 rounded-full ring-4 ring-background border border-border bg-muted overflow-hidden">
                                            {r.profiles?.avatar_url ? (
                                                <img src={getAvatarUrl(supabase, r.profiles.avatar_url)!} className="h-full w-full object-cover" alt="" />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                                    {r.profiles?.name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs font-bold uppercase tracking-tight text-muted-foreground">Pessoas que <br /> amam esta loja</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                            <div
                                className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-300 ${store.is_open
                                    ? 'bg-neutral-900 border-neutral-800 text-white'
                                    : 'bg-red-600 border-red-700 text-white'
                                    }`}
                            >
                                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${store.is_open ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-white'}`} />
                                {store.is_open ? 'Aberta no Momento' : 'Temporariamente Fechada'}
                            </div>

                            <button
                                onClick={() => {
                                    if (store.address) {
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`, '_blank')
                                    }
                                }}
                                className="px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-red-600 text-white hover:bg-neutral-900 transition-all duration-300 flex items-center gap-3 shadow-xl active:scale-95"
                            >
                                <MapPin className="w-4 h-4" /> {store.address || 'Rua tal, numero tal'}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Agenda & Action Section */}
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center justify-center md:justify-end gap-4">
                        <button
                            onClick={() => setIsScheduleModalOpen(true)}
                            className="group relative px-10 py-6 bg-primary text-primary-foreground font-black rounded-3xl hover:scale-[1.02] transition-all duration-500 active:scale-95 shadow-[0_25px_50px_rgba(var(--primary),0.2)] overflow-hidden flex items-center gap-4 border border-primary/20"
                        >
                            <div className="relative z-10 flex items-center gap-3">
                                <Calendar className="w-8 h-8" />
                                <div className="flex flex-col items-start leading-tight">
                                    <span className="text-lg uppercase tracking-tight">Agendar Horário</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Ver Agenda da Loja</span>
                                </div>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        </button>

                        {isOwner && (
                            <div className="flex gap-4">
                                <button
                                    onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/editar-loja`)}
                                    className="group px-8 py-5 bg-secondary border border-border text-foreground font-black rounded-3xl hover:bg-foreground hover:text-background transition-all duration-300 active:scale-95 flex items-center gap-3"
                                >
                                    <Pencil className="w-6 h-6" />
                                    <span className="text-lg uppercase tracking-tight">Editar Loja</span>
                                </button>
                                <button
                                    onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/criar-produto`)}
                                    className="group px-8 py-5 bg-card border border-border text-foreground font-black rounded-3xl hover:border-foreground transition-all duration-300 active:scale-95 flex items-center gap-3"
                                >
                                    <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                    <span className="text-lg uppercase tracking-tight">Novo Item</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* MICRO EXTRATO / SOCIAL PROOF */}
                    <div className="space-y-10">
                        {/* SALES SECTION */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 px-2">
                                <div className="h-px flex-1 bg-border" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground whitespace-nowrap">Compraram aqui:</h3>
                                <div className="h-px flex-1 bg-border" />
                            </div>

                            <div className="flex overflow-x-auto pb-4 gap-4 scrollbar-hide snap-x snap-mandatory">
                                {recentSales.length > 0 ? recentSales.map((sale, i) => (
                                    <div key={sale.id || i} className="flex-shrink-0 w-[280px] snap-start bg-muted/30 border border-border rounded-3xl p-5 flex items-center gap-4 group hover:bg-muted/50 transition-all shadow-lg shadow-black/5 dark:shadow-none hover:-translate-y-1">
                                        <div className="w-12 h-12 rounded-2xl bg-background border border-border overflow-hidden flex-shrink-0">
                                            {sale.profiles?.avatar_url ? (
                                                <img src={getAvatarUrl(supabase, sale.profiles.avatar_url)!} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs font-black italic text-muted-foreground/30">
                                                    {sale.buyer_name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-black text-primary uppercase tracking-widest leading-none">NOVA COMPRA!</p>
                                            <p className="text-[11px] font-bold text-foreground uppercase italic truncate mt-1">
                                                {sale.buyer_name || 'Alguém'} <span className="text-muted-foreground font-normal">comprou</span>
                                            </p>
                                            <p className="text-[10px] text-muted-foreground font-bold truncate">
                                                {sale.product_name}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] text-muted-foreground/50 font-black uppercase">🛒</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="w-full py-12 text-center rounded-[32px] border border-dashed border-border bg-muted/10">
                                        <ShoppingCart className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-20" />
                                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground italic">Aguardando próximas movimentações...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* APPOINTMENTS TODAY SECTION */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 px-2">
                                <div className="h-px flex-1 bg-border" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground whitespace-nowrap">Agendados para Hoje:</h3>
                                <div className="h-px flex-1 bg-border" />
                            </div>

                            <div className="flex overflow-x-auto pb-4 gap-4 scrollbar-hide snap-x snap-mandatory">
                                {appointmentsToday.length > 0 ? (
                                    appointmentsToday.map((appt, i) => (
                                        <div
                                            key={appt.id || i}
                                            onClick={() => appt.profiles?.profileSlug && router.push(`/${appt.profiles.profileSlug}`)}
                                            className="flex-shrink-0 w-[240px] snap-start bg-card/40 border border-border rounded-3xl p-5 flex items-center gap-4 group hover:bg-card/80 transition-all shadow-xl cursor-pointer hover:-translate-y-1"
                                        >
                                            <div className="w-12 h-12 rounded-2xl bg-background border border-border overflow-hidden flex-shrink-0 relative">
                                                {appt.profiles?.avatar_url ? (
                                                    <img src={getAvatarUrl(supabase, appt.profiles.avatar_url)!} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xs font-black italic text-muted-foreground/30">
                                                        {appt.profiles?.name?.charAt(0) || 'U'}
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[9px] font-black text-primary uppercase tracking-widest leading-none flex items-center gap-1.5">
                                                    <Clock className="w-2.5 h-2.5" />
                                                    {new Date(appt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                                <p className="text-[11px] font-bold text-foreground uppercase italic truncate mt-1">
                                                    {appt.profiles?.name || 'Cliente'}
                                                </p>
                                                <p className="text-[9px] text-muted-foreground font-bold truncate uppercase tracking-widest">
                                                    {appt.service_name || 'Agendamento'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <div className="w-2 h-2 rounded-full bg-primary/40 animate-pulse" />
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="w-full py-12 text-center rounded-[32px] border border-dashed border-border bg-muted/10">
                                        <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-20" />
                                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground italic">Nenhum agendamento para hoje...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cart Status Bar (High Premium) */}
                {mounted && totalItems > 0 && (
                    <div
                        onClick={() => router.push(`/${profileSlug}/${storeSlug}/carrinho`)}
                        className={`group fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] cursor-pointer transition-all duration-300 ${cartAnimating ? 'scale-110' : 'scale-100'}`}
                    >
                        <div className="absolute inset-[-1px] rounded-full bg-gradient-to-r from-primary via-secondary to-primary animate-gradient-xy blur-[2px] opacity-70 group-hover:opacity-100 transition-opacity" />
                        <div className="relative bg-card px-5 py-3 rounded-full flex items-center gap-4 overflow-hidden z-10 transition-all group-hover:bg-background shadow-2xl shadow-black/20 dark:shadow-none border border-border/50">
                            <div className="relative h-10 w-10 rounded-full bg-foreground flex items-center justify-center shadow-xl">
                                <ShoppingCart className="w-5 h-5 text-background" />
                                <div className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-primary text-primary-foreground text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-card animate-bounce">
                                    {totalItems}
                                </div>
                            </div>
                            <div className="flex flex-col pr-2">
                                <span className="text-sm font-black text-foreground italic tracking-tight">R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <span className="text-[9px] font-black uppercase text-primary tracking-widest leading-none">Ver Carrinho</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Products Section */}
                <div className="space-y-8">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-border pb-4">
                            <h3 className="text-2xl font-black italic tracking-tighter">Cardápio / Catálogo</h3>
                            <span className="text-sm font-black text-muted-foreground">{filteredProducts.length} Produtos</span>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="procurar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-secondary border border-border rounded-2xl py-4 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 transition-colors"
                            />
                        </div>
                    </div>

                    {filteredProducts.length === 0 ? (
                        <div className="py-20 text-center rounded-[32px] border border-dashed border-white/5 bg-white/[0.02]">
                            <Search className="w-12 h-12 text-neutral-800 mx-auto mb-4" />
                            <p className="text-neutral-500 font-bold uppercase italic text-sm">Nenhum produto encontrado</p>
                        </div>
                    ) : (
                        <>
                            {Object.entries(groupedProducts).map(([category, products]) => (
                                <div key={category} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-primary">{category}</h4>
                                        <div className="h-px flex-1 bg-border" />
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {products.map((product) => (
                                            <div
                                                key={product.id}
                                                onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/${product.slug || product.id}`)}
                                                className="group relative flex bg-card/40 border border-border rounded-[24px] overflow-hidden transition-all duration-300 hover:border-foreground/10 hover:bg-card/80 cursor-pointer p-4 gap-4 items-stretch shadow-xl shadow-black/5 dark:shadow-none hover:shadow-2xl hover:-translate-y-1"
                                            >
                                                <div className="flex-1 flex flex-col min-w-0 py-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="text-[17px] leading-tight font-bold text-foreground truncate line-clamp-2">{product.name}</h4>
                                                    </div>
                                                    <p className="text-muted-foreground text-xs font-medium line-clamp-2 mt-1 min-h-[32px]">{product.description || "Nenhuma descrição detalhada disponível."}</p>

                                                    <div className="mt-auto pt-3 flex flex-wrap items-center gap-3">
                                                        <p className="text-lg font-black italic tracking-tighter text-foreground mr-auto">
                                                            R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </p>

                                                        {isOwner ? (
                                                            <button
                                                                onClick={(event) => {
                                                                    event.stopPropagation()
                                                                    router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`)
                                                                }}
                                                                className="px-4 py-2 rounded-xl font-black uppercase text-[9px] tracking-widest bg-secondary text-foreground hover:bg-foreground hover:text-background transition-all border border-border"
                                                            >
                                                                Editar
                                                            </button>
                                                        ) : (
                                                            mounted && cartItems.some((item: any) => item.product.id === product.id) ? (
                                                                <div className="flex gap-1.5">
                                                                    <button
                                                                        onClick={(event) => {
                                                                            event.stopPropagation()
                                                                            router.push(`/${profileSlug}/${storeSlug}/carrinho`)
                                                                        }}
                                                                        className="h-9 px-3 bg-foreground text-background font-black uppercase text-[9px] tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                                                                    >
                                                                        <CheckCircle2 className="w-3.5 h-3.5" /> OK
                                                                    </button>
                                                                    <button
                                                                        onClick={(event) => {
                                                                            event.stopPropagation()
                                                                            removeItem(storeSlug as string, product.id)
                                                                        }}
                                                                        className="h-9 w-9 rounded-xl flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all border border-destructive/20"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={(event) => {
                                                                        event.stopPropagation()
                                                                        addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url ?? null }, product)
                                                                        setCartAnimating(true)
                                                                        setTimeout(() => setCartAnimating(false), 500)
                                                                    }}
                                                                    className="h-9 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest bg-foreground/5 hover:bg-foreground hover:text-background text-foreground transition-all flex items-center justify-center gap-1.5 border border-border"
                                                                >
                                                                    <Plus className="w-4 h-4" /> ADD
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-muted overflow-hidden flex-shrink-0 border border-border group-hover:border-foreground/10 transition-colors">
                                                    {product.image_url ? (
                                                        <img src={product.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={product.name} />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-muted/50">
                                                            <span className="text-muted-foreground font-bold italic text-sm">Sem Foto</span>
                                                        </div>
                                                    )}
                                                    {!isOwner && (
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                addItem(storeSlug as string, { name: store.name, logo_url: store.logo_url ?? null }, product)
                                                                setCartAnimating(true)
                                                                setTimeout(() => setCartAnimating(false), 500)
                                                            }}
                                                            className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-foreground/80 backdrop-blur-md text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 hover:bg-foreground shadow-lg z-20"
                                                        >
                                                            <Plus className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                    {product.type && (
                                                        <div className="absolute top-2 right-2 bg-background/70 backdrop-blur-md px-2 py-0.5 rounded border border-border">
                                                            <span className="text-[8px] font-bold uppercase tracking-wider text-foreground">
                                                                {product.type === 'physical' ? 'Físico' : product.type === 'service' ? 'Serviço' : 'Especial'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </main>
        </div>
    )
}