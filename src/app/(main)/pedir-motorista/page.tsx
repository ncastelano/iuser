// app/(main)/pedir-motorista/page.tsx
'use client'

import { useState, useRef, useEffect, useCallback, type ElementType } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '@/lib/supabase/client'
import { useTheme, ThemeColors } from '@/app/theme'
import { toast } from 'sonner'
import { addRecentRideDestination, getRecentRideDestinations, RecentRideDestination } from '@/lib/recentRideDestinations'
import { addRecentRideOrigin, getRecentRideOrigins, RecentRideOrigin } from '@/lib/recentRideOrigins'
import { getVehicleTypeForPassengers, VEHICLE_TYPE_LABELS } from '@/lib/rideVehicle'
import { createSquareImage } from '@/lib/image'
import {
    Car,
    Users,
    Package,
    MapPin,
    MapPinPlus,
    ArrowLeft,
    Search,
    X,
    ShieldAlert,
    Minus,
    Plus,
    Building2,
    Phone,
    Bus,
    ShoppingBag,
    PackagePlus,
    Baby,
    PawPrint,
    Camera,
    ScanLine,
    User,
    History,
    Clock,
    CalendarClock,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import RideTrackingPanel from './RideTrackingPanel'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho
const ROUTE_COLOR = '#3b82f6'
const AVERAGE_SPEED_KMH = 40

type Step = 'type' | 'where' | 'details'
type RequestFor = 'pessoa' | 'objeto' | 'animal'
type ActiveField = 'origin' | 'destination' | null
type ObjectSize = 'pequeno' | 'medio' | 'grande'

interface Place {
    address: string
    coords: [number, number] | null
}

interface RouteOption {
    coords: [number, number][]
    distanceKm: number
    durationMin: number
}

const STEPS: Step[] = ['type', 'where', 'details']

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

function PhotoPicker({ preview, onPick, colors }: { preview: string | null; onPick: (file: File) => void; colors: ThemeColors }) {
    const inputRef = useRef<HTMLInputElement>(null)
    return (
        <div>
            <div
                onClick={() => inputRef.current?.click()}
                className="w-24 h-24 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                style={{ background: `${colors.border}30`, border: `1px dashed ${colors.border}` }}
            >
                {preview ? (
                    <img src={preview} className="w-full h-full object-cover" alt="" />
                ) : (
                    <Camera size={22} style={{ color: colors.textSecondary }} />
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onPick(file)
                }}
            />
        </div>
    )
}

function CounterRow({
    label, icon: Icon, value, onChange, min = 0, max = 30, colors,
}: {
    label: string
    icon: ElementType
    value: number
    onChange: (n: number) => void
    min?: number
    max?: number
    colors: ThemeColors
}) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
            <div className="flex items-center gap-2">
                <Icon size={16} style={{ color: colors.textSecondary }} />
                <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{label}</span>
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={() => onChange(Math.max(min, value - 1))}
                    disabled={value <= min}
                    className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                >
                    <Minus size={14} />
                </button>
                <span className="text-sm font-black w-5 text-center" style={{ color: colors.textPrimary }}>{value}</span>
                <button
                    onClick={() => onChange(Math.min(max, value + 1))}
                    disabled={value >= max}
                    className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                >
                    <Plus size={14} />
                </button>
            </div>
        </div>
    )
}

function toDatetimeLocalValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatScheduledFor(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 28 ? firstPart.substring(0, 26) + '...' : firstPart
}

async function fetchRoute(origin: [number, number], destination: [number, number]): Promise<RouteOption | null> {
    try {
        const res = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
        )
        const data = await res.json()
        const r = data.routes?.[0]
        if (!r) return null
        const distanceKm = r.distance / 1000
        const durationMin = (distanceKm / AVERAGE_SPEED_KMH) * 60
        return { coords: r.geometry.coordinates as [number, number][], distanceKm, durationMin }
    } catch {
        return null
    }
}

// ===== RASCUNHO DO PEDIDO (sobrevive ao redirect pro login) =====
const DRAFT_KEY = 'pedir_motorista_draft_v1'

function saveDraft(draft: Record<string, unknown>) {
    try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
        // Ignora erros de armazenamento
    }
}

function loadDraft(): Record<string, any> | null {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

function clearDraft() {
    try {
        sessionStorage.removeItem(DRAFT_KEY)
    } catch {
        // Ignora erros de armazenamento
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
    const [step, setStep] = useState<Step>('type')
    const [requestFor, setRequestFor] = useState<RequestFor | null>(null)
    const [origin, setOrigin] = useState<Place>({ address: '', coords: null })
    const [destination, setDestination] = useState<Place>({ address: '', coords: null })
    const [recentOrigins, setRecentOrigins] = useState<RecentRideOrigin[]>([])
    const [recentDestinations, setRecentDestinations] = useState<RecentRideDestination[]>([])
    const [activeField, setActiveField] = useState<ActiveField>(null)
    const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([])
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([])
    const [searching, setSearching] = useState(false)
    const [locatingOrigin, setLocatingOrigin] = useState(false)
    const [route, setRoute] = useState<RouteOption | null>(null)
    const [loadingRoutes, setLoadingRoutes] = useState(false)
    const [notes, setNotes] = useState('')
    const [showNotes, setShowNotes] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // ===== AGENDAMENTO: agora ou pra depois =====
    const [scheduledFor, setScheduledFor] = useState<string>('') // valor cru do <input type="datetime-local">
    const isScheduled = scheduledFor.trim().length > 0
    const [showPlateReminder, setShowPlateReminder] = useState(false)

    // ===== PEDIDO EM ANDAMENTO (permanece nessa página até concluir/cancelar) =====
    const [activeRideId, setActiveRideId] = useState<string | null>(null)
    const [checkingActiveRide, setCheckingActiveRide] = useState(true)

    // ===== ADICIONAIS: PESSOA (além de quem pediu) — cada item é um contador,
    // 0 significa que não tem esse adicional =====
    const [extraPeopleCount, setExtraPeopleCount] = useState(0)
    const [childrenCount, setChildrenCount] = useState(0)
    const [childAge, setChildAge] = useState('')
    const [childNeedsCarSeat, setChildNeedsCarSeat] = useState<boolean | null>(null)
    const [bagCount, setBagCount] = useState(0)
    const [extraObjectCount, setExtraObjectCount] = useState(0)
    const [extraObjectDescription, setExtraObjectDescription] = useState('')
    const [extraObjectPhotoFile, setExtraObjectPhotoFile] = useState<File | null>(null)
    const [extraObjectPhotoPreview, setExtraObjectPhotoPreview] = useState<string | null>(null)
    const [petCount, setPetCount] = useState(0)
    const [petDescription, setPetDescription] = useState('')
    const [petPhotoFile, setPetPhotoFile] = useState<File | null>(null)
    const [petPhotoPreview, setPetPhotoPreview] = useState<string | null>(null)
    const hasChild = childrenCount > 0
    const hasShopping = bagCount > 0
    const hasExtraObject = extraObjectCount > 0
    const hasPet = petCount > 0

    // ===== DETALHES: OBJETO =====
    const [objectDescription, setObjectDescription] = useState('')
    const [objectIsSensitive, setObjectIsSensitive] = useState(false)
    const [objectSize, setObjectSize] = useState<ObjectSize | null>(null)
    const [objectPhotoFile, setObjectPhotoFile] = useState<File | null>(null)
    const [objectPhotoPreview, setObjectPhotoPreview] = useState<string | null>(null)
    const [senderName, setSenderName] = useState('')
    const [senderWhatsapp, setSenderWhatsapp] = useState('')
    const [recipientName, setRecipientName] = useState('')
    const [recipientWhatsapp, setRecipientWhatsapp] = useState('')

    // ===== ACESSO AO LOCAL =====
    const [originNeedsAccess, setOriginNeedsAccess] = useState(false)
    const [originAccessNotes, setOriginAccessNotes] = useState('')
    const [destinationNeedsAccess, setDestinationNeedsAccess] = useState(false)
    const [destinationAccessNotes, setDestinationAccessNotes] = useState('')

    // ===== NECESSIDADE ESPECIAL =====
    const [hasSpecialNeeds, setHasSpecialNeeds] = useState(false)
    const [specialNeedsDescription, setSpecialNeedsDescription] = useState('')

    const totalPeople = 1 + extraPeopleCount + childrenCount
    const vehicleType = getVehicleTypeForPassengers(totalPeople)
    const stepIndex = STEPS.indexOf(step)

    // ===== PREVIEW DAS FOTOS =====
    useEffect(() => {
        if (!objectPhotoFile) return
        const url = URL.createObjectURL(objectPhotoFile)
        setObjectPhotoPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [objectPhotoFile])

    useEffect(() => {
        if (!extraObjectPhotoFile) return
        const url = URL.createObjectURL(extraObjectPhotoFile)
        setExtraObjectPhotoPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [extraObjectPhotoFile])

    useEffect(() => {
        if (!petPhotoFile) return
        const url = URL.createObjectURL(petPhotoFile)
        setPetPhotoPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [petPhotoFile])

    const handlePhotoPick = async (file: File, setFile: (f: File) => void) => {
        try {
            const squareFile = await createSquareImage(file, 500)
            setFile(squareFile)
        } catch {
            toast.error('Erro ao processar imagem')
        }
    }

    // ===== LOCAIS RECENTES (pra selecionar direto na etapa de endereço) =====
    useEffect(() => {
        setRecentOrigins(getRecentRideOrigins())
        setRecentDestinations(getRecentRideDestinations())
    }, [])

    // ===== SE JÁ HOUVER UM PEDIDO EM ANDAMENTO, VOLTA DIRETO PRO ACOMPANHAMENTO =====
    useEffect(() => {
        const checkActiveRide = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setCheckingActiveRide(false)
                return
            }
            const { data } = await supabase
                .from('ride_requests')
                .select('id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng')
                .eq('requester_id', user.id)
                .in('status', ['pending', 'accepted'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (data) {
                setActiveRideId(data.id)
                // O fluxo normal (etapas type/where/details) já deixa origin/destination
                // preenchidos: isso só é necessário quando a página é recarregada direto
                // num pedido já em andamento — sem isso o mapa fica sem os marcadores
                // de partida/chegada e sem o trajeto da corrida.
                if (data.origin_lat != null && data.origin_lng != null) {
                    setOrigin({ address: data.origin_address, coords: [data.origin_lng, data.origin_lat] })
                }
                if (data.destination_lat != null && data.destination_lng != null) {
                    setDestination({ address: data.destination_address, coords: [data.destination_lng, data.destination_lat] })
                }
            }
            setCheckingActiveRide(false)
        }
        checkActiveRide()
    }, [])

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
        if (mapReady && !origin.address) useMyLocationAsOrigin()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, useMyLocationAsOrigin])

    // ===== TIPO E DESTINO VINDOS DE UM ATALHO (?tipo=, ?destino=, ?lat=, ?lng=) =====
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const tipo = params.get('tipo')
        if (tipo === 'pessoa' || tipo === 'objeto') {
            setRequestFor(tipo)
            setStep('where')
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

    // ===== RESTAURA O RASCUNHO SE VOLTOU DE UM LOGIN =====
    useEffect(() => {
        const draft = loadDraft()
        if (!draft) return
        clearDraft()

        if (draft.step) setStep(draft.step)
        if (draft.requestFor) setRequestFor(draft.requestFor)
        if (draft.origin) setOrigin(draft.origin)
        if (draft.destination) setDestination(draft.destination)
        if (typeof draft.notes === 'string') setNotes(draft.notes)
        if (typeof draft.scheduledFor === 'string') setScheduledFor(draft.scheduledFor)
        if (typeof draft.extraPeopleCount === 'number') setExtraPeopleCount(draft.extraPeopleCount)
        if (typeof draft.childrenCount === 'number') setChildrenCount(draft.childrenCount)
        if (typeof draft.childAge === 'string') setChildAge(draft.childAge)
        if (draft.childNeedsCarSeat !== undefined) setChildNeedsCarSeat(draft.childNeedsCarSeat)
        if (typeof draft.bagCount === 'number') setBagCount(draft.bagCount)
        if (typeof draft.extraObjectCount === 'number') setExtraObjectCount(draft.extraObjectCount)
        if (typeof draft.extraObjectDescription === 'string') setExtraObjectDescription(draft.extraObjectDescription)
        if (typeof draft.petCount === 'number') setPetCount(draft.petCount)
        if (typeof draft.petDescription === 'string') setPetDescription(draft.petDescription)
        if (typeof draft.hasSpecialNeeds === 'boolean') setHasSpecialNeeds(draft.hasSpecialNeeds)
        if (typeof draft.specialNeedsDescription === 'string') setSpecialNeedsDescription(draft.specialNeedsDescription)
        if (typeof draft.objectDescription === 'string') setObjectDescription(draft.objectDescription)
        if (typeof draft.objectIsSensitive === 'boolean') setObjectIsSensitive(draft.objectIsSensitive)
        if (draft.objectSize !== undefined) setObjectSize(draft.objectSize)
        if (typeof draft.senderName === 'string') setSenderName(draft.senderName)
        if (typeof draft.senderWhatsapp === 'string') setSenderWhatsapp(draft.senderWhatsapp)
        if (typeof draft.recipientName === 'string') setRecipientName(draft.recipientName)
        if (typeof draft.recipientWhatsapp === 'string') setRecipientWhatsapp(draft.recipientWhatsapp)
        if (typeof draft.originNeedsAccess === 'boolean') setOriginNeedsAccess(draft.originNeedsAccess)
        if (typeof draft.originAccessNotes === 'string') setOriginAccessNotes(draft.originAccessNotes)
        if (typeof draft.destinationNeedsAccess === 'boolean') setDestinationNeedsAccess(draft.destinationNeedsAccess)
        if (typeof draft.destinationAccessNotes === 'string') setDestinationAccessNotes(draft.destinationAccessNotes)

        toast.info('Continuando de onde você parou.')
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
            const routeInfo = route ? `<div style="background:#fff;color:#ef4444;font-size:10px;font-weight:800;padding:1px 7px;border-radius:9999px;margin-bottom:3px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);">${route.distanceKm.toFixed(1)} km · ${Math.round(route.durationMin)} min</div>` : ''
            const el = document.createElement('div')
            el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
            el.innerHTML = `
                <div style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">Chegada</div>
                ${routeInfo}
                <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="1.5"><path d="M12 22s8-7.58 8-13a8 8 0 1 0-16 0c0 5.42 8 13 8 13z"/></svg>
            `
            destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(destination.coords).addTo(map)
        }

        if (origin.coords && destination.coords && !route) {
            const bounds = new mapboxgl.LngLatBounds(origin.coords, origin.coords)
            bounds.extend(destination.coords)
            map.fitBounds(bounds, { padding: 100, duration: 800 })
        }
    }, [mapReady, origin.coords, destination.coords, route])

    // ===== BUSCA DA ROTA (uma só, sem alternativas) =====
    useEffect(() => {
        if (!origin.coords || !destination.coords) {
            setRoute(null)
            return
        }

        let cancelled = false
        setLoadingRoutes(true)
        fetchRoute(origin.coords, destination.coords).then((result) => {
            if (cancelled) return
            setRoute(result)
            setLoadingRoutes(false)
        })

        return () => {
            cancelled = true
        }
    }, [origin.coords, destination.coords])

    // ===== DESENHA A ROTA NO MAPA =====
    useEffect(() => {
        if (!mapReady || !mapRef.current) return
        const map = mapRef.current
        const layerId = 'route-line'
        const sourceId = 'route-source'

        if (map.getLayer(layerId)) map.removeLayer(layerId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)

        if (route) {
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
                    'line-color': ROUTE_COLOR,
                    'line-width': 5,
                    'line-opacity': 0.9,
                },
            })

            const bounds = route.coords.reduce(
                (b, c) => b.extend(c),
                new mapboxgl.LngLatBounds(route.coords[0], route.coords[0])
            )
            map.fitBounds(bounds, { padding: 80, duration: 500 })
        }
    }, [mapReady, route])

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
        if (field === 'origin') {
            setOrigin(place)
            addRecentRideOrigin(place)
            setRecentOrigins(getRecentRideOrigins())
        } else {
            setDestination(place)
            addRecentRideDestination(place)
            setRecentDestinations(getRecentRideDestinations())
        }
        setSuggestions([])
        setActiveField(null)
    }

    const selectRecentOrigin = (place: RecentRideOrigin) => {
        setOrigin({ address: place.address, coords: place.coords })
        addRecentRideOrigin(place)
        setRecentOrigins(getRecentRideOrigins())
    }

    const selectRecentDestination = (place: RecentRideDestination) => {
        setDestination({ address: place.address, coords: place.coords })
        addRecentRideDestination(place)
        setRecentDestinations(getRecentRideDestinations())
    }

    // ===== NAVEGAÇÃO DAS SUGESTÕES PELO TECLADO =====
    useEffect(() => {
        setHighlightedIndex(-1)
    }, [suggestions])

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!activeField || suggestions.length === 0) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIndex((i) => {
                const next = i < suggestions.length - 1 ? i + 1 : 0
                suggestionRefs.current[next]?.scrollIntoView({ block: 'nearest' })
                return next
            })
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIndex((i) => {
                const next = i > 0 ? i - 1 : suggestions.length - 1
                suggestionRefs.current[next]?.scrollIntoView({ block: 'nearest' })
                return next
            })
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault()
            selectSuggestion(activeField, suggestions[highlightedIndex])
        }
    }

    // ===== NAVEGAÇÃO ENTRE ETAPAS =====
    const handleSelectType = (type: RequestFor) => {
        setRequestFor(type)
        setStep('where')
    }

    const handleBack = () => {
        if (step === 'details') setStep('where')
        else if (step === 'where') setStep('type')
        else router.push('/')
    }

    const handleRequestConfirm = () => {
        if (!origin.address.trim() || !destination.address.trim()) {
            toast.error('Preencha o endereço de origem e destino')
            return
        }
        if (requestFor === 'objeto' && !objectPhotoFile) {
            toast.error('Adicione uma foto do objeto para continuar')
            return
        }
        if (requestFor === 'animal' && !petPhotoFile) {
            toast.error('Adicione uma foto do animal para continuar')
            return
        }
        if (requestFor === 'pessoa' && hasExtraObject && !extraObjectPhotoFile) {
            toast.error('Adicione uma foto do objeto para continuar')
            return
        }
        if (isScheduled && new Date(scheduledFor).getTime() <= Date.now()) {
            toast.error('Escolha uma data e horário no futuro')
            return
        }
        setShowPlateReminder(true)
    }

    // ===== RESUMO EM LINHAS (rótulo: valor) DO QUE ESTÁ SENDO PEDIDO =====
    const orderSummaryRows: { label: string; value: string }[] = (() => {
        if (!requestFor) return []
        const from = origin.address ? shortAddress(origin.address) : 'um local'
        const to = destination.address ? shortAddress(destination.address) : 'outro local'
        const rows: { label: string; value: string }[] = []

        if (requestFor === 'pessoa') {
            const adults = 1 + extraPeopleCount
            const adultsText = adults === 1 ? '1 adulto' : `${adults} adultos`
            const peopleText = hasChild ? adultsText : (totalPeople === 1 ? 'uma pessoa' : `${totalPeople} pessoas`)
            rows.push({ label: 'Pedido', value: `levar ${peopleText}` })
            if (hasChild) {
                const countText = childrenCount === 1 ? '1 criança' : `${childrenCount} crianças`
                const ageRaw = childAge.trim()
                const ageText = ageRaw ? ` de ${ageRaw}${/anos?\b/i.test(ageRaw) ? '' : ' anos'}` : ''
                const carSeatText =
                    childNeedsCarSeat === true ? ', precisa de cadeirinha' :
                        childNeedsCarSeat === false ? ', não precisa de cadeirinha' : ''
                rows.push({ label: 'Criança', value: `${countText}${ageText}${carSeatText}` })
            }
            rows.push({ label: 'De', value: from })
            rows.push({ label: 'Para', value: to })
            if (hasShopping) {
                rows.push({ label: 'Compras', value: `de mercado (${bagCount} ${bagCount === 1 ? 'sacola' : 'sacolas'})` })
            }
            if (hasExtraObject) rows.push({ label: 'Objeto', value: extraObjectDescription || 'não especificado' })
            if (hasPet) rows.push({ label: 'Pet', value: petDescription || 'não especificado' })
        } else if (requestFor === 'animal') {
            rows.push({ label: 'Pedido', value: 'levar um animal' })
            rows.push({ label: 'Animal', value: petDescription || 'não especificado' })
            rows.push({ label: 'De', value: from })
            rows.push({ label: 'Para', value: to })
            if (recipientName) rows.push({ label: 'Entregar a', value: recipientName })
        } else {
            rows.push({ label: 'Pedido', value: 'buscar e entregar um objeto' })
            rows.push({ label: 'Objeto', value: objectDescription || 'não especificado' })
            rows.push({ label: 'De', value: from })
            rows.push({ label: 'Para', value: to })
            if (recipientName) rows.push({ label: 'Entregar a', value: recipientName })
        }

        rows.push({ label: 'Quando', value: isScheduled ? formatScheduledFor(new Date(scheduledFor).toISOString()) : 'Agora' })

        return rows
    })()

    const uploadRidePhoto = async (userId: string, file: File): Promise<string | null> => {
        const fileExt = file.name.split('.').pop()
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`
        const { data, error: uploadError } = await supabase.storage.from('ride-object-photos').upload(fileName, file)
        if (uploadError) throw uploadError
        if (!data) return null
        return supabase.storage.from('ride-object-photos').getPublicUrl(data.path).data.publicUrl
    }

    const handleSubmit = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            saveDraft({
                step, requestFor, origin, destination, notes, scheduledFor,
                extraPeopleCount, childrenCount, childAge, childNeedsCarSeat, bagCount,
                extraObjectCount, extraObjectDescription,
                petCount, petDescription,
                objectDescription, objectIsSensitive, objectSize,
                senderName, senderWhatsapp, recipientName, recipientWhatsapp,
                originNeedsAccess, originAccessNotes, destinationNeedsAccess, destinationAccessNotes,
                hasSpecialNeeds, specialNeedsDescription,
            })
            router.push(`/login?redirect=${encodeURIComponent('/pedir-motorista')}`)
            return
        }
        if (!origin.address.trim() || !destination.address.trim()) {
            toast.error('Preencha o endereço de origem e destino')
            return
        }

        setSubmitting(true)
        try {
            const objectPhotoUrl = requestFor === 'objeto' && objectPhotoFile ? await uploadRidePhoto(user.id, objectPhotoFile) : null
            const extraObjectPhotoUrl = requestFor === 'pessoa' && hasExtraObject && extraObjectPhotoFile ? await uploadRidePhoto(user.id, extraObjectPhotoFile) : null
            const petPhotoUrl =
                ((requestFor === 'pessoa' && hasPet) || requestFor === 'animal') && petPhotoFile
                    ? await uploadRidePhoto(user.id, petPhotoFile)
                    : null

            const { data: insertedRide, error } = await supabase.from('ride_requests').insert({
                requester_id: user.id,
                ride_type: requestFor,
                origin_address: origin.address.trim(),
                destination_address: destination.address.trim(),
                notes: notes.trim() || null,
                origin_needs_access: originNeedsAccess,
                origin_access_notes: originNeedsAccess ? originAccessNotes.trim() || null : null,
                destination_needs_access: destinationNeedsAccess,
                destination_access_notes: destinationNeedsAccess ? destinationAccessNotes.trim() || null : null,
                passenger_count: requestFor === 'pessoa' ? totalPeople : 1,
                vehicle_type: requestFor === 'pessoa' ? vehicleType : 'carro',
                has_child: requestFor === 'pessoa' ? hasChild : false,
                children_count: requestFor === 'pessoa' && hasChild ? childrenCount : null,
                child_age: requestFor === 'pessoa' && hasChild && childAge.trim() ? childAge.trim() : null,
                child_needs_car_seat: requestFor === 'pessoa' && hasChild ? childNeedsCarSeat : null,
                has_shopping: requestFor === 'pessoa' ? hasShopping : false,
                is_grocery_shopping: requestFor === 'pessoa' && hasShopping ? true : null,
                bag_count: requestFor === 'pessoa' && hasShopping ? bagCount : null,
                has_extra_object: requestFor === 'pessoa' ? hasExtraObject : false,
                extra_object_count: requestFor === 'pessoa' && hasExtraObject ? extraObjectCount : null,
                extra_object_description: requestFor === 'pessoa' && hasExtraObject ? extraObjectDescription.trim() || null : null,
                extra_object_photo_url: extraObjectPhotoUrl,
                has_pet: requestFor === 'pessoa' ? hasPet : false,
                pet_count: requestFor === 'pessoa' && hasPet ? petCount : null,
                pet_description: ((requestFor === 'pessoa' && hasPet) || requestFor === 'animal') ? petDescription.trim() || null : null,
                pet_photo_url: petPhotoUrl,
                object_description: requestFor === 'objeto' ? objectDescription.trim() || null : null,
                object_is_sensitive: requestFor === 'objeto' ? objectIsSensitive : false,
                object_size: requestFor === 'pessoa' ? (hasExtraObject ? objectSize : null) : objectSize,
                object_photo_url: objectPhotoUrl,
                sender_name: (requestFor === 'objeto' || requestFor === 'animal') ? senderName.trim() || null : null,
                sender_whatsapp: (requestFor === 'objeto' || requestFor === 'animal') ? senderWhatsapp.trim() || null : null,
                recipient_name: (requestFor === 'objeto' || requestFor === 'animal') ? recipientName.trim() || null : null,
                recipient_whatsapp: (requestFor === 'objeto' || requestFor === 'animal') ? recipientWhatsapp.trim() || null : null,
                has_special_needs: hasSpecialNeeds,
                special_needs_description: hasSpecialNeeds ? specialNeedsDescription.trim() || null : null,
                origin_lat: origin.coords ? origin.coords[1] : null,
                origin_lng: origin.coords ? origin.coords[0] : null,
                destination_lat: destination.coords ? destination.coords[1] : null,
                destination_lng: destination.coords ? destination.coords[0] : null,
                distance_km: route?.distanceKm ?? null,
                duration_min: route?.durationMin ?? null,
                scheduled_for: isScheduled ? new Date(scheduledFor).toISOString() : null,
            }).select('id').single()

            if (error) throw error
            clearDraft()
            setActiveRideId(insertedRide.id)
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
                onClick={handleBack}
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
                                onKeyDown={handleSearchKeyDown}
                                placeholder={activeField === 'origin' ? 'De onde você vai sair?' : 'Local de chegada'}
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
                                {locatingOrigin ? <Spinner size={16} /> : <MapPinPlus size={16} />}
                            </div>
                            <span className="text-sm font-bold" style={{ color: colors.accent }}>Usar minha localização atual</span>
                        </button>
                    )}

                    {searching && (
                        <div className="flex justify-center py-6">
                            <Spinner size={20} color={colors.textSecondary} />
                        </div>
                    )}

                    <div className="overflow-y-auto">
                        {suggestions.map((s, idx) => {
                            const isHighlighted = idx === highlightedIndex
                            return (
                                <button
                                    key={idx}
                                    ref={(el) => { suggestionRefs.current[idx] = el }}
                                    onClick={() => selectSuggestion(activeField, s)}
                                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/5"
                                    style={{
                                        borderBottom: `1px solid ${colors.border}`,
                                        background: isHighlighted ? `${colors.accent}15` : undefined,
                                    }}
                                >
                                    <MapPin size={16} className="mt-0.5 flex-shrink-0" style={{ color: isHighlighted ? colors.accent : colors.textSecondary }} />
                                    <span className="text-sm font-semibold" style={{ color: isHighlighted ? colors.accent : colors.textPrimary }}>{s.place_name}</span>
                                </button>
                            )
                        })}
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
                        <div className="w-full rounded-xl px-4 py-3 text-left flex flex-col gap-1" style={{ background: `${colors.border}30` }}>
                            {orderSummaryRows.map((row) => (
                                <p key={row.label} className="text-sm" style={{ color: colors.textPrimary }}>
                                    <span className="font-black">{row.label}:</span> {row.value}
                                </p>
                            ))}
                        </div>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                            Sua localização enviada ao motorista é aproximada. Ao encontrar o carro, sempre confira a <strong>placa</strong> e a <strong>cor</strong> do veículo para ter certeza de que é o motorista certo.
                        </p>
                        <button
                            onClick={() => { setShowPlateReminder(false); handleSubmit() }}
                            disabled={submitting}
                            className="mt-2 w-full py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: GRADIENT, color: '#fff' }}
                        >
                            {submitting ? <Spinner size={18} /> : <Car size={18} />}
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

            {/* Acompanhamento do pedido em andamento — fica nessa página até concluir/cancelar */}
            {!activeField && activeRideId && (
                <div
                    className="absolute bottom-0 inset-x-0 z-20 rounded-t-3xl px-5 pt-4 pb-8 max-h-[75vh] overflow-y-auto"
                    style={{ background: colors.surface, boxShadow: '0 -8px 30px rgba(0,0,0,0.35)' }}
                >
                    <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: colors.border }} />
                    <RideTrackingPanel rideId={activeRideId} onExit={() => setActiveRideId(null)} map={mapRef.current} mapReady={mapReady} />
                </div>
            )}

            {checkingActiveRide && (
                <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: `${colors.background}80` }}>
                    <Spinner size={24} color={colors.textSecondary} />
                </div>
            )}

            {/* Bottom sheet estilo Uber, por etapas */}
            {!activeField && !activeRideId && !checkingActiveRide && (
                <div
                    className="absolute bottom-0 inset-x-0 z-20 rounded-t-3xl px-5 pt-4 pb-8 max-h-[75vh] overflow-y-auto"
                    style={{ background: colors.surface, boxShadow: '0 -8px 30px rgba(0,0,0,0.35)' }}
                >
                    <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: colors.border }} />

                    {/* Indicador de progresso das etapas */}
                    <div className="flex items-center gap-1.5 justify-center mb-4">
                        {STEPS.map((s, i) => (
                            <div
                                key={s}
                                className="h-1.5 rounded-full transition-all duration-300"
                                style={{
                                    width: i === stepIndex ? 26 : 8,
                                    background: i <= stepIndex ? GRADIENT : colors.border,
                                }}
                            />
                        ))}
                    </div>

                    {/* ===== ETAPA 1: PESSOA OU OBJETO ===== */}
                    {step === 'type' && (
                        <>
                            <h2 className="text-lg font-black mb-1" style={{ color: colors.textPrimary }}>Para que você quer o motorista?</h2>
                            <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>Escolha uma opção pra começar</p>

                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => handleSelectType('pessoa')}
                                    className="flex flex-col items-center gap-2 py-5 px-2 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                                >
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                        <Users size={22} />
                                    </div>
                                    <span className="text-xs font-black" style={{ color: colors.textPrimary }}>Pessoa</span>
                                    <span className="text-[10px] text-center leading-tight" style={{ color: colors.textSecondary }}>
                                        Te levar, buscar alguém, ou os dois
                                    </span>
                                </button>

                                <button
                                    onClick={() => handleSelectType('animal')}
                                    className="flex flex-col items-center gap-2 py-5 px-2 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                                >
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                        <PawPrint size={22} />
                                    </div>
                                    <span className="text-xs font-black" style={{ color: colors.textPrimary }}>Animal</span>
                                    <span className="text-[10px] text-center leading-tight" style={{ color: colors.textSecondary }}>
                                        Levar só o bicho, sem você junto
                                    </span>
                                </button>

                                <button
                                    onClick={() => handleSelectType('objeto')}
                                    className="flex flex-col items-center gap-2 py-5 px-2 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                                >
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                        <Package size={22} />
                                    </div>
                                    <span className="text-xs font-black" style={{ color: colors.textPrimary }}>Objeto</span>
                                    <span className="text-[10px] text-center leading-tight" style={{ color: colors.textSecondary }}>
                                        Buscar ou entregar algo
                                    </span>
                                </button>
                            </div>
                        </>
                    )}

                    {/* ===== ETAPA 2: ENDEREÇOS ===== */}
                    {step === 'where' && (
                        <>
                            {/* Local de início */}
                            <h2 className="text-lg font-black mb-3" style={{ color: colors.textPrimary }}>Qual local para iniciar a corrida?</h2>
                            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ border: `1px solid ${colors.border}` }}>
                                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#22c55e' }} />
                                <input
                                    readOnly
                                    onClick={() => openField('origin')}
                                    value={locatingOrigin ? 'Localizando...' : origin.address}
                                    placeholder="Local de início"
                                    className="flex-1 bg-transparent text-sm focus:outline-none cursor-pointer"
                                    style={inputStyle}
                                />
                                <button onClick={() => useMyLocationAsOrigin(true)} className="flex-shrink-0" style={{ color: colors.accent }}>
                                    {locatingOrigin ? <Spinner size={16} /> : <MapPinPlus size={16} />}
                                </button>
                            </div>

                            {/* Locais de partida já usados */}
                            {recentOrigins.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
                                    {recentOrigins.map((place) => (
                                        <button
                                            key={place.address}
                                            onClick={() => selectRecentOrigin(place)}
                                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                                            style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                        >
                                            <History size={12} style={{ color: '#22c55e' }} />
                                            {shortAddress(place.address)}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Local de chegada */}
                            <h2 className="text-lg font-black mb-3 mt-4" style={{ color: colors.textPrimary }}>Para onde quer ir?</h2>
                            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ border: `1px solid ${colors.border}` }}>
                                <MapPin size={14} className="flex-shrink-0" style={{ color: '#ef4444' }} />
                                <input
                                    readOnly
                                    onClick={() => openField('destination')}
                                    value={destination.address}
                                    placeholder="Local de chegada"
                                    className="flex-1 bg-transparent text-sm focus:outline-none cursor-pointer"
                                    style={inputStyle}
                                />
                            </div>

                            {/* Locais de chegada já usados */}
                            {recentDestinations.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
                                    {recentDestinations.map((place) => (
                                        <button
                                            key={place.address}
                                            onClick={() => selectRecentDestination(place)}
                                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                                            style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                        >
                                            <History size={12} style={{ color: '#ef4444' }} />
                                            {shortAddress(place.address)}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Condomínio fechado — precisa de nº/apto/quadra pra achar? */}
                            <div className="flex flex-col gap-2 mt-3">
                                <div className="rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                            <Building2 size={13} style={{ color: '#22c55e' }} />
                                            Estou esperando dentro do condomínio
                                        </span>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <button
                                                onClick={() => setOriginNeedsAccess(true)}
                                                className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                                style={originNeedsAccess ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                            >
                                                SIM
                                            </button>
                                            <button
                                                onClick={() => { setOriginNeedsAccess(false); setOriginAccessNotes('') }}
                                                className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                                style={!originNeedsAccess ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                            >
                                                NÃO
                                            </button>
                                        </div>
                                    </div>
                                    {originNeedsAccess && (
                                        <input
                                            type="text"
                                            value={originAccessNotes}
                                            onChange={(e) => setOriginAccessNotes(e.target.value)}
                                            autoFocus
                                            placeholder="Número da rua, apartamento ou quadra..."
                                            className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                        />
                                    )}
                                </div>

                                <div className="rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                            <Building2 size={13} style={{ color: '#ef4444' }} />
                                            Me deixa dentro do condomínio
                                        </span>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <button
                                                onClick={() => setDestinationNeedsAccess(true)}
                                                className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                                style={destinationNeedsAccess ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                            >
                                                SIM
                                            </button>
                                            <button
                                                onClick={() => { setDestinationNeedsAccess(false); setDestinationAccessNotes('') }}
                                                className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                                style={!destinationNeedsAccess ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                            >
                                                NÃO
                                            </button>
                                        </div>
                                    </div>
                                    {destinationNeedsAccess && (
                                        <input
                                            type="text"
                                            value={destinationAccessNotes}
                                            onChange={(e) => setDestinationAccessNotes(e.target.value)}
                                            autoFocus
                                            placeholder="Número da rua, apartamento ou quadra..."
                                            className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Rota (uma só, sem alternativas) — a distância/tempo aparece no mapa, no marcador de chegada */}
                            {loadingRoutes && (
                                <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: colors.textSecondary }}>
                                    <Spinner size={14} />
                                    Calculando rota...
                                </div>
                            )}

                            {/* Necessidade especial */}
                            <div className="rounded-xl px-3 py-2.5 mt-3" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                        <ShieldAlert size={13} style={{ color: colors.accent }} />
                                        Portador de necessidade especial?
                                    </span>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => setHasSpecialNeeds(true)}
                                            className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                            style={hasSpecialNeeds ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            SIM
                                        </button>
                                        <button
                                            onClick={() => { setHasSpecialNeeds(false); setSpecialNeedsDescription('') }}
                                            className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                            style={!hasSpecialNeeds ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            NÃO
                                        </button>
                                    </div>
                                </div>
                                {hasSpecialNeeds && (
                                    <input
                                        type="text"
                                        value={specialNeedsDescription}
                                        onChange={(e) => setSpecialNeedsDescription(e.target.value)}
                                        autoFocus
                                        placeholder="Qual necessidade especial?"
                                        className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />
                                )}
                            </div>

                            {/* Agora ou agendar pra depois */}
                            <div className="rounded-xl px-3 py-2.5 mt-3" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                        <CalendarClock size={13} style={{ color: colors.accent }} />
                                        Quando?
                                    </span>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => setScheduledFor('')}
                                            className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                            style={!isScheduled ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            AGORA
                                        </button>
                                        <button
                                            onClick={() => setScheduledFor((v) => v || toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)))}
                                            className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                            style={isScheduled ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            AGENDAR
                                        </button>
                                    </div>
                                </div>
                                {isScheduled && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <Clock size={14} className="flex-shrink-0" style={{ color: colors.textSecondary }} />
                                        <input
                                            type="datetime-local"
                                            value={scheduledFor}
                                            min={toDatetimeLocalValue(new Date(Date.now() + 30 * 60 * 1000))}
                                            onChange={(e) => setScheduledFor(e.target.value)}
                                            className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 mt-4">
                                <button
                                    onClick={() => setStep('type')}
                                    className="py-3.5 px-5 rounded-xl font-black uppercase text-sm tracking-wider transition-all active:scale-95"
                                    style={{ background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={() => setStep('details')}
                                    disabled={!origin.address.trim() || !destination.address.trim()}
                                    className="flex-1 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    Continuar
                                </button>
                            </div>
                        </>
                    )}

                    {/* ===== ETAPA 3: DETALHES ===== */}
                    {step === 'details' && requestFor && (
                        <>
                            <h2 className="text-lg font-black mb-3" style={{ color: colors.textPrimary }}>
                                {requestFor === 'pessoa' ? 'Detalhes da corrida' : requestFor === 'animal' ? 'Mais sobre o animal' : 'Mais sobre o objeto'}
                            </h2>

                            {requestFor === 'pessoa' ? (
                                <>
                                    {/* Cada adicional é um contador — 0 significa que não tem esse adicional */}
                                    <div className="flex flex-col gap-2">
                                        <CounterRow
                                            label="Quantas adultos a mais?"
                                            icon={Users}
                                            value={extraPeopleCount}
                                            onChange={setExtraPeopleCount}
                                            max={29}
                                            colors={colors}
                                        />

                                        {totalPeople > 4 && (
                                            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `${colors.accent}15`, color: colors.accent }}>
                                                <Bus size={14} />
                                                Vai precisar de: {VEHICLE_TYPE_LABELS[vehicleType]}
                                            </div>
                                        )}

                                        <CounterRow label="Criança" icon={Baby} value={childrenCount} onChange={setChildrenCount} max={10} colors={colors} />
                                        {hasChild && (
                                            <div className="rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                                <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textPrimary }}>
                                                    {childrenCount === 1 ? 'Idade da criança' : 'Idades das crianças'}
                                                </span>
                                                <input
                                                    type="text"
                                                    value={childAge}
                                                    onChange={(e) => setChildAge(e.target.value)}
                                                    autoFocus
                                                    placeholder={childrenCount === 1 ? 'Ex: 5 anos' : 'Ex: 5 e 8 anos'}
                                                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                                <div className="flex items-center justify-between gap-2 flex-wrap mt-3">
                                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>Precisa de cadeirinha?</span>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <button
                                                            onClick={() => setChildNeedsCarSeat(true)}
                                                            className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                                            style={childNeedsCarSeat === true ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                        >
                                                            SIM
                                                        </button>
                                                        <button
                                                            onClick={() => setChildNeedsCarSeat(false)}
                                                            className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                                            style={childNeedsCarSeat === false ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                        >
                                                            NÃO
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <CounterRow label="Compras de mercado" icon={ShoppingBag} value={bagCount} onChange={setBagCount} max={20} colors={colors} />

                                        <CounterRow label="Objeto" icon={PackagePlus} value={extraObjectCount} onChange={setExtraObjectCount} max={10} colors={colors} />
                                        {hasExtraObject && (
                                            <div className="rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                                <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Tamanho do objeto</span>
                                                <div className="flex gap-2 mb-2">
                                                    {(['pequeno', 'medio', 'grande'] as ObjectSize[]).map((size) => {
                                                        const active = objectSize === size
                                                        const label = size === 'pequeno' ? 'Pequeno' : size === 'medio' ? 'Médio' : 'Grande'
                                                        return (
                                                            <button
                                                                key={size}
                                                                onClick={() => setObjectSize(size)}
                                                                className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                                                                style={
                                                                    active
                                                                        ? { background: GRADIENT, color: '#fff' }
                                                                        : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                                }
                                                            >
                                                                {label}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={extraObjectDescription}
                                                    onChange={(e) => setExtraObjectDescription(e.target.value)}
                                                    placeholder="Ex: mochila, caixa, mala..."
                                                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                                <div className="mt-2">
                                                    <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>
                                                        Foto do objeto <span style={{ color: '#ef4444' }}>*</span>
                                                    </span>
                                                    <PhotoPicker
                                                        preview={extraObjectPhotoPreview}
                                                        onPick={(file) => handlePhotoPick(file, setExtraObjectPhotoFile)}
                                                        colors={colors}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <CounterRow label="Pet" icon={PawPrint} value={petCount} onChange={setPetCount} max={10} colors={colors} />
                                        {hasPet && (
                                            <div className="rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                                <span className="text-xs font-bold block mb-2" style={{ color: colors.textPrimary }}>Qual é o animal?</span>
                                                <input
                                                    type="text"
                                                    value={petDescription}
                                                    onChange={(e) => setPetDescription(e.target.value)}
                                                    placeholder="Ex: cachorro pequeno, gato..."
                                                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                                <div className="mt-2">
                                                    <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Foto do animal</span>
                                                    <PhotoPicker
                                                        preview={petPhotoPreview}
                                                        onPick={(file) => handlePhotoPick(file, setPetPhotoFile)}
                                                        colors={colors}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : requestFor === 'animal' ? (
                                <>
                                    <input
                                        type="text"
                                        value={petDescription}
                                        onChange={(e) => setPetDescription(e.target.value)}
                                        placeholder="Qual é o animal? Ex: cachorro pequeno, gato..."
                                        className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />

                                    <div className="mt-3">
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Porte do animal</span>
                                        <div className="flex gap-2">
                                            {(['pequeno', 'medio', 'grande'] as ObjectSize[]).map((size) => {
                                                const active = objectSize === size
                                                const label = size === 'pequeno' ? 'Pequeno' : size === 'medio' ? 'Médio' : 'Grande'
                                                return (
                                                    <button
                                                        key={size}
                                                        onClick={() => setObjectSize(size)}
                                                        className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                                                        style={
                                                            active
                                                                ? { background: GRADIENT, color: '#fff' }
                                                                : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                        }
                                                    >
                                                        {label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>
                                            Foto do animal <span style={{ color: '#ef4444' }}>*</span>
                                        </span>
                                        <PhotoPicker
                                            preview={petPhotoPreview}
                                            onPick={(file) => handlePhotoPick(file, setPetPhotoFile)}
                                            colors={colors}
                                        />
                                    </div>

                                    <div className="mt-3">
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Quem entrega</span>
                                        <div className="flex flex-col gap-2">
                                            <div className="relative">
                                                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="text"
                                                    value={senderName}
                                                    onChange={(e) => setSenderName(e.target.value)}
                                                    placeholder="Nome de quem entrega"
                                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                            </div>
                                            <div className="relative">
                                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="tel"
                                                    value={senderWhatsapp}
                                                    onChange={(e) => setSenderWhatsapp(e.target.value)}
                                                    placeholder="WhatsApp de quem entrega"
                                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Quem recebe</span>
                                        <div className="flex flex-col gap-2">
                                            <div className="relative">
                                                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="text"
                                                    value={recipientName}
                                                    onChange={(e) => setRecipientName(e.target.value)}
                                                    placeholder="Nome de quem recebe"
                                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                            </div>
                                            <div className="relative">
                                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="tel"
                                                    value={recipientWhatsapp}
                                                    onChange={(e) => setRecipientWhatsapp(e.target.value)}
                                                    placeholder="WhatsApp de quem recebe"
                                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        value={objectDescription}
                                        onChange={(e) => setObjectDescription(e.target.value)}
                                        placeholder="O que é o objeto?"
                                        className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />

                                    <button
                                        onClick={() => setObjectIsSensitive((v) => !v)}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl mt-3 transition-all"
                                        style={
                                            objectIsSensitive
                                                ? { background: GRADIENT, color: '#fff' }
                                                : { background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }
                                        }
                                    >
                                        <span className="flex items-center gap-2 text-sm font-bold">
                                            <ScanLine size={16} />
                                            Objeto sensível / frágil
                                        </span>
                                        <span className="text-xs font-black">{objectIsSensitive ? 'SIM' : 'NÃO'}</span>
                                    </button>

                                    <div className="mt-3">
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Tamanho</span>
                                        <div className="flex gap-2">
                                            {(['pequeno', 'medio', 'grande'] as ObjectSize[]).map((size) => {
                                                const active = objectSize === size
                                                const label = size === 'pequeno' ? 'Pequeno' : size === 'medio' ? 'Médio' : 'Grande'
                                                return (
                                                    <button
                                                        key={size}
                                                        onClick={() => setObjectSize(size)}
                                                        className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                                                        style={
                                                            active
                                                                ? { background: GRADIENT, color: '#fff' }
                                                                : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                        }
                                                    >
                                                        {label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>
                                            Foto do objeto <span style={{ color: '#ef4444' }}>*</span>
                                        </span>
                                        <PhotoPicker
                                            preview={objectPhotoPreview}
                                            onPick={(file) => handlePhotoPick(file, setObjectPhotoFile)}
                                            colors={colors}
                                        />
                                    </div>

                                    <div className="mt-3">
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Quem envia</span>
                                        <div className="flex flex-col gap-2">
                                            <div className="relative">
                                                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="text"
                                                    value={senderName}
                                                    onChange={(e) => setSenderName(e.target.value)}
                                                    placeholder="Nome de quem envia"
                                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                            </div>
                                            <div className="relative">
                                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="tel"
                                                    value={senderWhatsapp}
                                                    onChange={(e) => setSenderWhatsapp(e.target.value)}
                                                    placeholder="WhatsApp de quem envia"
                                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Quem recebe</span>
                                        <div className="flex flex-col gap-2">
                                            <div className="relative">
                                                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="text"
                                                    value={recipientName}
                                                    onChange={(e) => setRecipientName(e.target.value)}
                                                    placeholder="Nome de quem recebe"
                                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                            </div>
                                            <div className="relative">
                                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
                                                <input
                                                    type="tel"
                                                    value={recipientWhatsapp}
                                                    onChange={(e) => setRecipientWhatsapp(e.target.value)}
                                                    placeholder="WhatsApp de quem recebe"
                                                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm focus:outline-none"
                                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
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

                            <div className="flex items-center gap-2 mt-4">
                                <button
                                    onClick={() => setStep('type')}
                                    className="py-3.5 px-5 rounded-xl font-black uppercase text-sm tracking-wider transition-all active:scale-95"
                                    style={{ background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={handleRequestConfirm}
                                    disabled={submitting || !origin.address.trim() || !destination.address.trim()}
                                    className="flex-1 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                    style={{ background: GRADIENT, color: '#fff' }}
                                >
                                    {submitting ? <Spinner size={18} /> : <Car size={18} />}
                                    Pedir motorista
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
