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
    Star,
    MapPin,
    ExternalLink,
    Settings,
    Pencil,
    ArrowDown,
    ArrowUp
} from 'lucide-react'
import { toast } from 'sonner'
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
    category_order?: string[] | null
    allow_scheduling?: boolean
}

// Função para formatar endereço (rua, número, cidade)
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
        return result.length > 40 ? result.substring(0, 37) + '...' : result
    }
    return fullAddress.length > 40 ? fullAddress.substring(0, 37) + '...' : fullAddress
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
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
    const [categoryOrder, setCategoryOrder] = useState<string[]>([])

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

        // Sort categories based on order
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

        sortedCats.forEach(cat => {
            sortedGroups[cat] = groups[cat]
        })

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
        if (direction === 'up' && index > 0) {
            [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]]
        } else if (direction === 'down' && index < newOrder.length - 1) {
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
        } else {
            return
        }

        setCategoryOrder(newOrder)
        // Save to DB
        await supabase.from('stores').update({ category_order: newOrder }).eq('id', store.id)
    }

    const toggleScheduling = async () => {
        if (!store) return
        const newStatus = !store.allow_scheduling
        const { error } = await supabase.from('stores').update({ allow_scheduling: newStatus }).eq('id', store.id)
        if (error) {
            toast.error('Erro ao atualizar permissão de agendamentos.')
            return
        }
        setStore(prev => prev ? { ...prev, allow_scheduling: newStatus } : null)
        toast.success(newStatus ? 'Agendamentos permitidos!' : 'Agendamentos cancelados.')
    }


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
                if (viewError) {
                    console.error('[StorePage] Erro ao registrar view:', viewError.message, viewError.details)
                }
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

        let storeWhatsapp = foundStore.whatsapp
        if (!storeWhatsapp && foundStore.owner_id) {
            const { data: profile } = await supabase.from('profiles').select('whatsapp').eq('id', foundStore.owner_id).single()
            storeWhatsapp = profile?.whatsapp
        }

        setStore({ ...foundStore, logo_url: logoUrl, final_whatsapp: storeWhatsapp })
        setCategoryOrder(foundStore.category_order || [])
        setProducts(mappedProducts)
        await loadRatings(foundStore.id, userId)

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
            toast.info('Entre na sua conta para avaliar esta loja.')
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
            toast.error('Não foi possível salvar sua avaliação agora.')
            setRatingLoading(false)
            return
        }

        setMyRating(rating)
        await loadStore()
        setRatingLoading(false)
    }

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

            <main className="max-w-7xl mx-auto px-4 md:px-8 pt-6 flex flex-col gap-6">
                {/* Logo e Nome - Sem card */}
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-background border border-border overflow-hidden flex-shrink-0 shadow-md">
                        {store.logo_url ? (
                            <img src={store.logo_url} className="w-full h-full object-cover" alt={`Logo ${store.name}`} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl font-black text-muted-foreground/30">
                                {store.name?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black tracking-tighter text-foreground">
                            {store.name}
                        </h2>
                        {store.description && (
                            <p className="text-muted-foreground text-sm line-clamp-1">
                                {store.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* Avaliações + Pessoas que amam */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <RatingStars
                            value={myRating > 0 ? myRating : Number(store.ratings_avg || 0)}
                            size={14}
                            onChange={!isOwner ? submitRating : undefined}
                        />
                        <span className="text-base font-extrabold text-foreground">
                            {Number(store.ratings_avg || 0).toFixed(1)}
                        </span>
                        <button
                            onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/avaliacoes`)}
                            className="text-[9px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                        >
                            ({store.ratings_count ?? 0})
                        </button>
                        {myRating > 0 && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                                <CheckCircle2 className="w-2.5 h-2.5 text-primary" />
                                <span className="text-[7px] font-black text-primary uppercase tracking-widest">AVALIADO</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex -space-x-2 overflow-hidden">
                            {ratings.slice(0, 3).map((r, i) => (
                                <div key={i} className="inline-block h-7 w-7 rounded-full ring-2 ring-card border border-border bg-muted overflow-hidden">
                                    {r.profiles?.avatar_url ? (
                                        <img src={getAvatarUrl(supabase, r.profiles.avatar_url)!} className="h-full w-full object-cover" alt="" />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                                            {r.profiles?.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-tight text-muted-foreground">
                            +{ratings.length}
                        </p>
                    </div>
                </div>

                {/* Localização + Agendar Horário */}
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={() => {
                            if (store.address) {
                                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`, '_blank')
                            }
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/10 border border-red-600/20 hover:bg-red-600 hover:text-white transition-all duration-300 group"
                    >
                        <MapPin className="w-3.5 h-3.5 text-red-600 group-hover:text-white" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-600 group-hover:text-white">
                            {formatAddress(store.address)}
                        </span>
                    </button>

                    {(store.allow_scheduling || isOwner) && (
                        <div className="flex items-center gap-2">
                            {store.allow_scheduling && (
                                <button
                                    onClick={() => setIsScheduleModalOpen(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all duration-300 shadow-md"
                                >
                                    <Calendar className="w-3.5 h-3.5" />
                                    Agendar
                                </button>
                            )}

                            {isOwner && (
                                <button
                                    onClick={toggleScheduling}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${store.allow_scheduling ? 'bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive hover:text-white' : 'bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500 hover:text-white'}`}
                                >
                                    {store.allow_scheduling ? 'Cancelar Agendamentos' : 'Permitir Agendamentos'}
                                </button>
                            )}
                        </div>
                    )}


                </div>

                {/* Compraram Aqui Section - só mostra se tiver vendas */}
                {recentSales.length > 0 && (
                    <section className="space-y-3">
                        <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-border" />
                            <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-muted-foreground whitespace-nowrap">
                                Compraram aqui:
                            </h3>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        <div className="flex overflow-x-auto pb-2 gap-3 scrollbar-hide snap-x snap-mandatory">
                            {recentSales.slice(0, 6).map((sale, i) => (
                                <div key={sale.id || i} className="flex-shrink-0 w-[180px] snap-start bg-muted/30 border border-border rounded-xl p-2 flex items-center gap-2 group hover:bg-muted/50 transition-all">
                                    <div className="w-8 h-8 rounded-lg bg-background border border-border overflow-hidden flex-shrink-0">
                                        {sale.profiles?.avatar_url ? (
                                            <img src={getAvatarUrl(supabase, sale.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-muted-foreground/30">
                                                {sale.buyer_name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[7px] font-black text-primary uppercase tracking-wider">NOVA COMPRA</p>
                                        <p className="text-[9px] font-bold text-foreground truncate">
                                            {sale.buyer_name || 'Alguém'}
                                        </p>
                                        <p className="text-[7px] text-muted-foreground font-bold truncate">
                                            {sale.product_name}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Agendados para Hoje Section - só mostra se tiver agendamentos */}
                {appointmentsToday.length > 0 && (
                    <section className="space-y-3">
                        <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-border" />
                            <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-muted-foreground whitespace-nowrap">
                                Agendados para Hoje:
                            </h3>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        <div className="flex overflow-x-auto pb-2 gap-3 scrollbar-hide snap-x snap-mandatory">
                            {appointmentsToday.slice(0, 6).map((appt, i) => (
                                <div
                                    key={appt.id || i}
                                    onClick={() => appt.profiles?.profileSlug && router.push(`/${appt.profiles.profileSlug}`)}
                                    className="flex-shrink-0 w-[180px] snap-start bg-card/40 border border-border rounded-xl p-2 flex items-center gap-2 group hover:bg-card/80 transition-all cursor-pointer"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-background border border-border overflow-hidden flex-shrink-0">
                                        {appt.profiles?.avatar_url ? (
                                            <img src={getAvatarUrl(supabase, appt.profiles.avatar_url)!} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-muted-foreground/30">
                                                {appt.profiles?.name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[7px] font-black text-primary uppercase tracking-wider flex items-center gap-1">
                                            <Clock className="w-2 h-2" />
                                            {new Date(appt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        <p className="text-[9px] font-bold text-foreground truncate">
                                            {appt.profiles?.name || 'Cliente'}
                                        </p>
                                        <p className="text-[7px] text-muted-foreground font-bold truncate uppercase tracking-wider">
                                            {appt.service_name || 'Agendamento'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}


                {isOwner && (
                    <>

                        <button
                            onClick={() => router.push(`/${profileSlug}/${store.storeSlug}/criar-produto`)}
                            className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-card border border-border text-foreground hover:border-foreground transition-all"
                        >
                            <Plus className="w-3 h-3 inline mr-1" /> Adicionar Produto ou serviço
                        </button>
                    </>
                )}
                {/* Products Section */}
                <div className="space-y-6 mt-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <h3 className="text-xl font-black italic tracking-tighter">Cardápio</h3>
                            <span className="text-xs font-black text-muted-foreground">{filteredProducts.length} itens</span>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="procurar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-secondary border border-border rounded-xl py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 transition-colors"
                            />
                        </div>
                    </div>

                    {filteredProducts.length === 0 ? (
                        <div className="py-12 text-center rounded-2xl border border-dashed border-white/5 bg-white/[0.02]">
                            <Search className="w-8 h-8 text-neutral-800 mx-auto mb-2" />
                            <p className="text-neutral-500 font-bold uppercase italic text-xs">Nenhum produto encontrado</p>
                        </div>
                    ) : (
                        <>
                            {Object.entries(groupedProducts).map(([category, products], catIndex) => {
                                const isCollapsed = collapsedCategories.has(category)
                                return (
                                    <div key={category} className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-[9px] font-black uppercase tracking-[0.5em] text-primary">{category}</h4>
                                            <div className="h-px flex-1 bg-border" />

                                            <div className="flex items-center gap-1">
                                                {isOwner && (
                                                    <div className="flex items-center gap-0.5 mr-2">
                                                        <button
                                                            disabled={catIndex === 0}
                                                            onClick={() => moveCategory(category, 'up')}
                                                            className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all"
                                                            title="Mover para cima"
                                                        >
                                                            <ArrowUp className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            disabled={catIndex === Object.keys(groupedProducts).length - 1}
                                                            onClick={() => moveCategory(category, 'down')}
                                                            className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all"
                                                            title="Mover para baixo"
                                                        >
                                                            <ArrowDown className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => toggleCategory(category)}
                                                    className="w-6 h-6 flex items-center justify-center bg-secondary border border-border rounded-lg hover:border-foreground transition-all"
                                                >
                                                    {isCollapsed ? <Plus className="w-3 h-3" /> : <div className="w-2.5 h-0.5 bg-foreground" />}
                                                </button>
                                            </div>
                                        </div>

                                        {!isCollapsed && (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                {products.map((product) => (
                                                    <div
                                                        key={product.id}
                                                        onClick={() => {
                                                            if (isOwner) {
                                                                router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`)
                                                            } else {
                                                                router.push(`/${profileSlug}/${store.storeSlug}/${product.slug || product.id}`)
                                                            }
                                                        }}
                                                        className="group relative flex bg-card/40 border border-border rounded-xl overflow-hidden transition-all duration-300 hover:border-foreground/10 hover:bg-card/80 cursor-pointer p-3 gap-3 items-stretch shadow-md hover:shadow-xl hover:-translate-y-0.5"
                                                    >
                                                        <div className="flex-1 flex flex-col min-w-0 py-0.5">
                                                            <h4 className="text-sm leading-tight font-bold text-foreground line-clamp-2">{product.name}</h4>
                                                            <p className="text-muted-foreground text-[10px] font-medium line-clamp-2 mt-1 min-h-[28px]">{product.description || "Sem descrição"}</p>

                                                            <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
                                                                <p className="text-base font-black italic tracking-tighter text-foreground mr-auto">
                                                                    R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </p>

                                                                {isOwner ? (
                                                                    <button
                                                                        onClick={(event) => {
                                                                            event.stopPropagation()
                                                                            router.push(`/${profileSlug}/${storeSlug}/${product.slug || product.id}/editar-produto`)
                                                                        }}
                                                                        className="px-2.5 py-1 rounded-lg font-black uppercase text-[8px] tracking-widest bg-secondary text-foreground hover:bg-foreground hover:text-background transition-all border border-border"
                                                                    >
                                                                        Editar
                                                                    </button>
                                                                ) : (
                                                                    mounted && cartItems.some((item: any) => item.product.id === product.id) ? (
                                                                        <div className="flex gap-1">
                                                                            <button
                                                                                onClick={(event) => {
                                                                                    event.stopPropagation()
                                                                                    router.push(`/sacola`)
                                                                                }}
                                                                                className="h-7 px-2.5 bg-foreground text-background font-black uppercase text-[8px] tracking-widest rounded-lg transition-all shadow-md active:scale-95 flex items-center justify-center gap-1"
                                                                            >
                                                                                <CheckCircle2 className="w-3 h-3" /> OK
                                                                            </button>
                                                                            <button
                                                                                onClick={(event) => {
                                                                                    event.stopPropagation()
                                                                                    removeItem(storeSlug as string, product.id)
                                                                                }}
                                                                                className="h-7 w-7 rounded-lg flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all border border-destructive/20"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" />
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
                                                                            className="h-7 px-2.5 rounded-lg font-black uppercase text-[8px] tracking-widest bg-foreground/5 hover:bg-foreground hover:text-background text-foreground transition-all flex items-center justify-center gap-1 border border-border"
                                                                        >
                                                                            <Plus className="w-3 h-3" /> ADD
                                                                        </button>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="relative w-20 h-20 rounded-xl bg-muted overflow-hidden flex-shrink-0 border border-border group-hover:border-foreground/10 transition-colors">
                                                            {product.image_url ? (
                                                                <img src={product.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={product.name} />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center bg-muted/50">
                                                                    <span className="text-muted-foreground font-bold italic text-[8px]">Sem Foto</span>
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
                                                                    className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-foreground/80 backdrop-blur-md text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 hover:bg-foreground shadow-md z-20"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" />
                                                                </div>
                                                            )}
                                                            {product.type && (
                                                                <div className="absolute top-1 right-1 bg-background/70 backdrop-blur-md px-1.5 py-0.5 rounded border border-border">
                                                                    <span className="text-[6px] font-bold uppercase tracking-wider text-foreground">
                                                                        {product.type === 'physical' ? 'Produto' : product.type === 'service' ? 'Serviço' : 'Digital'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                        }
                                    </div>
                                )
                            })}
                        </>
                    )}
                </div>
            </main>
        </div>
    )
}