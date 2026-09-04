// src/app/(app)/calculo-de-corrida/page.tsx
'use client'

import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/app/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import {
    ArrowLeft,
    MapPin,
    Navigation,
    X,
    Target,
    ChevronDown,
    ChevronUp,
    DollarSign,
    Route,
    Calculator,
    Bike,
    Car,
    Truck,
    Gauge,
    Timer,
    History,
    Trash2,
    Plus,
    Move,
    Sparkles,
    Info,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import type { Map as LeafletMap, Marker } from 'leaflet'

// ===== GRADIENTE FIXO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== PALETA DE CORES PARA ROTAS/PARADAS =====
const ROUTE_COLORS = [
    '#10B981',
    '#3B82F6',
    '#8B5CF6',
    '#F59E0B',
    '#EC4899',
    '#06B6D4',
    '#E11D48',
]

// ===== COORDENADAS PADRÃO =====
const DEFAULT_COORDS = { lat: -8.7608, lng: -63.8995 }

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
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

// ===== FUNÇÃO DE DISTÂNCIA (Haversine) =====
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ===== OBTENÇÃO DE ROTA REAL PELAS RUAS (OSRM) =====
async function getRouteByRoads(
    coordinates: Array<{ lat: number; lng: number }>
): Promise<{ route: Array<{ lat: number; lng: number }>; distance: number; duration: number } | null> {
    if (coordinates.length < 2) return null

    try {
        const coordStr = coordinates
            .map((c) => `${c.lng},${c.lat}`)
            .join(';')

        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`

        const response = await fetch(url)
        const data = await response.json()

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0]
            const geometry = route.geometry
            const coordinates = geometry.coordinates.map((coord: [number, number]) => ({
                lat: coord[1],
                lng: coord[0],
            }))

            return {
                route: coordinates,
                distance: route.distance / 1000,
                duration: route.duration / 60,
            }
        }
        return null
    } catch (error) {
        console.error('Erro ao buscar rota:', error)
        return null
    }
}

// ===== FUNÇÃO PARA OTIMIZAR ORDEM DAS PARADAS (Vizinho Mais Próximo) =====
function optimizeStopsOrder(
    origin: { lat: number; lng: number },
    stops: Array<{ id: string; lat: number; lng: number }>
): Array<{ id: string; lat: number; lng: number }> {
    if (stops.length <= 1) return stops

    const unvisited = [...stops]
    const optimized: Array<{ id: string; lat: number; lng: number }> = []
    let current = origin

    while (unvisited.length > 0) {
        let closestIndex = 0
        let closestDistance = Infinity

        for (let i = 0; i < unvisited.length; i++) {
            const dist = getDistanceKm(
                current.lat,
                current.lng,
                unvisited[i].lat,
                unvisited[i].lng
            )
            if (dist < closestDistance) {
                closestDistance = dist
                closestIndex = i
            }
        }

        const nextStop = unvisited.splice(closestIndex, 1)[0]
        optimized.push(nextStop)
        current = nextStop
    }

    return optimized
}

// ===== REVERSE GEOCODIFICAÇÃO COM FALLBACK =====
async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (token) {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1&country=BR`
            )
            const data = await res.json()
            if (data?.features?.length > 0) {
                return data.features[0].place_name
            }
        }

        const resNom = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
        )
        const dataNom = await resNom.json()
        if (dataNom?.display_name) {
            return dataNom.display_name
        }
        return `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`
    } catch {
        return `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`
    }
}

// ===== BUSCA DE ENDEREÇOS COM FALLBACK =====
async function searchAddressGeocode(query: string): Promise<Array<{ place_name: string; center: [number, number] }>> {
    if (!query.trim() || query.length < 3) return []
    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (token) {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=5&country=BR&autocomplete=true`
            )
            const data = await res.json()
            if (data?.features?.length > 0) {
                return data.features.map((f: any) => ({
                    place_name: f.place_name,
                    center: f.center,
                }))
            }
        }

        const resNom = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
            { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
        )
        const dataNom = await resNom.json()
        if (Array.isArray(dataNom)) {
            return dataNom.map((item: any) => ({
                place_name: item.display_name,
                center: [parseFloat(item.lon), parseFloat(item.lat)],
            }))
        }
        return []
    } catch {
        return []
    }
}

type VehicleType = 'bike' | 'car' | 'truck' | 'motorcycle'

interface VehicleConfig {
    icon: any
    label: string
    avgSpeed: number
    baseFee: number
    perKm: number
    baseDistance: number
    description: string
}

interface SavedDestination {
    id: string
    address: string
    lat: number
    lng: number
    createdAt: number
}

interface DestinationStop {
    id: string
    address: string
    coords: { lat: number; lng: number } | null
}

interface RouteLeg {
    from: string
    to: string
    distance: number
    color: string
    originalFromIndex?: number
    originalToIndex?: number
}

const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
    bike: {
        icon: Bike,
        label: 'Bicicleta',
        avgSpeed: 18,
        baseFee: 5,
        perKm: 1.5,
        baseDistance: 3,
        description: 'Ideal para entregas rápidas e curtas distâncias',
    },
    motorcycle: {
        icon: Bike,
        label: 'Moto',
        avgSpeed: 50,
        baseFee: 7,
        perKm: 2.0,
        baseDistance: 5,
        description: 'Agilidade no trânsito para entregas urbanas',
    },
    car: {
        icon: Car,
        label: 'Carro',
        avgSpeed: 40,
        baseFee: 10,
        perKm: 2.5,
        baseDistance: 5,
        description: 'Conforto e segurança para passageiros',
    },
    truck: {
        icon: Truck,
        label: 'Caminhão',
        avgSpeed: 35,
        baseFee: 15,
        perKm: 4.0,
        baseDistance: 5,
        description: 'Para cargas pesadas e grandes volumes',
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

    // ===== LOCALIZAÇÃO DE ORIGEM (INICIA COM COORDENADAS PADRÃO) =====
    const [originAddress, setOriginAddress] = useState('')
    const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number }>(DEFAULT_COORDS)

    // ===== DESTINOS / MULTI-PARADAS =====
    const [destinations, setDestinations] = useState<DestinationStop[]>([
        { id: 'dest-1', address: '', coords: null },
    ])
    const [activeStopIndex, setActiveStopIndex] = useState<number>(0)

    // ===== DESTINOS SALVOS =====
    const [savedDestinations, setSavedDestinations] = useState<SavedDestination[]>([])
    const [activeSavedDropdown, setActiveSavedDropdown] = useState<string | null>(null)

    // ===== VEÍCULO =====
    const [vehicleType, setVehicleType] = useState<VehicleType>('car')
    const [customBaseFee, setCustomBaseFee] = useState<number>(10)
    const [customPerKm, setCustomPerKm] = useState<number>(2.5)
    const [customBaseDistance, setCustomBaseDistance] = useState<number>(5)
    const [useCustomValues, setUseCustomValues] = useState(false)

    // ===== RESULTADOS DAS ROTAS =====
    const [totalDistance, setTotalDistance] = useState<number | null>(null)
    const [totalDuration, setTotalDuration] = useState<number | null>(null)
    const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null)
    const [legBreakdowns, setLegBreakdowns] = useState<RouteLeg[]>([])
    const [priceBreakdown, setPriceBreakdown] = useState<{ label: string; value: number }[]>([])
    const [optimizedOrder, setOptimizedOrder] = useState<number[]>([])

    // ===== MAPA (LEAFLET) =====
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<LeafletMap | null>(null)
    const originMarkerRef = useRef<Marker | null>(null)
    const destinationMarkersRef = useRef<Map<string, Marker>>(new Map())
    const polylinesRef = useRef<any[]>([])
    const initializedRef = useRef(false)

    const [mapReady, setMapReady] = useState(false)
    const [isMapLoading, setIsMapLoading] = useState(true)
    const [reverseGeocodingState, setReverseGeocodingState] = useState<string | null>(null)

    // ===== SUGESTÕES DE ENDEREÇO =====
    const [originSuggestions, setOriginSuggestions] = useState<any[]>([])
    const [destinationSuggestions, setDestinationSuggestions] = useState<Record<string, any[]>>({})
    const [originSelectedIndex, setOriginSelectedIndex] = useState(-1)
    const [destinationSelectedIndexes, setDestinationSelectedIndexes] = useState<Record<string, number>>({})

    // Refs para inputs
    const originInputRef = useRef<HTMLInputElement>(null)
    const destinationInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

    // ===== CARREGAR DESTINOS SALVOS E CONFIGS =====
    useEffect(() => {
        setMounted(true)
        setLoading(false)

        try {
            const saved = localStorage.getItem('corrida_saved_destinations')
            if (saved) {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    setSavedDestinations(parsed)
                }
            }
        } catch (e) {
            console.error('Erro ao carregar destinos salvos:', e)
        }

        try {
            const savedConfig = localStorage.getItem('corrida_calc_config')
            if (savedConfig) {
                const config = JSON.parse(savedConfig)
                setVehicleType(config.vehicleType || 'car')
                setCustomBaseFee(config.customBaseFee || 10)
                setCustomPerKm(config.customPerKm || 2.5)
                setCustomBaseDistance(config.customBaseDistance || 5)
                setUseCustomValues(config.useCustomValues || false)
            }
        } catch (e) {
            console.error('Erro ao carregar configurações:', e)
        }
    }, [])

    // ===== SALVAR DESTINO NO LOCAL STORAGE =====
    const saveDestinationToStorage = useCallback((address: string, lat: number, lng: number) => {
        if (!address.trim()) return

        const newDestination: SavedDestination = {
            id: Date.now().toString() + Math.random().toString().slice(2, 6),
            address: address.trim(),
            lat,
            lng,
            createdAt: Date.now(),
        }

        setSavedDestinations((prev) => {
            const filtered = prev.filter((d) => d.address.toLowerCase() !== address.toLowerCase())
            const updated = [newDestination, ...filtered].slice(0, 10)
            localStorage.setItem('corrida_saved_destinations', JSON.stringify(updated))
            return updated
        })
    }, [])

    // ===== REMOVER DESTINO SALVO =====
    const removeSavedDestination = useCallback((id: string) => {
        setSavedDestinations((prev) => {
            const updated = prev.filter((d) => d.id !== id)
            localStorage.setItem('corrida_saved_destinations', JSON.stringify(updated))
            return updated
        })
    }, [])

    // ===== LIMPAR TODOS DESTINOS SALVOS =====
    const clearSavedDestinations = useCallback(() => {
        setSavedDestinations([])
        localStorage.removeItem('corrida_saved_destinations')
        toast.success('Destinos salvos removidos')
    }, [])

    // ===== GERENCIAMENTO DAS PARADAS / DESTINOS =====
    const addDestinationStop = useCallback(() => {
        if (destinations.length >= 7) {
            toast.error('Limite máximo de 7 paradas atingido')
            return
        }
        const newId = `dest-${Date.now()}`
        setDestinations((prev) => [...prev, { id: newId, address: '', coords: null }])
        setActiveStopIndex(destinations.length)
        toast.success(`Parada ${destinations.length + 1} adicionada!`)
    }, [destinations.length])

    const removeDestinationStop = useCallback((id: string) => {
        setDestinations((prev) => {
            if (prev.length <= 1) {
                toast.error('É necessário ter ao menos um destino')
                return prev
            }
            return prev.filter((d) => d.id !== id)
        })
        setTotalDistance(null)
        setEstimatedPrice(null)
        setTotalDuration(null)
        setLegBreakdowns([])
        setPriceBreakdown([])
        setOptimizedOrder([])
    }, [])

    const updateDestinationStop = useCallback((id: string, address: string, coords: { lat: number; lng: number } | null) => {
        setDestinations((prev) =>
            prev.map((d) => (d.id === id ? { ...d, address, coords } : d))
        )
        setTotalDistance(null)
        setEstimatedPrice(null)
        setTotalDuration(null)
        setLegBreakdowns([])
        setPriceBreakdown([])
        setOptimizedOrder([])
    }, [])

    // ===== ICONES PERSONALIZADOS DO MAPA =====
    const createOriginIcon = useCallback((L: any) => {
        return L.divIcon({
            className: '',
            html: `<div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: grab;">
                <div style="background: linear-gradient(135deg, #f97316, #ea580c); width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(249,115,22,0.5); display: flex; align-items: center; justify-content: center;">
                    <span style="transform: rotate(45deg); color: white; font-weight: 900; font-size: 13px; font-family: system-ui, sans-serif;">A</span>
                </div>
            </div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 40],
        })
    }, [])

    const createStopIcon = useCallback((L: any, index: number, color: string) => {
        return L.divIcon({
            className: '',
            html: `<div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: grab;">
                <div style="background: ${color}; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid #ffffff; box-shadow: 0 4px 12px ${color}88; display: flex; align-items: center; justify-content: center;">
                    <span style="transform: rotate(45deg); color: white; font-weight: 900; font-size: 13px; font-family: system-ui, sans-serif;">${index + 1}</span>
                </div>
            </div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 40],
        })
    }, [])

    // ===== ATUALIZAR MARCADORES E ROTAS NO MAPA (COM ROTEAMENTO REAL) =====
    const updateMapMarkersAndRoutes = useCallback(async () => {
        const map = mapInstanceRef.current
        if (!map) return

        const L = (window as any).L
        if (!L) return

        polylinesRef.current.forEach((pl) => map.removeLayer(pl))
        polylinesRef.current = []

        const currentOriginCoords = originCoords || DEFAULT_COORDS

        if (!originMarkerRef.current) {
            const marker = L.marker([currentOriginCoords.lat, currentOriginCoords.lng], {
                icon: createOriginIcon(L),
                draggable: true,
                zIndexOffset: 1000,
            }).addTo(map)

            marker.bindPopup('<b>Origem (Ponto A)</b><br/>Arraste para alterar o local de partida')

            marker.on('dragend', async () => {
                const pos = marker.getLatLng()
                const newCoords = { lat: pos.lat, lng: pos.lng }
                setOriginCoords(newCoords)
                setReverseGeocodingState('Origem')
                const newAddr = await reverseGeocode(newCoords.lat, newCoords.lng)
                setOriginAddress(newAddr)
                setReverseGeocodingState(null)
                toast.success('Origem atualizada!')
            })

            originMarkerRef.current = marker
        } else {
            originMarkerRef.current.setLatLng([currentOriginCoords.lat, currentOriginCoords.lng])
        }

        const activeDestMap = destinationMarkersRef.current
        const currentDestIds = new Set(destinations.map((d) => d.id))

        activeDestMap.forEach((marker, id) => {
            if (!currentDestIds.has(id)) {
                map.removeLayer(marker)
                activeDestMap.delete(id)
            }
        })

        destinations.forEach((dest, index) => {
            const color = ROUTE_COLORS[index % ROUTE_COLORS.length]
            const stopIcon = createStopIcon(L, index, color)

            if (dest.coords) {
                if (activeDestMap.has(dest.id)) {
                    const marker = activeDestMap.get(dest.id)!
                    marker.setLatLng([dest.coords.lat, dest.coords.lng])
                    marker.setIcon(stopIcon)
                } else {
                    const marker = L.marker([dest.coords.lat, dest.coords.lng], {
                        icon: stopIcon,
                        draggable: true,
                        zIndexOffset: 900 - index,
                    }).addTo(map)

                    marker.bindPopup(`<b>Parada ${index + 1}</b><br/>Arraste para ajustar a localização`)

                    marker.on('dragend', async () => {
                        const pos = marker.getLatLng()
                        const newCoords = { lat: pos.lat, lng: pos.lng }
                        setReverseGeocodingState(`Parada ${index + 1}`)
                        const newAddr = await reverseGeocode(newCoords.lat, newCoords.lng)
                        updateDestinationStop(dest.id, newAddr, newCoords)
                        setReverseGeocodingState(null)
                        toast.success(`Parada ${index + 1} atualizada!`)
                    })

                    activeDestMap.set(dest.id, marker)
                }
            } else if (activeDestMap.has(dest.id)) {
                map.removeLayer(activeDestMap.get(dest.id)!)
                activeDestMap.delete(dest.id)
            }
        })

        const validStops = destinations
            .map((d, idx) => ({ ...d, originalIndex: idx }))
            .filter((d) => d.coords !== null)

        if (validStops.length > 0 && originCoords) {
            const stopPoints = validStops.map((s) => ({
                id: s.id,
                lat: s.coords!.lat,
                lng: s.coords!.lng,
            }))

            const optimizedStops = optimizeStopsOrder(originCoords, stopPoints)

            const allPointsInOrder = [
                { lat: originCoords.lat, lng: originCoords.lng, isOrigin: true },
                ...optimizedStops.map((s) => ({ lat: s.lat, lng: s.lng, id: s.id, isOrigin: false })),
            ]

            for (let i = 0; i < allPointsInOrder.length - 1; i++) {
                const p1 = allPointsInOrder[i]
                const p2 = allPointsInOrder[i + 1]

                const routeData = await getRouteByRoads([
                    { lat: p1.lat, lng: p1.lng },
                    { lat: p2.lat, lng: p2.lng },
                ])

                const color = ROUTE_COLORS[i % ROUTE_COLORS.length]

                if (routeData && routeData.route.length > 0) {
                    const routePoints = routeData.route.map((p) => [p.lat, p.lng])
                    const polyline = L.polyline(routePoints, {
                        color,
                        weight: 5,
                        opacity: 0.85,
                    }).addTo(map)
                    polylinesRef.current.push(polyline)
                } else {
                    const polyline = L.polyline(
                        [
                            [p1.lat, p1.lng],
                            [p2.lat, p2.lng],
                        ],
                        {
                            color,
                            weight: 4,
                            opacity: 0.6,
                            dashArray: '5, 10',
                        }
                    ).addTo(map)
                    polylinesRef.current.push(polyline)
                }
            }

            const allCoords = allPointsInOrder.map((p) => [p.lat, p.lng])
            const bounds = L.latLngBounds(allCoords)
            map.fitBounds(bounds, { padding: [50, 50] })
        } else if (originCoords) {
            map.setView([originCoords.lat, originCoords.lng], 13)
        }
    }, [originCoords, destinations, createOriginIcon, createStopIcon, updateDestinationStop])

    // ===== INICIALIZAR MAPA (LEAFLET) =====
    useEffect(() => {
        if (!mapContainerRef.current || initializedRef.current) return

        const initMap = async () => {
            try {
                const L = (await import('leaflet')).default
                await import('leaflet/dist/leaflet.css')

                delete (L.Icon.Default.prototype as any)._getIconUrl
                L.Icon.Default.mergeOptions({
                    iconRetinaUrl: '',
                    iconUrl: '',
                    shadowUrl: '',
                })

                const initialCenter: [number, number] = [DEFAULT_COORDS.lat, DEFAULT_COORDS.lng]

                const map = L.map(mapContainerRef.current!, {
                    center: initialCenter,
                    zoom: 13,
                    zoomControl: true,
                    attributionControl: false,
                })

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                }).addTo(map)

                mapInstanceRef.current = map
                initializedRef.current = true
                setIsMapLoading(false)
                setMapReady(true)

                setTimeout(() => {
                    if (mapInstanceRef.current) {
                        mapInstanceRef.current.invalidateSize()
                    }
                }, 300)
            } catch (error) {
                console.error('Erro ao inicializar mapa:', error)
                setIsMapLoading(false)
                setMapReady(true)
            }
        }

        const timer = setTimeout(initMap, 200)
        return () => {
            clearTimeout(timer)
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
            initializedRef.current = false
        }
    }, [])

    useEffect(() => {
        if (mapReady) {
            updateMapMarkersAndRoutes()
        }
    }, [mapReady, originCoords, destinations, updateMapMarkersAndRoutes])

    // ===== FECHAR DROPDOWNS AO CLICAR FORA =====
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                originInputRef.current &&
                !originInputRef.current.contains(event.target as Node)
            ) {
                setOriginSuggestions([])
                setOriginSelectedIndex(-1)
            }

            if (activeSavedDropdown) {
                const savedRef = document.getElementById(`saved-dropdown-${activeSavedDropdown}`)
                if (savedRef && !savedRef.contains(event.target as Node)) {
                    setActiveSavedDropdown(null)
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [activeSavedDropdown])

    // ===== SALVAR CONFIGURAÇÃO DO VEÍCULO =====
    const saveConfig = useCallback(() => {
        try {
            localStorage.setItem(
                'corrida_calc_config',
                JSON.stringify({
                    vehicleType,
                    customBaseFee,
                    customPerKm,
                    customBaseDistance,
                    useCustomValues,
                })
            )
            toast.success('Configurações salvas!')
        } catch (e) {
            console.error('Erro ao salvar configurações:', e)
        }
    }, [vehicleType, customBaseFee, customPerKm, customBaseDistance, useCustomValues])

    // ===== CALCULAR CORRIDA COMPLETA COM MULTI-PARADAS E OTIMIZAÇÃO =====
    const calculateRoute = useCallback(async () => {
        if (!originCoords) {
            toast.error('Defina o endereço de origem')
            return
        }

        const validDestinations = destinations.filter((d) => d.coords !== null)
        if (validDestinations.length === 0) {
            toast.error('Adicione ao menos um destino válido')
            return
        }

        setCalculating(true)

        try {
            const stopPoints = validDestinations.map((d) => ({
                id: d.id,
                lat: d.coords!.lat,
                lng: d.coords!.lng,
                address: d.address,
            }))

            const optimizedStops = optimizeStopsOrder(originCoords, stopPoints)

            const allPointsInOrder: Array<{ name: string; lat: number; lng: number; id?: string }> = [
                { name: 'Origem', lat: originCoords.lat, lng: originCoords.lng },
                ...optimizedStops.map((s) => ({
                    name: destinations.find((d) => d.id === s.id)?.address || 'Parada',
                    lat: s.lat,
                    lng: s.lng,
                    id: s.id,
                })),
            ]

            const orderIndices = optimizedStops.map((s) => {
                const idx = validDestinations.findIndex((d) => d.id === s.id)
                return idx
            })
            setOptimizedOrder(orderIndices)

            let sumDistance = 0
            let sumDuration = 0
            const legs: RouteLeg[] = []

            for (let i = 0; i < allPointsInOrder.length - 1; i++) {
                const p1 = allPointsInOrder[i]
                const p2 = allPointsInOrder[i + 1]

                const routeData = await getRouteByRoads([
                    { lat: p1.lat, lng: p1.lng },
                    { lat: p2.lat, lng: p2.lng },
                ])

                const distance = routeData ? routeData.distance : getDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng)
                const duration = routeData ? routeData.duration : (distance / 40) * 60

                sumDistance += distance
                sumDuration += duration

                let fromName = p1.name
                let toName = p2.name
                let originalFromIdx = -1
                let originalToIdx = -1

                if (i === 0) {
                    fromName = 'Origem'
                } else if (p1.id) {
                    const prevStop = validDestinations.findIndex((d) => d.id === p1.id)
                    originalFromIdx = prevStop
                    if (prevStop !== -1) {
                        fromName = validDestinations[prevStop].address || `Parada ${prevStop + 1}`
                    }
                }

                if (p2.id) {
                    const nextStop = validDestinations.findIndex((d) => d.id === p2.id)
                    originalToIdx = nextStop
                    if (nextStop !== -1) {
                        toName = validDestinations[nextStop].address || `Parada ${nextStop + 1}`
                    }
                }

                legs.push({
                    from: fromName.split(',')[0],
                    to: toName.split(',')[0],
                    distance,
                    color: ROUTE_COLORS[i % ROUTE_COLORS.length],
                    originalFromIndex: originalFromIdx !== -1 ? originalFromIdx : undefined,
                    originalToIndex: originalToIdx !== -1 ? originalToIdx : undefined,
                })
            }

            setTotalDistance(sumDistance)
            setLegBreakdowns(legs)
            setTotalDuration(sumDuration)

            const config = useCustomValues
                ? { avgSpeed: 40, baseFee: customBaseFee, perKm: customPerKm, baseDistance: customBaseDistance }
                : VEHICLE_CONFIGS[vehicleType]

            let price = config.baseFee
            const breakdown: { label: string; value: number }[] = [
                { label: 'Taxa base da corrida', value: config.baseFee },
            ]

            if (sumDistance > config.baseDistance) {
                const extraKm = sumDistance - config.baseDistance
                const distanceCharge = extraKm * config.perKm
                price += distanceCharge
                breakdown.push({
                    label: `${extraKm.toFixed(1)} km extra × R$ ${config.perKm.toFixed(2)}`,
                    value: distanceCharge,
                })
            } else {
                breakdown.push({
                    label: 'Distância totalmente inclusa na taxa base',
                    value: 0,
                })
            }

            if (validDestinations.length > 1) {
                const extraStopsFee = (validDestinations.length - 1) * 3.0
                price += extraStopsFee
                breakdown.push({
                    label: `${validDestinations.length - 1} parada(s) adicional(is) (R$ 3.00/cada)`,
                    value: extraStopsFee,
                })
            }

            setEstimatedPrice(price)
            setPriceBreakdown(breakdown)

            validDestinations.forEach((d) => {
                if (d.address && d.coords) {
                    saveDestinationToStorage(d.address, d.coords.lat, d.coords.lng)
                }
            })

            toast.success(`Rota otimizada com ${validDestinations.length} parada(s)!`)
        } catch (error) {
            console.error('Erro ao calcular rota:', error)
            toast.error('Erro ao calcular a rota')
        } finally {
            setCalculating(false)
        }
    }, [
        originCoords,
        destinations,
        useCustomValues,
        customBaseFee,
        customPerKm,
        customBaseDistance,
        vehicleType,
        saveDestinationToStorage,
    ])

    // ===== BUSCAR ENDEREÇO NAS SUGESTÕES =====
    const handleSearchAddress = useCallback(
        async (query: string, type: 'origin' | string) => {
            if (!query.trim() || query.length < 3) {
                if (type === 'origin') {
                    setOriginSuggestions([])
                } else {
                    setDestinationSuggestions((prev) => ({ ...prev, [type]: [] }))
                }
                return
            }

            const results = await searchAddressGeocode(query)
            if (type === 'origin') {
                setOriginSuggestions(results)
                setOriginSelectedIndex(-1)
            } else {
                setDestinationSuggestions((prev) => ({ ...prev, [type]: results }))
                setDestinationSelectedIndexes((prev) => ({ ...prev, [type]: -1 }))
            }
        },
        []
    )

    // ===== SELECIONAR SUGESTÃO =====
    const selectSuggestion = useCallback(
        (item: { place_name: string; center: [number, number] }, type: 'origin' | string) => {
            const [lng, lat] = item.center
            const address = item.place_name

            if (type === 'origin') {
                setOriginAddress(address)
                setOriginCoords({ lat, lng })
                setOriginSuggestions([])
                setOriginSelectedIndex(-1)
                originInputRef.current?.blur()
            } else {
                updateDestinationStop(type, address, { lat, lng })
                setDestinationSuggestions((prev) => ({ ...prev, [type]: [] }))
                setDestinationSelectedIndexes((prev) => ({ ...prev, [type]: -1 }))
                destinationInputRefs.current[type]?.blur()
            }
        },
        [updateDestinationStop]
    )

    // ===== NAVEGAÇÃO POR TECLADO =====
    const handleKeyDown = (e: React.KeyboardEvent, type: 'origin' | string) => {
        const suggestions = type === 'origin' ? originSuggestions : destinationSuggestions[type] || []
        const selectedIndex = type === 'origin' ? originSelectedIndex : destinationSelectedIndexes[type] ?? -1

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (suggestions.length > 0) {
                const newIndex = (selectedIndex + 1) % suggestions.length
                if (type === 'origin') {
                    setOriginSelectedIndex(newIndex)
                } else {
                    setDestinationSelectedIndexes((prev) => ({ ...prev, [type]: newIndex }))
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (suggestions.length > 0) {
                const newIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1
                if (type === 'origin') {
                    setOriginSelectedIndex(newIndex)
                } else {
                    setDestinationSelectedIndexes((prev) => ({ ...prev, [type]: newIndex }))
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
            } else {
                setDestinationSuggestions((prev) => ({ ...prev, [type]: [] }))
                setDestinationSelectedIndexes((prev) => ({ ...prev, [type]: -1 }))
            }
        }
    }

    // ===== USAR GPS ATUAL (ACIONADO MANUALMENTE) =====
    const useCurrentLocation = useCallback(
        async (type: 'origin' | string) => {
            if (!navigator.geolocation) {
                toast.error('Geolocalização não suportada no seu navegador')
                return
            }

            toast.info('Obtendo localização GPS...')
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                    const address = await reverseGeocode(coords.lat, coords.lng)

                    if (type === 'origin') {
                        setOriginAddress(address)
                        setOriginCoords(coords)
                        setOriginSuggestions([])
                    } else {
                        updateDestinationStop(type, address, coords)
                        setDestinationSuggestions((prev) => ({ ...prev, [type]: [] }))
                    }
                    toast.success('Localização atual obtida!')
                },
                () => toast.error('Erro ao obter localização do GPS'),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            )
        },
        [updateDestinationStop]
    )

    // ===== CARREGAR DESTINO SALVO NOS INPUTS =====
    const loadSavedDestination = useCallback(
        (dest: SavedDestination, stopId: string) => {
            updateDestinationStop(stopId, dest.address, { lat: dest.lat, lng: dest.lng })
            setActiveSavedDropdown(null)
            toast.success('Destino salvo selecionado!')
        },
        [updateDestinationStop]
    )

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
                    <Spinner size={32} color={colors.accent} />
                    <p className="text-sm" style={{ color: textSecondary }}>
                        Carregando calculadora...
                    </p>
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
                    greeting="Calcule distância, rotas e valores"
                    avatarUrl={null}
                    loading={false}
                />

                <div className="px-4 pt-4 pb-24 max-w-2xl mx-auto">
                    <div
                        className="mb-3 p-3 rounded-2xl flex items-center gap-3 text-xs font-semibold shadow-sm"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.7)`,
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: `1px solid #f9731644`,
                            color: textPrimary,
                        }}
                    >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#f9731620', color: '#f97316' }}>
                            <Move size={18} className="animate-pulse" />
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-[11px]" style={{ color: '#f97316' }}>
                                Rotas otimizadas automaticamente!
                            </p>
                            <p className="text-[10px] opacity-80" style={{ color: textSecondary }}>
                                As paradas são reorganizadas para a melhor rota possível, independente da ordem inserida.
                            </p>
                        </div>
                    </div>

                    {reverseGeocodingState && (
                        <div className="mb-2 p-2 px-3 rounded-xl flex items-center gap-2 text-xs bg-orange-500/10 text-orange-600 border border-orange-500/20 animate-pulse">
                            <Spinner size={14} />
                            <span>Atualizando endereço da <b>{reverseGeocodingState}</b>...</span>
                        </div>
                    )}

                    <div className="mb-4 relative">
                        <div
                            className="w-full h-72 rounded-2xl overflow-hidden border shadow-lg relative"
                            style={{
                                borderColor: colors.border,
                                background: colors.surface,
                            }}
                        >
                            <div ref={mapContainerRef} className="w-full h-full" />
                            {isMapLoading && (
                                <div className="absolute inset-0 flex items-center justify-center" style={{ background: colors.surface }}>
                                    <Spinner size={24} color={colors.accent} />
                                </div>
                            )}
                        </div>
                    </div>

                    <div
                        className="rounded-2xl p-5 pt-6 flex flex-col gap-5 relative shadow-xl"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.65)`,
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            border: `1px solid ${colors.border}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="w-full flex items-center justify-between text-left focus:outline-none"
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md"
                                    style={{ background: GRADIENT, color: '#ffffff' }}
                                >
                                    <Route size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black tracking-tight" style={{ color: textPrimary }}>
                                        Calculadora de Corrida
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: textSecondary }}>
                                        <span>Rotas otimizadas • Distância • Valores</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-1 rounded-full hover:bg-black/5 transition-colors">
                                {isExpanded ? (
                                    <ChevronUp size={22} style={{ color: textSecondary }} />
                                ) : (
                                    <ChevronDown size={22} style={{ color: textSecondary }} />
                                )}
                            </div>
                        </button>

                        {isExpanded && (
                            <>
                                <div
                                    className="rounded-2xl p-4"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.35)`,
                                        border: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <Gauge size={16} style={{ color: '#f97316' }} />
                                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textSecondary }}>
                                            Tipo de Veículo
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {Object.entries(VEHICLE_CONFIGS).map(([key, config]) => {
                                            const Icon = config.icon
                                            const isSelected = vehicleType === key
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => {
                                                        setVehicleType(key as VehicleType)
                                                        const cfg = VEHICLE_CONFIGS[key as VehicleType]
                                                        setCustomBaseFee(cfg.baseFee)
                                                        setCustomPerKm(cfg.perKm)
                                                        setCustomBaseDistance(cfg.baseDistance)
                                                    }}
                                                    className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${isSelected ? 'ring-2 ring-orange-500 scale-[1.02]' : 'hover:opacity-80'
                                                        }`}
                                                    style={{
                                                        background: isSelected
                                                            ? '#f9731620'
                                                            : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                        border: `1px solid ${isSelected ? '#f97316' : colors.border}`,
                                                        color: isSelected ? '#f97316' : textSecondary,
                                                    }}
                                                >
                                                    <Icon size={24} />
                                                    <span className="text-xs font-bold mt-1">{config.label}</span>
                                                    <span className="text-[8px] mt-0.5 opacity-60" style={{ color: textSecondary }}>
                                                        ~{config.avgSpeed} km/h
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    <div className="flex items-center gap-2 mt-3">
                                        <input
                                            type="checkbox"
                                            id="customValues"
                                            checked={useCustomValues}
                                            onChange={() => setUseCustomValues(!useCustomValues)}
                                            className="rounded cursor-pointer"
                                            style={{ accentColor: '#f97316' }}
                                        />
                                        <label htmlFor="customValues" className="text-xs font-bold cursor-pointer" style={{ color: textSecondary }}>
                                            Usar valores e tarifas personalizadas
                                        </label>
                                    </div>

                                    {useCustomValues && (
                                        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
                                            <div>
                                                <label className="text-[8px] font-bold block mb-1 uppercase" style={{ color: textSecondary }}>
                                                    Taxa base (R$)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={customBaseFee}
                                                    onChange={(e) => setCustomBaseFee(Number(e.target.value) || 0)}
                                                    className="w-full p-2 rounded-xl border text-xs text-center font-bold"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        borderColor: colors.border,
                                                        color: textPrimary,
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-bold block mb-1 uppercase" style={{ color: textSecondary }}>
                                                    R$/km extra
                                                </label>
                                                <input
                                                    type="number"
                                                    value={customPerKm}
                                                    onChange={(e) => setCustomPerKm(Number(e.target.value) || 0)}
                                                    className="w-full p-2 rounded-xl border text-xs text-center font-bold"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        borderColor: colors.border,
                                                        color: textPrimary,
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-bold block mb-1 uppercase" style={{ color: textSecondary }}>
                                                    Km inclusos
                                                </label>
                                                <input
                                                    type="number"
                                                    value={customBaseDistance}
                                                    onChange={(e) => setCustomBaseDistance(Number(e.target.value) || 0)}
                                                    className="w-full p-2 rounded-xl border text-xs text-center font-bold"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        borderColor: colors.border,
                                                        color: textPrimary,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-end mt-2">
                                        <button
                                            onClick={saveConfig}
                                            className="px-3 py-1.5 rounded-full text-[10px] font-bold hover:opacity-80 transition"
                                            style={{ background: '#f9731620', color: '#f97316' }}
                                        >
                                            Salvar preferências
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center">
                                                    <MapPin size={12} style={{ color: '#f97316' }} />
                                                </div>
                                                <span>Origem (Ponto A)</span>
                                            </div>
                                        </label>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative">
                                                <div
                                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full border transition-colors focus-within:border-orange-500"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.35)`,
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
                                                            handleSearchAddress(e.target.value, 'origin')
                                                        }}
                                                        onKeyDown={(e) => handleKeyDown(e, 'origin')}
                                                        placeholder="Ex: Rua das Flores, 123, Centro"
                                                        className="flex-1 bg-transparent outline-none text-sm font-medium"
                                                        style={{ color: textPrimary }}
                                                    />
                                                    {originAddress && (
                                                        <button
                                                            onClick={() => {
                                                                setOriginAddress('')
                                                                setOriginSuggestions([])
                                                                setOriginSelectedIndex(-1)
                                                                originInputRef.current?.focus()
                                                            }}
                                                            className="p-1.5 rounded-full hover:bg-black/10 transition-colors"
                                                            style={{ color: textSecondary }}
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    )}
                                                </div>

                                                {originSuggestions.length > 0 && (
                                                    <div
                                                        className="absolute top-full left-0 right-0 mt-1 rounded-2xl overflow-hidden shadow-2xl z-30 max-h-56 overflow-y-auto"
                                                        style={{
                                                            background: colors.surface,
                                                            border: `1px solid ${colors.border}`,
                                                        }}
                                                    >
                                                        {originSuggestions.map((item, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => selectSuggestion(item, 'origin')}
                                                                className={`w-full text-left px-4 py-2.5 text-xs hover:bg-orange-500/10 transition-colors flex items-center gap-2 border-b last:border-none ${i === originSelectedIndex ? 'bg-orange-500/20 font-bold' : ''
                                                                    }`}
                                                                style={{ color: textPrimary, borderColor: colors.border }}
                                                            >
                                                                <MapPin size={14} style={{ color: '#f97316' }} />
                                                                <span className="truncate">{item.place_name}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => useCurrentLocation('origin')}
                                                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 border hover:opacity-80 transition-all active:scale-95"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.35)`,
                                                    borderColor: colors.border,
                                                    color: textSecondary,
                                                }}
                                                title="Usar GPS Atual"
                                            >
                                                <Navigation size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                                                <Target size={14} style={{ color: '#3b82f6' }} />
                                                Destinos e Paradas ({destinations.length})
                                            </span>
                                            <button
                                                onClick={addDestinationStop}
                                                className="text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 hover:opacity-80 transition-all active:scale-95"
                                                style={{ background: '#3b82f620', color: '#3b82f6' }}
                                            >
                                                <Plus size={12} />
                                                Adicionar Parada
                                            </button>
                                        </div>

                                        {destinations.map((dest, index) => {
                                            const legColor = ROUTE_COLORS[index % ROUTE_COLORS.length]
                                            const suggestions = destinationSuggestions[dest.id] || []
                                            const selectedIndex = destinationSelectedIndexes[dest.id] ?? -1
                                            const isSavedOpen = activeSavedDropdown === dest.id
                                            const isOptimized = optimizedOrder.length > 0 && optimizedOrder.includes(index)

                                            return (
                                                <div key={dest.id} className="relative">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="text-[9px] font-bold uppercase flex items-center gap-1.5" style={{ color: legColor }}>
                                                            <div
                                                                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                                                                style={{ background: legColor }}
                                                            >
                                                                {index + 1}
                                                            </div>
                                                            <span>Parada {index + 1}</span>
                                                            {isOptimized && (
                                                                <span className="text-[8px] text-emerald-500 font-bold ml-1">
                                                                    ✓ otimizada
                                                                </span>
                                                            )}
                                                        </label>

                                                        {destinations.length > 1 && (
                                                            <button
                                                                onClick={() => removeDestinationStop(dest.id)}
                                                                className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90"
                                                                style={{
                                                                    background: 'rgba(239, 68, 68, 0.12)',
                                                                    color: '#ef4444',
                                                                }}
                                                                title="Remover parada"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <div className="flex-1 relative">
                                                            <div
                                                                className="flex items-center gap-2 px-4 py-2.5 rounded-full border transition-colors focus-within:border-blue-500"
                                                                style={{
                                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.35)`,
                                                                    borderColor: dest.coords ? legColor : colors.border,
                                                                }}
                                                            >
                                                                <Target size={16} style={{ color: legColor }} />
                                                                <input
                                                                    ref={(el) => {
                                                                        destinationInputRefs.current[dest.id] = el
                                                                    }}
                                                                    type="text"
                                                                    value={dest.address}
                                                                    onChange={(e) => {
                                                                        updateDestinationStop(dest.id, e.target.value, dest.coords)
                                                                        handleSearchAddress(e.target.value, dest.id)
                                                                    }}
                                                                    onFocus={() => setActiveStopIndex(index)}
                                                                    onKeyDown={(e) => handleKeyDown(e, dest.id)}
                                                                    placeholder="Ex: Avenida Brasil, 500, Bairro"
                                                                    className="flex-1 bg-transparent outline-none text-sm font-medium"
                                                                    style={{ color: textPrimary }}
                                                                />
                                                                {dest.address && (
                                                                    <button
                                                                        onClick={() => updateDestinationStop(dest.id, '', null)}
                                                                        className="p-1.5 rounded-full hover:bg-black/10 transition-colors"
                                                                        style={{ color: textSecondary }}
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                )}

                                                                {savedDestinations.length > 0 && (
                                                                    <button
                                                                        onClick={() =>
                                                                            setActiveSavedDropdown(
                                                                                isSavedOpen ? null : dest.id
                                                                            )
                                                                        }
                                                                        className="p-1 rounded-full hover:bg-orange-500/10 transition-colors"
                                                                        title="Destinos recentes"
                                                                    >
                                                                        <History size={15} style={{ color: '#f97316' }} />
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {suggestions.length > 0 && (
                                                                <div
                                                                    className="absolute top-full left-0 right-0 mt-1 rounded-2xl overflow-hidden shadow-2xl z-30 max-h-56 overflow-y-auto"
                                                                    style={{
                                                                        background: colors.surface,
                                                                        border: `1px solid ${colors.border}`,
                                                                    }}
                                                                >
                                                                    {suggestions.map((item, i) => (
                                                                        <button
                                                                            key={i}
                                                                            onClick={() => selectSuggestion(item, dest.id)}
                                                                            className={`w-full text-left px-4 py-2.5 text-xs hover:bg-blue-500/10 transition-colors flex items-center gap-2 border-b last:border-none ${i === selectedIndex ? 'bg-blue-500/20 font-bold' : ''
                                                                                }`}
                                                                            style={{ color: textPrimary, borderColor: colors.border }}
                                                                        >
                                                                            <Target size={14} style={{ color: legColor }} />
                                                                            <span className="truncate">{item.place_name}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {isSavedOpen && savedDestinations.length > 0 && (
                                                                <div
                                                                    id={`saved-dropdown-${dest.id}`}
                                                                    className="absolute top-full left-0 right-0 mt-1 rounded-2xl overflow-hidden shadow-2xl z-30 max-h-60 overflow-y-auto"
                                                                    style={{
                                                                        background: colors.surface,
                                                                        border: `1px solid ${colors.border}`,
                                                                    }}
                                                                >
                                                                    <div
                                                                        className="flex items-center justify-between px-4 py-2 border-b"
                                                                        style={{ borderColor: colors.border }}
                                                                    >
                                                                        <span
                                                                            className="text-[10px] font-bold uppercase tracking-wider"
                                                                            style={{ color: textSecondary }}
                                                                        >
                                                                            Destinos Salvos
                                                                        </span>
                                                                        <button
                                                                            onClick={clearSavedDestinations}
                                                                            className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1"
                                                                        >
                                                                            <Trash2 size={11} />
                                                                            Limpar todos
                                                                        </button>
                                                                    </div>
                                                                    {savedDestinations.map((saved) => (
                                                                        <div
                                                                            key={saved.id}
                                                                            className="w-full text-left px-4 py-2.5 text-xs hover:bg-orange-500/10 transition-colors flex items-center justify-between border-b last:border-none group cursor-pointer"
                                                                            style={{ color: textPrimary, borderColor: colors.border }}
                                                                            onClick={() => loadSavedDestination(saved, dest.id)}
                                                                        >
                                                                            <span className="truncate flex-1 font-medium">{saved.address}</span>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    removeSavedDestination(saved.id)
                                                                                }}
                                                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-md transition-opacity ml-2 text-red-500"
                                                                            >
                                                                                <X size={12} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <button
                                                            onClick={() => useCurrentLocation(dest.id)}
                                                            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 border hover:opacity-80 transition-all active:scale-95"
                                                            style={{
                                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.35)`,
                                                                borderColor: colors.border,
                                                                color: textSecondary,
                                                            }}
                                                            title="Usar GPS Atual para esta parada"
                                                        >
                                                            <Navigation size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                <button
                                    onClick={calculateRoute}
                                    disabled={!originCoords || destinations.every((d) => !d.coords) || calculating}
                                    style={{
                                        ...pillButtonFullStyle,
                                        background: GRADIENT,
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731655`,
                                        opacity: !originCoords || destinations.every((d) => !d.coords) || calculating ? 0.5 : 1,
                                    }}
                                    className="hover:scale-[1.01] transition-all active:scale-98 disabled:cursor-not-allowed mt-2 shadow-lg"
                                >
                                    {calculating ? (
                                        <Spinner size={20} />
                                    ) : (
                                        <>
                                            <Calculator size={18} />
                                            Calcular Rota Otimizada ({destinations.filter((d) => d.coords).length} Parada(s))
                                        </>
                                    )}
                                </button>

                                {totalDistance !== null && estimatedPrice !== null && (
                                    <div
                                        className="rounded-2xl p-5 space-y-4 shadow-lg border"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.45)`,
                                            borderColor: colors.border,
                                        }}
                                    >
                                        <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: colors.border }}>
                                            <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                                                <Sparkles size={14} style={{ color: '#f97316' }} />
                                                Resultado do Cálculo
                                            </h4>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center gap-1">
                                                <Move size={10} />
                                                Rota Otimizada
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <div
                                                className="text-center p-3 rounded-xl border"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                }}
                                            >
                                                <div className="flex items-center justify-center gap-1 text-[8px] font-bold uppercase" style={{ color: textSecondary }}>
                                                    <Route size={12} />
                                                    Distância Total
                                                </div>
                                                <p className="text-xl font-black mt-0.5" style={{ color: '#f97316' }}>
                                                    {totalDistance.toFixed(2)} km
                                                </p>
                                            </div>

                                            {totalDuration !== null && (
                                                <div
                                                    className="text-center p-3 rounded-xl border"
                                                    style={{
                                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                        borderColor: colors.border,
                                                    }}
                                                >
                                                    <div className="flex items-center justify-center gap-1 text-[8px] font-bold uppercase" style={{ color: textSecondary }}>
                                                        <Timer size={12} />
                                                        Tempo Est.
                                                    </div>
                                                    <p className="text-xl font-black mt-0.5" style={{ color: '#8b5cf6' }}>
                                                        {Math.round(totalDuration)} min
                                                    </p>
                                                </div>
                                            )}

                                            <div
                                                className="text-center p-3 rounded-xl border"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                }}
                                            >
                                                <div className="flex items-center justify-center gap-1 text-[8px] font-bold uppercase" style={{ color: textSecondary }}>
                                                    <DollarSign size={12} />
                                                    Valor Total
                                                </div>
                                                <p className="text-xl font-black mt-0.5" style={{ color: '#10b981' }}>
                                                    R$ {estimatedPrice.toFixed(2)}
                                                </p>
                                            </div>
                                        </div>

                                        {optimizedOrder.length > 0 && (
                                            <div
                                                className="p-3 rounded-xl border text-xs"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                                    borderColor: '#10b98144',
                                                }}
                                            >
                                                <span className="text-[9px] font-bold uppercase block mb-1" style={{ color: textSecondary }}>
                                                    🗺️ Ordem das paradas otimizada
                                                </span>
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    <span className="font-bold text-orange-500">A</span>
                                                    {optimizedOrder.map((idx, pos) => (
                                                        <Fragment key={pos}>
                                                            <span className="text-gray-400">→</span>
                                                            <span className="font-bold" style={{ color: ROUTE_COLORS[idx % ROUTE_COLORS.length] }}>
                                                                {pos + 1}
                                                            </span>
                                                            <span className="text-[8px] text-gray-400">
                                                                ({destinations[idx]?.address?.split(',')[0] || `Parada ${idx + 1}`})
                                                            </span>
                                                        </Fragment>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {legBreakdowns.length > 0 && (
                                            <div className="space-y-2 pt-2 border-t" style={{ borderColor: colors.border }}>
                                                <h5 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textSecondary }}>
                                                    Detalhamento dos Trechos ({legBreakdowns.length})
                                                </h5>
                                                <div className="space-y-1.5">
                                                    {legBreakdowns.map((leg, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="p-2.5 rounded-xl border flex items-center justify-between text-xs font-medium"
                                                            style={{
                                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.25)`,
                                                                borderColor: leg.color,
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-2 truncate pr-2">
                                                                <div
                                                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                                                    style={{ background: leg.color }}
                                                                />
                                                                <span className="truncate">
                                                                    {leg.from} → <b>{leg.to}</b>
                                                                </span>
                                                                {leg.originalToIndex !== undefined && leg.originalToIndex >= 0 && (
                                                                    <span className="text-[8px] text-gray-400 ml-1">
                                                                        (Parada {leg.originalToIndex + 1} original)
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="font-bold flex-shrink-0" style={{ color: leg.color }}>
                                                                {leg.distance.toFixed(2)} km
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {priceBreakdown.length > 0 && (
                                            <div
                                                className="p-3.5 rounded-xl text-[11px] space-y-1.5 border"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: colors.border,
                                                }}
                                            >
                                                <span className="text-[9px] font-bold uppercase tracking-wider block mb-1" style={{ color: textSecondary }}>
                                                    Composição da Tarifa
                                                </span>
                                                {priceBreakdown.map((item, index) => (
                                                    <div key={index} className="flex justify-between" style={{ color: textSecondary }}>
                                                        <span>{item.label}</span>
                                                        <span className="font-bold" style={{ color: item.value > 0 ? '#f97316' : textSecondary }}>
                                                            {item.value > 0 ? `R$ ${item.value.toFixed(2)}` : 'Incluso'}
                                                        </span>
                                                    </div>
                                                ))}
                                                <div className="flex justify-between pt-2 border-t font-bold" style={{ borderColor: colors.border }}>
                                                    <span style={{ color: textPrimary }}>Valor Total Estimado</span>
                                                    <span className="text-sm" style={{ color: '#10b981' }}>
                                                        R$ {estimatedPrice.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div
                                    className="p-3 rounded-xl text-xs flex items-center gap-2"
                                    style={{
                                        background: '#f9731610',
                                        border: `1px solid #f9731630`,
                                    }}
                                >
                                    <Info size={16} className="flex-shrink-0" style={{ color: '#f97316' }} />
                                    <p style={{ color: textSecondary }} className="text-[11px]">
                                        💡 A rota é otimizada automaticamente! As paradas são reorganizadas para a melhor sequência possível.
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