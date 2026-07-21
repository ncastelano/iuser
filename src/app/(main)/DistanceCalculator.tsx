// src/app/(main)/DistanceCalculator.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { MapPin, ExternalLink, Navigation } from 'lucide-react'
import { useTheme } from '@/app/theme'

export interface DistanceCalculatorProps {
    coords?: { lat: number; lng: number } | [number, number] | string | null
    lat?: number | null
    lng?: number | null
    address?: string
    storeName?: string
    showDistance?: boolean
    showAddress?: boolean
    isButton?: boolean
    userLocation?: { lat: number; lng: number } | null
    distanceMeters?: number | null
    className?: string
    onClick?: (e: React.MouseEvent) => void
}

interface LocationData {
    lat: number
    lng: number
    address?: string
}

// Helper para parsear coordenadas em diferentes formatos
function parseCoordinates(
    coordsProp?: any,
    latProp?: number | null,
    lngProp?: number | null
): LocationData | null {
    if (typeof latProp === 'number' && typeof lngProp === 'number' && isFinite(latProp) && isFinite(lngProp)) {
        return { lat: latProp, lng: lngProp }
    }

    if (!coordsProp) return null

    if (typeof coordsProp === 'object') {
        if ('lat' in coordsProp && 'lng' in coordsProp) {
            const lat = Number(coordsProp.lat)
            const lng = Number(coordsProp.lng)
            if (isFinite(lat) && isFinite(lng)) return { lat, lng }
        }
        if ('latitude' in coordsProp && 'longitude' in coordsProp) {
            const lat = Number(coordsProp.latitude)
            const lng = Number(coordsProp.longitude)
            if (isFinite(lat) && isFinite(lng)) return { lat, lng }
        }
        if (Array.isArray(coordsProp) && coordsProp.length >= 2) {
            const first = Number(coordsProp[0])
            const second = Number(coordsProp[1])
            if (isFinite(first) && isFinite(second)) {
                if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
                    return { lat: second, lng: first }
                }
                return { lat: first, lng: second }
            }
        }
        if (coordsProp.type === 'Point' && Array.isArray(coordsProp.coordinates)) {
            const lng = Number(coordsProp.coordinates[0])
            const lat = Number(coordsProp.coordinates[1])
            if (isFinite(lat) && isFinite(lng)) return { lat, lng }
        }
    }

    if (typeof coordsProp === 'string') {
        if (coordsProp.startsWith('{') || coordsProp.startsWith('[')) {
            try {
                const parsed = JSON.parse(coordsProp)
                return parseCoordinates(parsed)
            } catch { }
        }
        const match = coordsProp.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
        if (match) {
            const lng = parseFloat(match[1])
            const lat = parseFloat(match[2])
            if (isFinite(lat) && isFinite(lng)) return { lat, lng }
        }
    }

    return null
}

// Extrair nome da rua e número da casa do endereço
function extractStreetAndNumber(fullAddress?: string): { street: string; number: string; formatted: string } {
    if (!fullAddress || fullAddress.trim() === '' || fullAddress === 'Endereço não informado') {
        return { street: '', number: '', formatted: '' }
    }

    const parts = fullAddress.split(',').map(p => p.trim())
    const firstPart = parts[0] || ''
    const secondPart = parts[1] || ''

    let street = firstPart
    let number = ''

    if (secondPart && (/^\d+$/i.test(secondPart) || /^(n[º°]?\s*\d+|s\/n|sn)$/i.test(secondPart))) {
        street = firstPart
        number = secondPart.replace(/^n[º°]?\s*/i, '').trim()
    } else {
        const numberMatch = firstPart.match(/(?:,\s*|\s+)(?:n[º°]?\s*)?(\d+|s\/n|sn)$/i)
        if (numberMatch) {
            number = numberMatch[1]
            street = firstPart.substring(0, numberMatch.index).trim()
        } else {
            const isolatedNumMatch = firstPart.match(/\b(\d+)\b/)
            if (isolatedNumMatch) {
                number = isolatedNumMatch[1]
                street = firstPart.replace(/\b\d+\b/, '').trim()
            }
        }
    }

    if (!street) street = firstPart

    const formatted = number ? `${street}, ${number}` : street
    return { street, number, formatted }
}

// Calcular distância em metros usando fórmula de Haversine
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
    if (meters < 1000) {
        return `${Math.round(meters)} m`
    }
    return `${(meters / 1000).toFixed(1)} km`
}

export default function DistanceCalculator({
    coords,
    lat,
    lng,
    address,
    storeName,
    showDistance = true,
    showAddress = true,
    isButton = false,
    userLocation: propUserLocation = null,
    distanceMeters: propDistanceMeters = null,
    className = '',
    onClick
}: DistanceCalculatorProps) {
    const { colors } = useTheme()
    const [userLoc, setUserLoc] = useState<LocationData | null>(
        propUserLocation ? { lat: propUserLocation.lat, lng: propUserLocation.lng } : null
    )
    const [geocodedLoc, setGeocodedLoc] = useState<LocationData | null>(null)
    const [loadingGeocode, setLoadingGeocode] = useState(false)
    const [geocodeAttempted, setGeocodeAttempted] = useState(false)

    const directStoreLoc = useMemo(() => parseCoordinates(coords, lat, lng), [coords, lat, lng])

    useEffect(() => {
        if (propUserLocation) {
            setUserLoc({ lat: propUserLocation.lat, lng: propUserLocation.lng })
        } else if (!userLoc && typeof window !== 'undefined' && 'geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLoc({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    })
                },
                () => { }
            )
        }
    }, [propUserLocation])

    // Geocodificação de fallback - apenas se necessário
    useEffect(() => {
        // Se já temos coordenadas diretas ou já tentamos geocodificar, não faz nada
        if (directStoreLoc || !address || address === 'Endereço não informado' || geocodeAttempted) {
            return
        }

        let cancelled = false
        const fetchCoordsFromAddress = async () => {
            try {
                setLoadingGeocode(true)
                // Tenta buscar coordenadas
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
                    {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    }
                )
                if (!res.ok) {
                    throw new Error('Erro na requisição')
                }
                const data = await res.json()
                if (!cancelled && data && data.length > 0) {
                    setGeocodedLoc({
                        lat: parseFloat(data[0].lat),
                        lng: parseFloat(data[0].lon)
                    })
                }
            } catch (err) {
                // Silenciosamente ignora o erro
                console.debug('[DistanceCalculator] Geocodificação indisponível para:', address)
            } finally {
                if (!cancelled) {
                    setLoadingGeocode(false)
                    setGeocodeAttempted(true)
                }
            }
        }

        fetchCoordsFromAddress()
        return () => { cancelled = true }
    }, [directStoreLoc, address, geocodeAttempted])

    const storeLoc = directStoreLoc || geocodedLoc

    // Calcular distância - prioriza o valor do banco
    const calculatedDistanceMeters = useMemo(() => {
        if (propDistanceMeters != null) {
            console.log('[DistanceCalculator] Usando distância do banco:', propDistanceMeters)
            return propDistanceMeters
        }
        if (userLoc && storeLoc) {
            const dist = calculateHaversineDistanceMeters(userLoc.lat, userLoc.lng, storeLoc.lat, storeLoc.lng)
            console.log('[DistanceCalculator] Distância calculada:', dist)
            return dist
        }
        console.log('[DistanceCalculator] Sem distância disponível')
        return null
    }, [propDistanceMeters, userLoc, storeLoc])

    const { formatted: formattedAddress } = extractStreetAndNumber(address)

    const handleOpenMaps = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        if (onClick) {
            onClick(e)
            return
        }

        let mapsUrl = ''
        if (storeLoc) {
            mapsUrl = `https://www.google.com/maps/search/?api=1&query=${storeLoc.lat},${storeLoc.lng}`
        } else if (address) {
            mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
        }

        if (mapsUrl) {
            window.open(mapsUrl, '_blank', 'noopener,noreferrer')
        }
    }

    const hasDataToShow = (showAddress && formattedAddress) || (showDistance && calculatedDistanceMeters != null)

    if (!hasDataToShow && !loadingGeocode) {
        return null
    }

    // Versão sem container (padrão) - apenas texto
    if (!isButton) {
        return (
            <div
                className={`flex items-center gap-1.5 min-w-0 ${className}`}
                onClick={handleOpenMaps}
            >
                <MapPin size={14} className="flex-shrink-0 text-orange-400" />
                {showAddress && formattedAddress && (
                    <span className="truncate text-xs font-medium text-white/90" title={formattedAddress}>
                        {formattedAddress}
                    </span>
                )}
                {showAddress && showDistance && calculatedDistanceMeters != null && (
                    <span className="opacity-40 text-xs text-white">•</span>
                )}
                {showDistance && calculatedDistanceMeters != null && (
                    <span className="flex-shrink-0 text-xs font-bold text-amber-300">
                        {formatDistanceText(calculatedDistanceMeters)}
                    </span>
                )}
                {showDistance && calculatedDistanceMeters == null && (
                    <span className="flex-shrink-0 text-xs text-white/50">
                        distância indisponível
                    </span>
                )}
            </div>
        )
    }

    // Versão com container (botão) - para outros usos
    return (
        <button
            type="button"
            onClick={handleOpenMaps}
            title={onClick ? "Clique para ver a loja" : "Clique para ver no Google Maps"}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-all duration-200 bg-black/50 hover:bg-black/80 hover:scale-[1.02] active:scale-95 border border-white/20 shadow-md cursor-pointer backdrop-blur-md ${className}`}
        >
            <div className="flex items-center gap-1.5 min-w-0">
                <MapPin size={14} className="flex-shrink-0 text-orange-400" />
                {showAddress && formattedAddress && (
                    <span className="truncate text-xs font-medium text-white/90" title={formattedAddress}>
                        {formattedAddress}
                    </span>
                )}
                {showAddress && showDistance && calculatedDistanceMeters != null && (
                    <span className="opacity-40 text-xs text-white">•</span>
                )}
                {showDistance && calculatedDistanceMeters != null && (
                    <span className="flex-shrink-0 text-xs font-bold text-amber-300">
                        {formatDistanceText(calculatedDistanceMeters)}
                    </span>
                )}
                {showDistance && calculatedDistanceMeters == null && (
                    <span className="flex-shrink-0 text-xs text-white/50">
                        distância indisponível
                    </span>
                )}
                <ExternalLink size={11} className="flex-shrink-0 text-white/70 ml-0.5" />
            </div>
        </button>
    )
}