// src/app/(app)/calculo-da-entrega/page.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import {
    ArrowLeft,
    Home,
    MapPin,
    Truck,
    TrendingUp,
    Search,
    Navigation,
    X,
    Loader2,
    RefreshCw,
    Map,
    Target,
    Store,
    ChevronDown,
    ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'

// ===== GRADIENTE FIXO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
}

const pillButtonFullStyle = {
    ...pillButtonStyle,
    width: '100%',
    padding: '0.75rem 1.25rem',
    fontSize: '0.875rem',
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

// ===== FUNÇÃO DE DISTÂNCIA HAVERSINE =====
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ===== GEOCODIFICAÇÃO =====
async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; address: string } | null> {
    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (!token) return null
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=BR`
        )
        const data = await res.json()
        if (data?.features?.length > 0) {
            const [lng, lat] = data.features[0].center
            return {
                lat,
                lng,
                address: data.features[0].place_name || query
            }
        }
        return null
    } catch {
        return null
    }
}

interface StoreDeliveryConfig {
    delivery_type: string | null
    delivery_fee: number | null
    delivery_fee_per_km: number | null
    delivery_base_distance: number | null
    delivery_base_fee: number | null
    store_lat: number | null
    store_lng: number | null
    name: string
}

export default function CalculoDaEntregaPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { bgMode, customBgUrl } = useProfile()

    const [mounted, setMounted] = useState(false)
    const [loading, setLoading] = useState(true)
    const [calculating, setCalculating] = useState(false)
    const [isExpanded, setIsExpanded] = useState(true)

    // ===== LOCALIZAÇÕES =====
    const [originAddress, setOriginAddress] = useState('')
    const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [destinationAddress, setDestinationAddress] = useState('')
    const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null)

    // ===== RESULTADO =====
    const [distance, setDistance] = useState<number | null>(null)
    const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
    const [storeConfig, setStoreConfig] = useState<StoreDeliveryConfig | null>(null)
    const [storeId, setStoreId] = useState<string>('')

    // ===== MAPA =====
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<any>(null)
    const originMarkerRef = useRef<any>(null)
    const destinationMarkerRef = useRef<any>(null)
    const polylineRef = useRef<any>(null)
    const isMovingRef = useRef(false)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const initializedRef = useRef(false)

    const [mapReady, setMapReady] = useState(false)
    const [resolvingAddress, setResolvingAddress] = useState(false)

    // ===== SUGESTÕES =====
    const [originSuggestions, setOriginSuggestions] = useState<any[]>([])
    const [destinationSuggestions, setDestinationSuggestions] = useState<any[]>([])

    // ===== CARREGAR LOJAS DO USUÁRIO =====
    const loadStores = useCallback(async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                toast.error('Faça login para acessar esta página')
                router.push('/login')
                return
            }

            const { data: stores, error } = await supabase
                .from('stores')
                .select('id, name, delivery_type, delivery_fee, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, store_lat, store_lng')
                .eq('owner_id', user.id)
                .eq('is_active', true)

            if (error) {
                toast.error('Erro ao carregar lojas')
                setLoading(false)
                return
            }

            if (!stores || stores.length === 0) {
                toast.info('Você não tem lojas cadastradas')
                setLoading(false)
                return
            }

            const firstStore = stores[0]
            setStoreId(firstStore.id)
            setStoreConfig({
                delivery_type: firstStore.delivery_type,
                delivery_fee: firstStore.delivery_fee,
                delivery_fee_per_km: firstStore.delivery_fee_per_km,
                delivery_base_distance: firstStore.delivery_base_distance,
                delivery_base_fee: firstStore.delivery_base_fee,
                store_lat: firstStore.store_lat,
                store_lng: firstStore.store_lng,
                name: firstStore.name,
            })

            if (firstStore.store_lat && firstStore.store_lng) {
                setOriginCoords({
                    lat: firstStore.store_lat,
                    lng: firstStore.store_lng,
                })
                try {
                    const result = await geocodeAddress(`${firstStore.store_lat},${firstStore.store_lng}`)
                    if (result) {
                        setOriginAddress(result.address)
                    } else {
                        setOriginAddress(`Loja: ${firstStore.name}`)
                    }
                } catch {
                    setOriginAddress(`Loja: ${firstStore.name}`)
                }
            }

        } catch (err) {
            console.error('Erro ao carregar lojas:', err)
            toast.error('Erro ao carregar lojas')
        } finally {
            setLoading(false)
        }
    }, [router])

    useEffect(() => {
        setMounted(true)
        loadStores()
    }, [loadStores])

    // ===== INICIALIZAR MAPA =====
    const initializeMap = useCallback(async () => {
        if (initializedRef.current || !mapContainerRef.current || !originCoords) return

        initializedRef.current = true

        try {
            const L = (await import('leaflet')).default
            await import('leaflet/dist/leaflet.css')

            delete (L.Icon.Default.prototype as any)._getIconUrl
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: '',
                iconUrl: '',
                shadowUrl: '',
            })

            const map = L.map(mapContainerRef.current!, {
                center: [originCoords.lat, originCoords.lng],
                zoom: 14,
                zoomControl: true,
                attributionControl: false,
            })

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
            }).addTo(map)

            // Ícone laranja (origem)
            const orangeIcon = L.divIcon({
                className: '',
                html: `<div style="width: 36px; height: 36px; position: relative;">
                    <svg width="36" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <path d="M12 0C5.383 0 0 5.383 0 12c0 9 12 24 12 24s12-15 12-24C24 5.383 18.617 0 12 0z" fill="#F97316" stroke="white" stroke-width="2.5"/>
                        <circle cx="12" cy="12" r="5" fill="white"/>
                    </svg>
                </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 36],
            })

            // Ícone azul (destino)
            const blueIcon = L.divIcon({
                className: '',
                html: `<div style="width: 36px; height: 36px; position: relative;">
                    <svg width="36" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <path d="M12 0C5.383 0 0 5.383 0 12c0 9 12 24 12 24s12-15 12-24C24 5.383 18.617 0 12 0z" fill="#3B82F6" stroke="white" stroke-width="2.5"/>
                        <circle cx="12" cy="12" r="5" fill="white"/>
                    </svg>
                </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 36],
            })

            // Marcador origem (fixo)
            if (originCoords) {
                const marker = L.marker([originCoords.lat, originCoords.lng], {
                    icon: orangeIcon,
                    zIndexOffset: 1000,
                }).addTo(map)
                marker.bindPopup('Origem (Loja)')
                originMarkerRef.current = marker
            }

            // Marcador destino (arrastável)
            const destinationMarker = L.marker([originCoords.lat, originCoords.lng], {
                icon: blueIcon,
                draggable: true,
                zIndexOffset: 900,
            }).addTo(map)
            destinationMarker.bindPopup('Destino')

            destinationMarker.on('dragend', () => {
                const pos = destinationMarker.getLatLng()
                const newPos = { lat: pos.lat, lng: pos.lng }
                setDestinationCoords(newPos)
                updatePolyline(map, originCoords, newPos)

                setResolvingAddress(true)
                geocodeAddress(`${newPos.lat},${newPos.lng}`).then(result => {
                    if (result) {
                        setDestinationAddress(result.address)
                    } else {
                        setDestinationAddress(`Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`)
                    }
                    setResolvingAddress(false)
                }).catch(() => {
                    setDestinationAddress(`Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`)
                    setResolvingAddress(false)
                })
            })

            destinationMarkerRef.current = destinationMarker

            mapInstanceRef.current = map

            // Atualizar polylina inicial
            setTimeout(() => updateMapMarkers(), 300)
            setMapReady(true)

        } catch (error) {
            console.error('Erro ao inicializar mapa:', error)
            initializedRef.current = false
        }
    }, [originCoords])

    useEffect(() => {
        if (originCoords) {
            initializeMap()
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
            initializedRef.current = false
            setMapReady(false)
        }
    }, [originCoords, initializeMap])

    const updatePolyline = useCallback((map: any, origin: { lat: number; lng: number } | null, destination: { lat: number; lng: number } | null) => {
        const L = (window as any).L
        if (!L || !map) return

        if (polylineRef.current) {
            map.removeLayer(polylineRef.current)
            polylineRef.current = null
        }

        if (origin && destination) {
            polylineRef.current = L.polyline(
                [[origin.lat, origin.lng], [destination.lat, destination.lng]],
                {
                    color: '#f97316',
                    weight: 3,
                    dashArray: '8, 8',
                    opacity: 0.8,
                }
            ).addTo(map)
        }
    }, [])

    const updateMapMarkers = useCallback(() => {
        if (!mapInstanceRef.current) return

        if (originCoords && destinationCoords) {
            updatePolyline(mapInstanceRef.current, originCoords, destinationCoords)
        }
    }, [originCoords, destinationCoords, updatePolyline])

    useEffect(() => {
        if (mapReady) {
            updateMapMarkers()
        }
    }, [originCoords, destinationCoords, mapReady, updateMapMarkers])

    // ===== BUSCAR ENDEREÇO =====
    const searchAddress = useCallback(async (query: string, type: 'origin' | 'destination') => {
        if (!query.trim() || query.length < 3) {
            if (type === 'origin') setOriginSuggestions([])
            else setDestinationSuggestions([])
            return
        }

        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            if (!token) return

            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=5&country=BR&autocomplete=true`
            )
            const data = await res.json()

            if (type === 'origin') {
                setOriginSuggestions(data.features || [])
            } else {
                setDestinationSuggestions(data.features || [])
            }
        } catch (e) {
            console.error('Erro ao buscar sugestões:', e)
        }
    }, [])

    // ===== SELECIONAR SUGESTÃO =====
    const selectSuggestion = useCallback((feature: any, type: 'origin' | 'destination') => {
        const [lng, lat] = feature.center
        const address = feature.place_name

        if (type === 'origin') {
            setOriginAddress(address)
            setOriginCoords({ lat, lng })
            setOriginSuggestions([])
        } else {
            setDestinationAddress(address)
            setDestinationCoords({ lat, lng })
            setDestinationSuggestions([])

            if (mapInstanceRef.current && destinationMarkerRef.current) {
                destinationMarkerRef.current.setLatLng([lat, lng])
                updatePolyline(mapInstanceRef.current, originCoords, { lat, lng })
            }
        }
    }, [originCoords, updatePolyline])

    // ===== CALCULAR ENTREGA =====
    const calculateDelivery = useCallback(async () => {
        if (!originCoords || !destinationCoords || !storeConfig) {
            toast.error('Preencha origem e destino')
            return
        }

        setCalculating(true)

        try {
            const dist = getDistanceKm(
                originCoords.lat,
                originCoords.lng,
                destinationCoords.lat,
                destinationCoords.lng
            )
            setDistance(dist)

            let fee = 0
            const dtype = storeConfig.delivery_type

            if (dtype === 'free') {
                fee = 0
            } else if (dtype === 'fixed') {
                fee = Number(storeConfig.delivery_fee) || 0
            } else if (dtype === 'distance') {
                const feePerKm = Number(storeConfig.delivery_fee_per_km) || 0
                const baseDist = Number(storeConfig.delivery_base_distance) || 0
                const baseFee = Number(storeConfig.delivery_base_fee) || 0

                if (baseDist > 0 && baseFee > 0) {
                    if (dist <= baseDist) {
                        fee = baseFee
                    } else {
                        const extraKm = dist - baseDist
                        fee = baseFee + (extraKm * feePerKm)
                    }
                } else {
                    fee = dist * feePerKm
                }
            }

            setDeliveryFee(fee)
            updateMapMarkers()
            toast.success('Cálculo realizado com sucesso!')
        } catch (err) {
            console.error('Erro ao calcular:', err)
            toast.error('Erro ao calcular a entrega')
        } finally {
            setCalculating(false)
        }
    }, [originCoords, destinationCoords, storeConfig, updateMapMarkers])

    // ===== LIMPAR CAMPOS =====
    const clearDestination = () => {
        setDestinationAddress('')
        setDestinationCoords(null)
        setDistance(null)
        setDeliveryFee(null)

        if (mapInstanceRef.current && destinationMarkerRef.current && originCoords) {
            destinationMarkerRef.current.setLatLng([originCoords.lat, originCoords.lng])
            updatePolyline(mapInstanceRef.current, originCoords, null)
        }
    }

    const surfaceRgb = hexToRgb(colors.surface)
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary

    if (!mounted || loading) {
        return (
            <div className="relative min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <div className="fixed inset-0 z-0">
                    <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
                </div>
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.accent }} />
                    <p className="text-sm" style={{ color: textSecondary }}>Carregando...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="relative min-h-dvh pb-28" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh" style={{ overscrollBehavior: 'none' }}>
                <Header
                    title="Cálculo de Entrega"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting="Calcule o frete da sua loja"
                    avatarUrl={null}
                    loading={false}
                />

                <div className="px-4 pt-4 pb-24 max-w-2xl mx-auto">
                    <div
                        className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: `1px solid ${colors.border}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        {/* Cabeçalho com toggle */}
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="w-full flex items-center justify-between text-left"
                            style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: '9999px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                    }}
                                >
                                    <Truck size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                        Calcular Entrega
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: textSecondary }}>
                                        <span>{storeConfig?.name || 'Loja'}</span>
                                        {storeConfig?.delivery_type && (
                                            <>
                                                <span>•</span>
                                                <span className="text-orange-500">
                                                    {storeConfig.delivery_type === 'free' && 'Grátis'}
                                                    {storeConfig.delivery_type === 'fixed' && 'Fixo'}
                                                    {storeConfig.delivery_type === 'distance' && 'Por distância'}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isExpanded ? (
                                    <ChevronUp size={22} style={{ color: textSecondary }} />
                                ) : (
                                    <ChevronDown size={22} style={{ color: textSecondary }} />
                                )}
                            </div>
                        </button>

                        {isExpanded && (
                            <>
                                {/* Informações da loja */}
                                {storeConfig && (
                                    <div
                                        className="rounded-2xl p-4"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            border: `1px solid ${colors.border}`,
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ background: GRADIENT, color: '#ffffff' }}
                                            >
                                                <Store size={20} />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textSecondary }}>Loja selecionada</p>
                                                <p className="text-sm font-black" style={{ color: textPrimary }}>{storeConfig.name}</p>
                                            </div>
                                        </div>
                                        {storeConfig.delivery_type && (
                                            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                                                <span className="px-3 py-1 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                                    {storeConfig.delivery_type === 'free' && 'Entrega grátis'}
                                                    {storeConfig.delivery_type === 'fixed' && `R$ ${Number(storeConfig.delivery_fee).toFixed(2)} fixo`}
                                                    {storeConfig.delivery_type === 'distance' && `Até ${storeConfig.delivery_base_distance || 0}km: R$ ${Number(storeConfig.delivery_base_fee || 0).toFixed(2)}`}
                                                </span>
                                                {storeConfig.delivery_type === 'distance' && storeConfig.delivery_fee_per_km && (
                                                    <span className="px-3 py-1 rounded-full" style={{ background: '#3b82f620', color: '#3b82f6' }}>
                                                        +R$ {Number(storeConfig.delivery_fee_per_km).toFixed(2)}/km
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Inputs */}
                                <div className="space-y-4">
                                    {/* Origem */}
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>
                                            <div className="flex items-center gap-2">
                                                <MapPin size={14} style={{ color: '#f97316' }} />
                                                Origem (Loja)
                                            </div>
                                        </label>
                                        <div className="flex-1 relative">
                                            <div
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-full border"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                }}
                                            >
                                                <MapPin size={16} style={{ color: '#f97316' }} />
                                                <input
                                                    type="text"
                                                    value={originAddress}
                                                    onChange={(e) => {
                                                        setOriginAddress(e.target.value)
                                                        searchAddress(e.target.value, 'origin')
                                                    }}
                                                    placeholder="Endereço da loja"
                                                    className="flex-1 bg-transparent outline-none text-sm"
                                                    style={{ color: textPrimary }}
                                                    readOnly={!!originCoords}
                                                />
                                            </div>
                                            {originSuggestions.length > 0 && (
                                                <div
                                                    className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-lg z-20"
                                                    style={{
                                                        background: colors.surface,
                                                        border: `1px solid ${colors.border}`,
                                                    }}
                                                >
                                                    {originSuggestions.map((feature, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => selectSuggestion(feature, 'origin')}
                                                            className="w-full text-left px-4 py-2 text-xs hover:bg-black/5 transition-colors"
                                                            style={{ color: textPrimary }}
                                                        >
                                                            {feature.place_name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {originCoords && (
                                            <p className="text-[9px] mt-1" style={{ color: textSecondary }}>
                                                Lat: {originCoords.lat.toFixed(5)}, Lng: {originCoords.lng.toFixed(5)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Destino */}
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>
                                            <div className="flex items-center gap-2">
                                                <Target size={14} style={{ color: '#3b82f6' }} />
                                                Destino
                                            </div>
                                        </label>
                                        <div className="flex-1 relative">
                                            <div
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-full border"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                }}
                                            >
                                                <MapPin size={16} style={{ color: '#3b82f6' }} />
                                                <input
                                                    type="text"
                                                    value={destinationAddress}
                                                    onChange={(e) => {
                                                        setDestinationAddress(e.target.value)
                                                        searchAddress(e.target.value, 'destination')
                                                    }}
                                                    placeholder="Endereço de entrega"
                                                    className="flex-1 bg-transparent outline-none text-sm"
                                                    style={{ color: textPrimary }}
                                                />
                                                {destinationAddress && (
                                                    <button
                                                        onClick={clearDestination}
                                                        className="p-0.5 rounded-full hover:bg-black/5"
                                                    >
                                                        <X size={14} style={{ color: textSecondary }} />
                                                    </button>
                                                )}
                                            </div>
                                            {destinationSuggestions.length > 0 && (
                                                <div
                                                    className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-lg z-20"
                                                    style={{
                                                        background: colors.surface,
                                                        border: `1px solid ${colors.border}`,
                                                    }}
                                                >
                                                    {destinationSuggestions.map((feature, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => selectSuggestion(feature, 'destination')}
                                                            className="w-full text-left px-4 py-2 text-xs hover:bg-black/5 transition-colors"
                                                            style={{ color: textPrimary }}
                                                        >
                                                            {feature.place_name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {destinationCoords && (
                                            <p className="text-[9px] mt-1" style={{ color: textSecondary }}>
                                                Lat: {destinationCoords.lat.toFixed(5)}, Lng: {destinationCoords.lng.toFixed(5)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Mapa */}
                                <div>
                                    <div
                                        className="w-full h-64 rounded-xl overflow-hidden border"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <div ref={mapContainerRef} className="w-full h-full" />
                                        {!mapReady && (
                                            <div className="w-full h-full flex items-center justify-center" style={{ background: colors.surface }}>
                                                <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.accent }} />
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[9px] mt-2 text-center" style={{ color: textSecondary }}>
                                        🟠 Arraste o marcador azul para definir o destino
                                    </p>
                                </div>

                                {/* Botão Calcular */}
                                <button
                                    onClick={calculateDelivery}
                                    disabled={!originCoords || !destinationCoords || calculating}
                                    style={{
                                        ...pillButtonFullStyle,
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 12px #f9731640`,
                                        opacity: !originCoords || !destinationCoords || calculating ? 0.5 : 1,
                                    }}
                                    className="hover:scale-[1.02] transition-transform disabled:cursor-not-allowed"
                                >
                                    {calculating ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        'Calcular Entrega'
                                    )}
                                </button>

                                {/* Resultado */}
                                {distance !== null && deliveryFee !== null && (
                                    <div
                                        className="rounded-2xl p-4 space-y-3"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            border: `1px solid ${colors.border}`,
                                        }}
                                    >
                                        <h4 className="text-xs font-black uppercase tracking-wider" style={{ color: textSecondary }}>
                                            Resultado do Cálculo
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div
                                                className="text-center p-3 rounded-xl"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                            >
                                                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textSecondary }}>Distância</p>
                                                <p className="text-2xl font-black" style={{ color: '#f97316' }}>
                                                    {distance.toFixed(2)} km
                                                </p>
                                            </div>
                                            <div
                                                className="text-center p-3 rounded-xl"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                            >
                                                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textSecondary }}>Frete</p>
                                                <p className="text-2xl font-black" style={{ color: '#10b981' }}>
                                                    R$ {deliveryFee.toFixed(2)}
                                                </p>
                                            </div>
                                        </div>

                                        {storeConfig?.delivery_type === 'distance' && (
                                            <div
                                                className="p-3 rounded-xl text-[10px]"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                            >
                                                <p style={{ color: textSecondary }}>
                                                    Base: {storeConfig.delivery_base_distance || 0}km = R$ {Number(storeConfig.delivery_base_fee || 0).toFixed(2)}
                                                    {distance > Number(storeConfig.delivery_base_distance || 0) && (
                                                        <span>
                                                            {' '}• Extra: {(distance - Number(storeConfig.delivery_base_distance || 0)).toFixed(2)}km × R$ {Number(storeConfig.delivery_fee_per_km || 0).toFixed(2)}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        )}

                                        {storeConfig?.delivery_type === 'fixed' && (
                                            <div
                                                className="p-3 rounded-xl text-[10px]"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                            >
                                                <p style={{ color: textSecondary }}>
                                                    Taxa fixa: R$ {Number(storeConfig.delivery_fee || 0).toFixed(2)}
                                                </p>
                                            </div>
                                        )}

                                        {storeConfig?.delivery_type === 'free' && (
                                            <div
                                                className="p-3 rounded-xl text-[10px]"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                            >
                                                <p style={{ color: textSecondary }}>Entrega gratuita!</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Dica */}
                                <div
                                    className="p-3 rounded-xl text-xs"
                                    style={{
                                        background: '#f9731610',
                                        border: `1px solid #f9731630`,
                                    }}
                                >
                                    <p style={{ color: textSecondary }}>
                                        💡 Digite o endereço de destino ou arraste o marcador azul no mapa.
                                        {!destinationCoords && ' O marcador azul pode ser arrastado para qualquer local no mapa.'}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}