// src/app/(main)/DistanceCalculator.tsx - Versão SEM geocodificação externa
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { MapPin, ExternalLink } from 'lucide-react'

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
}

// Helper para parsear coordenadas em diferentes formatos
function parseCoordinates(
    coordsProp?: any,
    latProp?: number | null,
    lngProp?: number | null
): LocationData | null {
    // Se temos lat/lng diretos
    if (typeof latProp === 'number' && typeof lngProp === 'number' && isFinite(latProp) && isFinite(lngProp)) {
        return { lat: latProp, lng: lngProp }
    }

    if (!coordsProp) return null

    // Objeto com lat/lng
    if (typeof coordsProp === 'object' && coordsProp !== null) {
        if ('lat' in coordsProp && 'lng' in coordsProp) {
            const lat = Number(coordsProp.lat)
            const lng = Number(coordsProp.lng)
            if (isFinite(lat) && isFinite(lng)) return { lat, lng }
        }
        // Array [lat, lng] ou [lng, lat]
        if (Array.isArray(coordsProp) && coordsProp.length >= 2) {
            const first = Number(coordsProp[0])
            const second = Number(coordsProp[1])
            if (isFinite(first) && isFinite(second)) {
                // Se primeiro valor > 90, provavelmente é [lng, lat]
                if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
                    return { lat: second, lng: first }
                }
                return { lat: first, lng: second }
            }
        }
        // PostGIS Point
        if (coordsProp.type === 'Point' && Array.isArray(coordsProp.coordinates)) {
            const lng = Number(coordsProp.coordinates[0])
            const lat = Number(coordsProp.coordinates[1])
            if (isFinite(lat) && isFinite(lng)) return { lat, lng }
        }
    }

    // String JSON
    if (typeof coordsProp === 'string') {
        if (coordsProp.startsWith('{') || coordsProp.startsWith('[')) {
            try {
                const parsed = JSON.parse(coordsProp)
                return parseCoordinates(parsed)
            } catch {
                // Ignora erro de parse
            }
        }
        // WKT Point
        const match = coordsProp.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
        if (match) {
            const lng = parseFloat(match[1])
            const lat = parseFloat(match[2])
            if (isFinite(lat) && isFinite(lng)) return { lat, lng }
        }
    }

    return null
}

// Extrair nome da rua e número do endereço
function extractStreetAndNumber(fullAddress?: string): string {
    if (!fullAddress || fullAddress === 'Endereço não informado') return ''

    const parts = fullAddress.split(',').map(p => p.trim())
    const firstPart = parts[0] || ''

    let street = firstPart
    let number = ''

    // Tenta encontrar número no final (ex: "Rua X, 123")
    const numberMatch = firstPart.match(/\b(\d+)\b/)
    if (numberMatch) {
        number = numberMatch[1]
        street = firstPart.replace(/\b\d+\b/, '').trim().replace(/,\s*$/, '')
    }

    // Abrevia tipos de logradouro para caber melhor
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

// Calcular distância em metros usando fórmula de Haversine
function calculateHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000 // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

// Formatar distância para exibição
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
    showDistance = true,
    showAddress = true,
    isButton = false,
    userLocation: propUserLocation = null,
    distanceMeters: propDistanceMeters = null,
    className = '',
    onClick
}: DistanceCalculatorProps) {
    // Estado para localização do usuário
    const [userLoc, setUserLoc] = useState<LocationData | null>(() => {
        if (propUserLocation?.lat && propUserLocation?.lng) {
            return { lat: propUserLocation.lat, lng: propUserLocation.lng }
        }
        return null
    })

    const browserLocationAttempted = useRef(false)

    // Parsear coordenadas da loja
    const directStoreLoc = useMemo(() => parseCoordinates(coords, lat, lng), [coords, lat, lng])

    // Atualizar userLoc quando propUserLocation mudar
    useEffect(() => {
        if (propUserLocation?.lat && propUserLocation?.lng) {
            setUserLoc({ lat: propUserLocation.lat, lng: propUserLocation.lng })
        }
    }, [propUserLocation])

    // Tentar geolocalização do navegador (apenas uma vez, sem API externa)
    useEffect(() => {
        if (
            !propUserLocation &&
            !userLoc &&
            !browserLocationAttempted.current &&
            typeof window !== 'undefined' &&
            'geolocation' in navigator
        ) {
            browserLocationAttempted.current = true

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLoc({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    })
                },
                () => {
                    // Silencioso - não faz nada se falhar
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            )
        }
    }, [propUserLocation, userLoc])

    // Calcular distância
    const calculatedDistanceMeters = useMemo(() => {
        // Prioridade 1: Distância vinda do banco (RPC get_stores_with_distance)
        if (propDistanceMeters != null && propDistanceMeters > 0) {
            return propDistanceMeters
        }

        // Prioridade 2: Calcular se tiver coordenadas do usuário E da loja
        if (userLoc && directStoreLoc) {
            return calculateHaversineDistanceMeters(
                userLoc.lat,
                userLoc.lng,
                directStoreLoc.lat,
                directStoreLoc.lng
            )
        }

        return null
    }, [propDistanceMeters, userLoc, directStoreLoc])

    // Formatar endereço para exibição
    const formattedAddress = extractStreetAndNumber(address)

    // Handler para abrir no Google Maps
    const handleOpenMaps = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        if (onClick) {
            onClick(e)
            return
        }

        let mapsUrl = ''
        if (directStoreLoc) {
            mapsUrl = `https://www.google.com/maps/search/?api=1&query=${directStoreLoc.lat},${directStoreLoc.lng}`
        } else if (address) {
            mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
        }

        if (mapsUrl) {
            window.open(mapsUrl, '_blank', 'noopener,noreferrer')
        }
    }

    // Determinar o que mostrar
    const hasAddress = showAddress && !!formattedAddress
    const hasDistance = showDistance && calculatedDistanceMeters != null && calculatedDistanceMeters > 0
    const hasDataToShow = hasAddress || hasDistance

    // Se não tem nada para mostrar, mas tem endereço
    if (!hasDataToShow) {
        if (showAddress && address && address !== 'Endereço não informado') {
            return (
                <div
                    className={`inline-flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-full text-xs font-bold backdrop-blur-md cursor-pointer ${className}`}
                    style={{
                        background: 'rgba(0, 0, 0, 0.75)',
                        color: '#ffffff',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                    }}
                    onClick={handleOpenMaps}
                >
                    <MapPin size={14} className="flex-shrink-0 text-orange-400" />
                    <span className="truncate font-medium text-white/90" title={address}>
                        {formattedAddress || address}
                    </span>
                </div>
            )
        }
        return null
    }

    // Versão inline (não botão) - apenas texto com glassmorfismo
    if (!isButton) {
        return (
            <div
                className={`inline-flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-full text-xs font-bold cursor-pointer backdrop-blur-md ${className}`}
                style={{
                    background: 'rgba(0, 0, 0, 0.75)',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                }}
                onClick={handleOpenMaps}
            >
                <MapPin size={14} className="flex-shrink-0 text-orange-400" />

                {hasAddress && (
                    <span className="truncate font-medium text-white/90" title={address}>
                        {formattedAddress}
                    </span>
                )}

                {hasAddress && hasDistance && (
                    <span className="opacity-50 text-white">•</span>
                )}

                {hasDistance && (
                    <span className="flex-shrink-0 font-bold text-white">
                        {formatDistanceText(calculatedDistanceMeters!)}
                    </span>
                )}
            </div>
        )
    }

    // Versão botão - com efeito hover e ícone de link externo
    return (
        <button
            type="button"
            onClick={handleOpenMaps}
            title={onClick ? "Clique para ver a loja" : "Clique para ver no Google Maps"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer backdrop-blur-md ${className}`}
            style={{
                background: 'rgba(0, 0, 0, 0.75)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            }}
        >
            <div className="flex items-center gap-1.5 min-w-0">
                <MapPin size={14} className="flex-shrink-0 text-orange-400" />

                {hasAddress && (
                    <span className="truncate font-medium text-white/90" title={address}>
                        {formattedAddress}
                    </span>
                )}

                {hasAddress && hasDistance && (
                    <span className="opacity-50 text-white">•</span>
                )}

                {hasDistance && (
                    <span className="flex-shrink-0 font-bold text-white">
                        {formatDistanceText(calculatedDistanceMeters!)}
                    </span>
                )}

                <ExternalLink size={11} className="flex-shrink-0 text-white/70 ml-0.5" />
            </div>
        </button>
    )
}