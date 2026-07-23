// src/app/(main)/inicio/sections/BannerPago.tsx
'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
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
    Calendar,
    Store,
    TrendingUp,
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import { supabase } from '@/lib/supabase/client'
import { getStatusIntervalText, isStoreOpenNow, getStoreStatusText, type BusinessHours } from '@/lib/storeHours'

// ---------- Tipos ----------
interface TopProduct {
    imageUrl: string | null
    name: string
    price: number | null
}

interface StoreCard {
    storeSlug: string
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
    business_hours?: BusinessHours | null
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

// Função para obter o horário formatado do dia atual
function getCurrentDayHoursText(businessHours: BusinessHours | null | undefined): string | null {
    if (!businessHours) return null

    const weekly = businessHours.weekly
    if (!weekly || typeof weekly !== 'object' || Object.keys(weekly).length === 0) {
        return null
    }

    const todayKey = String(new Date().getDay())
    const dayConfig = weekly[todayKey]

    if (dayConfig?.isOpen && dayConfig.start && dayConfig.end) {
        return `${dayConfig.start.slice(0, 5)} - ${dayConfig.end.slice(0, 5)}`
    }

    return null
}

// Função para obter o próximo horário de abertura
function getNextOpeningInfo(businessHours: BusinessHours | null | undefined): { dayLabel: string; time: string } | null {
    if (!businessHours) return null

    const weekly = businessHours.weekly
    if (!weekly || typeof weekly !== 'object' || Object.keys(weekly).length === 0) {
        return null
    }

    const daysOfWeek = [
        { key: '0', label: 'Domingo' },
        { key: '1', label: 'Segunda-feira' },
        { key: '2', label: 'Terça-feira' },
        { key: '3', label: 'Quarta-feira' },
        { key: '4', label: 'Quinta-feira' },
        { key: '5', label: 'Sexta-feira' },
        { key: '6', label: 'Sábado' },
    ]

    const now = new Date()
    const currentDay = now.getDay().toString()

    if (isStoreOpenNow(businessHours)) {
        return null
    }

    for (let i = 1; i <= 7; i++) {
        const dayIndex = (parseInt(currentDay) + i) % 7
        const dayKey = dayIndex.toString()
        const dayConfig = weekly[dayKey]

        if (dayConfig?.isOpen && dayConfig.start) {
            const dayLabel = daysOfWeek.find(d => d.key === dayKey)?.label || ''
            const timeStr = dayConfig.start.slice(0, 5)
            return { dayLabel, time: timeStr }
        }
    }

    return null
}

const CACHE_KEY = 'banner_stores_cache_v18'
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

            const storesWithOwner = await Promise.all(storesList.map(async (store: any) => {
                if (!store.owner_id) {
                    const { data: storeData } = await supabase
                        .from('stores')
                        .select('owner_id')
                        .eq('id', store.id)
                        .single()

                    if (storeData?.owner_id) {
                        store.owner_id = storeData.owner_id
                    }
                }
                return store
            }))

            const ownerIds = [...new Set(storesWithOwner.map((s: any) => s.owner_id).filter(Boolean))]

            let profileMap = new Map<string, string>()

            if (ownerIds.length > 0) {
                const { data: profiles, error } = await supabase
                    .from('profiles')
                    .select('id, profileSlug')
                    .in('id', ownerIds)
                    .not('profileSlug', 'is', null)

                if (error) {
                    console.error('[BannerPago] Erro ao buscar profiles:', error)
                } else {
                    profiles?.forEach((p: any) => {
                        if (p.profileSlug) {
                            profileMap.set(p.id, p.profileSlug)
                        }
                    })
                }
            }

            const validStores = storesWithOwner.filter((store: any) => {
                const hasProfileSlug = profileMap.has(store.owner_id)
                if (!hasProfileSlug) {
                    console.warn(`[BannerPago] Loja "${store.name}" ignorada: owner ${store.owner_id} não tem profileSlug`)
                }
                return hasProfileSlug
            })

            if (validStores.length === 0) {
                console.warn('[BannerPago] Nenhuma loja válida encontrada (todas sem profileSlug)')
                return []
            }

            return validStores.map((store: any) => {
                const logoUrl = store.logo_url
                    ? supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                    : null

                const status = getStatusIntervalText(store.business_hours)

                const prods = storeProds.get(store.id) || []
                const durations = prods.map((p: any) => p.duration_minutes).filter((d: any): d is number => d != null)
                const prices = prods.map((p: any) => p.price).filter((p: any): p is number => p != null && p > 0)
                const storeCoords = parseStoreCoords(store)
                const profileSlug = profileMap.get(store.owner_id) || ''

                let distanceMeters: number | null = null
                if (store.distance_km != null) {
                    distanceMeters = store.distance_km * 1000
                } else if (store.distance_meters != null) {
                    distanceMeters = store.distance_meters
                } else if (location && storeCoords) {
                    distanceMeters = calculateHaversineDistanceMeters(
                        location.lat,
                        location.lng,
                        storeCoords.lat,
                        storeCoords.lng
                    )
                }

                let businessHours = store.business_hours
                if (typeof businessHours === 'string') {
                    try {
                        businessHours = JSON.parse(businessHours)
                    } catch {
                        businessHours = null
                    }
                }

                return {
                    storeSlug: store.storeSlug || '',
                    profileSlug: profileSlug,
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
                    business_hours: businessHours,
                }
            }).sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
        }

        const fetchFreshData = async () => {
            let storesList: any[] = []

            if (effectiveLocation) {
                try {
                    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_stores_with_distance', {
                        user_lat: effectiveLocation.lat,
                        user_lng: effectiveLocation.lng,
                        max_distance: 50
                    })
                    if (!rpcErr && rpcData?.length > 0) {
                        storesList = rpcData
                        console.log(`[BannerPago] RPC retornou ${storesList.length} lojas`)
                    }
                } catch (e) {
                    console.warn('[BannerPago] RPC falhou:', e)
                }
            }

            if (storesList.length === 0) {
                const { data, error } = await supabase
                    .from('stores')
                    .select('*')
                    .eq('is_active', true)
                    .order('ratings_avg', { ascending: false })
                    .limit(20)

                if (!error && data) {
                    storesList = data
                    console.log(`[BannerPago] Query retornou ${storesList.length} lojas`)
                }
            }

            if (cancelled || storesList.length === 0) {
                if (!cancelled) setLoading(false)
                return
            }

            const cards = await buildStoreCards(storesList, effectiveLocation)

            if (!cancelled && cards.length > 0) {
                console.log(`[BannerPago] ${cards.length} lojas com profileSlug válido`)
                setStores(cards)
                saveCache(cards)
                setLoading(false)
            } else if (!cancelled) {
                console.warn('[BannerPago] Nenhuma loja com profileSlug válido encontrada')
                setStores([])
                setLoading(false)
            }
        }

        const cached = loadCache()
        if (cached?.length) {
            console.log('[BannerPago] Cache carregado:', cached.length, 'lojas')
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
    const { colors } = useTheme()
    const trackRef = useRef<HTMLDivElement>(null)
    const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

    const locationToUse = userLocation || savedLocation
    const { stores, loading } = useBannerStores(locationToUse)
    const slidesPerView = useBreakpoint()
    const sortedStores = stores
    const totalRealSlides = sortedStores.length
    const totalPages = Math.max(1, Math.ceil(totalRealSlides / slidesPerView))

    const [currentPage, setCurrentPage] = useState(0)
    const [isHovered, setIsHovered] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStartX, setDragStartX] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)
    const dragDistance = useRef(0)

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

    const handleDragStart = (clientX: number) => {
        setIsDragging(true)
        setDragStartX(clientX)
        setDragOffset(0)
        dragDistance.current = 0
    }

    const handleDragMove = (clientX: number) => {
        if (isDragging) {
            const offset = clientX - dragStartX
            setDragOffset(offset)
            dragDistance.current = Math.abs(offset)
        }
    }

    const handleDragEnd = () => {
        if (!isDragging) return
        setIsDragging(false)

        if (dragDistance.current > 50) {
            if (dragOffset > 0) goToPrev()
            else goToNext()
        }
        setDragOffset(0)
    }

    const getStoreUrl = (store: StoreCard) => {
        return `/${store.profileSlug}/${store.storeSlug}`
    }

    const formatDuration = (m: number) => m < 60 ? `${m}min` : `${Math.floor(m / 60)}h ${m % 60 ? m % 60 + 'min' : ''}`
    const formatPrice = (p: number | null | undefined) => p == null ? null : p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    if (loading) return <BannerSkeleton slidesPerView={slidesPerView} />
    if (!sortedStores.length) return null

    const gridCols = slidesPerView === 3 ? 'grid-cols-3' : slidesPerView === 2 ? 'grid-cols-2' : 'grid-cols-1'

    return (
        <div className="relative w-full" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => {
            setIsHovered(false)
            handleDragEnd()
        }}>
            <div className="flex items-center gap-2 mb-3 px-1">
                <div className="p-1.5 rounded-xl" style={{ background: `${colors.accent}20` }}>
                    <Store size={16} style={{ color: colors.accent }} />
                </div>
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>Lojas em destaque</h2>
                {!locationToUse && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: colors.border, color: colors.textSecondary }}>
                        Ative sua localização
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
                    className={`grid ${gridCols} gap-4`}
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
                        const storeUrl = getStoreUrl(store)

                        const hasBusinessHours = store.business_hours &&
                            store.business_hours.weekly &&
                            typeof store.business_hours.weekly === 'object' &&
                            Object.keys(store.business_hours.weekly).length > 0

                        const currentHoursText = hasBusinessHours ? getCurrentDayHoursText(store.business_hours) : null
                        const nextAvailable = !store.isOpen && hasBusinessHours ? getNextOpeningInfo(store.business_hours) : null

                        const statusColor = store.isOpen ? '#10b981' : '#ef4444'
                        const statusGlow = store.isOpen ? '0 0 20px rgba(16, 185, 129, 0.3)' : '0 0 20px rgba(239, 68, 68, 0.3)'

                        return (
                            <div key={`card-${store.storeSlug}-${storeIndex}`} className="relative h-72 sm:h-96 lg:h-[30rem]">
                                <Link
                                    href={storeUrl}
                                    onClick={(e) => {
                                        if (dragDistance.current >= 10) {
                                            e.preventDefault()
                                        }
                                    }}
                                    className="block absolute inset-0"
                                >
                                    <div
                                        className="group absolute inset-0 rounded-2xl overflow-hidden border-2 transition-all duration-500 transform hover:scale-[1.02] hover:shadow-2xl"
                                        style={{
                                            borderColor: colors.border,
                                            boxShadow: colors.shadow,
                                            background: colors.surface,
                                        }}
                                    >
                                        {bgImage ? (
                                            <>
                                                <img
                                                    src={bgImage}
                                                    alt={store.name}
                                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
                                            </>
                                        ) : (
                                            <div className="absolute inset-0" style={{
                                                background: `linear-gradient(135deg, ${colors.accent}44, ${colors.background})`
                                            }} />
                                        )}

                                        {storeIndex === 0 && (
                                            <div className="absolute top-3 right-3 z-20">
                                                <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase backdrop-blur-md"
                                                    style={{
                                                        background: 'rgba(251, 191, 36, 0.9)',
                                                        color: '#000',
                                                        boxShadow: '0 4px 12px rgba(251, 191, 36, 0.4)',
                                                    }}
                                                >
                                                    <TrendingUp size={12} />
                                                    <span>Destaque</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Status - Aberto/Fechado com horário - mais compacto */}
                                        <div className="absolute top-3 left-3 z-20">
                                            <div
                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-xl backdrop-blur-sm transition-all duration-300 hover:scale-105"
                                                style={{
                                                    background: statusColor,
                                                    color: '#fff',
                                                    boxShadow: `0 4px 12px ${statusColor}60, ${statusGlow}`,
                                                }}
                                            >
                                                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${store.isOpen ? 'bg-white' : 'bg-white/70'}`} />
                                                <Clock size={11} />
                                                <span>
                                                    {store.isOpen ? (
                                                        currentHoursText ? (
                                                            `${currentHoursText}`
                                                        ) : (
                                                            'Aberto'
                                                        )
                                                    ) : (
                                                        currentHoursText ? (
                                                            `${currentHoursText}`
                                                        ) : (
                                                            'Fechado'
                                                        )
                                                    )}
                                                </span>
                                            </div>
                                        </div>


                                        {/* Entrega/Retirada - mais compacto e colado */}
                                        <div className="absolute top-[45px] left-3 z-10">
                                            <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-xl backdrop-blur-md"
                                                style={{
                                                    background: 'rgba(0,0,0,0.6)',
                                                    color: '#fff',
                                                    backdropFilter: 'blur(8px)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                }}
                                            >
                                                {store.durationMin != null && store.durationMax != null && (
                                                    <span className="flex items-center gap-0.5">
                                                        <Timer size={9} />
                                                        <span>{formatDuration(store.durationMin)}{store.durationMin !== store.durationMax && ` - ${formatDuration(store.durationMax)}`}</span>
                                                    </span>
                                                )}
                                                {store.durationMin != null && <span className="opacity-30 mx-0.5">•</span>}
                                                {store.acceptsDelivery ? (
                                                    <span className="flex items-center gap-0.5">
                                                        <Bike size={9} />
                                                        {store.deliveryType === 'free' || store.deliveryFee === 0 ? 'Grátis' :
                                                            store.deliveryType === 'fixed' ? `R$ ${store.deliveryFee?.toFixed(2)}` : 'a calcular'}
                                                    </span>
                                                ) : store.acceptsPickup ? (
                                                    <span className="flex items-center gap-0.5">
                                                        <PackageCheck size={9} />Retirada
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Conteúdo inferior */}
                                        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 text-white z-10">
                                            <div className="w-10 h-0.5 rounded-full mb-2" style={{ background: colors.accent }} />

                                            <h3 className="text-lg sm:text-xl lg:text-2xl font-black drop-shadow-lg leading-tight">
                                                {store.name}
                                            </h3>

                                            {minP && maxP && (
                                                <div className="text-[11px] sm:text-xs font-bold mt-0.5" style={{ color: '#34d399' }}>
                                                    {minP === maxP ? minP : `${minP} - ${maxP}`}
                                                </div>
                                            )}

                                            {(showAddressBadge || showDistanceBadge) && (
                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium backdrop-blur-md"
                                                        style={{
                                                            background: 'rgba(0,0,0,0.5)',
                                                            color: '#fff',
                                                            backdropFilter: 'blur(8px)',
                                                            border: '1px solid rgba(255,255,255,0.06)',
                                                        }}
                                                    >
                                                        <MapPin size={10} className="flex-shrink-0" style={{ color: '#fb923c' }} />
                                                        {showAddressBadge && (
                                                            <span className="truncate max-w-[100px]">{streetText}</span>
                                                        )}
                                                        {showAddressBadge && showDistanceBadge && <span className="opacity-30">•</span>}
                                                        {showDistanceBadge && (
                                                            <span className="font-bold">{distText}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between mt-2">
                                                {productsWithImages.length > 0 && (
                                                    <div className="flex -space-x-1.5">
                                                        {productsWithImages.slice(0, 3).map((p, i) => (
                                                            <div
                                                                key={`prod-${store.storeSlug}-${i}`}
                                                                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white/20 overflow-hidden bg-black/40 shadow-lg transition-transform duration-300 group-hover:scale-110"
                                                                title={p.name}
                                                            >
                                                                {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />}
                                                            </div>
                                                        ))}
                                                        {productsWithImages.length > 3 && (
                                                            <div
                                                                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white/20 bg-black/60 flex items-center justify-center text-[9px] sm:text-[10px] font-bold shadow-lg"
                                                            >
                                                                +{productsWithImages.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 ml-auto">
                                                    {store.viewCount != null && store.viewCount > 0 && (
                                                        <div className="flex items-center gap-0.5 text-[9px] font-bold text-white/80">
                                                            <Eye size={10} />
                                                            {store.viewCount}
                                                        </div>
                                                    )}
                                                    {store.rating != null && store.rating > 0 && (
                                                        <div className="flex items-center gap-0.5 text-[9px] font-bold">
                                                            <Star size={10} className="fill-yellow-400 text-yellow-400" />
                                                            <span className="text-white/90">{store.rating.toFixed(1)}</span>
                                                            {store.ratingCount && store.ratingCount > 0 && (
                                                                <span className="text-white/50 text-[8px]">({store.ratingCount})</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                            style={{
                                                boxShadow: `inset 0 0 40px ${colors.accent}20`,
                                                border: `2px solid ${colors.accent}40`,
                                            }}
                                        />
                                    </div>
                                </Link>
                            </div>
                        )
                    })}
                </div>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        onClick={goToPrev}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg"
                        style={{
                            background: `${colors.accent}15`,
                            color: colors.accent,
                            border: `1px solid ${colors.accent}30`,
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex gap-2">
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <button
                                key={`page-dot-${i}-${totalPages}`}
                                onClick={() => setCurrentPage(i)}
                                className="h-1.5 rounded-full transition-all duration-300"
                                style={{
                                    width: i === currentPage ? '1.5rem' : '0.5rem',
                                    background: i === currentPage ? colors.accent : colors.border,
                                    boxShadow: i === currentPage ? `0 0 10px ${colors.accent}50` : 'none',
                                }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={goToNext}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg"
                        style={{
                            background: `${colors.accent}15`,
                            color: colors.accent,
                            border: `1px solid ${colors.accent}30`,
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}