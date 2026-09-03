// app/(main)/pedir-motorista/page.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import { addRecentRideDestination } from '@/lib/recentRideDestinations'
import { getVehicleTypeForPassengers, VEHICLE_TYPE_LABELS } from '@/lib/rideVehicle'
import {
    Car,
    User,
    Users,
    Package,
    MapPin,
    MapPinPlus,
    Loader2,
    CheckCircle2,
    ArrowLeft,
    Search,
    X,
    ShieldAlert,
    Minus,
    Plus,
    Building2,
    Phone,
    Bus,
} from 'lucide-react'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho
const ROUTE_COLORS = ['#3b82f6', '#a855f7', '#f59e0b']
const AVERAGE_SPEED_KMH = 40

type RideType = 'para-mim' | 'buscar-alguem' | 'entregar-algo'
type ActiveField = 'origin' | 'destination' | null

interface Place {
    address: string
    coords: [number, number] | null
}

interface RouteOption {
    coords: [number, number][]
    distanceKm: number
    durationMin: number
}

const RIDE_TYPES: { id: RideType; label: string; icon: any; forWhomLabel: string }[] = [
    { id: 'para-mim', label: 'Pra mim', icon: Car, forWhomLabel: '' },
    { id: 'buscar-alguem', label: 'Buscar alguém', icon: User, forWhomLabel: 'Nome de quem vamos buscar' },
    { id: 'entregar-algo', label: 'Entregar algo', icon: Package, forWhomLabel: 'O que vamos entregar' },
]

async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
    try {
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}&language=pt&types=address,place,locality`
        )
        const data = await res.json()
        return data.features?.[0]?.place_name || null
    } catch {
        return null
    }
}

async function searchAddress(query: string): Promise<{ place_name: string; center: [number, number] }[]> {
    try {
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&language=pt&limit=5&country=br`
        )
        const data = await res.json()
        return data.features || []
    } catch {
        return []
    }
}

async function fetchRoutes(origin: [number, number], destination: [number, number]): Promise<RouteOption[]> {
    try {
        const res = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?alternatives=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
        )
        const data = await res.json()
        const rawRoutes: any[] = data.routes || []
        return rawRoutes.slice(0, 3).map((r) => {
            const distanceKm = r.distance / 1000
            const durationMin = (distanceKm / AVERAGE_SPEED_KMH) * 60
            return { coords: r.geometry.coordinates as [number, number][], distanceKm, durationMin }
        })
    } catch {
        return []
    }
}

export default function PedirMotoristaPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const mapContainerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const originMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const destMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const [mapReady, setMapReady] = useState(false)
    const [rideType, setRideType] = useState<RideType>('para-mim')
    const [origin, setOrigin] = useState<Place>({ address: '', coords: null })
    const [destination, setDestination] = useState<Place>({ address: '', coords: null })
    const [activeField, setActiveField] = useState<ActiveField>(null)
    const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([])
    const [searching, setSearching] = useState(false)
    const [locatingOrigin, setLocatingOrigin] = useState(false)
    const [routes, setRoutes] = useState<RouteOption[]>([])
    const [selectedRoute, setSelectedRoute] = useState(0)
    const [loadingRoutes, setLoadingRoutes] = useState(false)
    const [forWhom, setForWhom] = useState('')
    const [notes, setNotes] = useState('')
    const [showNotes, setShowNotes] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [showPlateReminder, setShowPlateReminder] = useState(false)

    const [passengerCount, setPassengerCount] = useState(1)
    const [recipientName, setRecipientName] = useState('')
    const [recipientPhone, setRecipientPhone] = useState('')
    const [originNeedsAccess, setOriginNeedsAccess] = useState(false)
    const [originAccessNotes, setOriginAccessNotes] = useState('')
    const [destinationNeedsAccess, setDestinationNeedsAccess] = useState(false)
    const [destinationAccessNotes, setDestinationAccessNotes] = useState('')

    const selectedType = RIDE_TYPES.find((t) => t.id === rideType)!
    const vehicleType = getVehicleTypeForPassengers(passengerCount)

    // ===== ENTREGAR ALGO NÃO USA Nº DE PASSAGEIROS =====
    useEffect(() => {
        if (rideType === 'entregar-algo') setPassengerCount(1)
    }, [rideType])

    // ===== INIT MAP =====
    useEffect(() => {
        if (!mapContainerRef.current) return

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: DEFAULT_CENTER,
            zoom: 13,
            attributionControl: false,
        })
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
        map.on('load', () => setMapReady(true))
        mapRef.current = map

        return () => {
            map.remove()
            mapRef.current = null
        }
    }, [])

    // ===== LOCALIZAÇÃO INICIAL (usada como origem padrão) =====
    const useMyLocationAsOrigin = useCallback((notifyApproximate = false) => {
        if (!navigator.geolocation) return
        setLocatingOrigin(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude]
                const address = await reverseGeocode(coords[0], coords[1])
                setOrigin({ address: address || `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`, coords })
                if (mapRef.current) mapRef.current.flyTo({ center: coords, zoom: 15, duration: 800 })
                setLocatingOrigin(false)
                if (notifyApproximate) {
                    toast.info('Sua localização é aproximada. Sempre confira a placa e a cor do carro para reconhecer o motorista certo.', { duration: 6000 })
                }
            },
            () => {
                toast.error('Não conseguimos acessar sua localização', {
                    description: (
                        <span className="inline-flex items-center gap-1 flex-wrap">
                            Clique no ícone
                            <MapPinPlus size={14} className="inline-block flex-shrink-0" />
                            para adicionar sua localização, ou escreva em "Local de partida" para buscar o endereço.
                        </span>
                    ),
                    duration: 6000,
                })
                setLocatingOrigin(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }, [])

    useEffect(() => {
        if (mapReady) useMyLocationAsOrigin()
    }, [mapReady, useMyLocationAsOrigin])

    // ===== TIPO DE CORRIDA E DESTINO VINDOS DE UM ATALHO (?tipo=, ?destino=, ?lat=, ?lng=) =====
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const tipo = params.get('tipo')
        if (RIDE_TYPES.some((t) => t.id === tipo)) {
            setRideType(tipo as RideType)
        }

        const destino = params.get('destino')
        const lat = params.get('lat')
        const lng = params.get('lng')
        if (destino) {
            const coords: [number, number] | null =
                lat && lng ? [parseFloat(lng), parseFloat(lat)] : null
            setDestination({ address: destino, coords })
        }
    }, [])

    // ===== MARCADORES NO MAPA =====
    useEffect(() => {
        if (!mapReady || !mapRef.current) return
        const map = mapRef.current

        if (originMarkerRef.current) originMarkerRef.current.remove()
        if (origin.coords) {
            const el = document.createElement('div')
            el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
            el.innerHTML = `
                <div style="background:#22c55e;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">Saída</div>
                <div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
            `
            originMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(origin.coords).addTo(map)
        }

        if (destMarkerRef.current) destMarkerRef.current.remove()
        if (destination.coords) {
            const el = document.createElement('div')
            el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
            el.innerHTML = `
                <div style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">Chegada</div>
                <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="1.5"><path d="M12 22s8-7.58 8-13a8 8 0 1 0-16 0c0 5.42 8 13 8 13z"/></svg>
            `
            destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(destination.coords).addTo(map)
        }

        if (origin.coords && destination.coords) {
            const bounds = new mapboxgl.LngLatBounds(origin.coords, origin.coords)
            bounds.extend(destination.coords)
            map.fitBounds(bounds, { padding: 100, duration: 800 })
        }
    }, [mapReady, origin.coords, destination.coords])

    // ===== BUSCA DE ROTAS (até 3 caminhos mais rápidos) =====
    useEffect(() => {
        if (!origin.coords || !destination.coords) {
            setRoutes([])
            return
        }

        let cancelled = false
        setLoadingRoutes(true)
        fetchRoutes(origin.coords, destination.coords).then((result) => {
            if (cancelled) return
            setRoutes(result)
            setSelectedRoute(0)
            setLoadingRoutes(false)
        })

        return () => {
            cancelled = true
        }
    }, [origin.coords, destination.coords])

    // ===== DESENHA AS ROTAS NO MAPA =====
    useEffect(() => {
        if (!mapReady || !mapRef.current) return
        const map = mapRef.current
        const clickHandlers: { layerId: string; handler: () => void }[] = []

        for (let i = 0; i < 3; i++) {
            const layerId = `route-line-${i}`
            const sourceId = `route-source-${i}`
            if (map.getLayer(layerId)) map.removeLayer(layerId)
            if (map.getSource(sourceId)) map.removeSource(sourceId)
        }

        if (routes.length > 0) {
            const order = routes.map((_, i) => i).sort((a, b) => (a === selectedRoute ? 1 : b === selectedRoute ? -1 : 0))

            order.forEach((i) => {
                const route = routes[i]
                const sourceId = `route-source-${i}`
                const layerId = `route-line-${i}`
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coords } },
                })
                map.addLayer({
                    id: layerId,
                    type: 'line',
                    source: sourceId,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': ROUTE_COLORS[i % ROUTE_COLORS.length],
                        'line-width': i === selectedRoute ? 6 : 4,
                        'line-opacity': i === selectedRoute ? 1 : 0.45,
                    },
                })
                const handler = () => setSelectedRoute(i)
                map.on('click', layerId, handler)
                clickHandlers.push({ layerId, handler })
            })

            const active = routes[selectedRoute]
            if (active) {
                const bounds = active.coords.reduce(
                    (b, c) => b.extend(c),
                    new mapboxgl.LngLatBounds(active.coords[0], active.coords[0])
                )
                map.fitBounds(bounds, { padding: 80, duration: 500 })
            }
        }

        return () => {
            clickHandlers.forEach(({ layerId, handler }) => map.off('click', layerId, handler))
        }
    }, [mapReady, routes, selectedRoute])

    // ===== BUSCA DE ENDEREÇO (autocomplete) =====
    const handleAddressChange = (field: 'origin' | 'destination', value: string) => {
        if (field === 'origin') setOrigin({ address: value, coords: null })
        else setDestination({ address: value, coords: null })

        setActiveField(field)

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

        if (!value.trim() || value.trim().length < 3) {
            setSuggestions([])
            return
        }

        searchTimeoutRef.current = setTimeout(async () => {
            setSearching(true)
            const results = await searchAddress(value)
            setSuggestions(results)
            setSearching(false)
        }, 400)
    }

    const openField = (field: ActiveField) => {
        setActiveField(field)
        setSuggestions([])
    }

    const selectSuggestion = (field: 'origin' | 'destination', suggestion: { place_name: string; center: [number, number] }) => {
        const place = { address: suggestion.place_name, coords: suggestion.center }
        if (field === 'origin') setOrigin(place)
        else {
            setDestination(place)
            addRecentRideDestination(place)
        }
        setSuggestions([])
        setActiveField(null)
    }

    const handleSubmit = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }
        if (!origin.address.trim() || !destination.address.trim()) {
            toast.error('Preencha o endereço de origem e destino')
            return
        }

        setSubmitting(true)
        try {
            const { error } = await supabase.from('ride_requests').insert({
                requester_id: user.id,
                ride_type: rideType,
                origin_address: origin.address.trim(),
                destination_address: destination.address.trim(),
                for_whom: forWhom.trim() || null,
                notes: notes.trim() || null,
                passenger_count: passengerCount,
                vehicle_type: vehicleType,
                origin_needs_access: originNeedsAccess,
                origin_access_notes: originNeedsAccess ? originAccessNotes.trim() || null : null,
                destination_needs_access: destinationNeedsAccess,
                destination_access_notes: destinationNeedsAccess ? destinationAccessNotes.trim() || null : null,
                recipient_name: rideType === 'entregar-algo' ? recipientName.trim() || null : null,
                recipient_phone: rideType === 'entregar-algo' ? recipientPhone.trim() || null : null,
            })

            if (error) throw error
            setSubmitted(true)
        } catch (err: any) {
            toast.error('Erro ao enviar pedido: ' + (err.message || 'tente novamente'))
        } finally {
            setSubmitting(false)
        }
    }

    const inputStyle = { color: colors.textPrimary }

    return (
        <div className="fixed inset-0" style={{ zIndex: 0 }}>
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" style={{ background: '#111' }} />

            {/* Botão voltar flutuante */}
            <button
                onClick={() => router.push('/')}
                className="absolute top-6 left-4 z-30 w-11 h-11 rounded-full flex items-center justify-center shadow-xl"
                style={{ background: colors.surface, color: colors.textPrimary }}
            >
                <ArrowLeft size={20} />
            </button>

            {/* Overlay de busca em tela cheia quando um campo está ativo */}
            {activeField && (
                <div className="absolute inset-0 z-40" style={{ background: colors.background }}>
                    <div className="p-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <button
                            onClick={() => { setActiveField(null); setSuggestions([]) }}
                            className="p-2 rounded-full"
                            style={{ color: colors.textSecondary }}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex-1 relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                            <input
                                autoFocus
                                type="text"
                                value={activeField === 'origin' ? origin.address : destination.address}
                                onChange={(e) => handleAddressChange(activeField, e.target.value)}
                                placeholder={activeField === 'origin' ? 'De onde você vai sair?' : 'Para onde vamos?'}
                                className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm focus:outline-none"
                                style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />
                            {(activeField === 'origin' ? origin.address : destination.address) && (
                                <button
                                    onClick={() => handleAddressChange(activeField, '')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                                    style={{ color: colors.textSecondary }}
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {activeField === 'origin' && (
                        <button
                            onClick={() => { useMyLocationAsOrigin(true); setActiveField(null); setSuggestions([]) }}
                            className="w-full flex items-center gap-3 px-4 py-3.5"
                            style={{ borderBottom: `1px solid ${colors.border}` }}
                        >
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                                {locatingOrigin ? <Loader2 size={16} className="animate-spin" /> : <MapPinPlus size={16} />}
                            </div>
                            <span className="text-sm font-bold" style={{ color: colors.accent }}>Usar minha localização atual</span>
                        </button>
                    )}

                    {searching && (
                        <div className="flex justify-center py-6">
                            <Loader2 className="animate-spin" size={20} style={{ color: colors.textSecondary }} />
                        </div>
                    )}

                    <div className="overflow-y-auto">
                        {suggestions.map((s, idx) => (
                            <button
                                key={idx}
                                onClick={() => selectSuggestion(activeField, s)}
                                className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
                                style={{ borderBottom: `1px solid ${colors.border}` }}
                            >
                                <MapPin size={16} className="mt-0.5 flex-shrink-0" style={{ color: colors.textSecondary }} />
                                <span className="text-sm" style={{ color: colors.textPrimary }}>{s.place_name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Dialog de segurança: confira placa e cor antes de confirmar */}
            {showPlateReminder && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div
                        className="w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
                        style={{ background: colors.surface, boxShadow: colors.shadow }}
                    >
                        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                            <ShieldAlert size={32} />
                        </div>
                        <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Antes de confirmar</h2>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                            Sua localização enviada ao motorista é aproximada. Ao encontrar o carro, sempre confira a <strong>placa</strong> e a <strong>cor</strong> do veículo para ter certeza de que é o motorista certo.
                        </p>
                        <button
                            onClick={() => { setShowPlateReminder(false); handleSubmit() }}
                            disabled={submitting}
                            className="mt-2 w-full py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: GRADIENT, color: '#fff' }}
                        >
                            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Car size={18} />}
                            Entendi, confirmar pedido
                        </button>
                        <button
                            onClick={() => setShowPlateReminder(false)}
                            className="w-full py-2.5 rounded-full font-bold text-sm"
                            style={{ color: colors.textSecondary }}
                        >
                            Voltar
                        </button>
                    </div>
                </div>
            )}

            {/* Ficha de confirmação */}
            {submitted && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div
                        className="w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
                        style={{ background: colors.surface, boxShadow: colors.shadow }}
                    >
                        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                            <CheckCircle2 size={32} />
                        </div>
                        <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Pedido enviado!</h2>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                            Assim que tivermos motoristas parceiros disponíveis na sua região, vamos avisar você.
                        </p>
                        <button
                            onClick={() => router.push('/')}
                            className="mt-2 w-full py-3 rounded-full font-bold text-sm"
                            style={{ background: GRADIENT, color: '#fff' }}
                        >
                            Voltar ao início
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom sheet estilo Uber */}
            {!activeField && !submitted && (
                <div
                    className="absolute bottom-0 inset-x-0 z-20 rounded-t-3xl px-5 pt-4 pb-8 max-h-[75vh] overflow-y-auto"
                    style={{ background: colors.surface, boxShadow: '0 -8px 30px rgba(0,0,0,0.35)' }}
                >
                    <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: colors.border }} />

                    <h2 className="text-lg font-black mb-3" style={{ color: colors.textPrimary }}>Para onde vamos?</h2>

                    {/* Bloco de endereços conectados por uma linha, igual Uber */}
                    <div className="rounded-2xl overflow-hidden relative" style={{ border: `1px solid ${colors.border}` }}>
                        <div className="absolute w-0.5" style={{ left: 21, top: 24, bottom: 24, background: colors.border }} />
                        <div className="flex items-center gap-3 px-4 py-3">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#22c55e' }} />
                            <input
                                readOnly
                                onClick={() => openField('origin')}
                                value={locatingOrigin ? 'Localizando...' : origin.address}
                                placeholder="Local de partida"
                                className="flex-1 bg-transparent text-sm focus:outline-none cursor-pointer"
                                style={inputStyle}
                            />
                            <button onClick={() => useMyLocationAsOrigin(true)} className="flex-shrink-0" style={{ color: colors.accent }}>
                                {locatingOrigin ? <Loader2 size={16} className="animate-spin" /> : <MapPinPlus size={16} />}
                            </button>
                        </div>
                        <div style={{ borderTop: `1px solid ${colors.border}` }} />
                        <div className="flex items-center gap-3 px-4 py-3">
                            <MapPin size={14} className="flex-shrink-0" style={{ color: '#ef4444' }} />
                            <input
                                readOnly
                                onClick={() => openField('destination')}
                                value={destination.address}
                                placeholder="Para onde vamos?"
                                className="flex-1 bg-transparent text-sm focus:outline-none cursor-pointer"
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    {/* Instruções de acesso — precisa entrar no local? */}
                    <div className="flex flex-col gap-2 mt-3">
                        {originAccessNotes || originNeedsAccess ? (
                            <div className="rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                        <Building2 size={13} style={{ color: '#22c55e' }} />
                                        Acesso na origem
                                    </span>
                                    <button
                                        onClick={() => { setOriginNeedsAccess(false); setOriginAccessNotes('') }}
                                        className="text-[11px] font-semibold"
                                        style={{ color: colors.textSecondary }}
                                    >
                                        Remover
                                    </button>
                                </div>
                                <textarea
                                    value={originAccessNotes}
                                    onChange={(e) => setOriginAccessNotes(e.target.value)}
                                    rows={2}
                                    autoFocus
                                    placeholder="Nome pra portaria, nº do apto, código do portão..."
                                    className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                            </div>
                        ) : (
                            <button
                                onClick={() => setOriginNeedsAccess(true)}
                                className="text-xs font-bold text-left"
                                style={{ color: colors.accent }}
                            >
                                + Preciso que o motorista entre na origem
                            </button>
                        )}

                        {destinationAccessNotes || destinationNeedsAccess ? (
                            <div className="rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                        <Building2 size={13} style={{ color: '#ef4444' }} />
                                        Acesso no destino
                                    </span>
                                    <button
                                        onClick={() => { setDestinationNeedsAccess(false); setDestinationAccessNotes('') }}
                                        className="text-[11px] font-semibold"
                                        style={{ color: colors.textSecondary }}
                                    >
                                        Remover
                                    </button>
                                </div>
                                <textarea
                                    value={destinationAccessNotes}
                                    onChange={(e) => setDestinationAccessNotes(e.target.value)}
                                    rows={2}
                                    autoFocus
                                    placeholder="Nome pra portaria, nº do apto, código do portão..."
                                    className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                            </div>
                        ) : (
                            <button
                                onClick={() => setDestinationNeedsAccess(true)}
                                className="text-xs font-bold text-left"
                                style={{ color: colors.accent }}
                            >
                                + Preciso que o motorista entre no destino
                            </button>
                        )}
                    </div>

                    {/* Opções de rota */}
                    {loadingRoutes && (
                        <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: colors.textSecondary }}>
                            <Loader2 size={14} className="animate-spin" />
                            Calculando rotas...
                        </div>
                    )}

                    {!loadingRoutes && routes.length > 0 && (
                        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                            {routes.map((r, i) => {
                                const color = ROUTE_COLORS[i % ROUTE_COLORS.length]
                                const active = i === selectedRoute
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedRoute(i)}
                                        className="flex-shrink-0 flex flex-col items-start gap-1 px-3 py-2 rounded-xl text-left transition-all"
                                        style={
                                            active
                                                ? { background: `${color}20`, border: `2px solid ${color}` }
                                                : { background: `${colors.border}30`, border: `1px solid ${colors.border}` }
                                        }
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                            <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Rota {i + 1}</span>
                                        </div>
                                        <span className="text-[11px]" style={{ color: colors.textSecondary }}>
                                            {r.distanceKm.toFixed(1)} km · {Math.round(r.durationMin)} min
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {/* Tipo de corrida */}
                    <div className="grid grid-cols-3 gap-2 mt-4">
                        {RIDE_TYPES.map((type) => {
                            const Icon = type.icon
                            const active = rideType === type.id
                            return (
                                <button
                                    key={type.id}
                                    onClick={() => setRideType(type.id)}
                                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-bold transition-all"
                                    style={
                                        active
                                            ? { background: GRADIENT, color: '#fff' }
                                            : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                    }
                                >
                                    <Icon size={18} />
                                    {type.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Nº de passageiros — define o tipo de veículo sugerido */}
                    {rideType !== 'entregar-algo' && (
                        <div className="flex items-center justify-between gap-3 mt-4 px-4 py-3 rounded-xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                            <div className="flex items-center gap-2">
                                <Users size={16} style={{ color: colors.textSecondary }} />
                                <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>Quantas pessoas?</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setPassengerCount((n) => Math.max(1, n - 1))}
                                    disabled={passengerCount <= 1}
                                    className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="text-sm font-black w-5 text-center" style={{ color: colors.textPrimary }}>{passengerCount}</span>
                                <button
                                    onClick={() => setPassengerCount((n) => Math.min(30, n + 1))}
                                    disabled={passengerCount >= 30}
                                    className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    )}

                    {rideType !== 'entregar-algo' && passengerCount > 4 && (
                        <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `${colors.accent}15`, color: colors.accent }}>
                            <Bus size={14} />
                            Vai precisar de: {VEHICLE_TYPE_LABELS[vehicleType]}
                        </div>
                    )}

                    {selectedType.forWhomLabel && (
                        <div className="mt-3">
                            <input
                                type="text"
                                value={forWhom}
                                onChange={(e) => setForWhom(e.target.value)}
                                placeholder={selectedType.forWhomLabel}
                                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                                style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />
                        </div>
                    )}

                    {/* Destinatário — quem vai receber a entrega, se não for quem pediu */}
                    {rideType === 'entregar-algo' && (
                        <div className="flex flex-col gap-2 mt-3">
                            <div className="relative">
                                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                <input
                                    type="text"
                                    value={recipientName}
                                    onChange={(e) => setRecipientName(e.target.value)}
                                    placeholder="Nome de quem vai receber"
                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                            </div>
                            <div className="relative">
                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                <input
                                    type="tel"
                                    value={recipientPhone}
                                    onChange={(e) => setRecipientPhone(e.target.value)}
                                    placeholder="Telefone de quem vai receber"
                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                            </div>
                        </div>
                    )}

                    {showNotes ? (
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder="Algum detalhe importante?"
                            className="w-full mt-3 px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
                            style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                        />
                    ) : (
                        <button
                            onClick={() => setShowNotes(true)}
                            className="text-xs font-bold mt-3"
                            style={{ color: colors.accent }}
                        >
                            + Adicionar observação
                        </button>
                    )}

                    <button
                        onClick={() => setShowPlateReminder(true)}
                        disabled={submitting || !origin.address.trim() || !destination.address.trim()}
                        className="w-full mt-4 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                        style={{ background: GRADIENT, color: '#fff' }}
                    >
                        {submitting ? <Loader2 size={18} className="animate-spin" /> : <Car size={18} />}
                        Pedir motorista
                    </button>
                </div>
            )}
        </div>
    )
}
