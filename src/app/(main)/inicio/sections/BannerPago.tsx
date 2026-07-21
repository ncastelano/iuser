// src/app/(main)/inicio/sections/BannerPago.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    ChevronLeft,
    ChevronRight,
    Star,
    MapPin,
    Clock,
    ShoppingBag,
    Eye,
    Spline,
    Timer,
    Bike,
    PackageCheck,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getStatusIntervalText } from '@/lib/storeHours'
import DistanceCalculator from '../../DistanceCalculator'

// ---------- Tipos ----------
interface TopProduct {
    imageUrl: string | null
    name: string
    price: number | null
}

interface StoreCard {
    slug: string
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
function extractStreetAddress(fullAddress?: string): string {
    if (!fullAddress) return ''
    const parts = fullAddress.split(',').map(p => p.trim())
    let street = parts[0] || ''
    if (parts.length > 1 && !/\d/.test(street)) {
        street += ', ' + parts[1]
    }
    return street
}

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

function parseStoreCoords(store: any): { lat: number; lng: number } | null {
    if (typeof store.latitude === 'number' && typeof store.longitude === 'number' && isFinite(store.latitude) && isFinite(store.longitude)) {
        return { lat: store.latitude, lng: store.longitude }
    }
    if (typeof store.lat === 'number' && typeof store.lng === 'number' && isFinite(store.lat) && isFinite(store.lng)) {
        return { lat: store.lat, lng: store.lng }
    }
    if (store.location) {
        const loc = store.location
        if (typeof loc === 'object' && loc !== null) {
            if ('lat' in loc && 'lng' in loc) {
                const lat = Number(loc.lat)
                const lng = Number(loc.lng)
                if (isFinite(lat) && isFinite(lng)) return { lat, lng }
            }
            if (loc.type === 'Point' && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
                const lng = Number(loc.coordinates[0])
                const lat = Number(loc.coordinates[1])
                if (isFinite(lat) && isFinite(lng)) return { lat, lng }
            }
        }
        if (typeof loc === 'string') {
            if (loc.startsWith('{') || loc.startsWith('[')) {
                try {
                    const parsed = JSON.parse(loc)
                    return parseStoreCoords({ location: parsed })
                } catch { }
            }
            const match = loc.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
            if (match) {
                const lng = parseFloat(match[1])
                const lat = parseFloat(match[2])
                if (isFinite(lat) && isFinite(lng)) return { lat, lng }
            }
        }
    }
    return null
}

const CACHE_KEY = 'banner_stores_cache_v2'
const CACHE_TTL = 5 * 60 * 1000

function loadCache(): StoreCard[] | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const { data, timestamp } = JSON.parse(raw)
        if (Date.now() - timestamp < CACHE_TTL) {
            return data as StoreCard[]
        }
    } catch { }
    return null
}

function saveCache(stores: StoreCard[]) {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: stores,
            timestamp: Date.now()
        }))
    } catch { }
}

// ---------- Hook para detectar breakpoint ----------
function useBreakpoint() {
    const [slidesPerView, setSlidesPerView] = useState(1)

    useEffect(() => {
        const update = () => {
            const width = window.innerWidth
            if (width >= 1120) {
                setSlidesPerView(3)
            } else if (width >= 800) {
                setSlidesPerView(2)
            } else {
                setSlidesPerView(1)
            }
        }

        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return slidesPerView
}

// ---------- Componente Skeleton ----------
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
                    {Array.from({ length: visibleSlides }).map((_, index) => (
                        <div
                            key={index}
                            className="flex-shrink-0"
                            style={{
                                width: `${100 / visibleSlides}%`,
                            }}
                        >
                            <div className="relative h-72 sm:h-96 lg:h-[30rem]">
                                <div
                                    className="absolute inset-0 rounded-2xl overflow-hidden border"
                                    style={{
                                        borderColor: colors.border,
                                        background: colors.surface,
                                    }}
                                >
                                    <div
                                        className="absolute inset-0 animate-pulse"
                                        style={{
                                            background: `linear-gradient(135deg, ${colors.border}40, ${colors.border}20)`,
                                        }}
                                    />

                                    <div className="absolute top-3 left-3 z-20">
                                        <div
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-full"
                                            style={{
                                                background: colors.border,
                                                width: 80,
                                                height: 26,
                                            }}
                                        >
                                            <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-12 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                        </div>
                                    </div>

                                    <div className="absolute top-12 left-3 z-20">
                                        <div
                                            className="flex items-center gap-2 px-2 py-1 rounded-full"
                                            style={{
                                                background: colors.surface,
                                                opacity: 0.6,
                                                height: 26,
                                            }}
                                        >
                                            <div className="w-4 h-4 rounded animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-16 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-4 h-4 rounded animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-16 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                        </div>
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 z-10">
                                        <div className="w-3/4 h-8 sm:h-10 rounded animate-pulse mb-1" style={{ background: colors.border }} />
                                        <div className="flex flex-col gap-1 mb-2">
                                            <div className="w-1/2 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                            <div className="w-1/3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                                            <div className="flex items-center gap-1">
                                                <div className="w-3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                <div className="w-24 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="w-3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                <div className="w-12 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                            <div className="flex -space-x-2">
                                                {[1, 2, 3].map((_, i) => (
                                                    <div
                                                        key={i}
                                                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 overflow-hidden animate-pulse"
                                                        style={{ background: colors.border }}
                                                    />
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1">
                                                    <div className="w-3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                    <div className="w-8 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-3 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                    <div className="w-10 h-3 rounded animate-pulse" style={{ background: colors.border }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-center gap-3 mt-4">
                <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: colors.border }} />
                <div className="flex gap-2">
                    {[1, 2, 3].map((_, idx) => (
                        <div
                            key={idx}
                            className="h-2 rounded-full animate-pulse"
                            style={{
                                width: idx === 1 ? '1.5rem' : '0.5rem',
                                background: colors.border,
                            }}
                        />
                    ))}
                </div>
                <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: colors.border }} />
            </div>
        </div>
    )
}

// ---------- Hook de dados ----------
function useBannerStores(savedLocation?: { lat: number; lng: number } | null) {
    const [stores, setStores] = useState<StoreCard[]>([])
    const [loading, setLoading] = useState(true)
    const [effectiveLocation, setEffectiveLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [locationAttempted, setLocationAttempted] = useState(false)

    useEffect(() => {
        // PRIORIDADE 1: Usar a localização salva do usuário (vinda do page.tsx)
        if (savedLocation) {
            console.log('[BannerPago] Usando localização salva:', savedLocation)
            setEffectiveLocation(savedLocation)
            setLocationAttempted(true)
            return
        }

        // PRIORIDADE 2: Tentar obter localização do navegador
        if (!locationAttempted && 'geolocation' in navigator) {
            console.log('[BannerPago] Tentando obter localização do navegador')
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const location = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    }
                    console.log('[BannerPago] Localização do navegador obtida:', location)
                    setEffectiveLocation(location)
                    setLocationAttempted(true)
                },
                (err) => {
                    console.warn('[BannerPago] Erro ao obter localização do navegador:', err)
                    setEffectiveLocation(null)
                    setLocationAttempted(true)
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            )
        }
    }, [savedLocation, locationAttempted])

    useEffect(() => {
        let cancelled = false

        const fetchFreshData = async () => {
            console.log('[BannerPago] Buscando lojas com localização:', effectiveLocation)
            let storesList: any[] | null = null

            if (effectiveLocation) {
                try {
                    const { data, error: rpcErr } = await supabase
                        .rpc('get_stores_with_distance', {
                            user_lat: effectiveLocation.lat,
                            user_lng: effectiveLocation.lng
                        })
                    if (!rpcErr && data && data.length > 0) {
                        console.log('[BannerPago] Lojas encontradas via RPC:', data.length)
                        storesList = data
                    } else if (rpcErr) {
                        console.warn('[BannerPago] Erro na RPC get_stores_with_distance:', rpcErr)
                    }
                } catch (e) {
                    console.warn('[BannerPago] RPC get_stores_with_distance falhou:', e)
                }
            }

            // Fallback: buscar lojas ativas se a RPC falhou ou não tem localização
            if (!storesList || storesList.length === 0) {
                console.log('[BannerPago] Buscando lojas ativas (fallback)')
                const { data: activeStores } = await supabase
                    .from('stores')
                    .select('*')
                    .eq('is_active', true)
                    .order('ratings_avg', { ascending: false })
                    .limit(20)
                storesList = activeStores
                console.log('[BannerPago] Lojas ativas encontradas:', storesList?.length || 0)
            }

            if (!storesList || storesList.length === 0) {
                console.log('[BannerPago] Buscando todas as lojas (último fallback)')
                const { data: allStores } = await supabase
                    .from('stores')
                    .select('*')
                    .limit(20)
                storesList = allStores
                console.log('[BannerPago] Todas as lojas encontradas:', storesList?.length || 0)
            }

            if (cancelled || !storesList) return

            const storeIds = storesList.map((s: any) => s.id) || []

            const { data: productsList } = await supabase
                .from('products')
                .select('id, name, store_id, image_url, duration_minutes, price')
                .in('store_id', storeIds)
                .eq('listing_type', 'sale')
                .eq('is_active', true)

            console.log('[BannerPago] Produtos encontrados:', productsList?.length || 0)

            let deliveryFieldsMap = new Map<string, any>()
            if (storeIds.length > 0) {
                const { data: deliveryData } = await supabase
                    .from('stores')
                    .select('id, accepts_delivery, accepts_pickup, delivery_type, delivery_fee')
                    .in('id', storeIds)
                if (deliveryData) {
                    deliveryData.forEach((d: any) => deliveryFieldsMap.set(d.id, d))
                }
            }

            const { data: reviewsList } = await supabase
                .from('product_reviews')
                .select('store_id, rating')

            const { data: paidOrderItems } = await supabase
                .from('order_items')
                .select('product_id, orders!inner(status)')
                .eq('orders.status', 'paid')

            if (cancelled) return

            const ratingsMap = new Map<string, { sum: number; count: number }>()
            reviewsList?.forEach(r => {
                if (!ratingsMap.has(r.store_id)) ratingsMap.set(r.store_id, { sum: 0, count: 0 })
                const cur = ratingsMap.get(r.store_id)!
                cur.sum += r.rating
                cur.count += 1
            })

            const salesCount = new Map<string, number>()
            paidOrderItems?.forEach((item: any) => {
                salesCount.set(item.product_id, (salesCount.get(item.product_id) || 0) + 1)
            })

            const storeProds = new Map<string, typeof productsList>()
            productsList?.forEach(p => {
                if (!storeProds.has(p.store_id)) storeProds.set(p.store_id, [])
                storeProds.get(p.store_id)!.push(p)
            })

            const cards: StoreCard[] = storesList.map((store: any) => {
                const logoUrl = store.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null

                const ratingData = ratingsMap.get(store.id)
                const avg = ratingData ? ratingData.sum / ratingData.count : store.ratings_avg ?? 0
                const count = ratingData ? ratingData.count : store.ratings_count ?? 0

                const status = getStatusIntervalText(store.business_hours)

                const prods = storeProds.get(store.id) || []
                const durations = prods
                    .map(p => p.duration_minutes)
                    .filter((d): d is number => d != null)
                const durationMin = durations.length ? Math.min(...durations) : null
                const durationMax = durations.length ? Math.max(...durations) : null

                const prices = prods
                    .map(p => p.price)
                    .filter((p): p is number => p != null && p > 0)
                const minPrice = prices.length ? Math.min(...prices) : null
                const maxPrice = prices.length ? Math.max(...prices) : null

                const productsWithImages = prods
                    .filter(p => p.image_url)
                    .sort((a, b) => (salesCount.get(b.id) || 0) - (salesCount.get(a.id) || 0))
                    .slice(0, 3)
                    .map(p => ({
                        imageUrl: p.image_url
                            ? supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl
                            : null,
                        name: p.name,
                        price: p.price
                    }))

                const storeCoords = parseStoreCoords(store)

                // PEGA A DISTÂNCIA DO BANCO (vem da RPC get_stores_with_distance)
                let distanceMeters = store.distance_meters ?? null

                // Se não veio distância da RPC, mas temos localização do usuário e coordenadas da loja, calculamos
                if (!distanceMeters && effectiveLocation && storeCoords) {
                    distanceMeters = calculateHaversineDistanceMeters(
                        effectiveLocation.lat,
                        effectiveLocation.lng,
                        storeCoords.lat,
                        storeCoords.lng
                    )
                    console.log(`[BannerPago] Distância calculada para ${store.name}:`, distanceMeters)
                }

                const deliveryFields = deliveryFieldsMap.get(store.id) || {}
                const acceptsDelivery = deliveryFields.accepts_delivery ?? store.accepts_delivery ?? false
                const acceptsPickup = deliveryFields.accepts_pickup ?? store.accepts_pickup ?? false
                const deliveryType = deliveryFields.delivery_type ?? store.delivery_type ?? null
                const deliveryFee = deliveryFields.delivery_fee ?? store.delivery_fee ?? null

                return {
                    slug: store.storeSlug,
                    name: store.name,
                    logoUrl,
                    coverUrl: logoUrl,
                    description: store.description,
                    rating: Number(avg.toFixed(1)),
                    ratingCount: count,
                    isOpen: status.isOpen,
                    statusText: status.text,
                    address: store.address,
                    location: store.location,
                    lat: storeCoords?.lat ?? store.latitude ?? store.lat ?? null,
                    lng: storeCoords?.lng ?? store.longitude ?? store.lng ?? null,
                    viewCount: store.view_count ?? 0,
                    durationMin,
                    durationMax,
                    topProducts: productsWithImages,
                    distanceMeters: distanceMeters,
                    deliveryType,
                    deliveryFee,
                    acceptsDelivery,
                    acceptsPickup,
                    minPrice: minPrice ?? null,
                    maxPrice: maxPrice ?? null,
                    totalProducts: prods.length,
                }
            })

            if (!cards || cards.length === 0) {
                return []
            }

            cards.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
            return cards
        }

        const cached = loadCache()
        if (cached && cached.length > 0) {
            console.log('[BannerPago] Usando cache com', cached.length, 'lojas')
            setStores(cached)
            setLoading(false)
        }

        fetchFreshData()
            .then((freshCards) => {
                if (!cancelled && freshCards) {
                    console.log('[BannerPago] Dados frescos obtidos:', freshCards.length, 'lojas')
                    setStores(freshCards)
                    saveCache(freshCards)
                }
            })
            .catch((err) => {
                console.error("[BannerPago] Error fetching banner stores:", err)
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => { cancelled = true }
    }, [effectiveLocation])

    return { stores, loading, effectiveLocation }
}

// ---------- Componente Principal ----------
interface BannerPagoProps {
    savedLocation?: { lat: number; lng: number } | null
}

export default function BannerPago({ savedLocation = null }: BannerPagoProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const { stores, loading, effectiveLocation } = useBannerStores(savedLocation)
    const slidesPerView = useBreakpoint()
    const sortedStores = stores
    const totalRealSlides = sortedStores.length

    const totalPages = Math.max(1, Math.ceil(totalRealSlides / slidesPerView))

    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)

    useEffect(() => {
        setCurrentPage(0)
    }, [slidesPerView])

    const goToNext = useCallback(() => {
        if (totalPages <= 1) return
        setCurrentPage(prev => (prev + 1) % totalPages)
    }, [totalPages])

    const goToPrev = useCallback(() => {
        if (totalPages <= 1) return
        setCurrentPage(prev => (prev - 1 + totalPages) % totalPages)
    }, [totalPages])

    useEffect(() => {
        if (isHovered || isDragging || totalPages <= 1) return
        autoPlayRef.current = setInterval(goToNext, 5000)
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current)
        }
    }, [isHovered, isDragging, goToNext, totalPages])

    const currentItems = useCallback(() => {
        if (totalRealSlides === 0) return []
        const start = currentPage * slidesPerView
        const end = Math.min(start + slidesPerView, totalRealSlides)
        return sortedStores.slice(start, end)
    }, [sortedStores, currentPage, slidesPerView, totalRealSlides])

    const items = currentItems()

    const handleDragStart = useCallback((clientX: number) => {
        setIsDragging(true)
        setDragStartX(clientX)
        setDragOffset(0)
    }, [])

    const handleDragMove = useCallback((clientX: number) => {
        if (!isDragging) return
        setDragOffset(clientX - dragStartX)
    }, [isDragging, dragStartX])

    const handleDragEnd = useCallback(() => {
        if (!isDragging) return
        setIsDragging(false)
        if (dragOffset > 50) goToPrev()
        else if (dragOffset < -50) goToNext()
        setDragOffset(0)
    }, [isDragging, dragOffset, goToPrev, goToNext])

    const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); handleDragStart(e.clientX) }
    const onMouseMove = (e: React.MouseEvent) => { if (isDragging) { e.preventDefault(); handleDragMove(e.clientX) } }
    const onMouseUp = () => handleDragEnd()
    const onTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].clientX)
    const onTouchMove = (e: React.TouchEvent) => { if (isDragging) handleDragMove(e.touches[0].clientX) }
    const onTouchEnd = () => handleDragEnd()

    const translateX = dragOffset / (trackRef.current?.clientWidth || 1) * 100

    const formatDuration = (minutes: number) => {
        if (minutes < 60) return `${minutes}min`
        const h = Math.floor(minutes / 60)
        const m = minutes % 60
        return m > 0 ? `${h}h ${m}min` : `${h}h`
    }

    const formatPrice = (price: number | null | undefined): string | null => {
        if (price == null) return null
        return price.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        })
    }

    const renderDeliveryBadge = (store: StoreCard) => {
        if (!store.acceptsDelivery) return null
        if (store.deliveryType === 'free' || (store.deliveryFee != null && store.deliveryFee === 0)) {
            return (
                <span className="flex items-center gap-1">
                    <Bike size={12} />
                    <span>Grátis</span>
                </span>
            )
        } else if (store.deliveryType === 'fixed' && store.deliveryFee != null) {
            return (
                <span className="flex items-center gap-1">
                    <Bike size={12} />
                    <span>R$ {store.deliveryFee.toFixed(2)}</span>
                </span>
            )
        } else if (store.deliveryType === 'distance') {
            return (
                <span className="flex items-center gap-1">
                    <Bike size={12} />
                    <span>a calcular</span>
                </span>
            )
        }
        return null
    }

    if (loading) {
        return <BannerSkeleton slidesPerView={slidesPerView} />
    }

    if (!sortedStores.length) {
        return null
    }

    const gridCols = slidesPerView === 3 ? 'grid-cols-3' : slidesPerView === 2 ? 'grid-cols-2' : 'grid-cols-1'

    return (
        <div
            className="relative w-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center gap-2 mb-2 px-1">
                <ShoppingBag size={18} style={{ color: colors.accent }} />
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
                    Lojas em destaque
                </h2>
            </div>

            <div
                className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <div
                    ref={trackRef}
                    className={`grid ${gridCols} gap-3`}
                    style={{
                        transform: isDragging ? `translateX(${translateX}px)` : 'none',
                        transition: isDragging ? 'none' : 'transform 0.3s ease',
                    }}
                >
                    {items.map((store) => {
                        const backgroundImage = store.coverUrl || store.logoUrl
                        const productsWithImages = store.topProducts?.filter(p => p.imageUrl) || []
                        const minPriceFormatted = formatPrice(store.minPrice ?? null)
                        const maxPriceFormatted = formatPrice(store.maxPrice ?? null)

                        return (
                            <div
                                key={store.slug}
                                className="relative h-72 sm:h-96 lg:h-[30rem]"
                            >
                                <div
                                    onClick={() => router.push(`/${store.slug}`)}
                                    className="group absolute inset-0 rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-[1.02]"
                                    style={{
                                        borderColor: colors.border,
                                        boxShadow: colors.shadow,
                                    }}
                                >
                                    {backgroundImage ? (
                                        <img
                                            src={backgroundImage}
                                            alt={store.name}
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        />
                                    ) : (
                                        <div
                                            className="absolute inset-0"
                                            style={{
                                                background: `linear-gradient(135deg, ${colors.accent}66, ${colors.background})`,
                                            }}
                                        />
                                    )}

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />

                                    {/* Badge de status */}
                                    <div className="absolute top-3 left-3 z-20">
                                        <div
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold shadow-lg"
                                            style={{
                                                background: store.isOpen ? '#10b981' : '#ef4444',
                                                color: '#ffffff',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                            }}
                                        >
                                            <Clock size={12} />
                                            <span>{store.statusText}</span>
                                        </div>
                                    </div>

                                    {/* Badge de duração + entrega */}
                                    <div className="absolute top-12 left-3 z-20">
                                        <div
                                            className="flex items-center gap-2 px-2 py-1 rounded-full text-xs font-bold shadow-lg"
                                            style={{
                                                background: 'rgba(0,0,0,0.75)',
                                                color: '#ffffff',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                            }}
                                        >
                                            {store.durationMin != null && store.durationMax != null && (
                                                <span className="flex items-center gap-1">
                                                    <Timer size={12} />
                                                    <span>
                                                        {formatDuration(store.durationMin)}
                                                        {store.durationMin !== store.durationMax && ` - ${formatDuration(store.durationMax)}`}
                                                    </span>
                                                </span>
                                            )}
                                            {store.durationMin != null && store.durationMax != null && (
                                                <span className="opacity-50 mx-0.5">•</span>
                                            )}
                                            {store.acceptsDelivery ? (
                                                renderDeliveryBadge(store)
                                            ) : store.acceptsPickup ? (
                                                <span className="flex items-center gap-1">
                                                    <PackageCheck size={12} />
                                                    <span>Retirada</span>
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Conteúdo inferior */}
                                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 text-white z-10">
                                        <h3 className="text-xl sm:text-3xl lg:text-4xl font-black drop-shadow-lg mb-0.5 leading-tight">
                                            {store.name}
                                        </h3>

                                        {/* Faixa de preços - sem container, apenas texto verde */}
                                        {minPriceFormatted && maxPriceFormatted && (
                                            <div className="text-xs sm:text-sm font-bold text-emerald-300 mb-2">
                                                {minPriceFormatted === maxPriceFormatted
                                                    ? minPriceFormatted
                                                    : `${minPriceFormatted} - ${maxPriceFormatted}`}
                                            </div>
                                        )}

                                        {((store.address && store.address !== 'Endereço não informado') || store.location || (store.lat != null && store.lng != null)) && (
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs mb-2">
                                                <DistanceCalculator
                                                    coords={store.location || (store.lat != null && store.lng != null ? { lat: store.lat, lng: store.lng } : null)}
                                                    lat={store.lat}
                                                    lng={store.lng}
                                                    address={store.address}
                                                    storeName={store.name}
                                                    userLocation={effectiveLocation}
                                                    distanceMeters={store.distanceMeters}
                                                    showDistance={true}
                                                    showAddress={true}
                                                    isButton={false}
                                                    className="text-white/90"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/${store.slug}`);
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {/* Produtos + métricas */}
                                        <div className="flex items-center justify-between mt-2">
                                            {productsWithImages.length > 0 && (
                                                <div className="flex -space-x-2">
                                                    {productsWithImages.slice(0, 3).map((product, i) => (
                                                        <div
                                                            key={i}
                                                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 overflow-hidden bg-black/40 backdrop-blur-sm"
                                                            title={product.name}
                                                        >
                                                            {product.imageUrl ? (
                                                                <img
                                                                    src={product.imageUrl}
                                                                    alt={product.name}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                    {productsWithImages.length > 3 && (
                                                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 bg-black/60 backdrop-blur-sm flex items-center justify-center text-[10px] sm:text-sm font-bold text-white">
                                                            +{productsWithImages.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-center gap-3 ml-auto">
                                                {store.viewCount != null && store.viewCount > 0 && (
                                                    <div className="flex items-center gap-1 text-[11px] font-bold text-white/90">
                                                        <Eye size={12} />
                                                        <span>{store.viewCount}</span>
                                                    </div>
                                                )}
                                                {store.rating != null && store.rating > 0 && (
                                                    <div className="flex items-center gap-1.5 text-xs font-bold">
                                                        <Star size={12} className="fill-yellow-400 text-yellow-400" />
                                                        <span className="text-white/90">{store.rating.toFixed(1)}</span>
                                                        {store.ratingCount && (
                                                            <span className="text-[10px] text-white/60">
                                                                ({store.ratingCount})
                                                            </span>
                                                        )}
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
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex gap-2">
                        {Array.from({ length: totalPages }).map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentPage(idx)}
                                className="h-2 rounded-full transition-all duration-300"
                                style={{
                                    width: idx === currentPage ? '1.5rem' : '0.5rem',
                                    background: idx === currentPage ? colors.accent : colors.border,
                                }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={goToNext}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}