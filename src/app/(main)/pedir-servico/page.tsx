// app/(main)/pedir-servico/page.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '@/lib/supabase/client'
import { useTheme, ThemeColors } from '@/app/theme'
import { toast } from 'sonner'
import { addRecentServiceLocation, getRecentServiceLocations, RecentServiceLocation } from '@/lib/recentServiceLocations'
import { createSquareImage } from '@/lib/image'
import { getAvatarUrl } from '@/lib/avatar'
import { SERVICE_TYPES, ServiceType } from '@/lib/serviceTypes'
import {
    Wrench,
    Briefcase,
    MapPin,
    MapPinPlus,
    Loader2,
    CheckCircle2,
    ArrowLeft,
    Search,
    X,
    Building2,
    Camera,
    History,
    Plus,
    Users,
    ClipboardList,
} from 'lucide-react'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEFAULT_CENTER: [number, number] = [-63.9039, -8.7612] // Porto Velho

type Step = 'type' | 'where' | 'details'
type ActiveField = 'location' | null

interface Place {
    address: string
    coords: [number, number] | null
}

interface ApplicantInfo {
    id: string
    name: string | null
    profileSlug: string | null
    avatarUrl: string | undefined
}

interface PastRequest {
    id: string
    serviceLabel: string
    locationAddress: string
    createdAt: string
    applicants: ApplicantInfo[]
}

const STEPS: Step[] = ['type', 'where', 'details']

const MAX_PHOTOS = 20

interface PhotoItem {
    file: File
    preview: string
}

function shortAddress(address: string): string {
    const firstPart = address.split(',')[0].trim()
    return firstPart.length > 28 ? firstPart.substring(0, 26) + '...' : firstPart
}

function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes} min atrás`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h atrás`
    const days = Math.floor(hours / 24)
    return `${days}d atrás`
}

function PhotoGrid({ photos, onAdd, onRemove, colors }: { photos: PhotoItem[]; onAdd: (files: File[]) => void; onRemove: (index: number) => void; colors: ThemeColors }) {
    const inputRef = useRef<HTMLInputElement>(null)
    return (
        <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
                <div key={i} className="relative w-full aspect-square rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                    <img src={p.preview} className="w-full h-full object-cover" alt="" />
                    <button
                        onClick={() => onRemove(i)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
            {photos.length < MAX_PHOTOS && (
                <button
                    onClick={() => inputRef.current?.click()}
                    className="w-full aspect-square rounded-xl flex items-center justify-center"
                    style={{ background: `${colors.border}30`, border: `1px dashed ${colors.border}` }}
                >
                    {photos.length === 0 ? <Camera size={20} style={{ color: colors.textSecondary }} /> : <Plus size={20} style={{ color: colors.textSecondary }} />}
                </button>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length) onAdd(files)
                    e.target.value = ''
                }}
            />
        </div>
    )
}

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

// ===== RASCUNHO DO PEDIDO (sobrevive ao redirect pro login) =====
const DRAFT_KEY = 'pedir_servico_draft_v1'

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

export default function PedirServicoPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const mapContainerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const locationMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const [mapReady, setMapReady] = useState(false)
    const [step, setStep] = useState<Step>('type')
    const [serviceType, setServiceType] = useState<ServiceType | null>(null)
    const [customService, setCustomService] = useState('')
    const [location, setLocation] = useState<Place>({ address: '', coords: null })
    const [recentLocations, setRecentLocations] = useState<RecentServiceLocation[]>([])
    const [activeField, setActiveField] = useState<ActiveField>(null)
    const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([])
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([])
    const [searching, setSearching] = useState(false)
    const [locating, setLocating] = useState(false)
    const [locationNeedsAccess, setLocationNeedsAccess] = useState(false)
    const [locationAccessNotes, setLocationAccessNotes] = useState('')
    const [description, setDescription] = useState('')
    const [photos, setPhotos] = useState<PhotoItem[]>([])
    const [notes, setNotes] = useState('')
    const [showNotes, setShowNotes] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)

    const [popularCustomServices, setPopularCustomServices] = useState<{ label: string; count: number }[]>([])
    const [pastRequests, setPastRequests] = useState<PastRequest[]>([])
    const [loadingPastRequests, setLoadingPastRequests] = useState(false)

    const stepIndex = STEPS.indexOf(step)
    const selectedType = SERVICE_TYPES.find((t) => t.id === serviceType) || null

    const handleAddPhotos = async (files: File[]) => {
        const room = MAX_PHOTOS - photos.length
        if (room <= 0) {
            toast.error(`Você já adicionou o máximo de ${MAX_PHOTOS} fotos`)
            return
        }
        const accepted = files.slice(0, room)
        if (files.length > room) {
            toast.error(`Só cabem mais ${room} foto${room === 1 ? '' : 's'} (máximo ${MAX_PHOTOS})`)
        }
        try {
            const squareFiles = await Promise.all(accepted.map((f) => createSquareImage(f, 500)))
            const items: PhotoItem[] = squareFiles.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))
            setPhotos((prev) => [...prev, ...items])
        } catch {
            toast.error('Erro ao processar imagem')
        }
    }

    const handleRemovePhoto = (index: number) => {
        setPhotos((prev) => {
            const removed = prev[index]
            if (removed) URL.revokeObjectURL(removed.preview)
            return prev.filter((_, i) => i !== index)
        })
    }

    // ===== LIMPA AS URLS DE PREVIEW AO SAIR DA PÁGINA =====
    useEffect(() => {
        return () => {
            photos.forEach((p) => URL.revokeObjectURL(p.preview))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ===== LOCAIS RECENTES =====
    useEffect(() => {
        setRecentLocations(getRecentServiceLocations())
    }, [])

    // ===== SERVIÇOS CUSTOMIZADOS POPULARES (pedidos por mais de 2 pessoas) =====
    useEffect(() => {
        let cancelled = false
        const loadPopular = async () => {
            const { data } = await supabase
                .from('service_requests')
                .select('custom_service, requester_id')
                .eq('service_type', 'outro')
                .eq('status', 'pending')
                .not('custom_service', 'is', null)
            if (cancelled || !data) return

            const groups = new Map<string, { requesters: Set<string>; counts: Map<string, number> }>()
            for (const row of data as { custom_service: string | null; requester_id: string }[]) {
                const raw = (row.custom_service || '').trim()
                if (!raw) continue
                const key = raw.toLowerCase()
                if (!groups.has(key)) groups.set(key, { requesters: new Set(), counts: new Map() })
                const g = groups.get(key)!
                g.requesters.add(row.requester_id)
                g.counts.set(raw, (g.counts.get(raw) || 0) + 1)
            }

            const popular = Array.from(groups.values())
                .filter((g) => g.requesters.size > 2)
                .map((g) => {
                    let bestLabel = ''
                    let bestCount = 0
                    g.counts.forEach((count, label) => {
                        if (count > bestCount) { bestCount = count; bestLabel = label }
                    })
                    return { label: bestLabel, count: g.requesters.size }
                })

            if (!cancelled) setPopularCustomServices(popular)
        }
        loadPopular()
        return () => { cancelled = true }
    }, [])

    // ===== MEUS PEDIDOS DE SERVIÇO E QUEM SE CANDIDATOU =====
    useEffect(() => {
        let cancelled = false
        const loadPastRequests = async () => {
            setLoadingPastRequests(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                if (!cancelled) setLoadingPastRequests(false)
                return
            }

            const { data: requests } = await supabase
                .from('service_requests')
                .select('id, service_type, custom_service, location_address, created_at')
                .eq('requester_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5)

            if (cancelled) return
            if (!requests || requests.length === 0) {
                setPastRequests([])
                setLoadingPastRequests(false)
                return
            }

            const requestIds = requests.map((r) => r.id)
            const { data: applications } = await supabase
                .from('service_applications')
                .select('service_request_id, applicant_id')
                .in('service_request_id', requestIds)

            const applicantIds = Array.from(new Set((applications || []).map((a) => a.applicant_id)))
            let profilesById = new Map<string, { name: string | null; profileSlug: string | null; avatar_url: string | null }>()
            if (applicantIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, name, profileSlug, avatar_url')
                    .in('id', applicantIds)
                profilesById = new Map((profiles || []).map((p) => [p.id, p]))
            }

            const result: PastRequest[] = requests.map((r) => {
                const serviceLabel = r.service_type === 'outro'
                    ? (r.custom_service || 'Outro')
                    : (SERVICE_TYPES.find((t) => t.id === r.service_type)?.label || r.service_type)
                const applicants: ApplicantInfo[] = (applications || [])
                    .filter((a) => a.service_request_id === r.id)
                    .map((a) => {
                        const p = profilesById.get(a.applicant_id)
                        return {
                            id: a.applicant_id,
                            name: p?.name || null,
                            profileSlug: p?.profileSlug || null,
                            avatarUrl: getAvatarUrl(supabase, p?.avatar_url),
                        }
                    })
                return {
                    id: r.id,
                    serviceLabel,
                    locationAddress: r.location_address,
                    createdAt: r.created_at,
                    applicants,
                }
            })

            if (!cancelled) {
                setPastRequests(result)
                setLoadingPastRequests(false)
            }
        }
        loadPastRequests()
        return () => { cancelled = true }
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

    // ===== LOCALIZAÇÃO ATUAL COMO PADRÃO =====
    const useMyLocation = useCallback(() => {
        if (!navigator.geolocation) return
        setLocating(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude]
                const address = await reverseGeocode(coords[0], coords[1])
                setLocation({ address: address || `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`, coords })
                if (mapRef.current) mapRef.current.flyTo({ center: coords, zoom: 15, duration: 800 })
                setLocating(false)
            },
            () => {
                toast.error('Não conseguimos acessar sua localização', {
                    description: (
                        <span className="inline-flex items-center gap-1 flex-wrap">
                            Clique no ícone
                            <MapPinPlus size={14} className="inline-block flex-shrink-0" />
                            para adicionar sua localização, ou escreva o endereço pra buscar.
                        </span>
                    ),
                    duration: 6000,
                })
                setLocating(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }, [])

    useEffect(() => {
        if (mapReady && !location.address) useMyLocation()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady])

    // ===== TIPO E LOCAL VINDOS DE UM ATALHO (?tipo=, ?local=, ?lat=, ?lng=) =====
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const tipo = params.get('tipo')
        if (SERVICE_TYPES.some((t) => t.id === tipo)) {
            setServiceType(tipo as ServiceType)
            setStep('where')
        }

        const local = params.get('local')
        const lat = params.get('lat')
        const lng = params.get('lng')
        if (local) {
            const coords: [number, number] | null =
                lat && lng ? [parseFloat(lng), parseFloat(lat)] : null
            setLocation({ address: local, coords })
        }
    }, [])

    // ===== RESTAURA O RASCUNHO SE VOLTOU DE UM LOGIN =====
    useEffect(() => {
        const draft = loadDraft()
        if (!draft) return
        clearDraft()

        if (draft.step) setStep(draft.step)
        if (draft.serviceType) setServiceType(draft.serviceType)
        if (typeof draft.customService === 'string') setCustomService(draft.customService)
        if (draft.location) setLocation(draft.location)
        if (typeof draft.locationNeedsAccess === 'boolean') setLocationNeedsAccess(draft.locationNeedsAccess)
        if (typeof draft.locationAccessNotes === 'string') setLocationAccessNotes(draft.locationAccessNotes)
        if (typeof draft.description === 'string') setDescription(draft.description)
        if (typeof draft.notes === 'string') setNotes(draft.notes)

        toast.info('Continuando de onde você parou.')
    }, [])

    // ===== MARCADOR NO MAPA =====
    useEffect(() => {
        if (!mapReady || !mapRef.current) return
        const map = mapRef.current

        if (locationMarkerRef.current) locationMarkerRef.current.remove()
        if (location.coords) {
            const el = document.createElement('div')
            el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
            el.innerHTML = `
                <div style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">Local</div>
                <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="1.5"><path d="M12 22s8-7.58 8-13a8 8 0 1 0-16 0c0 5.42 8 13 8 13z"/></svg>
            `
            locationMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(location.coords).addTo(map)
            map.flyTo({ center: location.coords, zoom: 15, duration: 800 })
        }
    }, [mapReady, location.coords])

    // ===== BUSCA DE ENDEREÇO (autocomplete) =====
    const handleAddressChange = (value: string) => {
        setLocation({ address: value, coords: null })
        setActiveField('location')

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

    const openField = () => {
        setActiveField('location')
        setSuggestions([])
    }

    const selectSuggestion = (suggestion: { place_name: string; center: [number, number] }) => {
        const place = { address: suggestion.place_name, coords: suggestion.center }
        setLocation(place)
        addRecentServiceLocation(place)
        setRecentLocations(getRecentServiceLocations())
        setSuggestions([])
        setActiveField(null)
    }

    const selectRecentLocation = (place: RecentServiceLocation) => {
        setLocation({ address: place.address, coords: place.coords })
        addRecentServiceLocation(place)
        setRecentLocations(getRecentServiceLocations())
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
            selectSuggestion(suggestions[highlightedIndex])
        }
    }

    // ===== NAVEGAÇÃO ENTRE ETAPAS =====
    const handleSelectType = (type: ServiceType) => {
        setServiceType(type)
        if (type !== 'outro') setStep('where')
    }

    const handleBack = () => {
        if (step === 'details') setStep('where')
        else if (step === 'where') setStep('type')
        else router.push('/')
    }

    // ===== RESUMO EM LINHAS (rótulo: valor) DO QUE ESTÁ SENDO PEDIDO =====
    const orderSummaryRows: { label: string; value: string }[] = (() => {
        if (!serviceType) return []
        const rows: { label: string; value: string }[] = []
        const serviceLabel = serviceType === 'outro' ? (customService || 'serviço personalizado') : selectedType?.label || ''
        rows.push({ label: 'Pedido', value: `serviço de ${serviceLabel.toLowerCase()}` })
        rows.push({ label: 'Local', value: location.address ? shortAddress(location.address) : 'um local' })
        if (description) rows.push({ label: 'Descrição', value: description })
        if (notes) rows.push({ label: 'Observação', value: notes })
        return rows
    })()

    const handleRequestConfirm = () => {
        if (!location.address.trim()) {
            toast.error('Preencha o endereço do serviço')
            return
        }
        if (!description.trim()) {
            toast.error('Descreva o que você precisa')
            return
        }
        if (photos.length === 0) {
            toast.error('Adicione ao menos uma foto do local ou problema para continuar')
            return
        }
        setShowConfirmDialog(true)
    }

    const handleSubmit = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            saveDraft({
                step, serviceType, customService, location,
                locationNeedsAccess, locationAccessNotes,
                description, notes,
            })
            router.push(`/login?redirect=${encodeURIComponent('/pedir-servico')}`)
            return
        }
        if (!location.address.trim() || !description.trim() || photos.length === 0) {
            toast.error('Preencha os dados obrigatórios')
            return
        }

        setSubmitting(true)
        try {
            const photoUrls: string[] = []
            for (const photo of photos) {
                const fileExt = photo.file.name.split('.').pop()
                const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`
                const { data, error: uploadError } = await supabase.storage
                    .from('service-request-photos')
                    .upload(fileName, photo.file)
                if (uploadError) throw uploadError
                if (data) {
                    photoUrls.push(supabase.storage.from('service-request-photos').getPublicUrl(data.path).data.publicUrl)
                }
            }

            const { error } = await supabase.from('service_requests').insert({
                requester_id: user.id,
                service_type: serviceType,
                custom_service: serviceType === 'outro' ? customService.trim() || null : null,
                location_address: location.address.trim(),
                location_needs_access: locationNeedsAccess,
                location_access_notes: locationNeedsAccess ? locationAccessNotes.trim() || null : null,
                description: description.trim(),
                photo_urls: photoUrls,
                notes: notes.trim() || null,
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

            {/* Overlay de busca em tela cheia */}
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
                                value={location.address}
                                onChange={(e) => handleAddressChange(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                placeholder="Onde é o serviço?"
                                className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm focus:outline-none"
                                style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />
                            {location.address && (
                                <button
                                    onClick={() => handleAddressChange('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                                    style={{ color: colors.textSecondary }}
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={() => { useMyLocation(); setActiveField(null); setSuggestions([]) }}
                        className="w-full flex items-center gap-3 px-4 py-3.5"
                        style={{ borderBottom: `1px solid ${colors.border}` }}
                    >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.accent}20`, color: colors.accent }}>
                            {locating ? <Loader2 size={16} className="animate-spin" /> : <MapPinPlus size={16} />}
                        </div>
                        <span className="text-sm font-bold" style={{ color: colors.accent }}>Usar minha localização atual</span>
                    </button>

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
                                    onClick={() => selectSuggestion(s)}
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

            {/* Dialog de confirmação */}
            {showConfirmDialog && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div
                        className="w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
                        style={{ background: colors.surface, boxShadow: colors.shadow }}
                    >
                        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                            <Wrench size={32} />
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
                            Confirme os dados antes de continuar.
                        </p>
                        <button
                            onClick={() => { setShowConfirmDialog(false); handleSubmit() }}
                            disabled={submitting}
                            className="mt-2 w-full py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: GRADIENT, color: '#fff' }}
                        >
                            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Wrench size={18} />}
                            Entendi, confirmar pedido
                        </button>
                        <button
                            onClick={() => setShowConfirmDialog(false)}
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
                            Assim que tivermos profissionais parceiros disponíveis na sua região, vamos avisar você.
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

                    {/* ===== ETAPA 1: TIPO DE SERVIÇO ===== */}
                    {step === 'type' && (
                        <>
                            {/* Pedidos de serviços feitos por mim + candidatos */}
                            {!loadingPastRequests && pastRequests.length > 0 && (
                                <div className="mb-5">
                                    <h3 className="text-sm font-black mb-2 flex items-center gap-1.5" style={{ color: colors.textPrimary }}>
                                        <ClipboardList size={15} />
                                        Pedidos de serviços feitos...
                                    </h3>
                                    <div className="flex flex-col gap-2">
                                        {pastRequests.map((r) => (
                                            <div key={r.id} className="rounded-xl px-3 py-2.5" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{r.serviceLabel}</span>
                                                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>{relativeTime(r.createdAt)}</span>
                                                </div>
                                                <span className="text-[11px]" style={{ color: colors.textSecondary }}>{shortAddress(r.locationAddress)}</span>
                                                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                                    {r.applicants.length === 0 ? (
                                                        <span className="text-[11px]" style={{ color: colors.textSecondary }}>Nenhuma candidatura ainda</span>
                                                    ) : (
                                                        r.applicants.map((a) => (
                                                            <span
                                                                key={a.id}
                                                                className="flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full text-[10px] font-bold"
                                                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                                            >
                                                                {a.avatarUrl ? (
                                                                    <img src={a.avatarUrl} className="w-4 h-4 rounded-full object-cover" alt="" />
                                                                ) : (
                                                                    <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: GRADIENT }}>
                                                                        <Users size={9} color="#fff" />
                                                                    </span>
                                                                )}
                                                                {a.name || (a.profileSlug ? `@${a.profileSlug}` : 'Candidato')}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <h2 className="text-lg font-black mb-1" style={{ color: colors.textPrimary }}>Qual serviço você precisa?</h2>
                            <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>Escolha uma opção pra começar</p>

                            <div className="grid grid-cols-3 gap-2">
                                {SERVICE_TYPES.map((type) => {
                                    const Icon = type.icon
                                    const active = serviceType === type.id
                                    return (
                                        <button
                                            key={type.id}
                                            onClick={() => handleSelectType(type.id)}
                                            className="flex flex-col items-center gap-1.5 py-4 px-1 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                            style={
                                                active
                                                    ? { background: GRADIENT, color: '#fff' }
                                                    : { background: `${colors.border}30`, border: `1px solid ${colors.border}` }
                                            }
                                        >
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                                style={active ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: GRADIENT, color: '#fff' }}
                                            >
                                                <Icon size={20} />
                                            </div>
                                            <span className="text-[11px] font-bold text-center leading-tight" style={{ color: active ? '#fff' : colors.textPrimary }}>
                                                {type.label}
                                            </span>
                                        </button>
                                    )
                                })}

                                {popularCustomServices.map((service) => {
                                    const active = serviceType === 'outro' && customService === service.label
                                    return (
                                        <button
                                            key={service.label}
                                            onClick={() => { setServiceType('outro'); setCustomService(service.label); setStep('where') }}
                                            className="flex flex-col items-center gap-1.5 py-4 px-1 rounded-2xl transition-all hover:scale-[1.03] active:scale-95"
                                            style={
                                                active
                                                    ? { background: GRADIENT, color: '#fff' }
                                                    : { background: `${colors.border}30`, border: `1px solid ${colors.border}` }
                                            }
                                        >
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center"
                                                style={active ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: GRADIENT, color: '#fff' }}
                                            >
                                                <Briefcase size={20} />
                                            </div>
                                            <span className="text-[11px] font-bold text-center leading-tight capitalize" style={{ color: active ? '#fff' : colors.textPrimary }}>
                                                {service.label}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {serviceType === 'outro' && (
                                <div className="mt-4">
                                    <input
                                        type="text"
                                        value={customService}
                                        onChange={(e) => setCustomService(e.target.value)}
                                        autoFocus
                                        placeholder="Qual serviço você precisa?"
                                        className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                                        style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />
                                    <button
                                        onClick={() => setStep('where')}
                                        disabled={!customService.trim()}
                                        className="w-full mt-3 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                        style={{ background: GRADIENT, color: '#fff' }}
                                    >
                                        Continuar
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* ===== ETAPA 2: ONDE ===== */}
                    {step === 'where' && (
                        <>
                            <h2 className="text-lg font-black mb-3" style={{ color: colors.textPrimary }}>Onde é o serviço?</h2>

                            {/* Locais já usados */}
                            {recentLocations.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto pb-2 mb-1">
                                    {recentLocations.map((place) => (
                                        <button
                                            key={place.address}
                                            onClick={() => selectRecentLocation(place)}
                                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                                            style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                                        >
                                            <History size={12} style={{ color: '#ef4444' }} />
                                            {shortAddress(place.address)}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="rounded-2xl overflow-hidden relative" style={{ border: `1px solid ${colors.border}` }}>
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <MapPin size={14} className="flex-shrink-0" style={{ color: '#ef4444' }} />
                                    <input
                                        readOnly
                                        onClick={openField}
                                        value={locating ? 'Localizando...' : location.address}
                                        placeholder="Endereço do serviço"
                                        className="flex-1 bg-transparent text-sm focus:outline-none cursor-pointer"
                                        style={inputStyle}
                                    />
                                    <button onClick={useMyLocation} className="flex-shrink-0" style={{ color: colors.accent }}>
                                        {locating ? <Loader2 size={16} className="animate-spin" /> : <MapPinPlus size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Condomínio fechado — precisa de nº/apto/quadra pra achar? */}
                            <div className="rounded-xl px-3 py-2.5 mt-3" style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}` }}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: colors.textPrimary }}>
                                        <Building2 size={13} style={{ color: '#ef4444' }} />
                                        É um condomínio fechado?
                                    </span>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => setLocationNeedsAccess(true)}
                                            className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                            style={locationNeedsAccess ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            SIM
                                        </button>
                                        <button
                                            onClick={() => { setLocationNeedsAccess(false); setLocationAccessNotes('') }}
                                            className="px-3 py-1 rounded-full text-[11px] font-black transition-all"
                                            style={!locationNeedsAccess ? { background: GRADIENT, color: '#fff' } : { background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                                        >
                                            NÃO
                                        </button>
                                    </div>
                                </div>
                                {locationNeedsAccess && (
                                    <input
                                        type="text"
                                        value={locationAccessNotes}
                                        onChange={(e) => setLocationAccessNotes(e.target.value)}
                                        autoFocus
                                        placeholder="Número da rua, apartamento ou quadra..."
                                        className="w-full mt-2 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                    />
                                )}
                            </div>

                            <button
                                onClick={() => setStep('details')}
                                disabled={!location.address.trim()}
                                className="w-full mt-4 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                Continuar
                            </button>
                        </>
                    )}

                    {/* ===== ETAPA 3: DETALHES ===== */}
                    {step === 'details' && (
                        <>
                            <h2 className="text-lg font-black mb-3" style={{ color: colors.textPrimary }}>Mais detalhes</h2>

                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Descreva o que você precisa"
                                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
                                style={{ background: `${colors.border}30`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                            />

                            <div className="mt-3">
                                <span className="text-xs font-bold block mb-1.5" style={{ color: colors.textSecondary }}>
                                    Fotos do local ou problema <span style={{ color: '#ef4444' }}>*</span>
                                    <span className="font-normal" style={{ color: colors.textSecondary }}> ({photos.length}/{MAX_PHOTOS})</span>
                                </span>
                                <PhotoGrid photos={photos} onAdd={handleAddPhotos} onRemove={handleRemovePhoto} colors={colors} />
                            </div>

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
                                onClick={handleRequestConfirm}
                                disabled={submitting || !location.address.trim()}
                                className="w-full mt-4 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Wrench size={18} />}
                                Pedir serviço
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
