// src/app/(main)/LocationPicker.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '@/app/theme'
import { MapPin, X, Check, Navigation, Loader2, Search, Home, MoveVertical, Hash, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

interface LocationPickerProps {
    initialLocation: {
        lat: number;
        lng: number;
        address: string;
        addressNumber?: string;
        addressComplement?: string;
    } | null
    onSave: (location: {
        lat: number;
        lng: number;
        address: string;
        addressNumber: string;
        addressComplement: string;
    }) => void
    onClose: () => void
}

const geocodeCache: Map<string, { lat: number; lng: number; address: string } | null> = new Map()
const reverseGeocodeCache: Map<string, string> = new Map()

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; address: string } | null> {
    const key = query.toLowerCase().trim()
    if (geocodeCache.has(key)) return geocodeCache.get(key)!

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
            { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
        )
        if (!res.ok) throw new Error('Erro')
        const data = await res.json()

        if (data?.length > 0) {
            const result = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                address: data[0].display_name || query
            }
            geocodeCache.set(key, result)
            return result
        }
        geocodeCache.set(key, null)
        return null
    } catch {
        return null
    }
}

async function reverseGeocode(lat: number, lng: number): Promise<{
    fullAddress: string;
    streetDisplay: string;
    extractedNumber: string;
}> {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { 'User-Agent': 'iUserApp/1.0', 'Accept-Language': 'pt-BR' } }
        )
        if (!res.ok) throw new Error('Erro')
        const data = await res.json()

        let formatted = ''
        let extractedNumber = ''

        if (data?.address) {
            const addr = data.address
            const street = addr.road || addr.street || ''
            const number = addr.house_number || ''
            const neighbourhood = addr.neighbourhood || addr.suburb || addr.district || ''
            const city = addr.city || addr.town || addr.municipality || ''
            const state = addr.state || ''

            extractedNumber = number

            const parts = []
            if (street) {
                parts.push(number ? `${street}, ${number}` : street)
            }
            if (neighbourhood) parts.push(neighbourhood)
            if (city) parts.push(city)
            if (state) parts.push(state)

            formatted = parts.length > 0 ? parts.join(', ') : data.display_name || ''
        }

        if (!formatted) {
            formatted = data?.display_name || ''
        }

        if (!formatted) {
            formatted = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        }

        reverseGeocodeCache.set(key, formatted)

        return {
            fullAddress: formatted,
            streetDisplay: extractStreetDisplay(formatted),
            extractedNumber
        }
    } catch {
        const fallback = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        reverseGeocodeCache.set(key, fallback)
        return { fullAddress: fallback, streetDisplay: fallback, extractedNumber: '' }
    }
}

function extractStreetDisplay(fullAddress: string): string {
    if (fullAddress.startsWith('Local (')) return fullAddress
    const parts = fullAddress.split(',')
    return parts[0].trim()
}

export default function LocationPicker({ initialLocation, onSave, onClose }: LocationPickerProps) {
    const { colors } = useTheme()
    const router = useRouter()

    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
    const [authLoading, setAuthLoading] = useState(true)

    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<any>(null)
    const savedMarkerRef = useRef<any>(null)
    const movableMarkerRef = useRef<any>(null)
    const polylineRef = useRef<any>(null)
    const isMovingRef = useRef(false)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const initializedRef = useRef(false)

    const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number }>({
        lat: initialLocation?.lat || -15.7801,
        lng: initialLocation?.lng || -47.9292
    })
    const [savedPosition] = useState<{ lat: number; lng: number } | null>(
        initialLocation ? { lat: initialLocation.lat, lng: initialLocation.lng } : null
    )
    const [savedAddress, setSavedAddress] = useState('')
    const [savedNumber, setSavedNumber] = useState(initialLocation?.addressNumber || '')
    const [savedComplement, setSavedComplement] = useState(initialLocation?.addressComplement || '')
    const [newAddress, setNewAddress] = useState('')
    const [newNumber, setNewNumber] = useState('')
    const [newComplement, setNewComplement] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [resolvingAddress, setResolvingAddress] = useState(false)
    const [error, setError] = useState('')
    const [numberError, setNumberError] = useState('')
    const [mapReady, setMapReady] = useState(false)
    const [usingGPS, setUsingGPS] = useState(false)

    // 🔒 VERIFICAÇÃO DE AUTENTICAÇÃO
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data: { user }, error } = await supabase.auth.getUser()
                if (error || !user) {
                    setIsAuthenticated(false)
                } else {
                    setIsAuthenticated(true)
                }
            } catch (err) {
                console.error('Erro ao verificar autenticação:', err)
                setIsAuthenticated(false)
            } finally {
                setAuthLoading(false)
            }
        }

        checkAuth()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                setIsAuthenticated(true)
            } else if (event === 'SIGNED_OUT') {
                setIsAuthenticated(false)
                onClose()
            }
            setAuthLoading(false)
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [onClose])

    // Resolver endereço salvo
    useEffect(() => {
        if (!initialLocation) return

        if (initialLocation.address && !initialLocation.address.startsWith('Local (')) {
            setSavedAddress(initialLocation.address)
            setSavedNumber(initialLocation.addressNumber || '')
            setSavedComplement(initialLocation.addressComplement || '')
            return
        }

        if (savedPosition) {
            reverseGeocode(savedPosition.lat, savedPosition.lng).then(result => {
                setSavedAddress(result.fullAddress)
            })
        }
    }, [initialLocation, savedPosition])

    // 🗺️ INICIALIZAR MAPA
    useEffect(() => {
        // Se já inicializou ou não tem container, não faz nada
        if (typeof window === 'undefined' || !mapContainerRef.current || initializedRef.current) {
            return
        }

        // Marca como inicializado imediatamente
        initializedRef.current = true

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

                const map = L.map(mapContainerRef.current!, {
                    center: [selectedPosition.lat, selectedPosition.lng],
                    zoom: 15,
                    zoomControl: true,
                    attributionControl: false,
                })

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                }).addTo(map)

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

                const movableMarker = L.marker([selectedPosition.lat, selectedPosition.lng], {
                    icon: orangeIcon,
                    draggable: true,
                    zIndexOffset: 1000
                }).addTo(map)

                movableMarker.on('dragend', () => {
                    const pos = movableMarker.getLatLng()
                    const newPos = { lat: pos.lat, lng: pos.lng }
                    setSelectedPosition(newPos)
                    updatePolyline(map, savedPosition, newPos)

                    setResolvingAddress(true)
                    setError('')
                    reverseGeocode(newPos.lat, newPos.lng).then(result => {
                        setNewAddress(result.fullAddress)
                        if (result.extractedNumber && !newNumber) {
                            setNewNumber(result.extractedNumber)
                        }
                        setResolvingAddress(false)
                    })
                })

                let savedMarker: any = null
                if (savedPosition) {
                    savedMarker = L.marker([savedPosition.lat, savedPosition.lng], {
                        icon: blueIcon,
                        draggable: false,
                        zIndexOffset: 500
                    }).addTo(map)
                    updatePolyline(map, savedPosition, selectedPosition)
                }

                mapInstanceRef.current = map
                movableMarkerRef.current = movableMarker
                savedMarkerRef.current = savedMarker

                map.on('moveend', () => {
                    if (isMovingRef.current) {
                        isMovingRef.current = false
                        return
                    }

                    const center = map.getCenter()
                    const newPos = { lat: center.lat, lng: center.lng }
                    movableMarker.setLatLng([newPos.lat, newPos.lng])
                    setSelectedPosition(newPos)
                    updatePolyline(map, savedPosition, newPos)

                    if (debounceTimerRef.current) {
                        clearTimeout(debounceTimerRef.current)
                    }

                    setResolvingAddress(true)
                    setError('')

                    debounceTimerRef.current = setTimeout(async () => {
                        try {
                            const result = await reverseGeocode(newPos.lat, newPos.lng)
                            setNewAddress(result.fullAddress)
                            if (result.extractedNumber && !newNumber) {
                                setNewNumber(result.extractedNumber)
                            }
                        } catch (err) {
                            const fallback = `Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`
                            setNewAddress(fallback)
                        } finally {
                            setResolvingAddress(false)
                        }
                    }, 500)
                })

                // Busca endereço inicial
                setResolvingAddress(true)
                try {
                    const result = await reverseGeocode(selectedPosition.lat, selectedPosition.lng)
                    setNewAddress(result.fullAddress)
                    if (result.extractedNumber) {
                        setNewNumber(result.extractedNumber)
                    }
                } catch (err) {
                    const fallback = `Local (${selectedPosition.lat.toFixed(4)}, ${selectedPosition.lng.toFixed(4)})`
                    setNewAddress(fallback)
                } finally {
                    setResolvingAddress(false)
                }

                if (savedPosition) {
                    const bounds = L.latLngBounds(
                        [savedPosition.lat, savedPosition.lng],
                        [selectedPosition.lat, selectedPosition.lng]
                    )
                    map.fitBounds(bounds, { padding: [50, 50] })
                }

                setMapReady(true)
            } catch (error) {
                console.error('Erro ao inicializar mapa:', error)
            }
        }

        initMap()

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
            initializedRef.current = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Array vazio - executa apenas uma vez na montagem

    const updatePolyline = useCallback((map: any, saved: { lat: number; lng: number } | null, selected: { lat: number; lng: number }) => {
        const L = (window as any).L
        if (!L || !map) return

        if (polylineRef.current) {
            map.removeLayer(polylineRef.current)
            polylineRef.current = null
        }

        if (saved) {
            polylineRef.current = L.polyline(
                [[saved.lat, saved.lng], [selected.lat, selected.lng]],
                {
                    color: '#9CA3AF',
                    weight: 2,
                    dashArray: '8, 8',
                    opacity: 0.6
                }
            ).addTo(map)
        }
    }, [])

    const flyTo = useCallback((lat: number, lng: number) => {
        if (!mapInstanceRef.current || !movableMarkerRef.current) return

        isMovingRef.current = true
        mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 0.8 })
        movableMarkerRef.current.setLatLng([lat, lng])
        updatePolyline(mapInstanceRef.current, savedPosition, { lat, lng })
    }, [savedPosition, updatePolyline])

    const handleGetCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocalização não suportada')
            return
        }

        setUsingGPS(true)
        setLoading(true)
        setError('')

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const newPos = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                }
                setSelectedPosition(newPos)
                flyTo(newPos.lat, newPos.lng)

                setResolvingAddress(true)
                try {
                    const result = await reverseGeocode(newPos.lat, newPos.lng)
                    setNewAddress(result.fullAddress)
                    if (result.extractedNumber) {
                        setNewNumber(result.extractedNumber)
                    }
                } catch (err) {
                    const fallback = `Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`
                    setNewAddress(fallback)
                } finally {
                    setResolvingAddress(false)
                    setLoading(false)
                    setUsingGPS(false)
                }
            },
            (err) => {
                let msg = 'Erro ao obter localização. '
                switch (err.code) {
                    case err.PERMISSION_DENIED: msg += 'Permissão negada.'; break
                    case err.POSITION_UNAVAILABLE: msg += 'Localização indisponível.'; break
                    case err.TIMEOUT: msg += 'Tempo esgotado.'; break
                }
                setError(msg)
                setLoading(false)
                setUsingGPS(false)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }, [flyTo])

    const handleSearchAddress = useCallback(async () => {
        if (!searchQuery.trim()) return

        setLoading(true)
        setError('')

        const result = await geocodeAddress(searchQuery.trim())

        if (result) {
            setSelectedPosition({ lat: result.lat, lng: result.lng })
            setNewAddress(result.address)
            flyTo(result.lat, result.lng)
            setSearchQuery('')
        } else {
            setError('Endereço não encontrado.')
        }

        setLoading(false)
    }, [searchQuery, flyTo])

    const handleSave = useCallback(() => {
        if (!newNumber.trim()) {
            setNumberError('O número é obrigatório')
            return
        }
        setNumberError('')

        let fullAddressWithDetails = newAddress

        if (newNumber && !newAddress.includes(newNumber)) {
            const firstCommaIndex = fullAddressWithDetails.indexOf(',')
            if (firstCommaIndex !== -1) {
                fullAddressWithDetails = fullAddressWithDetails.slice(0, firstCommaIndex) +
                    `, ${newNumber}` +
                    fullAddressWithDetails.slice(firstCommaIndex)
            }
        }

        onSave({
            lat: selectedPosition.lat,
            lng: selectedPosition.lng,
            address: fullAddressWithDetails,
            addressNumber: newNumber,
            addressComplement: newComplement
        })
    }, [newNumber, newAddress, newComplement, selectedPosition, onSave])

    // Loading
    if (authLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/30 backdrop-blur-sm">
                <div
                    className="rounded-2xl p-6 sm:p-8 w-full max-w-sm shadow-2xl flex flex-col items-center gap-4"
                    style={{
                        background: `${colors.surface}ee`,
                        backdropFilter: 'blur(20px) saturate(180%)',
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                    }}
                >
                    <Loader2 size={32} className="animate-spin" style={{ color: colors.accent }} />
                    <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                        Verificando autenticação...
                    </p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        router.push('/login')
        return null
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/30 backdrop-blur-sm">
            <div
                className="rounded-2xl p-3 sm:p-4 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
                style={{
                    background: `${colors.surface}ee`,
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                }}
            >
                <h3 className="text-base sm:text-lg font-extrabold mb-3 tracking-tight flex items-center gap-2">
                    <MapPin size={20} style={{ color: colors.accent }} />
                    Definir localização
                </h3>

                <div className="flex gap-2 mb-3">
                    <div className="flex-1 flex items-center pl-0 pr-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                            background: `${colors.surface}88`,
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${colors.border}`,
                        }}
                    >
                        <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: `${colors.surface}88` }}>
                            <Search size={14} color={colors.textSecondary} />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar novo endereço..."
                            className="flex-1 bg-transparent outline-none ml-1.5 text-xs"
                            style={{ color: colors.textPrimary }}
                            disabled={loading}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAddress() }}
                        />
                        {searchQuery && (
                            <button onClick={handleSearchAddress} disabled={loading}
                                className="px-3 py-1 rounded-full text-xs font-bold"
                                style={{ background: colors.accent, color: colors.accentText }}>
                                {loading ? '...' : 'Ir'}
                            </button>
                        )}
                    </div>

                    <button
                        onClick={handleGetCurrentLocation}
                        disabled={loading}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50 flex-shrink-0"
                        style={{
                            background: `${colors.accent}22`,
                            color: colors.accent,
                            border: `1px solid ${colors.accent}44`,
                        }}
                        title="Usar GPS"
                    >
                        {usingGPS ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                        <span className="hidden sm:inline">GPS</span>
                    </button>
                </div>

                <div className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden mb-3"
                    style={{
                        border: `2px solid ${colors.border}`,
                        background: colors.surface,
                    }}
                >
                    <div ref={mapContainerRef} className="w-full h-full" />
                    {!mapReady && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: colors.surface }}>
                            <Loader2 size={24} className="animate-spin" style={{ color: colors.accent }} />
                        </div>
                    )}
                </div>

                <div className="space-y-2 mb-3">
                    {savedPosition && (
                        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                            style={{
                                background: `${colors.surface}88`,
                                border: `1px solid #3B82F644`,
                            }}
                        >
                            <div className="flex-shrink-0 mt-0.5">
                                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                                    <Home size={14} style={{ color: '#3B82F6' }} />
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textSecondary }}>
                                    Localização salva
                                </span>
                                <p className="text-xs font-medium mt-0.5 break-words leading-relaxed" style={{ color: colors.textPrimary }}>
                                    {savedAddress || 'Carregando endereço...'}
                                </p>
                                {savedNumber && (
                                    <p className="text-[11px] mt-0.5 opacity-70" style={{ color: colors.textSecondary }}>
                                        Nº {savedNumber}
                                    </p>
                                )}
                                {savedComplement && (
                                    <p className="text-[11px] mt-0.5 opacity-70 italic" style={{ color: colors.textSecondary }}>
                                        "{savedComplement}"
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                        style={{
                            background: `${colors.surface}88`,
                            border: `1px solid #F9731644`,
                        }}
                    >
                        <div className="flex-shrink-0 mt-0.5">
                            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                                <MoveVertical size={14} style={{ color: '#F97316' }} />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: colors.textSecondary }}>
                                Nova localização
                            </span>
                            {resolvingAddress ? (
                                <p className="text-xs mt-0.5 opacity-50" style={{ color: colors.textSecondary }}>
                                    Obtendo endereço...
                                </p>
                            ) : (
                                <p className="text-xs font-medium mt-0.5 break-words leading-relaxed" style={{ color: colors.textPrimary }}>
                                    {newAddress || 'Arraste o marcador laranja ou mova o mapa'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {!resolvingAddress && newAddress && (
                    <div className="space-y-2 mb-3">
                        <div className="px-3 py-2 rounded-xl"
                            style={{
                                background: `${colors.surface}88`,
                                border: `1px solid ${numberError ? '#EF4444' : colors.border}`,
                            }}
                        >
                            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 mb-1"
                                style={{ color: colors.textSecondary }}>
                                <Hash size={12} />
                                Número da casa/apto *
                            </label>
                            <input
                                type="text"
                                value={newNumber}
                                onChange={(e) => {
                                    setNewNumber(e.target.value)
                                    setNumberError('')
                                }}
                                placeholder="Ex: 2836"
                                className="w-full bg-transparent outline-none text-xs font-medium"
                                style={{ color: colors.textPrimary }}
                                required
                            />
                            {numberError && (
                                <p className="text-red-500 text-[10px] mt-1">{numberError}</p>
                            )}
                        </div>

                        <div className="px-3 py-2 rounded-xl"
                            style={{
                                background: `${colors.surface}88`,
                                border: `1px solid ${colors.border}`,
                            }}
                        >
                            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-50 mb-1"
                                style={{ color: colors.textSecondary }}>
                                <FileText size={12} />
                                Complemento (opcional)
                            </label>
                            <input
                                type="text"
                                value={newComplement}
                                onChange={(e) => setNewComplement(e.target.value)}
                                placeholder="Ex: Casa com parede de cerâmica, portão azul..."
                                className="w-full bg-transparent outline-none text-xs font-medium"
                                style={{ color: colors.textPrimary }}
                            />
                        </div>
                    </div>
                )}

                {error && (
                    <p className="text-red-500 text-xs font-medium mb-2 ml-1">{error}</p>
                )}

                <p className="text-[10px] mb-3 ml-1 opacity-50" style={{ color: colors.textSecondary }}>
                    💡 Arraste o marcador laranja ou o mapa para ajustar a nova localização
                </p>

                <div className="flex gap-2 justify-end">
                    <button onClick={onClose} disabled={loading}
                        className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs font-semibold transition-all hover:opacity-80"
                        style={{ background: `${colors.surface}88`, backdropFilter: 'blur(10px)', color: colors.textSecondary, border: `1px solid ${colors.border}` }}>
                        <div className="h-7 w-7 rounded-full flex items-center justify-center"
                            style={{ background: `${colors.surface}88` }}>
                            <X size={14} />
                        </div>
                        <span className="ml-1.5">Cancelar</span>
                    </button>

                    <button onClick={handleSave} disabled={loading}
                        className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                        style={{ background: colors.accent, color: colors.accentText }}>
                        <div className="h-7 w-7 rounded-full flex items-center justify-center"
                            style={{ background: colors.accent }}>
                            <Check size={14} />
                        </div>
                        <span className="ml-1.5">Salvar localização</span>
                    </button>
                </div>
            </div>
        </div>
    )
}