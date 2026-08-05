// app/(main)/[profileSlug]/[storeSlug]/editar-loja/page.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Camera, MapPin, Pencil, Trash2, ArrowLeft, Loader2, CheckCircle2, Store, Sparkles, Zap, Clock, Search, Navigation, X, Home, MoveVertical, Hash, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import AnimatedBackground from '@/components/AnimatedBackground'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const DAYS_OF_WEEK = [
    { key: 'mon', label: 'Segunda' },
    { key: 'tue', label: 'Terça' },
    { key: 'wed', label: 'Quarta' },
    { key: 'thu', label: 'Quinta' },
    { key: 'fri', label: 'Sexta' },
    { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' },
]

// ===== CONFIGURAÇÃO DE HORÁRIOS =====
const WEEKDAYS = [
    { id: '1', name: 'Segunda-feira' },
    { id: '2', name: 'Terça-feira' },
    { id: '3', name: 'Quarta-feira' },
    { id: '4', name: 'Quinta-feira' },
    { id: '5', name: 'Sexta-feira' },
    { id: '6', name: 'Sábado' },
    { id: '0', name: 'Domingo' },
]

const DEFAULT_WEEKLY = {
    '1': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '2': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '3': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '4': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '5': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '6': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
    '0': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
}

// ===== GRADIENTE FIXO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
}

// ---------- Funções de geocodificação ----------
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
            streetDisplay: formatted.split(',')[0].trim(),
            extractedNumber
        }
    } catch {
        const fallback = `Local (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        reverseGeocodeCache.set(key, fallback)
        return { fullAddress: fallback, streetDisplay: fallback, extractedNumber: '' }
    }
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

export default function EditarLoja() {
    const router = useRouter()
    const params = useParams()

    const storeSlugParam = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug

    const fileInputRef = useRef<HTMLInputElement>(null)

    const [storeId, setStoreId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [loadingLocation, setLoadingLocation] = useState(false)
    const [pageLoading, setPageLoading] = useState(true)
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

    const [name, setName] = useState('')
    const [storeSlug, setStoreSlug] = useState('')
    const [description, setDescription] = useState('')
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [address, setAddress] = useState('')
    const [addressNumber, setAddressNumber] = useState('')
    const [addressComplement, setAddressComplement] = useState('')
    const [whatsapp, setWhatsapp] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    const [acceptsDelivery, setAcceptsDelivery] = useState(true)
    const [acceptsPickup, setAcceptsPickup] = useState(true)
    const [acceptsPix, setAcceptsPix] = useState(true)
    const [acceptsCard, setAcceptsCard] = useState(true)
    const [acceptsCash, setAcceptsCash] = useState(true)

    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState<'cpf' | 'email' | 'phone' | 'random'>('cpf')

    const [deliveryMode, setDeliveryMode] = useState<'free' | 'fixed' | 'distance'>('fixed')
    const [fixedDeliveryFee, setFixedDeliveryFee] = useState('')

    const [deliveryBaseDistance, setDeliveryBaseDistance] = useState('5')
    const [deliveryBaseFee, setDeliveryBaseFee] = useState('7')
    const [deliveryExtraPerKm, setDeliveryExtraPerKm] = useState('2')

    // ===== HORÁRIOS DE FUNCIONAMENTO (ESTILO StoreOperatingDays) =====
    const [weekly, setWeekly] = useState<any>(DEFAULT_WEEKLY)
    const [blockedDates, setBlockedDates] = useState<string[]>([])
    const [blockedDateInput, setBlockedDateInput] = useState('')
    const [isHoursExpanded, setIsHoursExpanded] = useState(false)

    // LocationPicker inline states
    const [showMapPicker, setShowMapPicker] = useState(false)
    const [mapSearchQuery, setMapSearchQuery] = useState('')
    const [mapResolving, setMapResolving] = useState(false)
    const [mapError, setMapError] = useState('')
    const [selectedMapPosition, setSelectedMapPosition] = useState<{ lat: number; lng: number } | null>(null)
    const [selectedMapAddress, setSelectedMapAddress] = useState('')
    const [selectedMapNumber, setSelectedMapNumber] = useState('')
    const [selectedMapComplement, setSelectedMapComplement] = useState('')
    const [mapNumberError, setMapNumberError] = useState('')
    const [mapReady, setMapReady] = useState(false)

    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<any>(null)
    const movableMarkerRef = useRef<any>(null)
    const savedMarkerRef = useRef<any>(null)
    const polylineRef = useRef<any>(null)
    const isMovingRef = useRef(false)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const mapInitializedRef = useRef(false)

    // ----- CARREGAMENTO DOS DADOS DA LOJA -----
    useEffect(() => {
        const fetchStoreData = async () => {
            if (!storeSlugParam) return

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data: store, error } = await supabase
                .from('stores')
                .select('*')
                .ilike('storeSlug', storeSlugParam)
                .single()

            if (error || !store) {
                alert('Loja não encontrada.')
                router.push('/')
                return
            }

            if (store.owner_id !== user.id) {
                alert('Você não tem permissão para editar esta loja.')
                router.push('/')
                return
            }

            setStoreId(store.id)
            setName(store.name || '')
            setStoreSlug(store.storeSlug || '')
            setDescription(store.description || '')
            setAddress(store.address || '')
            setAddressNumber(store.address_number || '')
            setAddressComplement(store.address_complement || '')
            setWhatsapp(store.whatsapp || '')

            setAcceptsDelivery(store.accepts_delivery ?? true)
            setAcceptsPickup(store.accepts_pickup ?? true)
            setAcceptsPix(store.accepts_pix ?? true)
            setAcceptsCard(store.accepts_card ?? true)
            setAcceptsCash(store.accepts_cash ?? true)

            setPixKey(store.pix_key || '')
            setPixKeyType(store.pix_key_type || 'cpf')

            if (store.delivery_type === 'fixed') {
                setDeliveryMode('fixed')
                setFixedDeliveryFee(store.delivery_fee ? String(store.delivery_fee) : '')
            } else if (store.delivery_type === 'distance') {
                setDeliveryMode('distance')
                setDeliveryBaseDistance(store.delivery_base_distance != null ? String(store.delivery_base_distance) : '5')
                setDeliveryBaseFee(store.delivery_base_fee != null ? String(store.delivery_base_fee) : '7')
                setDeliveryExtraPerKm(store.delivery_fee_per_km != null ? String(store.delivery_fee_per_km) : '2')
            } else if (store.delivery_type === 'free') {
                setDeliveryMode('free')
            } else {
                setDeliveryMode('fixed')
                setFixedDeliveryFee('')
            }

            // Carregar horários no formato StoreOperatingDays
            if (store.business_hours) {
                const oh = store.business_hours
                setWeekly(oh.weekly ?? DEFAULT_WEEKLY)
                setBlockedDates(oh.blocked_dates ?? [])
            } else {
                setWeekly(DEFAULT_WEEKLY)
                setBlockedDates([])
            }

            if (store.logo_url) {
                const url = supabase.storage.from('store-logos').getPublicUrl(store.logo_url).data.publicUrl
                setPreview(url)
            }

            // Carregar localização
            if (store.store_lat && store.store_lng) {
                setLocation({ lat: store.store_lat, lng: store.store_lng })
            }

            setPageLoading(false)
        }

        fetchStoreData()
    }, [storeSlugParam])

    // ----- VERIFICAÇÃO DE SLUG ÚNICO -----
    useEffect(() => {
        if (!storeSlug || storeSlug === storeSlugParam) {
            setSlugStatus('idle')
            return
        }
        const check = async () => {
            setSlugStatus('checking')
            const { data } = await supabase.from('stores').select('id').eq('storeSlug', storeSlug).neq('id', storeId).limit(1).maybeSingle()
            setSlugStatus(data ? 'taken' : 'available')
        }
        const timer = setTimeout(check, 600)
        return () => clearTimeout(timer)
    }, [storeSlug, storeSlugParam, storeId])

    // ----- PREVIEW DA IMAGEM -----
    useEffect(() => {
        if (!imageFile) return
        const url = URL.createObjectURL(imageFile)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [imageFile])

    // ----- Inicializar mapa quando abrir o picker -----
    useEffect(() => {
        if (!showMapPicker || !mapContainerRef.current || mapInitializedRef.current) return

        mapInitializedRef.current = true

        const initMap = async () => {
            const L = (await import('leaflet')).default
            await import('leaflet/dist/leaflet.css')

            delete (L.Icon.Default.prototype as any)._getIconUrl
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: '',
                iconUrl: '',
                shadowUrl: '',
            })

            const centerLat = selectedMapPosition?.lat || location?.lat || -15.7801
            const centerLng = selectedMapPosition?.lng || location?.lng || -47.9292

            const map = L.map(mapContainerRef.current!, {
                center: [centerLat, centerLng],
                zoom: 16,
                zoomControl: true,
                attributionControl: false,
            })

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
            }).addTo(map)

            // Ícone azul (salvo)
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

            // Ícone laranja (novo)
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

            // Marcador móvel laranja
            const movableMarker = L.marker([centerLat, centerLng], {
                icon: orangeIcon,
                draggable: true,
                zIndexOffset: 1000
            }).addTo(map)

            movableMarker.on('dragend', () => {
                const pos = movableMarker.getLatLng()
                const newPos = { lat: pos.lat, lng: pos.lng }
                setSelectedMapPosition(newPos)
                updateMapPolyline(map, location, newPos)

                setMapResolving(true)
                setMapError('')
                reverseGeocode(newPos.lat, newPos.lng).then(result => {
                    setSelectedMapAddress(result.fullAddress)
                    if (result.extractedNumber && !selectedMapNumber) {
                        setSelectedMapNumber(result.extractedNumber)
                    }
                    setMapResolving(false)
                })
            })

            // Marcador azul (localização atual da loja)
            let savedMarker: any = null
            if (location) {
                savedMarker = L.marker([location.lat, location.lng], {
                    icon: blueIcon,
                    draggable: false,
                    zIndexOffset: 500
                }).addTo(map)
                updateMapPolyline(map, location, { lat: centerLat, lng: centerLng })
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
                setSelectedMapPosition(newPos)
                updateMapPolyline(map, location, newPos)

                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

                setMapResolving(true)
                setMapError('')

                debounceTimerRef.current = setTimeout(async () => {
                    try {
                        const result = await reverseGeocode(newPos.lat, newPos.lng)
                        setSelectedMapAddress(result.fullAddress)
                        if (result.extractedNumber && !selectedMapNumber) {
                            setSelectedMapNumber(result.extractedNumber)
                        }
                    } catch {
                        setSelectedMapAddress(`Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`)
                    } finally {
                        setMapResolving(false)
                    }
                }, 500)
            })

            // Resolver endereço inicial
            setMapResolving(true)
            try {
                const result = await reverseGeocode(centerLat, centerLng)
                setSelectedMapAddress(result.fullAddress)
                if (result.extractedNumber) {
                    setSelectedMapNumber(result.extractedNumber)
                }
            } catch {
                setSelectedMapAddress(`Local (${centerLat.toFixed(4)}, ${centerLng.toFixed(4)})`)
            } finally {
                setMapResolving(false)
            }

            if (location) {
                const bounds = L.latLngBounds(
                    [location.lat, location.lng],
                    [centerLat, centerLng]
                )
                map.fitBounds(bounds, { padding: [50, 50] })
            }

            setMapReady(true)
        }

        initMap()

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
            mapInitializedRef.current = false
            setMapReady(false)
        }
    }, [showMapPicker])

    const updateMapPolyline = (map: any, saved: { lat: number; lng: number } | null, selected: { lat: number; lng: number }) => {
        const L = (window as any).L
        if (!L || !map) return

        if (polylineRef.current) {
            map.removeLayer(polylineRef.current)
            polylineRef.current = null
        }

        if (saved) {
            polylineRef.current = L.polyline(
                [[saved.lat, saved.lng], [selected.lat, selected.lng]],
                { color: '#9CA3AF', weight: 2, dashArray: '8, 8', opacity: 0.6 }
            ).addTo(map)
        }
    }

    const flyMapTo = useCallback((lat: number, lng: number) => {
        if (!mapInstanceRef.current || !movableMarkerRef.current) return
        isMovingRef.current = true
        mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 0.8 })
        movableMarkerRef.current.setLatLng([lat, lng])
        updateMapPolyline(mapInstanceRef.current, location, { lat, lng })
    }, [location])

    const handleMapSearch = async () => {
        if (!mapSearchQuery.trim()) return
        setMapError('')
        const result = await geocodeAddress(mapSearchQuery.trim())
        if (result) {
            setSelectedMapPosition({ lat: result.lat, lng: result.lng })
            setSelectedMapAddress(result.address)
            flyMapTo(result.lat, result.lng)
            setMapSearchQuery('')
        } else {
            setMapError('Endereço não encontrado.')
        }
    }

    const handleMapGPS = () => {
        if (!navigator.geolocation) {
            setMapError('Geolocalização não suportada')
            return
        }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                setSelectedMapPosition(newPos)
                flyMapTo(newPos.lat, newPos.lng)
                setMapResolving(true)
                try {
                    const result = await reverseGeocode(newPos.lat, newPos.lng)
                    setSelectedMapAddress(result.fullAddress)
                    if (result.extractedNumber) setSelectedMapNumber(result.extractedNumber)
                } catch {
                    setSelectedMapAddress(`Local (${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)})`)
                } finally {
                    setMapResolving(false)
                }
            },
            () => setMapError('Erro ao obter localização.'),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }

    const handleMapConfirm = () => {
        if (!selectedMapNumber.trim()) {
            setMapNumberError('O número é obrigatório')
            return
        }
        setMapNumberError('')

        setLocation(selectedMapPosition)
        setAddress(selectedMapAddress)
        setAddressNumber(selectedMapNumber)
        setAddressComplement(selectedMapComplement)
        setShowMapPicker(false)
    }

    const openMapPicker = () => {
        setSelectedMapPosition(location || { lat: -15.7801, lng: -47.9292 })
        setSelectedMapAddress(address || '')
        setSelectedMapNumber(addressNumber || '')
        setSelectedMapComplement(addressComplement || '')
        setMapSearchQuery('')
        setMapError('')
        setMapNumberError('')
        setShowMapPicker(true)
    }

    // ===== FUNÇÕES DE HORÁRIOS =====
    const updateDaySetting = (dayId: string, field: string, value: any) => {
        setWeekly((prev: any) => ({
            ...prev,
            [dayId]: { ...prev[dayId], [field]: value },
        }))
    }

    const addBlockedDate = () => {
        if (!blockedDateInput) return
        if (blockedDates.includes(blockedDateInput)) return
        setBlockedDates((prev) => [...prev, blockedDateInput].sort())
        setBlockedDateInput('')
    }

    const removeBlockedDate = (dateStr: string) => {
        setBlockedDates((prev) => prev.filter((d) => d !== dateStr))
    }

    const openDaysCount = Object.values(weekly).filter((day: any) => day.isOpen).length

    // ===== SALVAR ALTERAÇÕES =====
    const handleUpdate = async () => {
        if (!name || !storeSlug || !storeId) {
            alert('Preencha os campos obrigatórios.')
            return
        }
        if (slugStatus === 'taken') {
            alert('O endereço da loja já está em uso.')
            return
        }

        setLoading(true)

        let logoPath: string | undefined = undefined
        if (imageFile) {
            const fileExt = imageFile.name.split('.').pop()
            const fileName = `${Date.now()}.${fileExt}`
            const { data, error } = await supabase.storage.from('store-logos').upload(fileName, imageFile)
            if (!error && data) logoPath = data.path
        }

        let deliveryType = 'none'
        let savedDeliveryFee: number | null = null
        let savedFeePerKm: number | null = null
        let savedBaseDistance: number | null = null
        let savedBaseFee: number | null = null

        if (acceptsDelivery) {
            if (deliveryMode === 'free') {
                deliveryType = 'free'
                savedDeliveryFee = 0
            } else if (deliveryMode === 'fixed') {
                deliveryType = 'fixed'
                savedDeliveryFee = fixedDeliveryFee ? parseFloat(fixedDeliveryFee) : 0
            } else if (deliveryMode === 'distance') {
                deliveryType = 'distance'
                savedBaseDistance = deliveryBaseDistance ? parseFloat(deliveryBaseDistance) : 0
                savedBaseFee = deliveryBaseFee ? parseFloat(deliveryBaseFee) : 0
                savedFeePerKm = deliveryExtraPerKm ? parseFloat(deliveryExtraPerKm) : 0
            }
        }

        const cleanWhatsapp = whatsapp.replace(/[^\d+]/g, '').trim() || null

        const locationWkt = location
            ? `SRID=4326;POINT(${location.lng} ${location.lat})`
            : null

        // Salvar horários no formato StoreOperatingDays
        const hoursConfig = {
            weekly,
            blocked_dates: blockedDates,
        }

        const updateData: any = {
            name,
            storeSlug,
            description,
            location: locationWkt,
            address,
            address_number: addressNumber || null,
            address_complement: addressComplement || null,
            whatsapp: cleanWhatsapp,
            accepts_delivery: acceptsDelivery,
            accepts_pickup: acceptsPickup,
            accepts_pix: acceptsPix,
            accepts_card: acceptsCard,
            accepts_cash: acceptsCash,
            pix_key: acceptsPix ? pixKey : null,
            pix_key_type: acceptsPix ? pixKeyType : null,
            delivery_type: deliveryType,
            delivery_fee: savedDeliveryFee,
            delivery_fee_per_km: savedFeePerKm,
            delivery_base_distance: savedBaseDistance,
            delivery_base_fee: savedBaseFee,
            business_hours: hoursConfig,
            store_lat: location ? location.lat : null,
            store_lng: location ? location.lng : null,
        }

        if (logoPath) updateData.logo_url = logoPath

        const { error } = await supabase.from('stores').update(updateData).eq('id', storeId)

        if (error) {
            console.error('Erro ao atualizar loja:', error)
            alert('Erro ao atualizar loja: ' + error.message)
            setLoading(false)
            return
        }

        alert('Loja atualizada com sucesso!')
        setLoading(false)
        router.push(`/${profileSlug}/${storeSlug}`)
    }

    const handleDelete = async () => {
        if (!confirm("Tem certeza que deseja deletar permanentemente esta loja?")) return
        setLoading(true)
        const { error } = await supabase.from('stores').delete().eq('id', storeId)
        if (error) {
            alert("Erro ao deletar loja.")
            setLoading(false)
            return
        }
        alert("Loja deletada com sucesso.")
        router.push('/eu')
    }

    if (pageLoading) return <LoadingSpinner />

    const surfaceRgb = hexToRgb('#ffffff')
    const colors = {
        surface: '#ffffff',
        border: '#e5e7eb',
        textPrimary: '#111827',
        textSecondary: '#6b7280',
    }

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />

            <style jsx global>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-15px) rotate(5deg); }
                }
            `}</style>

            <header className="sticky top-0 z-50 px-4 py-3 border-b border-orange-200/30 bg-white/60 backdrop-blur-xl">
                <div className="max-w-lg mx-auto flex items-center gap-3">
                    <button onClick={() => router.back()} className="flex w-10 h-10 items-center justify-center bg-white/80 border-2 border-orange-200 rounded-2xl hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all duration-300 shadow-md">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-lg font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Editar Loja</h1>
                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Painel Administrativo</p>
                    </div>
                </div>
            </header>

            <main className="relative z-10 flex-1 px-4 py-6 flex justify-center">
                <div className="w-full max-w-lg space-y-8">
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                            <Store className="w-3 h-3" /><span>Personalize</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                            <Zap className="w-3 h-3" /><span>Atualize</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-600 bg-yellow-100 px-3 py-1 rounded-full">
                            <Sparkles className="w-3 h-3" /><span>Destaque-se</span>
                        </div>
                    </div>

                    <div className="bg-white/60 backdrop-blur-sm border-2 border-orange-200/50 rounded-3xl p-6 shadow-xl space-y-6">
                        {/* Logo */}
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">Logo da Loja</label>
                            <div onClick={() => fileInputRef.current?.click()} className="relative w-32 h-32 mx-auto rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 group cursor-pointer hover:border-orange-500 transition-all duration-500 shadow-lg">
                                {preview ? <img src={preview} className="w-full h-full object-cover" alt="Logo" /> : <div className="w-full h-full flex items-center justify-center text-orange-300 text-3xl font-black">!</div>}
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && setImageFile(e.target.files[0])} />
                            </div>
                        </div>

                        {/* Nome */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">Nome da Loja</label>
                            <input placeholder="Minha Loja iUser" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                        </div>

                        {/* Slug */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">URL da Loja</label>
                            <div className="flex bg-white rounded-xl border-2 border-orange-200 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 overflow-hidden transition-all">
                                <span className="flex items-center px-3 bg-orange-50 text-orange-400 border-r border-orange-200 text-[10px] font-bold">iuser.com.br/</span>
                                <input placeholder="minha-loja" value={storeSlug} onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="w-full px-4 py-3 bg-transparent text-gray-900 placeholder:text-gray-400 text-sm outline-none" />
                            </div>
                            {slugStatus === 'checking' && <p className="text-[9px] text-gray-400 ml-1 font-bold animate-pulse">Verificando...</p>}
                            {slugStatus === 'available' && <p className="text-[9px] text-green-600 ml-1 font-bold">✓ Disponível!</p>}
                            {slugStatus === 'taken' && <p className="text-[9px] text-red-500 ml-1 font-bold">✗ Já está em uso</p>}
                        </div>

                        {/* Descrição */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">Descrição</label>
                            <textarea placeholder="Conte a história da sua marca..." value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 resize-none" />
                        </div>

                        {/* Localização */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between ml-1">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600">Localização da Sede</label>
                                {location && <span className="text-[8px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">✓ Definida</span>}
                            </div>

                            {location ? (
                                <div className="bg-white rounded-2xl border-2 border-orange-200 p-4 shadow-sm space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                                            <MapPin className="w-5 h-5 text-orange-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] font-black uppercase text-gray-400 mb-1">Endereço Registrado</p>
                                            <p className="text-sm font-bold text-gray-800 leading-tight">{address || 'Localização Definida'}</p>
                                            {addressNumber && (
                                                <p className="text-xs text-gray-500 mt-0.5">Nº {addressNumber}</p>
                                            )}
                                            {addressComplement && (
                                                <p className="text-xs text-gray-500 mt-0.5 italic">"{addressComplement}"</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-2 border-t border-orange-100">
                                        <button onClick={openMapPicker} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-orange-200 rounded-xl text-[10px] font-black uppercase text-orange-600 hover:bg-orange-50 transition-all">
                                            <Pencil className="w-3 h-3" />Alterar no Mapa
                                        </button>
                                        <button onClick={() => { setLocation(null); setAddress(''); setAddressNumber(''); setAddressComplement('') }} className="px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-[10px] font-black uppercase text-red-500 hover:bg-red-500 hover:text-white transition-all">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={openMapPicker} className="w-full p-6 bg-white border-2 border-dashed border-orange-200 hover:border-orange-500 text-gray-500 hover:text-orange-600 rounded-2xl transition-all flex flex-col items-center justify-center gap-3 font-bold text-sm">
                                    <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center">
                                        <MapPin className="w-6 h-6 text-orange-400" />
                                    </div>
                                    Definir Localização no Mapa
                                </button>
                            )}
                        </div>

                        {/* WhatsApp */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">WhatsApp (opcional)</label>
                            <input placeholder="(00) 00000-0000" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            <p className="text-[9px] text-gray-400 ml-1 font-medium">Se vazio, usaremos o WhatsApp do seu perfil.</p>
                        </div>

                        {/* Configurações de Venda */}
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-600 ml-1">Configurações de Venda</label>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">📍 Faz entrega</span>
                                    <button onClick={() => setAcceptsDelivery(!acceptsDelivery)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsDelivery ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsDelivery ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">🏪 Retirada no local</span>
                                    <button onClick={() => setAcceptsPickup(!acceptsPickup)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsPickup ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsPickup ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {acceptsDelivery && (
                                <div className="ml-2 space-y-2">
                                    <p className="text-[10px] font-bold text-gray-500">Tipo de entrega</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setDeliveryMode('free')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${deliveryMode === 'free' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>Grátis</button>
                                        <button onClick={() => setDeliveryMode('fixed')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${deliveryMode === 'fixed' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>Valor Fixo</button>
                                        <button onClick={() => setDeliveryMode('distance')} className={`px-3 py-1.5 rounded-full text-xs font-bold ${deliveryMode === 'distance' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>Por Distância</button>
                                    </div>

                                    {deliveryMode === 'fixed' && (
                                        <input type="number" value={fixedDeliveryFee} onChange={e => setFixedDeliveryFee(e.target.value)} placeholder="Valor da entrega (R$)" className="w-full bg-white border-2 border-orange-200 rounded-xl px-3 py-2 text-sm" />
                                    )}

                                    {deliveryMode === 'distance' && (
                                        <div className="space-y-2 bg-orange-50 p-3 rounded-xl border border-orange-200">
                                            <p className="text-[10px] font-black text-orange-700">🚀 Tarifa com valor base</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold">Distância base (km)</label>
                                                    <input type="number" value={deliveryBaseDistance} onChange={e => setDeliveryBaseDistance(e.target.value)} placeholder="5" className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold">Valor base (R$)</label>
                                                    <input type="number" value={deliveryBaseFee} onChange={e => setDeliveryBaseFee(e.target.value)} placeholder="7" className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold">Valor extra por km (R$)</label>
                                                    <input type="number" value={deliveryExtraPerKm} onChange={e => setDeliveryExtraPerKm(e.target.value)} placeholder="2" className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                                                </div>
                                            </div>
                                            <p className="text-[9px] text-gray-400">Ex: até {deliveryBaseDistance || '5'} km = R$ {deliveryBaseFee || '7'}, acima + R$ {deliveryExtraPerKm || '2'}/km</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-3 mt-2">
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">💳 Cartão</span>
                                    <button onClick={() => setAcceptsCard(!acceptsCard)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsCard ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsCard ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">⚡ PIX</span>
                                    <button onClick={() => setAcceptsPix(!acceptsPix)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsPix ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsPix ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between bg-white border-2 border-orange-200 rounded-xl p-3">
                                    <span className="text-xs font-bold text-gray-700">💵 Dinheiro</span>
                                    <button onClick={() => setAcceptsCash(!acceptsCash)} className={`relative w-11 h-6 rounded-full transition-colors ${acceptsCash ? 'bg-orange-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${acceptsCash ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {acceptsPix && (
                                <div className="ml-2 space-y-2">
                                    <p className="text-[10px] font-bold text-gray-500">Chave Pix</p>
                                    <select value={pixKeyType} onChange={e => setPixKeyType(e.target.value as any)} className="w-full bg-white border-2 border-orange-200 rounded-xl px-3 py-2 text-sm">
                                        <option value="cpf">CPF</option>
                                        <option value="email">E-mail</option>
                                        <option value="phone">Telefone</option>
                                        <option value="random">Chave aleatória</option>
                                    </select>
                                    <input type="text" value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="Digite a chave" className="w-full bg-white border-2 border-orange-200 rounded-xl px-3 py-2 text-sm" />
                                </div>
                            )}
                        </div>

                        {/* ===== HORÁRIOS DE FUNCIONAMENTO (ESTILO StoreOperatingDays) ===== */}
                        <div
                            className="rounded-2xl border-2 border-orange-200 bg-white/30 backdrop-blur-sm p-4 space-y-3"
                            style={{
                                background: `rgba(255,255,255,0.3)`,
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                            }}
                        >
                            {/* Cabeçalho com toggle - PILL */}
                            <button
                                onClick={() => setIsHoursExpanded(!isHoursExpanded)}
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
                                        <Clock size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-gray-900">
                                            Dias de Funcionamento
                                        </h3>
                                        <div className="flex items-center gap-2 text-xs mt-0.5 text-gray-500">
                                            <span>{openDaysCount} dias abertos</span>
                                            <span>•</span>
                                            <span>{blockedDates.length} datas bloqueadas</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isHoursExpanded ? (
                                        <ChevronUp size={22} className="text-gray-400" />
                                    ) : (
                                        <ChevronDown size={22} className="text-gray-400" />
                                    )}
                                </div>
                            </button>

                            {isHoursExpanded && (
                                <>
                                    {/* Dias da semana */}
                                    <div className="space-y-3">
                                        {WEEKDAYS.map((day) => {
                                            const dayConfig = weekly[day.id] || {
                                                isOpen: false,
                                                start: '08:00',
                                                end: '18:00',
                                                lunchStart: '',
                                                lunchEnd: '',
                                            }
                                            const hasLunch = !!(dayConfig.lunchStart && dayConfig.lunchEnd)

                                            return (
                                                <div
                                                    key={day.id}
                                                    className="p-4 rounded-2xl border border-gray-200"
                                                    style={{
                                                        background: `rgba(255,255,255,0.3)`,
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span
                                                            className="font-bold text-sm"
                                                            style={{ color: dayConfig.isOpen ? '#111827' : '#6b7280' }}
                                                        >
                                                            {day.name}
                                                        </span>
                                                        <label className="relative inline-flex cursor-pointer" style={{ width: 40, height: 22 }}>
                                                            <input
                                                                type="checkbox"
                                                                className="sr-only peer"
                                                                checked={dayConfig.isOpen}
                                                                onChange={(e) => updateDaySetting(day.id, 'isOpen', e.target.checked)}
                                                            />
                                                            <span
                                                                className="absolute inset-0 rounded-full transition-colors duration-200"
                                                                style={{ background: dayConfig.isOpen ? '#f97316' : '#e5e7eb' }}
                                                            />
                                                            <span
                                                                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${dayConfig.isOpen ? 'translate-x-[18px]' : 'translate-x-0'
                                                                    }`}
                                                            />
                                                        </label>
                                                    </div>

                                                    {dayConfig.isOpen && (
                                                        <div className="space-y-3">
                                                            <div className="flex gap-3">
                                                                <div className="flex-1">
                                                                    <span className="text-[10px] font-semibold text-gray-500">
                                                                        Entrada
                                                                    </span>
                                                                    <input
                                                                        type="time"
                                                                        value={dayConfig.start}
                                                                        onChange={(e) => updateDaySetting(day.id, 'start', e.target.value)}
                                                                        className="w-full p-2 rounded-full border text-sm bg-white"
                                                                        style={{
                                                                            borderColor: '#e5e7eb',
                                                                            color: '#111827',
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <span className="text-[10px] font-semibold text-gray-500">
                                                                        Saída
                                                                    </span>
                                                                    <input
                                                                        type="time"
                                                                        value={dayConfig.end}
                                                                        onChange={(e) => updateDaySetting(day.id, 'end', e.target.value)}
                                                                        className="w-full p-2 rounded-full border text-sm bg-white"
                                                                        style={{
                                                                            borderColor: '#e5e7eb',
                                                                            color: '#111827',
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Toggle almoço */}
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    id={`lunch-config-${day.id}`}
                                                                    checked={hasLunch}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            updateDaySetting(day.id, 'lunchStart', '12:00')
                                                                            updateDaySetting(day.id, 'lunchEnd', '13:00')
                                                                        } else {
                                                                            updateDaySetting(day.id, 'lunchStart', '')
                                                                            updateDaySetting(day.id, 'lunchEnd', '')
                                                                        }
                                                                    }}
                                                                    className="rounded-full"
                                                                    style={{ accentColor: '#f97316' }}
                                                                />
                                                                <label
                                                                    htmlFor={`lunch-config-${day.id}`}
                                                                    className="text-xs font-semibold cursor-pointer text-gray-500"
                                                                >
                                                                    Intervalo de Almoço
                                                                </label>
                                                            </div>

                                                            {hasLunch && (
                                                                <div className="flex gap-3">
                                                                    <div className="flex-1">
                                                                        <span className="text-[10px] font-semibold text-gray-500">
                                                                            Início Almoço
                                                                        </span>
                                                                        <input
                                                                            type="time"
                                                                            value={dayConfig.lunchStart}
                                                                            onChange={(e) => updateDaySetting(day.id, 'lunchStart', e.target.value)}
                                                                            className="w-full p-2 rounded-full border text-sm bg-white"
                                                                            style={{
                                                                                borderColor: '#e5e7eb',
                                                                                color: '#111827',
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <span className="text-[10px] font-semibold text-gray-500">
                                                                            Fim Almoço
                                                                        </span>
                                                                        <input
                                                                            type="time"
                                                                            value={dayConfig.lunchEnd}
                                                                            onChange={(e) => updateDaySetting(day.id, 'lunchEnd', e.target.value)}
                                                                            className="w-full p-2 rounded-full border text-sm bg-white"
                                                                            style={{
                                                                                borderColor: '#e5e7eb',
                                                                                color: '#111827',
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Datas bloqueadas */}
                                    <div>
                                        <label className="font-bold text-sm block mb-2 text-gray-900">
                                            Datas Fechadas / Bloqueadas
                                        </label>
                                        <div className="flex gap-2 mb-3">
                                            <input
                                                type="date"
                                                value={blockedDateInput}
                                                onChange={(e) => setBlockedDateInput(e.target.value)}
                                                className="flex-1 p-3 rounded-full border text-sm bg-white"
                                                style={{
                                                    borderColor: '#e5e7eb',
                                                    color: '#111827',
                                                }}
                                            />
                                            <button
                                                onClick={addBlockedDate}
                                                style={{
                                                    ...pillButtonStyle,
                                                    background: GRADIENT,
                                                    color: '#ffffff',
                                                }}
                                                className="hover:opacity-80 transition-opacity"
                                            >
                                                Bloquear
                                            </button>
                                        </div>
                                        {blockedDates.length > 0 && (
                                            <div
                                                className="flex flex-wrap gap-2 p-3 rounded-2xl max-h-32 overflow-y-auto border border-gray-200"
                                                style={{
                                                    background: `rgba(255,255,255,0.2)`,
                                                }}
                                            >
                                                {blockedDates.map((d) => {
                                                    const [year, month, day] = d.split('-')
                                                    const formatted = `${day}/${month}/${year}`
                                                    return (
                                                        <span
                                                            key={d}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                                                            style={{
                                                                background: '#ef444420',
                                                                color: '#ef4444',
                                                            }}
                                                        >
                                                            {formatted}
                                                            <button
                                                                onClick={() => removeBlockedDate(d)}
                                                                className="hover:text-red-700 transition-colors"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Botões */}
                        <div className="pt-4 space-y-3">
                            <button onClick={handleUpdate} disabled={loading || slugStatus === 'taken'} className="group relative w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                {loading ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                            <button onClick={handleDelete} disabled={loading} className="w-full bg-red-50 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-wider border-2 border-red-200 hover:border-red-500 transition-all flex items-center justify-center gap-2">
                                <Trash2 className="w-4 h-4" /> Deletar Loja
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* Modal do Mapa */}
            {showMapPicker && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
                    <div className="rounded-2xl p-3 sm:p-4 w-full max-w-lg shadow-2xl max-h-[95vh] overflow-y-auto"
                        style={{
                            background: '#ffffff',
                            border: '2px solid #f97316',
                        }}
                    >
                        <h3 className="text-base sm:text-lg font-extrabold mb-3 tracking-tight flex items-center gap-2 text-gray-900">
                            <MapPin size={20} className="text-orange-500" />
                            Definir Localização da Loja
                        </h3>

                        {/* Busca + GPS */}
                        <div className="flex gap-2 mb-3">
                            <div className="flex-1 flex items-center pl-0 pr-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 border border-orange-200">
                                <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-orange-100">
                                    <Search size={14} className="text-orange-500" />
                                </div>
                                <input
                                    type="text"
                                    value={mapSearchQuery}
                                    onChange={(e) => setMapSearchQuery(e.target.value)}
                                    placeholder="Buscar endereço..."
                                    className="flex-1 bg-transparent outline-none ml-1.5 text-xs text-gray-900"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleMapSearch() }}
                                />
                                {mapSearchQuery && (
                                    <button onClick={handleMapSearch} className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500 text-white">
                                        Ir
                                    </button>
                                )}
                            </div>
                            <button onClick={handleMapGPS} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-600 border border-orange-300 hover:bg-orange-200 transition-all flex-shrink-0">
                                <Navigation size={14} />
                                <span className="hidden sm:inline">GPS</span>
                            </button>
                        </div>

                        {/* Mapa */}
                        <div className="relative w-full h-52 sm:h-60 rounded-xl overflow-hidden mb-3 border-2 border-orange-200 bg-gray-100">
                            <div ref={mapContainerRef} className="w-full h-full" />
                            {!mapReady && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                                    <Loader2 size={24} className="animate-spin text-orange-500" />
                                </div>
                            )}
                        </div>

                        {/* Cards de endereço */}
                        <div className="space-y-2 mb-3">
                            {location && (
                                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
                                    <div className="flex-shrink-0 mt-0.5">
                                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                                            <Home size={14} className="text-blue-500" />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Localização atual</span>
                                        <p className="text-xs font-medium mt-0.5 break-words leading-relaxed text-gray-800">{address || 'Carregando...'}</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-200">
                                <div className="flex-shrink-0 mt-0.5">
                                    <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                                        <MoveVertical size={14} className="text-orange-500" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">Nova localização</span>
                                    {mapResolving ? (
                                        <p className="text-xs mt-0.5 text-gray-400">Obtendo endereço...</p>
                                    ) : (
                                        <p className="text-xs font-medium mt-0.5 break-words leading-relaxed text-gray-800">
                                            {selectedMapAddress || 'Arraste o marcador laranja ou mova o mapa'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Campos de detalhes */}
                        {!mapResolving && selectedMapAddress && (
                            <div className="space-y-2 mb-3">
                                <div className="px-3 py-2 rounded-xl bg-white border" style={{ borderColor: mapNumberError ? '#EF4444' : '#e5e7eb' }}>
                                    <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                                        <Hash size={12} /> Número da casa/apto *
                                    </label>
                                    <input type="text" value={selectedMapNumber} onChange={(e) => { setSelectedMapNumber(e.target.value); setMapNumberError('') }} placeholder="Ex: 2836" className="w-full bg-transparent outline-none text-xs font-medium text-gray-900" />
                                    {mapNumberError && <p className="text-red-500 text-[10px] mt-1">{mapNumberError}</p>}
                                </div>
                                <div className="px-3 py-2 rounded-xl bg-white border border-gray-200">
                                    <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                                        <FileText size={12} /> Complemento (opcional)
                                    </label>
                                    <input type="text" value={selectedMapComplement} onChange={(e) => setSelectedMapComplement(e.target.value)} placeholder="Ex: Casa com parede de cerâmica..." className="w-full bg-transparent outline-none text-xs font-medium text-gray-900" />
                                </div>
                            </div>
                        )}

                        {mapError && <p className="text-red-500 text-xs font-medium mb-2 ml-1">{mapError}</p>}

                        <p className="text-[10px] mb-3 ml-1 text-gray-400">
                            💡 Arraste o marcador laranja ou o mapa para ajustar a localização
                        </p>

                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowMapPicker(false)} className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 transition-all">
                                <div className="h-7 w-7 rounded-full flex items-center justify-center bg-gray-200">
                                    <X size={14} />
                                </div>
                                <span className="ml-1.5">Cancelar</span>
                            </button>
                            <button onClick={handleMapConfirm} className="flex items-center pl-0 pr-3 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-orange-500 to-red-500 text-white hover:opacity-90 transition-all">
                                <div className="h-7 w-7 rounded-full flex items-center justify-center bg-white/20">
                                    <CheckCircle2 size={14} />
                                </div>
                                <span className="ml-1.5">Confirmar Localização</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}