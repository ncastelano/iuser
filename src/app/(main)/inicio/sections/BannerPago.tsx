// src/app/(main)/inicio/sections/BannerPago.tsx
'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
    ChevronLeft,
    ChevronRight,
    Star,
    MapPin,
    Clock,
    ShoppingBag,
    Eye,
    Timer,
    Bike,
    PackageCheck,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getStatusIntervalText } from '@/lib/storeHours'

// ---------- Tipos ----------
interface TopProduct {
    imageUrl: string | null
    name: string
    price: number | null
}

interface StoreCard {
    slug: string
    profileSlug: string
    name: string
    logoUrl: string | null
    coverUrl?: string | null
    description?: string
    rating?: number
    ratingCount?: number
    isOpen: boolean
    statusText: string
    address?: string
    location?: any
    lat?: number | null
    lng?: number | null
    viewCount?: number
    durationMin?: number | null
    durationMax?: number | null
    topProducts?: TopProduct[]
    distanceMeters?: number | null
    deliveryType?: string | null
    deliveryFee?: number | null
    acceptsDelivery?: boolean
    acceptsPickup?: boolean
    minPrice?: number | null
    maxPrice?: number | null
    totalProducts?: number
}

// ---------- Helpers ----------

function calculateHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

function formatDistanceText(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)} m`
    return `${(meters / 1000).toFixed(1)} km`
}

function extractStreetAndNumber(fullAddress?: string): string {
    if (!fullAddress || fullAddress === 'Endereço não informado') return ''
    const parts = fullAddress.split(',').map(p => p.trim())
    const firstPart = parts[0] || ''
    let street = firstPart
    let number = ''
    const numberMatch = firstPart.match(/\b(\d+)\b/)
    if (numberMatch) {
        number = numberMatch[1]
        street = firstPart.replace(/\b\d+\b/, '').trim().replace(/,\s*$/, '')
    }
    street = street
        .replace(/^Avenida\s/, 'Av. ')
        .replace(/^Rua\s/, 'R. ')
        .replace(/^Travessa\s/, 'Tv. ')
        .replace(/^Praça\s/, 'Pç. ')
        .replace(/^Alameda\s/, 'Al. ')
        .replace(/^Rodovia\s/, 'Rod. ')
        .replace(/^Estrada\s/, 'Estr. ')
    return number ? `${street}, ${number}` : street
}

function parseStoreCoords(store: any): { lat: number; lng: number } | null {
    if (typeof store.store_lat === 'number' && typeof store.store_lng === 'number' &&
        isFinite(store.store_lat) && isFinite(store.store_lng)) {
        return { lat: store.store_lat, lng: store.store_lng }
    }
    if (typeof store.lat === 'number' && typeof store.lng === 'number' && isFinite(store.lat) && isFinite(store.lng)) {
        return { lat: store.lat, lng: store.lng }
    }
    if (store.location) {
        const loc = store.location
        if (typeof loc === 'object' && loc !== null) {
            if ('lat' in loc && 'lng' in loc) {
                const lat = Number(loc.lat), lng = Number(loc.lng)
                if (isFinite(lat) && isFinite(lng)) return { lat, lng }
            }
            if (loc.type === 'Point' && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
                const lng = Number(loc.coordinates[0]), lat = Number(loc.coordinates[1])
                if (isFinite(lat) && isFinite(lng)) return { lat, lng }
            }
        }
        if (typeof loc === 'string') {
            const match = loc.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
            if (match) {
                const lng = parseFloat(match[1]), lat = parseFloat(match[2])
                if (isFinite(lat) && isFinite(lng)) return { lat, lng }
            }
        }
    }
    return null
}

const CACHE_KEY = 'banner_stores_cache_v7'
const CACHE_TTL = 5 * 60 * 1000

function loadCache(): StoreCard[] | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const { data, timestamp } = JSON.parse(raw)
        if (Date.now() - timestamp < CACHE_TTL) return data as StoreCard[]
    } catch { }
    return null
}

function saveCache(stores: StoreCard[]) {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: stores, timestamp: Date.now() }))
    } catch { }
}

function useBreakpoint() {
    const [slidesPerView, setSlidesPerView] = useState(1)
    useEffect(() => {
        const update = () => {
            const w = window.innerWidth
            if (w >= 1120) setSlidesPerView(3)
            else if (w >= 800) setSlidesPerView(2)
            else setSlidesPerView(1)
        }
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])
    return slidesPerView
}

function BannerSkeleton({ slidesPerView = 1 }: { slidesPerView?: number }) {
    const { colors } = useTheme()
    const visibleSlides = Math.min(slidesPerView, 3)
    return (
        <div className="relative w-full">
            <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-4 h-4 rounded-full animate-pulse" style={{ background: colors.border }} />
                <div className="h-5 w-40 rounded animate-pulse" style={{ background: colors.border }} />
            </div>
            <div className="relative overflow-hidden">
                <div className="flex gap-3">
                    {Array.from({ length: visibleSlides }).map((_, i) => (
                        <div key={`skel-${i}-${visibleSlides}`} className="flex-shrink-0" style={{ width: `${100 / visibleSlides}%` }}>
                            <div className="relative h-72 sm:h-96 lg:h-[30rem]">
                                <div className="absolute inset-0 rounded-2xl overflow-hidden border" style={{ borderColor: colors.border, background: colors.surface }}>
                                    <div className="absolute inset-0 animate-pulse" style={{ background: `linear-gradient(135deg, ${colors.border}40, ${colors.border}20)` }} />
                                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 z-10">
                                        <div className="w-3/4 h-8 sm:h-10 rounded animate-pulse mb-1" style={{ background: colors.border }} />
                                        <div className="w-1/2 h-3 rounded animate-pulse mb-2" style={{ background: colors.border }} />
                                        <div className="w-24 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function useBannerStores(userLocation?: { lat: number; lng: number } | null) {
    const [stores, setStores] = useState<StoreCard[]>([])
    const [loading, setLoading] = useState(true)
    const [effectiveLocation, setEffectiveLocation] = useState<{ lat: number; lng: number } | null>(null)
    const lastLocationKey = useRef<string>('')
    const hasAttemptedBrowserLocation = useRef(false)

    useEffect(() => {
        const newKey = userLocation ? `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)}` : ''

        if (userLocation && newKey !== lastLocationKey.current) {
            console.log('[BannerPago] 🔄 Nova localização:', userLocation)
            lastLocationKey.current = newKey
            setEffectiveLocation({ ...userLocation })
            setStores([])
            setLoading(true)
            return
        }

        if (!userLocation && !hasAttemptedBrowserLocation.current && typeof window !== 'undefined' && 'geolocation' in navigator) {
            hasAttemptedBrowserLocation.current = true
            navigator.geolocation.getCurrentPosition(
                (pos) => setEffectiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => setEffectiveLocation(null),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            )
        }
    }, [userLocation?.lat, userLocation?.lng])

    useEffect(() => {
        let cancelled = false

        const buildStoreCards = async (storesList: any[], location: { lat: number; lng: number } | null): Promise<StoreCard[]> => {
            const storeIds = storesList.map((s: any) => s.id)
            const { data: productsList } = await supabase
                .from('products')
                .select('id, name, store_id, image_url, duration_minutes, price')
                .in('store_id', storeIds)
                .eq('listing_type', 'sale')
                .eq('is_active', true)

            const storeProds = new Map<string, typeof productsList>()
            productsList?.forEach(p => {
                if (!storeProds.has(p.store_id)) storeProds.set(p.store_id, [])
                storeProds.get(p.store_id)!.push(p)
            })

            return storesList.map((store: any) => {
                const logoUrl = store.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null
                const status = getStatusIntervalText(store.business_hours)
                const prods = storeProds.get(store.id) || []
                const durations = prods.map((p: any) => p.duration_minutes).filter((d: any): d is number => d != null)
                const prices = prods.map((p: any) => p.price).filter((p: any): p is number => p != null && p > 0)
                const storeCoords = parseStoreCoords(store)

                let distanceMeters: number | null = null
                if (store.distance_km != null) distanceMeters = store.distance_km * 1000
                else if (store.distance_meters != null) distanceMeters = store.distance_meters
                else if (location && storeCoords)
                    distanceMeters = calculateHaversineDistanceMeters(location.lat, location.lng, storeCoords.lat, storeCoords.lng)

                return {
                    slug: store.storeSlug,
                    profileSlug: store.profileSlug || '',
                    name: store.name,
                    logoUrl,
                    coverUrl: logoUrl,
                    description: store.description,
                    rating: store.ratings_avg ? Number(store.ratings_avg) : 0,
                    ratingCount: store.ratings_count ?? 0,
                    isOpen: status.isOpen,
                    statusText: status.text,
                    address: store.address || null,
                    location: store.location || null,
                    lat: storeCoords?.lat ?? store.store_lat ?? null,
                    lng: storeCoords?.lng ?? store.store_lng ?? null,
                    viewCount: store.view_count ?? 0,
                    durationMin: durations.length ? Math.min(...durations) : null,
                    durationMax: durations.length ? Math.max(...durations) : null,
                    topProducts: prods.filter((p: any) => p.image_url).slice(0, 3).map((p: any, i: number) => ({
                        imageUrl: p.image_url
                            ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                            : null,
                        name: p.name,
                        price: p.price,
                        id: p.id || `${store.id}-prod-${i}`
                    })),
                    distanceMeters,
                    deliveryType: store.delivery_type ?? null,
                    deliveryFee: store.delivery_fee ?? null,
                    acceptsDelivery: store.accepts_delivery ?? false,
                    acceptsPickup: store.accepts_pickup ?? false,
                    minPrice: prices.length ? Math.min(...prices) : null,
                    maxPrice: prices.length ? Math.max(...prices) : null,
                    totalProducts: prods.length,
                }
            }).sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
        }

        const fetchFreshData = async () => {
            let storesList: any[] = []

            // Tentar RPC primeiro se tem localização
            if (effectiveLocation) {
                try {
                    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_stores_with_distance', {
                        user_lat: effectiveLocation.lat,
                        user_lng: effectiveLocation.lng,
                        max_distance: 50
                    })
                    if (!rpcErr && rpcData?.length > 0) {
                        storesList = rpcData
                        console.log('[BannerPago] ✅ RPC retornou', storesList.length, 'lojas')
                    }
                } catch (e) {
                    console.warn('[BannerPago] RPC falhou:', e)
                }
            }

            // Fallback: query normal
            if (storesList.length === 0) {
                console.log('[BannerPago] 🔍 Buscando todas as lojas ativas...')
                const { data, error } = await supabase
                    .from('stores')
                    .select('*')
                    .eq('is_active', true)
                    .order('ratings_avg', { ascending: false })
                    .limit(20)

                if (error) {
                    console.error('[BannerPago] Erro na query:', error)
                } else if (data) {
                    storesList = data
                    console.log('[BannerPago] ✅ Query retornou', storesList.length, 'lojas')
                }
            }

            if (cancelled || storesList.length === 0) {
                if (!cancelled) {
                    console.log('[BannerPago] Nenhuma loja encontrada')
                    setLoading(false)
                }
                return
            }

            // Buscar profileSlug dos owners SEPARADAMENTE
            const ownerIds = [...new Set(storesList.map((s: any) => s.owner_id).filter(Boolean))]
            console.log('[BannerPago] Owner IDs:', ownerIds)

            let profileMap = new Map<string, string>()

            if (ownerIds.length > 0) {
                const { data: profiles, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, profileSlug')
                    .in('id', ownerIds)

                if (profileError) {
                    console.error('[BannerPago] Erro ao buscar profiles:', profileError)
                } else if (profiles) {
                    console.log('[BannerPago] Profiles encontrados:', profiles.length)
                    profiles.forEach((p: any) => {
                        console.log(`[BannerPago]   Profile: id=${p.id}, profileSlug=${p.profileSlug}`)
                        if (p.profileSlug) {
                            profileMap.set(p.id, p.profileSlug)
                        }
                    })
                }
            }

            // Adicionar profileSlug aos stores
            const storesWithProfile = storesList.map((s: any) => {
                const profileSlug = profileMap.get(s.owner_id) || null
                console.log(`[BannerPago] Store: ${s.name} (id=${s.id}), owner_id=${s.owner_id}, profileSlug=${profileSlug}, storeSlug=${s.storeSlug}`)
                return {
                    ...s,
                    profileSlug
                }
            })

            const cards = await buildStoreCards(storesWithProfile, effectiveLocation)
            if (!cancelled && cards.length > 0) {
                console.log('[BannerPago] ✅ Cards construídos:', cards.length)
                setStores(cards)
                saveCache(cards)
                setLoading(false)
            } else if (!cancelled) {
                setLoading(false)
            }
        }

        // Tentar cache primeiro
        const cached = loadCache()
        if (cached?.length) {
            console.log('[BannerPago] 📦 Cache carregado:', cached.length, 'lojas')
            setStores(cached)
            setLoading(false)
        }

        fetchFreshData()

        return () => { cancelled = true }
    }, [effectiveLocation])

    return { stores, loading, effectiveLocation }
}

interface BannerPagoProps {
    savedLocation?: { lat: number; lng: number; address?: string } | null
    userLocation?: { lat: number; lng: number } | null
}

export default function BannerPago({ savedLocation = null, userLocation = null }: BannerPagoProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const locationToUse = userLocation || savedLocation
    const { stores, loading, effectiveLocation } = useBannerStores(locationToUse)
    const slidesPerView = useBreakpoint()
    const sortedStores = stores
    const totalRealSlides = sortedStores.length
    const totalPages = Math.max(1, Math.ceil(totalRealSlides / slidesPerView))

    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)

    useEffect(() => { setCurrentPage(0) }, [slidesPerView])

    const goToNext = useCallback(() => { if (totalPages > 1) setCurrentPage(p => (p + 1) % totalPages) }, [totalPages])
    const goToPrev = useCallback(() => { if (totalPages > 1) setCurrentPage(p => (p - 1 + totalPages) % totalPages) }, [totalPages])

    useEffect(() => {
        if (isHovered || isDragging || totalPages <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current) }
    }, [isHovered, isDragging, goToNext, totalPages])

    const items = useMemo(() => {
        if (totalRealSlides === 0) return []
        const start = currentPage * slidesPerView
        return sortedStores.slice(start, Math.min(start + slidesPerView, totalRealSlides))
    }, [sortedStores, currentPage, slidesPerView, totalRealSlides])

    const handleDragStart = (clientX: number) => { setIsDragging(true); setDragStartX(clientX); setDragOffset(0) }
    const handleDragMove = (clientX: number) => { if (isDragging) setDragOffset(clientX - dragStartX) }
    const handleDragEnd = () => {
        if (!isDragging) return
        setIsDragging(false)
        if (dragOffset > 50) goToPrev()
        else if (dragOffset < -50) goToNext()
        setDragOffset(0)
    }

    // Função para navegar para a loja
    const navigateToStore = (store: StoreCard) => {
        console.log('[BannerPago] 🖱️ Clicou na loja:', {
            name: store.name,
            profileSlug: store.profileSlug,
            slug: store.slug
        })

        if (store.profileSlug && store.slug) {
            const url = `/${store.profileSlug}/${store.slug}`
            console.log('[BannerPago] ➡️ Navegando para:', url)
            router.push(url)
        } else if (store.slug) {
            // Fallback: tenta navegar só com o slug
            const url = `/${store.slug}`
            console.warn('[BannerPago] ⚠️ profileSlug não encontrado, tentando:', url)
            router.push(url)
        } else {
            console.warn('[BannerPago] ❌ Store sem slug:', store)
        }
    }

    const formatDuration = (m: number) => m < 60 ? `${m}min` : `${Math.floor(m / 60)}h ${m % 60 ? m % 60 + 'min' : ''}`
    const formatPrice = (p: number | null | undefined) => p == null ? null : p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    if (loading) return <BannerSkeleton slidesPerView={slidesPerView} />
    if (!sortedStores.length) return null

    const gridCols = slidesPerView === 3 ? 'grid-cols-3' : slidesPerView === 2 ? 'grid-cols-2' : 'grid-cols-1'

    return (
        <div className="relative w-full" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <div className="flex items-center gap-2 mb-2 px-1">
                <ShoppingBag size={18} style={{ color: colors.accent }} />
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>Lojas em destaque</h2>
                {!locationToUse && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: colors.border, color: colors.textSecondary }}>
                        Ative sua localização para ver distâncias
                    </span>
                )}
            </div>

            <div
                className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
                onMouseDown={e => { e.preventDefault(); handleDragStart(e.clientX) }}
                onMouseMove={e => { if (isDragging) { e.preventDefault(); handleDragMove(e.clientX) } }}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchStart={e => handleDragStart(e.touches[0].clientX)}
                onTouchMove={e => { if (isDragging) handleDragMove(e.touches[0].clientX) }}
                onTouchEnd={handleDragEnd}
            >
                <div
                    ref={trackRef}
                    className={`grid ${gridCols} gap-3`}
                    style={{
                        transform: isDragging ? `translateX(${dragOffset / (trackRef.current?.clientWidth || 1) * 100}px)` : 'none',
                        transition: isDragging ? 'none' : 'transform 0.3s ease',
                    }}
                >
                    {items.map((store, storeIndex) => {
                        const bgImage = store.coverUrl || store.logoUrl
                        const productsWithImages = store.topProducts?.filter(p => p.imageUrl) || []
                        const minP = formatPrice(store.minPrice ?? null)
                        const maxP = formatPrice(store.maxPrice ?? null)
                        const hasCoords = !!(store.lat && store.lng)
                        const hasAddress = !!(store.address && store.address !== 'Endereço não informado')
                        const distText = store.distanceMeters ? formatDistanceText(store.distanceMeters) : null
                        const streetText = hasAddress ? extractStreetAndNumber(store.address) : null
                        const showDistanceBadge = hasCoords && distText
                        const showAddressBadge = hasAddress && streetText

                        return (
                            <div key={`card-${store.slug}-${storeIndex}`} className="relative h-72 sm:h-96 lg:h-[30rem]">
                                <div
                                    onClick={() => navigateToStore(store)}
                                    className="group absolute inset-0 rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-[1.02] cursor-pointer"
                                    style={{ borderColor: colors.border, boxShadow: colors.shadow }}
                                >
                                    {bgImage ? (
                                        <img src={bgImage} alt={store.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                    ) : (
                                        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${colors.accent}66, ${colors.background})` }} />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />

                                    <div className="absolute top-3 left-3 z-20">
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold shadow-lg"
                                            style={{ background: store.isOpen ? '#10b981' : '#ef4444', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                            <Clock size={12} /><span>{store.statusText}</span>
                                        </div>
                                    </div>

                                    <div className="absolute top-12 left-3 z-20">
                                        <div className="flex items-center gap-2 px-2 py-1 rounded-full text-xs font-bold shadow-lg"
                                            style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                            {store.durationMin != null && store.durationMax != null && (
                                                <span className="flex items-center gap-1"><Timer size={12} />
                                                    <span>{formatDuration(store.durationMin)}{store.durationMin !== store.durationMax && ` - ${formatDuration(store.durationMax)}`}</span>
                                                </span>
                                            )}
                                            {store.durationMin != null && <span className="opacity-50 mx-0.5">•</span>}
                                            {store.acceptsDelivery ? (
                                                <span className="flex items-center gap-1"><Bike size={12} />
                                                    {store.deliveryType === 'free' || store.deliveryFee === 0 ? 'Grátis' :
                                                        store.deliveryType === 'fixed' ? `R$ ${store.deliveryFee?.toFixed(2)}` : 'a calcular'}
                                                </span>
                                            ) : store.acceptsPickup ? (
                                                <span className="flex items-center gap-1"><PackageCheck size={12} />Retirada</span>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 text-white z-10">
                                        <h3 className="text-xl sm:text-3xl lg:text-4xl font-black drop-shadow-lg mb-0.5 leading-tight">{store.name}</h3>

                                        {minP && maxP && (
                                            <div className="text-xs sm:text-sm font-bold text-emerald-300 mb-2">
                                                {minP === maxP ? minP : `${minP} - ${maxP}`}
                                            </div>
                                        )}

                                        {(showAddressBadge || showDistanceBadge) && (
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs mb-2">
                                                <div className="inline-flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-full text-xs font-bold backdrop-blur-md"
                                                    style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                                    <MapPin size={14} className="flex-shrink-0 text-orange-400" />
                                                    {showAddressBadge && (
                                                        <span className="truncate font-medium text-white/90" title={store.address}>{streetText}</span>
                                                    )}
                                                    {showAddressBadge && showDistanceBadge && <span className="opacity-50">•</span>}
                                                    {showDistanceBadge && (
                                                        <span className="flex-shrink-0 font-bold">{distText}</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between mt-2">
                                            {productsWithImages.length > 0 && (
                                                <div className="flex -space-x-2">
                                                    {productsWithImages.slice(0, 3).map((p, i) => (
                                                        <div key={`prod-${store.slug}-${i}`} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 overflow-hidden bg-black/40" title={p.name}>
                                                            {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />}
                                                        </div>
                                                    ))}
                                                    {productsWithImages.length > 3 && (
                                                        <div key={`prod-${store.slug}-extra`} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 bg-black/60 flex items-center justify-center text-[10px] sm:text-sm font-bold">
                                                            +{productsWithImages.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 ml-auto">
                                                {store.viewCount != null && store.viewCount > 0 && (
                                                    <div className="flex items-center gap-1 text-[11px] font-bold text-white/90"><Eye size={12} />{store.viewCount}</div>
                                                )}
                                                {store.rating != null && store.rating > 0 && (
                                                    <div className="flex items-center gap-1.5 text-xs font-bold">
                                                        <Star size={12} className="fill-yellow-400 text-yellow-400" />
                                                        <span className="text-white/90">{store.rating.toFixed(1)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button onClick={goToPrev} className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}><ChevronLeft size={16} /></button>
                    <div className="flex gap-2">
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <button key={`page-dot-${i}-${totalPages}`} onClick={() => setCurrentPage(i)} className="h-2 rounded-full transition-all duration-300"
                                style={{ width: i === currentPage ? '1.5rem' : '0.5rem', background: i === currentPage ? colors.accent : colors.border }} />
                        ))}
                    </div>
                    <button onClick={goToNext} className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}><ChevronRight size={16} /></button>
                </div>
            )}
        </div>
    )
}