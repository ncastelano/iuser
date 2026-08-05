// src/app/(app)/calculo-de-corrida/page.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
    ArrowLeft,
    MapPin,
    Navigation,
    X,
    Loader2,
    Target,
    ChevronDown,
    ChevronUp,
    DollarSign,
    Route,
    Calculator,
    Bike,
    Car,
    Truck,
    Footprints,
    Gauge,
    Timer,
} from 'lucide-react'
import { toast } from 'sonner'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

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

// ===== FUNÇÃO DE DISTÂNCIA =====
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

// ===== REVERSE GEOCODIFICAÇÃO =====
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (!token) return null
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1&country=BR`
        )
        const data = await res.json()
        if (data?.features?.length > 0) {
            return data.features[0].place_name
        }
        return null
    } catch {
        return null
    }
}

// ===== BUSCAR ROTA NO MAPBOX =====
async function getRoute(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<{
    distance: number;
    duration: number;
    geometry: any;
} | null> {
    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (!token) return null

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?geometries=geojson&access_token=${token}`

        const res = await fetch(url)
        const data = await res.json()

        if (data?.routes?.length > 0) {
            const route = data.routes[0]
            return {
                distance: route.distance / 1000,
                duration: route.duration / 60,
                geometry: route.geometry,
            }
        }
        return null
    } catch (error) {
        console.error('Erro ao buscar rota:', error)
        return null
    }
}

type VehicleType = 'bike' | 'car' | 'truck' | 'walk' | 'motorcycle'

interface VehicleConfig {
    icon: any
    label: string
    baseFee: number
    perKm: number
    perMinute: number
    baseDistance: number
    description: string
}

const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
    bike: {
        icon: Bike,
        label: 'Bicicleta',
        baseFee: 5,
        perKm: 1.5,
        perMinute: 0.3,
        baseDistance: 3,
        description: 'Ideal para entregas rápidas e curtas distâncias',
    },
    motorcycle: {
        icon: Bike,
        label: 'Moto',
        baseFee: 7,
        perKm: 2.0,
        perMinute: 0.5,
        baseDistance: 5,
        description: 'Agilidade no trânsito para entregas urbanas',
    },
    car: {
        icon: Car,
        label: 'Carro',
        baseFee: 10,
        perKm: 2.5,
        perMinute: 0.7,
        baseDistance: 5,
        description: 'Conforto e segurança para passageiros',
    },
    truck: {
        icon: Truck,
        label: 'Caminhão',
        baseFee: 15,
        perKm: 4.0,
        perMinute: 1.0,
        baseDistance: 5,
        description: 'Para cargas pesadas e grandes volumes',
    },
    walk: {
        icon: Footprints,
        label: 'A pé',
        baseFee: 3,
        perKm: 1.0,
        perMinute: 0.2,
        baseDistance: 2,
        description: 'Para entregas de curta distância a pé',
    },
}

export default function CalculoDeCorridaPage() {
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

    // ===== VEÍCULO =====
    const [vehicleType, setVehicleType] = useState<VehicleType>('car')
    const [customBaseFee, setCustomBaseFee] = useState<number>(10)
    const [customPerKm, setCustomPerKm] = useState<number>(2.5)
    const [customPerMinute, setCustomPerMinute] = useState<number>(0.7)
    const [customBaseDistance, setCustomBaseDistance] = useState<number>(5)
    const [useCustomValues, setUseCustomValues] = useState(false)

    // ===== RESULTADO =====
    const [distance, setDistance] = useState<number | null>(null)
    const [duration, setDuration] = useState<number | null>(null)
    const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null)
    const [priceBreakdown, setPriceBreakdown] = useState<{ label: string; value: number }[]>([])
    const [routeGeometry, setRouteGeometry] = useState<any>(null)

    // ===== MAPA =====
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
    const originMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const initializedRef = useRef(false)

    const [mapReady, setMapReady] = useState(false)

    // ===== SUGESTÕES =====
    const [originSuggestions, setOriginSuggestions] = useState<any[]>([])
    const [destinationSuggestions, setDestinationSuggestions] = useState<any[]>([])
    const [originSelectedIndex, setOriginSelectedIndex] = useState(-1)
    const [destinationSelectedIndex, setDestinationSelectedIndex] = useState(-1)

    // Refs para os inputs
    const originInputRef = useRef<HTMLInputElement>(null)
    const destinationInputRef = useRef<HTMLInputElement>(null)
    const originSuggestionsRef = useRef<HTMLDivElement>(null)
    const destinationSuggestionsRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setMounted(true)
        setLoading(false)

        try {
            const saved = localStorage.getItem('corrida_calc_config')
            if (saved) {
                const config = JSON.parse(saved)
                setVehicleType(config.vehicleType || 'car')
                setCustomBaseFee(config.customBaseFee || 10)
                setCustomPerKm(config.customPerKm || 2.5)
                setCustomPerMinute(config.customPerMinute || 0.7)
                setCustomBaseDistance(config.customBaseDistance || 5)
                setUseCustomValues(config.useCustomValues || false)
            }
        } catch (e) {
            console.error('Erro ao carregar configurações:', e)
        }
    }, [])

    // ===== CLICK FORA PARA FECHAR SUGESTÕES =====
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (originSuggestionsRef.current && !originSuggestionsRef.current.contains(event.target as Node) &&
                originInputRef.current && !originInputRef.current.contains(event.target as Node)) {
                setOriginSuggestions([])
                setOriginSelectedIndex(-1)
            }
            if (destinationSuggestionsRef.current && !destinationSuggestionsRef.current.contains(event.target as Node) &&
                destinationInputRef.current && !destinationInputRef.current.contains(event.target as Node)) {
                setDestinationSuggestions([])
                setDestinationSelectedIndex(-1)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const saveConfig = useCallback(() => {
        try {
            localStorage.setItem('corrida_calc_config', JSON.stringify({
                vehicleType,
                customBaseFee,
                customPerKm,
                customPerMinute,
                customBaseDistance,
                useCustomValues,
            }))
            toast.success('Configurações salvas!')
        } catch (e) {
            console.error('Erro ao salvar configurações:', e)
        }
    }, [vehicleType, customBaseFee, customPerKm, customPerMinute, customBaseDistance, useCustomValues])

    // ===== INICIALIZAR MAPA =====
    const initializeMap = useCallback(() => {
        if (initializedRef.current || !mapContainerRef.current) return

        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (token) {
            mapboxgl.accessToken = token
        }

        const center = originCoords || { lat: -15.7801, lng: -47.9292 }

        const map = new mapboxgl.Map({
            container: mapContainerRef.current!,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [center.lng, center.lat],
            zoom: 13,
            attributionControl: false,
        })

        map.addControl(new mapboxgl.NavigationControl(), 'top-right')

        mapInstanceRef.current = map
        initializedRef.current = true

        map.on('load', () => {
            setMapReady(true)
            updateMapMarkers()
        })

    }, [originCoords])

    useEffect(() => {
        if (!mapContainerRef.current || initializedRef.current) return
        const timer = setTimeout(initializeMap, 300)
        return () => clearTimeout(timer)
    }, [initializeMap])

    useEffect(() => {
        if (mapReady) {
            updateMapMarkers()
        }
    }, [originCoords, destinationCoords, routeGeometry, mapReady])

    const updateMapMarkers = useCallback(() => {
        const map = mapInstanceRef.current
        if (!map) return

        if (originMarkerRef.current) {
            originMarkerRef.current.remove()
            originMarkerRef.current = null
        }
        if (destinationMarkerRef.current) {
            destinationMarkerRef.current.remove()
            destinationMarkerRef.current = null
        }

        if (map.getLayer('route-line')) {
            map.removeLayer('route-line')
        }
        if (map.getSource('route')) {
            map.removeSource('route')
        }

        if (originCoords) {
            const el = document.createElement('div')
            el.style.width = '36px'
            el.style.height = '36px'
            el.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0C5.383 0 0 5.383 0 12c0 9 12 24 12 24s12-15 12-24C24 5.383 18.617 0 12 0z" fill="#F97316" stroke="white" stroke-width="2.5"/>
                <circle cx="12" cy="12" r="5" fill="white"/>
            </svg>`

            originMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([originCoords.lng, originCoords.lat])
                .setPopup(new mapboxgl.Popup({ offset: 25 }).setText('Origem'))
                .addTo(map)
        }

        if (destinationCoords) {
            const el = document.createElement('div')
            el.style.width = '36px'
            el.style.height = '36px'
            el.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0C5.383 0 0 5.383 0 12c0 9 12 24 12 24s12-15 12-24C24 5.383 18.617 0 12 0z" fill="#3B82F6" stroke="white" stroke-width="2.5"/>
                <circle cx="12" cy="12" r="5" fill="white"/>
            </svg>`

            destinationMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([destinationCoords.lng, destinationCoords.lat])
                .setPopup(new mapboxgl.Popup({ offset: 25 }).setText('Destino'))
                .addTo(map)
        }

        if (originCoords && destinationCoords && routeGeometry) {
            map.addSource('route', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: routeGeometry,
                    properties: {},
                },
            })

            map.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round',
                },
                paint: {
                    'line-color': '#f97316',
                    'line-width': 4,
                    'line-dasharray': [2, 2],
                },
            })

            const bounds = new mapboxgl.LngLatBounds()
            bounds.extend([originCoords.lng, originCoords.lat])
            bounds.extend([destinationCoords.lng, destinationCoords.lat])
            map.fitBounds(bounds, { padding: 60, maxZoom: 15 })
        } else if (originCoords) {
            map.flyTo({ center: [originCoords.lng, originCoords.lat], zoom: 13 })
        }
    }, [originCoords, destinationCoords, routeGeometry])

    // ===== CALCULAR CORRIDA =====
    const calculateRoute = useCallback(async () => {
        if (!originCoords || !destinationCoords) {
            toast.error('Selecione origem e destino')
            return
        }

        setCalculating(true)

        try {
            const result = await getRoute(originCoords, destinationCoords)

            if (result) {
                const dist = result.distance
                const dur = result.duration
                setDistance(dist)
                setDuration(dur)
                setRouteGeometry(result.geometry)

                // Calcular preço
                const config = useCustomValues
                    ? { baseFee: customBaseFee, perKm: customPerKm, perMinute: customPerMinute, baseDistance: customBaseDistance }
                    : VEHICLE_CONFIGS[vehicleType]

                let price = config.baseFee
                const breakdown: { label: string; value: number }[] = [
                    { label: 'Taxa base', value: config.baseFee },
                ]

                // Distância
                let distanceCharge = 0
                if (dist > config.baseDistance) {
                    const extraKm = dist - config.baseDistance
                    distanceCharge = extraKm * config.perKm
                    price += distanceCharge
                    breakdown.push({
                        label: `${extraKm.toFixed(1)}km extra × R$ ${config.perKm.toFixed(2)}`,
                        value: distanceCharge
                    })
                } else {
                    breakdown.push({
                        label: 'Distância incluída na base',
                        value: 0
                    })
                }

                // Tempo
                const timeCharge = dur * config.perMinute
                price += timeCharge
                breakdown.push({
                    label: `${Math.round(dur)}min × R$ ${config.perMinute.toFixed(2)}`,
                    value: timeCharge
                })

                setEstimatedPrice(price)
                setPriceBreakdown(breakdown)

                toast.success('Rota calculada com sucesso!')
            } else {
                const dist = getDistanceKm(
                    originCoords.lat,
                    originCoords.lng,
                    destinationCoords.lat,
                    destinationCoords.lng
                )
                setDistance(dist)
                setDuration(null)
                setRouteGeometry(null)

                const config = useCustomValues
                    ? { baseFee: customBaseFee, perKm: customPerKm, perMinute: customPerMinute, baseDistance: customBaseDistance }
                    : VEHICLE_CONFIGS[vehicleType]

                let price = config.baseFee
                const breakdown: { label: string; value: number }[] = [
                    { label: 'Taxa base', value: config.baseFee },
                ]

                if (dist > config.baseDistance) {
                    const extraKm = dist - config.baseDistance
                    const distanceCharge = extraKm * config.perKm
                    price += distanceCharge
                    breakdown.push({
                        label: `${extraKm.toFixed(1)}km extra × R$ ${config.perKm.toFixed(2)}`,
                        value: distanceCharge
                    })
                }

                setEstimatedPrice(price)
                setPriceBreakdown(breakdown)

                toast.warning('Rota não encontrada, usando distância em linha reta')
            }

            updateMapMarkers()
        } catch (error) {
            console.error('Erro ao calcular rota:', error)
            toast.error('Erro ao calcular rota')
        } finally {
            setCalculating(false)
        }
    }, [originCoords, destinationCoords, vehicleType, customBaseFee, customPerKm, customPerMinute, customBaseDistance, useCustomValues, updateMapMarkers])

    // ===== BUSCAR ENDEREÇO =====
    const searchAddress = useCallback(async (query: string, type: 'origin' | 'destination') => {
        if (!query.trim() || query.length < 3) {
            if (type === 'origin') {
                setOriginSuggestions([])
                setOriginSelectedIndex(-1)
            } else {
                setDestinationSuggestions([])
                setDestinationSelectedIndex(-1)
            }
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
                setOriginSelectedIndex(-1)
            } else {
                setDestinationSuggestions(data.features || [])
                setDestinationSelectedIndex(-1)
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
            setOriginSelectedIndex(-1)
            originInputRef.current?.blur()
        } else {
            setDestinationAddress(address)
            setDestinationCoords({ lat, lng })
            setDestinationSuggestions([])
            setDestinationSelectedIndex(-1)
            setDistance(null)
            setEstimatedPrice(null)
            setRouteGeometry(null)
            setDuration(null)
            setPriceBreakdown([])
            destinationInputRef.current?.blur()
        }
    }, [])

    // ===== NAVEGAÇÃO POR TECLADO =====
    const handleKeyDown = (e: React.KeyboardEvent, type: 'origin' | 'destination') => {
        const suggestions = type === 'origin' ? originSuggestions : destinationSuggestions
        const selectedIndex = type === 'origin' ? originSelectedIndex : destinationSelectedIndex

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (suggestions.length > 0) {
                const newIndex = (selectedIndex + 1) % suggestions.length
                if (type === 'origin') {
                    setOriginSelectedIndex(newIndex)
                } else {
                    setDestinationSelectedIndex(newIndex)
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (suggestions.length > 0) {
                const newIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1
                if (type === 'origin') {
                    setOriginSelectedIndex(newIndex)
                } else {
                    setDestinationSelectedIndex(newIndex)
                }
            }
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                selectSuggestion(suggestions[selectedIndex], type)
            }
        } else if (e.key === 'Escape') {
            if (type === 'origin') {
                setOriginSuggestions([])
                setOriginSelectedIndex(-1)
                originInputRef.current?.blur()
            } else {
                setDestinationSuggestions([])
                setDestinationSelectedIndex(-1)
                destinationInputRef.current?.blur()
            }
        }
    }

    // ===== USAR GPS =====
    const useCurrentLocation = useCallback(async (type: 'origin' | 'destination') => {
        if (!navigator.geolocation) {
            toast.error('Geolocalização não suportada')
            return
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const coords = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                }

                let address = ''
                try {
                    const result = await reverseGeocode(coords.lat, coords.lng)
                    if (result) {
                        address = result
                    } else {
                        address = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                    }
                } catch {
                    address = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                }

                if (type === 'origin') {
                    setOriginAddress(address)
                    setOriginCoords(coords)
                    setOriginSuggestions([])
                    setOriginSelectedIndex(-1)
                } else {
                    setDestinationAddress(address)
                    setDestinationCoords(coords)
                    setDestinationSuggestions([])
                    setDestinationSelectedIndex(-1)
                    setDistance(null)
                    setEstimatedPrice(null)
                    setRouteGeometry(null)
                    setDuration(null)
                    setPriceBreakdown([])
                }
                toast.success('Localização obtida!')
            },
            () => toast.error('Erro ao obter localização'),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }, [])

    // ===== LIMPAR =====
    const clearDestination = () => {
        setDestinationAddress('')
        setDestinationCoords(null)
        setDistance(null)
        setEstimatedPrice(null)
        setRouteGeometry(null)
        setDuration(null)
        setPriceBreakdown([])
        setDestinationSuggestions([])
        setDestinationSelectedIndex(-1)
        destinationInputRef.current?.focus()
    }

    const surfaceRgb = hexToRgb(colors.surface)
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const currentConfig = useCustomValues
        ? { baseFee: customBaseFee, perKm: customPerKm, perMinute: customPerMinute, baseDistance: customBaseDistance }
        : VEHICLE_CONFIGS[vehicleType]

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
                    title="Calculadora de Corrida"
                    showBack={true}
                    onBack={() => router.push('/')}
                    greeting="Calcule distância, tempo e preço"
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
                                    <Route size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                        Calculadora de Corrida
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: textSecondary }}>
                                        <span>Distância × Tempo × Valor</span>
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
                                {/* Configurações do Veículo */}
                                <div
                                    className="rounded-2xl p-4"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <Gauge size={16} style={{ color: '#f97316' }} />
                                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textSecondary }}>
                                            Tipo de Veículo
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                        {Object.entries(VEHICLE_CONFIGS).map(([key, config]) => {
                                            const Icon = config.icon
                                            const isSelected = vehicleType === key && !useCustomValues
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => {
                                                        setVehicleType(key as VehicleType)
                                                        setUseCustomValues(false)
                                                        const cfg = VEHICLE_CONFIGS[key as VehicleType]
                                                        setCustomBaseFee(cfg.baseFee)
                                                        setCustomPerKm(cfg.perKm)
                                                        setCustomPerMinute(cfg.perMinute)
                                                        setCustomBaseDistance(cfg.baseDistance)
                                                    }}
                                                    className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${isSelected ? 'ring-2' : ''}`}
                                                    style={{
                                                        background: isSelected ? '#f9731620' : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        border: `1px solid ${isSelected ? '#f97316' : colors.border}`,
                                                        color: isSelected ? '#f97316' : textSecondary,
                                                    }}
                                                >
                                                    <Icon size={20} />
                                                    <span className="text-[8px] font-bold mt-1">{config.label}</span>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    <div className="flex items-center gap-2 mb-3">
                                        <input
                                            type="checkbox"
                                            id="customValues"
                                            checked={useCustomValues}
                                            onChange={() => setUseCustomValues(!useCustomValues)}
                                            className="rounded"
                                            style={{ accentColor: '#f97316' }}
                                        />
                                        <label htmlFor="customValues" className="text-xs font-bold" style={{ color: textSecondary }}>
                                            Usar valores personalizados
                                        </label>
                                    </div>

                                    {useCustomValues && (
                                        <div className="grid grid-cols-4 gap-2">
                                            <div>
                                                <label className="text-[8px] font-bold block mb-1" style={{ color: textSecondary }}>
                                                    Taxa base (R$)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={customBaseFee}
                                                    onChange={(e) => setCustomBaseFee(Number(e.target.value) || 0)}
                                                    className="w-full p-1.5 rounded-full border text-xs text-center"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        borderColor: colors.border,
                                                        color: textPrimary,
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-bold block mb-1" style={{ color: textSecondary }}>
                                                    R$/km
                                                </label>
                                                <input
                                                    type="number"
                                                    value={customPerKm}
                                                    onChange={(e) => setCustomPerKm(Number(e.target.value) || 0)}
                                                    className="w-full p-1.5 rounded-full border text-xs text-center"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        borderColor: colors.border,
                                                        color: textPrimary,
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-bold block mb-1" style={{ color: textSecondary }}>
                                                    R$/min
                                                </label>
                                                <input
                                                    type="number"
                                                    value={customPerMinute}
                                                    onChange={(e) => setCustomPerMinute(Number(e.target.value) || 0)}
                                                    className="w-full p-1.5 rounded-full border text-xs text-center"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        borderColor: colors.border,
                                                        color: textPrimary,
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-bold block mb-1" style={{ color: textSecondary }}>
                                                    Km base
                                                </label>
                                                <input
                                                    type="number"
                                                    value={customBaseDistance}
                                                    onChange={(e) => setCustomBaseDistance(Number(e.target.value) || 0)}
                                                    className="w-full p-1.5 rounded-full border text-xs text-center"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        borderColor: colors.border,
                                                        color: textPrimary,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={saveConfig}
                                        className="mt-2 px-4 py-1.5 rounded-full text-[10px] font-bold"
                                        style={{ background: '#f9731620', color: '#f97316' }}
                                    >
                                        Salvar configurações
                                    </button>
                                </div>

                                {/* Inputs */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>
                                            <div className="flex items-center gap-2">
                                                <MapPin size={14} style={{ color: '#f97316' }} />
                                                Origem
                                            </div>
                                        </label>
                                        <div className="flex gap-2">
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
                                                        ref={originInputRef}
                                                        type="text"
                                                        value={originAddress}
                                                        onChange={(e) => {
                                                            setOriginAddress(e.target.value)
                                                            searchAddress(e.target.value, 'origin')
                                                        }}
                                                        onKeyDown={(e) => handleKeyDown(e, 'origin')}
                                                        placeholder="Endereço de origem"
                                                        className="flex-1 bg-transparent outline-none text-sm"
                                                        style={{ color: textPrimary }}
                                                    />
                                                    {originAddress && (
                                                        <button
                                                            onClick={() => {
                                                                setOriginAddress('')
                                                                setOriginCoords(null)
                                                                setOriginSuggestions([])
                                                                setOriginSelectedIndex(-1)
                                                                originInputRef.current?.focus()
                                                            }}
                                                            className="p-0.5 rounded-full hover:bg-black/5"
                                                        >
                                                            <X size={14} style={{ color: textSecondary }} />
                                                        </button>
                                                    )}
                                                </div>
                                                {originSuggestions.length > 0 && (
                                                    <div
                                                        ref={originSuggestionsRef}
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
                                                                className={`w-full text-left px-4 py-2 text-xs hover:bg-black/5 transition-colors ${i === originSelectedIndex ? 'bg-black/10' : ''}`}
                                                                style={{ color: textPrimary }}
                                                            >
                                                                {feature.place_name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => useCurrentLocation('origin')}
                                                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 border"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                    color: textSecondary,
                                                }}
                                                title="Usar localização atual"
                                            >
                                                <Navigation size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>
                                            <div className="flex items-center gap-2">
                                                <Target size={14} style={{ color: '#3b82f6' }} />
                                                Destino
                                            </div>
                                        </label>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative">
                                                <div
                                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full border"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        borderColor: colors.border,
                                                    }}
                                                >
                                                    <Target size={16} style={{ color: '#3b82f6' }} />
                                                    <input
                                                        ref={destinationInputRef}
                                                        type="text"
                                                        value={destinationAddress}
                                                        onChange={(e) => {
                                                            setDestinationAddress(e.target.value)
                                                            searchAddress(e.target.value, 'destination')
                                                        }}
                                                        onKeyDown={(e) => handleKeyDown(e, 'destination')}
                                                        placeholder="Endereço de destino"
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
                                                        ref={destinationSuggestionsRef}
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
                                                                className={`w-full text-left px-4 py-2 text-xs hover:bg-black/5 transition-colors ${i === destinationSelectedIndex ? 'bg-black/10' : ''}`}
                                                                style={{ color: textPrimary }}
                                                            >
                                                                {feature.place_name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => useCurrentLocation('destination')}
                                                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 border"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                    color: textSecondary,
                                                }}
                                                title="Usar localização atual"
                                            >
                                                <Navigation size={18} />
                                            </button>
                                        </div>
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
                                        🟠 Origem • 🔵 Destino
                                    </p>
                                </div>

                                {/* Botão Calcular */}
                                <button
                                    onClick={calculateRoute}
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
                                        <>
                                            <Calculator size={18} />
                                            Calcular Rota e Preço
                                        </>
                                    )}
                                </button>

                                {/* Resultado */}
                                {distance !== null && estimatedPrice !== null && (
                                    <div
                                        className="rounded-2xl p-4 space-y-3"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            border: `1px solid ${colors.border}`,
                                        }}
                                    >
                                        <h4 className="text-xs font-black uppercase tracking-wider" style={{ color: textSecondary }}>
                                            Resultado da Corrida
                                        </h4>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div
                                                className="text-center p-3 rounded-xl"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                            >
                                                <div className="flex items-center justify-center gap-1 text-[8px] font-bold uppercase" style={{ color: textSecondary }}>
                                                    <Route size={12} />
                                                    Distância
                                                </div>
                                                <p className="text-xl font-black" style={{ color: '#f97316' }}>
                                                    {distance.toFixed(2)} km
                                                </p>
                                            </div>
                                            {duration !== null && (
                                                <div
                                                    className="text-center p-3 rounded-xl"
                                                    style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                                >
                                                    <div className="flex items-center justify-center gap-1 text-[8px] font-bold uppercase" style={{ color: textSecondary }}>
                                                        <Timer size={12} />
                                                        Tempo
                                                    </div>
                                                    <p className="text-xl font-black" style={{ color: '#8b5cf6' }}>
                                                        {Math.round(duration)} min
                                                    </p>
                                                </div>
                                            )}
                                            <div
                                                className="text-center p-3 rounded-xl"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                            >
                                                <div className="flex items-center justify-center gap-1 text-[8px] font-bold uppercase" style={{ color: textSecondary }}>
                                                    <DollarSign size={12} />
                                                    Preço
                                                </div>
                                                <p className="text-xl font-black" style={{ color: '#10b981' }}>
                                                    R$ {estimatedPrice.toFixed(2)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Detalhamento do preço */}
                                        {priceBreakdown.length > 0 && (
                                            <div
                                                className="p-3 rounded-xl text-[10px] space-y-1"
                                                style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)` }}
                                            >
                                                {priceBreakdown.map((item, index) => (
                                                    <div key={index} className="flex justify-between" style={{ color: textSecondary }}>
                                                        <span>{item.label}</span>
                                                        <span className="font-bold" style={{ color: item.value > 0 ? '#f97316' : textSecondary }}>
                                                            {item.value > 0 ? `R$ ${item.value.toFixed(2)}` : 'Incluído'}
                                                        </span>
                                                    </div>
                                                ))}
                                                <div className="flex justify-between pt-1 border-t" style={{ borderColor: colors.border }}>
                                                    <span className="font-bold" style={{ color: textPrimary }}>Total</span>
                                                    <span className="font-bold" style={{ color: '#10b981' }}>R$ {estimatedPrice.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Informações do veículo */}
                                        <div
                                            className="p-2 rounded-xl text-[9px] text-center"
                                            style={{ background: '#f9731610' }}
                                        >
                                            <p style={{ color: textSecondary }}>
                                                {useCustomValues
                                                    ? 'Valores personalizados'
                                                    : VEHICLE_CONFIGS[vehicleType].description}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div
                                    className="p-3 rounded-xl text-xs"
                                    style={{
                                        background: '#f9731610',
                                        border: `1px solid #f9731630`,
                                    }}
                                >
                                    <p style={{ color: textSecondary }}>
                                        💡 Digite os endereços ou clique no ícone de GPS. Use as setas ↑↓ para navegar nos resultados.
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