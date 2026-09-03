// app/(main)/pedir-motorista/page.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
    ShoppingBag,
    PackagePlus,
    Baby,
    PawPrint,
    Camera,
    ScanLine,
    User,
    History,
} from 'lucide-react'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho
const ROUTE_COLORS = ['#3b82f6', '#a855f7', '#f59e0b']
const AVERAGE_SPEED_KMH = 40

type Step = 'type' | 'where' | 'details'
type RequestFor = 'pessoa' | 'objeto'
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

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 28 ? firstPart.substring(0, 26) + '...' : firstPart
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
    const [routes, setRoutes] = useState<RouteOption[]>([])
    const [selectedRoute, setSelectedRoute] = useState(0)
    const [loadingRoutes, setLoadingRoutes] = useState(false)
    const [notes, setNotes] = useState('')
    const [showNotes, setShowNotes] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [showPlateReminder, setShowPlateReminder] = useState(false)

    // ===== ADICIONAIS: PESSOA (além de quem pediu) =====
    const [extraPeopleCount, setExtraPeopleCount] = useState(0)
    const [hasChild, setHasChild] = useState(false)
    const [hasShopping, setHasShopping] = useState(false)
    const [isGroceryShopping, setIsGroceryShopping] = useState<boolean | null>(null)
    const [bagCount, setBagCount] = useState(1)
    const [hasExtraObject, setHasExtraObject] = useState(false)
    const [extraObjectDescription, setExtraObjectDescription] = useState('')
    const [extraObjectPhotoFile, setExtraObjectPhotoFile] = useState<File | null>(null)
    const [extraObjectPhotoPreview, setExtraObjectPhotoPreview] = useState<string | null>(null)
    const [hasPet, setHasPet] = useState(false)
    const [petDescription, setPetDescription] = useState('')
    const [petPhotoFile, setPetPhotoFile] = useState<File | null>(null)
    const [petPhotoPreview, setPetPhotoPreview] = useState<string | null>(null)

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

    const totalPeople = 1 + extraPeopleCount + (hasChild ? 1 : 0)
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
        if (typeof draft.extraPeopleCount === 'number') setExtraPeopleCount(draft.extraPeopleCount)
        if (typeof draft.hasChild === 'boolean') setHasChild(draft.hasChild)
        if (typeof draft.hasShopping === 'boolean') setHasShopping(draft.hasShopping)
        if (draft.isGroceryShopping !== undefined) setIsGroceryShopping(draft.isGroceryShopping)
        if (typeof draft.bagCount === 'number') setBagCount(draft.bagCount)
        if (typeof draft.hasExtraObject === 'boolean') setHasExtraObject(draft.hasExtraObject)
        if (typeof draft.extraObjectDescription === 'string') setExtraObjectDescription(draft.extraObjectDescription)
        if (typeof draft.hasPet === 'boolean') setHasPet(draft.hasPet)
        if (typeof draft.petDescription === 'string') setPetDescription(draft.petDescription)
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

    // ===== RESUMO EM TEXTO DO QUE ESTÁ SENDO PEDIDO =====
    const orderSummary = (() => {
        if (!requestFor) return ''
        const from = origin.address ? shortAddress(origin.address) : 'um local'
        const to = destination.address ? shortAddress(destination.address) : 'outro local'

        if (requestFor === 'pessoa') {
            const peopleText = totalPeople === 1 ? '1 pessoa' : `${totalPeople} pessoas`
            const extras: string[] = []
            if (hasShopping) {
                extras.push(
                    isGroceryShopping
                        ? `compras de mercado${bagCount ? ` (${bagCount} ${bagCount === 1 ? 'sacola' : 'sacolas'})` : ''}`
                        : 'compras'
                )
            }
            if (hasExtraObject) extras.push(extraObjectDescription ? `o objeto "${extraObjectDescription}"` : 'um objeto')
            if (hasPet) extras.push(petDescription || 'um pet')
            const extrasText = extras.length > 0 ? ` Vai levar também: ${extras.join(', ')}.` : ''
            return `Você está pedindo um motorista para levar ${peopleText} de ${from} para ${to}.${extrasText}`
        }

        const objectText = objectDescription ? `"${objectDescription}"` : 'um objeto'
        const recipientText = recipientName ? ` para entregar a ${recipientName}` : ''
        return `Você está pedindo um motorista para buscar ${objectText} de ${from} e levar até ${to}${recipientText}.`
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
                step, requestFor, origin, destination, notes,
                extraPeopleCount, hasChild, hasShopping, isGroceryShopping, bagCount,
                hasExtraObject, extraObjectDescription,
                hasPet, petDescription,
                objectDescription, objectIsSensitive, objectSize,
                senderName, senderWhatsapp, recipientName, recipientWhatsapp,
                originNeedsAccess, originAccessNotes, destinationNeedsAccess, destinationAccessNotes,
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
            const petPhotoUrl = requestFor === 'pessoa' && hasPet && petPhotoFile ? await uploadRidePhoto(user.id, petPhotoFile) : null

            const { error } = await supabase.from('ride_requests').insert({
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
                has_shopping: requestFor === 'pessoa' ? hasShopping : false,
                is_grocery_shopping: requestFor === 'pessoa' && hasShopping ? isGroceryShopping : null,
                bag_count: requestFor === 'pessoa' && hasShopping && isGroceryShopping ? bagCount : null,
                has_extra_object: requestFor === 'pessoa' ? hasExtraObject : false,
                extra_object_description: requestFor === 'pessoa' && hasExtraObject ? extraObjectDescription.trim() || null : null,
                extra_object_photo_url: extraObjectPhotoUrl,
                has_pet: requestFor === 'pessoa' ? hasPet : false,
                pet_description: requestFor === 'pessoa' && hasPet ? petDescription.trim() || null : null,
                pet_photo_url: petPhotoUrl,
                object_description: requestFor === 'objeto' ? objectDescription.trim() || null : null,
                object_is_sensitive: requestFor === 'objeto' ? objectIsSensitive : false,
                object_size: requestFor === 'objeto' ? objectSize : null,
                object_photo_url: objectPhotoUrl,
                sender_name: requestFor === 'objeto' ? senderName.trim() || null : null,
                sender_whatsapp: requestFor === 'objeto' ? senderWhatsapp.trim() || null : null,
                recipient_name: requestFor === 'objeto' ? recipientName.trim() || null : null,
                recipient_whatsapp: requestFor === 'objeto' ? recipientWhatsapp.trim() || null : null,
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
                        <div className="w-full rounded-xl px-4 py-3 text-left" style={{ background: `${colors.border}30` }}>
                            <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{orderSummary}</p>
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

            {/* Bottom sheet estilo Uber, por etapas */}
            {!activeField && !submitted && (
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

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleSelectType('pessoa')}
                                    className="flex flex-col items-center gap-2 py-7 px-2 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                                >
                                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                        <Users size={26} />
                                    </div>
                                    <span className="text-sm font-black" style={{ color: colors.textPrimary }}>Pessoa</span>
                                    <span className="text-[11px] text-center leading-tight" style={{ color: colors.textSecondary }}>
                                        Te levar, buscar alguém, ou os dois
                                    </span>
                                </button>

                                <button
                                    onClick={() => handleSelectType('objeto')}
                                    className="flex flex-col items-center gap-2 py-7 px-2 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                    style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}
                                >
                                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                                        <Package size={26} />
                                    </div>
                                    <span className="text-sm font-black" style={{ color: colors.textPrimary }}>Objeto</span>
                                    <span className="text-[11px] text-center leading-tight" style={{ color: colors.textSecondary }}>
                                        Buscar ou entregar algo
                                    </span>
                                </button>
                            </div>
                        </>
                    )}

                    {/* ===== ETAPA 2: ENDEREÇOS ===== */}
                    {step === 'where' && (
                        <>
                            <h2 className="text-lg font-black mb-3" style={{ color: colors.textPrimary }}>Para onde ir</h2>

                            {/* Locais de partida já usados */}
                            {recentOrigins.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto pb-2 mb-1">
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
                                        placeholder="Local de chegada"
                                        className="flex-1 bg-transparent text-sm focus:outline-none cursor-pointer"
                                        style={inputStyle}
                                    />
                                </div>
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

                            <button
                                onClick={() => setStep('details')}
                                disabled={!origin.address.trim() || !destination.address.trim()}
                                className="w-full mt-4 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                Continuar
                            </button>
                        </>
                    )}

                    {/* ===== ETAPA 3: DETALHES ===== */}
                    {step === 'details' && requestFor && (
                        <>
                            <h2 className="text-lg font-black mb-3" style={{ color: colors.textPrimary }}>
                                {requestFor === 'pessoa' ? 'Mais alguém vai?' : 'Mais sobre o objeto'}
                            </h2>

                            {requestFor === 'pessoa' ? (
                                <>
                                    {/* Nº de pessoas a mais, além de quem pediu — define o tipo de veículo sugerido */}
                                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                        <div className="flex items-center gap-2">
                                            <Users size={16} style={{ color: colors.textSecondary }} />
                                            <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>Quantas pessoas a mais?</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setExtraPeopleCount((n) => Math.max(0, n - 1))}
                                                disabled={extraPeopleCount <= 0}
                                                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="text-sm font-black w-5 text-center" style={{ color: colors.textPrimary }}>{extraPeopleCount}</span>
                                            <button
                                                onClick={() => setExtraPeopleCount((n) => Math.min(29, n + 1))}
                                                disabled={extraPeopleCount >= 29}
                                                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {totalPeople > 4 && (
                                        <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `${colors.accent}15`, color: colors.accent }}>
                                            <Bus size={14} />
                                            Vai precisar de: {VEHICLE_TYPE_LABELS[vehicleType]}
                                        </div>
                                    )}

                                    {/* Adicionais combináveis */}
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        {[
                                            { active: hasChild, label: 'Vai criança', icon: Baby, toggle: () => setHasChild((v) => !v) },
                                            { active: hasShopping, label: 'Compras', icon: ShoppingBag, toggle: () => setHasShopping((v) => !v) },
                                            { active: hasExtraObject, label: 'Objeto', icon: PackagePlus, toggle: () => setHasExtraObject((v) => !v) },
                                            { active: hasPet, label: 'Pet', icon: PawPrint, toggle: () => setHasPet((v) => !v) },
                                        ].map((chip) => {
                                            const Icon = chip.icon
                                            return (
                                                <button
                                                    key={chip.label}
                                                    onClick={chip.toggle}
                                                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all"
                                                    style={
                                                        chip.active
                                                            ? { background: GRADIENT, color: '#fff' }
                                                            : { background: `${colors.border}30`, color: colors.textSecondary, border: `1px solid ${colors.border}` }
                                                    }
                                                >
                                                    <Icon size={15} />
                                                    {chip.label}
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {hasChild && (
                                        <p className="text-[11px] mt-2 px-1" style={{ color: colors.textSecondary }}>
                                            A criança conta como uma pessoa e ocupa lugar de adulto.
                                        </p>
                                    )}

                                    {/* Compras — mercado? quantas sacolas? */}
                                    {hasShopping && (
                                        <div className="rounded-xl px-3 py-2.5 mt-2" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>É compra de mercado?</span>
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <button
                                                        onClick={() => setIsGroceryShopping(true)}
                                                        className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                                        style={isGroceryShopping === true ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                    >
                                                        SIM
                                                    </button>
                                                    <button
                                                        onClick={() => setIsGroceryShopping(false)}
                                                        className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                                        style={isGroceryShopping === false ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                                    >
                                                        NÃO
                                                    </button>
                                                </div>
                                            </div>
                                            {isGroceryShopping === true && (
                                                <div className="flex items-center justify-between gap-3 mt-2">
                                                    <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>Quantas sacolas?</span>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => setBagCount((n) => Math.max(1, n - 1))}
                                                            disabled={bagCount <= 1}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                                                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                        >
                                                            <Minus size={14} />
                                                        </button>
                                                        <span className="text-sm font-black w-5 text-center" style={{ color: colors.textPrimary }}>{bagCount}</span>
                                                        <button
                                                            onClick={() => setBagCount((n) => Math.min(20, n + 1))}
                                                            disabled={bagCount >= 20}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40"
                                                            style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Objeto extra — qual é e foto */}
                                    {hasExtraObject && (
                                        <div className="rounded-xl px-3 py-2.5 mt-2" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                            <span className="text-xs font-bold block mb-2" style={{ color: colors.textPrimary }}>Qual é o objeto?</span>
                                            <input
                                                type="text"
                                                value={extraObjectDescription}
                                                onChange={(e) => setExtraObjectDescription(e.target.value)}
                                                placeholder="Ex: mochila, caixa, mala..."
                                                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                            />
                                            <div className="mt-2">
                                                <PhotoPicker
                                                    preview={extraObjectPhotoPreview}
                                                    onPick={(file) => handlePhotoPick(file, setExtraObjectPhotoFile)}
                                                    colors={colors}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Pet — qual é e foto */}
                                    {hasPet && (
                                        <div className="rounded-xl px-3 py-2.5 mt-2" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                            <span className="text-xs font-bold block mb-2" style={{ color: colors.textPrimary }}>Qual é o pet?</span>
                                            <input
                                                type="text"
                                                value={petDescription}
                                                onChange={(e) => setPetDescription(e.target.value)}
                                                placeholder="Ex: cachorro pequeno, gato..."
                                                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                            />
                                            <div className="mt-2">
                                                <PhotoPicker
                                                    preview={petPhotoPreview}
                                                    onPick={(file) => handlePhotoPick(file, setPetPhotoFile)}
                                                    colors={colors}
                                                />
                                            </div>
                                        </div>
                                    )}
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
                                        <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>Foto do objeto (opcional)</span>
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

                            <button
                                onClick={() => setShowPlateReminder(true)}
                                disabled={submitting || !origin.address.trim() || !destination.address.trim()}
                                className="w-full mt-4 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Car size={18} />}
                                Pedir motorista
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
